# JaxSquares architecture contract

This is the agreed contract between the Worker, the client and the native shell.
Types live in `shared/types.ts`; this file covers endpoints, module boundaries and
behavior. Change the contract only by adding, never by renaming.

## Product rules (non-negotiable)

- No money moves between players, ever. No prices per square, pots, buy-ins,
  payouts, odds, "bet"/"wager" language. A host may add a free-text prize note per
  period ("Loser buys wings"). Copy never implies money changes hands in the app.
- The only payment is the creator paying JaxSquares to create a board: one tap with
  Apple Pay / Google Pay (Stripe) on the web, Apple In-App Purchase in the iOS app.
  With `PAYMENTS_MODE` unset the app runs a clearly labeled no-charge test checkout.
- No accounts. A device is identified by a random `clientId` (localStorage, plus
  Capacitor Preferences in the native app) sent as `x-client-id` on every request.
  The host additionally holds a per-game `adminToken` sent as `x-admin-token`.
- Real time: every mutation is pushed to every open board within one second.

## Runtime

- One Cloudflare Worker (Hono) serves `/api/*`, `/.well-known/*`, per-game link
  previews, and the React SPA via the `ASSETS` binding.
- D1 (`DB`) is the source of truth. All SQL lives in `worker/db.ts`.
- Durable Object `GameRoom` (`GAME_ROOM`, one per game id via `idFromName(gameId)`)
  holds the hibernatable WebSockets for that game, broadcasts state, tracks presence,
  and, for boards linked to a real game, polls live scores with an alarm while the
  game is on.
- Cron trigger (every minute) wakes the `GameRoom` of linked games that start within
  the next 15 minutes or are in progress, so polling starts on time.

## HTTP API

All JSON. Errors are `{ error: string }` with a 4xx/5xx status. `C` = needs
`x-client-id`, `H` = also needs `x-admin-token` for that game.

| Method | Path | Who | Body | Returns |
|---|---|---|---|---|
| GET | `/api/config` | – | – | `AppConfig` |
| GET | `/api/schedule?league=nfl\|ncaaf` | – | – | `{ events: ScheduleEvent[] }` (next ~10 days, cached) |
| POST | `/api/games` | C | `CreateGameInput` | `CreateGameResponse` (201) |
| GET | `/api/games/:id` | – | – | `GameState` |
| PATCH | `/api/games/:id` | C H | `UpdateGameInput` | `{ state }` |
| DELETE | `/api/games/:id` | C H | – | `{ ok: true }` |
| POST | `/api/games/:id/join` | C | `JoinInput` | `{ state }` (upsert; also used to rename) |
| POST | `/api/games/:id/claim` | C | `CellsInput` | `{ claimed: number, skipped: number, state }` |
| POST | `/api/games/:id/release` | C | `CellsInput` | `{ state }` |
| POST | `/api/games/:id/lock` | C H | – | `{ state }` (draws numbers) |
| POST | `/api/games/:id/scores` | C H | `ScoreInput` | `{ state }` |
| DELETE | `/api/games/:id/scores/:periodKey` | C H | – | `{ state }` |
| POST | `/api/games/:id/winners` | C H | `ManualWinnerInput` | `{ state }` |
| DELETE | `/api/games/:id/winners/:periodKey` | C H | – | `{ state }` |
| POST | `/api/games/:id/final` | C H | – | `{ state }` (host ends the game) |
| GET | `/api/games/:id/live` | – | WebSocket upgrade | stream of `LiveMessage` |
| GET | `/api/me/games` | C | – | `{ games: GameSummary[] }` (hosted ∪ joined) |
| POST | `/api/games/:id/pay/test` | C H | – | `{ state }` (test mode only; activates draft) |
| POST | `/api/games/:id/pay/stripe` | C H | – | `{ clientSecret }` (PaymentIntent for this board) |
| POST | `/api/games/:id/pay/iap` | C H | `{ transactionId }` | `{ state }` (verifies with Apple, activates) |
| POST | `/api/stripe/webhook` | Stripe | raw | `{ received: true }` |
| POST | `/api/push/register` | C | `PushRegistration` | `{ ok: true }` |
| POST | `/api/push/unregister` | C | `{ endpoint? , token? }` | `{ ok: true }` |
| POST | `/api/games/:id/mute` | C | `{ muted: boolean }` | `{ ok: true }` |
| GET | `/api/health` | – | – | `{ ok: true }` |

Non-API routes:
- `GET /.well-known/apple-app-site-association` and `/.well-known/assetlinks.json`
  for universal / app links on `/g/*`.
