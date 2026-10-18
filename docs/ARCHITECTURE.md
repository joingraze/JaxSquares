# JaxSquares architecture contract

This is the agreed contract between the Worker, the client and the native shell.
Types live in `shared/types.ts`; this file covers endpoints, module boundaries and
behavior. Change the contract only by adding, never by renaming (the one
exception so far: the public-id rename below, which closed an impersonation hole).

## Product rules (non-negotiable)

- No money moves between players, ever: the app never collects, holds, sends or
  tracks payment between them. A host may show a **square price** and **prize
  amounts** as structured, display-only fields (`GameFormat.squarePrice`,
  `Prize.amount`, on every score change `Prize.byKind`, an amount per kind
  of score, and on the final's square `Prize.rest`, "the rest of the board
  total") in "$" or points (`GameFormat.unit`), or mark the board **just
  for fun** (`GameFormat.justForFun`: no amounts, players see a badge). Amounts
  are empty by default, so a default board shows no money at all. The inputs
  carry "Shown to everyone before they pick squares. JaxSquares never collects
  or sends money." No betting vocabulary anywhere ("bet", "wager", "pot",
  "payout", "buy-in", "jackpot", "odds", "stakes", "gamble"): say "square price",
  "prize", "amount".
- Amounts never leave the app: not in push notifications, link previews/OG
  tags, invite or share text, or activity data. A host's free-text note ("Loser
  buys wings") may be quoted in a push.
- The only payment is the host paying JaxSquares the host fee for a board, due
  when they draw its numbers: one tap with Apple Pay / Google Pay (Stripe) on the
  web, Apple In-App Purchase in the iOS app. Creating a board, inviting and
  picking squares are free; JaxSquares never sells squares. With `PAYMENTS_MODE`
  unset the app runs a clearly labeled no-charge test checkout. See
  docs/payments.md and "The host fee" below.
- No account needed. A device is identified by a random `clientId` (localStorage, plus
  Capacitor Preferences in the native app) sent as `x-client-id` on every request.
  The host additionally holds a per-game `adminToken` sent as `x-admin-token`.
  Signing in with Apple or Google is optional: it maps every signed-in device to
  its account's canonical clientId, so boards follow a person (see "Optional
  sign-in" below and docs/auth.md).
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
| `GameSummary` | `host.id`, `leaderPlayerId` (the rest is computed per device: `isHost`, `joined`, `mySquares`, `myWins`) |

- Server: D1 stores clientIds (`players.client_id`, `squares.client_id`,
  `games.host_client_id`); `worker/db.ts` derives public ids on read (memoized in
  `worker/playerIds.ts`). New activity rows store the public id; legacy rows that
  hold clientIds are translated on read, and anything unrecognised is dropped.
  `getMembers()` (server-only `Member = Player & { clientId }`) is the one place
  clientIds leave `db.ts`, so push can find a player's devices.
- Client: `getPlayerId()` in `src/lib/identity.ts` (computed with WebCrypto in
  `hydrateIdentity()`, sync afterwards; the server-confirmed account id when
  signed in, see below). "Mine" is always
  `square.playerId === getPlayerId()`; `claimPatch`/`releasePatch` take it too.

### Optional sign-in: canonical clientId

Model, merge rules and setup: docs/auth.md. In short:

- Tables (auth module, `worker/auth/store.ts`, migration 0010): `accounts`
  (random id, UNIQUE `canonical_client_id`, email/name shown only to the
  owner), `account_identities` (UNIQUE `(provider, subject)`, Apple refresh
  token), `client_links` (`client_id` PK → account).
- The canonical clientId is the first signed-in device's, so its rows never
  move. `requireClient` (and the push routes) resolve `x-client-id` to it
  (`canonicalClientId` in `worker/auth/canonical.ts`: one indexed read, cached
  per isolate for 30 s; `x-signed-in: 1` from a signed-in app skips a cached
  "not linked"; missing tables fail open). So `c.get("clientId")` /
  `c.get("playerId")`, rate limits, push, squares, members and host checks all
  work on the account, and every device of one account is one player with one
  public id.
- Signing in on another device moves that device's rows (hosted boards,
  players, squares, its public id in the feed, push registrations, mutes) to
  the canonical clientId in one batch with its link, bumps the touched boards'
  versions and broadcasts them. Its own clientId then works only through
  `client_links`.
