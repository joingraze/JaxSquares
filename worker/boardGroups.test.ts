// @vitest-environment node
// Several boards for one game, end to end against real SQL (every migration
// through 0014): "Add another board for this game" only for that board's host,
// the new board joins the group and takes its game, every board's public
// state lists the others (no clientId, no admin token), and each board still
// pays its own host fee at its own draw.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_GROUP_BOARDS, SIBLING_ERRORS } from "../shared/siblings";
import { PAYMENT_REQUIRED_CODE, type CreateGameResponse, type GameState, type GameSummary } from "../shared/types";
import type { Env } from "./env";
import worker from "./index";
import { createTestD1, type TestD1 } from "./payments/testD1";
import { notify } from "./push";

vi.mock("./push", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./push")>()),
  notify: vi.fn(async () => {}),
}));

const HOST = "host-client-aaaa-0001";
const ANA = "ana-client-bbbb-0002";

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
  "migrations/0021_tv_pairings.sql",
];

let t: TestD1;
let env: Env;
let roomCalls: { url: string; body: string | null; game: string | null }[];
let pending: Promise<unknown>[];

beforeEach(async () => {
  t = await createTestD1(MIGRATIONS);
  roomCalls = [];
  pending = [];
  const stub = {
    fetch: async (input: string, init?: RequestInit) => {
      const game = (init?.headers as Record<string, string> | undefined)?.["x-game-id"] ?? null;
      roomCalls.push({ url: String(input), body: typeof init?.body === "string" ? init.body : null, game });
      return new Response(null, { status: 204 });
    },
  };
  env = {
    DB: t.d1,
    GAME_ROOM: { idFromName: (n: string) => n, get: () => stub } as unknown as DurableObjectNamespace,
    ASSETS: { fetch: async () => new Response("<html></html>") } as unknown as Fetcher,
  } as Env;
  vi.mocked(notify).mockClear();
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
    new Request(`https://jaxsquares.test/api${path}`, {
      method,
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    }),
    env,
    { waitUntil: (p: Promise<unknown>) => void pending.push(p), passThroughOnException: () => {} } as unknown as ExecutionContext,
  );
  const text = await res.text();
  return { status: res.status, body: (text ? JSON.parse(text) : {}) as T, text };
}

/** Lets the deferred broadcasts (waitUntil) finish. */
async function settle(): Promise<void> {
  while (pending.length) await Promise.all(pending.splice(0));
}

const createInput = (over: Record<string, unknown> = {}) => ({
  name: "Office Squares",
  sport: "football",
  league: "custom",
  teamX: { name: "Chiefs", abbr: "KC" },
  teamY: { name: "Bills", abbr: "BUF" },
  format: { periods: "quarters", reverse: false, boardSize: 100, freshNumbers: false, unit: "$", squarePrice: 1 },
  prizes: {},
  maxPerPlayer: 0,
  linkedEvent: null,
  startsAt: Date.now() + 3 * 24 * 3_600_000,
  host: { name: "Jordan", color: "#ff6b35", emoji: "🦊" },
  ...over,
});

async function create(over: Record<string, unknown> = {}, opts: { client?: string; admin?: string } = {}) {
  return call<CreateGameResponse & { error?: string }>("POST", "/games", { body: createInput(over), ...opts });
}

async function stateOf(id: string): Promise<GameState> {
  const res = await call<GameState>("GET", `/games/${id}`, { client: null });
  expect(res.status).toBe(200);
  return res.body;
}

