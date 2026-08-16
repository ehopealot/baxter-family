# Required phone with libphonenumber validation + canonical E.164 storage

Date: 2026-08-15 · Status: approved design (operator: "make the phone field required", "b -- we are auto provisioning now", "parse as us", "yes" on final design)

## Problem

The join form's mobile number is optional and unvalidated — whatever string
arrives is stored as typed. Two changes, driven by SMS auto-provisioning now
running at household setup:

1. **Required.** A household without a number can't be texted, and
   provisioning needs one at signup.
2. **Validated and canonical.** The stored value must be dial-ready E.164
   (`+14155550100`) with no downstream cleanup: libphonenumber-js parses,
   validates, and normalizes before the row is written.

## Scope

Join form only. Waitlist form, schema, and provisioning itself are untouched.
No `pattern` attribute on the input — a regex would contradict what
libphonenumber accepts; `required` client-side, truth server-side, same as
every other field here.

## 1. Library: libphonenumber-js

`libphonenumber-js@1.13.11` (default/min metadata import), MIT, zero deps,
pure JS — second npm dependency, same wrangler-bundling story as obscenity.
Min metadata suffices: the form's job is catching garbage, not telco-grade
portability checks.

Parsing rule: **US default country, `+` overrides.** Verified truth table
(1.13.11, `parsePhoneNumberFromString(raw, "US")`):

| input | result |
|---|---|
| `415 555 0100` | VALID → `+14155550100` |
| `(415) 555-0100` / `4155550100` | VALID → `+14155550100` |
| `+44 7400 900123` | VALID → `+447400900123` |
| `7400 900123` (UK, no `+`) | INVALID (mis-parses as US `+17400900123`) — correct: copy tells non-US users to add the code |
| `555`, `1 555 0100` | INVALID |
| `asdf`, `+1 (zero) 555...` | UNPARSED (null) |
| `+1 555 010 2938` | **INVALID** — 555 is not a real area code; earlier draft copy used this number and it fails its own validation. Fictional-valid examples: `415 555 0100`, `+44 7400 900123`. |

### Helper — `src/lib.js`

```js
export function normalizePhone(raw) {
	const p = parsePhoneNumberFromString(String(raw || ""), "US");
	return p && p.isValid() ? p.number : null;
}
```

Returns canonical E.164 string or null (covers both unparsable and invalid).

## 2. Handler — `src/api/join.js`

Order: `!phone` joins the existing missing-fields check; the format check
follows immediately after it, before the household result check (so:
missing-fields incl. phone → phone format → household result check →
profanity gate → invite claim → insert). Then:

```js
const phoneE164 = normalizePhone(phone);
if (!phoneE164) {
	return oops("That number doesn't look right.", "Enter the mobile number we can text you on — for example 415 555 0100, or +44 7400 900123 from outside the US.");
}
```

INSERT binds `phoneE164` (the `phone || null` belt-and-braces stays);
`notifySignup` receives `phoneE164`.

## 3. Copy

- **index.html label/hint:** drop `<span class="field-optional">optional</span>`,
  add `required` to the input. Hint: "Adds texting to your household. Blue
  bubble on iPhone, a text everywhere else. Baxter won't start texting you
  until you text him." (drops only the leave-it-blank sentence).
- **signup.js lede:** "…tell us where Baxter should write to you, and the
  mobile number Baxter will text."
- **terms.html §4, first sentence:** "A mobile number on the signup form is
  required to set up your household, but starts nothing: give one and Baxter
  still won't message you until you text it first." Rest untouched
  ("consenting to messages is not a condition of signing up" stays true).
  Dates → 2026-08-15.
- **privacy.html §2:** "A mobile number is required to set up your household,
  but starts nothing: give us one on the signup form and Baxter still won't
  message you until you text it first — that message is your opt-in." (drops
  "optional" + "leave the field blank" sentences). Dates → 2026-08-15.
- **`TERMS_VERSION`** in join.js → `"2026-08-15"` (comment mandates bumping
  with terms).

## 4. Tests

- `tests/phone.test.js` (new): the truth table above — US default, formatted
  variants, `+` override, UK-without-plus invalid, stubs invalid, prose null,
  fictional-valid examples round-trip.
- `tests/join.test.js`: CLEAN fixture gains `phone: "415 555 0100"` → INSERT
  asserts `+14155550100` (pins canonical storage); new cases: missing phone →
  "Some details are missing." (no claim), `asdf` → "That number doesn't look
  right." (no claim, before invite UPDATE), `+44 7400 900123` → stored as-is.

## Deferred / non-goals

- Phone format validation on the waitlist form (it has no phone field).
- Country picker UI; `/max` metadata; carrier or line-type checks.
- Schema change — `phone` TEXT already stores E.164 fine; existing rows keep
  their legacy strings (operator provisioning normalizes or operator fixes by
  hand; no backfill in this change).
