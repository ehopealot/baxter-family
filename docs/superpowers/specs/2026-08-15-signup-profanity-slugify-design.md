# Signup profanity gate + household slugification

Date: 2026-08-15 · Status: approved design (operator: "b obscenity" for library, "oh. please slugify it" for slugification, "good deal" on design; reviewer REVISE findings amended 2026-08-15, incl. operator ruling: `The Andersons` → `the-andersons` is the intended behavior)

## Problem

The invite-gated signup form accepts free-text `name`, `nickname`, and
`household`. Nothing stops profane values from being stored, shown to the
operator in signup notifications, and — for `household` — becoming a permanent
email address on `assistant.bax.bot`. Separately, the household field demands
the user type a pre-slugified value (`/^[a-z0-9][a-z0-9-]{1,30}$/`) and rejects
anything else; that's avoidable friction.

Two changes, both server-side only in `/api/join`:

1. **Profanity gate.** Check all three fields with a common library
   (`obscenity`); any field that fails the check rejects the signup with a
   generic, unexplained error.
2. **Slugify the household name** instead of demanding a slug. Type
   `The Andersons` → get `the-andersons`. No word-stripping, no leading-article
   removal — the slug is a faithful transliteration of what was typed
   (operator-confirmed behavior).

## Scope

- Join form only (`POST /api/join`). The waitlist form
  (`POST /api/waitlist`, no invite) keeps its current validation untouched
  (operator decision "A").
- Server-side only. No frontend validation in `signup.js`/`index.html` beyond
  the hint copy change.
- No changes to the `signups` schema or downstream consumers
  (`baxctl` provisioning, notification email) — the slug output is
  byte-identical to the old behavior for every input the old regex accepted
  (§3 pass-through rule); the only observable difference is that some
  previously-rejected inputs now succeed, slugified.

## 1. Library: obscenity (first npm dependency)

`obscenity@0.4.6` — MIT, zero dependencies, ships its own types, actively
maintained, ~271k downloads/week, pure JS so wrangler bundles it into the
Worker with no build-step change. This is the repo's first `package.json`
dependency.

Chosen over alternatives for evasion-resistance (leet `sh1t`, confusables,
separators) with an acceptable false-positive rate; chosen by the operator
over `leo-profanity` (fewer FPs but no evasion handling) and `bad-words`
(whole-word matching misses compounds like "shitshow" entirely).

### Matcher configuration — `src/profanity.js` (new)

The library's `englishDataset` ships 119 blacklisted terms and 66 whitelist
terms. Its whitelist only works with matching transformers applied, so the
recommended transformer sets are non-optional. Empirically verified behavior:

| input | strict-only | + skipNonAlphabetic (evasive) |
|---|---|---|
| `Van Dyke`, `Dickens`, `Scunthorpe`, `Hell`, `Johnson`, `Glasscock`, `O'Brien`, `Müller` | ok | ok |
| `Bullshit Inc`, `shitshow`, `cuntface`, `asshat`, `sh1t` | BLOCK | ok (space-collapse defeats match) |
| `F U C K`, `f-u-c-k`, `f.u.c.k` | ok | BLOCK |

One matcher can't catch both classes: separator-collapsing turns
`Bullshit Inc` into `bullshitinc` (no match) while plain spacing defeats the
strict matcher. So build **two matchers** at module scope:

- `strict`: `englishDataset.build()` with
  `blacklistMatcherTransformers: englishRecommendedBlacklistMatcherTransformers`
  and `whitelistMatcherTransformers: englishRecommendedWhitelistMatcherTransformers`.
