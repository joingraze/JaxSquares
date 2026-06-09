// JaxSquares API — a Cloudflare Worker (Hono) that serves the JSON API under
// /api/*. Static SPA assets are served by the Workers Assets binding for every
// other route (configured in wrangler.jsonc).

import { Hono } from "hono";
import { cors } from "hono/cors";
import type {
  ClaimInput,
  CreateGameInput,
  Game,
  Period,
  ReleaseInput,
  ScoreInput,
  Sport,
} from "../shared/types";
import { GRID_SIZE, shuffledDigits } from "../shared/squares";
import * as db from "./db";

type Bindings = { DB: D1Database; ASSETS: Fetcher };

const app = new Hono<{ Bindings: Bindings }>();

const api = new Hono<{ Bindings: Bindings }>();
api.use("*", cors());

const SPORTS: Sport[] = ["football", "basketball", "baseball", "hockey", "soccer", "other"];
const ID_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"; // no easily-confused chars

function makeId(len = 6): string {
  let s = "";
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  for (const b of bytes) s += ID_ALPHABET[b % ID_ALPHABET.length];
  return s;
}

function makeToken(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

function clampStr(v: unknown, max: number): string {
  return String(v ?? "").slice(0, max).trim();
}

function adminTokenFrom(c: { req: { header: (k: string) => string | undefined } }): string {
  return c.req.header("x-admin-token") ?? "";
}

function validateCells(cells: unknown): { row: number; col: number }[] | null {
  if (!Array.isArray(cells) || cells.length === 0 || cells.length > GRID_SIZE * GRID_SIZE) return null;
  const out: { row: number; col: number }[] = [];
  for (const cell of cells) {
    const row = Number((cell as { row: unknown }).row);
    const col = Number((cell as { col: unknown }).col);
    if (!Number.isInteger(row) || !Number.isInteger(col)) return null;
    if (row < 0 || row >= GRID_SIZE || col < 0 || col >= GRID_SIZE) return null;
    out.push({ row, col });
  }
  return out;
}

// ---- Create a game ----
api.post("/games", async (c) => {
  const body = (await c.req.json().catch(() => null)) as Partial<CreateGameInput> | null;
  if (!body) return c.json({ error: "Invalid JSON" }, 400);

  const name = clampStr(body.name, 80) || "Squares Pool";
  const teamX = clampStr(body.teamX, 40) || "Team X";
  const teamY = clampStr(body.teamY, 40) || "Team Y";
  const sport: Sport = SPORTS.includes(body.sport as Sport) ? (body.sport as Sport) : "football";

  const pricePerSquare = Math.max(0, Number(body.pricePerSquare) || 0);
  const maxPerPlayer = Math.max(0, Math.trunc(Number(body.maxPerPlayer) || 0));

  const periods = sanitizePeriods(body.periods);
  if (periods.length === 0) return c.json({ error: "At least one period is required" }, 400);

  const payouts: Record<string, number> = {};
  for (const p of periods) {
    payouts[p.key] = Math.max(0, Number(body.payouts?.[p.key]) || 0);
  }

  const game: Game = {
    id: makeId(),
    name,
    sport,
    teamX,
    teamY,
    pricePerSquare,
    maxPerPlayer,
    periods,
    payouts,
    xNumbers: null,
    yNumbers: null,
    status: "open",
    createdAt: Date.now(),
  };
  const adminToken = makeToken();
  await db.insertGame(c.env.DB, game, adminToken);

  return c.json({ game, adminToken }, 201);
});

function sanitizePeriods(input: unknown): Period[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: Period[] = [];
  for (const p of input.slice(0, 12)) {
    const key = clampStr((p as Period)?.key, 20).toLowerCase().replace(/[^a-z0-9_]/g, "");
    const label = clampStr((p as Period)?.label, 20);
    if (!key || !label || seen.has(key)) continue;
    seen.add(key);
    out.push({ key, label });
  }
  return out;
}

// ---- Read full game state ----
api.get("/games/:id", async (c) => {
  const state = await db.getGameState(c.env.DB, c.req.param("id"));
  if (!state) return c.json({ error: "Game not found" }, 404);
  return c.json(state);
});

// ---- Claim squares ----
api.post("/games/:id/claim", async (c) => {
  const id = c.req.param("id");
  const game = await db.getGame(c.env.DB, id);
  if (!game) return c.json({ error: "Game not found" }, 404);
  if (game.status !== "open") return c.json({ error: "Squares are locked for this game" }, 409);

  const body = (await c.req.json().catch(() => null)) as Partial<ClaimInput> | null;
  const cells = validateCells(body?.cells);
  const clientId = clampStr(body?.clientId, 64);
  const playerName = clampStr(body?.playerName, 40);
  const playerColor = clampStr(body?.playerColor, 16) || "#38bdf8";
  if (!cells || !clientId || !playerName) return c.json({ error: "Missing name or squares" }, 400);

  // Enforce per-player cap when one is set.
  if (game.maxPerPlayer > 0) {
    const owned = (await db.getSquares(c.env.DB, id)).filter((s) => s.clientId === clientId).length;
    if (owned + cells.length > game.maxPerPlayer) {
      return c.json({ error: `Limit is ${game.maxPerPlayer} squares per player` }, 409);
    }
  }

  const claimed = await db.claimSquares(
    c.env.DB,
    id,
    cells,
    { name: playerName, color: playerColor, clientId },
    Date.now(),
  );

  const state = await db.getGameState(c.env.DB, id);
  return c.json({ claimed, skipped: cells.length - claimed, state });
});

// ---- Release own squares (only while open) ----
api.post("/games/:id/release", async (c) => {
  const id = c.req.param("id");
  const game = await db.getGame(c.env.DB, id);
  if (!game) return c.json({ error: "Game not found" }, 404);
  if (game.status !== "open") return c.json({ error: "Squares are locked for this game" }, 409);

  const body = (await c.req.json().catch(() => null)) as Partial<ReleaseInput> | null;
  const cells = validateCells(body?.cells);
  const clientId = clampStr(body?.clientId, 64);
  if (!cells || !clientId) return c.json({ error: "Invalid request" }, 400);

  await db.releaseSquares(c.env.DB, id, cells, clientId);
  const state = await db.getGameState(c.env.DB, id);
  return c.json({ state });
});

// ---- Lock the game and assign numbers (admin only) ----
api.post("/games/:id/lock", async (c) => {
  const id = c.req.param("id");
  if (!(await db.isAdmin(c.env.DB, id, adminTokenFrom(c)))) return c.json({ error: "Not authorized" }, 403);

  const game = await db.getGame(c.env.DB, id);
  if (!game) return c.json({ error: "Game not found" }, 404);
  if (game.status === "locked") return c.json({ error: "Game already locked" }, 409);

  await db.lockGame(c.env.DB, id, shuffledDigits(), shuffledDigits());
  const state = await db.getGameState(c.env.DB, id);
  return c.json({ state });
});

// ---- Upsert a period score (admin only) ----
api.post("/games/:id/scores", async (c) => {
  const id = c.req.param("id");
  if (!(await db.isAdmin(c.env.DB, id, adminTokenFrom(c)))) return c.json({ error: "Not authorized" }, 403);

  const game = await db.getGame(c.env.DB, id);
  if (!game) return c.json({ error: "Game not found" }, 404);

  const body = (await c.req.json().catch(() => null)) as Partial<ScoreInput> | null;
  const periodKey = clampStr(body?.periodKey, 20);
  if (!game.periods.some((p) => p.key === periodKey)) return c.json({ error: "Unknown period" }, 400);
  const scoreX = Math.max(0, Math.trunc(Number(body?.scoreX)));
  const scoreY = Math.max(0, Math.trunc(Number(body?.scoreY)));
  if (!Number.isFinite(scoreX) || !Number.isFinite(scoreY)) return c.json({ error: "Invalid score" }, 400);

  await db.upsertScore(c.env.DB, id, { periodKey, scoreX, scoreY }, Date.now());
  const state = await db.getGameState(c.env.DB, id);
  return c.json({ state });
});

// ---- Delete a period score (admin only) ----
api.delete("/games/:id/scores/:period", async (c) => {
  const id = c.req.param("id");
  if (!(await db.isAdmin(c.env.DB, id, adminTokenFrom(c)))) return c.json({ error: "Not authorized" }, 403);
  await db.deleteScore(c.env.DB, id, c.req.param("period"));
  const state = await db.getGameState(c.env.DB, id);
  return c.json({ state });
});

api.get("/health", (c) => c.json({ ok: true }));

// Unknown API routes should 404 as JSON rather than fall through to the SPA.
api.all("*", (c) => c.json({ error: "Not found" }, 404));

app.route("/api", api);

// Everything else is the React SPA. Delegating to the assets binding lets
// `not_found_handling: single-page-application` serve index.html for deep
// links (e.g. /g/abc123) so client-side routing works on refresh.
app.all("*", (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
