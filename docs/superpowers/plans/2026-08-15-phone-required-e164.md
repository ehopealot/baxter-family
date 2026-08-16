# Phone Required + E.164 Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the join form's mobile number required, validate it with libphonenumber-js (US-default parsing), and store the canonical E.164 form.

**Architecture:** One new pure helper `normalizePhone` in `src/lib.js` (second npm dep: libphonenumber-js), wired into `src/api/join.js` between the missing-fields check and the household result check. Copy updates in index.html/signup.js; legal-copy updates in terms.html/privacy.html with a TERMS_VERSION bump.

**Tech Stack:** Cloudflare Worker (ESM) + D1, node:test, libphonenumber-js ^1.13.11 (default import).

**Spec:** `docs/superpowers/specs/2026-08-15-phone-required-e164-design.md` (read it first — this plan does not repeat its rationale).

## Global Constraints

- Repo: `/Users/ehope/src/baxter-family`, branch `main` (post-merge of the profanity/slugify work). Deploy on push to main — **do not push**.
- libphonenumber-js pinned `^1.13.11`, default import (`import parsePhoneNumberFromString from "libphonenumber-js"` — the default export IS the parse function; verified on 1.13.11). No other new dependencies.
- `npm test` script stays `node --test 'tests/*.test.js'`; every commit leaves the suite green (23 tests expected at the end: 9 slugify + 5 profanity + 5 join + 4 phone… count follows actual test() blocks).
- Error copy verbatim: `That number doesn't look right.` / `Enter the mobile number we can text you on — for example 415 555 0100, or +44 7400 900123 from outside the US.`
- Missing-fields body becomes: `We need a name, a nickname, a household name, a mobile number and an email address. Head back and fill those in.`
- Validation order in join.js: missing-fields (now incl. `!phone`) → phone format → household result check → profanity gate → invite claim → insert. Nothing else reordered.
- TERMS_VERSION → `"2026-08-15"`; terms.html and privacy.html effective + updated dates → 2026-08-15.
- TDD: tests first, seen failing, then implemented.

---

### Task 1: normalizePhone helper + handler wiring + copy + legal, with tests

**Files:**
- Modify: `package.json` (dependencies), `src/lib.js` (import + `normalizePhone`), `src/api/join.js` (missing-fields, format check, INSERT/notify use `phoneE164`, TERMS_VERSION), `index.html` (label/hint/input), `signup.js` (lede), `terms.html` (§4 + dates), `privacy.html` (§2 + dates), `tests/join.test.js` (fixture + new cases)
- Create: `tests/phone.test.js`

**Interfaces:**
- Consumes: existing `oops`, `notifySignup`, join.js structure; existing test harness in `tests/join.test.js` (`makeEnv`, `makeRequest`, `CLEAN_FIELDS`, `OPEN_INVITE`, stubbed fetch/waitUntil).
- Produces: `normalizePhone(raw: string): string | null` exported from `src/lib.js` — E.164 (`+14155550100`) or null.

- [ ] **Step 1: Add the dependency**

Run: `npm install libphonenumber-js`
Expected: `package.json` dependencies gains `"libphonenumber-js": "^1.13.11"` (or higher 1.x — fine, record actual); lockfile updates.

- [ ] **Step 2: Write the failing phone tests**

Create `tests/phone.test.js` (assertions verified against 1.13.11):

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizePhone } from "../src/lib.js";

test("US default: bare and formatted numbers normalize to E.164", () => {
	assert.equal(normalizePhone("415 555 0100"), "+14155550100");
	assert.equal(normalizePhone("(415) 555-0100"), "+14155550100");
	assert.equal(normalizePhone("4155550100"), "+14155550100");
});

test("plus prefix overrides the default country", () => {
	assert.equal(normalizePhone("+44 7400 900123"), "+447400900123");
	assert.equal(normalizePhone("+1 202 555 0199"), "+12025550199");
});

test("unparsable input returns null", () => {
	assert.equal(normalizePhone("asdf"), null);
	assert.equal(normalizePhone("+1 (zero) 555..."), null);
	assert.equal(normalizePhone(""), null);
});