- `evasive`: same plus `skipNonAlphabeticTransformer()` appended to the
  blacklist transformers (it's a factory — must be invoked, not passed bare).

Export `profane(text)` → boolean, true if **either** matcher's `hasMatch`
fires. Union catches compounds (strict) and separator evasions (evasive).

Accepted false positives: standalone `Dick`, `Penistone`. Rejected by taste:
this is a gate, not a security boundary — a blocked real name costs an invite
holder a confusing retry, while a missed evasion costs nothing.

Note: `leo-profanity` catches `Bullshit Inc` without the two-matcher dance but
misses all evasions; the union approach keeps obscenity's coverage without
losing the compound class.

## 2. Gate placement — `src/api/join.js`

After the existing per-field validation and the household result check,
**before the invite claim** (`UPDATE invites ... used_count + 1`). A rejected
signup burns no invite use — the claim happens later, so the code stays
usable. The Turnstile token is consumed (tokens are single-use), exactly as
with every existing server-side rejection on this form (taken household,
missing fields, terms unticked): the response is a server-rendered error
page, and retrying means going back — a Back-then-resubmit may hit a
stale-token error until the page is reloaded. That is the status-quo retry
UX for all validation failures here, inherited unchanged by this gate;
improving it is a deferred non-goal (see below).

```js
if (profane(name) || profane(nickname) || profane(householdRaw) || profane(household)) {
	return oops("That didn't work.", "We couldn't accept those details. Try different wording and submit again.");
}
```

(`householdRaw` is the value as typed; `household` is its slug per §3 — both are
checked, see §4.) Generic unexplained error, per operator: "doesn have to be an
explained error just fail and dont create the sign up". The wording deliberately
does not say which field or what tripped it.

## 3. Household slugification — `src/lib.js` + `src/api/join.js`

Replace the reject-if-not-slug read at `join.js:31`:

```js
const household = slugify((form.get("household") || "").toString());
```

`slugify` lives in `src/lib.js` (dependency-free). Order matters — lowercase
must precede the hyphen replacement or the `[a-z0-9]` class eats uppercase
letters (`Andersons` → `-ndersons`):

1. Trim.
2. Fold accents: `normalize("NFD")` + strip combining marks (`Bédard` →
   `bedard`, `Müller` → `muller`).
3. Lowercase. (Must precede both the special-letter map and the hyphen
   replacement — otherwise the `[a-z0-9]` class eats uppercase letters
   (`Andersons` → `-ndersons`) and uppercase `Ø`/`ẞ`/`Ł` miss the map.)
4. Map the few non-decomposing Latin letters explicitly: `ø`→`o`, `æ`→`ae`,
   `ß`→`ss`, `đ`→`d`, `ł`→`l` (`Søren` → `soren`, not `s-ren`; the
   lowercase-only map suffices because step 3 already folded case, so `Ø` and
   `ẞ` arrive here as `ø` and `ß`).
5. **Pass-through rule:** if the result already matches
   `/^[a-z0-9][a-z0-9-]{1,30}$/`, return it unchanged. Anything the old code
   accepted (including consecutive hyphens like `a--b`) therefore produces a
   byte-identical outcome to today — no canonicalization, no new collisions
   among previously-valid names.
6. Strip apostrophes (`O'Brien` → `obriens`, not `o-brien`).
7. Replace any run of remaining non-`[a-z0-9]` with a single hyphen.
8. Trim leading/trailing hyphens.

Then keep the existing regex `/^[a-z0-9][a-z0-9-]{1,30}$/` as a **result**
check on the final output. Failures after slugification: empty result (input
was all punctuation), one character, or longer than 31. The error copy drops
the charset instruction (the user no longer has to type a slug): "That
household name won't work." / "It becomes an email address, so pick something
2–31 characters after tidying."

Because of the pass-through rule, every previously-accepted input yields the
identical stored value as before; downstream consumers and `UNIQUE(household)`
semantics are unchanged. Inputs the old code rejected may now slugify to a
slug already taken by another household (e.g. `A_-B` → `a-b`) — those get the
existing "taken" error, which is the correct outcome for a canonicalized
collision.

### Hint copy — `index.html`

Current: "This becomes your household's address for Baxter. Pick `andersons`
and you'll receive emails from `andersons@assistant.bax.bot`."

New: "This becomes your household's address for Baxter. `The Andersons`
becomes `the-andersons@assistant.bax.bot` — spaces, capitals and accents
are tidied automatically."

## 4. The gate checks the slug, too

Household is checked both as typed and slugified. The raw union already
catches most cases (the evasive matcher handles `F U C K`/`f-u-c-k` in any
field, including name and nickname); the slug check is cheap defense-in-depth
for inputs where slugification itself changes the text into something the
raw pass missed. Name and nickname are checked raw only — they are never
transformed downstream, and the raw union already covers separator evasions
there.

## 5. Testing

The repo has no test framework; this feature adds `node --test` deliberately
(the 2026-08-14 consent plan's "no framework, YAGNI" stance was task-scoped;
here the gate placement is a security property worth pinning). Add:

- `package.json` (new): `{ "type": "module", "scripts": { "test": "node --test tests/" }, "dependencies": { "obscenity": "^0.4.6" } }`.
- `tests/profanity.test.js`: the verified truth table — real names pass
  (Dickens, Van Dyke, Scunthorpe, Hell, Johnson, Glasscock, O'Brien, Müller,
  Baxter), profanity blocks (fuck, shitshow, Bullshit Inc, cuntface, asshat,
  sh1t), evasions block in raw text (F U C K, f-u-c-k, f.u.c.k), known FPs
  documented as blocking (Dick, Penistone).
- `tests/slugify.test.js`: identity for already-clean slugs; **pass-through
  preserves `a--b` unchanged**; `The Andersons` → `the-andersons` (no
  article stripping); space/underscore runs → single hyphen; apostrophe
  stripping; accent folding; special-letter map in both cases (`Søren`,
  `Ø`, `Æ`, `ẞ`, `Đ`, `Ł`); edge-hyphen trim; all-punctuation → empty;
  1-char and 32-char results.
- `tests/join.test.js`: handler-level tests over `onRequestPost` with a
  stubbed `globalThis.fetch` (Turnstile siteverify → success) and a mock
  `env.DB` (`.prepare().bind().run()/.first()` chains). Assert: (1) profanity
  in each of `name`, `nickname`, raw `household`, and a profane-only-after-
  slugify `household` all return the generic 400; (2) for those cases the
  invite-claim UPDATE and signup INSERT are never invoked (gate-before-claim);
  (3) a clean request persists the slug, not the raw input, and notify fires;
  (4) an already-valid input like `A--B` is stored lowercased and otherwise
  unchanged.

`npm test` is the command; the repo deploys on push to main and has no CI, so
tests are a local/pre-push tool, same as `wrangler dev`. The stale-token retry
UX is covered by manual verification, not automated tests.

## Sequencing

1. `package.json` + install obscenity (lockfile: `package-lock.json` —
   `.gitignore` keeps `node_modules/` ignored; the lockfile is committed).
2. `src/lib.js` slugify + `tests/slugify.test.js`.
3. `src/profanity.js` + `tests/profanity.test.js`.
4. `src/api/join.js` gate + slugify call, hint copy in `index.html`,
   `tests/join.test.js`.
5. Verify with `npm test` and `wrangler dev` (manual POST against local D1).

## Deferred / non-goals

- Waitlist-form profanity checking (explicitly out of scope, operator "A").
- Any admin/operator UI for reviewing blocked attempts — no logging of which
  field tripped, by design (generic error, no stored telemetry).
- Custom allowlist additions on top of englishDataset (e.g. re-allowing
  "Dick" as a name) — revisit only if a real signup hits a known FP.
- Client-side join-form error handling (`fetch` interception +
  `turnstile.reset()` for a token-fresh in-place retry). Every server-side
  rejection on this form already has the Back-and-reload retry path; the
  profanity gate intentionally inherits it (operator: "just fail"). Revisit
  only if failed submissions become a real friction report.
