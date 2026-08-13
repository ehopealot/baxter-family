/* Notification email to the operator when someone signs up.
 *
 * One call, to Resend, from signups@ops.bax.bot to erik@bax.bot. Fire-and-forget
 * via ctx.waitUntil — the user's redirect must not wait on an email send, and a
 * failed notification is a console.error, not a broken signup.
 */

const RESEND_API_URL = "https://api.resend.com/emails";
const TO = "erik@bax.bot";
const FROM = "Baxter Signups <signups@ops.bax.bot>";

/**
 * @param {object} env — needs RESEND_SIGNUPS_KEY
 * @param {{ type: "waitlist" | "join", name: string, email: string, nickname?: string, household?: string }} info
 */
export async function notifySignup(env, info) {
	const key = env?.RESEND_SIGNUPS_KEY;
	if (!key) return; // not configured — silent no-op, same as the login-code path

	const subject =
		info.type === "join"
			? `New signup: ${info.household || info.name}`
			: `New waitlist: ${info.name}`;

	const body =
		info.type === "join"
			? `${info.name} signed up.\n` +
			  (info.nickname ? `Nickname: ${info.nickname}\n` : "") +
			  `Household: ${info.household}\n` +
			  `Email: ${info.email}\n` +
			  (info.phone ? `Phone: ${info.phone}\n` : "") +
			  `\nThey're ready to go.`
			: `${info.name} joined the waitlist.\n` +
			  `Email: ${info.email}\n` +
			  `\nSend them an invite when you're ready.`;

	try {
		const res = await fetch(RESEND_API_URL, {
			method: "POST",
			headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
			body: JSON.stringify({ from: FROM, to: TO, subject, text: body }),
			signal: AbortSignal.timeout(10_000),
		});
		res.body?.cancel().catch(() => {});
		if (!res.ok) console.error(`notifySignup: Resend returned ${res.status}`);
	} catch (err) {
		console.error(`notifySignup: send failed (${err?.name ?? "Error"})`);
	}
}
