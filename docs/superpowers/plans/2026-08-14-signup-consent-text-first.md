# Signup Consent Checkbox Removal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the optional SMS consent checkbox from the invite-gated signup form and replace it with a "Baxter won't start texting you until you text him" hint under the (still optional) phone field; align terms, privacy, ops docs, and the schema comment with the new text-first opt-in model.

**Architecture:** Pure copy/markup/schema-comment change across static HTML, one Worker handler, CSS, and docs. No schema migration, no new files, no behavior change other than the `signups.consent` column no longer being written (schema `DEFAULT 0` fills it). Spec: `docs/superpowers/specs/2026-08-14-signup-consent-text-first-design.md`.

**Tech Stack:** Cloudflare Workers (ES modules) + D1, plain HTML/CSS. No test framework exists in this repo and none is being added (YAGNI); verification is `node --check`, grep assertions, and SQL column/placeholder counts.

## Global Constraints

- New consent model, stated once everywhere: **giving a number on signup starts nothing; messaging Baxter is the opt-in.**
- Phone field stays optional; terms checkbox stays required and becomes the only checkbox on the join form.
- `consent` column is kept in `schema.sql` (no migration); historical rows keep their values; new rows get `DEFAULT 0`.
- `TERMS_VERSION` in `src/api/join.js` must equal terms.html's new Effective date: `"2026-08-14"`.
- Date headers in both legal pages (Effective and Last updated): `2026-08-14`.
- Baxter pronoun in the new form hint: "him" (operator's phrasing); elsewhere the site's existing wording is left untouched.
- The honeypot checkbox input in the join form is load-bearing — do not touch any checkbox other than `join-consent`.
- Commit after each task. Repo root is the site; `.assetsignore` handles exclusions, so no build step.

---

### Task 1: Form, handler, CSS, schema comment

**Files:**
- Modify: `index.html` (~line 355–423, join form block)
- Modify: `src/api/join.js:33` and `:84–88`
- Modify: `styles.css:1545–1555` (remove `.consent-optional` rule + its comment)
- Modify: `schema.sql:43` (consent column comment)

**Interfaces:**
- Consumes: existing `POST /api/join` form field names (`name`, `nickname`, `household`, `email`, `phone`, `terms`, `invite_code`, `cf-turnstile-response`, `_honeypot`).
- Produces: `consent` is no longer a recognized form field on the join form; the INSERT writes 11 columns/11 binds. Nothing downstream reads `form.get("consent")`.

- [ ] **Step 1: Delete the consent checkbox block from index.html**

Remove exactly this block (the terms `<div class="consent">` directly above it stays):

```html
            <div class="consent">
              <input type="checkbox" id="join-consent" name="consent" value="yes">
              <label for="join-consent">
                <span class="consent-optional">Optional.</span>
                Message me at the number above. Baxter replies when I message it and sends
                the reminders I set up. Message and data rates may apply. Reply STOP any
                time to stop.
              </label>
            </div>
```

- [ ] **Step 2: Replace the phone field hint in index.html**

In the `join-phone` field, replace the existing `<p class="field-hint" id="join-phone-hint">` contents with:

```html
              <p class="field-hint" id="join-phone-hint">
                Adds texting to your household. Blue bubble on iPhone, a text everywhere
                else. Baxter won't start texting you until you text him. Leave it blank and
                Baxter works over email.
              </p>
```

- [ ] **Step 3: Rewrite the stale form comment in index.html**

Replace the last paragraph of the comment above the form (currently narrating two checkboxes) with:

```html
             One checkbox. The terms box is required: it's where the agreement
             is formed and age is confirmed. There is no messaging-consent box —
             a number alone starts nothing, and the opt-in is the member's first
             text to Baxter (see the phone hint), so a box here would add
             friction without adding consent. -->
```

The first two paragraphs of that comment (field-id namespacing, page-vs-boundary) stay unchanged.

- [ ] **Step 4: Drop consent from src/api/join.js**

Delete line 33:

```js
	const consent = form.get("consent") ? 1 : 0;
```

Replace the INSERT with an 11-column version:

```js
		await env.DB.prepare(
			`INSERT INTO signups (created_at, name, nickname, household, email, phone, terms_agreed, terms_version, invite_code, ip, user_agent)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		)
			.bind(now(), name, nickname, household, email, phone || null, terms, TERMS_VERSION, code, ip, ua)
			.run();
