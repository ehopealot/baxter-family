# Signup Profanity Gate + Household Slugification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Server-side profanity gate on the join form's name/nickname/household (obscenity, generic unexplained error) plus slugification of the household field, replacing today's reject-if-not-a-slug validation.

**Architecture:** Two new pure modules — `slugify` in `src/lib.js`, a two-matcher `profane()` union in `new src/profanity.js` — wired into `src/api/join.js` after field validation, before the invite claim. First npm dependency in the repo (obscenity, pure JS, wrangler bundles it); `.assetsignore` already excludes `package.json`/`node_modules/` from asset upload.

**Tech Stack:** Cloudflare Worker (ES modules) + D1, wrangler bundling, node:test (`node --test tests/`), obscenity ^0.4.6.

**Spec:** `docs/superpowers/specs/2026-08-15-signup-profanity-slugify-design.md` (read it first — this plan does not repeat its rationale).

## Global Constraints

- Repo: `/Users/ehope/src/baxter-family`. Deploy on push to main — **do not push**; the operator deploys.
- obscenity pinned `^0.4.6`; no other new dependencies.
- `package.json` must have `"type": "module"` (all Worker sources and tests are ESM).
- Error copy verbatim: gate → heading `That didn't work.` / body `We couldn't accept those details. Try different wording and submit again.`; household result check → heading `That household name won't work.` / body `It becomes an email address, so pick something 2–31 characters after tidying.`
- Hint copy verbatim (index.html `#join-household-hint`): "This becomes your household's address for Baxter. `The Andersons` becomes `the-andersons@assistant.bax.bot` — spaces, capitals and accents are tidied automatically."
- Pass-through rule: input already matching `/^[a-z0-9][a-z0-9-]{1,30}$/` after trim/fold/lowercase/map returns byte-identical (`A--B` → `a--b`, never `a-b`).
- No word stripping: `The Andersons` → `the-andersons` (operator ruling).
- Waitlist form (`src/api/waitlist.js`) and `signup.js` are untouched. No frontend validation is added.
- Gate order in join.js: missing-fields check → household result check → **profanity gate** → invite claim → insert.
- No schema migration; `UNIQUE(household)` untouched.
- Every commit must leave `npm test` green.

---

### Task 1: package.json + slugify in src/lib.js + slugify tests

**Files:**
- Create: `package.json`, `tests/slugify.test.js`
- Modify: `src/lib.js` (add `slugify` + `HOUSEHOLD_RE` near the top, after `now`)
- Modify: `README.md` (Setup section, two lines about npm install / npm test)

**Interfaces:**
- Produces: `slugify(input: string): string` and `HOUSEHOLD_RE: RegExp`, both exported from `src/lib.js`. Task 3 consumes both.
- Produces: `npm test` script running `node --test tests/` (all later tasks rely on it).

- [ ] **Step 1: Create package.json and install obscenity**

Create `package.json`:

```json
{
	"name": "baxter-family",
	"private": true,
	"type": "module",
	"scripts": {
		"test": "node --test tests/"
	},
	"dependencies": {
		"obscenity": "^0.4.6"
	}
}
```

Run: `npm install`
Expected: `node_modules/` populated (gitignored already), `package-lock.json` created. `npm ls obscenity` shows 0.4.x.

- [ ] **Step 2: Write the failing slugify tests**

Create `tests/slugify.test.js` (every assertion below was verified against a reference implementation):

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { slugify, HOUSEHOLD_RE } from "../src/lib.js";

test("already-clean slugs pass through unchanged", () => {
	assert.equal(slugify("andersons"), "andersons");
	assert.equal(slugify("the-smiths"), "the-smiths");
	assert.equal(slugify("hopetesters"), "hopetesters");
	assert.equal(slugify("a-1"), "a-1");
});

test("old-valid input keeps its exact bytes, including consecutive hyphens", () => {
	assert.equal(slugify("A--B"), "a--b");
	assert.equal(slugify("a--b"), "a--b");
});

