/* Invite gate for join.html.
 *
 * Reads ?key=<token>, verifies it against the public key below, and only then
 * reveals the form. The raw token rides along in a hidden field so a submission
 * carries proof of the invite that produced it.
 *
 * This is a gate, not a guarantee. Anyone can POST straight at the form endpoint
 * and skip this file entirely — which is precisely why the token is echoed back.
 * Verify it on the submissions afterwards (`node tools/invite.mjs verify <token>`)
 * and a forged or absent one gives the game away. The signing key is ECDSA, so
 * publishing the verifying half here costs nothing.
 */
(function () {
	"use strict";

	// Public half of the invite keypair. Replace with the PUBLIC JWK printed by
	// `node tools/invite.mjs keygen`. Safe to publish; the private half signs.
	var INVITE_PUBLIC_JWK = {
		kty: "EC",
		crv: "P-256",
		x: "REPLACE_ME",
		y: "REPLACE_ME",
	};

	var form = document.getElementById("join-form");
	var gate = document.getElementById("gate");
	var gateMsg = document.getElementById("gate-msg");
	var keyField = document.getElementById("invite-key");
	var emailField = document.getElementById("email");

	function refuse(message) {
		gateMsg.textContent = message;
		gate.hidden = false;
		form.hidden = true;
	}

	function admit(payload, token) {
		keyField.value = token;
		// The invite names an address; start them there rather than making them
		// retype it, but leave it editable in case they'd rather use another.
		if (payload.email && !emailField.value) emailField.value = payload.email;
		gate.hidden = true;
		form.hidden = false;
	}

	function unb64u(s) {
		s = s.replace(/-/g, "+").replace(/_/g, "/");
		while (s.length % 4) s += "=";
		var bin = atob(s);
		var out = new Uint8Array(bin.length);
		for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
		return out;
	}

	var token = new URLSearchParams(location.search).get("key");

	if (!token) {
		refuse("This page needs an invite link. Check the email we sent you, or join the waiting list and we'll send one.");
		return;
	}

	// Verification needs Web Crypto, which needs a secure context. Fail closed:
	// an unverified visitor is exactly who this page is meant to turn away.
	if (!window.crypto || !window.crypto.subtle) {
		refuse("This browser can't check your invite link. Try a current browser over https, or reply to our email and we'll set you up by hand.");
		return;
	}

	var parts = token.split(".");
	if (parts.length !== 2) {
		refuse("That invite link looks damaged. Some mail apps split long links across lines — try copying the whole thing, or ask us for a fresh one.");
		return;
	}

	var body = parts[0];
	var payload;
	try {
		payload = JSON.parse(new TextDecoder().decode(unb64u(body)));
	} catch (e) {
		refuse("That invite link looks damaged. Ask us for a fresh one and we'll send it straight over.");
		return;
	}

	crypto.subtle
		.importKey("jwk", INVITE_PUBLIC_JWK, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"])
		.then(function (key) {
			var sig = unb64u(parts[1]);
			var signed = new TextEncoder().encode(body);
			return crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, sig, signed);
		})
		.then(function (ok) {
			if (!ok) {
				refuse("We can't verify that invite link. It may have been edited in transit. Ask us for a fresh one.");
				return;
			}
			// Expiry is checked after the signature, never before: an unsigned
			// payload's own claim about its expiry isn't worth reading.
			if (payload.exp && payload.exp * 1000 < Date.now()) {
				refuse("That invite has expired. Reply to our email and we'll send you a new link.");
				return;
			}
			admit(payload, token);
		})
		.catch(function () {
			refuse("Something went wrong checking your invite. Reply to our email and we'll sort it out.");
		});
})();
