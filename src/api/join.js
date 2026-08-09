/* POST /api/join — the invite-gated signup on the homepage.

   This handler is the security boundary, not signup.js. The page checks the code
   to decide what to show; anyone can skip the page and POST here directly, so
   everything is re-checked from scratch below. */
import { turnstileOk, checkInvite, seeOther, page, clientMeta, now } from "../lib.js";

// The effective date on terms.html. Bump both together when the terms change,
// so a stored row says which version was agreed to.
const TERMS_VERSION = "2026-08-06";

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
	const household = (form.get("household") || "").toString().trim().toLowerCase();
	const phone = (form.get("phone") || "").toString().trim();
	const consent = form.get("consent") ? 1 : 0;
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

	if (!name || !household || !email || !email.includes("@")) {
		return oops("Some details are missing.", "We need a name, a household name and an email address. Head back and fill those in.");
	}
	if (!/^[a-z0-9][a-z0-9-]{1,30}$/.test(household)) {
		return oops("That household name won't work.", "It becomes an email address, so it needs to be 2–31 characters: lowercase letters, numbers and hyphens, starting with a letter or number.");
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
			`INSERT INTO signups (created_at, name, household, email, phone, consent, terms_agreed, terms_version, invite_code, ip, user_agent)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		)
			.bind(now(), name, household, email, phone || null, consent, terms, TERMS_VERSION, code, ip, ua)
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

	return seeOther("/welcome");
}

export const onRequestGet = () => seeOther("/#signup");
