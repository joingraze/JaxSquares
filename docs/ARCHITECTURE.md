# JaxSquares architecture contract

This is the agreed contract between the Worker, the client and the native shell.
Types live in `shared/types.ts`; this file covers endpoints, module boundaries and
behavior. Change the contract only by adding, never by renaming (the one
exception so far: the public-id rename below, which closed an impersonation hole).

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
- Prize notes never mention money: `validatePrizeNote` (`shared/formats.ts`)
  rejects currency symbols/amounts and money, payment-app and betting words; the
  API answers 400 "Prize notes can't include money. Try something like 'Loser
  buys wings'." (App Store guideline 5.3).

## Identity: secret clientId, public player id

The `clientId` is a bearer credential: whoever sends it *is* that player. So it
is only ever sent as the `x-client-id` header and is never returned by the API,
put in a URL, pushed over a socket or shown in the UI.

Everything public names a player by their **public player id**:

```
playerId = base64url(SHA-256("jaxsquares:player:" + clientId)).slice(0, 22)
```

(`shared/playerId.ts`: `derivePlayerId` via WebCrypto, `derivePlayerIdSync` for
the same value synchronously.) It is stable per device and one-way.

| Where | Field (public id) |
|---|---|
| `Game` | `hostPlayerId` |
| `Player` | `id` |
| `Square` | `playerId` |
| `Activity` | `actor` (null for system events), winner `data.playerIds` |
| `PeriodResult` (`resolveResults`) | `winnerPlayerId`, `reverseWinnerPlayerId`; `winnersOf`, `myWins`, `winCounts`, `countClaimedBy`, `liveCell().playerId` all take/return public ids |
| Live socket | `?player=<public id>` |
| `GameSummary` | none (computed per device: `isHost`, `mySquares`, `myWins`) |

- Server: D1 stores clientIds (`players.client_id`, `squares.client_id`,
  `games.host_client_id`); `worker/db.ts` derives public ids on read (memoized in
  `worker/playerIds.ts`). New activity rows store the public id; legacy rows that
  hold clientIds are translated on read, and anything unrecognised is dropped.
  `getMembers()` (server-only `Member = Player & { clientId }`) is the one place
  clientIds leave `db.ts`, so push can find a player's devices.
- Client: `getPlayerId()` in `src/lib/identity.ts` (computed with WebCrypto in
  `hydrateIdentity()`, sync afterwards). "Mine" is always
  `square.playerId === getPlayerId()`; `claimPatch`/`releasePatch` take it too.

## Runtime

- One Cloudflare Worker (Hono) serves `/api/*`, `/.well-known/*`, per-game link
  previews, and the React SPA via the `ASSETS` binding.
- D1 (`DB`) is the source of truth. Core SQL lives in `worker/db.ts`; tables a
  module owns are queried only by that module's store file
  (`worker/payments/store.ts`: `purchases`; `worker/push/store.ts`:
  `push_subscriptions`, `game_mutes`).
- Durable Object `GameRoom` (`GAME_ROOM`, one per game id via `idFromName(gameId)`)
  holds the hibernatable WebSockets for that game, broadcasts state, tracks presence,
  and, for boards linked to a real game, polls live scores with an alarm while the
  game is on.
- Cron trigger (every minute) wakes the `GameRoom` of linked games that start within
  the next 15 minutes or are in progress, so polling starts on time. Once an hour
  (UTC minute 17) it also runs housekeeping (`worker/housekeeping.ts`): deletes
  boards still in `draft` (never paid) 7 days after creation, prunes activity
  beyond the newest 200 per game, and drops expired rate-limit windows.

## HTTP API

All JSON. Errors are `{ error: string }` with a 4xx/5xx status; the message is
friendly enough to show as-is. `C` = needs `x-client-id`, `H` = also needs
`x-admin-token` for that game. `429` = rate limited (see below; has `Retry-After`).