describe("Add another board for this game", () => {
  it("puts the new board in the source's group, and every board lists the others", async () => {
    const first = await create();
    expect(first.status).toBe(201);
    const a = first.body.game.id;
    const before = await stateOf(a);
    // A board on its own has no siblings field at all.
    expect(before.siblings).toBeUndefined();

    const second = await create({ name: "Office Squares · Board 2", format: { ...createInput().format, squarePrice: 5 }, fromGameId: a }, { admin: first.body.adminToken });
    expect(second.status).toBe(201);
    const b = second.body.game.id;
    await settle();

    const sa = await stateOf(a);
    expect(sa.version).toBeGreaterThan(before.version);
    expect(sa.siblings).toEqual([
      { id: b, name: "Office Squares · Board 2", status: "open", squarePrice: 5, unit: "$", justForFun: false, squaresLeft: 100, totalSquares: 100 },
    ]);
    const sb = await stateOf(b);
    expect(sb.siblings?.map((s) => [s.id, s.squarePrice])).toEqual([[a, 1]]);
    // The source's open boards took the new state.
    expect(roomCalls.some((r) => r.game === a && r.url.endsWith("/broadcast"))).toBe(true);

    // A third board (from the second): one group of three, oldest first.
    roomCalls = [];
    const third = await create({ name: "Office Squares · Board 3", format: { ...createInput().format, justForFun: true, squarePrice: null }, fromGameId: b }, { admin: second.body.adminToken });
    expect(third.status).toBe(201);
    const c = third.body.game.id;
    await settle();
    expect((await stateOf(a)).siblings?.map((s) => s.id)).toEqual([b, c]);
    expect((await stateOf(c)).siblings?.map((s) => s.id)).toEqual([a, b]);
    const fun = (await stateOf(a)).siblings?.find((s) => s.id === c);
    expect(fun).toMatchObject({ justForFun: true, squarePrice: null });
    // Both older boards' rooms hear about the third.
    const told = new Set(roomCalls.filter((r) => r.url.endsWith("/broadcast")).map((r) => r.game));
    expect(told).toEqual(new Set([a, b]));
    expect(t.query<{ n: number }>("SELECT COUNT(DISTINCT board_group) AS n FROM games")[0].n).toBe(1);
  });

  it("takes the game (teams, link, kickoff) from the source, whatever the request says", async () => {
    const startsAt = Date.now() + 2 * 24 * 3_600_000;
    const linkedEvent = { provider: "espn", league: "nfl", eventId: "401", startsAt, xIsHome: false };
    const first = await create({ league: "nfl", linkedEvent });
    expect(first.status).toBe(201);
    const second = await create(
      { teamX: { name: "Jets" }, teamY: { name: "Lions" }, league: "custom", linkedEvent: null, startsAt: null, fromGameId: first.body.game.id },
      { admin: first.body.adminToken },
    );
    expect(second.status).toBe(201);
    const g = second.body.game;
    expect([g.teamX.name, g.teamY.name]).toEqual(["Chiefs", "Bills"]);
    expect(g.linkedEvent).toEqual(linkedEvent);
    expect(g.league).toBe("nfl");
    expect(g.startsAt).toBe(startsAt);
  });

  it("is the host's alone: the admin token, or the identity that hosts it", async () => {
    const first = await create();
    const a = first.body.game.id;
    // A player on the board (no token) can't.
    expect((await call("POST", `/games/${a}/join`, { client: ANA, body: { name: "Ana", color: "#38b6ff", emoji: "🐐" } })).status).toBe(200);
    const byPlayer = await create({ fromGameId: a }, { client: ANA });
    expect(byPlayer.status).toBe(403);
    expect(byPlayer.body.error).toBe("Only the host can do that");
    // Nor someone with a wrong token.
    expect((await create({ fromGameId: a }, { client: ANA, admin: "nope" })).status).toBe(403);
    // A host link's token on another device works.
    expect((await create({ fromGameId: a }, { client: ANA, admin: first.body.adminToken })).status).toBe(201);
    // The host's own identity works without the token.
    expect((await create({ fromGameId: a }, { client: HOST })).status).toBe(201);
    // Nothing joined the group from the refused tries.
    expect(t.query<{ n: number }>("SELECT COUNT(*) AS n FROM games WHERE board_group = ?", a)[0].n).toBe(3);
  });

  it("lets a co-host add a board too (they host the new one), by their identity, with no admin token", async () => {
    const first = await create();
    const a = first.body.game.id;
    expect((await call("POST", `/games/${a}/join`, { client: ANA, body: { name: "Ana", color: "#38b6ff", emoji: "🐐" } })).status).toBe(200);
    // Not yet a co-host: refused.
    expect((await create({ fromGameId: a }, { client: ANA })).status).toBe(403);
    const invite = await call<{ url: string }>("POST", `/games/${a}/cohost-invites`, { admin: first.body.adminToken });
    expect(invite.status).toBe(201);
    const token = new URL(invite.body.url).searchParams.get("cohost");
    expect((await call("POST", `/games/${a}/cohosts/accept`, { client: ANA, body: { token } })).status).toBe(200);

    const byCohost = await create({ fromGameId: a, host: { name: "Ana", color: "#38b6ff", emoji: "🐐" } }, { client: ANA });
    expect(byCohost.status).toBe(201);
    const b = byCohost.body.game;
    // Ana hosts the new board (her own admin token), in the same group, unpaid.
    expect(b.hostPlayerId).not.toBe(first.body.game.hostPlayerId);
    expect(b.paid).toBe(false);
    expect((await stateOf(a)).siblings?.map((s) => s.id)).toEqual([b.id]);
    expect(byCohost.text).not.toContain(first.body.adminToken);
  });

  it("refuses an unknown or malformed board, a game that has started or ended, and a full group", async () => {
    expect((await create({ fromGameId: "zzzzzz" })).status).toBe(404);
    expect((await create({ fromGameId: "../x" })).status).toBe(400);

    const first = await create();
    const { id } = first.body.game;
    const admin = first.body.adminToken;
    for (let i = 2; i <= MAX_GROUP_BOARDS; i++) expect((await create({ fromGameId: id }, { admin })).status).toBe(201);
    const full = await create({ fromGameId: id }, { admin });
    expect(full.status).toBe(409);
    expect(full.body.error).toBe(SIBLING_ERRORS.full);
    // The siblings list stops at the group (no more than the others).
    expect((await stateOf(id)).siblings).toHaveLength(MAX_GROUP_BOARDS - 1);

    // Started: a score is in (the host fee paid, the numbers drawn, Q1 typed in). Another
    // host, since this one used up the hour's boards (the create rate limit counts these too).
    const host2 = { client: "host2-client-dddd-00004" };
    const other = await create({}, host2);
    expect(other.body.error).toBeUndefined();
    const o = other.body.game;
    const admin2 = { ...host2, admin: other.body.adminToken };
    expect((await call("POST", `/games/${o.id}/pay/test`, admin2)).status).toBe(200);
    expect((await call("POST", `/games/${o.id}/lock`, admin2)).status).toBe(200);
    expect((await call("POST", `/games/${o.id}/scores`, { ...admin2, body: { periodKey: "q1", scoreX: 7, scoreY: 0 } })).status).toBe(200);
    const started = await create({ fromGameId: o.id }, admin2);
    expect(started.status).toBe(409);
    expect(started.body.error).toBe(SIBLING_ERRORS.started);
    expect((await call("POST", `/games/${o.id}/final`, admin2)).status).toBe(200);
    expect((await create({ fromGameId: o.id }, admin2)).body.error).toBe(SIBLING_ERRORS.final);
    // A linked game whose kickoff has passed has started too.
    const host3 = { client: "host3-client-eeee-00005" };
    const linked = await create({ league: "nfl", linkedEvent: { provider: "espn", league: "nfl", eventId: "402", startsAt: Date.now() - 60_000, xIsHome: false } }, host3);
    expect(linked.status).toBe(201);
    expect((await create({ fromGameId: linked.body.game.id }, { ...host3, admin: linked.body.adminToken })).body.error).toBe(SIBLING_ERRORS.started);
  });

  it("never puts a clientId or an admin token in a sibling list", async () => {
    const first = await create();
    const second = await create({ fromGameId: first.body.game.id }, { admin: first.body.adminToken });
    const texts = [
      (await call("GET", `/games/${first.body.game.id}`, { client: null })).text,
      (await call("GET", `/games/${second.body.game.id}`, { client: null })).text,
      (await call("GET", "/me/games")).text,
    ];
    for (const text of texts) {
      expect(text).not.toContain(HOST);
      expect(text).not.toContain(first.body.adminToken);
      expect(text).not.toContain(second.body.adminToken);
      expect(text).not.toMatch(/client_?id|admin_?token/i);
    }
  });

  it("doesn't touch payments: the new board is unpaid and draws (or pays) on its own", async () => {
    const first = await create();
    const a = first.body.game.id;
    // The source is paid for and drawn; its sibling isn't.
    expect((await call("POST", `/games/${a}/pay/test`, { admin: first.body.adminToken })).status).toBe(200);
    const second = await create({ fromGameId: a }, { admin: first.body.adminToken });
    const b = second.body.game;
    expect(b.paid).toBe(false);
    expect((await stateOf(b.id)).game.paid).toBe(false);
    // Six players hold squares on it: the draw needs its own host fee.
    for (let i = 0; i < 6; i++) {
      const client = `player-client-${i}-aaaaaaaaaa`;
      expect((await call("POST", `/games/${b.id}/join`, { client, body: { name: `P${i}`, color: "#38b6ff", emoji: "🐐" } })).status).toBe(200);
      expect((await call("POST", `/games/${b.id}/claim`, { client, body: { cells: [{ row: i, col: 0 }] } })).status).toBe(200);
    }
    const lock = await call<{ code?: string }>("POST", `/games/${b.id}/lock`, { admin: second.body.adminToken });
    expect(lock.status).toBe(402);
    expect(lock.body.code).toBe(PAYMENT_REQUIRED_CODE);
    // The source's token doesn't draw the sibling either.
    expect((await call("POST", `/games/${b.id}/lock`, { admin: first.body.adminToken })).status).toBe(403);
  });

  it("drops a deleted board from the others' lists, and Home's summaries carry the group", async () => {
    const first = await create();
    const a = first.body.game.id;
    const second = await create({ fromGameId: a }, { admin: first.body.adminToken });
    const third = await create({ fromGameId: a }, { admin: first.body.adminToken });
    const lone = await create({ name: "Another game" });
    await settle();

    const games = (await call<{ games: GameSummary[] }>("GET", "/me/games")).body.games;
    const group = (id: string) => games.find((g) => g.id === id)?.group;
    expect(group(a)).toBe(a);
    expect(group(second.body.game.id)).toBe(a);
    expect(group(third.body.game.id)).toBe(a);
    expect(group(lone.body.game.id)).toBeNull();

    roomCalls = [];
    expect((await call("DELETE", `/games/${second.body.game.id}`, { admin: second.body.adminToken })).status).toBe(200);
    await settle();
    expect((await stateOf(a)).siblings?.map((s) => s.id)).toEqual([third.body.game.id]);
    expect((await stateOf(third.body.game.id)).siblings?.map((s) => s.id)).toEqual([a]);
    const told = new Set(roomCalls.filter((r) => r.url.endsWith("/broadcast")).map((r) => r.game));
    expect(told).toEqual(new Set([a, third.body.game.id]));
  });

  it("counts squares left on each sibling", async () => {
    const first = await create();
    const a = first.body.game.id;
    const second = await create({ fromGameId: a, format: { ...createInput().format, boardSize: 25 } }, { admin: first.body.adminToken });
    const b = second.body.game.id;
    expect((await call("POST", `/games/${b}/join`, { client: ANA, body: { name: "Ana", color: "#38b6ff", emoji: "🐐" } })).status).toBe(200);
    expect((await call("POST", `/games/${b}/claim`, { client: ANA, body: { cells: [{ row: 0, col: 0 }, { row: 1, col: 1 }] } })).status).toBe(200);
    expect((await stateOf(a)).siblings?.[0]).toMatchObject({ id: b, squaresLeft: 23, totalSquares: 25, status: "open" });
  });
});
