/* Worker entry.
 *
 * The site is static assets; this only exists for the two forms and the invite
 * check. `run_worker_first` in wrangler.jsonc is set to /api/* , so every other
 * request is served straight off the edge and never reaches this code. The
 * ASSETS fallback below is for the case where that config ever changes, and for
 * `wrangler dev`.
 *
 * Handlers keep the onRequestGet / onRequestPost names they had as Pages
 * Functions, so the routing table reads as a list of what each path allows.
 */
import * as invite from "./api/invite.js";
import * as join from "./api/join.js";
import * as waitlist from "./api/waitlist.js";

const ROUTES = {
	"/api/invite": invite,
	"/api/join": join,
	"/api/waitlist": waitlist,
};

export default {
	async fetch(request, env, ctx) {
		const url = new URL(request.url);
		const route = ROUTES[url.pathname.replace(/\/+$/, "") || "/"];

		if (!route) return env.ASSETS.fetch(request);

		const handler =
			request.method === "GET" || request.method === "HEAD"
				? route.onRequestGet
				: request.method === "POST"
					? route.onRequestPost
					: null;

		if (!handler) {
			return new Response("Method not allowed", {
				status: 405,
				headers: { allow: [route.onRequestGet && "GET", route.onRequestPost && "POST"].filter(Boolean).join(", ") },
			});
		}

		// Same shape the handlers were written against as Pages Functions, so
		// they didn't need rewriting when this moved off Pages.
		try {
			return await handler({ request, env, ctx, waitUntil: ctx.waitUntil.bind(ctx) });
		} catch (err) {
			// A form post that 500s should still land somewhere a person can
			// read, not on a stack trace.
			console.error("handler failed", url.pathname, err);
			const { page } = await import("./lib.js");
			return page({
				status: 500,
				title: "Something went wrong",
				heading: "That didn't go through.",
				body: "Something broke on our end, not yours. Try again in a moment, and if it keeps happening email privacy@bax.bot.",
			});
		}
	},
};
