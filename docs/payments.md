# Payments

The only money in JaxSquares is a host paying once to create a board. Nothing
moves between players. A new board starts as a `draft`, and paying switches it
to `open`.

| Where the host is | How they pay | Server check |
|---|---|---|
| Web (any browser) | Apple Pay or Google Pay in one tap, with a card form if the device has no wallet (Stripe) | Stripe webhook, plus a direct PaymentIntent check |
| iOS app | Apple In-App Purchase (a consumable product) | App Store Server API |
| Anywhere, while `PAYMENTS_MODE` isn't `live` | No-charge test checkout | None |

**Why there are two payment methods:** App Store Review Guideline 3.1.1 says that
anything unlocked inside an iOS app, including digital content and features, has
to be bought with In-App Purchase. Creating a board counts as a digital unlock,
so the iOS app uses IAP and never shows Stripe. Don't show the web price or link
to the web checkout from inside the iOS app.

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
     whose only permission is **PaymentIntents: Write**. The secret key
     (`sk_live_…`) also works.
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
   - Events: `payment_intent.succeeded` and `payment_intent.canceled`
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
   - Display name "Squares board". Description "Create one squares board to
     play with your friends."
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
   - Call `recoverIAPPurchases(getAdminToken)` from `src/lib/checkout.ts` once
     at app launch. If the app is killed between Apple charging and the server
     confirming, the board opens on the next launch. Each purchase carries the
     board id in StoreKit's `appAccountToken`, so it can't be used for a
     different board.

The server verifies each purchase by calling
`GET /inApps/v1/transactions/{transactionId}` with an ES256 JWT (`aud`
`appstoreconnect-v1`, `bid` = bundle id) signed with the `.p8` key. It then
checks the bundle id, the product id, that the purchase wasn't refunded, and
that it's bound to this board. A unique ledger entry stops one transaction from
opening two boards.

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

`/api/config` is cached for up to 5 minutes, so give clients that long to
pick up the switch.

Check it worked:

```bash
curl -s https://jaxsquares.com/api/config | jq .payments
# { "mode": "live", "priceCents": 499, "currency": "usd", "stripePublishableKey": "pk_live_…", "iapProductId": "com.jaxsquares.app.board" }
```

Then create a board in Safari, pay with Apple Pay, and look at the ledger:

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

`migrations/0003_purchases.sql` creates the `purchases` table. It has one row
per payment reference:

| `provider` | `reference` |
|---|---|
| `test` | `test:<game id>` |
| `stripe` | the PaymentIntent id |
| `iap` | the Apple transactionId |

The table has no foreign key to `games`, on purpose. Deleting a board doesn't
erase its payment, and doesn't free its Apple transaction to be used again.

```sql
-- Real revenue by method (gross, before Stripe fees / Apple commission)
SELECT provider, COUNT(*) AS boards, SUM(amount_cents) / 100.0 AS usd
FROM purchases WHERE status = 'paid' AND livemode = 1 GROUP BY provider;
```

## API

| Method | Path | Notes |
|---|---|---|
| POST | `/api/games/:id/pay/test` | Host only. Only works in test mode. Returns `{ state }`. |
| POST | `/api/games/:id/pay/stripe` | Host only. Returns `{ clientSecret }` and reuses the board's open PaymentIntent. If the board is already open it returns `409 { error, state }`. That includes a board that was just paid while the webhook hasn't arrived yet: the server checks with Stripe and opens it on the spot. |
| POST | `/api/games/:id/pay/iap` | Host only. Body `{ transactionId }`. Returns `{ state }`. Errors are 400 (Apple has no record of it, wrong product or app, refunded, bound to another board), 409 (already opened another board) and 502 (couldn't reach Apple, so retry). |
| POST | `/api/stripe/webhook` | Called by Stripe. Returns `{ received: true }`. |

## Client (`src/lib/checkout.ts`)

The module has no UI. The checkout sheet uses it like this:

```ts
const { payments } = await fetchAppConfig();
const method = checkoutMethod(payments, platform()); // "test" | "iap" | "wallet" | "card"
preloadCheckout(payments, platform());               // warm Stripe.js / StoreKit as the sheet opens
const label = `Create board · ${formatPrice(payments.priceCents, payments.currency)}`;

// test:   state = await payTest(gameId, adminToken)
// iap:    const r = await payWithIAP(gameId, adminToken)  // { status: "paid", state } | { status: "cancelled" } | { status: "pending" }
// wallet: const { clientSecret } = await createStripeIntent(gameId, adminToken)
//         mountWalletButton(el, { clientSecret, amountCents, label: "Squares board",
//           onPaid: async () => (state = await confirmStripePaid(gameId, adminToken)),
//           onUnavailable: () => switchTo("card"), onCancel, onError })
// card:   const form = await mountCardForm(el, { clientSecret, onChange: setComplete })
//         if ((await form.submit()).status === "paid") state = await confirmStripePaid(gameId, adminToken)
```

Every failure is a `CheckoutError` with a message the host can read. `status`
is 0 when the request never reached the server, and `state` is set when the
board is already open.

## Not covered yet

- **Refunds don't close a board.** Refunding in Stripe or Apple leaves the board
  open. Handle `charge.refunded` and Apple's App Store Server Notifications V2 if
  that matters.
- **Android app.** Google Play's payments policy will require Play Billing
  before an Android build ships on the Play Store. Until then, Android uses
  the Stripe web flow, which is fine for the web or PWA but not for a Play
  Store build.
- **Apple's JWS signature.** The server trusts `signedTransactionInfo` because
  it came straight from Apple over TLS. It doesn't verify the JWS certificate
  chain.
