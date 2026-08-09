#!/usr/bin/env node
/**
 * Invite codes for the signup form. Thin wrapper over `wrangler d1 execute`, so
 * there's no second source of truth — the database is the only one.
 *
 *   node tools/invite.mjs new --email sam@example.com [--days 14]
 *   node tools/invite.mjs new --open --label "Tilden QR card" --uses 50
 *   node tools/invite.mjs list [--all]
 *   node tools/invite.mjs revoke BAX-7K3M
 *
 * --local runs against the local dev database instead of production.
 *
 * A personal invite names an address: the form fills the email field in and
 * locks it, and /api/join overrides whatever is submitted with the invite's
 * address, so the link can't be passed on to sign someone else up. An open
 * invite names nobody — anyone holding the code can use it, up to --uses.
 *
 * Full runbook, including reading the signups: ../OPERATIONS.md
 */

import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";

const DB = "baxter-family";

// Crockford-ish: no I, L, O or U, so nothing is ambiguous read off a card or
// dictated over the phone, and it can't accidentally spell anything.
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

// Four characters, so 32^4 = ~1.05M codes: short enough to read off a card and
// dictate over the phone, and small enough that the space is guessable. What
// keeps it honest is that a code only opens a signup form, is use-limited, and
// can be revoked the moment a run of bad guesses shows up. Rate-limit
// /api/invite before handing many of these out. 256 % 32 == 0, so taking the
// byte modulo the alphabet introduces no bias.
function code() {
	const bytes = randomBytes(4);
	let out = "";
	for (let i = 0; i < 4; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
	return `BAX-${out}`; // BAX-7K3M
}

function arg(name, fallback) {
	const i = process.argv.indexOf(`--${name}`);
	return i === -1 ? fallback : process.argv[i + 1];
}
const flag = (name) => process.argv.includes(`--${name}`);

// stdout is captured rather than inherited so a command can decide whether
// wrangler's own output is worth showing: `list` is nothing but that table,
// `new` prints its own summary instead of wrangler's INSERT chatter.
function sql(query, { json = false } = {}) {
	const args = ["d1", "execute", DB, flag("local") ? "--local" : "--remote"];
	if (json) args.push("--json");
	args.push("--command", query);
	try {
		return execFileSync("npx", ["wrangler", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
	} catch {
		process.exit(1);
	}
}

const esc = (v) => (v === null || v === undefined ? "NULL" : `'${String(v).replace(/'/g, "''")}'`);

function make() {
	const open = flag("open");
	const email = arg("email");
	if (!open && !email) {
		console.error("Give --email <address> for a personal invite, or --open for a shareable code.");
		process.exit(1);
	}
	const days = arg("days");
	const uses = arg("uses", open ? null : "1");

	// Four characters is a small enough space that a collision is worth handling
	// rather than hoping about. OR IGNORE turns the primary-key clash into an
	// empty RETURNING instead of an error, so we can just draw again.
	let c = null;
	for (let attempt = 0; attempt < 8 && !c; attempt++) {
		const candidate = code();
		const out = sql(
			`INSERT OR IGNORE INTO invites (code, kind, email, label, max_uses, used_count, expires_at, revoked, created_at)
			 VALUES (${esc(candidate)}, ${open ? "'open'" : "'personal'"}, ${esc(open ? null : email)}, ${esc(arg("label", null))},
			         ${uses ? Number(uses) : "NULL"}, 0,
			         ${days ? Math.floor(Date.now() / 1000) + Number(days) * 86400 : "NULL"}, 0,
			         ${Math.floor(Date.now() / 1000)})
			 RETURNING code`,
			{ json: true },
		);
		try {
			if (JSON.parse(out)?.[0]?.results?.length) c = candidate;
		} catch {
			console.error("  couldn't read wrangler's response; check `list` before minting again");
			process.exit(1);
		}
	}
	if (!c) {
		console.error("  couldn't find a free code in 8 tries, which shouldn't happen — check `list --all`");
		process.exit(1);
	}
	// The summary is for you and goes to stderr; the link is the output and goes
	// to stdout on its own, so `… | pbcopy` and `… | qrencode` get the URL and
	// nothing else.
	console.error(`\n  code:  ${c}`);
	console.error(`  kind:  ${open ? "open" : `personal (${email})`}`);
	console.error(`  uses:  ${uses || "unlimited"}`);
	if (days) console.error(`  until: ${new Date(Date.now() + Number(days) * 86400000).toISOString().slice(0, 10)}`);
	console.error("");
	console.log(`https://bax.bot/?code=${c}`);
}

/* wrangler prints a pretty table only to a terminal; piped, it emits JSON. This
   is piped, so the table is ours to draw. */
function table(rows, columns) {
	if (!rows.length) return "  nothing to show\n";
	const width = (c) => Math.max(c.length, ...rows.map((r) => String(r[c] ?? "").length));
	const widths = Object.fromEntries(columns.map((c) => [c, width(c)]));
	const line = (cells) => "  " + columns.map((c) => String(cells[c] ?? "").padEnd(widths[c])).join("  ").trimEnd() + "\n";
	const rule = "  " + columns.map((c) => "─".repeat(widths[c])).join("  ") + "\n";
	return "\n" + line(Object.fromEntries(columns.map((c) => [c, c.toUpperCase()]))) + rule + rows.map(line).join("") + "\n";
}

const COMMANDS = {
	new: make,
	list: () => {
		// Live by default: what's left to hand out. --all includes the spent,
		// expired and revoked, which is what you want when a code someone is
		// holding stops working and you need to know why.
		const out = sql(
			`SELECT code, kind, COALESCE(email, label, '') AS who,
			        used_count || '/' || COALESCE(max_uses, '∞') AS used,
			        COALESCE(datetime(expires_at,'unixepoch'), 'never') AS expires,
			        CASE WHEN revoked THEN 'revoked'
			             WHEN expires_at IS NOT NULL AND expires_at < unixepoch() THEN 'expired'
			             WHEN max_uses IS NOT NULL AND used_count >= max_uses THEN 'spent'
			             ELSE 'live' END AS status
			 FROM invites ${flag("all") ? "" : "WHERE revoked = 0 AND (expires_at IS NULL OR expires_at >= unixepoch()) AND (max_uses IS NULL OR used_count < max_uses)"}
			 ORDER BY created_at DESC LIMIT 50`,
			{ json: true },
		);
		let rows = [];
		try {
			rows = JSON.parse(out)?.[0]?.results ?? [];
		} catch {
			return out; // fall back to whatever wrangler said
		}
		return table(rows, ["code", "kind", "who", "used", "expires", "status"]);
	},
	revoke: () => {
		const c = process.argv[3];
		if (!c || c.startsWith("--")) {
			console.error("Usage: node tools/invite.mjs revoke <CODE>");
			process.exit(1);
		}
		// RETURNING tells us whether a row was actually hit. Without it a typo
		// reports "revoked" just as cheerfully as a real code does, which is the
		// one thing you don't want a revoke command to do.
		const code = c.toUpperCase();
		const out = sql(`UPDATE invites SET revoked = 1 WHERE code = ${esc(code)} RETURNING code`, { json: true });
		let hit = 0;
		try {
			hit = JSON.parse(out)?.[0]?.results?.length || 0;
		} catch {
			console.error("  couldn't read wrangler's response; check `list` to see if it went through");
			process.exit(1);
		}
		if (!hit) {
			console.error(`  no invite with code ${code} — nothing revoked`);
			process.exit(1);
		}
		console.error(`  revoked ${code}`);
	},
};

const run = COMMANDS[process.argv[2]];
if (!run) {
	console.error("Usage: node tools/invite.mjs <new|list|revoke> [--local]");
	process.exit(1);
}
// `list` returns wrangler's table; the others print their own summary and
// return nothing.
const output = run();
if (typeof output === "string") process.stdout.write(output);
