/* POST /api/join — the invite-gated signup on the homepage.

   This handler is the security boundary, not signup.js. The page checks the code
   to decide what to show; anyone can skip the page and POST here directly, so
   everything is re-checked from scratch below. */
import { turnstileOk, checkInvite, seeOther, page, clientMeta, now, slugify, normalizePhone, HOUSEHOLD_RE } from "../lib.js";
import { profane } from "../profanity.js";
import { notifySignup } from "../notify.js";

// The effective date on terms.html. Bump both together when the terms change,
// so a stored row says which version was agreed to.
const TERMS_VERSION = "2026-08-15";

const oops = (heading, body, status = 400) =>
	page({ status, title: "Something went wrong", heading, body });

export async function onRequestPost(ctx) {
	const { request, env } = ctx;
	const { ip, ua } = clientMeta(request);

	let form;
	try {
		form = await request.formData();
	} catch {
		return oops("That didn't send.", "We couldn't read the form. Try again, and if it keeps happening email privacy@bax.bot.");
	}

	if (form.get("_honeypot")) return seeOther("/welcome");

	const name = (form.get("name") || "").toString().trim();
	const nickname = (form.get("nickname") || "").toString().trim();
	const householdRaw = (form.get("household") || "").toString().trim();
	const household = slugify(householdRaw);
	const phone = (form.get("phone") || "").toString().trim();
	const terms = form.get("terms") ? 1 : 0;
	const code = (form.get("invite_code") || "").toString().trim().toUpperCase();
	let email = (form.get("email") || "").toString().trim();

	const ts = await turnstileOk(env, form.get("cf-turnstile-response"), ip);
	if (!ts.ok) {
		return oops("We couldn't tell you're human.", "The check on the form didn't pass. Reload the page and try once more.");
	}

	const invite = await checkInvite(env.DB, code);
	if (!invite.ok) return oops("We can't use that invite.", invite.message);

	// A personal invite decides its own address. Taking the submitted value
	// would let anyone holding the link sign up as somebody else.
	if (invite.invite.kind === "personal" && invite.invite.email) {
		email = invite.invite.email;
	}

	// A `required` attribute is a hint to the browser, nothing more — this
	// endpoint is public and takes any POST. Agreement is the one thing that
	// must be true, so it's checked here rather than trusted from the page.
	if (!terms) {
		return oops("The terms weren't agreed to.", "Signing up means confirming you're 18 or older and agreeing to the Terms & Conditions. Head back and tick that box.");
	}

	if (!name || !nickname || !household || !phone || !email || !email.includes("@")) {
		return oops("Some details are missing.", "We need a name, a nickname, a household name, a mobile number and an email address. Head back and fill those in.");
	}

	// Canonical E.164 or nothing: provisioning dials the stored value with no
	// second chance to clean it up. Bare numbers read as US; + overrides.
	const phoneE164 = normalizePhone(phone);
	if (!phoneE164) {
		return oops("That number doesn't look right.", "Enter the mobile number we can text you on — for example 415 555 0100, or +44 7400 900123 from outside the US.");
	}
	// A result check, not an input check: slugify above did the tidying, so
	// this only fires when the slug comes out one character or over 31 —
	// empty input is caught by the missing-fields check above.
	if (!HOUSEHOLD_RE.test(household)) {
		return oops("That household name won't work.", "It becomes an email address, so pick something 2–31 characters after tidying.");
	}

	// Taste gate, deliberately unexplained: no field named, no reason given,
	// the signup just doesn't happen. Runs before the invite claim, so a
	// rejected attempt burns no invite use. Household is checked both as
	// typed and as slugified — defense-in-depth over the persistent address.
	if (profane(name) || profane(nickname) || profane(householdRaw) || profane(household)) {
		return oops("That didn't work.", "We couldn't accept those details. Try different wording and submit again.");
	}

	// Claim the use first, with the limit in the WHERE clause so two posts
	// racing on a single-use code can't both win. Doing this after the insert
	// would be worse: D1 commits a batch as one transaction, so a failed claim
	// would leave a signup already written while we showed an error for it.
	// Claiming first means the bad case is a burnt use and no signup, which is
	// visible in the table and fixable by hand.
	const claim = await env.DB.prepare(
		`UPDATE invites SET used_count = used_count + 1
		 WHERE code = ? AND revoked = 0 AND (max_uses IS NULL OR used_count < max_uses)`,
	)
		.bind(code)
		.run();

	if (!claim.meta.changes) {
		return oops("That invite has just been used.", "It looks like it was claimed a moment ago. Ask us for another and we'll get you set up.");
	}

	try {
		await env.DB.prepare(
			`INSERT INTO signups (created_at, name, nickname, household, email, phone, terms_agreed, terms_version, invite_code, ip, user_agent)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		)
			.bind(now(), name, nickname, household, email, phoneE164, terms, TERMS_VERSION, code, ip, ua)
			.run();
	} catch (err) {
		// household has a UNIQUE index, so a clash lands here rather than in a
		// check-then-insert race. Hand the use back before bowing out.
		await env.DB.prepare("UPDATE invites SET used_count = used_count - 1 WHERE code = ?").bind(code).run();
		if (String(err).includes("UNIQUE")) {
			return oops("That household name is taken.", "Pick another and Baxter will use that one as your address instead.");
		}
		throw err;
	}

	ctx.waitUntil(notifySignup(env, { type: "join", name, nickname, household, email, phone: phoneE164 }));

	return seeOther("/welcome");
}

export const onRequestGet = () => seeOther("/#signup");
