# Signup SMS consent: checkbox → text-first opt-in

Date: 2026-08-14 · Status: approved design (operator: "A" for legal-copy-in-scope, "okok" on design)

## Problem

The invite-gated signup form carries an optional "Message me at the number above"
consent checkbox. It's redundant friction: Baxter never texts first — a user's
first inbound text is the natural, stronger opt-in event. Keep the phone field
optional; drop the checkbox; explain the text-first behavior under the field.

## Design

New consent model, stated once everywhere: **giving a number on signup starts
nothing; messaging Baxter is the opt-in.**

### 1. index.html

- Delete the `join-consent` `<div class="consent">` block (checkbox + label).
  The terms checkbox remains the only checkbox on the form.
- Phone hint becomes: "Adds texting to your household. Blue bubble on iPhone, a
  text everywhere else. Baxter won't start texting you until you text him.
  Leave it blank and Baxter works over email." (Him/her/it inconsistency noted
  at review; kept "him" per operator's phrasing.)
- Rewrite the code comment above the form that narrates the two-checkbox
  design.

### 2. src/api/join.js

- Stop reading `consent` from the form; drop it from the INSERT and let the
  schema's `DEFAULT 0` fill new rows. Rationale: under the new model the opt-in
  event is the first inbound message, not form submission — writing `1` for
  number entry would overstate consent. No migration; historical rows keep
  their values.

### 3. Legal copy

- `terms.html` §4 Messaging: replace the "two separate boxes" paragraph with
  the text-first story (number optional, starts nothing; messaging Baxter is
  consent to receive messages at that number). Waiting-list sentence, "own or
  be authorized to use the number", iMessage/standard-text and STOP/START/HELP
  paragraphs survive unchanged. Bump Effective + Last updated to 2026-08-14.
- `privacy.html` §2: replace the "tick the consent box" sentence (number
  optional; Baxter messages you only after you text it — your message is your
  opt-in). Retention "opt-in/opt-out record" language stays accurate: the
  opt-in is evidenced by the retained inbound message. Bump date header to
  2026-08-14.
- `src/api/join.js` `TERMS_VERSION` bumped to "2026-08-14" in lockstep with
  terms.html's new effective date (per that constant's own comment).

### 4. Ops & docs

- `OPERATIONS.md`: everyday signups query's `texts` column replaced with
  `phone IS NOT NULL` signal; "Who said yes to messaging" query becomes "Who
  gave a phone number" (who to expect a first text from), noting the legacy
  `consent` column's meaning.
- `README.md`: replace the "never pre-ticked" bullet with the new posture
  (checkbox gone; text-first opt-in; safe posture now stated in the field hint
  and terms).
- `styles.css`: remove the unused `.consent-optional` rule; keep `.consent`
  (terms box uses it).
- `schema.sql`: `consent` column kept, comment marked legacy.

### Explicitly not changing

Schema/migrations, `signup.js`, `src/notify.js`, welcome/thanks pages, waiting
list. No consent references exist outside the files above.

## Open items

None. Date headers default to 2026-08-14 (operator didn't override).
