# Email templates

Two emails, each in HTML and plain text.

| | Sent when | From | File |
|---|---|---|---|
| **Invite** | they've asked for access on the landing page and you've minted them a code | you | `invite.html` · `invite.txt` |
| **Welcome** | their household has been provisioned | Baxter | `welcome.html` · `welcome.txt` |

Nothing sends these yet — `tools/invite.mjs` prints a link and stops there. These
are templates for whatever ends up doing the sending.

## Testing them

Three levels, cheapest first. The first two take seconds and catch most mistakes;
only the third tells you what people will actually see.

**1. In a browser** — typos, wrapping, unfilled tokens.

```bash
node emails/preview.mjs --open
node emails/preview.mjs --var household=jonesfamily     # try a longer name
```

Output lands in `emails/.preview/` (gitignored), and it exits non-zero on a token
with no sample value. Be clear about what this *doesn't* prove: a browser is a far
more capable renderer than any email client, so it will happily show you things
Outlook will never render. Passing here means the copy is right, not that the email
works.

**2. In a real inbox** — the only test that counts.

```bash
export RESEND_API_KEY=re_...            # or put it in .dev.vars
node emails/send.mjs welcome --to you@gmail.com
node emails/send.mjs invite  --to you@icloud.com --var name=Erik
```

Sends both the HTML and text parts, pulling the subject from the first line of the
`.txt` file. It refuses to send with an unfilled token anywhere, and separately
refuses if one is inside an `href` — a gap in the copy is embarrassing, a gap in a
link is a broken invite.

Resend needs no domain setup to start: without a verified domain it sends from its
own onboarding address to the address you signed up with, which is enough to test.
Verify `bax.bot` when you want a real `From:`. Repointing at Postmark, SES or
anything else is a change to `deliver()` in `send.mjs` and nothing else.

**3. Across clients you don't own.** Send to accounts on Gmail (web *and* the
Android app — they render differently), iCloud, and Outlook.com. That covers most
of the ways an email can break. For a screenshot matrix across dozens of clients at
once, Litmus and Email on Acid both do it; for two templates, one month of either
is enough, and it isn't an ongoing cost.

