# JaxSquares architecture contract

This is the agreed contract between the Worker, the client and the native shell.
Types live in `shared/types.ts`; this file covers endpoints, module boundaries and
behavior. Change the contract only by adding, never by renaming (the one
exception so far: the public-id rename below, which closed an impersonation hole).

## Product rules (non-negotiable)

- No money moves between players, ever: the app never collects, holds, sends or
  tracks payment between them. A host may show a **square price** and **prize
  amounts** as structured, display-only fields (`GameFormat.squarePrice`,
  `Prize.amount`) in "$" or points (`GameFormat.unit`), or mark the board **just
  for fun** (`GameFormat.justForFun`: no amounts, players see a badge). Amounts
  are empty by default, so a default board shows no money at all. The inputs
  carry "Shown to everyone before they pick squares. JaxSquares never collects
  or sends money." No betting vocabulary anywhere ("bet", "wager", "pot",
  "payout", "buy-in", "jackpot", "odds", "stakes", "gamble"): say "square price",
  "prize", "amount".
- Amounts never leave the app: not in push notifications, link previews/OG
  tags, invite or share text, or activity data. A host's free-text note ("Loser
  buys wings") may be quoted in a push.
- The only payment is the creator paying JaxSquares to create a board: one tap with
  Apple Pay / Google Pay (Stripe) on the web, Apple In-App Purchase in the iOS app.
  With `PAYMENTS_MODE` unset the app runs a clearly labeled no-charge test checkout.
- No accounts. A device is identified by a random `clientId` (localStorage, plus
  Capacitor Preferences in the native app) sent as `x-client-id` on every request.
  The host additionally holds a per-game `adminToken` sent as `x-admin-token`.
