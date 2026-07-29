# `baxter-family`: the family.bax.bot landing page

The marketing and signup page for **Baxter Family AI**, the hosted version of Baxter that
people reach by text message. Static, no build step, no dependencies: `index.html`,
`privacy.html`, `terms.html`, and one `styles.css` shared between them.

This is deliberately a separate site from [bax.bot](https://bax.bot). That one describes
the open-source project you self-host; this one is a consumer service with an account and
a phone number. Keeping them apart is not cosmetic — see *Why the split* below.

## Deploy

Hosted on **Cloudflare Pages**, which is where the DNS and email routing already live.

1. Push this directory to a Git repo and connect it in *Cloudflare Dashboard → Workers &
   Pages → Create → Pages → Connect to Git*.
2. Build command: **none**. Build output directory: **`/`**.
3. *Custom domains → Set up a custom domain →* `family.bax.bot`. Cloudflare adds the CNAME
   for you since the zone is already there.

Direct upload (`npx wrangler pages deploy .`) also works if you'd rather not connect a repo.

`bax.bot` stays on GitHub Pages out of the `baxter-site` repo and is untouched by any of
this. GitHub Pages only allows one custom domain per repository, which is the reason this
subdomain isn't just another directory over there.

## Look at it

```bash
python3 -m http.server 8000   # then open http://localhost:8000
```

## The signup section is load-bearing

`#signup` in `index.html` is not ordinary marketing copy. It is the evidence a carrier
looks at when vetting the A2P campaign, and a campaign gets rejected — Twilio error
[30908](https://www.twilio.com/docs/api/errors/30908) — when it's missing or contradicts
the privacy policy. It has to keep showing, on this domain and next to the point of
consent:

- the program name (**Baxter Family AI**)
- what we send
- **message frequency varies**
- **message and data rates may apply**
- STOP / START / HELP
- links to both `privacy.html` and `terms.html`

The embedded Google Form must match it. The form needs a short-answer mobile number
question and a **Checkboxes question with a single option that is never pre-ticked and is
*not* marked Required**, whose text is the same consent sentence the page shows. The
"not required" part is counter-intuitive and it is the one carriers are strict about:
consent may not be a condition of submitting the form, and a required consent box is a
denial reason. Someone who submits without ticking it simply doesn't get texted.

The form must also be reachable **without a Google sign-in**. Turn off *Collect email
addresses* and *Limit to 1 response* in the form's settings — both put a login wall in
front of it, and a vetter who can't load the form treats the opt-in as missing.

If the page and the form drift apart, the vetter sees the inconsistency.

The form is wired up. Its embed URL is the `/viewform` path with `?embedded=true`, in two
places in `index.html` — the iframe and the fallback link. If the form is ever replaced,
change both.

`privacy.html` §3 must list every field the form collects. It currently covers name, email,
account name, and mobile number; if you add a question to the form, add it there too —
"policy lacks clear explanation of collected data" is a 30908 cause.

Keep a screenshot of the finished form. Campaign resubmission asks for opt-in evidence.

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
