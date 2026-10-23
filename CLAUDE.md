# JaxSquares — notes for Claude

Mobile-first football squares app (web + Capacitor iOS shell). See README.md for
the overview and docs/ARCHITECTURE.md for the API/module contract.

## Architecture at a glance

- One Cloudflare Worker serves both the JSON API (`/api/*`, Hono) and the React
  SPA (Workers Static Assets). The Worker delegates non-API routes to the
  `ASSETS` binding so deep links fall back to `index.html`. A `GameRoom`
  Durable Object per game holds the live WebSockets and polls live scores.
- `shared/` is imported by BOTH the worker and the client. Keep it free of
  framework/IO code. `shared/squares.ts` (number drawing, winners, results) and
  `shared/formats.ts` (presets, prize notes) are pure and unit-tested — add tests
  there when changing game logic.
- D1 access lives only in `worker/db.ts`, except module-owned tables, which only
  their module's store file touches (`worker/payments/store.ts`,
  `worker/push/store.ts`, `worker/auth/store.ts`, `worker/email/store.ts`). Routes validate input and orchestrate.

## Identity (security-critical)

- Players never need an account; hosts sign in to make a board wherever
  sign-in is set up (`hostsSignIn`, POST /api/games answers 409
  `account_required`; docs/auth.md "Hosts sign in"). A device's `clientId`
  (localStorage + Capacitor Preferences) is its only credential: it is sent **only** as the `x-client-id` header and must
  never appear in a response, URL, socket message, push payload or the UI.
- Optional Sign in with Apple / Google (`worker/auth/`, docs/auth.md) maps
  devices to an account's **canonical clientId** (the first signed-in device's)
  via `client_links`. `requireClient` and the push routes resolve
  `x-client-id` to it (`canonicalClientId`, cached; `x-signed-in: 1` from a
  signed-in app forces a fresh read), so `c.get("clientId")` is the canonical
  one and an account's devices are one player. A new Apple/Google sign-in with
  a verified email an account has joins it, and Profile adds the other
  provider (combining two accounts after a confirm). Signing in on another device
  merges its rows into the canonical clientId in one batch: a new table keyed
  by a clientId must join that merge (docs/auth.md). Account tables are touched
  only by `worker/auth/store.ts`; email/name never go in a public object, nor
  does an email-notice address (docs/email.md: only its owner sees it, masked).
- Everything public uses the **public player id** =
  base64url(SHA-256("jaxsquares:player:" + clientId)) first 22 chars
  (`shared/playerId.ts`): `Player.id`, `Square.playerId`, `Game.hostPlayerId`,
  `Activity.actor`, winner `playerIds`, `winnerPlayerId`, `NotifyEvent.actor`,
  the live socket's `?player=`.
- Server: D1 keeps clientIds; `worker/db.ts` derives public ids on read
  (`worker/playerIds.ts`). Only `getMembers()` returns clientIds (for push).
  Routes get both via `c.get("clientId")` (D1 lookups) and `c.get("playerId")`
  (everything else).
- Client: compare with `getPlayerId()` from `src/lib/identity.ts` to find
  "mine" (when signed in it's the server-confirmed account id from
  `GET /api/me`, stored next to the clientId); use `getClientId()` only for the
  request header (never read localStorage for it directly). Sign-out
  (`src/lib/auth.ts`) wipes the device: a new clientId.
- The host also holds a per-game `adminToken` (`x-admin-token`) for host routes.
  `GET /api/me` returns the tokens of the boards the caller's (canonical)
  identity hosts, never anyone else's. Co-hosts (up to `MAX_COHOSTS`,
  `shared/cohosts.ts`, table `cohosts`) authorize by their canonical clientId,
  not by a token: `hostAccess` in `worker/index.ts` accepts the admin token or
  a co-host's `c.get("clientId")` and says which (host-only routes 403 a
  co-host); they never get the admin token (`/api/me` lists `cohostGames`
  without one). The app asks `useHostRole(state)` (`src/lib/hostRole.ts`).
