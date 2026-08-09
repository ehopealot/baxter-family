# `baxter-family`: the bax.bot landing page

The marketing and signup page for **Baxter Family AI**, the hosted version of Baxter that
people reach by message. Static pages with no build step, plus a Worker in `/src`
backing the two forms with D1.

This is deliberately a separate site from [bax.bot](https://bax.bot). That one describes
the open-source project you self-host; this one is a consumer service with an account and
a phone number. Keeping them apart is not cosmetic — see *Why the split* below.

## Deploy

Hosted on **Cloudflare Pages**, which is where the DNS and email routing already live.

Deployed as a **Worker with static assets**, built from the linked GitHub repo —
pushing to `main` deploys. `wrangler deploy` from here does the same thing by hand.

Not Pages. Workers is where Cloudflare puts new work now, and it's the only one
of the two that serves static files and runs an API off one config.

`bax.bot` stays on GitHub Pages out of the `baxter-site` repo and is untouched by any of
this. GitHub Pages only allows one custom domain per repository, which is the reason this
subdomain isn't just another directory over there.

## Look at it

```bash
python3 -m http.server 8000   # then open http://localhost:8000
```

## The backend

Two forms, both posting to a Worker in `/src`, both writing to D1. The site is
static assets on the same Worker, so it all deploys together — one domain, no
CORS.

| Route | Does |
|---|---|
| `POST /api/waitlist` | homepage form → `waitlist` table → `/thanks` |
| `POST /api/join` | homepage invite form → `signups` table → `/welcome` |
| `GET /api/invite?code=` | tells `signup.js` whether a code is usable; rate limited |

`run_worker_first` in `wrangler.jsonc` is set to `/api/*`, so every other
request is served straight off the edge and never reaches Worker code.
`.assetsignore` keeps `wrangler.jsonc`, the schema, the tooling and the Worker
source from being uploaded as public files — without it the assets directory is
the repo root and all of that would be fetchable.

### Setup

```bash
wrangler d1 create baxter-family                              # paste the id into wrangler.jsonc
wrangler d1 execute baxter-family --remote --file=schema.sql
wrangler secret put TURNSTILE_SECRET
```

For local work, put `TURNSTILE_SECRET` in `.dev.vars` (gitignored) and run
`wrangler dev`. Cloudflare's always-passes test secret is
`1x0000000000000000000000000000000AA`. Add `--local` to the invite commands to
hit the local database rather than production.

### Operating it

Handing out invites and reading the submissions is its own job, and it has its
own runbook: **[OPERATIONS.md](OPERATIONS.md)**. The short version —

```bash
node tools/invite.mjs new --email sam@example.com --days 14   # personal, one use
node tools/invite.mjs new --open --label "Tilden card" --uses 50
node tools/invite.mjs list [--all]
node tools/invite.mjs revoke BAX-7K3M
```

Submissions are rows in D1; the dashboard's console renders any `SELECT` as a
table. Two rules from that document are worth repeating here, because breaking
either is quiet and hard to walk back:

- **Never `DELETE` a signup row.** Household names are taken permanently — a
  promise in `terms.html` §13, enforced by the `UNIQUE` index on
  `signups.household`. Deleting frees the name for somebody else. Set a status.
- **`TERMS_VERSION` in `src/api/join.js` must match the date on `terms.html`.**
  Two lines in two files, nothing to catch you if they drift, and a stored
  agreement is worth little without knowing which terms it was to.

`signup.js` gates the form, but it is **not** the security boundary — anyone can
POST straight at `/api/join`. That handler re-checks the code, verifies
Turnstile server-side, and claims the invite with the use limit in the `WHERE`
clause so two simultaneous posts can't both win. Nothing from the browser is
trusted.

## What the signup section still owes

`#signup` used to be carrier-vetting evidence: messages went out as A2P SMS, so
the page had to carry frequency, rates and STOP/HELP next to the point of
consent or the campaign got rejected. Messages now go over iMessage, so that
wall is gone and the section is one honest sentence instead.

Two things are still not optional, and neither is about carriers:

- **The messaging consent box is never pre-ticked, and is not required.**
  Delivery still falls back to a standard text for Android recipients, under
  carrier rules, so the safe posture is cheap to keep.
- **`privacy.html` §3 lists every field the forms collect.** Add a field, add it
  there. It currently covers name, household name, email and mobile number.

## Why the split

`bax.bot` says "self-hosted", "runs on your own machine", "no account to sign up for". All
true, and all of it reads to a carrier's vetter as a contradiction of an A2P campaign,
which asserts the opposite: a business texting consumers who signed up for it. Pointing
the campaign at a site with a real signup flow removes that contradiction.

For the same reason the legal pages live **here and only here**. "Multiple or inconsistent
privacy policies" is an explicit 30908 cause, so `privacy.html` and `terms.html` were
removed from the `bax.bot` repo when they moved. Don't re-add a second copy there.

## Keep it honest

The copy on this page makes claims about what Baxter Family AI does. When the service
changes, change the page — and check `#signup` and `privacy.html` still agree with each
other and with what's filed on the campaign.

`terms.html` §13 sets governing law to California. `privacy.html` carries the CalOPPA Do
Not Track disclosure in §9 and names the CCPA in §7 — if the operating entity ever moves
out of California, all three need revisiting together.
