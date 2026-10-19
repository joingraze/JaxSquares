// @vitest-environment node
// The free tier end to end against real SQL (node:sqlite, migrations
// 0001-0011): a board whose squares are held by FREE_PLAYER_LIMIT (5) or fewer
// players draws for free, marked paid with provider "free" in the same batch
// as the draw; a 6th player brings back the 402 (or the Host Pass); a free
// linked board draws itself at kickoff and gets no "kickoff soon" reminder;
// and a 6th player whose claim lands while the host draws can't slip in for
// free. Only the GameRoom (sockets) and push delivery are faked.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FREE_PLAYER_LIMIT } from "../shared/hostFee";
import { derivePlayerIdSync } from "../shared/playerId";
import { PAYMENT_REQUIRED_CODE, type CreateGameResponse, type GameState, type GameSummary, type LiveUpdate } from "../shared/types";
import * as db from "./db";
import type { Env } from "./env";
import worker from "./index";
import { createTestD1, type TestD1 } from "./payments/testD1";
import { notify } from "./push";
import { applyLiveUpdate } from "./service";

vi.mock("./push", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./push")>()),
  notify: vi.fn(async () => {}),
}));

const HOST = "host-client-aaaa-0001";
const LATE = "late-client-zzzz-0099";
const pid = derivePlayerIdSync;
const MIN = 60_000;
const DAY = 24 * 60 * MIN;

const MIGRATIONS = [
  "migrations/0001_init.sql",
  "migrations/0002_core_model.sql",
  "migrations/0003_purchases.sql",
  "migrations/0004_push.sql",
  "migrations/0005_housekeeping.sql",
  "migrations/0006_purchases_unused.sql",
  "migrations/0007_board_full_announced.sql",
  "migrations/0008_custom_kickoff.sql",
  "migrations/0009_pay_at_draw.sql",
  "migrations/0010_accounts.sql",
  "migrations/0011_host_pass.sql",
  "migrations/0014_cohosts.sql",
];

let t: TestD1;
let env: Env;

