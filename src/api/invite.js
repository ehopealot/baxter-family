/* GET /api/invite?code=XXXX
   Tells the signup form whether a code is usable, and for a personal invite
   which address it was minted for so the form can lock the email field to it.

   This is a convenience for the page, not the security boundary — anyone can
   POST straight at /api/join. That handler re-checks the code itself, verifies
   Turnstile, and is the thing that actually decides.

   It is, however, an oracle: hand it a guess and it says yes or no, for free
   and without a challenge. Codes are four characters, so the space is about
   1.05M and the answer is worth throttling. The rate limiter below is what
   stops a script walking it; /api/join's Turnstile is what stops a guessed
   code turning into an account. Both matter, and neither replaces the other. */
import { checkInvite } from "../lib.js";

const json = (body, status, extra) =>
	Response.json(body, {
		status,
		// An invite's state changes when it is used or revoked; never let a
		// CDN or browser hand back a stale "still valid".
		headers: { "cache-control": "no-store", ...extra },
	});

export async function onRequestGet(ctx) {
	const { request, env } = ctx;

	// Keyed on the caller's IP. Per-colo rather than global, so this raises the
	// cost of a scan rather than making one impossible — a distributed attempt
	// still gets a share per location. It is the cheap 90%.
	const ip = request.headers.get("CF-Connecting-IP") || "unknown";
	const { success } = await env.INVITE_CHECK.limit({ key: ip });
	if (!success) {
		return json(
			{ ok: false, reason: "rate", message: "That's a lot of tries. Wait a minute and have another go, or join the waiting list below." },
			429,
			{ "retry-after": "60" },
		);
	}

	const code = new URL(request.url).searchParams.get("code");
	const result = await checkInvite(env.DB, code);

	return json(
		result.ok
			? { ok: true, kind: result.invite.kind, email: result.invite.email || null, label: result.invite.label || null }
			: { ok: false, reason: result.reason, message: result.message },
		result.ok ? 200 : 404,
	);
}
