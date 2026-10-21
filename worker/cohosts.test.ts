// @vitest-environment node
// Co-hosts end to end against real SQL (node:sqlite, every migration applied):
// the single-use invite link (expiry, used once, the 3 co-host limit), what a
// co-host can and can't do (they authorize by clientId, never the admin
// token), removing one and stepping down, a co-host's own Host Pass covering
// the draw, the payment routes, and that no clientId or token leaks.
// The sign-in merge keeping co-host rights is in worker/auth/routes.test.ts.
// Only the GameRoom (sockets) and push delivery are faked.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { COHOST_INVITE_TTL_MS, MAX_COHOSTS } from "../shared/cohosts";
import { FREE_PLAYER_LIMIT } from "../shared/hostFee";
import { derivePlayerIdSync } from "../shared/playerId";
import {
  PAYMENT_REQUIRED_CODE,
  type CohostInviteResponse,
  type CreateGameResponse,
  type GameState,
  type GameSummary,
  type MeResponse,
} from "../shared/types";
import * as db from "./db";
import type { Env } from "./env";
import { COHOST_INVITE_KEEP_MS, housekeeping } from "./housekeeping";
import worker from "./index";
import { createTestD1, type TestD1 } from "./payments/testD1";
import { notify } from "./push";
import { RATE_LIMITS } from "./rateLimit";

vi.mock("./push", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./push")>()),
  notify: vi.fn(async () => {}),
}));

const HOST = "host-client-aaaa-0001";
const ANA = "ana-client-bbbb-0002";
const BEN = "ben-client-cccc-0003";
const CAL = "cal-client-dddd-0004";
const DEE = "dee-client-eeee-0005";
const EVE = "eve-client-ffff-0006";
const SECRETS = [HOST, ANA, BEN, CAL, DEE, EVE];
const pid = derivePlayerIdSync;
const DAY = 24 * 60 * 60 * 1000;

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
  "migrations/0016_club.sql",
  "migrations/0017_season.sql",
  "migrations/0019_prize_claims.sql",
  "migrations/0020_tv_display.sql",
];

let t: TestD1;
let env: Env;
/** Every response body this test saw, to check none carries a clientId or an admin token. */
let seen: string[];

beforeEach(async () => {
  t = await createTestD1(MIGRATIONS);
  seen = [];
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
  opts: { client?: string | null; admin?: string; body?: unknown; headers?: Record<string, string> } = {},
): Promise<{ status: number; body: T; text: string }> {
  const headers: Record<string, string> = { ...opts.headers };
  if (opts.client !== null) headers["x-client-id"] = opts.client ?? HOST;
  if (opts.admin) headers["x-admin-token"] = opts.admin;
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  const res = await worker.fetch(
    new Request(`https://jaxsquares.test/api${path}`, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) }),
    env,
    { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext,
  );
  const text = await res.text();
  seen.push(text);
  return { status: res.status, body: (text ? JSON.parse(text) : {}) as T, text };
}

const profile = (name: string) => ({ name, color: "#38b6ff", emoji: "🐐" });

async function create(): Promise<{ id: string; admin: string }> {
  const created = await call<CreateGameResponse>("POST", "/games", {
    body: {
      name: "Office Pool",
      sport: "football",
      league: "custom",
      teamX: { name: "Chiefs", abbr: "KC" },
      teamY: { name: "Eagles", abbr: "PHI" },
      format: { periods: "quarters", reverse: false, boardSize: 25, freshNumbers: false },
      prizes: {},
      maxPerPlayer: 0,
      linkedEvent: null,
      host: profile("Jordan"),
    },
  });
  expect(created.status).toBe(201);
  // The host's own response carries the admin token; every other response is checked for it.
  seen.pop();
  return { id: created.body.game.id, admin: created.body.adminToken };
}

async function join(id: string, client: string, name: string): Promise<void> {
  expect((await call("POST", `/games/${id}/join`, { client, body: profile(name) })).status).toBe(200);
}

