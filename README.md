# JaxSquares 🏈🟩

A mobile-first app for playing football squares with friends. Create a board,
share a link, and friends claim squares from their phones. No accounts, no app
install needed (there's an iPhone app too), and every change shows up on every
open board within a second.

**No money moves between players, ever.** There are no prices per square, pots,
payouts or betting. A host can add a fun prize note per period ("Loser buys
wings"), and notes that mention money are rejected. The only payment in the
product is the host paying once to create a board.

## How the game works

1. **Create** a board: pick a real NFL/college game (scores then arrive
   automatically) or type in your own matchup, choose a format, add optional
   prize notes and a per-player square limit, and pay to open it (a no-charge
   test checkout until payments go live).
2. **Share** the invite link (`https://jaxsquares.com/g/<id>`). Friends open it,
   pick a name, color and emoji, and tap empty squares to claim them.
3. **Lock & draw**: the host locks the board, which randomly assigns the digits
   0–9 to the rows and columns. Linked boards lock themselves at kickoff.
4. **Score**: the winning square is where the last digit of each team's score
   meets. Linked boards score themselves from live data; the host can enter or
   correct scores and pick a winner by hand. Winners light up, get a push and see
   the host's prize note.

Formats (`shared/formats.ts`):

| Format | Winners |
|---|---|
| Every quarter | Q1, Half, Q3, Final |
| Halftime + Final | Half, Final |
| Final score | Final (overtime counts) |
| Every score | each time the score changes |

Options: **Classic 10×10** (100 squares) or **Quick 5×5** (25 squares, two digits
per row/column), **reverse winners** (the square with the digits swapped wins
too), and **new numbers each quarter** (quarters format).

The host's device keeps an admin token for the board; everyone else is
identified only by an anonymous device id. See "Identity" in
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Stack

- **Frontend:** React + Vite + TypeScript + Tailwind CSS v4, mobile-first SPA
- **Backend:** one Cloudflare Worker (Hono) serving `/api/*` and the SPA
  (Workers Static Assets with SPA fallback) via `@cloudflare/vite-plugin`
- **Data:** Cloudflare D1 (SQLite); a `GameRoom` Durable Object per game for
  live WebSockets and live-score polling
- **Native:** Capacitor iOS shell ([docs/ios.md](docs/ios.md))

## Project layout

```
shared/          Types + pure game logic (used by client AND worker, unit-tested)
  types.ts       Domain + API types
  squares.ts     Number drawing, winners, per-period results
  formats.ts     Formats, periods, prize-note rules
  playerId.ts    Public player id derivation
worker/          Cloudflare Worker
  index.ts       Core routes, well-known files, invite previews, cron
  db.ts          Core D1 access
  room.ts        GameRoom Durable Object (sockets, presence, live polling)
  service.ts     Shared core operations (state, broadcast, live updates)
  scores/        ESPN schedule + live scores
  payments/      Stripe, Apple IAP, test checkout
  push/          Web push (VAPID) + FCM
migrations/      D1 migrations
src/             React app
  pages/         Routes (Home, CreateGame, GameView, Profile, Kit, ...)
  features/      Board, create, host, invite, notifications
  components/ui  Component kit (browse at /kit in dev)
  lib/           api client, identity, live (useGame), native bridges, push, checkout
docs/            Architecture contract, payments, push, iOS, App Store
```

## Local development

Needs Node 22+ and wrangler v4 (installed as a dev dependency).

```bash
npm install
npm run db:migrate:local     # create + migrate the local D1 database
npm run dev                  # http://localhost:5173
```

`npm run dev` runs the React app and the Worker together (local, file-backed D1
and Durable Objects) through the Cloudflare Vite plugin. With no secrets set,
everything works: checkout is the no-charge test mode, pushes are off, and live
scores come from ESPN's public feed.

Re-run `npm run db:migrate:local` whenever a new file lands in `migrations/`.

> In a sandbox without internet you may see a one-time `Unable to fetch the
> Request.cf object` warning. It's harmless.

## Quality gates

```bash
npm run typecheck   # tsc across app, worker, and config projects
npm run test        # vitest: game logic, client, worker routes (node:sqlite D1)
npm run build       # production build (client + worker)
```

## Secrets and configuration

Set secrets with `npx wrangler secret put <NAME>`; plain vars go in
`wrangler.jsonc` → `vars`. Every integration stays off (and the app keeps
working) until its values are set.

| Area | Names | Guide |
|---|---|---|
| Payments | `PAYMENTS_MODE`, `BOARD_PRICE_CENTS`, `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`, `APPLE_IAP_KEY_ID`, `APPLE_IAP_ISSUER_ID`, `APPLE_IAP_PRIVATE_KEY`, `APPLE_BUNDLE_ID`, `IAP_PRODUCT_ID` | [docs/payments.md](docs/payments.md) |
| Push | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `FCM_SERVICE_ACCOUNT` | [docs/push.md](docs/push.md) |
| App links | `APPLE_TEAM_ID`, `APPLE_BUNDLE_ID`, `ANDROID_PACKAGE`, `ANDROID_SHA256_CERT_FINGERPRINTS` | [docs/ios.md](docs/ios.md) |
| General | `APP_ORIGIN` | `wrangler.jsonc` |

## Deploying to Cloudflare

Pushes to `main` deploy through `.github/workflows/deploy.yml` (typecheck, test,
apply D1 migrations, build, deploy) with one repository secret,
`CLOUDFLARE_API_TOKEN`. To deploy by hand:

```bash
npm run db:migrate:remote
npm run deploy               # builds the SPA + Worker and publishes them together
```

The D1 database id is already in `wrangler.jsonc`. For a fresh Cloudflare
account, create one with `npx wrangler d1 create jaxsquares` and paste its id
into `d1_databases[0].database_id`.
