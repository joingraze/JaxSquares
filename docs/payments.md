# Payments

The only money in JaxSquares is what the **host** pays JaxSquares for running
boards (see "Pricing"): per game, the **host fee** for a board, when they draw
its numbers, plus the **Venue add-on** on a venue board; or the yearly
**Annual Pass**, which covers the host fee on every board they host (see
"Annual Pass" below), and with the Venue add-on (the web-only **Annual Pass +
Venue**, see "Annual Pass + Venue") venue boards and the venue features too.
Setting up a board, inviting friends and picking squares are free, and so is
drawing a **small board**: one whose squares 5 or fewer players hold (see "The
free tier" below). Nothing ever moves between players. JaxSquares never sells
squares; the fee is for creating and managing the board.

## Pricing

Two products, each with a Venue add-on (`shared/pricing.ts`, the one place
the Worker and the app decide what a board costs: `feeDue`, `coversBoard`):

| | On its own | With the Venue add-on | Where it's set |
|---|---|---|---|
| **Per game**: one board, paid when its numbers are drawn | $4.99 | $14.99 ($4.99 + $10) | `BOARD_PRICE_CENTS` (499) and `VENUE_PRICE_CENTS` (1000) on the web; the board's App Store product in the iOS app (no Venue add-on there) |
| **Annual Pass**: every board the host hosts, for a year from the day it's bought, renewing until canceled | $19.99 a year | $99.99 a year (+$80) | `HOST_PASS_PRICE_CENTS` (1999) and the App Store subscription; with the Venue add-on `CLUB_PASS_PRICE_CENTS` (9999), web only |
| A board held by 5 or fewer players | Free | Free | `FREE_PLAYER_LIMIT` (`shared/hostFee.ts`) |

- A **venue board** (`format.venue`, venue mode: docs/ARCHITECTURE.md "Venue
  boards") adds the Venue add-on to its host fee. It brings the venue's staff
  features on that board from the start (up to 10 co-hosts, the players list:
  `hasVenueFeatures`); the add-on is due with the host fee at the draw, like
  the fee itself. Venue mode can't change once the board is paid for or drawn
  (409 `VENUE_LOCKED_ERROR`), so what was charged stays what the board is.
- The **Annual Pass** covers every board's host fee. With the Venue add-on
  (`plan` 'club') it covers venue boards' add-on too, and adds the venue's
  name and logo on every board its holder hosts and the venue TV link (see
  "Annual Pass + Venue"). An Annual Pass without it leaves a venue board's
  $10 add-on to pay at that board's draw.
- A **season board** runs all season, so it comes with the Annual Pass: no
  per-game fee. Its draw answers 402 `PASS_REQUIRED_CODE` without a pass
  (unless 5 or fewer players hold its squares), and the checkout sheet offers
  only the pass.
- What a board costs is computed when it's charged, from the passes of
  whoever pays (the host or a co-host) and of the board's host: the draw,
  `/pay/*` and a linked board's kickoff all use `feeDue`.

| | Stripe | Where |
|---|---|---|
| Per game (host fee, Venue add-on) | A PaymentIntent for the amount due, no Product or Price: description "JaxSquares host fee (one board)", "… + Venue add-on (one board)" or "JaxSquares Venue add-on (one board)"; metadata `product=board`, `game_id` | `/pay/stripe` |
| Annual Pass | Subscription to `STRIPE_HOST_PASS_PRICE_ID` | Product "Annual Pass", $19.99/year |
| Annual Pass + Venue | Subscription to `STRIPE_CLUB_PASS_PRICE_ID` | Product "Annual Pass + Venue", $99.99/year |

A holder of a web Annual Pass adds the Venue add-on to the same subscription
(`POST /api/payments/pass/stripe/venue`: its item moves to the Annual Pass +
Venue Price, `proration_behavior=always_invoice`, so what's left of this
year's $80 is charged now to the card it renews on; `error_if_incomplete`, so
a refused card changes nothing). They're never sold a second subscription:
`POST /api/payments/pass/stripe` with `plan: "club"` answers 409
`UPGRADE_PASS_CODE` for them.

| Where the host is | How they pay | Server check |
|---|---|---|
| Web (any browser) | Apple Pay or Google Pay in one tap, with a card form if the device has no wallet (Stripe) | Stripe webhook, plus a direct PaymentIntent check |
| iOS app | Apple In-App Purchase (a consumable product) | App Store Server API |
| Anywhere, while `PAYMENTS_MODE` isn't `live` | No-charge test checkout | None |

**Why there are two payment methods:** App Store Review Guideline 3.1.1 says that
anything unlocked inside an iOS app, including digital content and features, has
to be bought with In-App Purchase. Drawing a board's numbers counts as a digital
unlock, so the iOS app uses IAP and never shows Stripe. Don't show the web price
or link to the web checkout from inside the iOS app: the app shows the App
Store's localized price (`hostFeePrice` / `useHostFee`), and the Terms and
Support pages leave out Stripe and the web price there too.

## How it works

1. **Create (free).** `POST /api/games` makes the board `open` right away
   (`paymentRequired` is always `false`), with `Game.paid` = `false`. Friends
   join and pick squares; nothing is charged.
2. **Draw = pay, for a board of 6 or more.** `POST /api/games/:id/lock` on a
   board whose fee isn't paid draws it for free when 5 or fewer players hold
   its squares (below). Otherwise, unless an Annual Pass covers it, it answers
   **402** `{ error: "Draw the numbers once the board's paid for.", code:
   "payment_required" }` (`PAYMENT_REQUIRED_CODE` in `shared/types.ts`). The
   host's "Draw the numbers · $4.99" opens the checkout sheet first; once a
   `/pay/*` call (or the Stripe webhook) records the fee, the app calls `/lock`
   again and plays the number reveal. Only the host (the board's admin token)
   or one of its co-hosts (by canonical clientId; docs/ARCHITECTURE.md
   "Co-hosts") can pay or draw. A co-host's app tries the draw first, since
   the host's Annual Pass may cover it, and opens the same checkout on the 402.
3. **Paid.** A purchase is tied to its board when the host pays (not when the
   board was made). The ledger (`purchases`, below) decides which purchase pays
   for a board, and `markPaid` (`worker/service.ts` → `worker/db.ts`) stamps
   `games.paid_at` with it, together with `payment_provider`,
   `payment_reference` and `payment_amount_cents`. Paying never draws by
   itself. `db.lockGame` also refuses an unpaid board in SQL, so a race can't
   draw one.

### The free tier

A board whose squares are held by **5 or fewer distinct players** when the
numbers are drawn costs nothing to draw (`FREE_PLAYER_LIMIT` and the pure
`isFreeDraw(state)` in `shared/hostFee.ts`, used by the Worker and the app
alike). Only players holding at least one square count: someone who joined
and picked nothing doesn't, and the host counts like anyone else once they
hold a square. Nobody can add squares for someone else (`POST /claim` only
ever claims for the caller's own identity), and the sign-in merge can only
lower the count (two devices of one account become one player).

- **The draw.** `POST /lock` on an unpaid free board marks it paid with
  `payment_provider` **`free`**, `payment_reference` `free` and
  `payment_amount_cents` 0, in the same batch as the draw, before it looks
  for an Annual Pass or answers 402. No `purchases` row is written: nothing was
  charged. A pass holder's small board is drawn free too (not through the
  pass). Once drawn it reads `Game.paid: true` like any drawn board.
- **Race-safe.** The route decides from the board it read, but the mark
  (`db.markFreeDraw`) counts the holders again inside its own `UPDATE`
  (`... AND (SELECT COUNT(DISTINCT client_id) FROM squares WHERE game_id = ?) <= 5`),
  and `db.lockGame` only locks a board whose `paid_at` is set. D1 runs each
  batch as one transaction, one at a time, so a 6th player's claim either
  commits first (then the count sees 6, the mark changes nothing and neither
  does the lock) or commits after (then `claimSquares`, which re-checks
  `status = 'open'` in SQL, finds the board locked and inserts nothing). When
  the mark loses that race, the route decides once more with the board its
  batch read back (6 or more holders): the host's Annual Pass, or the 402. The
  app then opens the checkout as for any 402.
- **Kickoff.** A free linked board draws itself at kickoff like a paid one
  (`applyLiveUpdate`): the mark and the lock go in a batch of their own, with
  the same SQL count, before the live score's writes, so the scores always go
  against numbers that were really drawn. If a 6th player won that race, the
  board is decided again with them counted (the pass, or it waits for the
  host).
- **Pushes.** A free board gets no "kickoff soon" reminder (`claimDrawReminders`
  leaves it out in SQL and doesn't stamp it, so it's reminded if it grows past
  5 before kickoff; `notify` checks again), and its "board full" push says
  "Draw numbers now, or they'll draw at kickoff", never "pay".
- **The app.** The host bar, the Now card and the lock confirm read "Draw the
  numbers · Free" with "Free for up to 5 players" (`host-free-note`), no
  price, no pay-ahead; drawing just draws (a 402 meanwhile opens the
  checkout). The pre-draw hint says "Boards with up to 5 players are free.",
  and on a bigger board the lock confirm adds "This one has 7." Home's full
  linked board says "numbers drawn at kickoff" when `GameSummary.freeDraw`.

**Grandfathered boards.** Migration `0009_pay_at_draw.sql` adds `games.paid_at`
and stamps every board past `draft` as paid (they were paid for under the old
pay-to-open flow, or opened before payments existed). Drafts that never paid
are opened and pay at the draw like a new board; a draft the ledger shows as
already paid (charged, but the old opening step never ran) counts as paid.
Hourly housekeeping (`settleLegacyBoards`) catches boards the previous Worker
made or opened between the migration and the deploy (CI applies migrations just
before it deploys): a payment-opened board counts as paid, a draft opens.
`draft` stays in the status type and the CHECK constraint for that old data
only.

**Linked boards** (tied to an ESPN game) draw their own numbers at kickoff only
once the fee is paid, the board is free (5 or fewer players) or an Annual Pass
covers it (`applyLiveUpdate`, `worker/service.ts`). The host of a bigger board can pay
ahead ("Pay now and Jax draws the numbers at kickoff", `purpose="ahead"` on the
checkout sheet), and then Jax draws at kickoff unless the host draws first. An
unpaid linked board stays `open` at kickoff: the feed keeps recording the live
score and period scores, squares stay open, players see "Waiting on the host
to draw the numbers", and the host can pay and draw any time. If the game is
already over when they do, the draw also ends the board (`final`), with one
"that's a wrap" push.

**Reminders** (host-only pushes, never an amount; `worker/push/copy.ts`):

- *Board full* (once per board): on an unpaid linked board of 6 or more
  players, "Draw the numbers now, or pay ahead and Jax draws them at kickoff."
  (A free board, or one an Annual Pass covers: "Draw numbers now, or they'll draw
  at kickoff.")
- *Kickoff soon* (`draw-reminder`): the cron (every minute) claims linked boards
  that kick off within the hour, are still `open` with the fee unpaid, are held
  by more than 5 players, were made at least 15 minutes ago and weren't
  reminded yet (`games.draw_reminder_at`, `db.claimDrawReminders`), and tells
  their host "Kickoff in about an hour. Draw the numbers now, or pay ahead and
  Jax draws them at kickoff."
- *Kickoff* on an undrawn board: the host hears "Draw the numbers to get your
  board going", everyone else "Waiting on the host to draw the numbers".

### Season boards

A season board (docs/ARCHITECTURE.md "Season boards") comes with the Annual
Pass: there's no per-game fee for it (see "Pricing").

- `POST /api/games/:id/lock` on the season board draws free with 5 or fewer
  players holding its squares (the free tier counts the season board's
  players), through an active Annual Pass (provider `pass`), and otherwise
  answers 402 `{ error: SEASON_NEEDS_PASS, code: PASS_REQUIRED_CODE }`. A
  venue's season board with an Annual Pass that lacks the Venue add-on pays
  the $10 add-on once, at its draw.
- `/pay/test`, `/pay/stripe` and `/pay/iap` answer the same 402 for a season
  board without a pass: nothing per game is sold for it. The app's checkout
  sheet shows only the pass there ("Season boards come with the Annual
  Pass"), and Review in the create flow says so (`createFeeLine`).
- Until 2026-10 a season board paid one $14.99 fee (`SEASON_BOARD_PRICE_CENTS`,
  an App Store consumable `com.jaxsquares.app.seasonboard`); those settings
  are gone, and season boards already paid stay paid.
- Each game's own board is made at the draw (and by the cron as games join the
  schedule) already paid through its season: `payment_provider` `season`
  (`SEASON_PROVIDER`), `payment_reference` the season board's id,
  `payment_amount_cents` 0. A game's board never asks for a fee, never has a
  `purchases` row, and the cron never sends it a draw reminder.
- Single boards' prices and copy are unchanged.

## Setup checklist

Do these steps in order. Payments stay in test mode until step 4.

### 1. Price

- `BOARD_PRICE_CENTS` in `wrangler.jsonc` → `vars` sets the host fee. It's
  `499` ($4.99) today. Values below 50 (Stripe's minimum) or values that
  aren't whole numbers fall back to 499. `VENUE_PRICE_CENTS` (`1000`, $10) is
  a venue board's Venue add-on, the same way (falls back to 1000); web only.
- Set the App Store price for the IAP product to the same amount (step 3). Apple
  keeps 15% of IAP revenue (Small Business Program) or 30%. The `purchases`
  ledger records the gross amount the customer paid.
- The free tier (boards of 5 or fewer players) is `FREE_PLAYER_LIMIT` in
  `shared/hostFee.ts`, not a setting: the Worker and the app must agree on it,
  so change it there and ship both together.
- The Annual Pass price is `HOST_PASS_PRICE_CENTS` (`1999`, $19.99 a year); see
  "Setup (Annual Pass)". With the Venue add-on, `CLUB_PASS_PRICE_CENTS`
  (`9999`, $99.99 a year); see "Setup (Annual Pass + Venue)".

### 2. Stripe (web)

1. **Account.** Activate the account at dashboard.stripe.com by entering the
   business details and a bank account.
2. **Keys.** Go to Developers → API keys.
   - Copy the publishable key (`pk_live_…`) for `STRIPE_PUBLISHABLE_KEY`.
   - For `STRIPE_SECRET_KEY`, the safer choice is a restricted key (`rk_live_…`)
     with only the permissions the app uses: **PaymentIntents: Write** (the
     host fee), and for the Annual Pass **Customers: Write**, **Subscriptions:
     Write**, **Invoices: Read** and **Customer portal (Billing portal):
     Write**. The secret key (`sk_live_…`) also works.
3. **Payment methods.** Go to Settings → Payment methods and turn on Cards,
   Apple Pay and Google Pay. They're usually on by default. The PaymentIntent
   only allows methods that never redirect away from the page.
4. **Apple Pay domain.** Go to Settings → Payment method domains → Add a new
   domain and enter `jaxsquares.com`. Add `www.jaxsquares.com` too if that host
   serves the app. Stripe registers the domain with Apple. Wait until the domain
   shows Apple Pay as enabled. Google Pay doesn't need domain registration.
   - Older Stripe accounts may still ask you to verify by hosting a domain
     association file. If yours does:
     1. Download the file from the same Dashboard page.
     2. Make sure it's served at exactly
        `https://jaxsquares.com/.well-known/apple-developer-merchantid-domain-association`.
        In this repo the file goes at
        `public/.well-known/apple-developer-merchantid-domain-association`,
        with no file extension. `wrangler.jsonc` sends `/.well-known/*` to the
        Worker first, but `worker/index.ts` passes any path it doesn't handle
        on to the static assets, so no code change is needed.
     3. Confirm with
        `curl -i https://jaxsquares.com/.well-known/apple-developer-merchantid-domain-association`.
        It should return 200 with the file's contents.
5. **Webhook.** Go to Developers → Webhooks → Add endpoint. Newer dashboards
   call this Workbench → Webhooks → Create an event destination, for events on
   "Your account".
   - URL: `https://jaxsquares.com/api/stripe/webhook`
   - Events: `payment_intent.succeeded` and `payment_intent.canceled` (the
     host fee), plus `invoice.paid`, `invoice.payment_failed`,
     `customer.subscription.created`, `customer.subscription.updated` and
     `customer.subscription.deleted` (the Annual Pass and the Annual Pass + Venue)
   - Payload style: **snapshot**, not thin, because the handler reads
     `data.object`.
   - API version: any (the dashboard offers the newest). Payloads come in the
     endpoint's version; the handler reads an invoice's subscription in both
     the old shape (`invoice.subscription`) and the 2025-03-31+ one
     (`invoice.parent.subscription_details.subscription`), and every pass
     event makes the server read the Subscription back at the version pinned
     in `stripe.ts`.
   - Copy the signing secret (`whsec_…`) for `STRIPE_WEBHOOK_SECRET`.

   The handler checks `Stripe-Signature`: an HMAC-SHA256 of
   `"<t>.<raw body>"`, compared in constant time, and rejected if `t` is more
   than 5 minutes old. It only acts on PaymentIntents that this server created,
   which carry the metadata `product=board` and `game_id`. Duplicate deliveries
   are harmless.

### 3. Apple In-App Purchase (iOS app)

1. **Agreements.** Go to App Store Connect → Business. Sign the Paid Apps
   agreement and finish banking and tax. IAP doesn't work until this is done,
   even in TestFlight.
2. **Product.** Go to App Store Connect → your app → Monetization → In-App
   Purchases → **+**.
   - Type: **Consumable**, because every board is a new purchase.
   - Reference name: `Board`
   - Product ID: `com.jaxsquares.app.board`. This must equal `IAP_PRODUCT_ID`
     in `wrangler.jsonc`.
   - Price: the tier matching `BOARD_PRICE_CENTS`, i.e. $4.99.
   - Display name "Squares board". Description "The host fee for one squares
     board: draw the numbers and run the game with your friends."
   - Add the review screenshot.
   - The first IAP has to be submitted together with an app version.
   - No season board product: a season board comes with the Annual Pass
     (see "Pricing"). The Venue add-on isn't sold in the app either.
3. **In-App Purchase key**, which lets the server ask Apple about transactions.
   Go to App Store Connect → Users and Access → Integrations → In-App Purchase
   → Generate In-App Purchase Key.
   - Download `SubscriptionKey_XXXXXXXXXX.p8`. Apple only lets you download it
     once.
   - The Key ID (the `XXXXXXXXXX` in the file name) is `APPLE_IAP_KEY_ID`.
   - The Issuer ID is a UUID shown at the top of Users and Access →
     Integrations → App Store Connect API. It's `APPLE_IAP_ISSUER_ID`.
4. **Bundle ID.** `APPLE_BUNDLE_ID` is the iOS app's bundle id, the `appId` in
   `capacitor.config.ts`, e.g. `com.jaxsquares.app`.
5. **Sandbox testers.** Go to Users and Access → Sandbox → Testers.
   TestFlight and App Review purchases happen in Apple's sandbox. The server
   checks Apple's production API first and falls back to the sandbox API, so
   these purchases work against the production server. Sandbox purchases are
   recorded with `livemode = 0`.
6. **App shell.** Two things are needed here:
   - Set `plugins.NativePurchases.autoFinishTransactions = false` in
     `capacitor.config.ts`. Then StoreKit only finishes a transaction after the
     server has verified it.
   - Call `watchIAPPurchases({ adminTokenFor, onPaid, onUnused, onResume })`
     from `src/lib/checkout.ts` once at app launch (`src/App.tsx` does). It
     confirms unfinished purchases at launch and on every resume, and redeems
     what StoreKit delivers while the app runs (`transactionUpdated`: an Ask to
     Buy approval). If the app is killed between Apple charging and the server
     confirming, the board is marked paid on the next launch or resume (the
     host gets a "Payment confirmed" toast that opens the draw). Each purchase
     carries the board id in StoreKit's `appAccountToken`, so it can't be used
     for a different board.
   - `payWithIAP` never charges twice for one board: it first confirms an
     unfinished purchase already bound to the board, and it buys nothing for a
     board that's already paid for or gone. A purchase is only finished once the
     server has recorded or rejected it for good (400, 409, 410); a bare 404 or
     a failure leaves it unfinished for the next try.

The server verifies each purchase by calling
`GET /inApps/v1/transactions/{transactionId}` with an ES256 JWT (`aud`
`appstoreconnect-v1`, `bid` = bundle id) signed with the `.p8` key. It then
checks the bundle id, the product id, that the purchase wasn't refunded, and
that it's bound to this board. A unique ledger entry stops one transaction from
paying for two boards.

### 4. Secrets, then go live

Run these from the repo root. Each command prompts for the value. Values can be
piped in, as the private key example shows.

```bash
npx wrangler secret put STRIPE_SECRET_KEY        # rk_live_… or sk_live_…
npx wrangler secret put STRIPE_PUBLISHABLE_KEY   # pk_live_…
npx wrangler secret put STRIPE_WEBHOOK_SECRET    # whsec_…
# The iOS app only (before it ships):
npx wrangler secret put APPLE_IAP_KEY_ID         # e.g. 2X9R4HXF34
npx wrangler secret put APPLE_IAP_ISSUER_ID      # UUID
npx wrangler secret put APPLE_IAP_PRIVATE_KEY < SubscriptionKey_2X9R4HXF34.p8
npx wrangler secret put APPLE_BUNDLE_ID          # com.jaxsquares.app (or put it in wrangler.jsonc vars)
```

The private key can also be pasted as one line with `\n` escapes.

Or, without a terminal: Cloudflare dashboard → Workers & Pages → jaxsquares →
Settings → Variables and Secrets → Add → type **Secret**, one per name. Paste
each value there yourself; never in a chat.

Then add `"PAYMENTS_MODE": "live"` to `vars` in `wrangler.jsonc` and run
`npm run deploy`.

**Live mode turns on when the three Stripe secrets are set.** If any is
missing, the app keeps running the no-charge test checkout, and the Worker
logs `PAYMENTS_MODE=live but <names> not set` once per isolate (see it with
`npx wrangler tail`). The App Store secrets don't hold the web back: until
they're set, the iOS app's purchase routes answer 503 ("In-app purchase isn't
set up yet"), so set them before an iOS build ships.

`/api/config` isn't cached (`no-store`), and the client re-reads it every
minute. A page that still says test mode when the server has gone live gets a
403 from the test checkout, re-reads the config and switches to the real
checkout. A price change shows up the same way: the web checkout shows and
itemizes the PaymentIntent's own amount, and a still-payable intent at the old
price is canceled at Stripe before it's replaced.

Check it worked:

```bash
curl -s https://jaxsquares.com/api/config | jq .payments
# { "mode": "live", "priceCents": 499, "currency": "usd", "stripePublishableKey": "pk_live_…", "iapProductId": "com.jaxsquares.app.board" }
```

Then create a board in Safari and have 6 or more players claim a square (other
devices or private windows: with 5 or fewer the draw is free), tap "Draw the
numbers · $4.99", pay with Apple Pay, and look at the ledger:

```bash
npx wrangler d1 execute jaxsquares --remote --command \
  "SELECT reference, game_id, provider, status, amount_cents, livemode FROM purchases ORDER BY created_at DESC LIMIT 5"
```

### Staging with Stripe test keys

To try the real flow without charging anyone, set `PAYMENTS_MODE=live` with
`rk_test_` (or `sk_test_`), `pk_test_` and a test-mode webhook secret, and
test-mode Price ids for the passes. Use test card `4242 4242 4242 4242`, any
future date, any CVC; on test keys the checkout sheets say so under the pay
button (`onStripeTestKeys`). Apple Pay in Stripe test mode also works with a
real card in Wallet and doesn't charge it. Rows are recorded with
`livemode = 0`. Going live is the same steps again in live mode: new keys, a
live webhook endpoint (its own `whsec_`) and live Price ids; test-mode passes
and Customers stay behind (a 404 at Stripe ends a stored pass).

For local development, `stripe listen --forward-to localhost:5173/api/stripe/webhook`
prints a `whsec_…`. Put the Stripe values in `.dev.vars`.

## Ledger

`migrations/0003_purchases.sql` creates the `purchases` table
(`0006_purchases_unused.sql` adds the `unused` status). It has one row per
payment reference:

| `provider` | `reference` |
|---|---|
| `test` | `test:<game id>` |
| `stripe` | the PaymentIntent id |
| `iap` | the Apple transactionId |

The table has no foreign key to `games`, on purpose. Deleting a board doesn't
erase its payment, and doesn't free its Apple transaction to be used again.

`status` is `pending` (a Stripe intent not paid yet), `paid`, `canceled`, or
`unused`: a charge (App Store or Stripe) that paid for nothing, because the
board was already paid for (a second purchase, or a board made before the fee
moved to the draw) or was deleted before the purchase was confirmed. The host is told to ask Apple for a refund
(reportaproblem.apple.com); support can find these with
`SELECT * FROM purchases WHERE status = 'unused'` (a Stripe one is refunded
from the Stripe dashboard).

A board has at most one `paid` purchase. `recordPaid` (`worker/payments/store.ts`)
decides it inside one transaction: the reference becomes `paid` only if no
other reference made since the board was created is already `paid` for it,
otherwise it's kept as `unused`. So two App Store transactions, or a Stripe
webhook and an App Store purchase, confirmed at the same instant for one board
can't both pay for it; only the winner marks the board paid, and the loser's
`/pay/iap` gets the same `409 { unused: true, state }` as a purchase for a board
that was already paid for. "Since the board was created" matters because ledger
rows outlive deleted boards and a new board could get a deleted one's id. (That
is also why this isn't a unique index on `game_id`.)

```sql
-- Real revenue by method (gross, before Stripe fees / Apple commission)
SELECT provider, COUNT(*) AS boards, SUM(amount_cents) / 100.0 AS usd
FROM purchases WHERE status = 'paid' AND livemode = 1 GROUP BY provider;
```

What paid for a drawn board is on the board itself, `games.payment_provider`:
`test`, `stripe` or `iap` (a purchase in this ledger, by its reference),
`pass` (an Annual Pass, reference = the pass id, amount 0) or `free` (the free
tier, reference `free`, amount 0, no ledger row).

```sql
-- How boards got drawn: free, through a pass, or paid
SELECT payment_provider, COUNT(*) AS boards FROM games WHERE paid_at IS NOT NULL GROUP BY payment_provider;
```

## API

| Method | Path | Notes |
|---|---|---|
| POST | `/api/games/:id/lock` (core) | Host or co-host. Draws the numbers: free (marked paid `free`) while 5 or fewer players hold squares, through an active Annual Pass on a bigger board, else **402** `{ error: "Draw the numbers once the board's paid for.", code: "payment_required" }` while the host fee isn't paid; 409 once drawn. |
| POST | `/api/games/:id/pay/test` | Host or co-host (by clientId, no admin token; `isHostOrCohost` in `worker/service.ts`), like the two below. Only works in test mode. Returns `{ state }` (the board paid, not drawn; a no-op on a board already paid for). |
| POST | `/api/games/:id/pay/stripe` | Host or co-host. Returns `{ clientSecret, amountCents, currency }` and reuses the board's open PaymentIntent (show `amountCents`, not the config's price). If the board is already paid for it returns `409 { error, state }`. That includes a board that was just paid while the webhook hasn't arrived yet: the server checks with Stripe and marks it paid on the spot. |
| POST | `/api/games/:id/pay/iap` | Host or co-host. Body `{ transactionId }`. Returns `{ state }`. Errors are 400 (Apple has no record of it, wrong product or app, refunded, bound to another board), 409 (already paid for another board; or, with `unused: true` and `state`, the board was already paid for so the purchase is kept as `unused`), 410 (the board was deleted; with `unused: true` the purchase is kept as `unused`, and no admin token is needed because the purchase's board binding is the proof) and 502 (couldn't reach Apple, so retry). |
| POST | `/api/stripe/webhook` | Called by Stripe. Returns `{ received: true }`. |

## Client (`src/lib/checkout.ts`)

The module has no UI. The checkout sheet (`src/features/create/CheckoutSheet.tsx`,
opened by the host tools with `purpose` `"draw"` or `"ahead"`) uses it like this:

```ts
const { payments } = await fetchAppConfig();
const method = checkoutMethod(payments, platform()); // "test" | "iap" | "wallet" | "card"
preloadCheckout(payments, platform());               // warm Stripe.js / StoreKit as the sheet opens
const price = await hostFeePrice(payments, platform()); // "$4.99"; iOS: only the App Store's string (or null)
const label = `Draw the numbers · ${price}`;          // useHostFee() does this for components

// test:   state = await payTest(gameId, adminToken)
// iap:    const r = await payWithIAP(gameId, adminToken)  // { status: "paid", state } | { status: "cancelled" } | { status: "pending" }
// wallet: const { clientSecret, amountCents } = await createStripeIntent(gameId, adminToken)
//         mountWalletButton(el, { clientSecret, amountCents, label: "Squares board",
//           onPaid: async () => (state = await confirmStripePaid(gameId, adminToken)),
//           onUnavailable: () => switchTo("card"), onCancel, onError })
// card:   const form = await mountCardForm(el, { clientSecret, onChange: setComplete })
//         if ((await form.submit()).status === "paid") state = await confirmStripePaid(gameId, adminToken)
```

Every failure is a `CheckoutError` with a message the host can read. `status`
is 0 when the request never reached the server, and `state` is set when the
board is already paid for. After paying, the host tools call `POST /lock`
(`api.lock`); `isPaymentRequired(err)` (`src/lib/api.ts`) recognizes the 402, so
a board an older copy said was paid opens the checkout instead of an error.

## Annual Pass

A yearly subscription, the alternative to paying board by board: **$19.99 a
year** on the web (`HOST_PASS_PRICE_CENTS`, 1999; it was $9.99 until October
2026), the App Store product's own localized price in the iOS app. It renews
every year until canceled. While a host's pass is active, every board they
host is covered: drawing the numbers costs nothing more. Boards drawn while it
was active stay drawn after it ends. (Boards of 5 or fewer players are free
for everyone, so the pass only ever covers bigger ones.)

**Passes people already hold are unaffected by a price change.** A web pass
renews at the Stripe Price its subscription was created with, and an App Store
subscription at the price Apple keeps for it (Apple preserves the current
price for existing subscribers unless you choose otherwise in App Store
Connect). Pointing `STRIPE_HOST_PASS_PRICE_ID` at a new Price only affects
subscriptions created after the change.

| Where | How it's sold | What makes it active |
|---|---|---|
| Web | Stripe Billing: a yearly Subscription, first payment with Express Checkout (Apple Pay / Google Pay, with Apple Pay's recurring payment request) or the card form. **Needs a signed-in account.** | The Subscription read back from Stripe (`/pass/stripe/confirm`), then signed webhooks |
| iOS app | App Store auto-renewable subscription `com.jaxsquares.app.hostpass.yearly`, group "Annual Pass", through `@capgo/native-purchases`. No sign-in needed; **Restore purchases** in Profile | App Store Server API (transaction, then subscription status), then App Store Server Notifications V2 |
| Anywhere, while `PAYMENTS_MODE` isn't `live` | A no-charge **test pass** that lasts a year and doesn't renew (labeled "Test pass" in the app); no sign-in | The test route |

In live mode the web sells the pass only once `STRIPE_HOST_PASS_PRICE_ID` is
set (`PaymentConfig.hostPass.web`); until then Profile hides it on the web and
the draw offers only the board fee. The iOS app never shows the web price or
Stripe (guideline 3.1.1): prices come from StoreKit (`hostPassPrice`), and a
pass bought on the web just says to manage it where it was bought.

### Who holds it

The pass belongs to the host's identity: the request's canonical clientId,
`c.get("clientId")`, so a signed-in host's pass covers boards on every device
of the account. Signing in on another device merges that device's passes and
Stripe customer into the account (`mergeClientStatements` in
`worker/payments/store.ts`, in the same batch as the rest of the sign-in merge;
docs/auth.md). When both hold a pass, both rows are kept: the identity is
covered while any row is active.

**Why the web needs an account:** a web subscription tied only to one
browser's clientId would be lost with it (sign-out or cleared site data starts
a new device), and nobody could manage it. So the client's one gate,
`startPassPurchase()` (`src/lib/useHostPass.ts`), sends a signed-out browser to
the existing `SignInSheet` first and continues to the purchase after; and the
server refuses to start one for a device with no account link: `POST
/api/payments/pass/stripe` answers **409** `{ error, code: "account_required" }`
(`ACCOUNT_REQUIRED_CODE`), checked with the auth module's `freshLink`. The iOS
app needs no account: Apple keeps the subscription, and Restore purchases
attaches it to whichever identity restores it. The test pass needs none either.

### Drawing with it

- `POST /api/games/:id/lock` on an unpaid board of 6 or more players (a
  smaller one is free, "The free tier"): when the caller (the request's
  canonical clientId: the identity holding the admin token, or a co-host's)
  or the board's host holds an active pass, the board is marked paid through
  the pass (`payment_provider` `pass`, `payment_amount_cents` 0,
  `payment_reference` = the pass id) in the same write as the draw. Otherwise
  the 402 is unchanged. Nobody but the host and the co-hosts the host chose
  can draw, so nobody else draws on someone's pass.
- A linked board of 6 or more players whose host holds an active pass draws
  itself at kickoff like a paid board, marked paid through the pass at that
  moment (`applyLiveUpdate`).
- The "kickoff soon, draw the numbers" reminder skips pass holders (the cron
  filters them out with `holdersOfActivePass`), and the board-full push for a
  pass holder's linked board says "Draw numbers now, or they'll draw at
  kickoff" (no "pay ahead").
- **Active** = status `active` and `current_period_end` in the future, plus a
  24-hour grace window while it auto-renews (a renewal whose webhook is a
  little late doesn't block a draw); a pass that won't renew ends exactly at
  its period end. It's checked when the pass is used; webhooks and
  notifications keep the rows current, so there's no cron.

### Tables (`migrations/0011_host_pass.sql`, owned by `worker/payments/store.ts`)

| Table | Columns |
|---|---|
| `host_passes` | `id` (`hp_…`, server-only), `client_id` (the holder), `provider` (`stripe` \| `iap` \| `test`), `external_id` UNIQUE (the Stripe subscription id, the Apple originalTransactionId, or `test:<uuid>`), `status` (`pending` \| `active` \| `past_due` \| `ended` \| `revoked`), `current_period_end`, `auto_renew`, `livemode`, `event_at` (provider time of the stored state), `created_at`, `updated_at` |
| `stripe_customers` | `client_id` + `livemode` (PK) → `customer_id` UNIQUE: the Customer an identity's web subscriptions bill to and the Customer Portal opens for (test and live keys get separate customers) |

`activePass(db, clientIds, now)` (`worker/payments/pass.ts`) is the lookup core
uses; `passView` turns rows into what the API shows (`HostPass` in
`shared/types.ts`: `{ active, status, provider, renewsAt, endsAt, autoRenew }`,
never a clientId, the pass id or a provider reference).

### Web flow (Stripe Billing, API version 2024-06-20 as pinned in `stripe.ts`)

1. `POST /api/payments/pass/stripe` creates (or reuses) the account's Customer,
   then a Subscription to `STRIPE_HOST_PASS_PRICE_ID` with
   `payment_behavior=default_incomplete`,
   `payment_settings[save_default_payment_method]=on_subscription`,
   metadata `product=host_pass` and `pass_id`, expanding
   `latest_invoice.payment_intent` (at this API version the first invoice's
   PaymentIntent carries the client secret; from 2025-03-31 "basil" it's
   `latest_invoice.confirmation_secret`, so move both together with
   `STRIPE_API_VERSION`). It stores a `pending` pass and returns
   `{ clientSecret, amountCents, currency }`. A subscription still waiting for
   its first payment is reused, so retries never start a second one.
2. The browser confirms that PaymentIntent with the same Express Checkout
   Element / card form as the board fee.
3. `POST /api/payments/pass/stripe/confirm` reads the Subscription back from
   Stripe (the webhook may not have landed yet) and stores what Stripe says.
   The client is never trusted to say it paid.
4. The webhook (signature check unchanged) handles `invoice.paid`,
   `invoice.payment_failed`, `customer.subscription.updated` and `.deleted`
   (and `.created`), in any endpoint API version: each one
   makes the server read the Subscription back from Stripe and store its
   status, `current_period_end` and `cancel_at_period_end`, so events arriving
   late or out of order can't roll a pass back. Only subscriptions with
   `product=host_pass` that the server holds are read.
5. Manage: `POST /api/payments/pass/portal` returns a Customer Portal session
   URL (returning to `/me`).

Statuses: `active`/`trialing` → active, `past_due` → past_due (not covering),
`incomplete` → pending, anything else → ended. Deleting the account sets
`cancel_at_period_end` on its web subscriptions first (nobody could manage them
afterwards); if Stripe can't be reached, nothing is deleted (502).

### iOS flow (App Store auto-renewable subscription)

1. `buyPassWithIAP()` (`src/lib/checkout.ts`) buys the product in the App Store
   sheet, then `POST /api/payments/pass/iap` with `{ transactionId, jws }`
   (`jws` = StoreKit 2's `jwsRepresentation`). The server looks the transaction
   up (`GET /inApps/v1/transactions/{id}`), checks the bundle and product, then
   reads the subscription's status by originalTransactionId (`GET
   /inApps/v1/subscriptions/{originalTransactionId}`, in the environment the
   purchase was made in) for its expiry, grace period and auto-renew, and
   attaches it to the identity. The transaction is finished only after that
   (or after a settled 400/409); `watchIAPPurchases` also confirms pass
   transactions that land later (Ask to Buy, renewals).
2. Restore purchases: `restorePassPurchases()` syncs with the App Store, sends
   this Apple ID's current pass transactions with their `jws`, and `POST
   /api/payments/pass/iap/restore` attaches them to the requesting identity.
3. **Moving a pass between identities needs proof.** A subscription another
   identity already holds moves only when the request carries StoreKit's
   signed transaction for it and that JWS verifies up to Apple's root (below);
   a transaction id alone gets 409.
4. `POST /api/payments/apple/notifications` takes App Store Server
   Notifications V2 (`{ signedPayload }`): it verifies the payload, then the
   `signedTransactionInfo` and `signedRenewalInfo` inside it, and stores the
   new state: renewed, auto-renew off or on, billing retry (`past_due`), grace
   period (still active until `gracePeriodExpiresDate`), expired, refunded or
   revoked. A notification signed before the stored state (`event_at`) is late
   and changes nothing. Other products (the board consumable), other apps and
   subscriptions nobody holds yet are ignored (200); a bad signature is a 400.

Apple status codes: 1 active, 2 expired → ended, 3 billing retry → past_due,
4 grace period → active, 5 revoked; a transaction with a `revocationDate` is
revoked.

**What the Apple JWS check verifies** (`worker/payments/appleJws.ts`, WebCrypto
plus a small DER reader in `x509.ts`), the same checks as Apple's App Store
Server Library in offline mode:

1. the header's `alg` is ES256 and `x5c` has exactly three certificates;
2. the third is **Apple Root CA - G3**, byte for byte (SHA-256
   `63343abf…653e9179`, pinned; published at apple.com/certificateauthority),
   and the chain is unbroken: the intermediate's issuer equals the root's
   subject and its signature verifies with the root's key, and the same for
   the leaf against the intermediate;
3. the intermediate is a CA (basicConstraints) with Apple's marker extension
   `1.2.840.113635.100.6.2.1`, and the leaf has `1.2.840.113635.100.6.11.1`;
4. all three certificates are valid at the payload's `signedDate`;
5. the JWS signature verifies with the leaf's P-256 key.

Not checked: OCSP revocation (Apple's library does it only in online mode).
The caller then checks the bundle id and product. Responses from the App Store
Server API itself come straight from Apple over TLS with our signed JWT, so
their JWS isn't re-verified (as for the board purchase).

### Routes (rate limited: `pass`, 30 per device per hour, and `pass-ip`, 120 per address per hour)

| Method | Path | Notes |
|---|---|---|
| GET | `/api/payments/pass` | `HostPassState` `{ pass: HostPass \| null, offer: HostPassOffer }` (`no-store`). `GET /api/me` carries `hostPass` too |
| POST | `/api/payments/pass/test` | Test mode only (403 in live): a no-charge pass for a year; a no-op while one is active |
| POST | `/api/payments/pass/test/end` | Test mode only: ends the test pass (to try again) |
| POST | `/api/payments/pass/stripe` | `{ clientSecret, amountCents, currency }`; 409 `account_required` without an account link; 409 `{ error, pass, offer }` when one is already active; 409 `UPGRADE_PASS_CODE` for the Annual Pass + Venue (`{ plan: "club" }`) when a web Annual Pass is running (add it with `/stripe/venue`); 503 while the Price or the key is unset; 502 when Stripe errors |
| POST | `/api/payments/pass/stripe/confirm` | `HostPassState`, read back from Stripe |
| POST | `/api/payments/pass/stripe/venue` | Adds the Venue add-on to the identity's running web Annual Pass (its item moves to `STRIPE_CLUB_PASS_PRICE_ID`, prorated and charged now to the card it renews on) → `HostPassState`; 200 when it has it already; 402 when the card is refused (nothing changed); 404 with no web Annual Pass; 503 while the Price or key is unset; 502 when Stripe errors |
| POST | `/api/payments/pass/portal` | `{ url }` (Customer Portal); 404 with no web pass here |
| POST | `/api/payments/pass/iap` | Body `{ transactionId, jws? }` → `HostPassState`; 400 (unknown, wrong product or app), 409 (held by another identity, no valid proof), 502 (Apple unreachable), 503 (no App Store key) |
| POST | `/api/payments/pass/iap/restore` | Body `{ transactions: [{ transactionId, jws? }] }` (up to 20) → `HostPassState & { restored }`; 409 when the only ones found belong to another identity without proof |
| POST | `/api/payments/apple/notifications` | App Store Server Notifications V2; `{ received: true, outcome: "updated" \| "ignored" }`; 400 on a bad signature |

### Client

- State: `useHostPass()` (`src/lib/useHostPass.ts`, next to `useHostFee`) over
  a small store (`src/lib/hostPassStore.ts`) that `GET /api/me` primes at
  startup and on sign-in, the pass routes update after a purchase, and
  sign-out clears. `useHostPassPrice()` gives "$19.99" (or the App Store's
  string); the UI says "$19.99/year".
- Checkout sheet at the draw (an unpaid board of 6 or more players, no pass):
  "This board · $4.99" (the default) and "Annual Pass · $19.99/year" ("Every
  board you host for a year", "Pays for itself by your fifth board"), one
  tap to switch (`plan-board`, `plan-pass`). The "pays for itself" board is
  worked out from the two prices this device shows (`passPaysOffAt`,
  `src/features/pass/passText.ts`, via `useHostPrices`/`hostPrices`):
  ceil(pass ÷ board) in whole cents, the first board count whose fees reach
  the pass (4 × $4.99 = $19.96 is short of $19.99, so the fifth). On the web that's the two server prices; in the iOS app
  StoreKit's `price` for both products, and the line is hidden unless
  StoreKit gives both (in one currency). The same line is on Profile's pass
  card and pitch and in Support. The pass shows its subscription disclosure
  (`pass-disclosure`: name, length, price per period, auto-renews until
  canceled, how to cancel, Terms and Privacy). Bought at the draw, the host
  tools draw right away (the server marks the board paid through the pass).
- With an active pass the host bar, the Now card and the lock confirm read
  "Draw the numbers" with "Included with your Annual Pass" (`host-pass-note`),
  no price, no pay-ahead; drawing just draws. If the server answers 402 (the
  pass ended meanwhile) the checkout opens as usual.
- Profile → Annual Pass (`HostPassSection`): no pass: a pitch and Get (`pass-get`,
  through `startPassPurchase`); active: "Active · renews Oct 19, 2027" or "Ends
  Oct 19, 2027" (`pass-status`) and Manage (`pass-manage`: Apple's subscription
  management in the iOS app, the Customer Portal on the web, "End test pass"
  in test mode); iOS: Restore purchases (`pass-restore`).

### Setup (Annual Pass)

Do these alongside the steps above. Every value below is a plain setting
(`wrangler.jsonc` → `vars`) except where it says secret; no new secrets are
needed. Never paste a secret in chat; `npx wrangler secret put NAME` prompts
for it.

**App Store Connect**

1. Your app → Monetization → **Subscriptions** → create a subscription group
   named **Annual Pass**.
2. In it, add an auto-renewable subscription: reference name `Annual Pass
   (yearly)`, product ID **`com.jaxsquares.app.hostpass.yearly`** (=
   `IAP_HOST_PASS_PRODUCT_ID` in `wrangler.jsonc`), duration **1 year**, price
   **$19.99**. Display name "Annual Pass", description "Every board you host for a
   year: draw the numbers with no host fee." Add the review screenshot; submit
   it with an app version.
   - **Already set up at $9.99?** Subscription → Subscription Prices → Plan a
     price change → $19.99, and choose to keep the current price for existing
     subscribers, so passes people already hold renew as they are. (Raising it
     for them too means Apple asks each one to agree first.)
3. App Information → **App Store Server Notifications** → Version 2, for both
   Production and Sandbox: `https://jaxsquares.com/api/payments/apple/notifications`.
4. The App Store Server API key (`APPLE_IAP_KEY_ID`, `APPLE_IAP_ISSUER_ID`,
   `APPLE_IAP_PRIVATE_KEY`, secrets) and `APPLE_BUNDLE_ID` are the ones the
   board purchase already uses.

**Stripe**

1. Product catalog → add a product **Annual Pass** with a **recurring** price,
   **$19.99 per year**. Copy the price id (`price_…`) into
   `STRIPE_HOST_PASS_PRICE_ID` in `wrangler.jsonc` → `vars` (it isn't a
   secret), and keep `HOST_PASS_PRICE_CENTS` (1999) equal to it: the app shows
   that number on the web, and it's the only place the web price is set.
   - **Already set up at $9.99?** Stripe Prices can't be edited: add a new
     $19.99/year Price to the same Annual Pass product, put its id in
     `STRIPE_HOST_PASS_PRICE_ID` and set `HOST_PASS_PRICE_CENTS` to 1999 in the
     same deploy. **Changing the Price ID only affects new subscriptions:**
     every existing subscription keeps renewing at the $9.99 Price it was
     created with (leave that Price active; archiving it only stops new
     sign-ups on it). Moving existing subscribers would be a separate,
     deliberate migration in Stripe, with notice to them first.
2. Webhook: add `invoice.paid`, `customer.subscription.updated` and
   `customer.subscription.deleted` to the existing endpoint (step 2.5 above).
3. Restricted key: add Customers (Write), Subscriptions (Write), Invoices
   (Read) and Customer portal (Write) to its permissions (step 2.2 above).
4. Settings → Billing → **Customer portal**: turn it on; allow updating payment
   methods, viewing invoices and **canceling subscriptions at the end of the
   billing period**; set the default return URL to `https://jaxsquares.com/me`
   and add the Terms and Privacy links.
5. Settings → Billing → Subscriptions and emails: turn on receipt emails if you
   want them, and let failed payments retry (Smart Retries) before canceling.

Then `npm run deploy` (migration 0011 is applied by CI before the deploy, or
run `npm run db:migrate:remote`). Check it:

```bash
curl -s https://jaxsquares.com/api/config | jq .payments.hostPass
# { "priceCents": 1999, "currency": "usd", "iapProductId": "com.jaxsquares.app.hostpass.yearly", "web": true }
npx wrangler d1 execute jaxsquares --remote --command \
  "SELECT provider, status, current_period_end, auto_renew, livemode FROM host_passes ORDER BY created_at DESC LIMIT 5"
```

## Annual Pass + Venue

The Annual Pass with the Venue add-on (`plan` 'club' in the API and the
tables), for bars and restaurants that run boards every week: **$99.99 a
year** (`CLUB_PASS_PRICE_CENTS`, 9999; the Annual Pass's $19.99 plus $80),
for a year from the day it's bought, auto-renewing until canceled, sold **on
the web only** through Stripe Billing, and only to a signed-in account (like
the web Annual Pass). A holder of a web Annual Pass adds it to their pass
instead (see "Pricing"). It's everything the Annual Pass is, plus venue boards
and the venue features on every board its holder hosts while it's active:

| | What | Where |
|---|---|---|
| No host fee, no Venue add-on | `passCover` says "venue": every board's host fee and every venue board's add-on are covered at the draw (and a linked board's kickoff) | `worker/payments/pass.ts`, `shared/pricing.ts` |
| Club branding | The club's name (checked like a board name, `mentionsMoney`, 40 characters) and an optional logo: the board header ("Hosted by <club>", the invite view too), TV mode's panel, the printout, and the link preview's description (the name only, never an amount, the image unchanged) | `Game.club`, `worker/clubs/brand.ts` |
| More co-hosts | Up to 10 per board (`CLUB_MAX_COHOSTS`) instead of `MAX_COHOSTS` (3): `cohostLimitOf(game)` in `shared/cohosts.ts` | the invite and accept routes, `CohostsSection` |
| Players CSV | `GET /api/games/:id/export.csv`, host and co-hosts of a club board: player, how many squares, the squares as "row-col" (from 1 at the top left), after the draw their numbers (team across the top first; a column per draw with new numbers each quarter), when they joined (`?tz=`). Never a payment column, an email or a clientId; formula-looking names are kept as text | `worker/clubs/csv.ts` |
| Club TV | `/club/<club id>/tv#k=<token>`: the club's open and live boards, one every 20 seconds, each on the TV mode screen; a winner on a board that isn't up takes the screen; the club in the corner | `src/pages/ClubTvView.tsx` |

**The iOS app never offers it** (App Store guidelines 3.1.1 / 3.1.3(b): an
app may unlock what was bought elsewhere, but must not point to buying it).
No price, no pitch, no Get button, no Manage link and no "buy it on the web"
there (`clubCheckoutMethod` and `clubPassPrice` say null on iOS; Profile,
Terms and Support leave it out). A holder's features just work in the app:
Profile shows "Annual Pass + Venue · Active" and the club settings (name, logo, TV link,
boards), and boards, TV and printouts carry the branding.

### How it's built

- **One table for both passes.** Migration `0016_club.sql` adds
  `host_passes.plan` (`'host'` default, or `'club'`). `activePass` and
  `holdersOfActivePass` count any plan; `hostPassOf` / `clubPassOf` show each
  plan apart (`HostPassState.club`, `MeResponse.clubPass`; the `HostPass`
  shape is the same). An Annual Pass + Venue holder isn't sold an Annual Pass (409 "Your Club
  Pass already covers every board you host."); an Annual Pass holder can add the
  Annual Pass + Venue (both stay until one is canceled in Manage).
- **Buying it** reuses the Annual Pass routes with `{ plan: "club" }` in the
  body: `POST /api/payments/pass/stripe` (409 `account_required` without a
  sign-in; 503 until `STRIPE_CLUB_PASS_PRICE_ID` is set; idempotency key
  `clubpass-<customer>-<price>-<n>`; description "JaxSquares Annual Pass + Venue
  (yearly)"; metadata `product=host_pass`, `plan=club`), `POST
  /api/payments/pass/stripe/confirm` and, in test mode, `POST
  /api/payments/pass/test` / `test/end`. Manage is the same Customer Portal
  (`POST /api/payments/pass/portal`): one Stripe Customer per identity holds
  both subscriptions. The client: `ClubCheckoutSheet` (Express Checkout or
  the card form, the test pass in test mode) from Profile's pitch.
- **The plan follows the Price.** Every webhook (and confirm) reads the
  Subscription back from Stripe; `planOfSubscription` maps its Price: the
  club Price → `club`, the Annual Pass Price → `host`, any other Price (an older
  one kept by subscriptions made before a price change) leaves the stored plan
  as it is. So a holder who switches plans in the Customer Portal (if you
  allow it) moves between them, and an Annual Pass + Venue price change never demotes
  existing holders.
- **The club** (`clubs`, owned by `worker/clubs/store.ts`): a random public
  id, the owner's canonical clientId (server-only), the name, the logo (base64
  in D1, with its type and a SHA-256 ETag) and the TV link token's SHA-256.
  It's made the first time an Annual Pass + Venue holder needs one. It joins the sign-in
  merge and goes with a deleted account (docs/auth.md).
- **Branding on the board.** `worker/db.ts` reads the host's club with every
  board state (`clubBrandOf`, cached per isolate for 30 s, dropped on the
  holder's own changes and pass changes) into `Game.club` `{ id, name,
  hasLogo, logoVersion }`: present while the host's Annual Pass + Venue is active (an
  unnamed club shows nothing), never who owns it. A rename or new logo
  re-broadcasts the club's open and live boards.
- **The logo.** The browser resizes it to fit 256×256 and re-encodes it as
  WebP (PNG where it can't), stepping quality and size down until it's under
  60 KB (`src/lib/clubLogo.ts`). `PUT /api/clubs/mine/logo` checks the type
  (`image/webp` or `image/png`), the magic bytes (and that they agree), the
  size (60 KB) and the dimensions in the image's own header
  (`worker/clubs/logo.ts`). `GET /api/clubs/:id/logo` serves it with an ETag
  (304 on `If-None-Match`), `nosniff`, and `max-age=31536000, immutable` when
  asked with its version (`?v=`, as the app always does), a day otherwise.
- **The club TV link.** `POST /api/clubs/mine/tv` makes a 32-byte token and
  keeps only its hash; the link comes back once and the device that made it
  keeps it (`jaxsquares.clubTv`, wiped at sign-out), shown again while the
  server's fingerprint (`tvKey`) matches. Making a new one cuts the old one off
  at once. The token rides in the URL's fragment and goes to `GET
  /api/clubs/:id/tv` in `x-club-tv-token`, so it's never in a request log. A
  wrong or old token is a 404 like an unknown club; the answer is up to 12
  boards' public states (`ClubTvState`), the same as anyone with each board's
  link sees. The TV polls it every 15 s; the board on screen is live over its
  own socket.
- **Rate limits:** `club-brand` (30 per device per hour) / `club-brand-ip`
  (90) for the name and logo, `club-tv` (10) / `club-tv-ip` (30) for new TV
  links, `club-export` (30) / `club-export-ip` (120) for the CSV, and
  `club-tv-view-ip` (120 per address per minute) for the TV's reads, counted
  before the token is checked.
- **When it ends** the branding, the extra co-host room (existing co-hosts
  stay), the CSV and the TV's boards stop; boards drawn while it was active
  stay drawn. The club's name and logo are kept for when it's renewed.

### Setup (Annual Pass + Venue)

Every value is a plain setting (`wrangler.jsonc` → `vars`); no new secrets.

**Stripe**

1. Product catalog → **Add product** → name **Annual Pass + Venue**,
   description "For bars and restaurants: every board you host for a year,
   venue boards included, with your venue's name and logo, 10 co-hosts,
   players lists and a TV link." Pricing: **Recurring**, **$99.99 per
   year**. Save. (Stripe's test mode and live mode each need it.)
2. Copy the Price id (`price_…`) into `STRIPE_CLUB_PASS_PRICE_ID` in
   `wrangler.jsonc` → `vars`, and keep `CLUB_PASS_PRICE_CENTS` (9999) equal to
   it: the web shows that number, and "+$80/year" is it less the Annual Pass's.
   Until the Price id is set, live mode doesn't sell the Annual Pass + Venue
   or add the Venue add-on to a pass (Profile hides the pitch; the routes
   answer 503). Test mode always offers the no-charge test pass. The old $49
   Club Pass Price is retired: its subscriptions keep renewing at $49 and stay
   venue passes (an unknown Price never changes a pass's plan).
   - **Changing the price later:** add a new Price to the same product and
     point `STRIPE_CLUB_PASS_PRICE_ID` at it (with `CLUB_PASS_PRICE_CENTS`) in
     one deploy. Existing subscriptions keep renewing at their old Price, and
     the webhook keeps them Annual Pass + Venue passes (an unknown Price never changes a
     pass's plan). Leave the old Price active.
3. Nothing else changes in Stripe: the webhook endpoint and its events
   (`invoice.paid`, `customer.subscription.updated` / `.deleted`), the
   restricted key's permissions and the Customer Portal are the Annual Pass's.
   If you want holders to switch between the Annual Pass and the Annual Pass + Venue
   themselves, add both products to the Customer Portal's "Subscription
   products" (Settings → Billing → Customer portal → Subscriptions → let
   customers switch plans); the webhook moves the pass's plan with the Price.
4. **App Store Connect:** nothing. The Annual Pass + Venue has no in-app product, and
   the iOS app never sells it (see above). Review notes may mention that club
   features bought on the web work in the app.

Then `npm run deploy` (CI applies `0016_club.sql` before deploying, or run
`npm run db:migrate:remote`). Check it:

```bash
curl -s https://jaxsquares.com/api/config | jq .payments.clubPass
# { "priceCents": 9999, "currency": "usd", "web": true }
npx wrangler d1 execute jaxsquares --remote --command \
  "SELECT plan, provider, status, current_period_end FROM host_passes WHERE plan = 'club' ORDER BY created_at DESC LIMIT 5"
```

Refunds: a holder asks Support (`support@jaxsquares.com`); refund from the
Stripe dashboard (Payments → the charge → Refund) and cancel the subscription
there if they want it ended now. A refunded Annual Pass + Venue that's canceled stops
covering draws and the club features at once.

## Not covered yet

- **Sales tax.** Prices are tax-inclusive list prices and nothing collects tax.
  Some US states tax digital services; once sales cross a state's threshold,
  register there and turn on Stripe Tax (it only calculates and collects where
  the account has active registrations: Settings → Tax → Registrations). Stripe
  Tax works best with Checkout Sessions (`automatic_tax`); with the current
  PaymentIntents it needs the Tax Calculations API before each intent.
- **Stripe API version.** `stripe.ts` pins 2024-06-20. Moving to the newest
  (2026-08-26.dahlia) means reading `latest_invoice.confirmation_secret`
  instead of `latest_invoice.payment_intent` and the period end from the
  subscription item; do it with test keys set, so the whole flow is tried
  end to end first.

- **Refunds don't undo a draw.** Refunding a board in Stripe or Apple leaves
  it paid (and drawn); a refunded Annual Pass stops covering new draws (Apple's
  REFUND notification, or the subscription ending in Stripe) but boards it
  covered stay drawn. Handle `charge.refunded` for board purchases if that
  matters.
- **Older app builds.** An app build from the pay-to-open flow creates boards
  that open right away (it reads `paymentRequired: false`), but it can't pay at
  the draw: its "Draw the numbers" shows the 402's message until it updates.
- **Android app.** Google Play's payments policy will require Play Billing
  (for the board fee and the Annual Pass) before an Android build ships on the
  Play Store. Until then, Android uses
  the Stripe web flow, which is fine for the web or PWA but not for a Play
  Store build.
- **Apple's JWS signature on API responses.** For the board purchase and the
  pass's API lookups, the server trusts `signedTransactionInfo` because it came
  straight from Apple over TLS. Signed data that reaches us any other way (Server
  Notifications, a restore's proof) is verified up to Apple's root (see "What
  the Apple JWS check verifies"); OCSP revocation isn't checked.