- Real time: every mutation is pushed to every open board within one second.
- Prize notes never mention money: `validatePrizeNote` (`shared/formats.ts`)
  rejects cash, payment-app and betting talk with `PRIZE_MONEY_ERROR` ("Notes
  can't mention cash or payment apps. Keep it fun, like 'Loser buys wings'.")
  and a currency amount (symbols, codes, "20usd", paying or owing an amount)
  with `PRIZE_AMOUNT_ERROR` ("Put amounts in the amount box. Notes are for
  extras, like 'Loser buys wings'."); the API answers 400 with either (App
  Store guideline 5.3). The same check (`mentionsMoney`) covers the board name
  (every push's title), team names and every-score labels: 400 with
  `MONEY_ERRORS.name` / `.team` / `.label`.

## Identity: secret clientId, public player id

The `clientId` is a bearer credential: whoever sends it *is* that player. So it
is only ever sent as the `x-client-id` header and is never returned by the API,
put in a URL, pushed over a socket or shown in the UI. A valid one is 8–64
base64url chars and never exactly 22 (`isClientId` in `shared/playerId.ts`): a
public id is in every `GameState`, and sent as a clientId it would be taken for
that player's own entries, so the API answers 401 (the app's ids are 32 or 36).

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
- Durable Object `ScoreHub` (`SCORE_HUB`, one per league via `idFromName("espn:nfl")`)
  is the only thing that calls ESPN: every room's live poll and every
  `/api/schedule` request goes through it, so concurrent callers share one
  in-flight fetch and its memory is one cache for the whole app (ESPN sees about
  one request per scoreboard per TTL however many boards are live). Without the
  binding, or if it fails, callers fetch directly (`worker/scores/hub.ts`).
- Cron trigger (every minute) wakes the `GameRoom` of linked games that start within
  the next 15 minutes or are in progress, so polling starts on time. Once an hour
  (UTC minute 17) it also runs housekeeping (`worker/housekeeping.ts`): deletes
  boards still in `draft` (never paid) 7 days after creation (closing their
  rooms like a host delete), prunes activity beyond the newest 200 per game, and
  drops expired rate-limit windows. An App Store purchase for a deleted draft
  that's confirmed later isn't lost: `/pay/iap` keeps it as `unused` (410); so
  does the Stripe webhook for a board deleted before its payment landed.

## HTTP API

All JSON. Errors are `{ error: string }` with a 4xx/5xx status; the message is
friendly enough to show as-is. `C` = needs `x-client-id`, `H` = also needs
`x-admin-token` for that game. `429` = rate limited (see below; has `Retry-After`).

| Method | Path | Who | Body | Returns |
|---|---|---|---|---|
| GET | `/api/config` | – | – | `AppConfig` (`no-store`: a switch to live checkout or a new price reaches clients at once; the client reuses it for a minute) |
| GET | `/api/schedule?league=nfl\|ncaaf[&week=2-8]` | – | – | `ScheduleResponse`: without `week`, the first week with games to link (`week`, `events`) and the weeks after it (`weeks`); with `week` (`<season type>-<week>`), that week's `events`. Cached; `{ events: [], unavailable: true }` when ESPN is down |
| POST | `/api/games` | C | `CreateGameInput` | `CreateGameResponse` (201); 400 on bad rules (see "Rules and prizes"), money in a note, the name or a team name; 429. The stored format is canonical (rules always present, `periods`/`reverse` derived) and `prizes` is `{}`: an older client's preset and notes become rules |
| GET | `/api/games/:id` | – | – | `GameState` |
| GET | `/api/games/:id/host-check` | C H | – | `{ ok: true }`; 403 when `x-admin-token` isn't this board's, 404 for no board. A device checks a host link's token here before trusting it |
| PATCH | `/api/games/:id` | C H | `UpdateGameInput` | `{ state }`; 400 on money in a note or the name, bad rules; 409 when `format` changes something locked (see "Rules and prizes"). A `format` edit writes the canonical format + fixed `periods`, clears legacy `prizes`, logs a `rules` activity and broadcasts (never pushed). `prizes` from an older client land in the rules' notes on a board that has rules |
| DELETE | `/api/games/:id` | C H | – | `{ ok: true }`; open sockets get `{ type: "deleted" }` then close 4404 |
| POST | `/api/games/:id/join` | C | `JoinInput` | `{ state }` (upsert; also used to rename); 409 once the board has `MAX_PLAYERS` (200, `shared/squares.ts`) and you aren't one of them; 429 |
| DELETE | `/api/games/:id/players/:playerId` | C H | – | `{ state }`: removes that player (public id) and frees their squares while the board is `draft`/`open`; 400 for the host, 404 if not on the board, 409 once locked. They may join again |
| POST | `/api/games/:id/claim` | C | `CellsInput` | `{ claimed: number, skipped: number, state }`; 429 |
| POST | `/api/games/:id/release` | C | `CellsInput` | `{ state }`; 429 |
| POST | `/api/games/:id/lock` | C H | – | `{ state }` (draws numbers) |
| POST | `/api/games/:id/scores` | C H | `ScoreInput` | `{ state }`. Every-score boards: `periodKey` `"next"` (or `""`) appends entry `s(N+1)`; `sN` edits an existing entry (a `label` mentioning money is a 400). Re-saving a period's recorded score is written but not announced again (no score/winner activity or push) |
| DELETE | `/api/games/:id/scores/:periodKey` | C H | – | `{ state }`. On every-score boards the entry's host pick goes with it (the next entry reuses the index) |
| POST | `/api/games/:id/winners` | C H | `ManualWinnerInput` | `{ state }` |
| DELETE | `/api/games/:id/winners/:periodKey` | C H | – | `{ state }` |
| POST | `/api/games/:id/final` | C H | – | `{ state }` (host ends the game) |
| GET | `/api/games/:id/live?player=<public id>[&watch=0]` | – | WebSocket upgrade | stream of `LiveMessage` (see "Live socket") |
| GET | `/api/me/games` | C | – | `{ games: GameSummary[] }` (hosted ∪ joined; see "Dashboard summaries") |
| POST | `/api/games/:id/pay/test` | C H | – | `{ state }` (test mode only; activates draft) |
| POST | `/api/games/:id/pay/stripe` | C H | – | `{ clientSecret, amountCents, currency }` (PaymentIntent for this board; show and itemize its amount) |
| POST | `/api/games/:id/pay/iap` | C H | `{ transactionId }` | `{ state }` (verifies with Apple, activates). A verified purchase that can't open the board is kept in the ledger as `unused`: 409 `{ error, state, unused: true }` when the board is already open (or another purchase paid for it at the same instant: a board has one `paid` purchase, decided in one transaction, see docs/payments.md), 410 `{ error, unused: true }` when it was deleted (no admin token needed then; the purchase's board binding is the proof) |
| POST | `/api/stripe/webhook` | Stripe | raw | `{ received: true }`. `payment_intent.succeeded` opens the board only if this intent is the board's one `paid` purchase; one that lost to another purchase, or arrived after the board was deleted, is kept as `unused` |
| POST | `/api/push/register` | C | `PushRegistration` | `{ ok: true }` |
| POST | `/api/push/unregister` | C | `{ endpoint? , token? }` | `{ ok: true }` |
| POST | `/api/push/test` | C | – | `{ ok: true, devices, sent, failed }` (sends "you're all set" to this device's registrations) |
| GET | `/api/games/:id/mute` | C | – | `{ muted: boolean }` |
| POST | `/api/games/:id/mute` | C | `{ muted: boolean }` | `{ ok: true }` |
| GET | `/api/health` | – | – | `{ ok: true }` |

Rate limits (`worker/rateLimit.ts`, fixed windows in the D1 `rate_limits` table
keyed by `<rule>:<public player id>`, `<rule>:<game id>` for per-board rules, or
`<rule>:<hashed address>` for per-address rules, so the table holds no clientId
or raw IP; fail open if the table is unavailable). A clientId is free to mint,
so each per-device rule has a per-address twin keyed by `CF-Connecting-IP` (set
by Cloudflare; not applied when absent, e.g. in tests). The address limits are
generous because a household, a bar's Wi-Fi or a carrier NAT shares one address:

| Rule | Limit | Counts |
|---|---|---|
| `create` | 10 per device per hour | valid `POST /api/games` requests |
| `squares` | 60 per device per minute | `claim` + `release` together |
| `join` | 60 per device per minute | valid `join` requests (joins and renames) |
| `join-board` | 30 per board per minute | new players joining that board (clientIds are free to mint, so this is per board) |
| `create-ip` | 20 per address per hour | what `create` counts, for every device behind one address |
| `squares-ip` | 300 per address per minute | what `squares` counts, for every device behind one address |
| `join-ip` | 120 per address per minute | what `join` counts, for every device behind one address |

`maxPerPlayer` (the board's squares-per-player cap) counts per device, not per
person: with no accounts, someone can mint more devices. The host can remove a
player and free their squares while squares are being picked
(`DELETE /api/games/:id/players/:playerId`; see "Removing a player (client)").

Non-API routes:
- `GET /.well-known/apple-app-site-association` and `/.well-known/assetlinks.json`
  for universal / app links on `/g/*`.
- `GET /g/:id` serves `index.html` with per-game Open Graph tags (HTMLRewriter) so an
  invite pasted in iMessage/WhatsApp previews as "Join <board name>".
- The same page embeds the board's state (see "Boot state on invite links").
- `assetlinks.json` reads `ANDROID_PACKAGE` (default `com.jaxsquares.app`) and
  `ANDROID_SHA256_CERT_FINGERPRINTS` (comma-separated); the AASA file reads
  `APPLE_TEAM_ID` and `APPLE_BUNDLE_ID`.

## Boot state on invite links

`GET /g/:id` already reads the board for its preview tags, so it also puts that
`GameState` at the end of the body:

```html
<script type="application/json" id="jx-boot">{"game":{"id":"k7m2px",...},...}</script>
```

- It is exactly the public `GameState` that `GET /api/games/:id` returns
  (public player ids only; never a clientId or the admin token). `bootScript`
  in `worker/og.ts` builds it.
- XSS: the JSON is escaped for inline HTML (`inlineJson`): `<`, `>`, `&`,
  U+2028 and U+2029 become `\uXXXX` (they can only occur inside JSON strings,
  where the escape means the same character), so a board or player name like
  `</script><script>` can't end the script or open markup.
- Client (`src/lib/live.ts`): `takeBootState(id)` reads and removes the element
  on its first call, validates it (`parseBootState`) and hands it out once, only
  for the matching board id (it also primes the state cache). `useGame` starts
  that board's `LiveGame` from it as a fresh network state (`{ fresh: true }`):
  no first `GET /api/games/:id`, new activity after it is announced as usual,
  and the socket takes over (a socket that can't connect falls back to a GET).
  Any other board, a revisit, or the native app (no such element) loads as
  before. `useGame` reports `fromPage`; `GameView` then paints its skeleton for
  one frame before the full board (a heavy first render on a slow phone), so
  the screen isn't blank meanwhile.
- Measured on the production build (Slow 4G, 4x CPU, iPhone 13 viewport):
  median time to the grid 2330 ms -> 2213 ms (p75 2754 -> 2259), LCP unchanged.

## Live socket

`GET /api/games/:id/live?player=<public player id>[&watch=0]` upgrades to a
WebSocket held by the game's `GameRoom` (hibernatable). The Worker forwards only
`player` (when it is a well-formed public id) and `watch=0`; everything else in
the query is ignored.

- `player` only de-duplicates the watcher count across tabs and devices. The
  app always sends it; a socket without one gets every message but isn't
  counted.
- `watch=0` makes the socket **passive**: it receives every message (state,
  events, presence, deleted) but is not counted in `presence.watching`, and
  opening or closing it doesn't send presence to anyone else (it hears the
  current count once, on connect). Home uses it to follow every board you're in
  without inflating "N watching". Any other value (or none) is an active socket.
  A device with an active and a passive socket on the same board counts once.
- A room holds at most 500 sockets (`MAX_SOCKETS` in `worker/room.ts`); past
  that the upgrade is refused (HTTP 503) and the client falls back to polling.

Server → client (`LiveMessage`, JSON):
- `{ type: "state", state }` first on connect, then after every mutation. Clients
  keep the highest `version` (equal versions are re-applied). The first one is
  the newest the room has: if a change was broadcast while the socket's D1 read
  was in flight, the socket starts from that change, not the older read.
- `{ type: "event", activity }` once per new activity (toasts, haptics).
- `{ type: "presence", watching }` whenever an active socket connects or leaves:
  distinct active devices with a `player`.
- `{ type: "deleted" }` when the board is deleted (host `DELETE`, or housekeeping
  removing a stale draft). It is the last message; the room then closes the
  socket with code **4404** and drops its storage and alarm.

Board deleted: treat `{ type: "deleted" }` **or** close code 4404 as "gone": stop
reconnecting and polling and show "not found" (Home drops the board). Don't
wait for the close: a close frame can arrive late. Under `npm run dev` it takes
about 10 s, because local workerd keeps the TCP connection open for ~10 s after
the close handshake and the dev server's socket bridge (miniflare's
`coupleWebSocket`) only forwards the close once that connection ends; the
`deleted` message arrives within ~100 ms. A socket opened after deletion is
refused (HTTP 404), and `GET /api/games/:id` answers 404; so is one whose
board is deleted while it opens (the room remembers the delete in memory, and
a broadcast arriving after it doesn't bring the room's storage or alarm back).

Keepalive: the client sends the text `ping` every 25 s and the room answers
`pong` without waking from hibernation (a JSON `{"type":"ping"}` gets
`{"type":"pong"}`). A client that hears nothing for 70 s drops the socket and
reconnects (backoff 0.5–15 s, polling `GET /api/games/:id` every 15 s
meanwhile).

Messages are additive: clients ignore a `type` they don't know, so new message
types never break an older app build.

## Dashboard summaries

`GET /api/me/games` returns a `GameSummary` per board this device hosts or has
joined (most recently active first): board-level counts plus per-device fields
(`isHost`, `mySquares`, `myWins`) computed server-side from the caller's
`x-client-id`, which never appears in the response. Two fields let
Home render a board in play without fetching its full state (both always sent;
optional in the type only so older fixtures type-check):

- `latestScore: { scoreX, scoreY, label } | null`: the live feed's score while a
  linked game is on or over (`label` is the provider's clock, e.g. "Q3 4:12",
  or "Final"), else the latest recorded period's score (`label` = that
  period's label: "Q1", "Half", "Score 3"). null before any score. "Final"
  only for a finished game (`liveLabel` in `shared/squares.ts`): a postponed or
  canceled game is also "post" but shows the provider's word ("Postponed").
- `leaderPlayerId: string | null`: public id of whoever holds the square the
  live score points at right now; with no live square, the latest resolved
  period's winner. null when there is none yet or nobody claimed that square.

`version` is the board's `GameState.version` when the summary was read (always
sent; optional in the type for the same reason). Nothing in the summary is
older than it.

