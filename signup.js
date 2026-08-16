/* Progressive signup on the homepage.
 *
 * One section, two destinations. A code field sits on top; below it the
 * waiting list, which is what everybody gets by default. Enter a code that
 * checks out and the waiting list is replaced by the real signup form, already
 * carrying the code. Enter one that doesn't and you keep the waiting list plus
 * a reason.
 *
 * This is a gate, not the security boundary. Anyone can POST straight at
 * /api/join, which re-checks the code, the Turnstile token and the terms box
 * from scratch. Nothing decided here is trusted.
 *
 * Without JS none of this appears and the waiting list posts as it always did,
 * which is the right failure: a code needs a round trip to mean anything.
 */
(function () {
	"use strict";

	// Show the top invite-code banner whenever a code arrived in the URL (a bax.bot/PNW1 redirect,
	// or a pasted invite link). Done first, before the form-element guard below, so the nudge shows
	// even if the signup form isn't on this page. Not validated here -- the form re-checks the code.
	var urlCode = new URLSearchParams(location.search);
	var banner = document.getElementById("code-banner");
	if (banner && (urlCode.get("code") || urlCode.get("key"))) banner.hidden = false;

	var codeForm = document.getElementById("code-form");
	var codeInput = document.getElementById("invite-code");
	var checkBtn = document.getElementById("code-check");
	var msg = document.getElementById("code-msg");
	var waitlist = document.getElementById("waitlist-block");
	var joinBlock = document.getElementById("join-block");
	var hiddenCode = document.getElementById("join-invite-code");
	var emailField = document.getElementById("join-email");
	var emailHint = document.getElementById("join-email-hint");
	var nameField = document.getElementById("join-name");
	var heading = document.getElementById("signup-h");
	var lede = document.getElementById("signup-lede");
	var box = document.getElementById("join-turnstile");
	if (!codeForm || !codeInput || !joinBlock || !waitlist) return;

	// Kept so a failed check can put the section back the way it was.
	var askHeading = heading.textContent;
	var askLede = lede.innerHTML;

	// The widget is rendered on reveal rather than at load: Turnstile does not
	// render reliably into a display:none container, and a token minted on page
	// load can expire before a code is ever typed.
	function mountTurnstile() {
		if (!box || box.dataset.rendered) return;
		if (!window.turnstile) return void setTimeout(mountTurnstile, 150);
		box.dataset.rendered = "1";
		// interaction-only: the widget stays invisible while Turnstile runs its
		// non-interactive checks, and only appears if a visitor actually needs to
		// complete a challenge.
		window.turnstile.render(box, {
			sitekey: box.dataset.sitekey,
			theme: "light",
			appearance: "interaction-only",
		});
	}

	function busy(on) {
		checkBtn.disabled = on;
		checkBtn.textContent = on ? "Checking" : "Claim invite";
	}

	function refuse(message) {
		msg.textContent = message;
		msg.hidden = false;
		joinBlock.hidden = true;
		waitlist.hidden = false;
		heading.textContent = askHeading;
		lede.innerHTML = askLede;
	}

	function admit(invite, code, byHand) {
		hiddenCode.value = code;

		// A personal invite names its address, and /api/join overrides whatever
		// is submitted with it. Letting someone edit the field would only
		// mislead them about which address the account ends up on.
		if (invite.email) {
			emailField.value = invite.email;
			emailField.readOnly = true; // readonly still submits; disabled would drop it
			emailField.classList.add("is-locked");
			emailHint.textContent = "Your invite is for this address, so Baxter will write to you here.";
		}

		msg.hidden = true;
		waitlist.hidden = true;
		joinBlock.hidden = false;
		codeForm.hidden = true; // the code is accepted; leaving the field invites re-entry
		heading.textContent = "Let's meet Baxter.";
		lede.textContent =
			"Your code checks out. Pick a name for your household and tell us where Baxter " +
			"should write to you, and the mobile number Baxter will text.";

		mountTurnstile();
		// Only chase focus when someone actually pressed the button. Doing it for
		// a code that arrived in the URL would yank a new visitor past the hero.
		if (byHand) nameField.focus();
	}

	// The field holds only the four characters after BAX-, so anything pasted in
	// has to be reduced to those: a whole code, a whole invite URL, or a code
	// typed with the prefix all end up the same. I and L become 1 and O becomes
	// 0, which is the point of choosing an alphabet without them — somebody
	// reading a code off a card can't get that wrong.
	var ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
	function tidy(value) {
		var s = (value || "").toUpperCase();
		var url = s.match(/CODE=([A-Z0-9-]+)/); // a pasted invite link
		if (url) s = url[1];
		s = s.replace(/^BAX-/, "");
		var out = "";
		for (var i = 0; i < s.length && out.length < 4; i++) {
			var c = s.charAt(i);
			if (c === "I" || c === "L") c = "1";
			else if (c === "O") c = "0";
			if (ALPHABET.indexOf(c) !== -1) out += c;
		}
		return out;
	}

	function check(raw, byHand) {
		var tail = tidy(raw);
		var code = tail && "BAX-" + tail;
		if (!code) return refuse("Enter the code from your card or email, or join the waiting list below.");

		busy(true);
		fetch("/api/invite?code=" + encodeURIComponent(code), { headers: { accept: "application/json" } })
			.then(function (r) { return r.json(); })
			.then(function (data) {
				if (data && data.ok) admit(data, code, byHand);
				else refuse((data && data.message) || "We don't recognise that code. Check it and try again, or join the waiting list below.");
			})
			.catch(function () {
				refuse("We couldn't check that code just now. Try again in a moment, or join the waiting list below.");
			})
			.finally(function () { busy(false); });
	}

	codeForm.hidden = false;

	// Normalising on input rather than on submit means the field always shows
	// exactly what will be sent. No maxlength: the browser would truncate a
	// pasted "BAX-7K3M" to "BAX-" before this ever sees it.
	codeInput.addEventListener("input", function () {
		var tidied = tidy(codeInput.value);
		if (codeInput.value !== tidied) codeInput.value = tidied;
	});

	codeForm.addEventListener("submit", function (e) {
		e.preventDefault();
		check(codeInput.value, true);
	});

	// An invite link lands on this page with ?code= on it, so the code is taken from
	// the URL when there is one. No scrolling: they arrived at the top of a page
	// that still has a job to do.
	var params = new URLSearchParams(location.search);
	var fromUrl = params.get("code") || params.get("key");
	if (fromUrl) {
		codeInput.value = tidy(fromUrl);
		check(fromUrl, false);
	}
})();
