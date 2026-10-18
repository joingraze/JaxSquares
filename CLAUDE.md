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
  `worker/push/store.ts`). Routes validate input and orchestrate.

## Identity (security-critical)

- No accounts. A device's `clientId` (localStorage + Capacitor Preferences) is
  its only credential: it is sent **only** as the `x-client-id` header and must
  never appear in a response, URL, socket message, push payload or the UI.
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
  "mine"; use `getClientId()` only for the request header (never read
  localStorage for it directly).
- The host also holds a per-game `adminToken` (`x-admin-token`) for host routes.
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
  score moment only; `amount` stays the default). Kinds (TD, FG, conversion,
  safety) are derived on read from the ordered entries (`entryPlays` in
  `shared/squares.ts`), never stored; read amounts through `PeriodResult` /
  `prizeAmount`, not `rule.square.amount`.
- The only payment is the creator paying to open a board (`docs/payments.md`).

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
