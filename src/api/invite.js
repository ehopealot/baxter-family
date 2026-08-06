/* GET /api/invite?code=XXXX
   Tells join.html whether a code is usable, and for a personal invite which
   address it was minted for so the form can lock the email field to it.

   This is a convenience for the page, not the security boundary — anyone can
   POST straight at /api/join. That handler re-checks the code itself and is
   the thing that actually decides. */
import { checkInvite } from "../lib.js";

export async function onRequestGet(ctx) {
	const code = new URL(ctx.request.url).searchParams.get("code");
	const result = await checkInvite(ctx.env.DB, code);

	const body = result.ok
		? { ok: true, kind: result.invite.kind, email: result.invite.email || null, label: result.invite.label || null }
		: { ok: false, reason: result.reason, message: result.message };

	return Response.json(body, {
		status: result.ok ? 200 : 404,
		// An invite's state changes when it is used or revoked; never let a
		// CDN or browser hand back a stale "still valid".
		headers: { "cache-control": "no-store" },
	});
}
