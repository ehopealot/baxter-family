import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { onRequestPost } from "../src/api/join.js";

/* Everything the handler touches externally is stubbed: Turnstile's
   siteverify fetch, the D1 binding, ctx.waitUntil. notifySignup no-ops
   without RESEND_SIGNUPS_KEY, so a clean signup makes no second call. */
const realFetch = globalThis.fetch;

function makeRequest(fields) {
	return new Request("https://bax.bot/api/join", {
		method: "POST",
		body: new URLSearchParams(fields),
		headers: { "CF-Connecting-IP": "203.0.113.7", "User-Agent": "test" },
	});
}

function makeEnv(inviteRow) {
	const statements = [];
	const waitUntilCalls = [];
	const respond = (sql) => ({
		bind: (...args) => {
			statements.push({ sql, args });
			return {
				run: async () => ({ meta: { changes: 1 } }),
				first: async () => inviteRow,
			};
		},
		run: async () => ({ meta: { changes: 1 } }),
		first: async () => inviteRow,
	});
	return {
		statements,
		env: { TURNSTILE_SECRET: "test-secret", DB: { prepare: (sql) => respond(sql) } },
		waitUntil: (p) => {
			waitUntilCalls.push(p);
		},
		waitUntilCalls,
	};
}

const OPEN_INVITE = { code: "BAX-7K3M", kind: "open", email: null, label: "card", max_uses: null, used_count: 0, expires_at: null, revoked: 0 };

const CLEAN_FIELDS = {
	name: "Hope Baxter",
	nickname: "hopie",
	household: "The Andersons",
	email: "hope@example.com",
	phone: "",
	terms: "1",
	invite_code: "BAX-7K3M",
	"cf-turnstile-response": "tok",
};

before(() => {
	globalThis.fetch = async () => ({ ok: true, json: async () => ({ success: true }) });
});
after(() => {
	globalThis.fetch = realFetch;
});

test("clean signup stores the slug and claims the invite", async () => {
	const { env, waitUntil, statements, waitUntilCalls } = makeEnv(OPEN_INVITE);
	const res = await onRequestPost({ request: makeRequest(CLEAN_FIELDS), env, waitUntil });
	assert.equal(res.status, 303);
	assert.equal(res.headers.get("location"), "/welcome");
	const insert = statements.find((s) => s.sql.startsWith("INSERT INTO signups"));
	assert.ok(insert, "signup insert ran");
	assert.equal(insert.args[3], "the-andersons"); // stored slug, not raw input
	assert.ok(statements.some((s) => s.sql.includes("UPDATE invites")), "invite claim ran");
	assert.equal(waitUntilCalls.length, 1); // notify scheduling fired once
});

test("an already-valid household like A--B stores lowercased and otherwise unchanged", async () => {
	const { env, waitUntil, statements } = makeEnv(OPEN_INVITE);
	const res = await onRequestPost({ request: makeRequest({ ...CLEAN_FIELDS, household: "A--B" }), env, waitUntil });
	assert.equal(res.status, 303);
	const insert = statements.find((s) => s.sql.startsWith("INSERT INTO signups"));
	assert.equal(insert.args[3], "a--b"); // pass-through, not canonicalized to a-b
});

test("profanity in any field rejects with the generic error and never claims the invite", async () => {
	for (const fields of [
		{ ...CLEAN_FIELDS, name: "Bullshit Inc" },
		{ ...CLEAN_FIELDS, nickname: "cuntface" },
		{ ...CLEAN_FIELDS, household: "F U C K" },
	]) {
		const { env, waitUntil, statements } = makeEnv(OPEN_INVITE);
		const res = await onRequestPost({ request: makeRequest(fields), env, waitUntil });
		assert.equal(res.status, 400, JSON.stringify(fields));
		const body = await res.text();
		assert.ok(body.includes("That didn't work."), JSON.stringify(fields));
		assert.ok(!statements.some((s) => s.sql.includes("UPDATE invites")), "no invite claim: " + JSON.stringify(fields));
		assert.ok(!statements.some((s) => s.sql.startsWith("INSERT INTO signups")), "no signup insert: " + JSON.stringify(fields));
	}
});

test("all-punctuation household yields the pre-existing missing-details error (slug is empty)", async () => {
	const { env, waitUntil, statements } = makeEnv(OPEN_INVITE);
	const res = await onRequestPost({ request: makeRequest({ ...CLEAN_FIELDS, household: "!!!" }), env, waitUntil });
	assert.equal(res.status, 400);
	assert.ok((await res.text()).includes("Some details are missing."));
	assert.ok(!statements.some((s) => s.sql.includes("UPDATE invites")), "no invite claim");
});

test("over-long household gets the won't-work error after tidying", async () => {
	const { env, waitUntil } = makeEnv(OPEN_INVITE);
	const res = await onRequestPost({ request: makeRequest({ ...CLEAN_FIELDS, household: "x".repeat(40) }), env, waitUntil });
	assert.equal(res.status, 400);
	assert.ok((await res.text()).includes("That household name won't work."));
});
