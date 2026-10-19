// @vitest-environment node
// The Host Pass end to end against real SQL (node:sqlite, every migration
// applied): a test pass activates, drawing with an active pass marks the
// board paid through the pass and locks it in one call, an expired pass gets
// the 402, a pass holder's linked board draws itself at kickoff, the "kickoff
// soon" reminder skips pass holders, and nobody draws on someone else's pass.
// Boards here have six players holding squares (`crowd`): with 5 or fewer the
// draw is free and no pass is involved (worker/freeTier.test.ts).
// Only the GameRoom (sockets) and push delivery are faked.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FREE_PLAYER_LIMIT } from "../shared/hostFee";
import { derivePlayerIdSync } from "../shared/playerId";
import { PAYMENT_REQUIRED_CODE, type CreateGameResponse, type GameState, type HostPassState, type LiveUpdate } from "../shared/types";
import type { Env } from "./env";
import worker from "./index";
import { PASS_GRACE_MS } from "./payments/pass";
import { createTestD1, type TestD1 } from "./payments/testD1";
import { notify } from "./push";
import { applyLiveUpdate } from "./service";

vi.mock("./push", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./push")>()),
  notify: vi.fn(async () => {}),
}));

const HOST = "host-client-aaaa-0001";
const ANA = "ana-client-bbbb-0002";
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
  "migrations/0012_board_groups.sql",
  "migrations/0013_email.sql",
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

const createInput = (over: Record<string, unknown> = {}) => ({
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
});

const linkedEvent = (startsAt: number) => ({ provider: "espn", league: "nfl", eventId: "401547000", startsAt, xIsHome: true });

async function create(over: Record<string, unknown> = {}, client = HOST): Promise<{ id: string; admin: string }> {
  const created = await call<CreateGameResponse>("POST", "/games", { client, body: createInput(over) });
  expect(created.status).toBe(201);
  return { id: created.body.game.id, admin: created.body.adminToken };
}

const stateOf = async (id: string) => (await call<GameState>("GET", `/games/${id}`, { client: null })).body;

/**
 * Six friends join and pick a square each: past the free tier
 * (FREE_PLAYER_LIMIT), so drawing needs the host fee or a pass.
 */
async function crowd(id: string, n = FREE_PLAYER_LIMIT + 1): Promise<void> {
  for (let i = 0; i < n; i++) {
    const client = `crowd-player-${i}-of-${id}`;
    expect((await call("POST", `/games/${id}/join`, { client, body: profile(`Friend ${i}`) })).status).toBe(200);
    const cell = { row: Math.floor(i / 5), col: i % 5 };
    expect((await call<{ claimed: number }>("POST", `/games/${id}/claim`, { client, body: { cells: [cell] } })).body.claimed).toBe(1);
  }
}
const gameRow = (id: string) =>
  t.query<{ paid_at: number | null; payment_provider: string | null; payment_reference: string | null; payment_amount_cents: number | null }>(
    `SELECT paid_at, payment_provider, payment_reference, payment_amount_cents FROM games WHERE id = ?`,
    id,
  )[0];
const passIds = (client: string) => t.query<{ id: string }>(`SELECT id FROM host_passes WHERE client_id = ?`, client).map((r) => r.id);