Worth also running one send through [mail-tester.com](https://www.mail-tester.com) —
it scores SPF, DKIM, DMARC and content, and a deliverability problem loses you more
invites than any rendering bug will.

### What to look for

- **Gmail** clips messages over ~102KB and hides everything after it behind a
  "view entire message" link. These are 11KB and 15KB, so there's plenty of room.
- **Gmail on Android** force-inverts colours in dark mode regardless of what the
  CSS asks for. Check the cream areas still read.
- **Outlook** is the harsh one, and only on Windows — classic Outlook renders with
  Word, which ignores padding on inline elements, flattens `border-radius`, and
  drops `box-shadow`. The templates are built around all three. Outlook for Mac and
  the newer Windows Outlook use a browser engine and behave.
- **Apple Mail** turns phone numbers and dates into links of its own and restyles
  them blue. There's a rule in each `<style>` block that undoes it; the welcome
  mail's phone number is where you'd notice if it stopped working.

## Tokens

Both files of a pair use the same tokens, so filling one fills the other. Sample
values for previewing and test sends live in `sample.mjs` — one copy, so a preview
and a test send can't disagree about what they're showing you.

| Token | Example | Notes |
|---|---|---|
| `{{name}}` | `Sam` | `signups.name`, or `waitlist.name` for the invite |
| `{{household}}` | `andersons` | `signups.household`. Also forms the address |
| `{{invite_url}}` | `https://bax.bot/?code=BAX-7K3M` | exactly what `invite.mjs new` prints |
| `{{expires_sentence}}` | `It's good for the next 14 days.` | **invite only.** A whole sentence, not a date — delete the token *and* the space before it when you mint without `--days` |
| `{{sender_name}}` | `Erik` | **invite only.** Signs the invite; the welcome is signed by Baxter |
| `{{assistant_phone}}` | `(510) 555-0123` | **welcome only.** Formatted for reading |
| `{{assistant_phone_e164}}` | `+15105550123` | **welcome only.** Same number, for the `sms:` link |
| `{{home_url}}` | `https://home.bax.bot` | **welcome only** |

Both phone tokens are the same number in two formats, because the one a person
reads and the one a `sms:` link needs are not interchangeable. Fill both.

## Sending

Whatever you use, three things matter:

1. **Send `multipart/alternative`** — the HTML *and* the `.txt`, not the HTML alone.
   Some clients want text, some people prefer it, and a text part is one of the
   cheap signals that separates real mail from bulk.
2. **Don't let the sender rewrite links.** Click tracking replaces `{{invite_url}}`
   with a redirect through the sender's domain, which turns a clean invite into
   something that reads like phishing. Turn it off.
3. **The welcome mail's `From:` should be Baxter, at the household's own address**
   — `Baxter <{{household}}@assistant.bax.bot>` — so replying to it goes to Baxter
   and works. The email tells people they can write to that address; the `From:`
   line should agree.

The invite is transactional and needs no unsubscribe link. If either ever carries
anything promotional, CAN-SPAM wants a physical postal address and a working
unsubscribe in the footer, and neither has one today.

## Subject lines

| | Using | Alternatives |
|---|---|---|
| Invite | `Your invite to Baxter` | `You're in — here's your Baxter invite` · `Baxter's ready when you are` |
| Welcome | `I'm all set up` | `Hello from Baxter` · `Ready when you are` |

The welcome subject is first person on purpose — it's the first thing Baxter ever
says, and it should sound like Baxter rather than like a system notification.

Each HTML file also carries a **preview line** — hidden text that becomes the grey
snippet next to the subject in an inbox list. It's the second-most-read line in the
email and it's easy to forget it exists. The invite's is *"One link, and you're set
up in about a minute."*; the welcome's is *"Save my number, and say hello whenever
you like."* Both are near the top of the file, right after `<body>`.

## Why they don't look alike

The invite is from the company: a card, a masthead, a button, brand chrome.

The welcome is from Baxter, and it's deliberately plainer — no card, no band, no
enclosing box. A heavily designed email undercuts the premise that an assistant
just wrote to you; the more it looks like a newsletter, the less it sounds like a
person. The only two elements given any weight are the two a reader actually needs:
how to reach Baxter, and what to say first.

The example phrases are set as blue sent-message bubbles, the same blue as the demo
on the landing page. Showing what you'd type teaches it faster than describing it,
and it picks up the one visual idea the landing page already put in their head.

## Editing them

They're hand-written table layouts with inline styles, which is what email needs —
there's no build step and no framework. If you change one, the rules that bite:

- **Every style that matters must be inline.** The `<style>` block at the top is
  progressive enhancement only; Gmail drops it in the clipped-message view, and
  several desktop clients never read it.
- **Padding goes on the `<td>`, never on an `<a>` or a `<p>`.** Outlook's rendering
  engine is Word, and it ignores padding on inline elements. This is why every
  button here is a one-cell table.
- **No images.** Nothing to host, nothing to block, and no broken-image state when
  a client blocks remote content by default. The "B" badge is a coloured table cell
  with a letter in it.
- **Keep `mso-line-height-rule:exactly`** next to `line-height`, or Outlook
  substitutes its own leading and the vertical rhythm falls apart.
- **Colours are the site's tokens**, copied out of `styles.css` as literal hex.
  Custom properties don't work in email. If the palette changes there, it changes
  here by hand.

The site's hard offset shadow on buttons (`box-shadow: 3px 3px 0`) doesn't survive
any email client, so it's approximated with heavy right and bottom borders. It
reads as the same idea and renders everywhere, Outlook included.

Test in Gmail (web and Android), Apple Mail, iOS Mail and Outlook before a real
send. Those five cover almost everything and disagree with each other the most.