| Method | Path | Who | Body | Returns |
|---|---|---|---|---|
| GET | `/api/config` | – | – | `AppConfig` |
| GET | `/api/schedule?league=nfl\|ncaaf` | – | – | `{ events: ScheduleEvent[] }` (next ~10 days, cached) |
| POST | `/api/games` | C | `CreateGameInput` | `CreateGameResponse` (201); 400 on a money prize note; 429 |
| GET | `/api/games/:id` | – | – | `GameState` |
| PATCH | `/api/games/:id` | C H | `UpdateGameInput` | `{ state }`; 400 on a money prize note |
| DELETE | `/api/games/:id` | C H | – | `{ ok: true }` |
| POST | `/api/games/:id/join` | C | `JoinInput` | `{ state }` (upsert; also used to rename) |
| POST | `/api/games/:id/claim` | C | `CellsInput` | `{ claimed: number, skipped: number, state }`; 429 |
| POST | `/api/games/:id/release` | C | `CellsInput` | `{ state }`; 429 |
| POST | `/api/games/:id/lock` | C H | – | `{ state }` (draws numbers) |
| POST | `/api/games/:id/scores` | C H | `ScoreInput` | `{ state }`. Every-score boards: `periodKey` `"next"` (or `""`) appends entry `s(N+1)`; `sN` edits an existing entry |
| DELETE | `/api/games/:id/scores/:periodKey` | C H | – | `{ state }` |
| POST | `/api/games/:id/winners` | C H | `ManualWinnerInput` | `{ state }` |
| DELETE | `/api/games/:id/winners/:periodKey` | C H | – | `{ state }` |
| POST | `/api/games/:id/final` | C H | – | `{ state }` (host ends the game) |
| GET | `/api/games/:id/live?player=<public id>` | – | WebSocket upgrade | stream of `LiveMessage` (see "Live socket") |
| GET | `/api/me/games` | C | – | `{ games: GameSummary[] }` (hosted ∪ joined) |
| POST | `/api/games/:id/pay/test` | C H | – | `{ state }` (test mode only; activates draft) |
| POST | `/api/games/:id/pay/stripe` | C H | – | `{ clientSecret }` (PaymentIntent for this board) |
| POST | `/api/games/:id/pay/iap` | C H | `{ transactionId }` | `{ state }` (verifies with Apple, activates) |
| POST | `/api/stripe/webhook` | Stripe | raw | `{ received: true }` |
| POST | `/api/push/register` | C | `PushRegistration` | `{ ok: true }` |
| POST | `/api/push/unregister` | C | `{ endpoint? , token? }` | `{ ok: true }` |
| POST | `/api/push/test` | C | – | `{ ok: true, devices, sent, failed }` (sends "you're all set" to this device's registrations) |
| GET | `/api/games/:id/mute` | C | – | `{ muted: boolean }` |
| POST | `/api/games/:id/mute` | C | `{ muted: boolean }` | `{ ok: true }` |
| GET | `/api/health` | – | – | `{ ok: true }` |

Rate limits (`worker/rateLimit.ts`, fixed windows in the D1 `rate_limits` table
keyed by `<rule>:<public player id>`; fail open if the table is unavailable):

| Rule | Limit | Counts |
|---|---|---|
| `create` | 10 per device per hour | valid `POST /api/games` requests |
| `squares` | 60 per device per minute | `claim` + `release` together |

Non-API routes:
- `GET /.well-known/apple-app-site-association` and `/.well-known/assetlinks.json`
  for universal / app links on `/g/*`.
- `GET /g/:id` serves `index.html` with per-game Open Graph tags (HTMLRewriter) so an
  invite pasted in iMessage/WhatsApp previews as "Join <board name>".
- `assetlinks.json` reads `ANDROID_PACKAGE` (default `com.jaxsquares.app`) and
  `ANDROID_SHA256_CERT_FINGERPRINTS` (comma-separated); the AASA file reads
  `APPLE_TEAM_ID` and `APPLE_BUNDLE_ID`.

## Live socket

`GET /api/games/:id/live?player=<public player id>` upgrades to a WebSocket held
by the game's `GameRoom` (hibernatable). The `player` param only de-duplicates
the watcher count across tabs; the Worker forwards it only when it is a
well-formed public id and ignores everything else in the query.

Server → client (`LiveMessage`, JSON):
- `{ type: "state", state }` first on connect, then after every mutation. Clients
  keep the highest `version` (equal versions are re-applied).
- `{ type: "event", activity }` once per new activity (toasts, haptics).
- `{ type: "presence", watching }` whenever a device connects or leaves.

Keepalive: the client sends the text `ping` every 25 s and the room answers
`pong` without waking from hibernation (a JSON `{"type":"ping"}` gets
`{"type":"pong"}`). A client that hears nothing for 70 s drops the socket and
reconnects (backoff 0.5–15 s, polling `GET /api/games/:id` every 15 s
meanwhile). Close code **4404** means the board was deleted: stop reconnecting
and show "not found".

## Activity

`Activity.actor` is the public id of whoever did it, or null for system events.
`data` per type (`ActivityData` in `shared/types.ts`):

| type | data |
|---|---|
| `created` | `{}` |
| `joined` | `{ name }` |
| `claimed` | `{ count, cells: {row, col}[] }` (only what this request actually got) |
| `released` | `{ count, cells }` |
| `locked` | `{}` host draw, `{ auto: true }` at kickoff (actor null) |
| `score` | `{ periodKey, label, scoreX, scoreY, source: "live" \| "host" }` |
| `winner` | `{ periodKey, label, playerIds, cell, reverseCell?, prize, manual? }` |
| `final` | `{}` |

`GameState.activity` holds the newest 50; the hourly cron keeps the newest 200
rows per game in D1.

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

- `shared/*` – game rules + types (`playerId.ts` = public id derivation).
  `worker/db.ts`, `worker/index.ts`, `worker/service.ts`, `worker/room.ts`
  (GameRoom DO), `worker/playerIds.ts`, `worker/rateLimit.ts`,
  `worker/housekeeping.ts`, `migrations/*` – core API.
- `worker/scores/*` – ESPN schedule + live score provider. Exports
  `scheduleRoutes` (Hono) and `fetchLiveForEvent(event): Promise<LiveUpdate|null>`.
- `worker/payments/*` – Stripe + IAP + test checkout. Exports `paymentsRoutes`
  (Hono) and `getPaymentConfig(env)`. Owns `worker/payments/store.ts` (its D1 tables).
- `worker/push/*` – web push (VAPID) + FCM. Exports `pushRoutes` (Hono) and
  `notify(env, gameId, event)`. Owns `worker/push/store.ts` (its D1 tables).
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
`worker/db.ts` (core) keeps exporting `getGame(db, id)` and `getPlayers(db, gameId)`
(public shapes) for other modules, plus `getMembers(db, gameId): Member[]`
(players with their clientIds; server-only, used by push).

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
type NotifyEvent = (
  | { kind: "numbers-drawn" }
  | { kind: "winner"; periodKey: string; label: string; playerIds: string[] }   // public ids
  | { kind: "game-starting" }
  | { kind: "board-full" }
  | { kind: "player-joined"; name: string }
  | { kind: "final" }
) & {
  /** Public player id of whoever caused it; they aren't notified about their own action. */
  actor?: string;
};
notify(env: Env, gameId: string, event: NotifyEvent): Promise<void>   // call via ctx.waitUntil
```
Core passes `actor` on host actions: `numbers-drawn` from `POST /lock`, `final`
from `POST /final` and from a typed-in board's Final score, and
`player-joined`. `winner` never has an actor (you hear about your own square even
when you typed the score); live-score events have none either. Push resolves
public ids to devices through `getMembers()`.
`worker/index.ts` mounts the three routers under `/api` and calls `notify` from the
core routes. Each module owns its own migration file: core `0002_*` and
`0005_housekeeping.sql` (rate limits, draft-cleanup index), payments `0003_*`,
push `0004_*`.