- `GET /api/me` and every sign-in return `MeResponse`: the (account's) public
  id, the account, and the admin tokens of the boards the identity hosts (never
  anyone else's). The app stores the id next to the clientId
  (`jaxsquares.playerId`, tied to the clientId it was given for) so "mine"
  works offline at startup, and the tokens like the creator's device does.
- Sign-out wipes the device (new clientId; player id, account, profile, boards,
  admin tokens and seen list cleared). Deleting the account revokes the Apple
  token and deletes the account rows; the boards and squares stay as anonymous
  data under the canonical clientId.
- Email and name never appear in a public object (Player, activity, push, OG);
  no response carries a clientId.

## Runtime

- One Cloudflare Worker (Hono) serves `/api/*`, `/.well-known/*`, per-game link
  previews, and the React SPA via the `ASSETS` binding.
- D1 (`DB`) is the source of truth. Core SQL lives in `worker/db.ts`; tables a
  module owns are queried only by that module's store file
  (`worker/payments/store.ts`: `purchases`; `worker/push/store.ts`:
  `push_subscriptions`, `game_mutes`; `worker/auth/store.ts`: `accounts`,
  `account_identities`, `client_links`). The sign-in merge runs statements
  built by each owner in one batch.
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
  the next 15 minutes or are in progress, so polling starts on time (custom
  boards keep their host-set kickoff in the same `games.starts_at`, but have
  no feed to poll, so the wake query and its index, migration 0008, skip them).
  Each minute it also sends the host of a linked board that kicks off within the
  hour with its host fee unpaid one `draw-reminder` push (`claimDrawReminders`,
  stamped in `games.draw_reminder_at`, migration 0009). Once an hour (UTC minute
  17) it runs housekeeping (`worker/housekeeping.ts`): settles boards left from
  the pay-to-open flow (`settleLegacyBoards`: a board its payment opened counts
  as paid, a draft opens and its new state is pushed), prunes activity beyond
  the newest 200 per game, and drops expired rate-limit windows. An App Store
  purchase for a board deleted before it was confirmed isn't lost: `/pay/iap`
  keeps it as `unused` (410); so does the Stripe webhook for a board deleted
  before its payment landed.

## HTTP API

All JSON. Errors are `{ error: string }` with a 4xx/5xx status; the message is
friendly enough to show as-is. `C` = needs `x-client-id`, `H` = also needs
`x-admin-token` for that game. `429` = rate limited (see below; has `Retry-After`).

| Method | Path | Who | Body | Returns |
|---|---|---|---|---|
| GET | `/api/config` | – | – | `AppConfig` (`no-store`: a switch to live checkout or a new price reaches clients at once; the client reuses it for a minute). `auth`: the public sign-in client ids (`AuthConfig`); a provider without one is hidden |
| POST | `/api/auth/apple`, `/api/auth/google` | C | `SignInInput` (`{ idToken, nonce?, authorizationCode?, name?, redirectUri? }`) | `MeResponse`. Verifies the ID token (JWKS, `iss`, `aud`, `exp`/`iat`, nonce = SHA-256 of the raw one); a new identity makes this device an account's canonical one, a known one merges this device into it. 400 bad body, 401 refused token, 409 "Sign out first" (linked to another account), 429, 502 provider keys unreachable, 503 provider not set up |
| GET | `/api/me` | C | – | `MeResponse` `{ playerId, account \| null, hostTokens, profile? }` (`no-store`; reads the link fresh; 503 when it can't) |
| POST | `/api/auth/sign-out` | C | `SignOutInput` (`{ endpoint?, token? }`, optional) | `{ ok: true }`: drops this device's link and that push registration from the account; 429 |
| DELETE | `/api/account` | C | – | `{ ok: true }`: revokes Apple tokens, deletes the account, identities, links and the account's push registrations; boards and squares stay. 404 when not signed in; 429 |
| GET | `/api/schedule?league=nfl\|ncaaf[&week=2-8]` | – | – | `ScheduleResponse`: without `week`, the first week with games to link (`week`, `events`) and the weeks after it (`weeks`); with `week` (`<season type>-<week>`), that week's `events`. Cached; `{ events: [], unavailable: true }` when ESPN is down |
| POST | `/api/games` | C | `CreateGameInput` | `CreateGameResponse` (201): the board is `open` right away with `paid: false` (`paymentRequired` is always `false`; the host fee is due at the draw); 400 on bad rules (see "Rules and prizes"), money in a note, the name or a team name, or a custom `startsAt` out of range (see "Kickoff"); 429. The stored format is canonical (rules always present, `periods`/`reverse` derived) and `prizes` is `{}`: an older client's preset and notes become rules |
| GET | `/api/games/:id` | – | – | `GameState` |
| GET | `/api/games/:id/host-check` | C H | – | `{ ok: true }`; 403 when `x-admin-token` isn't this board's, 404 for no board. A device checks a host link's token here before trusting it |
| PATCH | `/api/games/:id` | C H | `UpdateGameInput` | `{ state }`; 400 on money in a note or the name, bad rules, a `startsAt` out of range or on a linked board; 409 when `format` changes something locked (see "Rules and prizes"). A `format` edit writes the canonical format + fixed `periods`, clears legacy `prizes`, logs a `rules` activity and broadcasts (never pushed). `prizes` from an older client land in the rules' notes on a board that has rules. A `startsAt` edit (custom boards, any time) is broadcast with no activity and no push |
| DELETE | `/api/games/:id` | C H | – | `{ ok: true }`; open sockets get `{ type: "deleted" }` then close 4404 |
| POST | `/api/games/:id/join` | C | `JoinInput` | `{ state }` (upsert; also used to rename); 409 once the board has `MAX_PLAYERS` (200, `shared/squares.ts`) and you aren't one of them; 429 |
| DELETE | `/api/games/:id/players/:playerId` | C H | – | `{ state }`: removes that player (public id) and frees their squares while the board is `open` (or a legacy `draft`); 400 for the host, 404 if not on the board, 409 once locked. They may join again |
| POST | `/api/games/:id/claim` | C | `CellsInput` | `{ claimed: number, skipped: number, state }`; 429 |
| POST | `/api/games/:id/release` | C | `CellsInput` | `{ state }`; 429 |
| POST | `/api/games/:id/lock` | C H | – | `{ state }` (draws numbers); **402** `{ error: "Draw the numbers once the board's paid for.", code: "payment_required" }` (`PAYMENT_REQUIRED_CODE`) while the host fee isn't paid (`Game.paid`); 409 once drawn. On a linked board whose game the feed already called Final, the draw also ends the board (`final`, one `final` push instead of `numbers-drawn`) |
| POST | `/api/games/:id/scores` | C H | `ScoreInput` | `{ state }`. Every-score boards: `periodKey` `"next"` (or `""`) appends entry `s(N+1)`; `sN` edits an existing entry (a `label` mentioning money is a 400). Re-saving a period's recorded score is written but not announced again (no score/winner activity or push) |
| DELETE | `/api/games/:id/scores/:periodKey` | C H | – | `{ state }`. On every-score boards the entry's host pick goes with it (the next entry reuses the index) |
| POST | `/api/games/:id/winners` | C H | `ManualWinnerInput` | `{ state }` |
| DELETE | `/api/games/:id/winners/:periodKey` | C H | – | `{ state }` |
| POST | `/api/games/:id/final` | C H | – | `{ state }` (host ends the game) |
| GET | `/api/games/:id/live?player=<public id>[&watch=0]` | – | WebSocket upgrade | stream of `LiveMessage` (see "Live socket") |
| GET | `/api/me/games[?seen=<id>,<id>]` | C | – | `{ games: GameSummary[] }` (hosted ∪ joined ∪ the `seen` boards that exist; see "Dashboard summaries") |
| POST | `/api/games/:id/pay/test` | C H | – | `{ state }` (test mode only; marks the host fee paid, doesn't draw) |
| POST | `/api/games/:id/pay/stripe` | C H | – | `{ clientSecret, amountCents, currency }` (PaymentIntent for this board's host fee; show and itemize its amount); 409 `{ error, state }` once the board is paid for |
| POST | `/api/games/:id/pay/iap` | C H | `{ transactionId }` | `{ state }` (verifies with Apple, marks the fee paid). A verified purchase that can't pay for the board is kept in the ledger as `unused`: 409 `{ error, state, unused: true }` when the board is already paid for (or another purchase paid for it at the same instant: a board has one `paid` purchase, decided in one transaction, see docs/payments.md), 410 `{ error, unused: true }` when it was deleted (no admin token needed then; the purchase's board binding is the proof) |
| POST | `/api/stripe/webhook` | Stripe | raw | `{ received: true }`. `payment_intent.succeeded` marks the board paid only if this intent is the board's one `paid` purchase; one that lost to another purchase, or arrived after the board was deleted, is kept as `unused` |
| POST | `/api/push/register` | C | `PushRegistration` | `{ ok: true }` |
| POST | `/api/push/unregister` | C | `{ endpoint? , token? }` | `{ ok: true }` |
| POST | `/api/push/test` | C | – | `{ ok: true, devices, sent, failed }` (sends "you're all set" to this device's registrations; a signed-in device's are its account's) |
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
| `auth` | 20 per device per hour | sign-in attempts, sign-outs and account deletions (keyed by the device's own public id) |
| `auth-ip` | 60 per address per hour | what `auth` counts, for every device behind one address |

Per-device rules count per account for a signed-in device (they're keyed by
the resolved public id). `maxPerPlayer` (the board's squares-per-player cap)
counts per device (per account when signed in), not per person: an account is
optional, and someone can mint more devices. The host can remove a
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
  app always sends it (`getPlayerId()`: a signed-in device sends its account's
  id, so an account's devices count once); a socket without one gets every
  message but isn't counted. Nothing trusts it beyond that count.
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
- `{ type: "deleted" }` when the board is deleted (host `DELETE`). It is the last message; the room then closes the
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
(`isHost`, `joined`, `mySquares`, `myWins`) computed server-side from the
caller's `x-client-id`, which never appears in the response.

`?seen=<id>,<id>` adds the boards this device only opened (an invite link it
hasn't joined; the client keeps them in `jaxsquares.seen`, most recent first,
about 50, mirrored to the native store like the known games). Ids that aren't
board codes (`[a-z0-9]{4,16}`, lowercased) are ignored, duplicates count once,
at most 50 are read, and a board that no longer exists is simply absent. A seen
board's summary is the same public data as any other (`joined: false`,
`mySquares: 0`); after each refresh the client drops seen ids that came back
missing, final, or now joined.

- `joined: boolean`: this device has a player row on the board.
- `paid: boolean`: the board's host fee is paid (`Game.paid`); a linked board
  draws its own numbers at kickoff only then. Boards made before the fee moved
  to the draw count as paid.
- `host: { id, name, color, emoji } | null`: the host's public player profile
  ("Maya invited you"), `id` being the public player id (= `Game.hostPlayerId`);
  null when the host has no player row.
- `format` carries what an invite shows before anyone picks: the display-only
  `squarePrice` (in `unit`) or `justForFun`, and the prize lineup. In-app only,
  like every amount.

Home sorts each summary by how this device stands with the board
(`relationOf` in `src/features/home/sections.ts`): host; playing (has squares);
invited (open, squares left, none mine: opened or joined without picking),
shown under **Invites**; watching (no squares and nothing left to pick). A board
in play I hold no squares on is in **Live now** tagged "Watching"; once final, a
never-joined board leaves Home (and the seen list) while a joined one stays in
**Final** as "Watched". **Needs you** is for the host's to-dos only. A board
I'm playing shows my sticker and "15 squares yours"; an invite gets its own
card (who invited me, the matchup, squares left, the square price line, "Pick
squares", and "Not for me" on one I only opened, which drops it from the seen
list with an Undo).

Two fields let Home render a board in play without fetching its full state
(both always sent; optional in the type only so older fixtures type-check):

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
when their summary's `version` moves past the state held. Boards this device
only opened aren't followed live: they refresh with the summary list, and one in
play is fetched once the same way (again when its `version` moves on).

## Activity

`Activity.actor` is the public id of whoever did it, or null for system events.
`data` per type (`ActivityData` in `shared/types.ts`):

| type | data |
|---|---|
| `created` | `{}` |
| `joined` | `{ name }` |
| `claimed` | `{ count, cells: {row, col}[] }` (only what this request actually got) |
| `released` | `{ count, cells }` |
| `locked` | `{}` host draw, `{ auto: true }` at kickoff (actor null; only once the host fee is paid) |
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
// The Every score card at $10 a square, with the reverse at each quarter and the final
// (the suggested amounts): every score -> the square, by kind; each quarter-end -> the
// reverse square, $40; the final -> the square takes the rest of the board total.
{ rules: [
    { moment: "score", square: { amount: 10, note: "",
        byKind: { touchdown: 20, fieldGoal: 10, extraPoint: 5, twoPoint: 10, safety: 10 } }, reverse: null },
    { moment: "q1", square: null, reverse: { amount: 40, note: "" } },
    /* q2, q3 the same */
    { moment: "final", square: { amount: null, note: "Loser buys wings", rest: true }, reverse: { amount: 40, note: "" } } ],
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
- Amounts by score type (`Prize.byKind?: Partial<Record<ScoreKind, number>>`,
  `ScoreKind` = `touchdown | fieldGoal | extraPoint | twoPoint | safety`,
  `SCORE_KINDS` in that order; labels "Touchdown"/"TD", "Field goal"/"FG",
  "Extra point"/"XP", "2-point conversion"/"2-PT", "Safety"): only on the
  score moment's `square`/`reverse` (400 `BY_KIND_MOMENT_ERROR` elsewhere;
  dropped by the lenient path); each value validated like an amount ("The
  2-point conversion amount must be a number above 0, up to 1,000,000"), an
  unknown kind is a 400; stored in `SCORE_KINDS` order with only the kinds
  that have a value, and no `byKind` key at all when none do, so rules without
  it are byte-for-byte what they were. `amount` is the flat amount with score
  types off, and a quiet fallback for a kind without its own value (older
  data); the editor has no "Other scores" field. Just-for-fun boards carry
  none (400, cleared leniently). Like any amount, they can change any time
  (not part of `rulesShape`) and never leave the app.
- Boards saved before the extra point and the 2-point conversion were told
  apart may hold `byKind.conversion`: every read path treats it as both
  `extraPoint` and `twoPoint` (`kindAmount`, so `prizeAmount`, `kindAmounts`,
  `prizeRange` and results; `worker/db.ts` upgrades it on read with
  `upgradeFormat`; `sanitizeFormat` / `tidyPrize` / the editor's `draftOf`
  map it too, a kind's own value winning). New input with `conversion` is a
  400 "Unknown score type".
- Score kinds (`entryPlays` / `scorePlayBetween` in `shared/squares.ts`, pure):
  each every-score entry's kind comes from the change in one team's score
  versus the entry before it (by index; 0-0 before the first), and every entry
  gets one: 6 = touchdown; 3 = field goal; 1 = extra point; 2 = 2-point
  conversion right after that team's 6-point touchdown entry, else a safety;
  7 or 8 = touchdown (a host-typed touchdown and kick together). Both teams
  can't score in one play, so a data gap showing both up counts the larger
  rise (team X on a tie); any other jump reads as the nearest kind (6 or more
  a touchdown, 3 to 5 a field goal, 1 or less an extra point; a host
  correction downward reads by its size). Football boards only. Never stored:
  derived on read from the ordered entries, so a host correction or an
  overturned score re-derives what follows (no migration). `PeriodResult`
  carries `scoreKind` and `scorePoints`, and its `amount` / `reverseAmount`
  come from `byKind` (`prizeAmount`), so winners, `prizeTotals`, `playerTake`
  and the players list follow. Labels: `scorePlayLabel(kind, full?)`.
- The rest of the board total (`Prize.rest?: true`): only on the final
  moment's `square` (400 `REST_MOMENT_ERROR` elsewhere) and only with a square
  price (400 `REST_PRICE_ERROR`; a just-for-fun board: `JUST_FOR_FUN_ERROR`);
  its `amount` is ignored and stored null; dropped leniently where it can't
  go, and by `withRules` without a price. It's an amount, not who wins, so it
  changes any time. The board total (`boardTotalOf`) is the square price ×
  every square (100 or 25) before the numbers are drawn, × the claimed
  squares after. The rest = that total minus every other prize a claimed
  square won (score entries by kind, quarter/half squares and reverse
  squares, the final's own reverse); an unclaimed winning square's prize stays
  in the total; never below 0. `resolveResults` sets the final result's
  `amount` to it with `amountIsRest: true` (so `prizeTotals` and the winners
  follow; with the rest, everyone's totals add up to the claimed total);
  `restSoFar(state)` is the same math over the results so far, for live
  display. Copy: rules sheet "the rest of the board total, everything not won
  during the game"; lineup "Final: the rest"; result card before the final
  "Final · the rest" with "$640 so far", after "Final · $640"; the host
  pad's preview "$640 (the rest)". Never in a push, preview or share text.
- Suggested amounts (`suggestPrizes(rules, price, squares, unit)`, pure; T =
  price × squares, p = the price; fixed amounts "nice": whole units under 10,
  fives under 100, tens from 100, at least 1):
  - Fixed moments only: the main prize at each moment (its square, else its
    reverse) splits T by Q1 20 · Half 20 · Q3 20 · Final 40 (Halftime + Final
    alone 40 · 60; other sets normalize those weights; the final alone 100%).
    A reverse square beside a moment's square gets 4p first (capped so the
    reverse prizes take at most 40% of T: a 5×5 board's quarters, or few
    claimed squares), and the main prizes split T minus those. The last
    moment (the Final) takes up the rounding, so they add up to exactly T.
    $10 squares: quarters 200/200/200/400; with reverse $40 ×4 then
    170/170/170/330; halves 400/600 (with reverse 370 + 40 / 550 + 40).
  - Every score: by score type (on by default for the Every score card), one
    base unit u = half the price (dollars: nearest $0.50, at least $0.50;
    points: a whole point, at least 1; `kindUnit`), never rounded per kind:
    touchdown 4u, field goal / 2-point conversion / safety 2u, extra point
    1u ($1: 2 / 1 / 0.50; $10: 20 / 10 / 5; $25: 50 / 25 / 12.50). The flat
    amount (score types off, and the fallback) is p. The reverse square on
    every score gets the same table. The final's square takes the rest; any
    other fixed square, and every reverse at a fixed moment, 4p.
  - `typicalGameTotal(rules)`: 9 touchdowns, 8 extra points, 4 field goals,
    one 2-point conversion (`TYPICAL_GAME`), plus the fixed moments' amounts
    other than the rest. $10 squares, every score + reverse each quarter:
    $430 of $1,000.
- Splitting evenly (`splitEvenly(rules, total)`, pure): "Even", the
  suggestion's alternative on fixed-moment boards, in whole units that add up
  to the total (`wholeShares`: largest remainder, ties to the later moment).
  A moment where both squares win shares its part evenly (the square gets an
  odd unit); a final taking the rest gets its share instead. Every score
  change, notes and who wins are untouched.
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
  `formatRange` ("$10–$50"), `prizeRange` / `kindAmounts` (a prize's amounts
  by score type), `fixedPrizeTotal` (what the fixed moments give out, the
  rest not counted), `prizeTotals(results)` (square + reverse amounts per
  player), `prizeLineup` (the compact line players see before claiming: "$10
  a square · $5–$20 every score · $40 reverse each quarter · Final: the
  rest"; also the Home invite card's).
- Editor (`src/features/rules`, shared by Create and the host's "Rules &
  prizes"): the square price takes one-tap picks (`PRICE_CHIPS`: $1–$100, or
  1–500 points) or any amount; with a price it shows the board total ("All
  100 squares: $1,000", or "62 claimed squares: $620" in the host's editor
  once the numbers are drawn), then:
  - Fixed-moment boards: "Prizes: $800 of $1,000" with "$200 left" / "$200
    over" / "Adds up", or "The rest, $600, to the final" when the final takes
    the rest (`prizeBudget` / `budgetText`), and "Split the $1,000": the
    Suggested card and "Even" (`suggestedPrizes` / `evenSplit`, each with
    what every prize gets, picked when the amounts already match).
  - Every-score boards: "Score prizes come out of the $1,000 board total
    during the game; the final gets the rest.", a typical game's estimate,
    and over 80% of the total (`TIGHT_SHARE`) the warning "A typical game
    would use about $X of the $T board total, leaving little for the final."
    (`everyScoreBudgetText`), then the Suggested card.
  - The Suggested card's "Use suggested amounts" re-applies the suggestion,
    with the basis under it ("From the $1,000 board total"). The editor
    never changes saved amounts by itself.
  - The final's row, with a square price, has "The rest" / "Fixed amount"
    (`setFinalRest`: a fixed amount starts at about what the rest would be,
    `restEstimate`). "Same for every quarter" leaves a final's rest alone.
  - The every-score row, and the create page's Every score card, offer "Also
    pay the reverse at each quarter and the final" (`setReverseQuarters`:
    Q1, Half, Q3 and Final on with the reverse square; the final keeps its
    square; the create card also takes one amount for all four) and "Amount
    by score type" (`setByKind` / `setKindAmount`: the five kinds, no "Other
    scores"). Typing the touchdown moves the kinds the host hasn't set by
    hand along as clean multiples (`setTouchdownAmount`: TD $100 makes FG,
    2-PT and Safety $50, XP $25, with `kindUnit(TD / 4)`); a kind set to
    anything else stops following; empty kinds fill in.
  - The Every score card makes the score moment (amounts by score type on)
    plus the final's square (`selectPreset`); with the reverse at each
    quarter-end it still reads as the Every score preset
    (`presetChoice` / `isEveryScoreSetup`), titled "Every score + reverse".

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
  score as a new entry (`nextEveryScoreEntries`). When one poll shows one team
  up 7 or 8 (the other unchanged) since the latest entry, that's a touchdown
  and its conversion landing together: two entries, the touchdown (+6) first,
  then the conversion, so the touchdown's square still wins its turn and the
  kinds come out right. When the feed corrects a score down (a touchdown
  overturned), its entries above the new score are dropped with their host
  picks (`retractedEntries`), never a host's, and nothing is announced; a
  split touchdown unwinds the same way (a conversion taken back drops just
  its entry). Host-typed entries are recorded as typed: the host's score pad
  adds +6 TD, +3 FG, +1 XP, +2 2-PT and +2 Safety for the team that scored
  (save the touchdown, then the kick), and its preview names the kind and
  its amount ("Touchdown · $50", "2-point conversion · $10"; the final
  taking the rest: "$640 (the rest)").
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
- `worker/auth/*` – optional sign-in (docs/auth.md): ID token verification
  (`jwt.ts`), Apple token exchange/revocation (`apple.ts`), the canonical
  clientId resolver (`canonical.ts`). Exports `authRoutes` (Hono),
  `authConfig(env)` and `canonicalClientId(db, clientId, { signedIn })`. Owns
  `worker/auth/store.ts` (its D1 tables).
- `public/sw.js`, `public/manifest.webmanifest`, icons, `capacitor.config.ts`,
  `ios/`, `android/` – native/PWA shell.
- `src/*` – client. `src/lib/api.ts` (typed client, `API_BASE` aware),
  `src/lib/live.ts` (socket + fallback polling), `src/lib/identity.ts`,
  `src/lib/auth.ts` + `src/lib/authSdk.ts` (sign-in flows; Apple/Google SDKs and
  the native plugin, loaded on demand), `src/features/account` (sign-in UI,
  `SignInSheet`),
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

## Kickoff

`Game.startsAt` (and `GameSummary.startsAt`) is when the board's game kicks off,
epoch ms: a linked board's event time (from ESPN, as `linkedEvent.startsAt`),
or a custom board's host-set time, or null for no set time. `gameKickoff(game)`
in `shared/kickoff.ts` reads it. D1 keeps both in `games.starts_at`.

- Custom boards only take one from the host: `CreateGameInput.startsAt` and
  PATCH `startsAt` (host only), null or a number from a day ago to a year
  ahead (`kickoffProblem`, shared by the worker and the client; 400 with
  `KICKOFF_ERRORS` otherwise). Create ignores it on a linked board (its event
  wins); PATCH refuses it there (400).
- Display only. A custom board never locks itself at kickoff and gets no
  "kickoff" push: nothing confirms the game started (no feed), and the host
  draws the numbers when everyone's in. `game-starting` stays a linked-board
  push, sent when the feed goes live; it never carries an amount. A linked
  board locks itself at kickoff only once its host fee is paid; unpaid, it
  stays `open` (the feed still records scores) and the kickoff push asks the
  host to draw and tells everyone else they're waiting on the host.
- Shown as "Kicks off Sun 1:00 PM PDT" (`kicksOffLabel` in `src/lib/format.ts`,
  the device's zone labeled at the kickoff itself, so a November date reads
  PST) on the scorebug while squares are picked and in the invite hero; the
  locked scorebug counts down to it; Home sorts Invites and Up next by it and
  counts down; the host sheet's Edit board changes it (`KickoffPicker`).

## Create flow (client)

`/new` is a five-step guided flow (`src/pages/CreateGame.tsx`, model in
`src/features/create/wizard.ts`): `game` (NFL / College by week, soonest
picked, or Custom teams + kickoff), `format` (how squares win), `prizes` (the
rules & prizes editor; skippable, Review then flags "Square price: not set"),
`details` (board name, max per player, the host's name on a device without
one) and `review` (a card per step, then Create). Every step starts filled
in: the default path is pick the game (a tapped game moves on by itself),
Next x3, Create.

- The step is the URL, `/new?step=game|format|prizes|details|review`; Next
  pushes a history entry, so the browser's back and the iOS swipe go back a
  step. Each entry's state carries `wizardDepth` (entries pushed since the
  first step), `fromReview` (opened from a Review card: Next reads "Done" and
  goes back to Review) and `appBack` (an in-app page sits under the flow: the
  top bar's close goes back there). A URL can't skip an incomplete step
  (`reachableStep`): it lands on the first one that still needs something.
- Next is disabled (`aria-disabled`, still tappable to focus the field) with
  its reason above it only when a step is truly incomplete (`stepBlocker`):
  custom teams, a kickoff out of range, a prize note that talks money, the
  host's name, money in the board name.
- The draft (tab, picks, teams, kickoff, format, prize choice, whether the
  amounts still follow the suggestion, name, cap, host name) lives in
  `sessionStorage` (`jaxsquares.createDraft`, 12 h), so a reload keeps it;
  it's cleared once the board opens. A picked game that has started since is
  dropped on restore.
- Prizes fill themselves in (`autoFill` in `src/features/rules/rulesModel.ts`):
  while the host hasn't typed an amount, a change to the square price, the
  game type, reverse, the every-score options, the board size or the unit
  re-applies the suggestion (`withSuggested`, all the board's squares);
  taking the price away takes the suggested amounts with it. Typing an amount
  (or picking "Even") stops it; nothing changes by itself after that, until
  "Use suggested amounts" (the amounts match the suggestion again). Review
  shows the lineup players will see.
- Creating is free: Create makes the board and opens it in one tap, with no
  checkout. Review's line under the button says "Free to set up and invite.
  $4.99 when you draw the numbers." (`data-testid="create-fee"`; the price from
  `useHostFee`: the App Store's in the iOS app, a priceless line when it can't
  say). Opening the board first rewinds the flow's entries
  (`history.go(-wizardDepth)`), then replaces the first one with
  `/g/<id>?invite=1`, so Back from the board goes where the host started, not
  into a finished flow.

## Board deep links (client)

Query flags on `/g/<id>` that open a step on arrival. Each is handled once and
then removed from the URL (`replace`), so back/refresh doesn't repeat it.

| Flag | From | Handled by | Does |
|---|---|---|---|
| `?invite=1` | create flow, after the board is made | `GameView` | opens the invite sheet, if this device holds the admin token |
| `?draw=1` | Home card "Draw numbers", inbox "Your board is full", the "Payment confirmed" toast | `HostControls` | opens the host sheet's lock & draw confirm (`host-lock-confirm`) if the board is `open` with squares claimed, else the host sheet. With the host fee due the confirm reads "Draw the numbers · $4.99" and pays first |
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

## The host fee (client)

The fee is due when the host draws the numbers (`needsHostFee(game)` in
`src/features/host/hostModel.ts`: a board still being picked whose `paid` is
`false`; an absent `paid`, from an older cached state, reads as paid and the
server's 402 decides).

- Price: `useHostFee()` (`src/lib/useHostFee.ts`) / `hostFeePrice(config,
  platform)`: the server's price on the web (test mode too; the checkout says
  it charges nothing then), only the App Store's localized string in the iOS
  app (null when StoreKit can't say, never the web price; App Store guideline
  3.1.1).
- Host tools: once drawing is the move the host bar gives the draw the full
  width, "Draw the numbers · $4.99" (`host-bar-action`); the sheet's Now card
  stacks Invite and "Draw the numbers · $4.99" (`host-lock`); the lock & draw
  confirm adds "$4.99 host fee, once for this board" and its button reads
  "Draw the numbers · $4.99" (`host-lock-confirm`). Confirming opens
  `CheckoutSheet` (`purpose="draw"`); once paid, `HostControls` applies the paid
  state, calls `POST /lock` and plays `NumberReveal`. A paid board (or one made
  before the fee moved to the draw) shows the plain "Lock & draw" / "Draw the
  numbers". `useHostActions().lock` resolves `PAY_FIRST` on the 402
  (`isPaymentRequired`), and the checkout opens instead of an error toast.
- Linked boards whose fee is due, before kickoff: the Now card offers "Pay now
  and Jax draws the numbers at kickoff" (`host-pay-ahead`, `canPayAhead`), which
  opens `CheckoutSheet` with `purpose="ahead"`; once paid a toast says Jax draws
  at kickoff. After an unpaid kickoff the bar says "Kicked off · numbers not
  drawn yet" and drawing is the move.
- Players: on an open board that's full, or a linked game on without its
  numbers, the board hint says "Waiting on the host to draw the numbers."
  (`board-waiting`); Home's full-board meta says "numbers drawn at kickoff" only
  for a paid linked board (`GameSummary.paid`). Home puts the host's undrawn
  board in play under Needs you with "Draw numbers".
- `CheckoutSheet` (`src/features/create/CheckoutSheet.tsx`) is self-contained:
  given the board (`GET /api/games/:id`), the saved admin token and
  `PaymentConfig` (`GET /api/config`), it runs whichever checkout applies (test,
  Apple Pay / Google Pay, card, or Apple IAP in the iOS app) against the
  `/pay/*` endpoints. Its primary confirm is `data-testid="pay-confirm"`.
- iOS recovery: `watchIAPPurchases({ onPaid })` (`src/App.tsx`) confirms an App
  Store purchase that landed later (app closed mid-purchase, Ask to Buy) and
  toasts "Payment confirmed" with a Draw action (`?draw=1`).

## Cross-module function contracts

`worker/service.ts` (core) — used by payments, push and the room:
```ts
loadState(env: Env, gameId: string): Promise<GameState | null>
/** Re-read state from D1 and push it to every socket in the game's room. */
broadcast(env: Env, gameId: string, activity?: Activity): Promise<GameState | null>
/** The board's host fee is paid (stamps games.paid_at; a legacy draft opens too). Idempotent. */
markPaid(env: Env, gameId: string, purchase: { provider: "test" | "stripe" | "iap"; reference: string; amountCents: number }): Promise<GameState | null>
/** The game was deleted: the room sends { type: "deleted" }, closes sockets with 4404, drops its storage. Never throws. */
closeRoom(env: Env, gameId: string): Promise<void>
isHost(env: Env, gameId: string, adminToken: string): Promise<boolean>
/** Apply a provider update to a linked board: upsert live status + period scores, diff every-score entries, lock at kickoff once the host fee is paid. */
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
  | { kind: "draw-reminder" }   // host only: a linked board kicks off within the hour, its host fee unpaid
  | { kind: "player-joined"; name: string }
  | { kind: "final" }
) & {
  /** Public player id of whoever caused it; they aren't notified about their own action. */
  actor?: string;
};
notify(env: Env, gameId: string, event: NotifyEvent): Promise<void>   // call via ctx.waitUntil
```
Core passes `actor` on host actions: `numbers-drawn` from `POST /lock` (or
`final`, when that draw also ends a linked game the feed already called Final),
`final` from `POST /final` and from a typed-in board's Final score,
`player-joined`, and `board-full` (whoever claimed the last square).
`draw-reminder` comes from the cron (no actor) and goes to the host alone. `board-full` goes out once
per board: the claim that first fills it stamps `games.board_full_at` in the
same transaction (`markBoardFull`, migration 0007), and only that claim pushes;
giving a square back and taking one again doesn't announce it again. `winner` never has an actor (you hear about your own square even
when you typed the score); live-score events have none either. Push resolves
public ids to devices through `getMembers()`.
`worker/index.ts` mounts the routers under `/api` and calls `notify` from the
core routes. Each module owns its own migration file: core `0002_*`,
`0005_housekeeping.sql` (rate limits, the status/created index),
`0007_board_full_announced.sql`, `0008_custom_kickoff.sql` (custom boards'
kickoff in `starts_at`; the cron's index covers linked boards only) and
`0009_pay_at_draw.sql` (`games.paid_at`, grandfathering every board past
`draft` as paid and opening drafts; `games.draw_reminder_at`), payments
`0003_*` and `0006_*`, push `0004_*`, auth `0010_accounts.sql`.

`worker/auth/index.ts` (auth):
```ts
authRoutes: Hono<{ Bindings: Env }>              // /auth/apple, /auth/google, /auth/sign-out, /me, /account
authConfig(env: Env): AuthConfig                 // for GET /api/config
/** x-client-id -> the clientId the request acts as (the account's canonical one when signed in). */
canonicalClientId(db: D1Database, clientId: string, opts?: { signedIn?: boolean }): Promise<string>
```
Core helpers it uses: `db.mergeClientStatements(db, from, to, now)`,
`db.hostTokensFor(db, clientId)`, `db.latestProfileOf(db, clientId)`; push:
`mergeClientStatements`, `deleteSubscriptionStatement`,
`deleteClientSubscriptionsStatement` (`worker/push/store.ts`).