/** The host makes a co-host invite link; returns it and its token. */
async function invite(id: string, admin: string): Promise<{ url: string; token: string; expiresAt: number }> {
  const res = await call<CohostInviteResponse>("POST", `/games/${id}/cohost-invites`, { admin });
  expect(res.status).toBe(201);
  // Only the host's own response carries the link.
  seen.pop();
  const url = new URL(res.body.url);
  return { url: res.body.url, token: url.searchParams.get("cohost") ?? "", expiresAt: res.body.expiresAt };
}

const accept = (id: string, client: string, token: string) =>
  call<{ state: GameState; error?: string }>("POST", `/games/${id}/cohosts/accept`, { client, body: { token } });

/** A board with Ana (and the others named) joined, Ana a co-host. */
async function withCohost(names: [string, string][] = [[ANA, "Ana"]]): Promise<{ id: string; admin: string }> {
  const board = await create();
  for (const [client, name] of names) await join(board.id, client, name);
  const { token } = await invite(board.id, board.admin);
  expect((await accept(board.id, names[0][0], token)).status).toBe(200);
  return board;
}

const stateOf = async (id: string) => (await call<GameState>("GET", `/games/${id}`, { client: null })).body;

function expectNoSecrets(admin: string, tokens: string[] = []): void {
  for (const text of seen) {
    for (const secret of [...SECRETS, admin, ...tokens]) expect(text).not.toContain(secret);
    expect(text).not.toMatch(/clientId|client_id|token_hash/);
  }
}