```

(`consent` was between `phone` and `terms_agreed` in both lists. The column's `NOT NULL DEFAULT 0` fills it; do not add a migration.)

- [ ] **Step 5: Remove the now-unused .consent-optional CSS rule**

Delete from `styles.css` (comment + rule, ~lines 1545–1555):

```css
/* Marks the messaging box as the optional one. The terms box beside it is
   required, and two identical-looking checkboxes with different obligations is
   exactly the thing someone skims past. */
.consent-optional {
	font-family: var(--mono);
	font-size: 0.82em;
	font-weight: 500;
	letter-spacing: 0.04em;
	text-transform: uppercase;
	color: var(--ink-3);
	margin-right: 0.3rem;
}
```

- [ ] **Step 6: Mark the consent column legacy in schema.sql**

Replace the column line:

```sql
  consent     INTEGER NOT NULL DEFAULT 0,   -- optional: messaging opt-in
```

with:

```sql
  consent     INTEGER NOT NULL DEFAULT 0,   -- legacy checkbox opt-in (pre-2026-08-14); opt-in is now the first inbound text. Nothing writes it.
```

- [ ] **Step 7: Verify**

Run all of these; each must hold:

```bash
node --check src/api/join.js
! rg -n "join-consent|consent-optional|name=\"consent\"" index.html styles.css signup.js src/
rg -n "VALUES" src/api/join.js   # the VALUES row must list exactly 11 ?, matching the 11 columns and 11 binds
rg -n "honeypot" index.html src/api/join.js   # still present in both
```

Expected: syntax OK; no grep hits (except none); honeypot untouched in both files.

- [ ] **Step 8: Commit**

```bash
git add index.html src/api/join.js styles.css schema.sql
git commit -m "signup: drop SMS consent checkbox, explain text-first under phone field"
```

---

### Task 2: Legal copy — terms.html, privacy.html, TERMS_VERSION

**Files:**
- Modify: `terms.html:41-42` (dates), `terms.html:136-144` (§4 Messaging first paragraph)
- Modify: `privacy.html:41-42` (dates), `privacy.html:90-95` (§2 first sentences)
- Modify: `src/api/join.js:12` (`TERMS_VERSION`)

**Interfaces:**
- Consumes: terms.html current Effective date `2026-08-06` (must move to `2026-08-14`); privacy.html current `2026-08-08`.
- Produces: `TERMS_VERSION = "2026-08-14"` stored on new signup rows — must match terms.html's new `<time datetime="2026-08-14">`.

- [ ] **Step 1: Replace terms.html §4 first paragraph**

Replace (lines 137–144, the paragraph starting "Agreeing to these terms…") with:

```html
      <p>
        A mobile number on the signup form is optional and starts nothing: give one and
        Baxter still won't message you until you text it first. When you message Baxter at
        that number you consent to receive messages from Baxter Family AI in reply and
        about the things you ask it to handle. That form is the only way to sign up;
        joining the waiting list with your email is not a signup and starts nothing.
        Consenting to messages is not a condition of signing up, or of anything else.
      </p>
```

The following paragraphs ("You must own or be authorized…", iMessage/rates, STOP/START/HELP) and the `Kept deliberately consistent with privacy.html §2` comment are unchanged — they remain accurate.

- [ ] **Step 2: Bump terms.html dates**

Lines 41–42, both `<time>` elements:

```html
        <span>Effective <time datetime="2026-08-14">August 14, 2026</time></span>
        <span>Last updated <time datetime="2026-08-14">August 14, 2026</time></span>
```

- [ ] **Step 3: Replace the privacy.html §2 opt-in sentence**

Replace the sentence chain in §2 (currently "A mobile number is optional. Give us one on the … signup form and tick the consent box, which is never pre-ticked, and Baxter messages you; leave both blank and Baxter works over email alone. That form is the only way to sign up, and we message only numbers that have opted in through it.") with:

```html
        A mobile number is optional. Give us one on the
        <a href="./#signup">signup form</a> and Baxter still won't message you until you
        text it first — that message is your opt-in. Leave the field blank and Baxter works
        over email alone. That form is the only way to sign up, and we message only numbers
        that have opted in that way. Leaving your email on our
