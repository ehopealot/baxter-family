#!/usr/bin/env node
/**
 * Invite codes for join.html. Thin wrapper over `wrangler d1 execute`, so
 * there's no second source of truth — the database is the only one.
 *
 *   node tools/invite.mjs new --email sam@example.com [--days 14]
 *   node tools/invite.mjs new --open --label "Tilden QR card" --uses 50
 *   node tools/invite.mjs list [--all]
 *   node tools/invite.mjs revoke BAX-7K3M-QP2R
 *
 * --local runs against the local dev database instead of production.
 *
 * A personal invite names an address: join.html fills the email field in and
 * locks it, and /api/join overrides whatever is submitted with the invite's
 * address, so the link can't be passed on to sign someone else up. An open
 * invite names nobody — anyone holding the code can use it, up to --uses.
 */

import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";

const DB = "baxter-family";

// Crockford-ish: no I, L, O or U, so nothing is ambiguous read off a card or
// dictated over the phone, and it can't accidentally spell anything.
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function code() {
	const bytes = randomBytes(8);
	let out = "";
	for (let i = 0; i < 8; i++) {
		if (i === 4) out += "-";
		out += ALPHABET[bytes[i] % ALPHABET.length];
	}
	return `BAX-${out}`; // BAX-7K3M-QP2R
}

function arg(name, fallback) {
	const i = process.argv.indexOf(`--${name}`);
	return i === -1 ? fallback : process.argv[i + 1];
}
const flag = (name) => process.argv.includes(`--${name}`);

function sql(query) {
	const args = ["d1", "execute", DB, flag("local") ? "--local" : "--remote", "--command", query];
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
	const c = code();
	sql(
		`INSERT INTO invites (code, kind, email, label, max_uses, used_count, expires_at, revoked, created_at)
		 VALUES (${esc(c)}, ${open ? "'open'" : "'personal'"}, ${esc(open ? null : email)}, ${esc(arg("label", null))},
		         ${uses ? Number(uses) : "NULL"}, 0,
		         ${days ? Math.floor(Date.now() / 1000) + Number(days) * 86400 : "NULL"}, 0,
		         ${Math.floor(Date.now() / 1000)})`,
	);
	console.log(`\n  https://family.bax.bot/join?code=${c}\n`);
	console.error(`  code:  ${c}`);
	console.error(`  kind:  ${open ? "open" : `personal (${email})`}`);
	console.error(`  uses:  ${uses || "unlimited"}`);
	if (days) console.error(`  until: ${new Date(Date.now() + Number(days) * 86400000).toISOString().slice(0, 10)}`);
}

const COMMANDS = {
	new: make,
	list: () =>
		sql(
			`SELECT code, kind, COALESCE(email, label, '') AS who, used_count, COALESCE(max_uses, 0) AS max_uses,
			        COALESCE(datetime(expires_at,'unixepoch'), 'never') AS expires, revoked
			 FROM invites ${flag("all") ? "" : "WHERE revoked = 0 AND (max_uses IS NULL OR used_count < max_uses)"}
			 ORDER BY created_at DESC LIMIT 50`,
		),
	revoke: () => {
		const c = process.argv[3];
		if (!c || c.startsWith("--")) {
			console.error("Usage: node tools/invite.mjs revoke <CODE>");
			process.exit(1);
		}
		sql(`UPDATE invites SET revoked = 1 WHERE code = ${esc(c.toUpperCase())}`);
		console.error(`  revoked ${c.toUpperCase()}`);
	},
};

const run = COMMANDS[process.argv[2]];
if (!run) {
	console.error("Usage: node tools/invite.mjs <new|list|revoke> [--local]");
	process.exit(1);
}
run();