describe("co-host invites", () => {
  it("makes a single-use link; accepting it makes the player a co-host, tells the host, and logs it", async () => {
    const { id, admin } = await create();
    await join(id, ANA, "Ana");
    await join(id, BEN, "Ben");
    const before = Date.now();
    const link = await invite(id, admin);
    expect(link.url).toMatch(new RegExp(`^https://jaxsquares\\.test/g/${id}\\?cohost=[A-Za-z0-9_-]{43}$`));
    expect(link.expiresAt).toBeGreaterThanOrEqual(before + COHOST_INVITE_TTL_MS);
    expect(link.expiresAt).toBeLessThanOrEqual(Date.now() + COHOST_INVITE_TTL_MS);
    // Only a hash is stored.
    const rows = t.query<{ token_hash: string; used_at: number | null }>(`SELECT token_hash, used_at FROM cohost_invites WHERE game_id = ?`, id);
    expect(rows).toHaveLength(1);
    expect(rows[0].token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(rows[0].token_hash).not.toContain(link.token);
    expect(rows[0].used_at).toBeNull();

    const res = await accept(id, ANA, link.token);
    expect(res.status).toBe(200);
    expect(res.body.state.game.cohostIds).toEqual([pid(ANA)]);
    const logged = res.body.state.activity.find((a) => a.type === "cohost");
    expect(logged).toMatchObject({ actor: pid(ANA), data: { name: "Ana" } });
    expect(vi.mocked(notify)).toHaveBeenCalledWith(env, id, { kind: "cohost-accepted", name: "Ana", actor: pid(ANA) });
    expect(t.query<{ used_at: number | null }>(`SELECT used_at FROM cohost_invites WHERE game_id = ?`, id)[0].used_at).not.toBeNull();

    // Single use: Ben can't use it after her.
    const again = await accept(id, BEN, link.token);
    expect(again.status).toBe(410);
    expect(again.body.error).toBe("This co-host link was already used. Ask the host for a new one.");
    // Ana tapping it again is fine (already a co-host), and nothing changes.
    const twice = await accept(id, ANA, link.token);
    expect(twice.status).toBe(200);
    expect(twice.body.state.game.cohostIds).toEqual([pid(ANA)]);
    expect(twice.body.state.activity.filter((a) => a.type === "cohost")).toHaveLength(1);
    expect((await stateOf(id)).game.cohostIds).toEqual([pid(ANA)]);
    expectNoSecrets(admin, [link.token]);
  });

  it("expires after 7 days", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.UTC(2026, 9, 18, 17, 0, 1));
    const { id, admin } = await create();
    await join(id, ANA, "Ana");
    const link = await invite(id, admin);
    vi.setSystemTime(Date.UTC(2026, 9, 18, 17, 0, 1) + COHOST_INVITE_TTL_MS - 1000);
    const late = await invite(id, admin);
    vi.setSystemTime(Date.UTC(2026, 9, 18, 17, 0, 1) + COHOST_INVITE_TTL_MS + 1);
    const res = await accept(id, ANA, link.token);
    expect(res.status).toBe(410);
    expect(res.body.error).toBe("This co-host link expired. Ask the host for a new one.");
    expect((await stateOf(id)).game.cohostIds).toEqual([]);
    // One made later still works.
    expect((await accept(id, ANA, late.token)).status).toBe(200);
  });

  it("says plainly why a link can't be used", async () => {
    const { id, admin } = await create();
    const other = await create();
    await join(id, ANA, "Ana");
    const link = await invite(id, admin);
    // Malformed, unknown, or another board's link.
    expect((await accept(id, ANA, "short")).status).toBe(400);
    expect((await accept(id, ANA, "A".repeat(43))).status).toBe(404);
    const elsewhere = await invite(other.id, other.admin);
    expect((await accept(id, ANA, elsewhere.token)).body.error).toBe("This co-host link doesn't work anymore. Ask the host for a new one.");
    // Not on the board yet: join first (the link stays good).
    const stranger = await accept(id, BEN, link.token);
    expect(stranger.status).toBe(403);
    expect(stranger.body.error).toBe("Join the board first, then accept the co-host invite.");
    // The host's own link.
    expect((await accept(id, HOST, link.token)).status).toBe(409);
    expect((await accept(id, ANA, link.token)).status).toBe(200);
  });

  it(`holds a board to ${MAX_COHOSTS} co-hosts`, async () => {
    const { id, admin } = await create();
    const crew: [string, string][] = [
      [ANA, "Ana"],
      [BEN, "Ben"],
      [CAL, "Cal"],
      [DEE, "Dee"],
    ];
    for (const [client, name] of crew) await join(id, client, name);
    const links = [];
    for (let i = 0; i < 4; i++) links.push(await invite(id, admin));
    for (let i = 0; i < MAX_COHOSTS; i++) expect((await accept(id, crew[i][0], links[i].token)).status).toBe(200);
    expect((await stateOf(id)).game.cohostIds).toEqual([pid(ANA), pid(BEN), pid(CAL)]);

    // No new links once it's full, and an earlier one can't add a fourth (and isn't used up).
    const more = await call<{ error: string }>("POST", `/games/${id}/cohost-invites`, { admin });
    expect(more.status).toBe(409);
    expect(more.body.error).toBe(`A board can have up to ${MAX_COHOSTS} co-hosts. Remove one to invite someone new.`);
    const fourth = await accept(id, DEE, links[3].token);
    expect(fourth.status).toBe(409);
    expect(fourth.body.error).toBe(`This board already has ${MAX_COHOSTS} co-hosts. Ask the host to make room.`);
    expect(t.query(`SELECT 1 FROM cohost_invites WHERE game_id = ? AND used_at IS NULL`, id)).toHaveLength(1);

    // Room again once one steps down.
    expect((await call("DELETE", `/games/${id}/cohosts/${pid(BEN)}`, { client: BEN })).status).toBe(200);
    expect((await accept(id, DEE, links[3].token)).status).toBe(200);
    expect((await stateOf(id)).game.cohostIds).toEqual([pid(ANA), pid(CAL), pid(DEE)]);
  });

  it("re-checks the limit and single use inside the accept's own statements (two accepts racing)", async () => {
    const { id, admin } = await create();
    for (const [client, name] of [
      [ANA, "Ana"],
      [BEN, "Ben"],
      [CAL, "Cal"],
      [DEE, "Dee"],
    ]) {
      await join(id, client, name);
    }
    const spare = await invite(id, admin);
    for (const client of [ANA, BEN, CAL]) expect((await accept(id, client, (await invite(id, admin)).token)).status).toBe(200);
    const [{ token_hash: open }] = t.query<{ token_hash: string }>(`SELECT token_hash FROM cohost_invites WHERE used_at IS NULL`);
    // As if Dee's request read the board before the third co-host got in: the statements still refuse.
    const now = Date.now();
    const full = await db.commit(t.d1, id, db.acceptCohostInvite(t.d1, { gameId: id, tokenHash: open, clientId: DEE, now, max: MAX_COHOSTS }), now);
    expect(full.results.map((r) => r.meta.changes)).toEqual([0, 0]);
    expect(full.state?.game.cohostIds).toHaveLength(MAX_COHOSTS);
    // A link used a moment ago can't be used again either, even with room.
    expect((await call("DELETE", `/games/${id}/cohosts/${pid(CAL)}`, { admin })).status).toBe(200);
    const [{ token_hash: used }] = t.query<{ token_hash: string }>(`SELECT token_hash FROM cohost_invites WHERE used_at IS NOT NULL LIMIT 1`);
    const reused = await db.commit(t.d1, id, db.acceptCohostInvite(t.d1, { gameId: id, tokenHash: used, clientId: DEE, now, max: MAX_COHOSTS }), now);
    expect(reused.results.map((r) => r.meta.changes)).toEqual([0, 0]);
    expect((await accept(id, DEE, spare.token)).status).toBe(200);
  });

  it("is host only, and rate limited", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.UTC(2026, 9, 18, 17, 0, 1));
    const { id, admin } = await withCohost([
      [ANA, "Ana"],
      [BEN, "Ben"],
    ]);
    // A co-host can't invite more co-hosts; a player or a stranger can't either.
    const byCohost = await call<{ error: string }>("POST", `/games/${id}/cohost-invites`, { client: ANA });
    expect(byCohost.status).toBe(403);
    expect(byCohost.body.error).toBe("Only the host can invite co-hosts");
    expect((await call("POST", `/games/${id}/cohost-invites`, { client: BEN })).status).toBe(403);
    expect((await call("POST", `/games/${id}/cohost-invites`, { client: BEN, admin: "nope" })).status).toBe(403);

    for (let i = 1; i < RATE_LIMITS.cohostInvite.limit; i++) await invite(id, admin);
    expect((await call("POST", `/games/${id}/cohost-invites`, { admin })).status).toBe(429);
    // Accepting is limited per device, before the token is looked up.
    for (let i = 0; i < RATE_LIMITS.cohostAccept.limit; i++) expect((await accept(id, CAL, "B".repeat(43))).status).toBe(403);
    expect((await accept(id, CAL, "B".repeat(43))).status).toBe(429);
  });
});

