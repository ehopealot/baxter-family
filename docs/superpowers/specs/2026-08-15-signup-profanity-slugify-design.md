# Signup profanity gate + household slugification

Date: 2026-08-15 · Status: approved design (operator: "b obscenity" for library, "oh. please slugify it" for slugification, "good deal" on design)

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
   `The Andersons` → get `andersons`.

## Scope

- Join form only (`POST /api/join`). The waitlist form
  (`POST /api/waitlist`, no invite) keeps its current validation untouched
  (operator decision "A").
- Server-side only. No frontend validation in `signup.js`/`index.html` beyond
  the hint copy change.
- No changes to the `signups` schema or downstream consumers
  (`baxctl` provisioning, notification email) — the slug output domain is
  byte-identical to what the old regex admitted, so nothing downstream can
  observe the difference except that more inputs now succeed.

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

After the existing per-field validation and the household charset check,
**before the invite claim** (`UPDATE invites ... used_count + 1`). A rejected
signup burns nothing: the invite stays usable, the person edits the offending
field and resubmits with a fresh Turnstile token.

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
3. Map the few non-decomposing Latin letters explicitly: `ø`→`o`, `æ`→`ae`,
   `ß`→`ss`, `đ`→`d`, `ł`→`l` (`Søren` → `soren`, not `s-ren`).
4. Strip apostrophes (`O'Brien` → `obriens`, not `o-brien`).
5. Lowercase.
6. Replace any run of remaining non-`[a-z0-9]` with a single hyphen.
7. Trim leading/trailing hyphens.

Then keep the existing regex `/^[a-z0-9][a-z0-9-]{1,30}$/` as a **result**
check on the slug (not the input). Post-slugify only length can fail it, so
the error copy changes to match — no more charset instruction (the user no
longer has to type a slug), just: empty/too-long result gets "That household
name won't work." / "It becomes an email address, so pick something a bit
shorter — 2–31 letters after tidying."

Output domain is identical to what the old regex admitted — every accepted
slug would have been accepted before. Downstream consumers are unaffected;
`UNIQUE(household)` semantics unchanged.

### Hint copy — `index.html`

Current: "This becomes your household's address for Baxter. Pick `andersons`
and you'll receive emails from `andersons@assistant.bax.bot`."

New: "This becomes your household's address for Baxter. `The Andersons`
becomes `andersons@assistant.bax.bot` — spaces, capitals and accents are
tidied automatically."

## 4. The gate checks the slug, too

Household is checked both as typed and slugified (`f u c k` as typed passes
the strict matcher as four words, but slugifies to `f-u-c-k` which the evasive
matcher collapses and catches). Name and nickname are checked raw only — they
are never transformed downstream, so a spaced-out evasion in a nickname is a
taste miss, not a persistent identifier.

## 5. Testing

The repo has no test framework. Add:

- `package.json` (new): `{ "type": "module", "scripts": { "test": "node --test tests/" }, "dependencies": { "obscenity": "^0.4.6" } }`.
- `tests/profanity.test.js`: the verified truth table — real names pass
  (Dickens, Van Dyke, Scunthorpe, Hell, Johnson, Glasscock, O'Brien, Müller,
  Baxter), profanity blocks (fuck, shitshow, Bullshit Inc, cuntface, asshat,
  sh1t), evasions block (F U C K, f-u-c-k, f.u.c.k), known FPs documented as
  blocking (Dick, Penistone).
- `tests/slugify.test.js`: identity for already-clean slugs; space/underscore
  runs → single hyphen; apostrophe stripping; accent folding; `ø`/`ß` map;
  uppercase preserved through the pipeline (`Andersons` → `andersons`);
  edge-hyphen trim; all-punctuation → empty; length behavior.

Pure-function tests over `src/profanity.js` and `src/lib.js` — no Worker env,
no D1, no fetch. `npm test` is the command; run it in CI-free fashion (the
repo deploys on push to main; tests are a local/pre-push tool, same as
`wrangler dev`).

## Sequencing

1. `package.json` + install obscenity (lockfile: `package-lock.json` —
   `.gitignore` keeps `node_modules/` ignored; the lockfile is committed).
2. `src/lib.js` slugify + tests.
3. `src/profanity.js` + tests.
4. `src/api/join.js` gate + slugify call, hint copy in `index.html`.
5. Verify with `npm test` and `wrangler dev` (manual POST against local D1).

## Deferred / non-goals

- Waitlist-form profanity checking (explicitly out of scope, operator "A").
- Any admin/operator UI for reviewing blocked attempts — no logging of which
  field tripped, by design (generic error, no stored telemetry).
- Custom allowlist additions on top of englishDataset (e.g. re-allowing
  "Dick" as a name) — revisit only if a real signup hits a known FP.
