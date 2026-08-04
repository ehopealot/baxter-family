#!/usr/bin/env node
/**
 * Invite keys for join.html.
 *
 * ECDSA P-256, not HMAC, and that choice is the whole point. The verifying key
 * ships inside join.js where anyone can read it, so a shared secret would let a
 * reader mint their own valid invites — and the signature echoed back with the
 * submission would be forgeable too, which is exactly the evidence we wanted it
 * to be. With a keypair, the public half is safe to publish and only this
 * script's private half can produce a token that verifies.
 *
 * Client-side verification is a gate, not a guarantee: anyone can POST straight
 * to the form endpoint. The value is that a submission carrying a token which
 * verifies against the public key could only have come from an invite we minted.
 * A submission with no token, or a bad one, is one you know to distrust.
 *
 * Token layout — b64url(payload JSON) "." b64url(raw 64-byte r||s signature),
 * signed over the ASCII bytes of the first part. Same shape as a JWS with the
 * header dropped, so verifying it later from any language is unremarkable.
 *
 *   node tools/invite.mjs keygen
 *   node tools/invite.mjs sign  --email sam@example.com [--days 14]
 *   node tools/invite.mjs verify <token>
 *
 * keygen prints the private JWK (keep it; it never goes in the repo) and the
 * public JWK (paste into join.js). Everything else reads the private key from
 * $BAXTER_INVITE_KEY or ./invite-key.json, neither of which is committed.
 */

import { webcrypto as crypto } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";

const ALG = { name: "ECDSA", namedCurve: "P-256" };
const SIG = { name: "ECDSA", hash: "SHA-256" };

const b64u = (bytes) =>
	Buffer.from(bytes).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64u = (s) => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");

function arg(name, fallback) {
	const i = process.argv.indexOf(`--${name}`);
	return i === -1 ? fallback : process.argv[i + 1];
}

function loadPrivateJwk() {
	const inline = process.env.BAXTER_INVITE_KEY;
	if (inline) return JSON.parse(inline);
	if (existsSync("invite-key.json")) return JSON.parse(readFileSync("invite-key.json", "utf8"));
	console.error(
		"No private key. Run `node tools/invite.mjs keygen`, save the private JWK to\n" +
			"invite-key.json (gitignored) or export it as $BAXTER_INVITE_KEY.",
	);
	process.exit(1);
}

async function keygen() {
	const { privateKey, publicKey } = await crypto.subtle.generateKey(ALG, true, ["sign", "verify"]);
	const priv = await crypto.subtle.exportKey("jwk", privateKey);
	const pub = await crypto.subtle.exportKey("jwk", publicKey);
	console.log("PRIVATE JWK — save as invite-key.json, never commit it:\n");
	console.log(JSON.stringify(priv));
	console.log("\nPUBLIC JWK — paste into INVITE_PUBLIC_JWK in join.js:\n");
	console.log(JSON.stringify({ kty: pub.kty, crv: pub.crv, x: pub.x, y: pub.y }));
}

async function sign() {
	const email = arg("email");
	if (!email) {
		console.error("Usage: node tools/invite.mjs sign --email <address> [--days 14]");
		process.exit(1);
	}
	const days = Number(arg("days", "14"));
	const payload = {
		email,
		exp: Math.floor(Date.now() / 1000) + days * 86400,
		jti: b64u(crypto.getRandomValues(new Uint8Array(9))),
	};
	const key = await crypto.subtle.importKey("jwk", loadPrivateJwk(), ALG, false, ["sign"]);
	const body = b64u(Buffer.from(JSON.stringify(payload), "utf8"));
	const sig = await crypto.subtle.sign(SIG, key, Buffer.from(body, "ascii"));
	const token = `${body}.${b64u(new Uint8Array(sig))}`;
	console.log(`https://family.bax.bot/join.html?key=${token}`);
	console.error(`\n  invited: ${email}\n  expires: ${new Date(payload.exp * 1000).toISOString()}\n  jti:     ${payload.jti}`);
}

async function verify() {
	const token = process.argv[3];
	if (!token) {
		console.error("Usage: node tools/invite.mjs verify <token>");
		process.exit(1);
	}
	const priv = loadPrivateJwk();
	const pub = await crypto.subtle.importKey(
		"jwk",
		{ kty: priv.kty, crv: priv.crv, x: priv.x, y: priv.y },
		ALG,
		false,
		["verify"],
	);
	const [body, sig] = token.split(".");
	if (!body || !sig) {
		console.log("INVALID — malformed token");
		process.exit(1);
	}
	const ok = await crypto.subtle.verify(SIG, pub, unb64u(sig), Buffer.from(body, "ascii"));
	if (!ok) {
		console.log("INVALID — signature does not verify; this was not minted by us");
		process.exit(1);
	}
	const payload = JSON.parse(unb64u(body).toString("utf8"));
	const expired = payload.exp * 1000 < Date.now();
	console.log(expired ? "VALID SIGNATURE, BUT EXPIRED" : "VALID");
	console.log(JSON.stringify({ ...payload, expires: new Date(payload.exp * 1000).toISOString() }, null, 2));
}

const cmd = process.argv[2];
const run = { keygen, sign, verify }[cmd];
if (!run) {
	console.error("Usage: node tools/invite.mjs <keygen|sign|verify>");
	process.exit(1);
}
await run();
