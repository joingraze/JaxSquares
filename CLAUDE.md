# JaxSquares — notes for Claude

Mobile-first sports-games web app. First game: Super Bowl Squares. See README.md
for full docs.

## Architecture at a glance

- One Cloudflare Worker serves both the JSON API (`/api/*`, Hono) and the React
  SPA (Workers Static Assets). The Worker delegates non-API routes to the
  `ASSETS` binding so deep links fall back to `index.html`.
- `shared/` is imported by BOTH the worker and the client. Keep it free of
  framework/IO code. `shared/squares.ts` holds the pure game logic and is
  unit-tested — add tests there when changing number drawing or winner logic.
- D1 access lives only in `worker/db.ts`. Routes validate input and orchestrate.
- No auth/accounts. Players are identified by a localStorage `clientId`; the game
  creator holds an `adminToken` (also localStorage) checked via the
  `x-admin-token` header for lock/score endpoints.

## Conventions

- Types are shared in `shared/types.ts` — update there, not per-side.
- TypeScript is strict with `noUnusedLocals`/`noUnusedParameters`; keep imports clean.
- Tailwind v4 with a custom theme in `src/index.css` (`pitch`, `brand`, `accent`,
  `gold` color scales). Prefer those tokens.

## Before committing

```bash
npm run typecheck && npm run test && npm run build
```

## Gotchas

- After editing the D1 schema, add a new file in `migrations/` (don't edit
  applied ones) and run `npm run db:migrate:local`.
- Vitest runs without the Cloudflare plugin (skipped when `VITEST=true` in
  `vite.config.ts`) to avoid spinning up a Workers runtime for unit tests.
