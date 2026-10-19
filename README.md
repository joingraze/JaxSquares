# JaxSquares 🏈🟩

A mobile-first app for playing football squares with friends. Create a board,
share a link, and friends claim squares from their phones. No account or app
install needed (there's an iPhone app too, and an optional Sign in with Apple /
Google keeps your boards on every device), and every change shows up on every
open board within a second.

**No money moves between players, ever.** There are no prices per square, pots,
payouts or betting. A host can add a fun prize note per period ("Loser buys
wings"), and notes that mention money are rejected. The only payment in the
product is the host fee for a board, paid when the host draws its numbers, or
a yearly Host Pass that covers it on every board the host makes: setting up,
inviting and picking squares are free, and so is drawing a board whose squares
5 or fewer players hold.

## How the game works

1. **Create** a board in five guided steps: pick a real NFL/college game
   (scores then arrive automatically) or type in your own matchup and its
   kickoff, choose how squares win, show a square price and prizes (or keep it
   just for fun), name it and set a per-player square limit, review, and
   create it. It opens right away, free.
2. **Share** the invite link (`https://jaxsquares.com/g/<id>`). Friends open it,
   pick a name, color and emoji, and tap empty squares to claim them.
3. **Lock & draw**: the host locks the board, which randomly assigns the
   digits 0–9 to the rows and columns. It's free with up to 5 players holding
   squares; a bigger board needs the host fee first (or a Host Pass; a
   no-charge test checkout until payments go live). Linked boards lock
   themselves at kickoff once they're free, paid or covered by a Host Pass (the
   host can pay ahead).
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
too), and **new numbers each quarter** (quarters format). Every screen names
periods the same way (`periodPhrase` in `shared/formats.ts`: "Q1", "Half",
"Final" on chips; "at halftime", "at the end of Q1" in sentences).

## What's in the app

- **Guided create**: five steps that each start filled in (the soonest real
  game is pre-picked), so picking the game, Next three times and Create makes
  a properly set-up board, and Create opens it, free. The host fee comes at
  the draw, and only for boards of 6 or more players: Apple Pay / Google Pay
  on the web, In-App Purchase in the iPhone app ($4.99 a board, or the Host
  Pass at $19.99 a year).
- **Live board**: every claim, draw and score lands on every open phone within
  a second, with a scorebug, a "right now" winner, toasts and haptics, and a
  "N watching" count.
- **Live dashboard (Home)**: boards grouped Live now / Needs you / Up next /
  Final, each card updating in real time (Home follows your boards over the
  same sockets, without counting toward "watching"), with the latest score and
  who's winning, and one next action per card (invite, draw numbers, finish
  setup).
- **Activity inbox**: the bell on Home collects wins, friends joining and
  grabbing squares, numbers drawn, finals and "your board is full" across every
  board, with an unread count.
- **Invite**: a text-first share sheet (the message and link preview your
  friends get), plus a QR code and a six-character board code for people in
  the same room; "Join with a code" on Home takes the code or a pasted link.
  Links preview as "Join <board name>" in chat apps.
- **Host tools**: a host bar on the board with the next move (open, invite,
  lock & draw, enter a score), score entry, picking a winner by hand, editing
  the name, prize notes and square limit, ending or deleting the board, and a
  host link to run the board from another phone.
- **Notifications**: web push and native pushes for numbers drawn, kickoff,
  your square hitting, board full, friends joining (quietly) and game over;
  mute any single board; live alerts while a board is open
  ([docs/push.md](docs/push.md)).

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
  room.ts        GameRoom Durable Object (sockets, presence, live polling, delete)
  service.ts     Shared core operations (state, broadcast, live updates)
  scores/        ESPN schedule + live scores
  payments/      Stripe, Apple IAP, test checkout
  push/          Web push (VAPID) + FCM
migrations/      D1 migrations
src/             React app
  pages/         Routes (Home, CreateGame, GameView, Profile, Kit, ...)
  features/      Board, create (+ checkout), home (dashboard, inbox), host,
                 invite (QR, code), notifications
  components/ui  Component kit (browse at /kit in dev)
  lib/           api client, identity, live (useGame), native bridges, push, checkout
docs/            Architecture contract, payments, push, sign-in, iOS, App Store
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
| Payments | `PAYMENTS_MODE`, `BOARD_PRICE_CENTS`, `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`, `APPLE_IAP_KEY_ID`, `APPLE_IAP_ISSUER_ID`, `APPLE_IAP_PRIVATE_KEY`, `APPLE_BUNDLE_ID`, `IAP_PRODUCT_ID`; the Host Pass: `HOST_PASS_PRICE_CENTS`, `STRIPE_HOST_PASS_PRICE_ID`, `IAP_HOST_PASS_PRODUCT_ID` | [docs/payments.md](docs/payments.md) |
| Push | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `FCM_SERVICE_ACCOUNT` | [docs/push.md](docs/push.md) |
| App links | `APPLE_TEAM_ID`, `APPLE_BUNDLE_ID`, `ANDROID_PACKAGE`, `ANDROID_SHA256_CERT_FINGERPRINTS` | [docs/ios.md](docs/ios.md) |
| Sign-in (optional) | vars `GOOGLE_WEB_CLIENT_ID`, `GOOGLE_IOS_CLIENT_ID`, `APPLE_SERVICES_ID`; secrets `APPLE_KEY_ID`, `APPLE_SIGNIN_PRIVATE_KEY` (with `APPLE_TEAM_ID`) | [docs/auth.md](docs/auth.md) |
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
