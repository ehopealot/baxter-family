#!/usr/bin/env node
/**
 * Send a template to a real inbox, which is the only test that counts.
 *
 *   node emails/send.mjs welcome --to you@gmail.com
 *   node emails/send.mjs invite  --to you@gmail.com --var name=Erik
 *   node emails/send.mjs welcome --to you@gmail.com --from "Baxter <hello@bax.bot>"
 *
 * Needs RESEND_API_KEY, in the environment or in .dev.vars beside the Turnstile
 * secret. Without a verified domain, Resend will only send from its own
 * onboarding address and only to the address you signed up with — which is
 * exactly enough to test with, so that's the default.
 *
 * Zero dependencies on purpose: this repo has no package.json and no build
 * step, and Resend's API is one POST. Repointing at Postmark, SES or anything
 * else is a change to `deliver()` and nothing else.
 */

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SAMPLE, fill, overrides } from "./sample.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");

const arg = (name, fallback) => {
	const i = process.argv.indexOf(`--${name}`);
	return i === -1 ? fallback : process.argv[i + 1];
};

/* .dev.vars is KEY=value lines, same file wrangler dev reads. */
function devVar(key) {
	const path = join(ROOT, ".dev.vars");
	if (!existsSync(path)) return undefined;
	for (const line of readFileSync(path, "utf8").split("\n")) {
		const [k, ...rest] = line.split("=");
		if (k.trim() === key) return rest.join("=").trim();
	}
}

async function deliver({ from, to, subject, html, text, key }) {
	const res = await fetch("https://api.resend.com/emails", {
		method: "POST",
		headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
		// Both parts, always. A text/plain alternative is what non-HTML clients
		// show, and its absence is one of the signals that reads as bulk mail.
		body: JSON.stringify({ from, to: [to], subject, html, text }),
	});
	const body = await res.json().catch(() => ({}));
	if (!res.ok) throw new Error(body.message || `${res.status} ${res.statusText}`);
	return body.id;
}

const which = process.argv[2];
const to = arg("to");

if (!which || !to || which.startsWith("--")) {
	console.error("Usage: node emails/send.mjs <invite|welcome> --to you@example.com");
	process.exit(1);
}

const htmlPath = join(HERE, `${which}.html`);
const textPath = join(HERE, `${which}.txt`);
if (!existsSync(htmlPath)) {
	console.error(`  no template called ${which} — expected ${which}.html and ${which}.txt`);
	process.exit(1);
}

const key = process.env.RESEND_API_KEY || devVar("RESEND_API_KEY");
if (!key) {
	console.error("  RESEND_API_KEY isn't set. Put it in the environment or in .dev.vars:");
	console.error("    RESEND_API_KEY=re_...");
	process.exit(1);
}

const values = { ...SAMPLE, ...overrides(process.argv) };
const missing = new Set();

const html = (() => {
	const { out, missing: gaps } = fill(readFileSync(htmlPath, "utf8"), values);
	gaps.forEach((k) => missing.add(k));
	return out;
})();

// The subject lives on the first line of the .txt file, so the templates stay
// the single source of truth for their own wording.
const raw = fill(readFileSync(textPath, "utf8"), values);
raw.missing.forEach((k) => missing.add(k));
const match = raw.out.match(/^Subject:\s*(.+)$/m);
if (!match) {
	console.error(`  ${which}.txt has no "Subject:" line to send under`);
	process.exit(1);
}
const subject = match[1].trim();
const text = raw.out.slice(raw.out.indexOf(match[0]) + match[0].length).replace(/^\n+/, "");

if (missing.size) {
	console.error(`  unfilled tokens: ${[...missing].join(", ")} — pass --var key=value`);
	process.exit(1);
}
// A {{token}} inside an href sends someone to a broken link, which is worse
// than a visible gap in the copy, so it's checked separately.
for (const [, href] of html.matchAll(/href="([^"]*)"/g)) {
	if (href.includes("{{")) {
		console.error(`  unfilled token in a link: ${href}`);
		process.exit(1);
	}
}

const from = arg("from", "Baxter <onboarding@resend.dev>");

try {
	const id = await deliver({ from, to, subject, html, text, key });
	console.error(`  sent ${which} to ${to}`);
	console.error(`  from:    ${from}`);
	console.error(`  subject: ${subject}`);
	console.error(`  id:      ${id}`);
} catch (err) {
	console.error(`  send failed: ${err.message}`);
	process.exit(1);
}
