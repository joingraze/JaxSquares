# Email notices

Players who open an invite in a browser and never install the app get no
notifications: iPhone web push needs the Home Screen app, and some browsers
have no push at all. Email notices fill that gap. They're **opt-in, per
board, never required**, and low volume on purpose.

Code: `worker/email/` (Worker), `shared/email.ts` (address rules both sides
share), `src/lib/emailNotices.ts` + `src/features/notifications/EmailOptIn.tsx`
(app). Tables: `migrations/0013_email.sql`.

## What a player sees

- **After claiming squares**, the notifications ask (`NotifyPrompt`, trigger
  `claimed`) offers email to a player push can't reach: "Get email instead"
  under the Home Screen guide (iPhone Safari tab) and the blocked fix, and an
  email-only ask in a browser with no push at all.
- **On the board**, players get a bell in the top bar (`board-notify`) that
  opens the board's notification settings (`BoardNotifySheet`): this device's
  mute switch when notifications are on here, and the email opt-in.
- The opt-in (`EmailOptIn`) reads "Email me when the numbers are drawn and if I
  win" (`EMAIL_OPT_IN`), with an email field (`type="email"`,
  `autocomplete="email"`, `inputmode="email"`, 16px so iOS doesn't zoom). Its
  states: none → pending ("Check your inbox", Send again, Change email,
  Remove this address) → confirmed ("Email is on", Turn off email, Change email);
  unsubscribed (from an email's link) shows the form again with a note.
- The address comes back only masked (`j•••@gmail.com`, `maskEmail`), only to
  the player who added it. The app never stores it.
- All of it is hidden unless the server has email set up
  (`AppConfig.emailEnabled` from `GET /api/config`).

## What gets emailed

Only once the address is confirmed, and each notice once per address
(claimed in D1 before it's sent, so racing events and host corrections can't
double it):

| Notice | When | Who | What it says |
|---|---|---|---|
| Confirm | on sign-up (and "Send again") | the address typed in | "Confirm your email for <board>", with the link (7 days) |
| Numbers drawn | `numbers-drawn` | confirmed players holding squares, not the host who drew | their squares and numbers (Q1's on a board with new numbers each quarter), a link to the board |
| You won | `winner` for Q1, Half or Q3, on a board where every score doesn't win | the winning players | "You won Q1!", the moment, the score, the host's prize note (quoted as a push quotes it) |
| Final results | `final` (or the Final's `winner` once the board is final) | every confirmed player | the final score, each moment's winners by name, what they won; on an every-score board how many scores each player won |

No email per score: an every-score board gets one summary at the end. Never
an amount, square price or "the rest" (like pushes; `templates.test.ts`
renders every template from boards with amounts set and scans them, and for
betting words). Notes are validated money-free when they're saved.

Every email has: the line "You're getting this because you asked for
JaxSquares email for <board>.", a one-click unsubscribe link, the
`List-Unsubscribe` and `List-Unsubscribe-Post: List-Unsubscribe=One-Click`
headers (RFC 8058, so Gmail and Apple Mail show their own Unsubscribe button),
a plain-text part, and the sender `EMAIL_FROM`. The HTML is a light,
table-based layout with inline CSS and Jax small (`/icons/icon-192.png`).

Sends ride the notify pipeline: `notifyAll` in `worker/service.ts` runs push
and `emailNotices(env, gameId, events)` side by side, inside `waitUntil` for a
request and in the room's alarm for live scores. Failures are logged (`email
<game> <kinds>: N sent, N failed`), never thrown.

## The model

`email_subscriptions` (owned by `worker/email/store.ts`):

| Column | |
|---|---|
| `id` | `es_<random>`, server-only |
| `game_id` | the board (`ON DELETE CASCADE`: deleting the board deletes its addresses) |
| `client_id` | the canonical clientId of the player who asked (`c.get("clientId")`, the account's when signed in); never leaves the server |
| `email` | normalized lowercase (`normalizeEmail`); blanked when it unsubscribes |
| `email_key` | the address's keyed hash (see Tokens) |
| `status` | `pending` → `confirmed`; `unsubscribed` from an email's link |
| `confirm_token_hash` | SHA-256 of the confirmation link's token; cleared once used |
| `confirm_sent_at` | the last confirmation email: the resend throttle and the 7-day expiry |
| `sent` | notices already sent (`numbers,q1,final,`) |
| `created_at`, `confirmed_at`, `updated_at` | |

`UNIQUE (game_id, client_id)`: one address per player per board (a new one
replaces it, back to pending). `UNIQUE (game_id, email_key)`: one pending
confirmation per address per board, and another player can't take an address
already used on the board (409).

`email_suppressions (email_key, created_at)`: addresses that chose
"Unsubscribe from all JaxSquares email". Only the keyed hash. A suppressed
address can't be signed up again (409), so it gets no confirmation email
either.

### Double opt-in

`POST /api/games/:id/email { email }` stores the address as `pending` and
sends "Confirm your email for <board>". Nothing else goes to it until its
owner opens the link and taps **Confirm my email**. The link's `GET` only
shows that button; the `POST` confirms. Mail scanners and link previews open
every link in an email, so a `GET` that confirmed would defeat the opt-in (the
same goes for unsubscribing). A link works once, for 7 days; "Send again"
replaces it.

### Tokens

- **Confirmation:** 32 random bytes (base64url) in the link; only
  `SHA-256("jaxsquares:email-confirm:" + token)` is stored. The table alone
  can't confirm anything.
- **Unsubscribe:** signed, not stored: `<game id>.<email key>.<HMAC-SHA-256>`
  under `EMAIL_TOKEN_SECRET`. Chosen over a random token per row because the
  link must keep working after the row is deleted (an address goes a week
  after the final, but "stop all email" from an old email must still land, and
  mail providers keep List-Unsubscribe URLs), it carries exactly what the
  suppression list needs, and D1 holds nothing that could be replayed as a
  link. Checked in constant time (`crypto.subtle.verify`).
- **Email key:** `HMAC-SHA-256(EMAIL_TOKEN_SECRET, "jaxsquares:email-key:" +
  address)`, 32 base64url chars. Addresses are easy to guess, so a plain hash
  in the suppression list or a link would confirm a guess; this can't be
  checked or reversed without the secret. The per-address rate limit uses it
  too, so `rate_limits` never holds an address.
- The cost of HMAC: **rotating `EMAIL_TOKEN_SECRET` breaks unsubscribe links
  already sent and resets the address keys** (the suppression list then stops
  matching). Rotate it only if it leaked.

### Unsubscribing

From any email: the link opens a page with **Unsubscribe from this board** and
**Unsubscribe from all JaxSquares email**; a mail app's one-click POST
(`List-Unsubscribe=One-Click`) unsubscribes this board. This board: its row
becomes `unsubscribed` and the address is blanked at once. All: every row for
the address, plus the suppression row. In the app, **Turn off email** /
**Remove** deletes the row (`DELETE /api/games/:id/email`, which works even
when email isn't set up). Someone who unsubscribed from everything and wants
email again writes to support (the owner deletes their `email_suppressions`
row).

### Retention

The address is kept only while it's needed (hourly housekeeping,
`pruneSubscriptions` from `worker/housekeeping.ts`):

- every row of a board 7 days after its final (`games.updated_at`, the last
  change, so never earlier than that),
- an unconfirmed address once its link expires (7 days after the last
  confirmation email),
- a board nobody has touched for 60 days whose kickoff isn't ahead (never
  finished),
- with the board when the host deletes it,
- the account's addresses when an account is deleted (nobody could manage
  them afterwards),
- at once (blanked) when it unsubscribes.

Suppression rows (a keyed hash, no address) are kept so "stop all" is honored.

### Sign-in merge

`email_subscriptions` is keyed by a clientId, so it joins the sign-in merge
(`mergeClientStatements` in `worker/email/store.ts`, run by `linkDevice` in the
same batch, docs/auth.md): a device's rows move to the account's canonical
clientId; where both have one on a board, the confirmed one stays (else the
account's). Suppressions are keyed by address, so nothing moves.

### Rate limits

`worker/rateLimit.ts`: `email` (20 per device per hour: adding, resending,
removing) and its twin `email-ip` (60 per network address per hour);
`email-send` (5 confirmation emails per address per hour, whoever asks, keyed
by the email key), plus at most one resend a minute per address
(`RESEND_GAP_MS`); `email-status` (120 reads per device per minute); and
`email-link-ip` (60 confirm/unsubscribe page loads per network address per
minute).

### API

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/api/games/:id/email` | – | `EmailNotices` `{ status: "none" \| "pending" \| "confirmed" \| "unsubscribed", email: masked \| null }` for the caller only |
| POST | `/api/games/:id/email` | `{ email }` or `{ resend: true }` | `EmailNotices` (pending). 400 bad address, 403 not on the board, 409 board over / address used on the board / suppressed / nothing to resend, 429 |
| DELETE | `/api/games/:id/email` | – | `{ status: "none", email: null }`: the row is deleted |
| GET / POST | `/api/email/confirm?token=` | – | HTML: asks / confirms; 400 page for a used or expired link |
| GET / POST | `/api/email/unsubscribe?token=` | form: `scope=board\|all`, or `List-Unsubscribe=One-Click` | HTML: asks / unsubscribes; 400 page for a bad token |

Board routes act as the canonical clientId and answer **503** "Email notices
aren't set up yet." until email is set up (DELETE always works). The pages
answer 503 too (unsubscribe needs only `EMAIL_TOKEN_SECRET`). Pages send
`referrer-policy: no-referrer`, `x-frame-options: DENY`, a CSP with no script,
and `noindex`.

### The sender

`worker/email/sender.ts` is provider-agnostic: an `EmailSender` takes
`OutgoingEmail`s. The one implementation is Resend's HTTPS API: one message
goes to `POST https://api.resend.com/emails`, a board's notice to several
players to `POST /emails/batch` (100 per request), each request with an
`Idempotency-Key` and one retry on a 429, a 5xx or a network error. Subjects
and header values are forced onto one line.

Cloudflare's `send_email` binding isn't used: it delivers only to addresses
verified in Email Routing, never to players. Nothing is added to
`wrangler.jsonc` for it; another provider only has to implement `EmailSender`.

## Owner setup

Email stays off (the opt-in hidden, the routes 503) until all three of
`RESEND_API_KEY`, `EMAIL_FROM` and `EMAIL_TOKEN_SECRET` are set.

### 0. Database

The deploy workflow applies migrations before deploying; by hand:

```bash
npx wrangler d1 migrations apply jaxsquares --remote   # applies 0013_email.sql
```

### 1. Resend account

1. Sign up at <https://resend.com>. Check the plan's daily and monthly limits
   against a busy Sunday (every confirmed player on every drawn board gets the
   numbers email around kickoff); the free plan's daily cap is small.
2. **Domains → Add domain**: `jaxsquares.com`, region nearest your players
   (us-east-1).

### 2. Verify the sending domain in Cloudflare DNS

Resend lists the records to add. In the Cloudflare dashboard → jaxsquares.com
→ **DNS → Records**, add each exactly as shown, **DNS only** (grey cloud):

| Type | Name | Content | Why |
|---|---|---|---|
| TXT | `resend._domainkey` | the `p=MIGf...` key Resend shows | DKIM: proves the mail is ours |
| MX | `send` | `feedback-smtp.us-east-1.amazonses.com`, priority 10 | bounces and complaints come back to Resend |
| TXT | `send` | `v=spf1 include:amazonses.com ~all` | SPF for the `send.` return path |
| TXT | `_dmarc` | `v=DMARC1; p=none; rua=mailto:dmarc@jaxsquares.com` | DMARC (start with `p=none`; tighten to `quarantine` once reports look clean) |

Don't touch an existing root SPF or MX record (Cloudflare Email Routing for
support@ keeps working: Resend's records live on the `send.` subdomain). Back
in Resend, **Verify DNS records**; it usually takes a few minutes.

### 3. Settings

```bash
npx wrangler secret put RESEND_API_KEY        # Resend → API Keys → Create (permission: Sending access, domain jaxsquares.com)
openssl rand -base64 48 | npx wrangler secret put EMAIL_TOKEN_SECRET   # once; don't rotate (see Tokens)
```

`EMAIL_FROM` is a plain setting in `wrangler.jsonc` → `vars`:

```jsonc
"EMAIL_FROM": "JaxSquares <notices@jaxsquares.com>"
```

(a bare `notices@jaxsquares.com` gets the name JaxSquares). Any address at
the verified domain works; nobody needs to read `notices@`. `APP_ORIGIN`
(already `https://jaxsquares.com`) is where the links point. Then
`npm run deploy`.

### 4. Check it

```bash
curl -s https://jaxsquares.com/api/config | jq .emailEnabled   # true
npx wrangler tail   # "email <game> numbers-drawn: 1 sent, 0 failed"; a failure logs Resend's reply
```

Then join a board in a browser, add your email from the board's bell, confirm
it, draw the numbers, and check the email (and its Unsubscribe button in
Gmail). Resend → **Emails** shows each send and its delivery.

### Local development

Put the three values in `.dev.vars` (see `.dev.vars.example`). With a real key
and a verified domain, local sends are real emails; without one the sends fail
and are logged, and the opt-in UI still works.

## Not covered by tests

Delivery through the real Resend API (the sandbox this was built in can't
reach it). The request shapes follow Resend's API reference; `sender.ts` is
tested against a mocked fetch.