Home follows boards that are still moving over passive sockets (`watch=0`, at
most 12) and lays each board's live state over its summary; the summary list
itself refreshes on focus and every 30 s. A state counts only once it came from
the network (not the cache), and never when it is older than the summary's
`version`: a board Home stopped following, or a final the host corrected (score
edits, manual winners and deleting the Final score all still work on a final
board). Finished boards on screen are fetched once per Home visit, and again
when their summary's `version` moves past the state held.

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
| `rules` | `{ scoring }`: the host edited rules or prizes (actor = host's public id); `scoring` when who wins changed (moments, square/reverse, fresh numbers), not just amounts, notes, unit or price. Never pushed |

Winner activity carries notes only (`prize` = the square's note, else the
reverse square's), never an amount. On a moment where only the reverse square
wins, `cell` is that reverse square and `reverseCell` is null.

`GameState.activity` holds the newest 50; the hourly cron keeps the newest 200
rows per game in D1.

## Rules and prizes

`GameFormat.rules: MomentRule[]` is the source of truth for who wins when. A
`Moment` is `"score"` (every score change: entries `s1..sN`) or a fixed one
(`q1`, `q2` = halftime, `q3`, `final`). Each rule names which squares win then:
`square` (the score's last digits) and/or `reverse` (digits swapped), each a
`Prize { amount: number | null, note: string }` or null. Canonical order:
score, q1, q2, q3, final.

```ts
// The owner's example: every score -> the square, $50; each quarter-end -> the reverse square, $200.
{ rules: [
    { moment: "score", square: { amount: 50, note: "" }, reverse: null },
    { moment: "q1", square: null, reverse: { amount: 200, note: "" } },
    /* q2, q3 the same */
    { moment: "final", square: null, reverse: { amount: 200, note: "Loser buys wings" } } ],
  unit: "$", squarePrice: 10, justForFun: false, periods: "custom", reverse: true, boardSize: 100, freshNumbers: false }
```

- Validation (`formatError` strict for the API, `sanitizeFormat` lenient): 1–5
  rules, unique known moments, each with a square or a reverse winner; amounts
  null or a number above 0 up to 1,000,000 (rounded to cents), square price up
  to 100,000; notes trimmed to 60 chars and checked by `validatePrizeNote`;
  `unit` "$" or "pts"; `justForFun` boards carry no price or amount;
  `freshNumbers` only with no every-score rule and a fixed moment. The server
  stores `withRules(...)`: `periods` = the preset matching the moments (else
  "custom"), `reverse` = some rule has a reverse winner.
- Boards made before rules existed have no `rules`: `rulesOf(format,
  legacyPrizes)` derives them from the preset + reverse and folds their
  `game.prizes` notes in; they resolve exactly as before.
- Presets make rules (`rulesForPreset`); the editor fine-tunes them (a "Custom"
  state when they match no preset).
- Lock rules for PATCH `format` (also in `src/features/rules/rulesModel.ts`):
  amounts, notes, unit, square price and just-for-fun change any time, even
  after the final. Which moments win and square/reverse change only until the
  first score or host pick (409 "Scoring rules lock once the first score is in.
  You can still change amounts and notes."); fresh numbers only until the draw;
  the board size never.
- In-app helpers: `formatAmount` ("$50", "$2.50", "$1,000", "50 pts"),
  `prizeTotals(results)` (square + reverse amounts per player), `prizeLineup`
  (the compact line players see before claiming).

## Game rules (implemented in `shared/`)

- `shared/formats.ts`: rules → periods. Fixed moments give Q1, Half (q2), Q3,
  Final; a score rule makes each score entry `s1..sN` a period. Board size 100
  (10x10) or 25 (5x5, two digits per row/col). `freshNumbers` draws one
  `NumberDraw` per quarter; otherwise a single draw under `"*"`.
- Boards that award every score and quarter-ends record both: score entries
  and quarter-end scores (the live feed, and the host's score pad: "+ Score" or
  "Q1" etc., prefilled from the latest entry). `boardPeriods` orders them by
  game time: a quarter-end goes after the entries whose scores are both at or
  below it. `resolveResults` uses each period's rule (the square only when
  awarded, the reverse square only when it has one; a host pick replaces the
  square, or the reverse square on a reverse-only moment) and reports
  `amount`, `reverseAmount`, `prize` and `reversePrize`.
- `shared/squares.ts`: drawing numbers, winning cell for a score (last digit of each
  team's score mapped to the row/col whose digit list contains it), reverse cell,
  `resolveResults(state)` → per-period results honoring `ManualWinner` overrides,
  and dashboard helpers. Pure and unit-tested.
- "Final" includes overtime. Every-score boards record each rise in either team's
  score as a new entry; when the feed corrects a score down (a touchdown
  overturned), its entries above the new score are dropped with their host
  picks (`retractedEntries`), never a host's, and nothing is announced.
- While a linked game is on, the period in play is `periodInPlay`: the live
  period's own, or the next undecided one once that's recorded (ESPN keeps
  period 2 through halftime). `liveCell`, the board's "Right now" and its draw
  tab follow it.

## Module ownership (one owner per file)

- `shared/*` – game rules + types (`playerId.ts` = public id derivation).
  `worker/db.ts`, `worker/index.ts`, `worker/service.ts`, `worker/room.ts`
  (GameRoom DO), `worker/playerIds.ts`, `worker/rateLimit.ts`,
  `worker/housekeeping.ts`, `migrations/*` – core API.
- `worker/scores/*` – ESPN schedule + live score provider and the `ScoreHub`
  Durable Object. Exports `scheduleRoutes` (Hono), `liveVia(env, event)`
  (live scores through the hub) and `fetchLiveForEvent(event)`.
- `worker/payments/*` – Stripe + IAP + test checkout. Exports `paymentsRoutes`
  (Hono) and `getPaymentConfig(env)`. Owns `worker/payments/store.ts` (its D1 tables).
- `worker/push/*` – web push (VAPID) + FCM. Exports `pushRoutes` (Hono) and
  `notify(env, gameId, event)`. Owns `worker/push/store.ts` (its D1 tables).
- `public/sw.js`, `public/manifest.webmanifest`, icons, `capacitor.config.ts`,
  `ios/`, `android/` – native/PWA shell.
- `src/*` – client. `src/lib/api.ts` (typed client, `API_BASE` aware),
  `src/lib/live.ts` (socket + fallback polling), `src/lib/identity.ts`,
  `src/lib/native.ts` (Capacitor bridges: share, haptics, push, IAP),
  `src/lib/theme.ts` (appearance: dark / light / system).

## Client ↔ native

- The native app bundles the built SPA (`dist/client`) and talks to
  `VITE_API_BASE` (default `https://jaxsquares.com`). The web build uses same-origin.
- Invite links are `https://jaxsquares.com/g/<id>`; universal links open the app,
  everyone else gets the web app with no install needed.

## Appearance (client)

- Per-device choice: `system` (default, follows the phone), `dark` (the brand
  look) or `light`, set in Profile → Appearance, and flipped between light and
  dark by the sun/moon button in a board's top bar. Stored under `jaxsquares.theme` (localStorage, mirrored to Capacitor
  Preferences). `src/lib/theme.ts` resolves it (`system` follows
  `prefers-color-scheme` live) onto `<html data-theme="dark|light">`, the
  `color-scheme` / `theme-color` metas and the native status bar style. The
  inline `#theme-boot` script in `index.html` does the same before first paint,
  so there is no dark-to-light flash; `theme.test.ts` keeps the two in step.
- Styling: `src/index.css` defines dark values for the semantic tokens
  (`canvas`, `surface`–`surface-5`, `edge`, `ink*`, `ink-brand|gold|live|danger|accent`
  for colored text, `brand-line` / `gold-line` for rings and focus, `line*`,
  `scrim`) and material variables (`--elevation-*`, `--glass-bg`, `--bar-bg`,
  `--foil`, washes); `:root[data-theme="light"]` redefines them. Numbered scales
  never change: they are for fills that look the same in both themes (volt
  buttons with `text-ink-inverse`, gold chips). `light:` is a variant for the rare
  per-element tweak. Colors computed in JS take the resolved theme:
  `teamVars(x, y, theme)` / `readableTeamColor(c, fallback, theme)` with
  `useResolvedTheme()` (team colors are lifted on dark and darkened to 3:1 on light).

## Board deep links (client)

Query flags on `/g/<id>` that open a step on arrival. Each is handled once and
then removed from the URL (`replace`), so back/refresh doesn't repeat it.

| Flag | From | Handled by | Does |
|---|---|---|---|
| `?invite=1` | create flow, after the board opens | `GameView` | opens the invite sheet (even while still `draft` waiting on a payment webhook; it re-checks until open) |
| `?checkout=1` | Home card "Finish setup" (unpaid board) | `HostControls` | opens `CheckoutSheet` for the draft, if this device holds the admin token and the board is still `draft` |
| `?draw=1` | Home card "Draw numbers", inbox "Your board is full" | `HostControls` | opens the host sheet's lock & draw confirm (`host-lock-confirm`) if the board is `open` with squares claimed, else the host sheet |
| `#host=<adminToken>` (fragment; the older `?host=` still works) | a host link ("Host from another phone", `hostLinkUrl`) | `captureHostLink` (`src/lib/identity.ts`) | stores the token for this board on this device, then strips it from the address bar. The fragment is never sent, so the token stays out of the Worker's request logs. Only a real board code (`[a-z0-9]{4,16}`, lowercased) counts; a malformed one is ignored. A token the device already holds is never overwritten (anyone with the invite can craft `#host=x`, and the server never re-issues it): a different one is kept aside in memory, tried by the API client only after the held one gets a 403, and adopted once it works. A device holding none uses the token at once and checks it (`GET /api/games/:id/host-check`); one the server refuses is dropped again. Opened while `hydrateIdentity` is still reading the native store, the capture waits for it. The board treats this device as the host, not a newcomer (no invite hero, no join sheet on the first tap) |

Removing a player (client): on the host's device (holding the admin token),
while squares are being picked (`draft`/`open`, the API's rule), every row on
the board's Players list except the host's and this device's own gets a remove
button (`data-testid="player-remove"`). It asks `HostControls` (prop
`removeRequest`) to open the host sheet on its "Remove Maya?" confirm ("Their 6
squares open up again."); the host sheet also has a Players view (Board >
Players) with the same list. The confirm (`remove-player-confirm`) calls
`api.removePlayer` through `useHostActions` (the returned state is applied
with `apply`), then a toast says it's done; refusals read plainly (409: "Squares
are locked now, so everyone stays on the board."). The confirm closes itself if
the board locks meanwhile.

Checkout for drafts: `CheckoutSheet` (`src/features/create/CheckoutSheet.tsx`)
is self-contained: given the board (`GET /api/games/:id`), the saved admin token
and `PaymentConfig` (`GET /api/config`), it runs whichever checkout applies
(test, Apple Pay / Google Pay, card, or Apple IAP in the iOS app) against the
`/pay/*` endpoints. The create page only shows it when a live web checkout needs
its own tap (test mode and the App Store open the board straight from Create).
For an existing unpaid board, `HostControls` lazy-loads it from the host bar's
"Open board" action or `?checkout=1`; once paid it applies the new state and
opens the invite sheet. Its primary confirm is `data-testid="pay-confirm"`.

## Cross-module function contracts

`worker/service.ts` (core) — used by payments, push and the room:
```ts
loadState(env: Env, gameId: string): Promise<GameState | null>
/** Re-read state from D1 and push it to every socket in the game's room. */
broadcast(env: Env, gameId: string, activity?: Activity): Promise<GameState | null>
/** draft -> open after a successful payment. Idempotent. */
activateGame(env: Env, gameId: string, purchase: { provider: "test" | "stripe" | "iap"; reference: string; amountCents: number }): Promise<GameState | null>
/** The game was deleted: the room sends { type: "deleted" }, closes sockets with 4404, drops its storage. Never throws. */
closeRoom(env: Env, gameId: string): Promise<void>
isHost(env: Env, gameId: string, adminToken: string): Promise<boolean>
/** Apply a provider update to a linked board: upsert live status + period scores, diff every-score entries. */
applyLiveUpdate(env: Env, gameId: string, update: LiveUpdate): Promise<void>
```
`worker/db.ts` (core) keeps exporting `getGame(db, id)` and `getPlayers(db, gameId)`
(public shapes) for other modules, plus `getMembers(db, gameId): Member[]`
(players with their clientIds; server-only, used by push).

`worker/scores/index.ts` (scores):
```ts
scheduleRoutes: Hono<{ Bindings: Env }>          // GET /schedule (through the ScoreHub)
liveVia(env: Env, event: LinkedEvent): Promise<LiveUpdate | null>  // through the ScoreHub; never throws
fetchLiveForEvent(event: LinkedEvent): Promise<LiveUpdate | null>  // direct; what the hub runs
getSchedule(league, week?): Promise<ScheduleResult | null>         // direct; what the hub runs
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
from `POST /final` and from a typed-in board's Final score, `player-joined`,
and `board-full` (whoever claimed the last square). `board-full` goes out once
per board: the claim that first fills it stamps `games.board_full_at` in the
same transaction (`markBoardFull`, migration 0007), and only that claim pushes;
giving a square back and taking one again doesn't announce it again. `winner` never has an actor (you hear about your own square even
when you typed the score); live-score events have none either. Push resolves
public ids to devices through `getMembers()`.
`worker/index.ts` mounts the three routers under `/api` and calls `notify` from the
core routes. Each module owns its own migration file: core `0002_*`,
`0005_housekeeping.sql` (rate limits, draft-cleanup index) and
`0007_board_full_announced.sql`, payments `0003_*` and `0006_*`, push `0004_*`.
