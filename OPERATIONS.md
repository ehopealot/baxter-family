# Running Baxter Family AI

Day-to-day operations: handing out invites, and seeing who has signed up. Everything
lives in one D1 database called `baxter-family`, and there are exactly two ways to reach
it — `tools/invite.mjs` for invites, and SQL for everything else.

For what the site *is* and how it deploys, see [README.md](README.md).

## First, the one thing that will bite you

**Every command here talks to production unless you add `--local`.** That is deliberate —
the common case is real work on real data, so it shouldn't need a flag. But it means a
`--local` you meant to type and didn't will mint a live invite, and a `--local` you left in
by accident will query an empty sandbox and tell you nobody has signed up.

```bash
node tools/invite.mjs list            # production
node tools/invite.mjs list --local    # the throwaway copy in .wrangler/
```

The local database starts empty. Give it the schema before using it, and delete the whole
directory whenever you want a clean one:

```bash
npx wrangler d1 execute baxter-family --local --file=schema.sql
rm -rf .wrangler                      # resets the sandbox; production is untouched
```

Everything below assumes you're in the repo root and logged in (`npx wrangler login`).

---

## Invites

Nobody reaches the signup form without a code. Both kinds are rows in the `invites` table
and differ in one respect: whether the invite names a person.

|  | **Personal** | **Open** |
|---|---|---|
| Made with | `--email <address>` | `--open` |
| Who can use it | one named address | anyone holding the code |
| Email field on the form | filled in and locked | empty, they type it |
| Default uses | 1 | unlimited |
| For | a person you're inviting | QR cards, events, a note in a mailbox |

A personal invite is the stronger of the two. The form locks the email field to the
invited address, and `/api/join` **overrides whatever is submitted** with the invite's
address — so forwarding the link to a friend doesn't sign the friend up, it just fails
sideways into your invitee's row. An open code makes no such promise, which is the whole
point of it.

### Mint one

```bash
# Personal — one address, one use, expires in a fortnight
node tools/invite.mjs new --email sam@example.com --days 14

# Open — a code for a card, good for 50 signups, no expiry
node tools/invite.mjs new --open --label "Tilden steam trains card" --uses 50
```

```
  code:  BAX-9AXD
  kind:  personal (sam@example.com)
  uses:  1
  until: 2026-08-20

https://bax.bot/?code=BAX-9AXD
```

The summary goes to stderr and **the link alone goes to stdout**, so it pipes cleanly:

```bash
node tools/invite.mjs new --email sam@example.com | pbcopy
node tools/invite.mjs new --open --label "Farmers market" --uses 100 \
  | qrencode -o card.png -s 8          # brew install qrencode
```

| Flag | Means | Default |
|---|---|---|
| `--email <address>` | personal invite for that address | — |
| `--open` | shareable code, names nobody | — |
| `--label "<text>"` | your own note; shows in `list` where the email would be | none |
| `--uses <n>` | how many signups it's good for | `1` personal, unlimited open |
| `--days <n>` | expires this many days out | never |
| `--local` | the sandbox instead of production | off |

Codes look like `BAX-7K3M`: four characters from a Crockford-ish alphabet with no I, L, O
or U in it, so nothing is ambiguous read off a card or dictated over the phone, and a code
can't accidentally spell something. The signup form prefills the `BAX-` part so only those
four characters get typed, and it maps a typed I or L to 1 and O to 0. The whole URL is 34
characters, which scans at very low QR density: big, chunky squares that survive being
printed small.