- `GET /g/:id` serves `index.html` with per-game Open Graph tags (HTMLRewriter) so an
  invite pasted in iMessage/WhatsApp previews as "Join <board name>".

## Game rules (implemented in `shared/`)

- `shared/formats.ts`: presets → periods. quarters = Q1, Half (q2), Q3, Final;
  halves = Half, Final; final = Final; every-score = no fixed periods, each score
  entry `s1..sN` is a period. `reverse` adds a reverse winner per period. Board size
  100 (10x10) or 25 (5x5, two digits per row/col). `freshNumbers` (quarters only)
  draws one `NumberDraw` per quarter; otherwise a single draw under `"*"`.
- `shared/squares.ts`: drawing numbers, winning cell for a score (last digit of each
  team's score mapped to the row/col whose digit list contains it), reverse cell,
  `resolveResults(state)` → per-period results honoring `ManualWinner` overrides,
  and dashboard helpers. Pure and unit-tested.
- "Final" includes overtime. Every-score boards record each change in either team's
  score as a new entry.

## Module ownership (one owner per file)

- `shared/*` – game rules + types. `worker/db.ts`, `worker/index.ts`,
  `worker/room.ts` (GameRoom DO), `migrations/*` – core API.
- `worker/scores/*` – ESPN schedule + live score provider. Exports
  `scheduleRoutes` (Hono) and `fetchLiveForEvent(event): Promise<LiveUpdate|null>`.
- `worker/payments/*` – Stripe + IAP + test checkout. Exports `paymentsRoutes`
  (Hono) and `getPaymentConfig(env)`.
- `worker/push/*` – web push (VAPID) + FCM. Exports `pushRoutes` (Hono) and
  `notify(env, gameId, event)`.
- `public/sw.js`, `public/manifest.webmanifest`, icons, `capacitor.config.ts`,
  `ios/`, `android/` – native/PWA shell.
- `src/*` – client. `src/lib/api.ts` (typed client, `API_BASE` aware),
  `src/lib/live.ts` (socket + fallback polling), `src/lib/identity.ts`,
  `src/lib/native.ts` (Capacitor bridges: share, haptics, push, IAP).

## Client ↔ native

- The native app bundles the built SPA (`dist/client`) and talks to
  `VITE_API_BASE` (default `https://jaxsquares.com`). The web build uses same-origin.
- Invite links are `https://jaxsquares.com/g/<id>`; universal links open the app,
  everyone else gets the web app with no install needed.

## Cross-module function contracts

`worker/service.ts` (core) — used by payments, push and the room:
```ts
loadState(env: Env, gameId: string): Promise<GameState | null>
/** Re-read state from D1 and push it to every socket in the game's room. */
broadcast(env: Env, gameId: string, activity?: Activity): Promise<GameState | null>
/** draft -> open after a successful payment. Idempotent. */
activateGame(env: Env, gameId: string, purchase: { provider: "test" | "stripe" | "iap"; reference: string; amountCents: number }): Promise<GameState | null>
isHost(env: Env, gameId: string, adminToken: string): Promise<boolean>
/** Apply a provider update to a linked board: upsert live status + period scores, diff every-score entries. */
applyLiveUpdate(env: Env, gameId: string, update: LiveUpdate): Promise<void>
```
`worker/db.ts` (core) keeps exporting `getGame(db, id)` and `getPlayers(db, gameId)` for other modules.

`worker/scores/index.ts` (scores):
```ts
scheduleRoutes: Hono<{ Bindings: Env }>          // GET /schedule
fetchLiveForEvent(event: LinkedEvent): Promise<LiveUpdate | null>
```
`worker/payments/index.ts` (payments):
```ts
paymentsRoutes: Hono<{ Bindings: Env }>          // /games/:id/pay/*, /stripe/webhook
getPaymentConfig(env: Env): PaymentConfig
```
`worker/push/index.ts` (push):
```ts
pushRoutes: Hono<{ Bindings: Env }>              // /push/*, /games/:id/mute
type NotifyEvent =
  | { kind: "numbers-drawn" }
  | { kind: "winner"; periodKey: string; label: string; clientIds: string[] }
  | { kind: "game-starting" }
  | { kind: "board-full" }
  | { kind: "player-joined"; name: string }
  | { kind: "final" }
notify(env: Env, gameId: string, event: NotifyEvent): Promise<void>   // call via ctx.waitUntil
```
`worker/index.ts` mounts the three routers under `/api` and calls `notify` from the
core routes. Each module owns its own migration file: core `0002_*`, payments
`0003_*`, push `0004_*`.