test("no word stripping: The Andersons becomes the-andersons", () => {
	assert.equal(slugify("The Andersons"), "the-andersons");
});

test("runs of junk collapse to a single hyphen", () => {
	assert.equal(slugify("A_-B"), "a-b");
	assert.equal(slugify("  Multi   Space  "), "multi-space");
});

test("apostrophes drop rather than hyphenate (ASCII and typographic)", () => {
	assert.equal(slugify("O'Brien"), "obrien");
	assert.equal(slugify("O’Brien"), "obrien");
});

test("accents fold away", () => {
	assert.equal(slugify("Bédard"), "bedard");
	assert.equal(slugify("Müller"), "muller");
});

test("special Latin letters map in both cases", () => {
	assert.equal(slugify("Søren"), "soren");
	assert.equal(slugify("Ø"), "o");
	assert.equal(slugify("Ærø"), "aero");
	assert.equal(slugify("Gauß"), "gauss");
	assert.equal(slugify("Đorđe"), "dorde");
	assert.equal(slugify("Łódź"), "lodz");
});

test("edge hyphens trim; punctuation-only input yields empty", () => {
	assert.equal(slugify("--hello--"), "hello");
	assert.equal(slugify("!!!"), "");
	assert.equal(slugify("   "), "");
});

test("length is not enforced here — the handler's result check owns it", () => {
	assert.equal(slugify("a"), "a");
	assert.equal(slugify("x".repeat(40)), "x".repeat(40));
	assert.equal(HOUSEHOLD_RE.test(slugify("a")), false);
	assert.equal(HOUSEHOLD_RE.test(slugify("the-andersons")), true);
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `SyntaxError: The requested module '../src/lib.js' does not provide an export named 'slugify'` (or equivalent).

- [ ] **Step 4: Implement slugify in src/lib.js**

In `src/lib.js`, immediately after the `now` export, add:

```js
/* The shape a household name must have once slugified: it becomes an email
   address, so lowercase letters, digits, hyphens, 2–31 characters. */
export const HOUSEHOLD_RE = /^[a-z0-9][a-z0-9-]{1,30}$/;

/* Turn free-typed input into that shape. Accents fold (Bédard → bedard), a
   few non-decomposing letters map explicitly (Søren → soren, Gauß → gauss),
   apostrophes drop (O'Brien → obrien), any other junk run becomes a single
   hyphen, edge hyphens trim. Input already matching HOUSEHOLD_RE passes
   through byte-identical — everything the old validation accepted keeps its
   exact old value, oddities like consecutive hyphens included. */
export function slugify(input) {
	let s = String(input || "").trim();
	s = s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
	s = s.replace(/ø/g, "o").replace(/æ/g, "ae").replace(/ß/g, "ss").replace(/đ/g, "d").replace(/ł/g, "l");
	if (HOUSEHOLD_RE.test(s)) return s;
	s = s.replace(/['’]/g, "");
	s = s.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
	return s;
}
```

Order matters: lowercase (via `.toLowerCase()` in step 2's chain) before the special-letter map, or uppercase `Ø`/`ẞ`/`Ł` miss it; the pass-through check before apostrophe-hyphen cleanup, so previously-valid values never get canonicalized.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test`
Expected: PASS — 9 slugify tests green.

- [ ] **Step 6: Add the npm lines to README.md**

In `README.md`, in the **Setup** subsection under "The backend" (after the `wrangler secret put TURNSTILE_SECRET` block), add:

```markdown
One-time: `npm install` — pulls `obscenity`, the only dependency, bundled into
the Worker by wrangler. Run the test suite with `npm test` (node:test; a local
tool — deploys don't run it).
```

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json src/lib.js tests/slugify.test.js README.md
git commit -m "slugify: household-name slugification with pass-through, plus package.json/node-test scaffolding"
```

---

### Task 2: src/profanity.js + profanity tests

**Files:**
- Create: `src/profanity.js`, `tests/profanity.test.js`

**Interfaces:**
- Consumes: `obscenity` exports — `RegExpMatcher`, `englishDataset`, `englishRecommendedBlacklistMatcherTransformers`, `englishRecommendedWhitelistMatcherTransformers`, `skipNonAlphabeticTransformer`.
- Produces: `profane(text: string): boolean` exported from `src/profanity.js`. Task 3 consumes it.

Note: `englishDataset.build()` returns `{ blacklistedTerms, whitelistedTerms }` — that object spreads directly into the `RegExpMatcher` options. `skipNonAlphabeticTransformer` is a **factory**: it must be invoked, passing it bare crashes `TransformerSet` with `Cannot read properties of undefined (reading 'transform')`.

- [ ] **Step 1: Write the failing profanity tests**

Create `tests/profanity.test.js` (every assertion verified against the real library):

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { profane } from "../src/profanity.js";

test("real names pass", () => {
	for (const s of ["Dickens", "Van Dyke", "Scunthorpe", "Hell", "Johnson", "Glasscock", "O'Brien", "Müller", "Baxter", "Hope Baxter", "The Baxters", ""]) {
		assert.equal(profane(s), false, JSON.stringify(s));
	}
});

test("plain and compound profanity blocks", () => {
	for (const s of ["fuck", "shitshow", "Bullshit Inc", "cuntface", "asshat", "sh1t"]) {
		assert.equal(profane(s), true, JSON.stringify(s));
	}
});

test("separator evasions block in raw text", () => {
	for (const s of ["F U C K", "f-u-c-k", "f.u.c.k"]) {
		assert.equal(profane(s), true, JSON.stringify(s));
	}
});

test("accent-obscured profanity blocks raw (confusables transformer)", () => {
	for (const s of ["Fück", "shìt", "cøck"]) {
		assert.equal(profane(s), true, JSON.stringify(s));
	}
});

test("known false positives block — documented, accepted", () => {
	assert.equal(profane("Dick"), true);
	assert.equal(profane("Penistone"), true);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — module `../src/profanity.js` cannot be found.

- [ ] **Step 3: Implement src/profanity.js**

```js
/* Profanity gate for signup fields, built on obscenity's English dataset.

   Two matchers run as a union because each covers what the other misses:
   - strict catches compounds whose words touch or space-separate
     ("Bullshit Inc") but lets spaced-out letter evasion ("F U C K") by;
   - evasive adds skipNonAlphabeticTransformer, collapsing separators so
     "F U C K" and "f-u-c-k" match — but that same collapsing turns
     "Bullshit Inc" into "bullshitinc" and loses it.

   Both carry the dataset's whitelist with its recommended transformers, so
   real names like "Van Dyke", "Dickens" and "Scunthorpe" pass. Known
   accepted false positives: "Dick", "Penistone". This is a taste gate, not
   a security boundary — misses cost nothing, blocks cost a confusing retry. */
import {
	RegExpMatcher,
	englishDataset,
	englishRecommendedBlacklistMatcherTransformers,
	englishRecommendedWhitelistMatcherTransformers,
	skipNonAlphabeticTransformer,
} from "obscenity";

function buildMatcher(extra = []) {
	return new RegExpMatcher({
		...englishDataset.build(),
		blacklistMatcherTransformers: [...englishRecommendedBlacklistMatcherTransformers, ...extra],
		whitelistMatcherTransformers: englishRecommendedWhitelistMatcherTransformers,
	});
}

const strict = buildMatcher();
const evasive = buildMatcher([skipNonAlphabeticTransformer()]); // factory — invoke it

/* True when either matcher fires. */
export function profane(text) {
	const s = String(text || "");
	return strict.hasMatch(s) || evasive.hasMatch(s);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS — 9 slugify + 5 profanity tests green.

- [ ] **Step 5: Commit**

```bash
git add src/profanity.js tests/profanity.test.js
git commit -m "profanity: two-matcher obscenity union (strict + separator-collapsing) with truth-table tests"
```

---

### Task 3: join.js gate + slugify wiring, hint copy, handler tests

**Files:**
- Modify: `src/api/join.js` (import line 4; field read ~line 31; household check ~lines 61-63)
- Modify: `index.html` (`#join-household-hint` block, ~lines 380-385)
- Create: `tests/join.test.js`

**Interfaces:**
- Consumes: `slugify`, `HOUSEHOLD_RE` from `../lib.js` (Task 1); `profane` from `../profanity.js` (Task 2).
- Produces: no new exports. `onRequestPost` behavior changes as specified.

Behavior note for the implementer: with `household` now the *slug*, the pre-existing missing-fields check (`!name || !nickname || !household ...`) catches empty-slug inputs (empty or all-punctuation input) with the "Some details are missing." error — that ordering is existing behavior and stays. The `HOUSEHOLD_RE` result check therefore only ever fires on 1-character or over-31-character slugs. Handler facts: `clientMeta` reads `CF-Connecting-IP`/`User-Agent` headers; `seeOther` returns 303 with the Location as given; `notifySignup` is a silent no-op when `env.RESEND_SIGNUPS_KEY` is unset; the INSERT bind order is `(created_at, name, nickname, household, email, phone, terms_agreed, terms_version, invite_code, ip, user_agent)` so `household` is `args[3]`.

- [ ] **Step 1: Write the failing handler tests**

Create `tests/join.test.js`:

```js
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
		ctx: { waitUntil: () => {} },
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
	const { env, ctx, statements } = makeEnv(OPEN_INVITE);
	const res = await onRequestPost({ request: makeRequest(CLEAN_FIELDS), env, ctx });
	assert.equal(res.status, 303);
	assert.equal(res.headers.get("location"), "/welcome");
	const insert = statements.find((s) => s.sql.startsWith("INSERT INTO signups"));
	assert.ok(insert, "signup insert ran");
	assert.equal(insert.args[3], "the-andersons"); // stored slug, not raw input
});

test("an already-valid household like A--B stores lowercased and otherwise unchanged", async () => {
	const { env, ctx, statements } = makeEnv(OPEN_INVITE);
	const res = await onRequestPost({ request: makeRequest({ ...CLEAN_FIELDS, household: "A--B" }), env, ctx });
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
		const { env, ctx, statements } = makeEnv(OPEN_INVITE);
		const res = await onRequestPost({ request: makeRequest(fields), env, ctx });
		assert.equal(res.status, 400, JSON.stringify(fields));
		const body = await res.text();
		assert.ok(body.includes("That didn't work."), JSON.stringify(fields));
		assert.ok(!statements.some((s) => s.sql.includes("UPDATE invites")), "no invite claim: " + JSON.stringify(fields));
		assert.ok(!statements.some((s) => s.sql.startsWith("INSERT INTO signups")), "no signup insert: " + JSON.stringify(fields));
	}
});

test("all-punctuation household yields the pre-existing missing-details error (slug is empty)", async () => {
	const { env, ctx, statements } = makeEnv(OPEN_INVITE);
	const res = await onRequestPost({ request: makeRequest({ ...CLEAN_FIELDS, household: "!!!" }), env, ctx });
	assert.equal(res.status, 400);
	assert.ok((await res.text()).includes("Some details are missing."));
	assert.ok(!statements.some((s) => s.sql.includes("UPDATE invites")), "no invite claim");
});

test("over-long household gets the won't-work error after tidying", async () => {
	const { env, ctx } = makeEnv(OPEN_INVITE);
	const res = await onRequestPost({ request: makeRequest({ ...CLEAN_FIELDS, household: "x".repeat(40) }), env, ctx });
	assert.equal(res.status, 400);
	assert.ok((await res.text()).includes("That household name won't work."));
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: three of the five new tests FAIL — "clean signup stores the slug" (400s on the charset check today, `The Andersons` isn't a slug), "profanity in any field" (no gate: 303 + insert where 400 expected), and "all-punctuation household" (currently 400s on the charset check, not missing-details). The other two (`A--B` pass-through, over-long) already pass — they are regression pins the change must not disturb.

- [ ] **Step 3: Modify src/api/join.js**

Three edits.

Edit A — import line (line 4):

```js
import { turnstileOk, checkInvite, seeOther, page, clientMeta, now, slugify, HOUSEHOLD_RE } from "../lib.js";
import { profane } from "../profanity.js";
```

Edit B — field read (line 31). Replace:

```js
	const household = (form.get("household") || "").toString().trim().toLowerCase();
```

with:

```js
	const householdRaw = (form.get("household") || "").toString().trim();
	const household = slugify(householdRaw);
```

Edit C — validation blocks (lines 61-63). Replace:

```js
	if (!/^[a-z0-9][a-z0-9-]{1,30}$/.test(household)) {
		return oops("That household name won't work.", "It becomes an email address, so it needs to be 2–31 characters: lowercase letters, numbers and hyphens, starting with a letter or number.");
	}
```

with:

```js
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS — 9 slugify + 5 profanity + 5 join tests green.

- [ ] **Step 5: Update the household hint in index.html**

In `index.html`, replace the `#join-household-hint` block (~line 380):

```html
              <p class="field-hint" id="join-household-hint">
                This becomes your household's address for Baxter. Pick
                <code>andersons</code> and you'll receive emails from
                <code>andersons@assistant.bax.bot</code>.
              </p>
```

with:

```html
              <p class="field-hint" id="join-household-hint">
                This becomes your household's address for Baxter.
                <code>The Andersons</code> becomes
                <code>the-andersons@assistant.bax.bot</code> — spaces,
                capitals and accents are tidied automatically.
              </p>
```

- [ ] **Step 6: Syntax-check the Worker sources**

Run: `node --input-type=module -e "await import('./src/api/join.js'); console.log('join.js imports ok')"`
Expected: `join.js imports ok` (module-scope matcher construction included).

- [ ] **Step 7: Commit**

```bash
git add src/api/join.js index.html tests/join.test.js
git commit -m "join: profanity gate before invite claim + household slugification with result check"
```

---

### Task 4: Final verification

**Files:**
- None created; whole-repo verification only.

**Interfaces:**
- Consumes: everything from Tasks 1-3.

- [ ] **Step 1: Full suite**

Run: `npm test`
Expected: 19 tests, 0 fail.

- [ ] **Step 2: Confirm no stray changes**

Run: `git status --short && git log --oneline -4`
Expected: clean tree; four commits from this plan on top of `7d994c2`'s successor (spec commits).

- [ ] **Step 3: Local smoke (optional but cheap)**

Run: `npx wrangler dev` (needs `TURNSTILE_SECRET=1x0000000000000000000000000000000AA` in `.dev.vars`), then from another shell:

```bash
# clean signup → 303 /welcome; profane name → 400 "That didn't work."
curl -si -X POST http://localhost:8787/api/join -d "name=Bullshit Inc" -d "nickname=x" -d "household=The Andersons" -d "email=t@example.com" -d "terms=1" -d "invite_code=BAX-7K3M" -d "cf-turnstile-response=x" | head -20
```

Expected: 400 with the generic error page (an invite must exist in local D1 — `node tools/invite.mjs new --open --label smoke --local` creates one; use its code). Skip if `.dev.vars` isn't set up; the handler tests cover the same paths.

- [ ] **Step 4: Report**

Report commits, test output, and any deviations from the plan. Do not push — the operator deploys by merging/pushing to main.