```

(Keep the trailing `waiting list` sentence that follows in the same `<p>` intact — the replacement ends where "Leaving your email on our" picks up the existing text.)

- [ ] **Step 4: Bump privacy.html dates**

Lines 41–42, both `<time>` elements:

```html
        <span>Effective <time datetime="2026-08-14">August 14, 2026</time></span>
        <span>Last updated <time datetime="2026-08-14">August 14, 2026</time></span>
```

- [ ] **Step 5: Bump TERMS_VERSION in src/api/join.js**

```js
const TERMS_VERSION = "2026-08-14";
```

- [ ] **Step 6: Verify**

```bash
node --check src/api/join.js
rg -n "2026-08-06" terms.html src/api/join.js          # expect no hits
rg -n "consent box|tick the consent|two separate boxes|never pre-ticked" terms.html privacy.html   # expect no hits
rg -n "2026-08-14" terms.html privacy.html src/api/join.js   # expect 2 hits per page + 1 in join.js
```

Also read terms.html §4 and privacy.html §2 end-to-end once; the new sentences must flow into the unchanged text around them.

- [ ] **Step 7: Commit**

```bash
git add terms.html privacy.html src/api/join.js
git commit -m "legal: text-first messaging consent (terms + privacy, TERMS_VERSION 2026-08-14)"
```

---

### Task 3: Ops docs — OPERATIONS.md, README.md

**Files:**
- Modify: `OPERATIONS.md:202` (everyday signups query) and `OPERATIONS.md:235-241` ("Who said yes to messaging" block)
- Modify: `README.md:100-102` ("never pre-ticked" bullet)

**Interfaces:**
- Consumes: Task 1's model — `consent` no longer written, `DEFAULT 0` for new rows.
- Produces: nothing (docs only).

- [ ] **Step 1: Fix the everyday signups query in OPERATIONS.md**

Replace the line:

```sql
         CASE WHEN consent THEN 'yes' ELSE '' END AS texts,
```

with (keeps the `texts` column label; now means "gave a phone number"):

```sql
         CASE WHEN phone IS NOT NULL THEN 'yes' ELSE '' END AS texts,
```

- [ ] **Step 2: Rewrite the "Who said yes to messaging" block in OPERATIONS.md**

Replace the whole block (heading through closing SQL fence):

````markdown
**Who said yes to messaging** — for when you start actually texting people. `consent` is
optional on the form and never pre-ticked, so this is a real subset, not everyone:

```sql
SELECT name, household, email, phone
FROM signups WHERE consent = 1 AND phone IS NOT NULL AND status = 'active';
```
````

with:

````markdown
**Who gave a phone number** — who to expect a first text from. The form no longer has a
consent box; the opt-in is each member's first inbound text to Baxter. (`consent` is a
legacy column: pre-2026-08-14 rows recorded the old checkbox, and it has been 0 on every
row since — nothing writes it.)

```sql
SELECT name, household, email, phone
FROM signups WHERE phone IS NOT NULL AND status = 'active';
```
````

- [ ] **Step 3: Replace the README bullet**

Replace:

```markdown
- **The messaging consent box is never pre-ticked, and is not required.**
  Delivery still falls back to a standard text for Android recipients, under
  carrier rules, so the safe posture is cheap to keep.
```

with:

```markdown
- **There is no messaging consent box.** Giving a number starts nothing; the opt-in is
  the member's first text to Baxter, and the standard-text fallback for Android
  recipients still makes the safe posture cheap to keep.
```

- [ ] **Step 4: Verify**

```bash
! rg -n "never pre-ticked|consent = 1|WHEN consent" OPERATIONS.md README.md
rg -n "Who gave a phone number|first text to Baxter" OPERATIONS.md README.md   # expect 1 hit each
```

- [ ] **Step 5: Commit**

```bash
git add OPERATIONS.md README.md
git commit -m "docs: signups queries and README reflect text-first consent"
```