describe("what a co-host can do", () => {
  it("everything the host's tools do, by clientId alone: edit the board and rules, remove a player, draw, score, pick and end", async () => {
    const { id, admin } = await withCohost([
      [ANA, "Ana"],
      [BEN, "Ben"],
      [CAL, "Cal"],
    ]);
    // No admin token anywhere below.
    const rename = await call<{ state: GameState }>("PATCH", `/games/${id}`, { client: ANA, body: { name: "Office Pool 2" } });
    expect(rename.status).toBe(200);
    expect(rename.body.state.game.name).toBe("Office Pool 2");
    const rules = (await stateOf(id)).game.format;
    const edited = await call<{ state: GameState }>("PATCH", `/games/${id}`, {
      client: ANA,
      body: { format: { ...rules, rules: rules.rules!.map((r) => (r.moment === "final" ? { ...r, square: { amount: null, note: "Loser buys wings" } } : r)) } },
    });
    expect(edited.status).toBe(200);
    expect(edited.body.state.activity[0]).toMatchObject({ type: "rules", actor: pid(ANA) });

    // Squares: Ben and Cal pick; Ana removes Cal (a player, not a co-host) while squares are open.
    expect((await call("POST", `/games/${id}/claim`, { client: BEN, body: { cells: [{ row: 0, col: 0 }] } })).status).toBe(200);
    expect((await call("POST", `/games/${id}/claim`, { client: CAL, body: { cells: [{ row: 1, col: 1 }] } })).status).toBe(200);
    const removed = await call<{ state: GameState }>("DELETE", `/games/${id}/players/${pid(CAL)}`, { client: ANA });
    expect(removed.status).toBe(200);
    expect(removed.body.state.players.map((p) => p.id)).not.toContain(pid(CAL));

    // Draw (free: under 6 players hold squares), score, pick, end.
    vi.mocked(notify).mockClear();
    const drawn = await call<{ state: GameState }>("POST", `/games/${id}/lock`, { client: ANA });
    expect(drawn.status).toBe(200);
    expect(drawn.body.state.game.status).toBe("locked");
    // The host hears about it: Ana did it.
    expect(vi.mocked(notify)).toHaveBeenCalledWith(env, id, { kind: "numbers-drawn", actor: pid(ANA) });
    expect((await call("POST", `/games/${id}/scores`, { client: ANA, body: { periodKey: "q1", scoreX: 7, scoreY: 3 } })).status).toBe(200);
    expect((await call("DELETE", `/games/${id}/scores/q1`, { client: ANA })).status).toBe(200);
    expect((await call("POST", `/games/${id}/winners`, { client: ANA, body: { periodKey: "q1", row: 0, col: 0 } })).status).toBe(200);
    expect((await call("DELETE", `/games/${id}/winners/q1`, { client: ANA })).status).toBe(200);
    const ended = await call<{ state: GameState }>("POST", `/games/${id}/final`, { client: ANA });
    expect(ended.status).toBe(200);
    expect(ended.body.state.game.status).toBe("final");

    // A player who isn't a co-host gets none of it.
    for (const [method, path, body] of [
      ["PATCH", "", { name: "Mine now" }],
      ["POST", "/scores", { periodKey: "q2", scoreX: 1, scoreY: 1 }],
      ["POST", "/final", undefined],
    ] as const) {
      expect((await call(method, `/games/${id}${path}`, { client: BEN, body })).status).toBe(403);
    }
    expectNoSecrets(admin);
  });

  it("can't remove the host or another co-host, invite co-hosts, or delete the board", async () => {
    const { id, admin } = await withCohost([
      [ANA, "Ana"],
      [BEN, "Ben"],
    ]);
    const second = await invite(id, admin);
    expect((await accept(id, BEN, second.token)).status).toBe(200);

    const host = await call<{ error: string }>("DELETE", `/games/${id}/players/${pid(HOST)}`, { client: ANA });
    expect(host.status).toBe(403);
    expect(host.body.error).toBe("Co-hosts can't remove the host");
    const otherAsPlayer = await call<{ error: string }>("DELETE", `/games/${id}/players/${pid(BEN)}`, { client: ANA });
    expect(otherAsPlayer.status).toBe(403);
    expect(otherAsPlayer.body.error).toBe("Only the host can remove a co-host");
    expect((await call("DELETE", `/games/${id}/cohosts/${pid(BEN)}`, { client: ANA })).status).toBe(403);
    expect((await call("POST", `/games/${id}/cohost-invites`, { client: ANA })).status).toBe(403);
    const del = await call<{ error: string }>("DELETE", `/games/${id}`, { client: ANA });
    expect(del.status).toBe(403);
    expect(del.body.error).toBe("Only the host can delete the board");
    // A host-only route doesn't take a co-host's own clientId in place of the token either.
    expect((await call("GET", `/games/${id}/host-check`, { client: ANA })).status).toBe(403);

    const state = await stateOf(id);
    expect(state.game.cohostIds).toEqual([pid(ANA), pid(BEN)]);
    expect(state.players.map((p) => p.id)).toEqual([pid(HOST), pid(ANA), pid(BEN)]);
    // The host can take a co-host off the board: they stop being a co-host too.
    const gone = await call<{ state: GameState }>("DELETE", `/games/${id}/players/${pid(BEN)}`, { admin });
    expect(gone.status).toBe(200);
    expect(gone.body.state.game.cohostIds).toEqual([pid(ANA)]);
    expect((await call("PATCH", `/games/${id}`, { client: BEN, body: { name: "Mine now" } })).status).toBe(403);
    // And deletes the board, co-host rows and links with it.
    expect((await call("DELETE", `/games/${id}`, { admin })).status).toBe(200);
    expect(t.query(`SELECT 1 FROM cohosts WHERE game_id = ?`, id)).toEqual([]);
    expect(t.query(`SELECT 1 FROM cohost_invites WHERE game_id = ?`, id)).toEqual([]);
  });
});