- Grep check before shipping: `clientId` may only appear in request headers,
  server internals and identity storage.

## Product rules

- No money between players: JaxSquares never collects, holds, sends or tracks
  payment between them. A host may show a square price and prize amounts as
  display-only, structured fields (`GameFormat.squarePrice`, `Prize.amount`,
  `Prize.byKind`, in "$" or points), or mark the board "Just for fun";
  nothing is shown when the host sets neither. Copy near those inputs says
  the app never collects or sends money (`AMOUNTS_DISCLAIMER`).
- No betting vocabulary anywhere (UI copy, push, errors): never "bet", "wager",
  "pot", "payout", "buy-in", "jackpot", "odds", "stakes", "gamble". Say "square
  price", "prize", "amount".
- No league, team or event logos anywhere (app, link previews, printables,
  landing pages): they're trademarks. A team shows as its name, abbreviation
  and color (`TeamMark`); names appear only to describe the matchup, and the
  leagues are named as not affiliated (Terms, landing-page footers). The
  football championship is "the big game", never its trademarked name (the
  landing page is `/big-game-squares`; the old address redirects).
- Amounts stay in the app: never in push notifications (`worker/push/copy.ts`
  quotes notes only), link previews (`worker/og.ts`), invite/share text or
  activity data. Show them on the board, rules sheet, results, winners, players.
- Free-text notes stay validated: `validatePrizeNote` (`shared/formats.ts`)
  rejects cash/payment-app/betting talk (`PRIZE_MONEY_ERROR`) and a currency
  amount (`PRIZE_AMOUNT_ERROR`: it belongs in the amount box); board, team and
  label text use `mentionsMoney` (`MONEY_ERRORS`). Server 400s; the UI checks inline.
- Who wins when lives in `GameFormat.rules` (`rulesOf()` derives them for older
  boards): never branch on `format.periods`. The host edits rules and prizes
  any time (PATCH `format`); who wins locks at the first score, fresh numbers
  at the draw, board size never (409).
- Every score change may show an amount per kind of score (`Prize.byKind`,
  score moment only; `amount` is the flat amount with score types off and a
  quiet fallback). Score kinds and every score are football-only: a
  basketball board (`shared/sports.ts`) never shows them, and a score rule on
  one is a 400. Five kinds: `touchdown`, `fieldGoal`, `extraPoint`,
  `twoPoint`, `safety`; every entry gets one, derived on read from the
  ordered entries (`entryPlays` in `shared/squares.ts`), never stored. A
  stored legacy `byKind.conversion` reads as both `extraPoint` and `twoPoint`
  (`kindAmount` / `upgradeFormat`); new input with it is a 400.
- The final's square can take "the rest of the board total" (`Prize.rest`,
  final square only, needs a square price): board total (price × all squares
  before the draw, × claimed squares after) minus every other prize a claimed
  square won, never below 0. Read it through `PeriodResult.amount`
  (`amountIsRest`) or `restSoFar(state)`, never from the rule. Suggested
  amounts (`suggestPrizes`) fill the create flow until the host types one.
  Read amounts through `PeriodResult` / `prizeAmount`, not `rule.square.amount`.
- The only payments are the host's, for a board, due when the host draws the
  numbers. Two products (`shared/pricing.ts` `feeDue`, docs/payments.md
  "Pricing"): per game, the host fee (`BOARD_PRICE_CENTS`) plus the Venue
  add-on (`VENUE_PRICE_CENTS`, web only) on a venue board; or the yearly
  Annual Pass, which covers every board's host fee, and with the Venue add-on
  (`plan` 'club', web only, never offered or linked in the iOS app) venue
  boards and the venue features too. Read what a board costs through `feeDue`
  / `coversBoard`, never from one price. Creating, inviting and picking squares
  are free, so is drawing a board 5 or fewer players hold squares on
  (`isFreeDraw`, `shared/hostFee.ts`; marked paid `"free"` in the draw's
  batch), and `POST /lock` answers 402 (`PAYMENT_REQUIRED_CODE`) until
  `Game.paid`. Boards made before that count as paid; a linked board draws
  itself at kickoff only once paid or covered (`docs/payments.md`). An active
  pass (`passCover`, keyed by the canonical clientId) marks the board paid
  through it at the draw or at kickoff when it covers all of it. Its tables
  join the sign-in merge, and buying it on the web needs a sign-in; a web
  Annual Pass gets the Venue add-on added (`POST /payments/pass/stripe/venue`),
  never a second subscription.
