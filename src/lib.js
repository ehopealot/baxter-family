/* Shared bits for the form handlers. */

export const now = () => Math.floor(Date.now() / 1000);

/* Turnstile's server check. The widget on the page only mints a token; this is
   the half that stops anything, because the endpoint is public and anyone can
   POST straight at it. Tokens are single-use and expire after five minutes. */
export async function turnstileOk(env, token, ip) {
	if (!env.TURNSTILE_SECRET) return { ok: false, why: "TURNSTILE_SECRET is not set" };
	if (!token) return { ok: false, why: "no turnstile token" };
	const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ secret: env.TURNSTILE_SECRET, response: token, remoteip: ip }),
	});
	const data = await res.json();
	return data.success
		? { ok: true }
		: { ok: false, why: (data["error-codes"] || []).join(", ") || "turnstile rejected" };
}

/* Look a code up and decide whether it can be used right now. Returns the row
   when usable so callers can read .email and .kind off it. */
export async function checkInvite(db, code) {
	if (!code) return { ok: false, reason: "missing", message: "This page needs an invite link." };
	const row = await db
		.prepare(
			`SELECT code, kind, email, label, max_uses, used_count, expires_at, revoked
			 FROM invites WHERE code = ?`,
		)
		.bind(code.trim().toUpperCase())
		.first();

	if (!row) {
		return { ok: false, reason: "unknown", message: "We don't recognise that invite. Ask us for a fresh one and we'll send it straight over." };
	}
	if (row.revoked) {
		return { ok: false, reason: "revoked", message: "That invite has been withdrawn. Reply to our email and we'll sort it out." };
	}
	if (row.expires_at && row.expires_at < now()) {
		return { ok: false, reason: "expired", message: "That invite has expired. Reply to our email and we'll send you a new link." };
	}
	if (row.max_uses !== null && row.used_count >= row.max_uses) {
		return { ok: false, reason: "used", message: "That invite has already been used. Ask us for another and we'll get you set up." };
	}
	return { ok: true, invite: row };
}

/* A styled page, so a failed post lands somewhere that looks like the site
   rather than on a bare error string. Static thank-you pages handle success;
   this is only for the paths that need a message. */
export function page({ title, heading, body, status = 200 }) {
	const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
	return new Response(
		`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="robots" content="noindex">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='7' fill='%23F2A177'/%3E%3Crect x='7' y='13' width='18' height='3' rx='1.5' fill='%233B2419'/%3E%3Crect x='7' y='19' width='11' height='3' rx='1.5' fill='%239E5124'/%3E%3C/svg%3E">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,300..900&family=IBM+Plex+Mono:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/styles.css">
</head>
<body>
<header class="topbar">
  <div class="wrap topbar-inner">
    <a class="mark" href="/">
      <span class="mark-badge" aria-hidden="true">B</span>
      <span class="mark-name">Baxter Family AI</span>
    </a>
  </div>
</header>
<main id="main" tabindex="-1">
  <section class="band band-alt">
    <div class="wrap band-grid">
      <div class="band-label"><span class="tick"></span>Sign up</div>
      <div class="band-body">
        <h2>${esc(heading)}</h2>
        <p class="band-lede">${esc(body)}</p>
        <div class="cta-row" style="margin-top:1.75rem">
          <a class="btn btn-ghost" href="/">Back to the homepage</a>
        </div>
      </div>
    </div>
  </section>
</main>
</body>
</html>`,
		{ status, headers: { "content-type": "text/html; charset=utf-8" } },
	);
}

/* 303 so the browser re-requests with GET; a plain 302 leaves the POST in
   history and a refresh re-submits the form. */
export const seeOther = (url) => new Response(null, { status: 303, headers: { Location: url } });

export function clientMeta(request) {
	return {
		ip: request.headers.get("CF-Connecting-IP") || null,
		ua: (request.headers.get("User-Agent") || "").slice(0, 300) || null,
	};
}