describe("removing a co-host and stepping down", () => {
  it("the host removes a co-host, a co-host steps down; both stay on the board as players", async () => {
    const { id, admin } = await withCohost([
      [ANA, "Ana"],
      [BEN, "Ben"],
    ]);
    const second = await invite(id, admin);
    expect((await accept(id, BEN, second.token)).status).toBe(200);

    const removed = await call<{ state: GameState }>("DELETE", `/games/${id}/cohosts/${pid(ANA)}`, { admin });
    expect(removed.status).toBe(200);
    expect(removed.body.state.game.cohostIds).toEqual([pid(BEN)]);
    expect(removed.body.state.players.map((p) => p.id)).toContain(pid(ANA));
    expect((await call("PATCH", `/games/${id}`, { client: ANA, body: { name: "Mine now" } })).status).toBe(403);

    const stepped = await call<{ state: GameState }>("DELETE", `/games/${id}/cohosts/${pid(BEN)}`, { client: BEN });
    expect(stepped.status).toBe(200);
    expect(stepped.body.state.game.cohostIds).toEqual([]);
    expect(stepped.body.state.players.map((p) => p.id)).toContain(pid(BEN));
    expect((await call("PATCH", `/games/${id}`, { client: BEN, body: { name: "Mine now" } })).status).toBe(403);

    // Nobody to remove now; a player can't remove anyone.
    expect((await call("DELETE", `/games/${id}/cohosts/${pid(BEN)}`, { admin })).status).toBe(404);
    expect((await call("DELETE", `/games/${id}/cohosts/${pid(BEN)}`, { client: BEN })).status).toBe(403);
  });
});