/** A pass row as a provider would have left it. */
function insertPass(client: string, over: { status?: string; end?: number; autoRenew?: boolean; provider?: string } = {}): string {
  const id = `hp_${Math.random().toString(36).slice(2, 12)}`;
  const now = Date.now();
  t.query(
    `INSERT INTO host_passes (id, client_id, provider, external_id, status, current_period_end, auto_renew, livemode, event_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
    id,
    client,
    over.provider ?? "iap",
    `ext-${id}`,
    over.status ?? "active",
    over.end ?? now + 300 * DAY,
    over.autoRenew === false ? 0 : 1,
    now,
    now,
    now,
  );
  return id;
}

describe("the test pass", () => {
  it("activates with no charge and no sign-in, lasts a year, and shows on GET /payments/pass and /me", async () => {
    const before = await call<HostPassState>("GET", "/payments/pass");
    expect(before.status).toBe(200);
    expect(before.body).toEqual({ pass: null, offer: { priceCents: 1999, currency: "usd", iapProductId: "com.jaxsquares.app.hostpass.yearly", web: true } });

    const res = await call<HostPassState>("POST", "/payments/pass/test");
    expect(res.status).toBe(200);
    expect(res.body.pass).toMatchObject({ active: true, status: "active", provider: "test", autoRenew: false, renewsAt: null });
    const year = res.body.pass!.endsAt! - Date.now();
    expect(year).toBeGreaterThan(364 * DAY);
    expect(year).toBeLessThanOrEqual(365 * DAY);
    // Never a clientId or the pass id in what a client reads.
    expect(res.text).not.toContain(HOST);
    expect(res.text).not.toMatch(/hp_|test:/);
    expect((await call<{ hostPass: unknown }>("GET", "/me")).body.hostPass).toMatchObject({ active: true, provider: "test" });

    // Asking again keeps the one pass; ending it (test mode) shows it ended.
    await call("POST", "/payments/pass/test");
    expect(passIds(HOST)).toHaveLength(1);
    const ended = await call<HostPassState>("POST", "/payments/pass/test/end");
    expect(ended.body.pass).toMatchObject({ active: false, status: "ended" });
  });

  it("is off in live mode", async () => {
    env = {
      ...env,
      PAYMENTS_MODE: "live",
      STRIPE_SECRET_KEY: "sk_live_1",
      STRIPE_PUBLISHABLE_KEY: "pk_live_1",
      STRIPE_WEBHOOK_SECRET: "whsec_1",
      APPLE_IAP_KEY_ID: "K",
      APPLE_IAP_ISSUER_ID: "I",
      APPLE_IAP_PRIVATE_KEY: "P",
      APPLE_BUNDLE_ID: "com.jaxsquares.app",
    };
    expect((await call("POST", "/payments/pass/test")).status).toBe(403);
    expect(passIds(HOST)).toEqual([]);
  });

  it("needs a device id", async () => {
    expect((await call("GET", "/payments/pass", { client: null })).status).toBe(401);
    expect((await call("POST", "/payments/pass/test", { client: "short" })).status).toBe(401);
  });
});

describe("drawing with a Host Pass", () => {
  /** A board past the free tier: six friends hold squares. */
  async function crowded(over: Record<string, unknown> = {}, client = HOST): Promise<{ id: string; admin: string }> {
    const board = await create(over, client);
    await crowd(board.id);
    return board;
  }

  it("marks a 6-player board paid through the pass and locks it in one call, with no 402", async () => {
    const { id, admin } = await crowded();
    await call("POST", "/payments/pass/test");
    const [passId] = passIds(HOST);
    const res = await call<{ state: GameState }>("POST", `/games/${id}/lock`, { admin });
    expect(res.status).toBe(200);
    expect(res.body.state.game).toMatchObject({ status: "locked", paid: true });
    expect(res.body.state.game.numbers).not.toBeNull();
    expect(gameRow(id)).toMatchObject({ payment_provider: "pass", payment_reference: passId, payment_amount_cents: 0 });
    expect(gameRow(id).paid_at).not.toBeNull();
    // The pass id stays on the server.
    expect(res.text).not.toContain(passId);
    expect(t.query(`SELECT COUNT(*) AS n FROM purchases`)).toEqual([{ n: 0 }]);
    expect(vi.mocked(notify)).toHaveBeenCalledWith(env, id, { kind: "numbers-drawn", actor: pid(HOST) });
  });

  it("gets the 402 once the pass has expired, and boards drawn while it was active stay drawn", async () => {
    const drawn = await crowded();
    const later = await crowded();
    const passId = insertPass(HOST, { end: Date.now() + 2 * DAY, autoRenew: false });
    expect((await call("POST", `/games/${drawn.id}/lock`, { admin: drawn.admin })).status).toBe(200);
    // It ran out (and wasn't renewing).
    t.query(`UPDATE host_passes SET current_period_end = ? WHERE id = ?`, Date.now() - MIN, passId);
    const res = await call<{ error: string; code: string }>("POST", `/games/${later.id}/lock`, { admin: later.admin });
    expect(res.status).toBe(402);
    expect(res.body.code).toBe(PAYMENT_REQUIRED_CODE);
    expect((await stateOf(later.id)).game).toMatchObject({ status: "open", paid: false });
    expect((await stateOf(drawn.id)).game.status).toBe("locked");
  });

  it("gives an auto-renewing pass a short grace window past its period end, and none to an ended or refunded one", async () => {
    const a = await crowded();
    const passId = insertPass(HOST, { end: Date.now() - PASS_GRACE_MS / 2 });
    expect((await call("POST", `/games/${a.id}/lock`, { admin: a.admin })).status).toBe(200);
    for (const status of ["ended", "revoked", "past_due"]) {
      t.query(`UPDATE host_passes SET status = ?, current_period_end = ? WHERE id = ?`, status, Date.now() + 100 * DAY, passId);
      const b = await crowded();
      expect((await call("POST", `/games/${b.id}/lock`, { admin: b.admin })).status).toBe(402);
    }
  });

  it("doesn't let anyone draw on someone else's pass", async () => {
    const { id, admin } = await crowded();
    await call("POST", `/games/${id}/join`, { client: ANA, body: profile("Ana") });
    // Ana holds a pass; the board is the host's, and the host has none.
    insertPass(ANA);
    expect((await call("POST", `/games/${id}/lock`, { client: ANA })).status).toBe(403);
    expect((await call("POST", `/games/${id}/lock`, { client: ANA, admin: "not-the-token" })).status).toBe(403);
    expect((await call("POST", `/games/${id}/lock`, { admin })).status).toBe(402);
    expect((await stateOf(id)).game).toMatchObject({ status: "open", paid: false });
    expect(gameRow(id).payment_provider).toBeNull();
  });

  it("covers a board drawn from the host's other phone (a host link) when either one holds the pass", async () => {
    const { id, admin } = await crowded();
    insertPass(HOST);
    // Ana's phone holds the board's host link (admin token) but no pass: the board's host's pass covers it.
    const res = await call<{ state: GameState }>("POST", `/games/${id}/lock`, { client: ANA, admin });
    expect(res.status).toBe(200);
    expect(gameRow(id).payment_provider).toBe("pass");
  });

  it("leaves a board of 5 or fewer players to the free tier, even for a pass holder", async () => {
    const { id, admin } = await create();
    await crowd(id, FREE_PLAYER_LIMIT);
    insertPass(HOST);
    const res = await call<{ state: GameState }>("POST", `/games/${id}/lock`, { admin });
    expect(res.status).toBe(200);
    expect(gameRow(id)).toMatchObject({ payment_provider: "free", payment_reference: "free", payment_amount_cents: 0 });
  });
});

describe("linked boards and a Host Pass", () => {
  const feed = (state: "in" | "pre"): LiveUpdate => ({
    live: { state, period: state === "in" ? 1 : 0, clock: "15:00", detail: "", scoreX: 0, scoreY: 0, updatedAt: Date.now() },
    linescoresX: [],
    linescoresY: [],
    completedPeriods: 0,
    isFinal: false,
  });

  it("a pass holder's 6-player linked board draws itself at kickoff, marked paid through the pass", async () => {
    const { id } = await create({ league: "nfl", linkedEvent: linkedEvent(Date.now() + 5 * MIN) });
    await crowd(id);
    await call("POST", "/payments/pass/test");
    const [passId] = passIds(HOST);
    await applyLiveUpdate(env, id, feed("pre"), async () => {});
    expect((await stateOf(id)).game.status).toBe("open");
    await applyLiveUpdate(env, id, feed("in"), async () => {});
    const kicked = await stateOf(id);
    expect(kicked.game).toMatchObject({ status: "locked", paid: true });
    expect(kicked.game.numbers).not.toBeNull();
    expect(kicked.activity.find((a) => a.type === "locked")).toMatchObject({ actor: null, data: { auto: true } });
    expect(gameRow(id)).toMatchObject({ payment_provider: "pass", payment_reference: passId, payment_amount_cents: 0 });
    expect(vi.mocked(notify).mock.calls.filter(([, g, e]) => g === id && e.kind === "numbers-drawn")).toHaveLength(1);
  });

  it("without a pass (or with an expired one) a 6-player board still waits for its host at kickoff", async () => {
    const { id } = await create({ league: "nfl", linkedEvent: linkedEvent(Date.now() + 5 * MIN) });
    await crowd(id);
    insertPass(HOST, { end: Date.now() - MIN, autoRenew: false });
    await applyLiveUpdate(env, id, feed("in"), async () => {});
    expect((await stateOf(id)).game).toMatchObject({ status: "open", paid: false, numbers: null });
  });

  it("the 'kickoff soon' reminder skips pass holders", async () => {
    const now = Date.now();
    const soon = now + 50 * MIN;
    const holder = await create({ league: "nfl", linkedEvent: linkedEvent(soon) });
    const other = await create({ league: "nfl", linkedEvent: linkedEvent(soon) }, ANA);
    await crowd(holder.id);
    await crowd(other.id);
    insertPass(HOST);
    insertPass(ANA, { end: now - DAY, autoRenew: false }); // long expired: still reminded
    t.query(`UPDATE games SET created_at = ?`, now - 30 * MIN);
    await worker.scheduled({ scheduledTime: Date.UTC(2026, 9, 16, 3, 1), cron: "* * * * *", noRetry: () => {} } as ScheduledController, env);
    const reminded = vi.mocked(notify).mock.calls.filter(([, , e]) => e.kind === "draw-reminder").map(([, g]) => g);
    expect(reminded).toEqual([other.id]);
    expect(reminded).not.toContain(holder.id);
  });
});
