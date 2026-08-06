/* Invite gate for join.html.
 *
 * Reads ?code= (or ?key=), asks /api/invite whether it's usable, and only then
 * reveals the form. A personal invite comes back with the address it was minted
 * for, which gets filled in and locked — the server overrides that field on
 * submit anyway, so letting someone edit it would only mislead them.
 *
 * This is a gate, not the security boundary. Anyone can POST straight at
 * /api/join, which re-checks the code from scratch and is what actually
 * decides. Nothing here is trusted.
 *
 * This replaced a scheme that verified a signed token in the browser. Codes in
 * a database beat signatures here: they can be revoked, counted, and given a
 * use limit, and they're short enough to put on a QR card.
 */
(function () {
	"use strict";

	var form = document.getElementById("join-form");
	var gate = document.getElementById("gate");
	var gateMsg = document.getElementById("gate-msg");
	var codeField = document.getElementById("invite-code");
	var emailField = document.getElementById("email");
	var emailHint = document.getElementById("email-hint");
	if (!form || !gate || !gateMsg) return;

	function refuse(message) {
		gateMsg.textContent = message;
		gate.hidden = false;
		form.hidden = true;
	}

	function admit(invite, code) {
		codeField.value = code;
		if (invite.email) {
			emailField.value = invite.email;
			emailField.readOnly = true;
			emailField.classList.add("is-locked");
			// readonly still submits; disabled would drop the field entirely.
			if (emailHint) emailHint.textContent = "Your invite is for this address, so Baxter will write to you here.";
		}
		gate.hidden = true;
		form.hidden = false;
	}

	var params = new URLSearchParams(location.search);
	var code = params.get("code") || params.get("key");

	if (!code) {
		refuse("This page needs an invite link. Check the email we sent you, or join the waiting list and we'll send one.");
		return;
	}

	fetch("/api/invite?code=" + encodeURIComponent(code), { headers: { accept: "application/json" } })
		.then(function (r) {
			return r.json().catch(function () {
				throw new Error("bad json");
			});
		})
		.then(function (data) {
			if (data && data.ok) admit(data, code.trim().toUpperCase());
			else refuse((data && data.message) || "We can't use that invite. Ask us for a fresh one and we'll send it over.");
		})
		.catch(function () {
			refuse("We couldn't check your invite just now. Try again in a moment, or reply to our email and we'll sort it out.");
		});
})();
