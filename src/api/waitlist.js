/* POST /api/waitlist — the "request an invite" form on the homepage.
   Collects a name and an email, nothing more. Signing up here is explicitly
   not a messaging opt-in; that happens on join.html against an unticked box. */
import { turnstileOk, seeOther, page, clientMeta, now } from "../lib.js";

export async function onRequestPost(ctx) {
	const { request, env } = ctx;
	const { ip, ua } = clientMeta(request);

	let form;
	try {
		form = await request.formData();
	} catch {
		return page({ status: 400, title: "Something went wrong", heading: "That didn't send.", body: "We couldn't read the form. Try again, and if it keeps happening email privacy@bax.bot." });
	}

	// Bots fill the hidden field; people never see it.
	if (form.get("_honeypot")) return seeOther("/thanks");

	const name = (form.get("name") || "").toString().trim();
	const email = (form.get("email") || "").toString().trim();
	if (!name || !email || !email.includes("@")) {
		return page({ status: 400, title: "Something went wrong", heading: "We need a name and an email.", body: "Both fields are required so we know who to write to. Head back and try again." });
	}

	const ts = await turnstileOk(env, form.get("cf-turnstile-response"), ip);
	if (!ts.ok) {
		return page({ status: 400, title: "Something went wrong", heading: "We couldn't tell you're human.", body: "The check on the form didn't pass. Reload the page and try once more." });
	}

	await env.DB.prepare(
		"INSERT INTO waitlist (created_at, name, email, ip, user_agent) VALUES (?, ?, ?, ?, ?)",
	)
		.bind(now(), name, email, ip, ua)
		.run();

	return seeOther("/thanks");
}

// A GET here means someone followed the action URL directly.
export const onRequestGet = () => seeOther("/#signup");