beforeEach(async () => {
  t = await createTestD1(MIGRATIONS);
  const stub = { fetch: async () => new Response(null, { status: 204 }) };
  env = {
    DB: t.d1,
    GAME_ROOM: { idFromName: (n: string) => n, get: () => stub } as unknown as DurableObjectNamespace,
    ASSETS: { fetch: async () => new Response("<html></html>") } as unknown as Fetcher,
  } as Env;
  vi.mocked(notify).mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

async function call<T = Record<string, unknown>>(
  method: string,
  path: string,
  opts: { client?: string | null; admin?: string; body?: unknown } = {},
): Promise<{ status: number; body: T; text: string }> {
  const headers: Record<string, string> = {};
  if (opts.client !== null) headers["x-client-id"] = opts.client ?? HOST;
  if (opts.admin) headers["x-admin-token"] = opts.admin;
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  const res = await worker.fetch(
    new Request(`https://jaxsquares.test/api${path}`, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) }),
    env,
    { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext,
  );
  const text = await res.text();
  return { status: res.status, body: (text ? JSON.parse(text) : {}) as T, text };
}

const profile = (name: string) => ({ name, color: "#38b6ff", emoji: "🐐" });
const cell = (i: number) => ({ row: Math.floor(i / 5), col: i % 5 });
const friend = (i: number) => `friend-client-${String(i).padStart(4, "0")}`;
const linkedEvent = (startsAt: number) => ({ provider: "espn", league: "nfl", eventId: "401547000", startsAt, xIsHome: true });

async function create(over: Record<string, unknown> = {}): Promise<{ id: string; admin: string }> {
  const created = await call<CreateGameResponse>("POST", "/games", {
    body: {
      name: "Smith Family Squares",
      sport: "football",
      league: "custom",
      teamX: { name: "Chiefs", abbr: "KC" },
      teamY: { name: "Eagles", abbr: "PHI" },
      format: { periods: "quarters", reverse: false, boardSize: 25, freshNumbers: false },
      prizes: {},
      maxPerPlayer: 0,
      linkedEvent: null,
      host: profile("Jordan"),
      ...over,
    },
  });
  expect(created.status).toBe(201);
  return { id: created.body.game.id, admin: created.body.adminToken };
}

async function join(id: string, client: string, name = "Friend"): Promise<void> {
  expect((await call("POST", `/games/${id}/join`, { client, body: profile(name) })).status).toBe(200);
}

async function claim(id: string, client: string, cells: { row: number; col: number }[]): Promise<number> {
  return (await call<{ claimed: number }>("POST", `/games/${id}/claim`, { client, body: { cells } })).body.claimed;
}

/** The host takes square 0 and friends 1..n-1 one each: `n` players hold squares, the host among them. */
async function holders(id: string, n: number): Promise<void> {
  expect(await claim(id, HOST, [cell(0)])).toBe(1);
  for (let i = 1; i < n; i++) {
    await join(id, friend(i), `Friend ${i}`);
    expect(await claim(id, friend(i), [cell(i)])).toBe(1);
  }
}

const stateOf = async (id: string) => (await call<GameState>("GET", `/games/${id}`, { client: null })).body;
const gameRow = (id: string) =>
  t.query<{ paid_at: number | null; payment_provider: string | null; payment_reference: string | null; payment_amount_cents: number | null }>(
    `SELECT paid_at, payment_provider, payment_reference, payment_amount_cents FROM games WHERE id = ?`,
    id,
  )[0];
const notified = (id: string, kind: string) => vi.mocked(notify).mock.calls.filter(([, g, e]) => g === id && e.kind === kind);

/**
 * Runs `before` once, right before the first batch that holds the free tier's
 * mark (db.markFreeDraw): what a claim committing between the route's read
 * of the board and its draw looks like to D1, which runs batches one at a time.
 */
function justBeforeTheFreeDraw(before: () => Promise<void>): { fired: () => boolean } {
  const real = t.d1;
  let fired = false;
  env.DB = {
    prepare: (sql: string) => real.prepare(sql),
    async batch(statements: D1PreparedStatement[]) {
      const freeMark = statements.some((s) => (s as unknown as { sql: string }).sql.includes("COUNT(DISTINCT client_id) FROM squares WHERE game_id = ?5"));
      if (freeMark && !fired) {
        fired = true;
        await before();
      }
      return real.batch(statements);
    },
  } as unknown as D1Database;
  return { fired: () => fired };
}

/** A 6th player joins and picks a square through the API. */
const sixthPlayer = (id: string) => async () => {
  await join(id, LATE, "Late");
  expect(await claim(id, LATE, [cell(24)])).toBe(1);
};

describe("drawing a board with up to 5 players", () => {
  it("is free: a 5-player board (the host among them) draws with no 402, marked paid 'free' in the draw's own write", async () => {
    const { id, admin } = await create();
    await holders(id, FREE_PLAYER_LIMIT);
    const res = await call<{ state: GameState }>("POST", `/games/${id}/lock`, { admin });
    expect(res.status).toBe(200);
    expect(res.body.state.game).toMatchObject({ status: "locked", paid: true });
    expect(res.body.state.game.numbers).not.toBeNull();
    expect(gameRow(id)).toMatchObject({ payment_provider: "free", payment_reference: "free", payment_amount_cents: 0 });
    expect(gameRow(id).paid_at).toBe(res.body.state.game.lockedAt);
    // No purchase: nothing was charged.
    expect(t.query(`SELECT COUNT(*) AS n FROM purchases`)).toEqual([{ n: 0 }]);
    expect(vi.mocked(notify)).toHaveBeenCalledWith(env, id, { kind: "numbers-drawn", actor: pid(HOST) });
  });

  it("counts only players holding a square: friends who joined without picking don't make it a 6-player board", async () => {
    const { id, admin } = await create();
    await holders(id, 3);
    for (let i = 10; i < 14; i++) await join(id, friend(i), `Idle ${i}`);
    expect((await stateOf(id)).players).toHaveLength(7);
    expect((await call("POST", `/games/${id}/lock`, { admin })).status).toBe(200);
    expect(gameRow(id).payment_provider).toBe("free");
  });

  it("still needs the fee with 6: the host counts like anyone once they hold a square", async () => {
    const { id, admin } = await create();
    await holders(id, FREE_PLAYER_LIMIT + 1);
    const res = await call<{ error: string; code: string }>("POST", `/games/${id}/lock`, { admin });
    expect(res.status).toBe(402);
    expect(res.body).toEqual({ error: "Draw the numbers once the board's paid for.", code: PAYMENT_REQUIRED_CODE });
    expect((await stateOf(id)).game).toMatchObject({ status: "open", paid: false, numbers: null });
    expect(gameRow(id).payment_provider).toBeNull();
    expect(notified(id, "numbers-drawn")).toEqual([]);
    // Back to 5 (someone gives their square back): free again.
    expect((await call("POST", `/games/${id}/release`, { client: friend(5), body: { cells: [cell(5)] } })).status).toBe(200);
    expect((await call("POST", `/games/${id}/lock`, { admin })).status).toBe(200);
    expect(gameRow(id).payment_provider).toBe("free");
  });

  it("lets a pass holder draw a 6-player board through the pass", async () => {
    const { id, admin } = await create();
    await holders(id, FREE_PLAYER_LIMIT + 1);
    await call("POST", "/payments/pass/test");
    const res = await call<{ state: GameState }>("POST", `/games/${id}/lock`, { admin });
    expect(res.status).toBe(200);
    expect(res.body.state.game.status).toBe("locked");
    expect(gameRow(id)).toMatchObject({ payment_provider: "pass", payment_amount_cents: 0 });
  });

  it("refuses claims once the numbers are drawn, in the route and in the SQL itself", async () => {
    const { id, admin } = await create();
    await holders(id, 2);
    await join(id, LATE, "Late");
    expect((await call("POST", `/games/${id}/lock`, { admin })).status).toBe(200);
    const res = await call<{ error: string }>("POST", `/games/${id}/claim`, { client: LATE, body: { cells: [cell(20)] } });
    expect(res.status).toBe(409);
    // A claim the route had already checked (the board was open when it read it) inserts nothing once the draw is in.
    const results = await t.d1.batch(db.claimSquares(t.d1, id, LATE, [cell(21), cell(22)], Date.now()));
    expect(results.map((r) => r.meta.changes)).toEqual([0, 0]);
    expect((await stateOf(id)).squares).toHaveLength(2);
  });

  it("shows on Home's summaries: freeDraw while 5 or fewer hold squares", async () => {
    const small = await create();
    await holders(small.id, 4);
    const big = await create();
    await holders(big.id, FREE_PLAYER_LIMIT + 1);
    const { games } = (await call<{ games: GameSummary[] }>("GET", "/me/games")).body;
    expect(games.find((g) => g.id === small.id)).toMatchObject({ paid: false, freeDraw: true });
    expect(games.find((g) => g.id === big.id)).toMatchObject({ paid: false, freeDraw: false });
  });
});

describe("a 6th player racing the draw", () => {
  it("can't slip in for free: the free mark counts them inside the draw's batch, and the host gets the 402", async () => {
    const { id, admin } = await create();
    await holders(id, FREE_PLAYER_LIMIT);
    const race = justBeforeTheFreeDraw(sixthPlayer(id));
    const res = await call<{ code: string }>("POST", `/games/${id}/lock`, { admin });
    expect(race.fired()).toBe(true);
    expect(res.status).toBe(402);
    expect(res.body.code).toBe(PAYMENT_REQUIRED_CODE);
    const after = await stateOf(id);
    expect(after.game).toMatchObject({ status: "open", paid: false, numbers: null, lockedAt: null });
    expect(new Set(after.squares.map((s) => s.playerId)).size).toBe(FREE_PLAYER_LIMIT + 1);
    expect(after.activity.some((a) => a.type === "locked")).toBe(false);
    expect(gameRow(id)).toMatchObject({ paid_at: null, payment_provider: null });
    expect(notified(id, "numbers-drawn")).toEqual([]);
  });

  it("draws through the host's pass instead when they hold one", async () => {
    const { id, admin } = await create();
    await holders(id, FREE_PLAYER_LIMIT);
    await call("POST", "/payments/pass/test");
    justBeforeTheFreeDraw(sixthPlayer(id));
    const res = await call<{ state: GameState }>("POST", `/games/${id}/lock`, { admin });
    expect(res.status).toBe(200);
    expect(res.body.state.game.status).toBe("locked");
    expect(gameRow(id)).toMatchObject({ payment_provider: "pass", payment_amount_cents: 0 });
    // One draw, one push.
    expect(res.body.state.activity.filter((a) => a.type === "locked")).toHaveLength(1);
    expect(notified(id, "numbers-drawn")).toHaveLength(1);
  });

  it("keeps a free linked board open at kickoff when the 6th claim lands first", async () => {
    const { id } = await create({ league: "nfl", linkedEvent: linkedEvent(Date.now() + 5 * MIN) });
    await holders(id, FREE_PLAYER_LIMIT);
    const race = justBeforeTheFreeDraw(sixthPlayer(id));
    await applyLiveUpdate(env, id, kickoffFeed(), async () => {});
    expect(race.fired()).toBe(true);
    const kicked = await stateOf(id);
    expect(kicked.game).toMatchObject({ status: "open", paid: false, numbers: null });
    expect(kicked.live?.state).toBe("in");
    expect(notified(id, "numbers-drawn")).toEqual([]);
  });
});

function kickoffFeed(state: "pre" | "in" = "in"): LiveUpdate {
  return {
    live: { state, period: state === "in" ? 1 : 0, clock: "15:00", detail: "", scoreX: 0, scoreY: 0, updatedAt: Date.now() },
    linescoresX: [],
    linescoresY: [],
    completedPeriods: 0,
    isFinal: false,
  };
}

describe("a free linked board", () => {
  it("draws itself at kickoff, marked paid 'free'", async () => {
    const { id } = await create({ league: "nfl", linkedEvent: linkedEvent(Date.now() + 5 * MIN) });
    await holders(id, 3);
    await applyLiveUpdate(env, id, kickoffFeed("pre"), async () => {});
    expect((await stateOf(id)).game.status).toBe("open");
    const delivered: string[] = [];
    await applyLiveUpdate(env, id, kickoffFeed("in"), async (_state, activities) => {
      delivered.push(...activities.map((a) => a.type));
    });
    const kicked = await stateOf(id);
    expect(kicked.game).toMatchObject({ status: "locked", paid: true });
    expect(kicked.game.numbers).not.toBeNull();
    expect(kicked.live?.state).toBe("in");
    expect(kicked.activity.find((a) => a.type === "locked")).toMatchObject({ actor: null, data: { auto: true } });
    expect(gameRow(id)).toMatchObject({ payment_provider: "free", payment_reference: "free", payment_amount_cents: 0 });
    expect(delivered).toEqual(["locked"]);
    expect(notified(id, "numbers-drawn")).toHaveLength(1);
    expect(notified(id, "game-starting")).toHaveLength(1);
    // The next poll changes nothing about the draw.
    await applyLiveUpdate(env, id, kickoffFeed("in"), async () => {});
    expect(notified(id, "numbers-drawn")).toHaveLength(1);
  });

  it("decides a game already over when the feed first sees it, with the numbers it really drew", async () => {
    const { id } = await create({ league: "nfl", linkedEvent: linkedEvent(Date.now() + 5 * MIN) });
    await holders(id, 2);
    await applyLiveUpdate(
      env,
      id,
      {
        live: { state: "post", period: 4, clock: "", detail: "Final", scoreX: 17, scoreY: 13, updatedAt: Date.now() },
        linescoresX: [7, 0, 7, 3],
        linescoresY: [3, 10, 0, 0],
        completedPeriods: 4,
        isFinal: true,
      },
      async () => {},
    );
    const over = await stateOf(id);
    expect(over.game).toMatchObject({ status: "final", paid: true });
    expect(over.scores.map((s) => s.periodKey).sort()).toEqual(["final", "q1", "q2", "q3"]);
    expect(gameRow(id).payment_provider).toBe("free");
  });

  it("gets no 'kickoff soon' reminder (and its host isn't asked to pay); a 6th player before kickoff brings it back", async () => {
    const now = Date.now();
    const { id } = await create({ league: "nfl", linkedEvent: linkedEvent(now + 50 * MIN) });
    await holders(id, FREE_PLAYER_LIMIT);
    t.query(`UPDATE games SET created_at = ?`, now - 30 * MIN);
    const tick = () => worker.scheduled({ scheduledTime: Date.UTC(2026, 9, 16, 3, 1), cron: "* * * * *", noRetry: () => {} } as ScheduledController, env);
    const reminders = () => vi.mocked(notify).mock.calls.filter(([, , e]) => e.kind === "draw-reminder").map(([, g]) => g);
    await tick();
    expect(reminders()).toEqual([]);
    expect(t.query(`SELECT draw_reminder_at FROM games WHERE id = ?`, id)).toEqual([{ draw_reminder_at: null }]);
    await sixthPlayer(id)();
    await tick();
    expect(reminders()).toEqual([id]);
  });

  it("isn't free past kickoff once a 6th player holds a square: it waits for the host", async () => {
    const { id } = await create({ league: "nfl", linkedEvent: linkedEvent(Date.now() + DAY) });
    await holders(id, FREE_PLAYER_LIMIT + 1);
    await applyLiveUpdate(env, id, kickoffFeed("in"), async () => {});
    expect((await stateOf(id)).game).toMatchObject({ status: "open", paid: false, numbers: null });
  });
});
