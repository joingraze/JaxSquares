# JaxSquares 🏈🟩

A mobile-first web app for playing sports games with friends — starting with a
polished **Super Bowl Squares** experience, architected so more games (King of
the Hill, pick'em pools, brackets) can slot in later.

Create a board, share a link, and friends claim squares from their phones.
Numbers are drawn randomly when the commissioner locks the board, and winners
light up automatically as each period is scored.

## Stack

- **Frontend:** React + Vite + TypeScript + Tailwind CSS v4 (mobile-first SPA)
- **Backend:** Cloudflare Worker (Hono) serving a JSON API under `/api/*`
- **Database:** Cloudflare D1 (SQLite)
- **Hosting:** A single Worker serves both the API and the static SPA assets
  (Workers Static Assets with SPA fallback), via `@cloudflare/vite-plugin`.

## Project layout

```
shared/        Domain types + pure squares logic (used by client AND worker)
  squares.ts   Number drawing, winner resolution (unit-tested)
worker/        Cloudflare Worker API
  index.ts     Hono routes + SPA fallback
  db.ts        D1 data access
migrations/    D1 schema migrations
src/           React app
  pages/       Home, CreateGame, GameView, NotFound
  components/  SquaresGrid, AdminPanel, Results, PlayerBar, ShareButton, ui
  lib/         api client, identity (localStorage), useGameState hook
```

## Local development

```bash
npm install
npm run db:migrate:local     # create + migrate the local D1 database
npm run dev                  # http://localhost:5173
```

`npm run dev` runs the React app and the Worker together (with a local,
file-backed D1) through the Cloudflare Vite plugin.

> Note: in this sandbox you may see a one-time `Unable to fetch the Request.cf
> object` warning — that's the runtime failing to fetch geo metadata offline. It
> falls back to a placeholder and is harmless.

## Quality gates

```bash
npm run typecheck   # tsc across app, worker, and config projects
npm run test        # vitest unit tests for the squares logic
npm run build       # production build (client + worker)
```

## Deploying to Cloudflare

1. **Create the D1 database** and copy the printed `database_id`:
   ```bash
   npx wrangler d1 create jaxsquares
   ```
2. **Paste the id** into `wrangler.jsonc` → `d1_databases[0].database_id`
   (replace `PLACEHOLDER_REPLACE_AFTER_D1_CREATE`).
3. **Apply migrations to the remote DB:**
   ```bash
   npm run db:migrate:remote
   ```
4. **Deploy:**
   ```bash
   npm run deploy
   ```

`npm run deploy` builds the SPA and the Worker and publishes them together.

## How the game works

1. **Create** a board: pick the two teams, buy-in per square, and the payout for
   each period (Q1 / Half / Q3 / Final by default).
2. **Share** the game link. Friends open it, set a name + color, and tap empty
   squares to claim them (with an optional per-player limit).
3. **Lock & draw**: the commissioner locks the board, which randomly assigns the
   digits 0–9 to the rows and columns. No more claiming after this.
4. **Score** each period. The winning square is the one whose row/column digits
   match the last digit of each team's score — it lights up gold, and the
   winner + payout appear in the results.

The creator is the **commissioner**: an admin token is stored in their browser
when they create the game, unlocking the lock/score controls. Everyone else just
sees the board and claims squares — no accounts required.

## Adding more games later

`shared/types.ts` already carries a `sport` field and a generic `periods` model,
and the home screen has a roster placeholder for future games. New game types can
add their own routes/components and reuse the same Worker + D1 + identity plumbing.