- Venue boards (`shared/venue.ts`, docs/ARCHITECTURE.md "Venue boards"):
  venue mode (`format.venue`) is free to play, so never a square price
  (400); it adds the Venue add-on at the draw, and can't change once the
  board is paid for or drawn (409, `VENUE_LOCKED_ERROR`); a venue board takes
  the venue co-host limit and the players list (`hasVenueFeatures`); house
  rules never ask anyone to buy anything or talk money (400);
  a claim code (`worker/claims.ts`) is only ever in `GET /api/games/:id/claims`
  for its winner and the host or co-hosts: never in public state, the TV, a
  push or share text. Collected prizes (`prize_claims`) join the sign-in merge.
- Season boards (`Game.kind` "season", `shared/season.ts`, docs/ARCHITECTURE.md
  "Season boards"): squares are picked once, on the season board, which comes
  with the Annual Pass (no per-game fee: its draw answers 402
  `PASS_REQUIRED_CODE` without one, unless 5 or fewer players hold squares)
  and sends one numbers-drawn notice. Each game's board (`Game.seasonId`) is made at the draw or by the
  cron, locked and paid through the season (provider `season`), and never
  takes claims, joins or edits (409); its host and co-hosts are the season's.

## Conventions

- Types are shared in `shared/types.ts` — update there, not per-side.
- TypeScript is strict with `noUnusedLocals`/`noUnusedParameters`; keep imports clean.
- UI kit lives in `src/components/ui` (import from `components/ui`); browse it at
  `/kit` in dev. Board state comes from `useGame(id)` in `src/lib/live.ts`
  (socket + polling + optimistic patches; it replaced the old `useGameState`).
- Tailwind v4 with the theme in `src/index.css`. Color scales: `pitch`, `brand`,
  `gold`, `accent`, `live`, `danger`; semantic aliases `canvas`, `surface`,
  `ink` (`ink-muted`, `ink-subtle`, `ink-inverse`), `line` (`line-strong`).
  Prefer the semantic aliases, then the scales. Fonts: Bricolage Grotesque for
  display (`font-display`), Figtree for UI (`font-sans`).
- The theme follows the phone by default ("system"); dark and light are a Profile
  setting, and a board's top bar flips light/dark (`src/lib/theme.ts`, `<html data-theme>`). `:root[data-theme="light"]` redefines
  the semantic tokens, so use them rather than fixed colors: `text-ink-brand|gold|live|danger|accent`
  for colored text, `brand-line`/`gold-line` for rings and focus, `ink/N` (not
  `white/N`) for tints, `bg-scrim` for backdrops. Keep the scales for fills that
  look the same in both themes, and pass `useResolvedTheme()` to
  `teamVars`/`readableTeamColor`.

## Before committing

```bash
npm run typecheck && npm run test && npm run build
```

## Gotchas

- Wrangler v4 is required (`npx wrangler --version`); the Vite plugin and the
  D1/DO config assume it.
- After editing the D1 schema, add a new file in `migrations/` (don't edit
  applied ones) and run `npm run db:migrate:local`.
- Vitest runs without the Cloudflare plugin (skipped when `VITEST=true` in
  `vite.config.ts`). Worker tests that need SQL use `worker/payments/testD1.ts`
  (node:sqlite, Node 22+) with the real migrations.
- Rate limits (`worker/rateLimit.ts`) and hourly housekeeping
  (`worker/housekeeping.ts`) need migration 0005 applied; rate limiting fails
  open without it.