test("parsed-but-invalid numbers return null", () => {
	assert.equal(normalizePhone("555"), null);
	assert.equal(normalizePhone("1 555 0100"), null);
	assert.equal(normalizePhone("7400 900123"), null); // UK without + mis-parses as US
	assert.equal(normalizePhone("+1 555 010 2938"), null); // 555 is not an area code
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test`
Expected: phone tests FAIL — `src/lib.js` provides no export named `normalizePhone` (module error counts as the 4 failing).

- [ ] **Step 4: Implement normalizePhone in src/lib.js**

Top of file, with the other imports (none exist yet — add the first):

```js
import parsePhoneNumberFromString from "libphonenumber-js";
```

Near `slugify`:

```js
/* A mobile number as the rest of the system dials it: canonical E.164, or
   null when the input is unparsable or not a valid number. Bare numbers are
   read as US (the invite flow is US-first); a leading + overrides, so
   visitors from elsewhere type their full international number. */
export function normalizePhone(raw) {
	const p = parsePhoneNumberFromString(String(raw || ""), "US");
	return p && p.isValid() ? p.number : null;
}
```

- [ ] **Step 5: Run phone tests to verify they pass**

Run: `npm test`
Expected: 23 pass, 0 fail (19 prior + 4 phone).

- [ ] **Step 6: Write the failing handler tests**

In `tests/join.test.js`:

- `CLEAN_FIELDS` gains `phone: "415 555 0100",`
- In the clean-signup test, after the existing `insert.args[3]` assertion add:
  `assert.equal(insert.args[5], "+14155550100"); // canonical E.164, not raw input`
- New tests (reusing existing harness verbatim):

```js
test("missing phone rejects with the missing-details error, no invite claim", async () => {
	const { env, waitUntil, statements } = makeEnv(OPEN_INVITE);
	const fields = { ...CLEAN_FIELDS };
	delete fields.phone;
	const res = await onRequestPost({ request: makeRequest(fields), env, waitUntil });
	assert.equal(res.status, 400);
	assert.ok((await res.text()).includes("a mobile number"));
	assert.ok(!statements.some((s) => s.sql.includes("UPDATE invites")));
});

test("garbage phone rejects with the number error, no invite claim", async () => {
	const { env, waitUntil, statements } = makeEnv(OPEN_INVITE);
	const res = await onRequestPost({ request: makeRequest({ ...CLEAN_FIELDS, phone: "asdf" }), env, waitUntil });
	assert.equal(res.status, 400);
	const body = await res.text();
	assert.ok(body.includes("That number doesn't look right."));
	assert.ok(!statements.some((s) => s.sql.includes("UPDATE invites")));
	assert.ok(!statements.some((s) => s.sql.startsWith("INSERT INTO signups")));
});

test("international number stored as-is in E.164", async () => {
	const { env, waitUntil, statements } = makeEnv(OPEN_INVITE);
	const res = await onRequestPost({ request: makeRequest({ ...CLEAN_FIELDS, phone: "+44 7400 900123" }), env, waitUntil });
	assert.equal(res.status, 303);
	const insert = statements.find((s) => s.sql.startsWith("INSERT INTO signups"));
	assert.equal(insert.args[5], "+447400900123");
});
```

Note the INSERT bind order: `(created_at, name, nickname, household, email, phone, ...)` — phone is `args[5]`.

- [ ] **Step 7: Run tests to verify the expected failures**

Run: `npm test`
Expected: the three new handler tests fail — missing-phone currently 303s (no check), `asdf` 303s, and the clean-signup E.164 assertions see raw `"415 555 0100"` / fail on missing `phone` key behavior. The phone.test.js suite stays green.

- [ ] **Step 8: Wire the handler**

In `src/api/join.js`:

a) Import: extend the lib.js import with `normalizePhone`.

b) TERMS_VERSION: `"2026-08-14"` → `"2026-08-15"`.

c) Missing-fields check becomes:

```js
	if (!name || !nickname || !household || !phone || !email || !email.includes("@")) {
		return oops("Some details are missing.", "We need a name, a nickname, a household name, a mobile number and an email address. Head back and fill those in.");
	}

	// Canonical E.164 or nothing: provisioning dials the stored value with no
	// second chance to clean it up. Bare numbers read as US; + overrides.
	const phoneE164 = normalizePhone(phone);
	if (!phoneE164) {
		return oops("That number doesn't look right.", "Enter the mobile number we can text you on — for example 415 555 0100, or +44 7400 900123 from outside the US.");
	}
```

d) INSERT `.bind(..., email, phone || null, ...)` → `phoneE164`; notify call → `phone: phoneE164`.

- [ ] **Step 9: Run tests to verify they pass**

Run: `npm test`
Expected: all green (26 total: 9 slugify + 5 profanity + 8 join + 4 phone).

- [ ] **Step 10: Copy updates**

`index.html` — label loses the optional badge, input gains required, hint drops the last sentence:

```html
              <label for="join-phone">
                Mobile number
              </label>
              <input type="tel" id="join-phone" name="phone" autocomplete="tel"
                     inputmode="tel" aria-describedby="join-phone-hint" required>
              <p class="field-hint" id="join-phone-hint">
                Adds texting to your household. Blue bubble on iPhone, a text everywhere
                else. Baxter won't start texting you until you text him.
              </p>
```

`signup.js` lede (in `admit()`): `…tell us where Baxter\nshould write to you. Add a mobile number too if you want Baxter over text."` → `…tell us where Baxter\nshould write to you, and the mobile number Baxter will text."`

`terms.html` §4 first sentence → "A mobile number on the signup form is required to set up your household, but starts nothing: give one and Baxter still won't message you until you text it first." (rest of the paragraph unchanged); both `<time>` dates → `2026-08-15` / "August 15, 2026".

`privacy.html` §2 first two sentences → "A mobile number is required to set up your household, but starts nothing: give us one on the signup form and Baxter still won't message you until you text it first — that message is your opt-in." (drops the optional/blank sentences; the rest of the paragraph stands); both dates → 2026-08-15.

- [ ] **Step 11: Verify and commit**

Run: `npm test` (all green) and `node --input-type=module -e "await import('./src/api/join.js'); console.log('ok')"`.

```bash
git add package.json package-lock.json src/lib.js src/api/join.js index.html signup.js terms.html privacy.html tests/phone.test.js tests/join.test.js
git commit -m "join: required phone, libphonenumber validation, canonical E.164 storage"
```