/** Six friends join and pick a square each: past the free tier, so the draw needs the fee or a Host Pass. */
async function crowd(id: string): Promise<void> {
  for (let i = 0; i <= FREE_PLAYER_LIMIT; i++) {
    const client = `crowd-player-${i}-of-${id}`;
    await join(id, client, `Friend ${i}`);
    const cell = { row: 2 + Math.floor(i / 5), col: i % 5 };
    expect((await call<{ claimed: number }>("POST", `/games/${id}/claim`, { client, body: { cells: [cell] } })).body.claimed).toBe(1);
  }
}

function insertPass(client: string): string {
  const id = `hp_${Math.random().toString(36).slice(2, 12)}`;
  const now = Date.now();
  t.query(
    `INSERT INTO host_passes (id, client_id, provider, external_id, status, current_period_end, auto_renew, livemode, event_at, created_at, updated_at)
     VALUES (?, ?, 'iap', ?, 'active', ?, 1, 0, ?, ?, ?)`,
    id,
    client,
    `ext-${id}`,
    now + 300 * DAY,
    now,
    now,
    now,
  );
  return id;
}

const paidVia = (id: string) =>
  t.query<{ payment_provider: string | null; payment_reference: string | null }>(`SELECT payment_provider, payment_reference FROM games WHERE id = ?`, id)[0];