**That is 32^4, about 1.05 million codes, which is small enough to guess at.** See
[Rate-limit the code check](#rate-limit-the-code-check) before handing out many.

### See what's out there

```bash
node tools/invite.mjs list          # live codes only — what's still usable
node tools/invite.mjs list --all    # plus spent, expired and revoked
```

```
  CODE           KIND      WHO                  USED  EXPIRES              STATUS
  ─────────────  ────────  ───────────────────  ────  ───────────────────  ───────
  BAX-ZN5P  personal  jo@example.com       0/1   never                live
  BAX-4HE8  open      Farmers market card  0/25  never                live
  BAX-SWK6  open      Tilden card          3/50  never                revoked
  BAX-9AXD  personal  sam@example.com      1/1   2026-08-20 14:32:58  spent
```

`--all` is the one to reach for when somebody says their link doesn't work: `status` tells
you which of the four reasons it is, and they're distinguishable — `spent` means it worked
and somebody used it, `revoked` means you turned it off, `expired` means you gave it a
`--days` that has passed. A code that doesn't appear at all was mistyped.

### Rate-limit the code check

Four characters is 1.05 million possibilities, and `GET /api/invite?code=` will tell anyone
who asks whether a guess is good. What matters is not the size of the space but how densely
you fill it: with 100 live codes out there, roughly 1 guess in 10,000 lands, which is
minutes of scripted traffic, not years.

That is survivable because a found code only opens a signup form, is use-limited, and can be
revoked. It is not survivable if nobody is watching. Before handing out many codes:

- **Done in the Worker.** `/api/invite` is throttled to 4 requests a minute per IP by the
  `ratelimits` binding in `wrangler.jsonc`; over that it answers `429` with a message the
  form shows. Far above anyone typing a code off a card, far below a scan. Note it is
  per-colo rather than global, so it raises the cost of a distributed attempt rather than
  stopping one.
- Keep `--uses` tight. An open code with `--uses 50` is 50 free accounts if it leaks; the
  same code with `--uses 5` is five.
- Watch `list --all` for codes going `spent` faster than you handed them out. That is the
  signal, and revoking is instant.

The other half of this is that `/api/join` verifies Turnstile **before** it looks at the
code, so a guessed code still cannot become an account without solving a challenge. The
oracle leaks which codes exist; the challenge is what makes each one expensive to use. The
code check itself carries no Turnstile, on purpose — it is the first thing a visitor
touches and the rate limit does that job more cheaply.

Going back to eight characters removes the problem outright, at the cost of four more
characters to read off a card.

### Turn one off

```bash
node tools/invite.mjs revoke BAX-7K3M
```

Immediate, and it reports honestly — an unknown code says so and exits non-zero rather than
cheerfully claiming success. Revoking doesn't undo signups that already came through it;
it only stops further use.

### Why codes are rows and not signed tokens

An earlier version signed a payload into the URL and verified it in the browser with a
public key. Rows won because a signed token can't be revoked without a server keeping a
list anyway, can't be counted or use-limited, and has to carry its whole payload in the
URL — which makes for a dense QR that a phone camera has to work at. A row can be revoked
instantly, tells you how often it was used, and needs only a short code in the link.

### `signup.js` is not the security boundary

The page checks the code to decide what to show. Anyone can skip the page and POST at
`/api/join` directly, so that handler re-checks everything from scratch: the code, the
Turnstile token server-side, the terms box, the household name format. It also claims the
invite **before** inserting, with the use limit inside the `WHERE` clause, so two people
racing on a single-use code can't both win.

Nothing from the browser is trusted. If you add a field to the form, add its validation
there — not in `signup.js`.

---

## Signups and the waiting list

Two tables. `waitlist` is the homepage form — name and email, no invite needed. `signups`
is the invite-gated form on the homepage, and it's the one that matters.

### In the dashboard

D1's console renders any `SELECT` as a table, which is the tabular view:

**Cloudflare dashboard → Storage & Databases → D1 → `baxter-family` → Console**

Paste any query below into it. Good for a look; the CLI is better for anything you want to
keep or pipe somewhere.

### From the CLI

Remember `--remote`, or you're querying the empty sandbox:

```bash
# Everyone who has signed up, newest first
npx wrangler d1 execute baxter-family --remote --command "
  SELECT datetime(created_at,'unixepoch','localtime') AS when_,
         name, nickname, household, email, phone,
         CASE WHEN consent THEN 'yes' ELSE '' END AS texts,
         status
  FROM signups ORDER BY created_at DESC"

# The waiting list from the homepage
npx wrangler d1 execute baxter-family --remote --command "
  SELECT datetime(created_at,'unixepoch','localtime') AS when_, name, email, status
  FROM waitlist ORDER BY created_at DESC"
```

### Queries worth keeping

**Which invite did each person come in on** — the one to run when you want to know whether
the cards are working or it's all word of mouth:

```sql
SELECT datetime(s.created_at,'unixepoch','localtime') AS when_,
       s.name, s.household, s.email,
       i.kind, COALESCE(i.label, i.email, '') AS invite_was
FROM signups s LEFT JOIN invites i ON i.code = s.invite_code
ORDER BY s.created_at DESC;
```

**How each code is performing** — how many of the uses you handed out came back:

```sql
SELECT i.code, i.kind, COALESCE(i.label, i.email, '') AS who,
       i.used_count, COALESCE(i.max_uses, '∞') AS of_,
       COUNT(s.id) AS signups
FROM invites i LEFT JOIN signups s ON s.invite_code = i.code
GROUP BY i.code ORDER BY signups DESC, i.created_at DESC;
```

**Who said yes to messaging** — for when you start actually texting people. `consent` is
optional on the form and never pre-ticked, so this is a real subset, not everyone:

```sql
SELECT name, household, email, phone
FROM signups WHERE consent = 1 AND phone IS NOT NULL AND status = 'active';
```

**What's waiting to be provisioned:**

```sql
SELECT id, household, email FROM signups WHERE status = 'new' ORDER BY created_at;
```

### Statuses

`signups.status` starts at `new` and nothing reads it yet. It's the seam for provisioning
later — a cron Worker or a Queue consumer picks up `WHERE status = 'new'`, does the work,
and moves the row on, without this schema changing. Move one by hand meanwhile:

```sql
UPDATE signups SET status = 'active' WHERE household = 'andersons';
```

The intended path is `new → provisioning → active`. Nothing enforces it.

### Never delete a signup row

Household names are taken permanently — that's a promise in `terms.html` §13, and the
mechanism enforcing it is the `UNIQUE` index on `signups.household`. Deleting a row frees
the name for the next person, which quietly breaks the promise and hands someone else an
address that used to receive another household's mail.

When a household closes, set a status. Never `DELETE`.

### `terms_version`

Every signup stores the terms version the person agreed to, alongside the fact that they
did. "They accepted the terms" is worth very little without "which ones" — the version is
what makes the record mean something if it's ever questioned.

It's a constant in `src/api/join.js`, matching the effective date printed on `terms.html`:

```js
const TERMS_VERSION = "2026-08-04";
```

**Change the terms, change both together.** They're two lines in two files and there is
nothing to catch you if they drift.

---

## When something goes wrong

**"My link says it's already been used, but I never got through."**
Rare, and it means a use was burnt without a signup landing. `/api/join` hands the use back
if the insert fails, but a crash in between would leave it spent. Check, then hand it back:

```sql
SELECT * FROM signups WHERE invite_code = 'BAX-7K3M';   -- nothing? then it burnt
UPDATE invites SET used_count = used_count - 1 WHERE code = 'BAX-7K3M';
```

**"That household name is taken."**
It is, and permanently — see above. They pick another. If it's genuinely their own from a
previous signup, find the old row and decide what to do with it deliberately.

**A form stops working entirely.**
Almost always Turnstile. `TURNSTILE_SECRET` is a Worker secret in production and lives in
`.dev.vars` locally; if it's missing, `turnstileOk()` fails closed and every submission is
rejected as non-human. Check `npx wrangler secret list`, and watch a request go through
with `npx wrangler tail`.

**Testing the whole flow locally.**
`npx wrangler dev`, with Cloudflare's always-passes test secret in `.dev.vars`:

```
TURNSTILE_SECRET=1x0000000000000000000000000000000AA
```

Then mint an invite with `--local`, and open the printed URL against localhost.

---

## What isn't built yet

- **Nothing emails the invitee.** `new` prints a link; sending it is you, by hand.
  The wording is written and waiting in [emails/](emails/) — an invite mail and a
  welcome-from-Baxter mail, each in HTML and plain text. `node emails/preview.mjs
  --open` shows you what they look like.
- **Nothing provisions anything.** `status` is a column that stays at `new` until you move
  it. The Worker writes rows and that's all.
- **No admin page.** The D1 console and this file are the interface, on purpose — an admin
  page is an authentication problem, and there's one operator.
