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
- Amounts never leave the app: not in push notifications, email notices,
  link previews/OG tags, invite or share text, or activity data. A host's
  free-text note ("Loser buys wings") may be quoted in a push (and an email,
  the same way).
- The only payment is the host paying JaxSquares the host fee for a board, due
  when they draw its numbers: one tap with Apple Pay / Google Pay (Stripe) on the
  web, Apple In-App Purchase in the iOS app. Or the yearly **Host Pass** ($19.99
  a year, auto-renewing until canceled), which covers that fee on every board
  its holder hosts while it's active, or the web-only **Club Pass** ($49 a
  year: the Host Pass plus club branding, 10 co-hosts, a players CSV and a club
  TV; never offered in the iOS app; see "The Club Pass"). Creating a board, inviting and picking
  squares are free, and so is drawing a board whose squares 5 or fewer players
  hold (the free tier: `FREE_PLAYER_LIMIT` / `isFreeDraw` in
  `shared/hostFee.ts`); JaxSquares never sells squares. A **season board** pays
  one fee ($14.99) at its own draw for every game of the season (see "Season
  boards"). With `PAYMENTS_MODE` unset
  the app runs a clearly labeled no-charge test checkout (and test pass). See
  docs/payments.md and "The host fee" below.
- No account needed. A device is identified by a random `clientId` (localStorage, plus
  Capacitor Preferences in the native app) sent as `x-client-id` on every request.
  The host additionally holds a per-game `adminToken` sent as `x-admin-token`.
  Up to 3 co-hosts (10 on a Club Pass holder's board) the host invites run the board with them by their
  (canonical) clientId, never the token (see "Co-hosts").
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
| `Game` | `hostPlayerId`, `cohostIds` |
| `Player` | `id` |
| `Square` | `playerId` |
| `Activity` | `actor` (null for system events), winner `data.playerIds` |
| `PeriodResult` (`resolveResults`) | `winnerPlayerId`, `reverseWinnerPlayerId`; `winnersOf`, `myWins`, `winCounts`, `countClaimedBy`, `liveCell().playerId` all take/return public ids |
| Live socket | `?player=<public id>` |
| `GameSummary` | `host.id`, `leaderPlayerId` (the rest is computed per device: `isHost`, `joined`, `mySquares`, `myWins`) |

- Server: D1 stores clientIds (`players.client_id`, `squares.client_id`,
  `games.host_client_id`, `cohosts.client_id`); `worker/db.ts` derives public ids on read (memoized in
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
  co-host rows, players, squares, its public id in the feed, push
  registrations, mutes, Host Pass rows, its Stripe customer and its email
  notice addresses) to the canonical clientId in one batch with its link, bumps the touched boards'
  versions and broadcasts them. Its own clientId then works only through
  `client_links`.
- `GET /api/me` and every sign-in return `MeResponse`: the (account's) public
  id, the account, the admin tokens of the boards the identity hosts (never
  anyone else's) and the ids of the boards it co-hosts (`cohostGames`, no
  token: a co-host is authorized by clientId). The app stores the id next to the clientId
  (`jaxsquares.playerId`, tied to the clientId it was given for) so "mine"
  works offline at startup, and the tokens like the creator's device does.
- Sign-out wipes the device (new clientId; player id, account, profile, boards,
  admin tokens and seen list cleared). Deleting the account stops a web Host
  Pass from renewing, revokes the Apple token and deletes the account rows; the
  boards and squares stay as anonymous data under the canonical clientId.
- Email and name never appear in a public object (Player, activity, push, OG);
  no response carries a clientId. Neither does an email-notice address (see
  "Email notices" below): only its owner gets it back, masked.

## Runtime

- One Cloudflare Worker (Hono) serves `/api/*`, `/.well-known/*`, per-game link
  previews, and the React SPA via the `ASSETS` binding.
- D1 (`DB`) is the source of truth. Core SQL lives in `worker/db.ts`; tables a
  module owns are queried only by that module's store file
  (`worker/payments/store.ts`: `purchases`, `host_passes` (with its `plan`), `stripe_customers`; `worker/push/store.ts`:
  `push_subscriptions`, `game_mutes`; `worker/auth/store.ts`: `accounts`,
  `account_identities`, `client_links`; `worker/email/store.ts`:
  `email_subscriptions`, `email_suppressions`; `worker/clubs/store.ts`:
  `clubs`). The sign-in merge runs
  statements built by each owner in one batch.
- Durable Object `GameRoom` (`GAME_ROOM`, one per game id via `idFromName(gameId)`)
  holds the hibernatable WebSockets for that game, broadcasts state, tracks presence,
  and, for boards linked to a real game, polls live scores with an alarm while the
  game is on.
- Durable Object `ScoreHub` (`SCORE_HUB`, one per league via `idFromName("espn:nfl")`:
  `nfl`, `ncaaf`, `nba`, `wnba`, `ncaab` and `ncaaw` each get their own)
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
  stamped in `games.draw_reminder_at`, migration 0009), unless the board is
  free (5 or fewer players hold squares; left out in SQL, unstamped) or the
  host's Host Pass covers it (`holdersOfActivePass`): Jax draws those at
  kickoff. Each minute it also reads up to 5 drawn season boards' schedules
  that are due (about every 12 hours each, within the hour after a failed
  read) and gives new games their boards (`syncSeasons`, see "Season boards").
  Once an hour (UTC minute
  17) it runs housekeeping (`worker/housekeeping.ts`): settles boards left from
  the pay-to-open flow (`settleLegacyBoards`: a board its payment opened counts
  as paid, a draft opens and its new state is pushed), prunes activity beyond
  the newest 200 per game, drops expired rate-limit windows, and deletes
  email-notice addresses past their keep (a week after the board's final, an
  unconfirmed one when its link expires; docs/email.md). An App Store
  purchase for a board deleted before it was confirmed isn't lost: `/pay/iap`
  keeps it as `unused` (410); so does the Stripe webhook for a board deleted
  before its payment landed.

## HTTP API

All JSON. Errors are `{ error: string }` with a 4xx/5xx status; the message is
friendly enough to show as-is. `C` = needs `x-client-id`, `H` = the board's
host (`x-admin-token` for that game) or one of its co-hosts (the request's
canonical clientId; no token; see "Co-hosts"), `H!` = host only (the admin
token; a co-host gets 403). `429` = rate limited (see below; has `Retry-After`).

| Method | Path | Who | Body | Returns |
|---|---|---|---|---|
| GET | `/api/config` | – | – | `AppConfig` (`no-store`: a switch to live checkout or a new price reaches clients at once; the client reuses it for a minute). `auth`: the public sign-in client ids (`AuthConfig`); a provider without one is hidden. `emailEnabled`: email notices are set up (the app shows the opt-in only then) |
| POST | `/api/auth/apple`, `/api/auth/google` | C | `SignInInput` (`{ idToken, nonce?, authorizationCode?, name?, redirectUri? }`) | `MeResponse`. Verifies the ID token (JWKS, `iss`, `aud`, `exp`/`iat`, nonce = SHA-256 of the raw one); a new identity makes this device an account's canonical one, a known one merges this device into it, and a new one whose verified email (not an Apple private relay address) an account has joins that account the same way (docs/auth.md "One account per email"). `MeResponse.account.providers` lists every way the account signs in. 400 bad body, 401 refused token, 409 "Sign out first" (linked to another account), 429, 502 provider keys unreachable, 503 provider not set up |
| GET | `/api/me` | C | – | `MeResponse` `{ playerId, account \| null, hostTokens, profile?, hostPass?, clubPass?, cohostGames? }` (`no-store`; reads the link fresh; 503 when it can't). `hostPass`: the identity's `HostPass` or null; `clubPass`: its Club Pass, the same shape; `cohostGames`: ids of the boards the identity co-hosts (newest 200, no tokens) |
| POST | `/api/auth/apple/link`, `/api/auth/google/link` | C | `SignInInput` (+ `combine?`) | `MeResponse`: adds that sign-in to the account this device is signed in to. 409 "Sign in first" (this device isn't); 409 `{ error, code: "account_exists" }` when that sign-in has its own account, until resent with `combine: true`, which moves that account's boards, devices and sign-ins into this one and deletes it; otherwise as sign-in |
| POST | `/api/auth/sign-out` | C | `SignOutInput` (`{ endpoint?, token? }`, optional) | `{ ok: true }`: drops this device's link and that push registration from the account; 429 |
| DELETE | `/api/account` | C | – | `{ ok: true }`: revokes Apple tokens, deletes the account, identities, links and the account's push registrations and email notice addresses; boards and squares stay. 404 when not signed in; 429 |
| GET | `/api/schedule?league=nfl\|ncaaf[&week=2-8]` | – | – | `ScheduleResponse`: without `week`, the first week with games to link (`week`, `events`) and the weeks after it (`weeks`); with `week` (`<season type>-<week>`), that week's `events`. Cached; `{ events: [], unavailable: true }` when ESPN is down. 400 with `date` |
| GET | `/api/schedule?league=nba\|wnba\|ncaab\|ncaaw[&date=20260320]` | – | – | `ScheduleResponse` `{ events, dates }`: basketball goes by day (ESPN's US date). Without `date`, the next 7 days, today's slate first (`dates` lists the 7 `YYYYMMDD` days; one cached ESPN fetch per day, a day that fails is left out); with `date` (yesterday's slate to 400 days ahead), that day. 400 with `week`, or a `date` that isn't a real day in range. Same caching and `unavailable` as football. `ncaab` and `ncaaw` ask ESPN for Division I (`groups=50`, `limit=400`) |
| GET | `/api/season/teams?league=<linked league>` | – | – | `SeasonTeamsResponse` `{ teams }`: the league's teams for a team's season (provider id, name, short name, abbreviation, color; never a logo: team logos are the leagues' trademarks, so teams show as their abbreviation on their color), by name; cached a day; `{ teams: [], unavailable: true }` when ESPN is down; 400 bad league |
| GET | `/api/season/schedule?league=<linked league>&team=<id>[&year=2026]` | – | – | `TeamScheduleResponse` `{ team, year, events }`: one team's season (regular season, then the postseason games scheduled so far; the NBA's play-in too), every game in order, a finished one with its `result`; `homeId`/`awayId`, `label` ("Week 7", "Wild Card"), `playoff`. 200 `unavailable` when ESPN is down; 400 bad league, team or year |
| POST | `/api/games` | C | `CreateGameInput` | `CreateGameResponse` (201): the board is `open` right away with `paid: false` (`paymentRequired` is always `false`; the host fee is due at the draw); 409 `{ error, code: "account_required" }` from a device that isn't signed in wherever web sign-in is set up (`hostsSignIn`, docs/auth.md "Hosts sign in"), checked first; 400 on bad rules (see "Rules and prizes"), money in a note, the name or a team name, or a custom `startsAt` out of range (see "Kickoff"); 429. The stored format is canonical (rules always present, `periods`/`reverse` derived) and `prizes` is `{}`: an older client's preset and notes become rules. With `fromGameId` ("Add another board for this game", see "Several boards for one game"): only that board's host (its admin token as `x-admin-token`, or the identity that hosts it) or one of its co-hosts; the new board takes that board's game and joins its group; 400 malformed id, 403 not its host or co-host, 404 no such board, 409 its game started or ended, or its group is full (or it's a season board or one of a season's games, `SEASON_ERRORS.sibling`). With `season` (`SeasonInput`, see "Season boards"): a season board; 400 on a bad scope, numbers, league, team, no game ahead or more than 120 (`SEASON_ERRORS`) |
| GET | `/api/games/:id` | – | – | `GameState` |
| GET | `/api/games/:id/host-check` | C H! | – | `{ ok: true }`; 403 when `x-admin-token` isn't this board's, 404 for no board. A device checks a host link's token here before trusting it |
| PATCH | `/api/games/:id` | C H | `UpdateGameInput` | `{ state }`; 400 on money in a note or the name, bad rules, a `startsAt` out of range or on a linked board; 409 when `format` changes something locked (see "Rules and prizes"). A `format` edit writes the canonical format + fixed `periods`, clears legacy `prizes`, logs a `rules` activity and broadcasts (never pushed). `prizes` from an older client land in the rules' notes on a board that has rules. A `startsAt` edit (custom boards, any time) is broadcast with no activity and no push. A season's game board: 409 (`SEASON_ERRORS.childEdit`); a season board's `format` and `name` reach its games' boards (see "Season boards") |
| DELETE | `/api/games/:id` | C H! | – | `{ ok: true }`; open sockets get `{ type: "deleted" }` then close 4404; co-host rows and invites go with the board. A season board takes its games' boards with it; a season's game board is 409 (`SEASON_ERRORS.childDelete`) |
| POST | `/api/games/:id/join` | C | `JoinInput` | `{ state }` (upsert; also used to rename); 409 once the board has `MAX_PLAYERS` (200, `shared/squares.ts`) and you aren't one of them, or on a season's game board (`SEASON_ERRORS.childJoin`: players join the season board); 429 |
| DELETE | `/api/games/:id/players/:playerId` | C H | – | `{ state }`: removes that player (public id) and frees their squares while the board is `open` (or a legacy `draft`); a removed co-host stops being one. 400 for the host (403 when a co-host asks), 403 when a co-host asks to remove another co-host, 404 if not on the board, 409 once locked. They may join again |
| POST | `/api/games/:id/cohost-invites` | C H! | – | `CohostInviteResponse` `{ url, expiresAt }` (201, `no-store`; 409 on a season's game board: invite on the season board, `SEASON_ERRORS.childCohost`): a single-use link `<origin>/g/<id>?cohost=<token>` (43-char base64url token; D1 keeps only its SHA-256) good for 7 days (`COHOST_INVITE_TTL_MS`). 409 once the board has its host's plan's limit (`cohostLimitOf`: `MAX_COHOSTS`, 3, or `CLUB_MAX_COHOSTS`, 10, on a Club Pass holder's board); 429 |
| POST | `/api/games/:id/cohosts/accept` | C | `CohostAcceptInput` `{ token }` | `{ state }`: the caller (a player on the board, not its host) becomes a co-host; the invite is used up in the same transaction, which re-checks it's unused and unexpired and that the board has room. Already a co-host: `{ state }`, the link stays unused. 400 malformed token, 403 not on the board ("Join the board first…"), 404 unknown link, 409 the host's own link or the board is full, 410 used or expired; 429. Logs a `cohost` activity and pushes `cohost-accepted` to the host |
| DELETE | `/api/games/:id/cohosts/:playerId` | C H | – | `{ state }`: the host removes a co-host (public id), or a co-host steps down (their own id; any other id is 403 for a co-host). They stay on the board. 404 when that id isn't a co-host |
| POST | `/api/games/:id/claim` | C | `CellsInput` | `{ claimed: number, skipped: number, state }`; 409 on a season's game board (`SEASON_ERRORS.childClaim`; release too); 429 |
| POST | `/api/games/:id/release` | C | `CellsInput` | `{ state }`; 429 |
| POST | `/api/games/:id/lock` | C H | – | `{ state }` (draws numbers; a co-host too). Free while 5 or fewer players hold squares (`isFreeDraw`): the board is marked paid with provider `free`, reference `free`, amount 0 (`db.markFreeDraw`, which counts the holders again in SQL) in the same batch as the draw, before any pass check; a 6th player whose claim committed first makes that a no-op and the route decides again with them counted (docs/payments.md "The free tier"). Otherwise **402** `{ error: "Draw the numbers once the board's paid for.", code: "payment_required" }` (`PAYMENT_REQUIRED_CODE`) while the host fee isn't paid (`Game.paid`) and no active Host Pass covers it (the caller's, by canonical clientId, so a co-host's own pass counts, or the board's host's; then the board is marked paid through the pass, provider `pass`, amount 0, in the same write as the draw); 409 once drawn. On a linked board whose game the feed already called Final, the draw also ends the board (`final`, one `final` push instead of `numbers-drawn`). A season board's draw (its season fee) reads the schedule again, gives every game ahead a board and sends one `numbers-drawn`; 409 when no game is left to play (`SEASON_ERRORS.noGames`) |
| POST | `/api/games/:id/scores` | C H | `ScoreInput` | `{ state }`; 409 on a season board (`SEASON_ERRORS.seasonScores`: scores go on its games' boards, like winners). Every-score boards: `periodKey` `"next"` (or `""`) appends entry `s(N+1)`; `sN` edits an existing entry (a `label` mentioning money is a 400). Re-saving a period's recorded score is written but not announced again (no score/winner activity or push) |
| DELETE | `/api/games/:id/scores/:periodKey` | C H | – | `{ state }`. On every-score boards the entry's host pick goes with it (the next entry reuses the index) |
| POST | `/api/games/:id/winners` | C H | `ManualWinnerInput` | `{ state }` |
| DELETE | `/api/games/:id/winners/:periodKey` | C H | – | `{ state }` |
| POST | `/api/games/:id/final` | C H | – | `{ state }` (host ends the game) |
| GET | `/api/games/:id/export.csv[?tz=<IANA zone>]` | C H | – | A Club Pass board's players as CSV (`text/csv`, `attachment`, `no-store`, UTF-8 with a BOM): Player, Squares, Square list ("row-col" from 1), after the draw `Numbers (KC-PHI)` (a column per draw with new numbers each quarter), `Joined (<zone>)`. Never a payment column, an email or a clientId; a name a spreadsheet would run as a formula starts with `'`. 403 on a board whose host has no active Club Pass, or for anyone but the host and co-hosts; 429 |
| GET | `/api/games/:id/live?player=<public id>[&watch=0]` | – | WebSocket upgrade | stream of `LiveMessage` (see "Live socket") |
| GET | `/api/me/games[?seen=<id>,<id>]` | C | – | `{ games: GameSummary[] }` (hosted ∪ co-hosted ∪ joined ∪ the `seen` boards that exist; see "Dashboard summaries") |
| POST | `/api/games/:id/pay/test` | C H | – | `{ state }` (test mode only; marks the host fee paid, doesn't draw) |
| POST | `/api/games/:id/pay/stripe` | C H | – | `{ clientSecret, amountCents, currency }` (PaymentIntent for this board's host fee; show and itemize its amount); 409 `{ error, state }` once the board is paid for |
| POST | `/api/games/:id/pay/iap` | C H | `{ transactionId }` | `{ state }` (verifies with Apple, marks the fee paid). A verified purchase that can't pay for the board is kept in the ledger as `unused`: 409 `{ error, state, unused: true }` when the board is already paid for (or another purchase paid for it at the same instant: a board has one `paid` purchase, decided in one transaction, see docs/payments.md), 410 `{ error, unused: true }` when it was deleted (no admin token needed then; the purchase's board binding is the proof) |
| POST | `/api/stripe/webhook` | Stripe | raw | `{ received: true }`. `payment_intent.succeeded` marks the board paid only if this intent is the board's one `paid` purchase; one that lost to another purchase, or arrived after the board was deleted, is kept as `unused`. `invoice.paid` and `customer.subscription.*` for a Host Pass make the server read the Subscription back from Stripe |
| GET | `/api/payments/pass` | C | – | `HostPassState` `{ pass: HostPass \| null, offer: HostPassOffer, club: HostPass \| null, clubOffer: ClubPassOffer }` (`no-store`), for the request's canonical identity. The purchase routes below take `{ plan: "club" }` for the Club Pass (`test`, `test/end`, `stripe`, `stripe/confirm`; web only) |
| POST | `/api/payments/pass/test`, `/api/payments/pass/test/end` | C | – | `HostPassState`: a no-charge test pass for a year / end it. Test mode only (403 in live) |
| POST | `/api/payments/pass/stripe` | C | – | `{ clientSecret, amountCents, currency }` (the pass's first invoice, Stripe Billing); **409** `{ error, code: "account_required" }` (`ACCOUNT_REQUIRED_CODE`) for a device with no account link; 409 with the state when one is active; 503 until `STRIPE_HOST_PASS_PRICE_ID` is set |
| POST | `/api/payments/pass/stripe/confirm` | C | – | `HostPassState`, read back from Stripe |
| POST | `/api/payments/pass/portal` | C | – | `{ url }` of a Stripe Customer Portal session (Manage); 404 with no web pass |
| POST | `/api/payments/pass/iap` | C | `{ transactionId, jws? }` | `HostPassState`: verified with the App Store Server API (transaction, subscription status) and attached; 409 when another identity holds it and `jws` doesn't prove it's this Apple ID's |
| POST | `/api/payments/pass/iap/restore` | C | `{ transactions: [{ transactionId, jws? }] }` | `HostPassState & { restored }` (Restore purchases) |
| POST | `/api/payments/apple/notifications` | Apple | `{ signedPayload }` | App Store Server Notifications V2, verified up to Apple's root (`worker/payments/appleJws.ts`); `{ received: true, outcome }`; 400 on a bad signature |
| POST | `/api/push/register` | C | `PushRegistration` | `{ ok: true }` |
| POST | `/api/push/unregister` | C | `{ endpoint? , token? }` | `{ ok: true }` |
| POST | `/api/push/test` | C | – | `{ ok: true, devices, sent, failed }` (sends "you're all set" to this device's registrations; a signed-in device's are its account's) |
| GET | `/api/games/:id/mute` | C | – | `{ muted: boolean }` |
| POST | `/api/games/:id/mute` | C | `{ muted: boolean }` | `{ ok: true }` |
| GET | `/api/games/:id/email` | C | – | `EmailNotices` `{ status: "none" \| "pending" \| "confirmed" \| "unsubscribed", email }`: the caller's own email notices for the board, the address masked ("j•••@gmail.com"); 503 until email is set up; 429 |
| POST | `/api/games/:id/email` | C | `EmailNoticesInput` (`{ email }` or `{ resend: true }`) | `EmailNotices` (`pending`): sends "Confirm your email for <board>" (double opt-in). 400 bad address, 403 not on the board, 409 board final / the address is used on the board / it unsubscribed from all email / nothing to resend, 429 (also a resend within a minute, and 5 confirmation emails per address per hour), 503 until set up |
| DELETE | `/api/games/:id/email` | C | – | `{ status: "none", email: null }`: the address is deleted (works even when email isn't set up); 429 |
| GET, POST | `/api/email/confirm?token=` | – | – | HTML page. GET asks ("Confirm my email", which POSTs); POST confirms. 400 page for a used or expired (7 days) link, 503 until set up |
| GET, POST | `/api/email/unsubscribe?token=` | – | form `scope=board\|all`, or RFC 8058 `List-Unsubscribe=One-Click` | HTML page. GET asks (this board, or every board for the address); POST unsubscribes. 400 page for a bad token |
| GET | `/api/clubs/mine` | C | – | `ClubSettings` `{ club: ClubBrand, tvKey, boards: ClubBoard[] }` (`no-store`): the identity's club, made on first need; 404 without an active Club Pass |
| PATCH | `/api/clubs/mine` | C | `{ name }` | `ClubSettings`; 400 a name over 40 characters or one that talks money (`CLUB_NAME_MONEY_ERROR`); 404; 429. Re-broadcasts the club's open and live boards |
| PUT | `/api/clubs/mine/logo` | C | the image (`image/webp` or `image/png`, ≤ 60 KB, ≤ 256×256) | `ClubSettings`; 400 (empty, magic bytes not matching the type, broken header, too large in pixels), 413 (over 60 KB), 415 (any other type); 404; 429 |
| DELETE | `/api/clubs/mine/logo` | C | – | `ClubSettings`; 404; 429 |
| POST | `/api/clubs/mine/tv` | C | – | `ClubTvLink` (201, `no-store`): `ClubSettings` + `tvUrl` `<origin>/club/<id>/tv#k=<token>`; only the token's hash is kept, the old link stops working; 404; 429 |
| GET | `/api/clubs/:id/logo[?v=<version>]` | – | – | The logo, `ETag`, `nosniff`; `public, max-age=31536000, immutable` with its current `?v=`, a day otherwise; 304 on `If-None-Match`; 404 |
| GET | `/api/clubs/:id/tv` | – (`x-club-tv-token`) | – | `ClubTvState` `{ club, active, boards: GameState[] }` (`no-store`): up to 12 open and live boards' public states (live, then drawn, then being picked); `boards: []` when the Club Pass isn't active; 404 for a wrong or old token (the same as an unknown club); 429 per address |
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
| `pass` | 30 per device per hour | Host Pass calls: test pass, starting or confirming a web purchase, App Store purchase and restore, Manage (keyed by the resolved public id) |
| `pass-ip` | 120 per address per hour | what `pass` counts, for every device behind one address |
| `cohost-invite` | 20 per device per hour | co-host invite links the host makes |
| `cohost-invite-ip` | 60 per address per hour | what `cohost-invite` counts, for every device behind one address |
| `cohost-accept` | 20 per device per hour | co-host accepts with a well-formed token, counted before the token is looked up (links can't be guessed at speed) |
| `cohost-accept-ip` | 60 per address per hour | what `cohost-accept` counts, for every device behind one address |
| `club-brand` | 30 per device per hour | a club's name changes and logo uploads or removals |
| `club-brand-ip` | 90 per address per hour | what `club-brand` counts, for every device behind one address |
| `club-tv` | 10 per device per hour | new club TV links |
| `club-tv-ip` | 30 per address per hour | what `club-tv` counts, for every device behind one address |
| `club-tv-view-ip` | 120 per address per minute | `GET /api/clubs/:id/tv`, counted before the token is checked |
| `club-export` | 30 per device per hour | players CSV downloads |
| `club-export-ip` | 120 per address per hour | what `club-export` counts, for every device behind one address |
| `email` | 20 per device per hour | adding, resending or removing an email-notice address |
| `email-ip` | 60 per address per hour | what `email` counts, for every device behind one address |
| `email-send` | 5 per email address per hour | confirmation emails to one address, whoever asks (keyed by the address's keyed hash, never the address) |
| `email-status` | 120 per device per minute | `GET /api/games/:id/email` |
| `email-link-ip` | 60 per address per minute | the confirm and unsubscribe pages |

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
  invite pasted in iMessage/WhatsApp previews as "Join <board name>". A finished
  board previews as its recap: "See who won <board name> on JaxSquares" with
  "Final: Chiefs 27, Bills 24 · 4 winners" (the Final's score, else the feed's,
  else the last one recorded; how many players won, never what).
- The same page embeds the board's state (see "Boot state on invite links").
- `GET /g/:id/tv` and `GET /g/:id/print` (the board's TV view and printable
  board, see "TV mode and the printable board") are the same page: `index.html`,
  the board's state, and a preview of their own (`boardPageOf` / `inviteMeta(…,
  page)` in `worker/og.ts`): "<board name> on TV · JaxSquares" ("<matchup> · Live
  on the big screen · <status>") and "Print <board name> · JaxSquares" ("<matchup>
  · A printable board with a QR code to follow it live"), `og:url` the view's own
  link. Never an amount. A code typed in capitals redirects (301) to the
  lowercase view, like the board.
- `/club/:clubId/tv` (the club TV, see "The Club Pass") isn't a Worker route:
  the assets' SPA fallback serves `index.html`, and the page reads its token
  from the URL's fragment.
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
- `isCohost: boolean`: this identity co-hosts the board (Home shows it with
  the boards I host, tagged "Co-host").
- `paid: boolean`: the board's host fee is paid (`Game.paid`); a linked board
  draws its own numbers at kickoff only then (or when it's free). Boards made
  before the fee moved to the draw count as paid.
- `freeDraw: boolean`: 5 or fewer players hold squares (`isFreeHolderCount`,
  `shared/hostFee.ts`), so drawing is free and an unpaid linked board still
  draws itself at kickoff.
- `host: { id, name, color, emoji } | null`: the host's public player profile
  ("Maya invited you"), `id` being the public player id (= `Game.hostPlayerId`);
  null when the host has no player row.
- `format` carries what an invite shows before anyone picks: the display-only
  `squarePrice` (in `unit`) or `justForFun`, and the prize lineup. In-app only,
  like every amount.
- `group: string | null`: the board's group (migration 0012, see "Several
  boards for one game"), the same for every board made for one game.

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
list with an Undo). A player's boards from one game stay together in each
section (`clusterGroups` in `src/features/home/boardGroups.ts`, in the order
they were made, where the group's most urgent board sorts); Needs you, Up next
and Invites hold them in one `BoardGroup` ("Chiefs vs Bills · 3 boards · Sun
1:00 PM", `home-board-group`), each card titled short ("Board 2",
`groupCardTitle`) with its square price where the kickoff was.

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
| `locked` | `{}` host draw, `{ auto: true }` at kickoff (actor null; only once the host fee is paid, the board is free, or a Host Pass covers it) |
| `score` | `{ periodKey, label, scoreX, scoreY, source: "live" \| "host" }` |
| `winner` | `{ periodKey, label, playerIds, cell, reverseCell?, prize, manual? }` |
| `final` | `{}` |
| `rules` | `{ scoring }`: the host (or a co-host) edited rules or prizes (actor = their public id); `scoring` when who wins changed (moments, square/reverse, fresh numbers), not just amounts, notes, unit or price. Never pushed |
| `cohost` | `{ name }`: someone accepted a co-host invite (actor = the new co-host): "Maya is now a co-host". The host gets the `cohost-accepted` push |

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

## Sports: football and basketball (`shared/sports.ts`)

- A board's `sport` is `football` or `basketball` (older boards without one
  read as football); its `league` is `nfl`/`ncaaf` (football), `nba`, `wnba`,
  `ncaab` (men's college), `ncaaw` (women's college) or `custom`.
  `LEAGUE_INFO` holds each league's sport, chip label, schedule shape (by
  `week` or by `day`) and whether it plays halves (only `ncaab`). Create
  validates the pair (`leagueSportProblem`: 400 "That league plays basketball,
  not football."; an unknown sport is 400 `SPORT_ERROR`); a linked board's
  sport follows its league (`boardSportFor`).
- Basketball maps onto the same moments, so results, prizes, suggestions
  (`suggestPrizes`) and every amount path are unchanged: `q1` = end of Q1,
  `q2` = halftime, `q3` = end of Q3, `final` (overtime included). Men's
  college plays two 20-minute halves: only `q2` (halftime) and `final`
  (`momentsFor`, `periodsBefore`: halftime is after period 1;
  `liveMomentIndex`: period 1 plays for halftime, 2 and overtime for the
  final). Presets (`presetsFor`): Every quarter, Halftime and final, Final
  only for NBA/WNBA/women's college and custom basketball; Halftime and
  final, Final only for men's college. Reverse works on all of them.
- No every score for basketball: a `score` rule on a basketball board is a
  400 (`EVERY_SCORE_SPORT_ERROR`) on create and on PATCH `format`
  (`rulesProblemFor`), as is a quarter moment on a men's college board
  (`HALVES_MOMENT_ERROR`). Score kinds (`Prize.byKind`, the score pad's
  TD/FG/XP buttons, `entryPlays`) are football's: a basketball board never
  shows them, and its score pad is the keypad (three-digit scores).
  `freshNumbersInfo` says "each quarter" or "each half".
- The words follow the sport (`shared/sportWords.ts`: `sportWords(sport)`,
  `inSportWords(text)`): "Kickoff"/"the final whistle" or "Tip-off"/"the final
  buzzer", in the board, Home, alerts, push (`worker/push/copy.ts`), email,
  TV, print and the recap card (a court's center circle instead of yard
  lines). Link previews (`worker/og.ts`) add "🏀 Basketball squares" to a
  basketball board's description. The brand stays "football squares".
- "How close am I" on the board (`playBookFor`): baskets (2), threes (3) and
  free throws (1) instead of touchdowns and field goals.

## Module ownership (one owner per file)

- `shared/*` – game rules + types (`playerId.ts` = public id derivation, `hostFee.ts` = the free tier: `FREE_PLAYER_LIMIT`, `isFreeDraw`; `sports.ts` = leagues, sports and each game's moments; `sportWords.ts` = kickoff or tip-off).
  `worker/db.ts`, `worker/index.ts`, `worker/service.ts`, `worker/room.ts`
  (GameRoom DO), `worker/playerIds.ts`, `worker/rateLimit.ts`,
  `worker/housekeeping.ts`, `worker/season.ts` (season boards), `worker/clean.ts`,
  `worker/ids.ts`, `migrations/*` – core API. `shared/season.ts` = season
  boards' pure rules.
- `worker/scores/*` – ESPN schedule + live score provider and the `ScoreHub`
  Durable Object. Exports `scheduleRoutes` (Hono, with `/season/teams` and
  `/season/schedule`), `liveVia(env, event)` (live scores through the hub),
  `fetchLiveForEvent(event)`, and for season boards `teamSeasonVia(env,
  league, teamId, year)` (never throws; null when ESPN can't say),
  `isTeamId`, `isSeasonYear`.
- `worker/payments/*` – Stripe + IAP + test checkout, and the Host Pass
  (`pass.ts`, `passStripe.ts`, `passApple.ts`, `passRoutes.ts`; the App Store
  JWS check in `appleJws.ts` / `x509.ts`). Exports `paymentsRoutes` (Hono),
  `getPaymentConfig(env)`, `activePass`, `holdersOfActivePass`, `hostPassOf`,
  `endWebPassRenewals` and `mergeClientStatements`. Owns
  `worker/payments/store.ts` (its D1 tables).
- `worker/push/*` – web push (VAPID) + FCM. Exports `pushRoutes` (Hono) and
  `notify(env, gameId, event)`. Owns `worker/push/store.ts` (its D1 tables).
- `worker/email/*` – optional email notices (docs/email.md): the double
  opt-in, the Resend sender (`sender.ts`), the templates and link pages, the
  signed unsubscribe tokens. Exports `emailRoutes` (Hono), `emailEnabled(env)`,
  `emailNotices(env, gameId, events)` and the store's `mergeClientStatements`,
  `deleteClientSubscriptionsStatement`, `pruneSubscriptions`. Owns
  `worker/email/store.ts` (its D1 tables).
- `worker/clubs/*` – what the Club Pass turns on (docs/payments.md "Club
  Pass"): the club's branding on its holder's boards (`brand.ts`:
  `clubBrandOf`, read into every board state by `worker/db.ts`, cached per
  isolate for 30 s), the logo check (`logo.ts`), the players CSV (`csv.ts`, used
  by the core export route) and the club routes (`routes.ts`). Exports
  `clubRoutes` (Hono), `clubBrandOf`, `forgetClubBrand`, `playersCsv`,
  `csvFilename` and the store's `mergeClientStatements`,
  `deleteOwnerStatement`. Owns `worker/clubs/store.ts` (`clubs`). The pass
  itself (selling it, `activeClubPass`) is the payments module's.
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

## TV mode and the printable board (client)

Two views of a board for a room, at a suffix of its link (`boardViewPath` in
`src/lib/boardViews.ts`), each its own lazy screen and route-preload entry
(`src/App.tsx`, `vite.config.ts`). The shell lays them out full width, without
the phone column or the route slide (`isBoardViewPath`).

| Route | Screen | For |
|---|---|---|
| `/g/:id/tv` | `src/pages/TvView.tsx` (`src/features/tv`) | a TV or laptop at a watch party or bar (AirPlay, Chromecast, HDMI, a smart TV's browser), landscape 1280×720 to 4K; a portrait screen stacks |
| `/g/:id/print` | `src/pages/PrintView.tsx` (`src/features/print`) | an office wall: US Letter or A4, landscape for 10×10, portrait for 5×5 |

- Who can open them: anyone with the board link. Both read the public board
  through `useGame` (socket + polling, and the page's boot state). `GET
  /api/games/:id` and the live socket need no `x-client-id`, no membership and
  no admin token, so a TV that never joined just watches: it never joins,
  claims or asks for the admin token. The TV is nobody's player (`me = ""`:
  nothing is "mine"); its socket counts once in "N watching" like any device.
- On a Club Pass holder's board the panel's corner shows the club's logo and
  name instead of the JaxSquares mark, and the printout carries the logo and
  "Hosted by <club>" (see "The Club Pass"). The page's body is `TvScreen`
  (exported for the club TV, which passes `hideClub`, a `panelFooter` and a
  winner to celebrate on arrival).
- Entry points: "Show on TV" and "Print board" in the board's invite sheet
  (the top bar's share button; `InviteSheet` props `onShowTv` / `onPrint`), and
  the host sheet's hint "Hosting a watch party? Show the board on your TV."
  (`host-tv`).
- TV mode shows the board as large as the screen allows (`tvLayout`: the full
  height on 16:9, the panel keeps the rest; type scales with `--u`, 1% of the
  short side), first names or initials in the squares (`tvCellName`), the
  drawn digits, team colors (the panel's chips use the board's `--team-x/y`),
  and the square the score points at right now (`rightNow`, glowing; red when
  live). While squares are open the panel is a big QR code to the invite link
  ("Scan to grab a square", the short link, squares left, the prize lineup);
  once the numbers are drawn it's the score with the quarter and clock, "Right
  now", the winners so far (`tvWinners`: each moment's label as the result
  cards say it, amounts included since this is in-app, only whole rows that
  fit) and what's still to play (`tvUpcoming`). A winner activity
  (`useGame`'s `onActivity`) shows a 7 s celebration card (`celebrationFor`)
  with Jax cheering and confetti, one at a time; reduced motion keeps it still.
- TV plumbing (`src/features/tv/screen.ts`): the Screen Wake Lock, taken again
  on `visibilitychange`; Full screen where the browser has it; a toolbar (Full
  screen, Light/Dark, Exit) that hides itself and the cursor after 3.5 s with
  no pointer, touch or key (a remote's arrows count). Its own theme, dark by
  default, saved as `jaxsquares.tvTheme` and never touching the device's
  Appearance choice; the pre-paint script in `index.html` paints a `/tv` page
  in it, and leaving TV mode puts the device's theme back.
- The printout (`PrintSheet`): the board name, teams and kickoff in local time
  (`printDate`), the grid with each owner's name fitted to its box (`fitName`:
  shrink, then split between words, then cut with "…"; widths from
  `src/lib/textWidth.ts`) and the digits (a dash before the draw), who wins
  when (`printRules` over `ruleLines`, so `GameFormat.rules` / `rulesOf`), a
  line per fixed moment to write the winner on (`printWinners`), a QR code to
  the live board ("Follow it live: jaxsquares.com/g/…") and "Made with
  JaxSquares". Before anyone claims it's a sign-up sheet ("Grab a square on your
  phone, or write your name in a box"). Amounts are off by default; the screen
  version's "Include square price and prizes" switch (never printed) adds the
  price and each prize's amount (`printPrice` / `printRules`, reading the rules
  helpers; decided winners' amounts from `PeriodResult`). Black ink on white
  in millimetres whatever the theme; the screen shows the same sheet scaled
  inside its page. `@page` (size, 10 mm margin) is written by the page, and
  print rules apply only under `html[data-print-page]`, set while it's open.
  In the native app (whose web view can't print) the button shares the print
  link to send to a computer.

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
  board locks itself at kickoff only once its host fee is paid, it's free (5
  or fewer players hold squares) or the host's Host Pass covers it; otherwise
  it stays `open` (the feed still records scores) and the kickoff push asks the
  host to draw and tells everyone else they're waiting on the host.
- Shown as "Kicks off Sun 1:00 PM PDT" (`kicksOffLabel` in `src/lib/format.ts`,
  the device's zone labeled at the kickoff itself, so a November date reads
  PST) on the scorebug while squares are picked and in the invite hero; the
  locked scorebug counts down to it; Home sorts Invites and Up next by it and
  counts down; the host sheet's Edit board changes it (`KickoffPicker`).

## Create flow (client)

`/new` is a five-step guided flow (`src/pages/CreateGame.tsx`, model in
`src/features/create/wizard.ts`): `game` (Football or Basketball at the top
(`sport-picker`), then the league chips: NFL / College by week, soonest
picked; NBA / WNBA / Men's college / Women's college by day, the next 7 days
grouped under day headers with a date picker for later days; or Custom teams
+ kickoff), `format` (how squares win), `prizes` (the
rules & prizes editor; skippable, Review then flags "Square price: not set"),
`details` (board name, max per player, the host's name on a device without
one) and `review` (a card per step, then Create). Every step starts filled
in: the default path is pick the game (a tapped game moves on by itself),
Next x3, Create.

"Add another board for this game" runs the same flow from a board this device
runs (host or co-host): `/new?from=<id>&step=prizes` (`parseFrom`; every
step's URL keeps `from`). `CreateGame` loads that board (its cached live state
first, then a fresh read), checks `siblingSeedProblem` (runs it, game not
started, group not full; else "Can't add a board here" with the reason) and
starts the flow from `siblingSeed` (`src/features/create/sibling.ts`): the
board's game as a `board` matchup, its rules, board size, amounts and max per
player, and the name "Office Squares · Board 2". Three steps
(`SIBLING_STEPS`: prizes, details, review; "1 of 3"); the price step is titled
"This board's square price" under a card saying what carries over
(`sibling-intro`: "Same game and rules as Office Squares ($1 a square)"), and
the suggested amounts follow a new price as usual (`autoFill`). Review shows
the game and rules as one fixed card (`review-same-game`). Create sends
`fromGameId` (with that board's admin token when this device holds it). Its
draft is kept apart (`WizardDraft.from`): a flow only picks up its own kind.

"A whole season" (season boards, see "Season boards"): under the sport, "One
game | A whole season" (`board-scope`). With a season the Custom chip goes
away and the league's games give way to `SeasonPicker`
(`src/features/create/SeasonPicker.tsx`, the game step's `seasonPanel`): "A
team's season | Pick games" (`season-scope`); a team's season shows the
league's teams (`GET /api/season/teams`, `useSeasonTeams`: team marks, a search),
then the team's season (`GET /api/season/schedule`, `useTeamSeason`: games
left, the next three, "Playoff games join the season as they're set"), with a
retry and "Pick games" when it can't load; picked games are the league's own
week or day lists with each row a check (`LeagueGames` with `multi`). Then
"Same numbers all season | New numbers every game" (`season-numbers`). The
matchup is a `season` one (`SeasonMatchup`: the axes from `seasonAxes`, the
games ahead from `seasonGamesAhead`); Next waits for a team, its schedule, or
a game ahead. The other steps are the same (rules and prizes for every
game). Review's game card says "Jaguars 2026 season · 17 games so far", the
next game and the numbers choice (`review-season`); the board is named
"Jaguars Season Squares" until the host types one; Create reads "Create
season board" and the fee line "… $14.99 for the whole season with more."
(`createFeeLine(price, true)`, `useHostFee(true, "season")`). The draft keeps
the scope, numbers, each league's team and picks (`WizardDraft.boardScope`,
`seasonScope`, `seasonNumbers`, `seasonTeams`, `seasonPicks`).

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
  Free to draw with up to 5 players, $4.99 for bigger boards."
  (`data-testid="create-fee"`, `createFeeLine`; the price from `useHostFee`: the
  App Store's in the iOS app, a priceless line when it can't say). Opening the board first rewinds the flow's entries
  (`history.go(-wizardDepth)`), then replaces the first one with
  `/g/<id>?invite=1`, so Back from the board goes where the host started, not
  into a finished flow.

## Board deep links (client)

Query flags on `/g/<id>` that open a step on arrival. Each is handled once and
then removed from the URL (`replace`), so back/refresh doesn't repeat it.

| Flag | From | Handled by | Does |
|---|---|---|---|
| `?invite=1` | create flow, after the board is made | `GameView` | opens the invite sheet, if this device holds the admin token |
| `?draw=1` | Home card "Draw numbers", inbox "Your board is full", the "Payment confirmed" toast | `HostControls` | opens the host sheet's lock & draw confirm (`host-lock-confirm`) if the board is `open` with squares claimed, else the host sheet. With the host fee due the confirm reads "Draw the numbers · $4.99" and pays first ("Draw the numbers · Free" on a board of 5 or fewer players) |
| `?cohost=<token>` | a co-host invite link (the host sheet's "Invite a co-host") | `GameView` | keeps the token in memory (removed from the URL at once; a malformed one says "That co-host link isn't complete"), then asks "Become a co-host of <board>?" (`CohostAcceptSheet`). Accepting calls `POST /cohosts/accept`; someone not on the board joins first (the join sheet, "Join & become a co-host"), then it accepts. The host opening their own link, or a co-host, gets a toast instead. A link that can't be used says why and only closes |
| `#host=<adminToken>` (fragment; the older `?host=` still works) | a host link ("Host from another phone", `hostLinkUrl`) | `captureHostLink` (`src/lib/identity.ts`) | stores the token for this board on this device, then strips it from the address bar. The fragment is never sent, so the token stays out of the Worker's request logs. Only a real board code (`[a-z0-9]{4,16}`, lowercased) counts; a malformed one is ignored. A token the device already holds is never overwritten (anyone with the invite can craft `#host=x`, and the server never re-issues it): a different one is kept aside in memory, tried by the API client only after the held one gets a 403, and adopted once it works. A device holding none uses the token at once and checks it (`GET /api/games/:id/host-check`); one the server refuses is dropped again. Opened while `hydrateIdentity` is still reading the native store, the capture waits for it. The board treats this device as the host, not a newcomer (no invite hero, no join sheet on the first tap) |

Removing a player (client): on a device that runs the board (the host's,
holding the admin token, or a co-host's), while squares are being picked
(`draft`/`open`, the API's rule), every row on the board's Players list except
the host's and this device's own (and, for a co-host, other co-hosts';
`canRemovePlayer(game, id, me, role)`) gets a remove button
(`data-testid="player-remove"`). It asks `HostControls` (prop
`removeRequest`) to open the host sheet on its "Remove Maya?" confirm ("Their 6
squares open up again."); the host sheet also has a Players view (Board >
Players) with the same list. The confirm (`remove-player-confirm`) calls
`api.removePlayer` through `useHostActions` (the returned state is applied
with `apply`), then a toast says it's done; refusals read plainly (409: "Squares
are locked now, so everyone stays on the board."). The confirm closes itself if
the board locks meanwhile.

## Co-hosts

Office pools and watch parties often have two or three organizers. The host
invites up to `MAX_COHOSTS` (3) players to run the board with them, or up to
`CLUB_MAX_COHOSTS` (10) on a Club Pass holder's board: the limit is a function
of the host's plan (`cohostLimit(plan)` / `cohostLimitOf(game)` in
`shared/cohosts.ts`, from `Game.club`), checked by the invite route, inside
the accept's own SQL, and by the host sheet. A board whose host's Club Pass
ends keeps the co-hosts it has, but takes no new one past 3.

- **What a co-host can do:** every host action: edit the board, rules and
  prizes (PATCH), draw the numbers (`/lock`, paying the host fee through the
  normal checkout: `/pay/*`), enter and remove scores, pick and undo winners,
  end the game, remove players while squares are picked, and invite players
  (the board link). **Host only:** inviting co-hosts, removing a co-host (a
  co-host can only step down), deleting the board, the host link. Nobody
  removes the host.
- **Auth:** `hostAccess(c, id)` in `worker/index.ts` loads the state with the
  admin token and whether the request's canonical `c.get("clientId")` is a
  co-host (one round trip, `db.getGameStateWithToken(db, id, clientId)`), and
  returns `{ state, role: "host" | "cohost" }`: the token makes it `host`
  (the host's devices and host links, as before), a `cohosts` row `cohost`,
  else 403. `hostState` (every host route) takes either; `hostOnlyState`
  answers 403 to a co-host. The payment routes use `isHostOrCohost`
  (`worker/service.ts`), which resolves `x-client-id` the same way. A co-host
  never sees the admin token: `GET /api/me` lists `cohostGames` without one.
- **Tables** (core, migration `0014_cohosts.sql`, only `worker/db.ts`):
  `cohosts` (`game_id`, `client_id` = the canonical clientId, `added_at`; PK
  both) and `cohost_invites` (`token_hash` PK = SHA-256 of the link's token,
  `game_id`, `expires_at`, `used_at`). Both go with a deleted board; hourly
  housekeeping drops invites used or expired over a day ago. `cohosts` joins
  the sign-in merge (docs/auth.md), so a co-host who signs in on another device
  stays one; `cohost_invites` has no client column.
- **Invite → accept:** the host makes a single-use link
  (`POST /cohost-invites`, 7 days) and shares it; opening it asks "Become a
  co-host of <board>?"; `POST /cohosts/accept` uses the invite and adds the
  co-host in one transaction (`db.acceptCohostInvite`: unused, unexpired, room
  under the limit, a player who isn't the host or a co-host already, all in
  SQL), logs `cohost` ("Maya is now a co-host") and pushes the host
  "🤝 Maya accepted your co-host invite." (`cohost-accepted`).
- **Public state:** `Game.cohostIds`, public player ids in the order they
  became co-hosts. Players lists tag them "Co-host" (`player-cohost`);
  `GameSummary.isCohost` puts the board with the ones I host on Home, tagged
  "Co-host" (`home-cohost`; "You're co-hosting", "You co-hosted").
- **Client:** `useHostRole(state)` (`src/lib/hostRole.ts`, over `hostRoleOf`)
  is the one answer to "does this device run this board, and as whom":
  `"host"` while it holds the admin token, `"cohost"` when its public id is in
  `cohostIds`, else null. `GameView` and `HostControls` show host tools for
  either; requests from a co-host carry no admin token. The host sheet's
  Co-hosts section (`CohostsSection`): the host sees each co-host with Remove
  and "Invite a co-host" ("They can do everything you can, except remove
  you."), which makes the link and opens "Co-host invite ready" with "Share
  co-host link" (`shareLink`, so the share sheet opens on a tap); a co-host
  sees the list with "Step down" on their own row, and none of the host-only
  rows. Stepping down or being removed toasts "You're not a co-host anymore".
  The app keeps `cohostGames` (`jaxsquares.cohosts`) only to load host tools
  early.
- **Drawing as a co-host:** the lock rules are the host's (free with 5 or
  fewer players, else the caller's or the host's Host Pass, else 402). This
  device only knows its own pass, so a co-host whose fee looks due asks the
  server first (no reveal until it answers) and opens the checkout on the 402.

## Several boards for one game

Big game and office groups run two or three boards on one game at different
square prices (a $1, a $5 and a $20 board). Pure rules in `shared/siblings.ts`.

- **Groups** (core, migration `0012_board_groups.sql`, only `worker/db.ts`):
  `games.board_group`, the group's first board's id; NULL = a board on its own
  (every board before 0012). Indexed where set. Not keyed by a clientId, so
  the sign-in merge doesn't touch it. A deleted board leaves the group; the
  others keep its id as theirs.
- **Making one:** `POST /api/games` with `fromGameId`. `groupSourceFor` in
  `worker/index.ts` checks the caller runs that board (its admin token, the
  identity that hosts it, or a co-host by `c.get("clientId")`;
  `db.groupSourceOf` reads the board, its feed's state, any score and its
  group's size in one batch) and `siblingProblem`: not final, not started (a
  score, the feed on or over, or a linked kickoff passed:
  `SIBLING_ERRORS.started`), fewer than `MAX_GROUP_BOARDS` (10) boards. The new
  board takes the source's sport, league, teams, linked event and kickoff (the
  request's are ignored), is hosted by the caller and joins the group in the
  creating batch (`db.joinGroupStatements`: the new board's `board_group`, and
  the source's when it had none, bumping its version). The source and every
  other board in the group are broadcast afterwards (`announceSibling`), so
  their open boards list the new one; deleting a board broadcasts the rest.
- **Payments:** untouched. The new board starts `open` and unpaid like any
  board; each board draws (and pays, or is free, or is covered by a Host Pass)
  on its own. The source's token doesn't run the sibling.
- **Public state:** `GameState.siblings` (only on a board in a group): the
  other boards, oldest first, each `{ id, name, status, squarePrice, unit,
  justForFun, squaresLeft, totalSquares }` (`siblingSummary`; no clientId, no
  admin token, no players), read with the board's state (one more indexed
  query, only for a grouped board). A sibling's counts can trail it until this
  board's next state. `GameSummary.group` for Home.
- **Names:** a new board is suggested "<first board's name> · Board N"
  (`nextSiblingName`, past any number in use), never "· $5 board": a board's
  name is every push's title and its link preview, and the server refuses a
  name that mentions money.
- **Host entry points:** the host sheet's "Add another board for this game"
  (`host-add-board`, Board section, until the game starts; "This game has 3
  boards" under it) and the invite sheet the create flow opens
  (`invite-add-board`), for the host and co-hosts (`useHostRole`). Both open
  `/new?from=<id>&step=prizes` (see "Create flow").
- **Players:** the board shows "More boards for this game" under the grid
  (`SiblingBoards`, `sibling-boards` / `sibling-board`: the name, "$5 a
  square" when set (in-app), squares left or "Numbers drawn"/"Final", a tap
  opens it). The invite hero says "This game has 3 boards · See them"
  (`invite-hero-boards`, scrolls to the row); the invite sheet lists the
  boards by name (`invite-boards`); share text adds only the count
  (`inviteMessage`: "Grab a square on my Chiefs vs Bills board 🏈 · This game
  has 3 boards", `boardCountLine`).

## Season boards

One board for a whole season: a team's games, playoffs included as they're
scheduled, or games the host picks from a league's lists. Players pick
squares once, on the season board; at its draw (and its one host fee) every
game still to come gets a board of its own, scored live like any linked
board. Pure rules in `shared/season.ts` (tested in `shared/season.test.ts`),
orchestration in `worker/season.ts`, the provider in `worker/scores`, D1 in
`worker/db.ts`.

- **What it covers** (`SeasonInput` on `POST /api/games`, `parseSeasonInput`):
  `scope` `team` (a team's season: `team` with its provider id, `year`) or
  `games` (the picks); `numbers` `same` (one draw for every game, the classic
  season grid) or `fresh` (each game's board draws its own when it's made);
  `events`, the games as the host saw them (`SeasonEvent`, the ones not
  started, at most `MAX_SEASON_GAMES`, 120). A league with live scores only
  (no custom season). Every game uses the season board's rules and prizes
  (one `GameFormat`). The axes: the team across the top and "Opponent" down
  the side for a team's season (each game's board puts the team on X and the
  opponent on Y, whichever is home), "Away" and "Home" for picked games.
  `games.starts_at` is the first game's kickoff; `linked_event` stays NULL (a
  season board has no feed of its own: no room polling, no draw reminder, no
  draw at kickoff; the host draws it).
- **Data** (migration `0017_season.sql`, core, only `worker/db.ts`):
  `games.kind` (`board` | `season`), `games.season` (the season board's
  `SeasonSpec` plus the events it knows, JSON), `games.season_id` and
  `games.season_event` on each game's board (unique together: one board per
  game, so the draw and the cron can't both make one), `games.season_synced_at`
  (the cron's last read; indexed for drawn season boards). No new table keyed
  by a clientId: a game's board copies the season board's `players` and
  `squares` rows, which the sign-in merge already moves (every board's).
- **The draw** (`POST /lock` on the season board): the fee as any board (402,
  the free tier counting the season board's players, a Host or Club Pass;
  `SEASON_BOARD_PRICE_CENTS`, docs/payments.md "Season boards"). It reads the
  team's schedule again (`seasonSchedule`; picks as stored), refuses a season
  with nothing left to play (409), draws the season's numbers
  (`seasonNumbers`: one draw, or none with `fresh`) and then
  `syncSeasonGames` makes each game's board in one batch
  (`db.seasonGameStatements`: locked, paid through the season board, provider
  `season`, reference its id, amount 0, the season board's host, admin token,
  rules, prizes, players and squares, numbers `gameNumbers`, a quiet `locked`
  activity, linked to its event so its room polls the score). One
  `numbers-drawn` push and email for the season board ("Numbers are in for
  the whole season"), none per game.
- **The cron** (`syncSeasons`, every minute, 5 due season boards a tick,
  `SEASON_SYNC_MS` 12 h apart, `SEASON_RETRY_MS` after a failed read): a
  team's season gets boards for new games (playoffs) and moved kickoffs
  (flexed games not started), a picked season only what's stored. It ends
  the season board (`final`) once every game's board is final and nothing more
  is scheduled, a team's season 14 days after its last game (a late playoff
  game still lands). Season boards that fail (provider down) are read again
  within the hour; the cron fails open on a database without 0017.
- **A game's board** (`Game.seasonId`): never takes claims, joins, releases,
  edits, co-host invites or deletion (409, `SEASON_ERRORS`), never shows on
  Home or in `/api/me` host tokens, is never a group's sibling, and its
  winners are its own (`applyLiveUpdate` decides them, then touches the season
  board so its schedule and standings move: `touchSeason`, one commit and a
  room push, no notification). Its players get its winner and final pushes
  like any board's; a mute on the season board covers its games
  (`subscriptionsFor` checks both ids), and its email notices go to the
  season board's subscribers. The season board's host and co-hosts run it:
  the admin token is the season board's (the host's devices adopt it,
  `adoptSeasonToken`), and a co-host check reads the season board's co-hosts
  (`RUN_BY`). Club branding follows the season board's host. `PATCH` on the
  season board sends a new `format` to every game's board without a score yet
  (`seasonFormatStatement`) and a new name to all of them ("Office Season ·
  JAX @ MIA", `seasonGameName`), broadcasting the ones within a week.
- **Public state**: `GameState.season` on the season board (`SeasonState`:
  the spec, `games` as `SeasonGame` with each board's id, status, live state,
  latest score and winners by moment, planned games before the draw, and
  `standings`, `seasonStandings`: wins, games won and the display-only amount
  through `PeriodResult`, ranked by wins then amount; public ids only);
  `GameState.seasonGame` on a game's board (`SeasonPosition`: "Game 3 of 17",
  the season board's id and name, the games either side). `GameSummary.kind`
  and `.season` (`SeasonSummary`) for Home.
- **Client**: the create flow's "One game | A whole season"
  (`board-scope`), then `SeasonPicker` (a team grid of team marks and a search,
  the team's games left and next games, or the league's lists as checks; the
  numbers choice) and Review's "Jaguars 2026 season · 17 games so far" (see
  "Create flow"). The season board's page (`src/features/season`): the
  `SeasonHeader` (the season, the game on now or next, "Join the season", my
  place), the tabs Squares / Schedule / Standings (`SeasonSchedule`: on now,
  coming up, played with winners, each a link to its board;
  `SeasonStandings`, with the top 3 once the season's over), and on a game's
  board `SeasonNav` ("Game 3 of 17 · Office Season", back to the season, the
  games either side). Home lists the season board, as its game on now while
  one is live (`seasonCardOf`). `/g/<season>/tv` opens the game on now or
  next; the club TV shows a season's games while live or within 6 hours of
  kickoff, never the drawn season board itself. Link previews: "Jaguars 2026
  season · 17 games · Follow the season live", never an amount.

## The recap card (client)

"Share the recap": a 1080×1350 PNG (stories and feeds) made in the browser
once a winner lands or the game goes final (`src/features/recap`).

- **Model** (`recapModel.ts`, pure and tested): `recapCard(state)` (null
  before the first decided moment): the board's name, the teams (short name,
  abbreviation, their colors as `teamVars` makes them on dark, and a text
  color lifted to 4.5:1 for the digits), the final score or the score so far
  ("Final", "At halftime", "After Q1", "After score 4"), every winning square
  in game order (period label, "Score 3 · TD", "Q1 reverse"; the winner's name,
  color and emoji, or "Nobody had it"; the winning digits, swapped for a
  reverse square) and how many players won. `recapLayout(card)` places
  everything (rects, circles, lines, text runs, Jax) in card pixels; seven row
  lines, and when more don't fit, "+ N more on the board" with the Final's
  square kept first, then the other fixed squares, their reverse squares, the
  latest scores (`fitRows`). No amount ever: no price, prize, by-kind amount
  or "rest" (the tests run every text through the money checks).
- **Drawing** (`drawRecap.ts`): its own fixed design (night turf, team-color
  floodlights, faint yard lines, lime and gold), whatever the theme. Text in
  the brand fonts the page loads (Bricolage Grotesque for the headline and the
  score, Figtree for the rest), each weight asked for with
  `document.fonts.load`, then `document.fonts.ready`. Jax is the kit's cheer
  pose rendered to SVG markup with its theme colors swapped for fixed ones and
  drawn as an image. "Made with JaxSquares · jaxsquares.com" at the foot.
- **Sending** (`shareRecap.ts`): the Web Share API with the PNG as a file
  where the browser can share files (`navigator.canShare({ files })`); else a
  download. The iOS app's `@capacitor/share` takes only `file://` URLs, and
  writing the PNG to the cache needs `@capacitor/filesystem`, which the app
  doesn't ship: there the web view's own file share is used when it has one,
  otherwise the board's link goes through the native share sheet with the
  recap's words (`recapShareText`: "Final: Chiefs 27, Bills 24 · 3 winners on
  Office Squares 🏈").
- **Entry points:** under a final board's results, "That's the game" with
  "Share the recap" (`recap-cta`, `recap-open`); a "Recap" pill beside "Rules
  & prizes" while winners are still landing (`recap-open`); and a toast with a
  "Share the recap" action when a winner lands or the final whistle blows
  (`useRecapNudge`, after that moment's own ticker alert; not for a moment
  nobody's square won). The sheet (`RecapSheet`) paints the card when it
  opens, shows it (`recap-preview`), and its button (`recap-share`,
  `data-mode=files|link|save`) shares from the tap itself.

## The host fee (client)

The fee is due when the host draws the numbers (`needsHostFee(game)` in
`src/features/host/hostModel.ts`: a board still being picked whose `paid` is
`false`; an absent `paid`, from an older cached state, reads as paid and the
server's 402 decides), unless 5 or fewer players hold squares
(`drawIsFree(state)`, over `isFreeDraw` in `shared/hostFee.ts`).

- Free boards: the host bar, the Now card and the lock confirm read "Draw the
  numbers · Free" with "Free for up to 5 players" (`host-free-note`), whatever
  the pass; no price, no pay-ahead, no checkout. The Now card's hint (and the
  priced board's) says "Boards with up to 5 players are free."; the lock
  confirm says "No host fee." and how many hold squares. A 402 (a 6th player
  got in first) opens the checkout like any 402.

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
  for a paid or free linked board (`GameSummary.paid`, `GameSummary.freeDraw`). Home puts the host's undrawn
  board in play under Needs you with "Draw numbers".
- `CheckoutSheet` (`src/features/create/CheckoutSheet.tsx`) is self-contained:
  given the board (`GET /api/games/:id`), the saved admin token and
  `PaymentConfig` (`GET /api/config`), it runs whichever checkout applies (test,
  Apple Pay / Google Pay, card, or Apple IAP in the iOS app) against the
  `/pay/*` endpoints. Its primary confirm is `data-testid="pay-confirm"`.
- iOS recovery: `watchIAPPurchases({ onPaid })` (`src/App.tsx`) confirms an App
  Store purchase that landed later (app closed mid-purchase, Ask to Buy) and
  toasts "Payment confirmed" with a Draw action (`?draw=1`); Host Pass
  transactions (a late purchase, a renewal) go to `onPass`, which updates the
  pass state.
- The Host Pass (docs/payments.md "Host Pass"): `useHostPass()`
  (`src/lib/useHostPass.ts`, over `src/lib/hostPassStore.ts`, primed by
  `GET /api/me`). With an active pass, the host bar, the Now card and the lock
  confirm read "Draw the numbers" with "Included with your Host Pass"
  (`host-pass-note`), no price and no pay-ahead, and drawing just draws (the
  server marks the board paid through the pass; a 402 meanwhile opens the
  checkout). Without one, `CheckoutSheet` offers "This board · $4.99" (the
  default) and "Host Pass · $19.99/year" (`plan-board` / `plan-pass`) with
  "Pays for itself by your fifth board" (`pass-pays-off`, `passPaysOffAt`
  from the two prices this device shows, StoreKit's in the iOS app; hidden
  when either is unknown), the pass with its subscription disclosure
  (`pass-disclosure`); buying the pass at the
  draw then draws. On the web the pass needs an account: `startPassPurchase()`
  opens `SignInSheet` first. Profile → Host Pass (`HostPassSection`): Get,
  "Active · renews …" / "Ends …", Manage (Apple's subscription management in
  the iOS app, a Stripe Customer Portal on the web), and Restore purchases in
  the iOS app. Prices in the iOS app are only the App Store's.

## The Club Pass

A yearly plan for bars, booster clubs, offices and fundraisers (setup and the
payment side: docs/payments.md "Club Pass"). A `host_passes` row with `plan`
'club', web only; while it's active, on every board its holder hosts:

- **No host fee** (`activePass` counts it).
- **Branding.** `Game.club: ClubBrand | null` (`{ id, name, hasLogo,
  logoVersion }`, public; `shownClub` shows only a named club):
  `ClubBanner` above the scorebug or invite hero ("Hosted by <club>" and its
  logo, `club-banner`), TV mode's panel corner (`TvBrand` → `TvClubBrand`,
  `tv-club`), the printout's title row (`print-club`: the logo beside the
  title, "· Hosted by <club>" in the subtitle) and the link preview's
  description ("Hosted by <club> · Chiefs vs Bills · …", `inviteMeta`; the
  name only, never an amount). The club's id is its own random one: nothing
  ties it to a clientId beyond the host's public id the board already shows.
- **10 co-hosts** (see "Co-hosts").
- **Players CSV** (`GET /api/games/:id/export.csv`): host tools → Board →
  "Players list (CSV)" (`ExportPlayersRow`, `host-export`): a download on the
  web; in the iOS app the share sheet (the web view's file share when it has
  one, else the CSV's text through `@capacitor/share`).
- **Club TV** (`/club/:clubId/tv#k=<token>`, `src/pages/ClubTvView.tsx`): reads
  `GET /api/clubs/:id/tv` every 15 s with the token as a header, primes each
  board's state, and shows one board at a time with the board TV's own screen
  (`TvScreen`, exported by `src/pages/TvView.tsx`: board, panel, toolbar,
  celebrations, live over its socket), the next every 20 s
  (`CLUB_TV_ROTATE_MS`). A winner that lands on a board that isn't up takes the
  screen at once and is celebrated there (`nextBoard`, `rotationOrder` in
  `src/features/club/clubModel.ts`); one on the board that's up holds it for
  another turn. The club's logo and name stay in the corner at the panel's
  foot with "Board 2 of 4" (`club-tv-corner`, `club-tv-progress`); the panel's
  own corner keeps the JaxSquares mark there. Full width like the board views
  (`isBoardViewPath`), TV mode's own theme (`index.html`, `useTvTheme`). Only
  public board states; a wrong or old link shows "This TV link doesn't work
  anymore".
- **Client state.** The pass is in the Host Pass store (`hostPassStore.ts`:
  `club`, `clubOffer`; `useHostPass().clubActive`, and `active` covers the
  draw for either pass; `PassIncluded` says "Included with your Club Pass").
  The club API and the TV link this device made: `src/lib/club.ts`
  (`jaxsquares.clubTv`, wiped at sign-out). Profile → Club Pass
  (`ClubSection`): a holder's status, Manage (web), name, logo
  (`prepareLogo`, `src/lib/clubLogo.ts`), TV link (Copy, Open, New link with
  a confirm) and boards; everyone else on the web, one line ("Running squares
  for a bar, club or office? Club Pass · $49/year") that opens
  `ClubCheckoutSheet`. **iOS:** nothing offered, priced or linked to buying or
  managing it; a holder's features all work and Profile says "Club Pass ·
  Active".

## Email notices

Optional, per board, never required; for players push can't reach (docs/email.md).

- Double opt-in: an address is `pending` until its owner opens the
  confirmation link and taps Confirm (a GET only shows the button: mail
  scanners open links). Only confirmed addresses get notices: the numbers
  (their squares and numbers), "You won Q1!" (Q1, Half, Q3 on boards where
  every score doesn't win) and the final results (winners by name; an
  every-score board's summary of how many scores each player won). Each once
  per address. Never an amount; notes quoted as pushes quote them.
- Every email: "You're getting this because you asked for JaxSquares email for
  <board>.", a one-click unsubscribe link (signed: this board, or every board
  for the address) with `List-Unsubscribe` / `List-Unsubscribe-Post`, a
  plain-text part, the sender `EMAIL_FROM`.
- Privacy: the address is server-only, shown back to its owner masked; it's
  blanked when it unsubscribes and deleted a week after the board's final (an
  unconfirmed one after 7 days), with the board, or with the account. The
  rows join the sign-in merge.
- Client: the board's bell (`BoardNotifySheet`, players only, when
  `AppConfig.emailEnabled`) and the after-claim ask (`NotifyPrompt` offers
  "Get email instead" where push can't work) show `EmailOptIn`.

## Cross-module function contracts

`worker/service.ts` (core) — used by payments, push and the room:
```ts
loadState(env: Env, gameId: string): Promise<GameState | null>
/** Re-read state from D1 and push it to every socket in the game's room. */
broadcast(env: Env, gameId: string, activity?: Activity): Promise<GameState | null>
/** The board's host fee is paid (stamps games.paid_at; a legacy draft opens too). Idempotent. Provider "pass": covered by a Host Pass (reference = the pass id, amount 0). */
markPaid(env: Env, gameId: string, purchase: { provider: "test" | "stripe" | "iap" | "pass"; reference: string; amountCents: number }): Promise<GameState | null>
// (A free board is never marked through markPaid: POST /lock and applyLiveUpdate stamp provider "free" with db.markFreeDraw in the draw's own batch.)
/** The game was deleted: the room sends { type: "deleted" }, closes sockets with 4404, drops its storage. Never throws. */
closeRoom(env: Env, gameId: string): Promise<void>
isHost(env: Env, gameId: string, adminToken: string): Promise<boolean>
/** The admin token, or x-client-id (resolved to the canonical clientId) is a co-host: who may pay the host fee. */
isHostOrCohost(env: Env, gameId: string, req: { adminToken: string; clientId: string | null | undefined; signedIn: boolean }): Promise<boolean>
/** Apply a provider update to a linked board: upsert live status + period scores, diff every-score entries, lock at kickoff once the host fee is paid (or the board is free: marked paid "free" and locked in a batch of its own that re-counts the holders, before the scores; or the host's Host Pass covers it: marked paid through the pass in the same write). */
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
getSchedule(league, week?): Promise<ScheduleResult | null>         // direct; what the hub runs (football, by week)
getDaySchedule(league, date?): Promise<ScheduleResult | null>      // direct; what the hub runs (basketball, by day)
scheduleFor(league, { week?, date? }): Promise<ScheduleResult | null>  // either, by the league's schedule shape
```
`worker/payments/index.ts` (payments):
```ts
paymentsRoutes: Hono<{ Bindings: Env }>          // /games/:id/pay/*, /stripe/webhook, /payments/pass*, /payments/apple/notifications
getPaymentConfig(env: Env): PaymentConfig
/** The active pass (Host Pass or Club Pass) any of these (canonical) clientIds holds, or null. Missing table (0011 not applied) = none. */
activePass(db: D1Database, clientIds: readonly string[], now?: number): Promise<PassRow | null>
/** Which of these clientIds hold an active pass (the cron's reminders skip them). */
holdersOfActivePass(db: D1Database, clientIds: readonly string[], now?: number): Promise<Set<string>>
/** The identity's pass as the API shows it (GET /api/me). */
hostPassOf(db: D1Database, clientId: string, now?: number): Promise<HostPass | null>
/** The identity's active Club Pass (the club features), or null; and its Club Pass as the API shows it (MeResponse.clubPass). */
activeClubPass(db: D1Database, clientId: string, now?: number): Promise<PassRow | null>
clubPassOf(db: D1Database, clientId: string, now?: number): Promise<HostPass | null>
/** Account deletion: the account's web passes stop renewing (throws when Stripe can't be reached). */
endWebPassRenewals(env: Env, clientId: string): Promise<void>
/** The sign-in merge: a device's passes and Stripe customer move to the canonical clientId. */
mergeClientStatements(db: D1Database, from: string, to: string, now: number): D1PreparedStatement[]
```
`worker/push/index.ts` (push):
```ts
pushRoutes: Hono<{ Bindings: Env }>              // /push/*, /games/:id/mute
type NotifyEvent = (
  | { kind: "numbers-drawn" }
  | { kind: "winner"; periodKey: string; label: string; playerIds: string[] }   // public ids
  | { kind: "game-starting" }
  | { kind: "board-full" }
  | { kind: "draw-reminder" }   // host only: a linked board kicks off within the hour, its host fee unpaid (not for a free board, or a Host Pass holder)
  | { kind: "player-joined"; name: string }
  | { kind: "cohost-accepted"; name: string }   // host only: someone accepted their co-host invite (actor = the new co-host)
  | { kind: "final" }
) & {
  /** Public player id of whoever caused it; they aren't notified about their own action. */
  actor?: string;
};
notify(env: Env, gameId: string, event: NotifyEvent): Promise<void>   // call via ctx.waitUntil
```
Core passes `actor` on host actions (a co-host's too): `numbers-drawn` from
`POST /lock` (or `final`, when that draw also ends a linked game the feed
already called Final), `final` from `POST /final` and from a typed-in board's
Final score, `player-joined`, `cohost-accepted` (the new co-host), and
`board-full` (whoever claimed the last square).
`draw-reminder` comes from the cron (no actor) and goes to the host alone,
never for a free board (5 or fewer players hold squares) or to a host whose
Host Pass covers the board; for those the board-full push on a linked board
leaves out paying ahead (notify counts the holders, then looks the pass up,
for those two host-only events). `board-full` goes out once
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
`draft` as paid and opening drafts; `games.draw_reminder_at`),
`0012_board_groups.sql` (`games.board_group`, see "Several boards for one
game") and `0014_cohosts.sql` (`cohosts`, `cohost_invites`), payments
`0003_*`, `0006_*` and `0011_host_pass.sql` (`host_passes`,
`stripe_customers`), push `0004_*`, auth `0010_accounts.sql`, email
`0013_email.sql` (`email_subscriptions`, `email_suppressions`), and
`0016_club.sql` (payments' `host_passes.plan` and clubs' `clubs`; 0015 is
left to a parallel change), and `0017_season.sql` (core: `games.kind`,
`season`, `season_id`, `season_event`, `season_synced_at`; see "Season
boards").

`worker/email/index.ts` (email notices, docs/email.md):
```ts
emailRoutes: Hono<{ Bindings: Env }>              // /games/:id/email, /email/confirm, /email/unsubscribe
emailEnabled(env: Env): boolean                   // for GET /api/config
/** Email notices for a batch of events (numbers-drawn, winner, final; the rest are ignored). Never throws. */
emailNotices(env: Env, gameId: string, events: NotifyEvent[]): Promise<void>
```
`notifyAll` in `worker/service.ts` runs it beside `notify` for every batch of
events, so email goes out from the same places as pushes (in `waitUntil`
after a request, in the room's alarm for live scores). It reads the board with
`db.getGameState` and names players by public id (`playerIdOf`), never
`getMembers`.

`worker/auth/index.ts` (auth):
```ts
authRoutes: Hono<{ Bindings: Env }>              // /auth/apple, /auth/google, /auth/:provider/link, /auth/sign-out, /me, /account
authConfig(env: Env): AuthConfig                 // for GET /api/config
/** x-client-id -> the clientId the request acts as (the account's canonical one when signed in). */
canonicalClientId(db: D1Database, clientId: string, opts?: { signedIn?: boolean }): Promise<string>
```
Core helpers it uses: `db.mergeClientStatements(db, from, to, now)`,
`db.hostTokensFor(db, clientId)`, `db.cohostGamesFor(db, clientId)`,
`db.latestProfileOf(db, clientId)`; push:
`mergeClientStatements`, `deleteSubscriptionStatement`,
`deleteClientSubscriptionsStatement` (`worker/push/store.ts`); email:
`mergeClientStatements`, `deleteClientSubscriptionsStatement`
(`worker/email/store.ts`); payments:
`mergeClientStatements` (`worker/payments/store.ts`), `hostPassOf`
(`worker/payments/pass.ts`) and `endWebPassRenewals`
(`worker/payments/passStripe.ts`), imported from those files directly. The
payments module imports `canonicalClientId` and `freshLink` from
`worker/auth/canonical.ts` (exported by `worker/auth/index.ts` too), which keeps
the two routers free of an import cycle.