describe("the host fee when a co-host draws", () => {
  it("answers 402 with no pass, and a co-host can pay through the normal checkout", async () => {
    const { id, admin } = await withCohost();
    await crowd(id);
    const first = await call<{ code: string }>("POST", `/games/${id}/lock`, { client: ANA });
    expect(first.status).toBe(402);
    expect(first.body.code).toBe(PAYMENT_REQUIRED_CODE);
    // The test checkout (test mode), authorized by her clientId; a player can't pay it.
    expect((await call("POST", `/games/${id}/pay/test`, { client: `crowd-player-0-of-${id}` })).status).toBe(403);
    const paid = await call<{ state: GameState }>("POST", `/games/${id}/pay/test`, { client: ANA });
    expect(paid.status).toBe(200);
    expect(paid.body.state.game.paid).toBe(true);
    const drawn = await call<{ state: GameState }>("POST", `/games/${id}/lock`, { client: ANA });
    expect(drawn.status).toBe(200);
    expect(drawn.body.state.game.status).toBe("locked");
    expectNoSecrets(admin);
  });

  it("is covered by the co-host's own Host Pass (the caller's canonical clientId)", async () => {
    const { id } = await withCohost();
    await crowd(id);
    const pass = insertPass(ANA);
    const drawn = await call<{ state: GameState }>("POST", `/games/${id}/lock`, { client: ANA });
    expect(drawn.status).toBe(200);
    expect(drawn.body.state.game.status).toBe("locked");
    expect(paidVia(id)).toEqual({ payment_provider: "pass", payment_reference: pass });
  });

  it("is covered by the host's Host Pass too, and never by a player's", async () => {
    const { id } = await withCohost([
      [ANA, "Ana"],
      [BEN, "Ben"],
    ]);
    await crowd(id);
    insertPass(BEN);
    expect((await call("POST", `/games/${id}/lock`, { client: BEN })).status).toBe(403);
    expect((await call("POST", `/games/${id}/lock`, { client: ANA })).status).toBe(402);
    const hostPass = insertPass(HOST);
    expect((await call("POST", `/games/${id}/lock`, { client: ANA })).status).toBe(200);
    expect(paidVia(id)).toEqual({ payment_provider: "pass", payment_reference: hostPass });
  });
});

describe("where co-hosting shows", () => {
  it("in the public state by public id, in Home's summaries and in GET /api/me (no token for a co-hosted board)", async () => {
    const { id, admin } = await withCohost();
    const state = await stateOf(id);
    expect(state.game.cohostIds).toEqual([pid(ANA)]);
    expect(state.game.hostPlayerId).toBe(pid(HOST));

    const games = (await call<{ games: GameSummary[] }>("GET", "/me/games", { client: ANA })).body.games;
    expect(games.find((g) => g.id === id)).toMatchObject({ isHost: false, isCohost: true, joined: true });
    const hostView = (await call<{ games: GameSummary[] }>("GET", "/me/games", { client: HOST })).body.games;
    expect(hostView.find((g) => g.id === id)).toMatchObject({ isHost: true, isCohost: false });

    const me = (await call<MeResponse>("GET", "/me", { client: ANA })).body;
    expect(me.cohostGames).toEqual([id]);
    expect(me.hostTokens).toEqual({});
    expect((await call<MeResponse>("GET", "/me", { client: BEN })).body.cohostGames).toEqual([]);
    expectNoSecrets(admin);
  });

  it("housekeeping drops links used or expired over a day ago", async () => {
    const { id, admin } = await create();
    await join(id, ANA, "Ana");
    const used = await invite(id, admin);
    await invite(id, admin);
    expect((await accept(id, ANA, used.token)).status).toBe(200);
    expect(t.query(`SELECT 1 FROM cohost_invites`)).toHaveLength(2);
    await housekeeping(env, Date.now() + COHOST_INVITE_KEEP_MS + 1000);
    // The used one goes; the open one is still good for the rest of its week.
    expect(t.query<{ used_at: number | null }>(`SELECT used_at FROM cohost_invites`)).toEqual([{ used_at: null }]);
    await housekeeping(env, Date.now() + COHOST_INVITE_TTL_MS + COHOST_INVITE_KEEP_MS + 1000);
    expect(t.query(`SELECT 1 FROM cohost_invites`)).toEqual([]);
  });
});
