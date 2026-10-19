# Payments

The only money in JaxSquares is the **host fee**: the host pays JaxSquares once
per board, when they draw its numbers, or takes the yearly **Host Pass**, which
covers that fee on every board they host (see "Host Pass" below). Setting up a
board, inviting friends and picking squares are free, and nothing ever moves
between players. JaxSquares never sells squares; the fee is for creating and
managing the board.

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
2. **Draw = pay.** `POST /api/games/:id/lock` on a board whose fee isn't paid
   answers **402** `{ error: "Draw the numbers once the board's paid for.",
   code: "payment_required" }` (`PAYMENT_REQUIRED_CODE` in `shared/types.ts`).
   The host's "Draw the numbers · $4.99" opens the checkout sheet first; once a
   `/pay/*` call (or the Stripe webhook) records the fee, the app calls `/lock`
   again and plays the number reveal. Only the host (the board's admin token)
   can pay or draw.
3. **Paid.** A purchase is tied to its board when the host pays (not when the
   board was made). The ledger (`purchases`, below) decides which purchase pays
   for a board, and `markPaid` (`worker/service.ts` → `worker/db.ts`) stamps
   `games.paid_at` with it, together with `payment_provider`,
   `payment_reference` and `payment_amount_cents`. Paying never draws by
   itself. `db.lockGame` also refuses an unpaid board in SQL, so a race can't
   draw one.

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
once the fee is paid (`applyLiveUpdate`, `worker/service.ts`). The host can pay
ahead ("Pay now and Jax draws the numbers at kickoff", `purpose="ahead"` on the
checkout sheet), and then Jax draws at kickoff unless the host draws first. An
unpaid linked board stays `open` at kickoff: the feed keeps recording the live
score and period scores, squares stay open, players see "Waiting on the host
to draw the numbers", and the host can pay and draw any time. If the game is
already over when they do, the draw also ends the board (`final`), with one
"that's a wrap" push.

**Reminders** (host-only pushes, never an amount; `worker/push/copy.ts`):

- *Board full* (once per board): on an unpaid linked board, "Draw the numbers
  now, or pay ahead and Jax draws them at kickoff."
- *Kickoff soon* (`draw-reminder`): the cron (every minute) claims linked boards
  that kick off within the hour, are still `open` with the fee unpaid, were
  made at least 15 minutes ago and weren't reminded yet
  (`games.draw_reminder_at`, `db.claimDrawReminders`), and tells their host
  "Kickoff in about an hour. Draw the numbers now, or pay ahead and Jax draws
  them at kickoff."
- *Kickoff* on an undrawn board: the host hears "Draw the numbers to get your
  board going", everyone else "Waiting on the host to draw the numbers".

## Setup checklist

Do these steps in order. Payments stay in test mode until step 4.

### 1. Price

- `BOARD_PRICE_CENTS` in `wrangler.jsonc` → `vars` sets the price. It's `499`
  ($4.99) today. Values below 50 (Stripe's minimum) or values that aren't whole
  numbers fall back to 499.
- Set the App Store price for the IAP product to the same amount (step 3). Apple
  keeps 15% of IAP revenue (Small Business Program) or 30%. The `purchases`
  ledger records the gross amount the customer paid.

### 2. Stripe (web)

1. **Account.** Activate the account at dashboard.stripe.com by entering the
   business details and a bank account.
2. **Keys.** Go to Developers → API keys.
   - Copy the publishable key (`pk_live_…`) for `STRIPE_PUBLISHABLE_KEY`.
   - For `STRIPE_SECRET_KEY`, the safer choice is a restricted key (`rk_live_…`)
     with only the permissions the app uses: **PaymentIntents: Write** (the
     host fee), and for the Host Pass **Customers: Write**, **Subscriptions:
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
     host fee), plus `invoice.paid`, `customer.subscription.updated` and
     `customer.subscription.deleted` (the Host Pass; adding
     `customer.subscription.created` is harmless)
   - Payload style: **snapshot**, not thin, because the handler reads
     `data.object`.
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
npx wrangler secret put APPLE_IAP_KEY_ID         # e.g. 2X9R4HXF34
npx wrangler secret put APPLE_IAP_ISSUER_ID      # UUID
npx wrangler secret put APPLE_IAP_PRIVATE_KEY < SubscriptionKey_2X9R4HXF34.p8
npx wrangler secret put APPLE_BUNDLE_ID          # com.jaxsquares.app (or put it in wrangler.jsonc vars)
```

The private key can also be pasted as one line with `\n` escapes.

Then add `"PAYMENTS_MODE": "live"` to `vars` in `wrangler.jsonc` and run
`npm run deploy`.

**Live mode only turns on when every one of the seven secrets above is set.**
If any is missing, the app keeps running the no-charge test checkout. The
Worker logs `PAYMENTS_MODE=live but <names> not set` once per isolate, which
you can see with `npx wrangler tail`.

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

Then create a board in Safari, claim a square, tap "Draw the numbers · $4.99",
pay with Apple Pay, and look at the ledger:

```bash
npx wrangler d1 execute jaxsquares --remote --command \
  "SELECT reference, game_id, provider, status, amount_cents, livemode FROM purchases ORDER BY created_at DESC LIMIT 5"
```

### Staging with Stripe test keys

To try the real flow without charging anyone, set `PAYMENTS_MODE=live` with
`sk_test_`, `pk_test_` and a test-mode webhook secret. Use test card
`4242 4242 4242 4242`. Apple Pay in Stripe test mode also works with a real
card in Wallet and doesn't charge it. Rows are recorded with `livemode = 0`.

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

## API

| Method | Path | Notes |
|---|---|---|
| POST | `/api/games/:id/lock` (core) | Host only. Draws the numbers. **402** `{ error: "Draw the numbers once the board's paid for.", code: "payment_required" }` while the host fee isn't paid; 409 once drawn. |
| POST | `/api/games/:id/pay/test` | Host only. Only works in test mode. Returns `{ state }` (the board paid, not drawn; a no-op on a board already paid for). |
| POST | `/api/games/:id/pay/stripe` | Host only. Returns `{ clientSecret, amountCents, currency }` and reuses the board's open PaymentIntent (show `amountCents`, not the config's price). If the board is already paid for it returns `409 { error, state }`. That includes a board that was just paid while the webhook hasn't arrived yet: the server checks with Stripe and marks it paid on the spot. |
| POST | `/api/games/:id/pay/iap` | Host only. Body `{ transactionId }`. Returns `{ state }`. Errors are 400 (Apple has no record of it, wrong product or app, refunded, bound to another board), 409 (already paid for another board; or, with `unused: true` and `state`, the board was already paid for so the purchase is kept as `unused`), 410 (the board was deleted; with `unused: true` the purchase is kept as `unused`, and no admin token is needed because the purchase's board binding is the proof) and 502 (couldn't reach Apple, so retry). |
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

## Host Pass

A yearly subscription, the alternative to paying board by board: **$9.99 a
year** on the web (`HOST_PASS_PRICE_CENTS`, 999), the App Store product's own
localized price in the iOS app. It renews every year until canceled. While a
host's pass is active, every board they host is covered: drawing the numbers
costs nothing more. Boards drawn while it was active stay drawn after it ends.

| Where | How it's sold | What makes it active |
|---|---|---|
| Web | Stripe Billing: a yearly Subscription, first payment with Express Checkout (Apple Pay / Google Pay, with Apple Pay's recurring payment request) or the card form. **Needs a signed-in account.** | The Subscription read back from Stripe (`/pass/stripe/confirm`), then signed webhooks |
| iOS app | App Store auto-renewable subscription `com.jaxsquares.app.hostpass.yearly`, group "Host Pass", through `@capgo/native-purchases`. No sign-in needed; **Restore purchases** in Profile | App Store Server API (transaction, then subscription status), then App Store Server Notifications V2 |
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

- `POST /api/games/:id/lock` on an unpaid board: when the caller (the identity
  holding the admin token) or the board's host holds an active pass, the board
  is marked paid through the pass (`payment_provider` `pass`,
  `payment_amount_cents` 0, `payment_reference` = the pass id) in the same
  write as the draw. Otherwise the 402 is unchanged. Nobody without the admin
  token can draw, so nobody draws on someone else's pass.
- A linked board whose host holds an active pass draws itself at kickoff like a
  paid board, marked paid through the pass at that moment
  (`applyLiveUpdate`).
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
   `customer.subscription.updated` and `.deleted` (and `.created`): each one
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
| POST | `/api/payments/pass/stripe` | `{ clientSecret, amountCents, currency }`; 409 `account_required` without an account link; 409 `{ error, pass, offer }` when one is already active; 503 while `STRIPE_HOST_PASS_PRICE_ID` or the key is unset; 502 when Stripe errors |
| POST | `/api/payments/pass/stripe/confirm` | `HostPassState`, read back from Stripe |
| POST | `/api/payments/pass/portal` | `{ url }` (Customer Portal); 404 with no web pass here |
| POST | `/api/payments/pass/iap` | Body `{ transactionId, jws? }` → `HostPassState`; 400 (unknown, wrong product or app), 409 (held by another identity, no valid proof), 502 (Apple unreachable), 503 (no App Store key) |
| POST | `/api/payments/pass/iap/restore` | Body `{ transactions: [{ transactionId, jws? }] }` (up to 20) → `HostPassState & { restored }`; 409 when the only ones found belong to another identity without proof |
| POST | `/api/payments/apple/notifications` | App Store Server Notifications V2; `{ received: true, outcome: "updated" \| "ignored" }`; 400 on a bad signature |

### Client

- State: `useHostPass()` (`src/lib/useHostPass.ts`, next to `useHostFee`) over
  a small store (`src/lib/hostPassStore.ts`) that `GET /api/me` primes at
  startup and on sign-in, the pass routes update after a purchase, and
  sign-out clears. `useHostPassPrice()` gives "$9.99" (or the App Store's
  string); the UI says "$9.99/year".
- Checkout sheet at the draw (an unpaid board, no pass): "This board · $4.99"
  (the default) and "Host Pass · $9.99/year" ("Every board you host for a
  year", "Pays for itself on your second board"), one tap to switch
  (`plan-board`, `plan-pass`). The pass shows its subscription disclosure
  (`pass-disclosure`: name, length, price per period, auto-renews until
  canceled, how to cancel, Terms and Privacy). Bought at the draw, the host
  tools draw right away (the server marks the board paid through the pass).
- With an active pass the host bar, the Now card and the lock confirm read
  "Draw the numbers" with "Included with your Host Pass" (`host-pass-note`),
  no price, no pay-ahead; drawing just draws. If the server answers 402 (the
  pass ended meanwhile) the checkout opens as usual.
- Profile → Host Pass (`HostPassSection`): no pass: a pitch and Get (`pass-get`,
  through `startPassPurchase`); active: "Active · renews Oct 19, 2027" or "Ends
  Oct 19, 2027" (`pass-status`) and Manage (`pass-manage`: Apple's subscription
  management in the iOS app, the Customer Portal on the web, "End test pass"
  in test mode); iOS: Restore purchases (`pass-restore`).

### Setup (Host Pass)

Do these alongside the steps above. Every value below is a plain setting
(`wrangler.jsonc` → `vars`) except where it says secret; no new secrets are
needed. Never paste a secret in chat; `npx wrangler secret put NAME` prompts
for it.

**App Store Connect**

1. Your app → Monetization → **Subscriptions** → create a subscription group
   named **Host Pass**.
2. In it, add an auto-renewable subscription: reference name `Host Pass
   (yearly)`, product ID **`com.jaxsquares.app.hostpass.yearly`** (=
   `IAP_HOST_PASS_PRODUCT_ID` in `wrangler.jsonc`), duration **1 year**, price
   **$9.99**. Display name "Host Pass", description "Every board you host for a
   year: draw the numbers with no host fee." Add the review screenshot; submit
   it with an app version.
3. App Information → **App Store Server Notifications** → Version 2, for both
   Production and Sandbox: `https://jaxsquares.com/api/payments/apple/notifications`.
4. The App Store Server API key (`APPLE_IAP_KEY_ID`, `APPLE_IAP_ISSUER_ID`,
   `APPLE_IAP_PRIVATE_KEY`, secrets) and `APPLE_BUNDLE_ID` are the ones the
   board purchase already uses.

**Stripe**

1. Product catalog → add a product **Host Pass** with a **recurring** price,
   **$9.99 per year**. Copy the price id (`price_…`) into
   `STRIPE_HOST_PASS_PRICE_ID` in `wrangler.jsonc` → `vars` (it isn't a
   secret), and keep `HOST_PASS_PRICE_CENTS` (999) equal to it: the app shows
   that number on the web.
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
# { "priceCents": 999, "currency": "usd", "iapProductId": "com.jaxsquares.app.hostpass.yearly", "web": true }
npx wrangler d1 execute jaxsquares --remote --command \
  "SELECT provider, status, current_period_end, auto_renew, livemode FROM host_passes ORDER BY created_at DESC LIMIT 5"
```

## Not covered yet

- **Refunds don't undo a draw.** Refunding a board in Stripe or Apple leaves
  it paid (and drawn); a refunded Host Pass stops covering new draws (Apple's
  REFUND notification, or the subscription ending in Stripe) but boards it
  covered stay drawn. Handle `charge.refunded` for board purchases if that
  matters.
- **Older app builds.** An app build from the pay-to-open flow creates boards
  that open right away (it reads `paymentRequired: false`), but it can't pay at
  the draw: its "Draw the numbers" shows the 402's message until it updates.
- **Android app.** Google Play's payments policy will require Play Billing
  (for the board fee and the Host Pass) before an Android build ships on the
  Play Store. Until then, Android uses
  the Stripe web flow, which is fine for the web or PWA but not for a Play
  Store build.
- **Apple's JWS signature on API responses.** For the board purchase and the
  pass's API lookups, the server trusts `signedTransactionInfo` because it came
  straight from Apple over TLS. Signed data that reaches us any other way (Server
  Notifications, a restore's proof) is verified up to Apple's root (see "What
  the Apple JWS check verifies"); OCSP revocation isn't checked.
