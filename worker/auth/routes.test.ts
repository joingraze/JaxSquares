// @vitest-environment node
// Optional sign-in end to end against real SQL (node:sqlite, every migration
// applied): the first device becomes canonical, a second device's rows merge
// into it, every route then works on the account from either device,
// sign-out and account deletion, and no clientId in anything a client reads.
// Apple's and Google's keys are local test keys behind a mocked fetch.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { derivePlayerIdSync } from "../../shared/playerId";
import { ACCOUNT_EXISTS_CODE, ACCOUNT_REQUIRED_CODE, type AppConfig, type ClubSettings, type CreateGameResponse, type GameState, type GameSummary, type HostPassState, type MeResponse } from "../../shared/types";
import type { Env } from "../env";
import worker from "../index";
import { inline, linkSql } from "../../scripts/ops/link-devices";
import { createTestD1, type TestD1 } from "../payments/testD1";
import { RATE_LIMITS } from "../rateLimit";
import { APPLE_REVOKE_URL, APPLE_TOKEN_URL } from "./apple";
import { resetCanonicalCache } from "./canonical";
import { APPLE_JWKS_URL, GOOGLE_JWKS_URL, resetJwksCache } from "./jwt";
import { claimsAt, makeIssuer, sha256HexOf, type TestIssuer } from "./testTokens";

vi.mock("../push", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../push")>()),
  notify: vi.fn(async () => {}),
}));

const PHONE = "phone-client-aaaa-00001";
const LAPTOP = "laptop-client-bbbb-0002";
const FRIEND = "friend-client-cccc-0003";
const STRANGER = "stranger-client-dddd-04";
const SECRETS = [PHONE, LAPTOP, FRIEND, STRANGER];
const pid = derivePlayerIdSync;

const GOOGLE_WEB = "web-1234.apps.googleusercontent.com";
const GOOGLE_IOS = "ios-1234.apps.googleusercontent.com";
const BUNDLE = "com.jaxsquares.app";
const SERVICES_ID = "com.jaxsquares.web";
const FCM_TOKEN = "dGVzdA:APA91bHPRgkF3JUikC4ENAHEeMrd41Zxv3hVZjC9KtT8OvPVGJ-hQMRKRrZuJAEcl7B338qju59zJMjw2DELjzEvxwYv7hH5Yn";

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
let google: TestIssuer;
let apple: TestIssuer;
let fetchMock: ReturnType<typeof vi.fn>;
let roomCalls: { url: string; game: string | null }[];
let pending: Promise<unknown>[];
/** Every response body this test saw, to check none carries a clientId. */
let seen: string[];

async function applePem(): Promise<string> {
  const pair = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign"])) as CryptoKeyPair;
  const der = new Uint8Array((await crypto.subtle.exportKey("pkcs8", pair.privateKey)) as ArrayBuffer);
  return `-----BEGIN PRIVATE KEY-----\n${btoa(String.fromCharCode(...der))}\n-----END PRIVATE KEY-----`;
}
let pem: string;

const json = (body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json", ...headers } });

beforeEach(async () => {
  google ??= await makeIssuer("google-key");
  apple ??= await makeIssuer("apple-key");
  pem ??= await applePem();
  resetJwksCache();
  resetCanonicalCache();
  t = await createTestD1(MIGRATIONS);
  roomCalls = [];
  pending = [];
  seen = [];
  const stub = {
    fetch: async (input: string, init?: RequestInit) => {
      roomCalls.push({ url: String(input), game: (init?.headers as Record<string, string> | undefined)?.["x-game-id"] ?? null });
      return new Response(null, { status: 204 });
    },
  };
  env = {
    DB: t.d1,
    GAME_ROOM: { idFromName: (n: string) => n, get: () => stub } as unknown as DurableObjectNamespace,
    ASSETS: { fetch: async () => new Response("<html></html>") } as unknown as Fetcher,
    APP_ORIGIN: "https://jaxsquares.com",
    GOOGLE_WEB_CLIENT_ID: GOOGLE_WEB,
    GOOGLE_IOS_CLIENT_ID: GOOGLE_IOS,
    APPLE_SERVICES_ID: SERVICES_ID,
  } as Env;
  fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url === GOOGLE_JWKS_URL) return json(google.jwks, { "cache-control": "public, max-age=3600" });
    if (url === APPLE_JWKS_URL) return json(apple.jwks);
    if (url === APPLE_TOKEN_URL) return json({ access_token: "a", refresh_token: "apple-refresh-1", id_token: "x", token_type: "Bearer" });
    if (url === APPLE_REVOKE_URL) return new Response(null, { status: 200 });
    throw new Error(`unexpected fetch ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Waits for everything the routes deferred (broadcasts, Apple's token exchange). */
async function settle(): Promise<void> {
  while (pending.length > 0) await Promise.all(pending.splice(0));
}

async function call<T = Record<string, unknown>>(
  method: string,
  path: string,
  opts: { client?: string | null; admin?: string; body?: unknown; headers?: Record<string, string> } = {},
): Promise<{ status: number; body: T; text: string }> {
  const headers: Record<string, string> = { ...opts.headers };
  if (opts.client !== null) headers["x-client-id"] = opts.client ?? PHONE;
  if (opts.admin) headers["x-admin-token"] = opts.admin;
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  const res = await worker.fetch(
    new Request(`https://jaxsquares.test/api${path}`, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) }),
    env,
    { waitUntil: (p: Promise<unknown>) => void pending.push(p), passThroughOnException: () => {} } as unknown as ExecutionContext,
  );
  const text = await res.text();
  seen.push(text);
  return { status: res.status, body: (text ? JSON.parse(text) : {}) as T, text };
}

interface SignInOpts {
  email?: string | null;
  name?: string;
  claims?: Record<string, unknown>;
  body?: Record<string, unknown>;
  /** false: mint the token without a nonce and send none. */
  nonce?: boolean;
  /** POST /auth/:provider/link (add it to this device's account) instead of signing in. */
  link?: boolean;
}

async function signIn(provider: "google" | "apple", client: string, sub: string, o: SignInOpts = {}) {
  const raw = `nonce-${crypto.randomUUID()}`;
  const withNonce = o.nonce !== false;
  const claims = claimsAt(Date.now(), {
    iss: provider === "google" ? "https://accounts.google.com" : "https://appleid.apple.com",
    aud: provider === "google" ? GOOGLE_WEB : BUNDLE,
    sub,
    ...(o.email === null ? {} : { email: o.email ?? `${sub}@example.com`, email_verified: true }),
    ...(provider === "google" && o.name ? { name: o.name } : {}),
    ...(withNonce ? { nonce: await sha256HexOf(raw) } : {}),
    ...o.claims,
  });
  const idToken = await (provider === "google" ? google : apple).sign(claims);
  return call<MeResponse>("POST", `/auth/${provider}${o.link ? "/link" : ""}`, { client, body: { idToken, ...(withNonce ? { nonce: raw } : {}), ...o.body } });
}

const createInput = (name: string) => ({
  name,
  sport: "football",
  league: "custom",
  teamX: { name: "Chiefs", abbr: "KC" },
  teamY: { name: "Eagles", abbr: "PHI" },
  format: { periods: "quarters", reverse: false, boardSize: 25, freshNumbers: false },
  prizes: {},
  maxPerPlayer: 0,
  linkedEvent: null,
  host: { name: "Jordan", color: "#ff6b35", emoji: "🦊" },
});

/**
 * A paid (open) board hosted by `host`, made the way boards were before hosts
 * had to sign in (sign-in not set up yet: hostsSignIn off), so a device can
 * host boards before it ever signs in.
 */
async function boardBy(host: string, name = "Sunday Squares"): Promise<{ id: string; admin: string }> {
  const withSignIn = env;
  env = { ...env, GOOGLE_WEB_CLIENT_ID: "", APPLE_SERVICES_ID: "" };
  let created: Awaited<ReturnType<typeof call<CreateGameResponse>>>;
  try {
    created = await call<CreateGameResponse>("POST", "/games", { client: host, body: createInput(name) });
  } finally {
    env = withSignIn;
  }
  expect(created.status).toBe(201);
  const { game, adminToken } = created.body;
  expect((await call("POST", `/games/${game.id}/pay/test`, { client: host, admin: adminToken })).status).toBe(200);
  return { id: game.id, admin: adminToken };
}

async function joinAndClaim(client: string, id: string, name: string, cells: { row: number; col: number }[]) {
  expect((await call("POST", `/games/${id}/join`, { client, body: { name, color: "#38b6ff", emoji: "🐐" } })).status).toBe(200);
  if (cells.length > 0) expect((await call("POST", `/games/${id}/claim`, { client, body: { cells } })).status).toBe(200);
}

const rows = <T = Record<string, unknown>>(sql: string, ...params: unknown[]) => t.query<T>(sql, ...params);

function expectNoSecrets(): void {
  for (const text of seen) {
    for (const secret of SECRETS) expect(text).not.toContain(secret);
    expect(text).not.toMatch(/clientId|client_id|canonical|refresh_token|apple-refresh/);
  }
}

describe("GET /api/config", () => {
  it("lists which providers are set up (public client ids only)", async () => {
    const res = await call<AppConfig>("GET", "/config", { client: null });
    expect(res.body.auth).toEqual({ googleWebClientId: GOOGLE_WEB, googleIosClientId: GOOGLE_IOS, appleServicesId: SERVICES_ID, appleNative: true });
    env = { ...env, GOOGLE_WEB_CLIENT_ID: "", GOOGLE_IOS_CLIENT_ID: undefined, APPLE_SERVICES_ID: " " };
    expect((await call<AppConfig>("GET", "/config", { client: null })).body.auth).toEqual({
      googleWebClientId: null,
      googleIosClientId: null,
      appleServicesId: null,
      appleNative: true,
    });
  });

  it("answers 503 for a provider that isn't set up", async () => {
    env = { ...env, GOOGLE_WEB_CLIENT_ID: "", GOOGLE_IOS_CLIENT_ID: "" };
    const res = await signIn("google", PHONE, "g-1");
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ error: "Sign in with Google isn't set up yet." });
  });
});

describe("hosts sign in to make a board", () => {
  it("answers a device that isn't signed in with account_required, and makes the board once it is", async () => {
    const refused = await call<{ error: string; code: string }>("POST", "/games", { client: PHONE, body: createInput("Sunday Squares") });
    expect(refused.status).toBe(409);
    expect(refused.body).toEqual({ error: "Sign in with Apple or Google to make a board. Players never need an account.", code: ACCOUNT_REQUIRED_CODE });
    expect(rows("SELECT id FROM games")).toEqual([]);

    expect((await signIn("google", PHONE, "g-sub-1")).status).toBe(200);
    const made = await call<CreateGameResponse>("POST", "/games", { client: PHONE, body: createInput("Sunday Squares") });
    expect(made.status).toBe(201);
    // Players still join and pick without an account.
    await joinAndClaim(LAPTOP, made.body.game.id, "Sam", [{ row: 0, col: 0 }]);
  });

  it("isn't asked where sign-in isn't set up", async () => {
    env = { ...env, GOOGLE_WEB_CLIENT_ID: "", APPLE_SERVICES_ID: "" };
    expect((await call("POST", "/games", { client: PHONE, body: createInput("Sunday Squares") })).status).toBe(201);
  });
});

describe("first sign-in", () => {
  it("makes the device canonical: nothing moves, and it gets its host tokens back", async () => {
    const mine = await boardBy(PHONE, "Phone Board");
    const theirs = await boardBy(FRIEND, "Friend Board");
    await joinAndClaim(PHONE, theirs.id, "Jordan", [{ row: 0, col: 0 }]);

    const res = await signIn("google", PHONE, "g-1", { name: "Jordan Lee" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      playerId: pid(PHONE),
      account: { provider: "google", providers: ["google"], email: "g-1@example.com", name: "Jordan Lee", since: expect.any(Number) },
      hostTokens: { [mine.id]: mine.admin },
      profile: { name: "Jordan", color: "#38b6ff", emoji: "🐐" },
      hostPass: null,
      clubPass: null,
      cohostGames: [],
    });
    const [account] = rows<{ id: string; canonical_client_id: string; email: string }>("SELECT * FROM accounts");
    expect(account).toMatchObject({ canonical_client_id: PHONE, email: "g-1@example.com" });
    expect(rows("SELECT client_id, account_id FROM client_links")).toEqual([{ client_id: PHONE, account_id: account.id }]);
    expect(rows("SELECT provider, subject, account_id FROM account_identities")).toEqual([{ provider: "google", subject: "g-1", account_id: account.id }]);
    expect(rows("SELECT client_id FROM squares")).toEqual([{ client_id: PHONE }]);

    // Signing in again on the same device is a no-op that answers the same.
    const again = await signIn("google", PHONE, "g-1");
    expect(again.status).toBe(200);
    expect(again.body.playerId).toBe(pid(PHONE));
    expect(rows("SELECT * FROM accounts")).toHaveLength(1);

    const me = await call<MeResponse>("GET", "/me", { client: PHONE });
    expect(me.body.account?.provider).toBe("google");
    expect(me.body.hostTokens).toEqual({ [mine.id]: mine.admin });
    expectNoSecrets();
  });

  it("works without a nonce when the token was minted without one", async () => {
    expect((await signIn("google", PHONE, "g-1", { nonce: false })).status).toBe(200);
  });
});

describe("a second device", () => {
  /**
   * The phone hosts A and has squares on the friend's board B. The laptop
   * (not signed in yet) hosts C, has a square on B, a push registration, and
   * B muted.
   */
  async function twoDevices() {
    const a = await boardBy(PHONE, "Board A");
    const b = await boardBy(FRIEND, "Board B");
    const c = await boardBy(LAPTOP, "Board C");
    await joinAndClaim(PHONE, b.id, "Jordan", [{ row: 0, col: 0 }, { row: 0, col: 1 }]);
    await joinAndClaim(LAPTOP, b.id, "Jordan on the laptop", [{ row: 3, col: 3 }]);
    expect((await call("POST", "/push/register", { client: LAPTOP, body: { platform: "ios", token: FCM_TOKEN } })).status).toBe(200);
    expect((await call("POST", `/games/${b.id}/mute`, { client: LAPTOP, body: { muted: true } })).status).toBe(200);
    expect((await signIn("google", PHONE, "g-1")).status).toBe(200);
    return { a, b, c };
  }

  it("merges its squares, players, hosted boards, push rows and mutes into the account", async () => {
    const { a, b, c } = await twoDevices();
    roomCalls = [];
    const res = await signIn("google", LAPTOP, "g-1");
    expect(res.status).toBe(200);
    // The laptop is now the account's player, with host access to both devices' boards.
    expect(res.body.playerId).toBe(pid(PHONE));
    expect(res.body.account?.provider).toBe("google");
    expect(res.body.hostTokens).toEqual({ [a.id]: a.admin, [c.id]: c.admin });

    expect(rows("SELECT DISTINCT client_id FROM squares WHERE game_id = ?", b.id)).toEqual([{ client_id: PHONE }]);
    expect(rows("SELECT COUNT(*) AS n FROM squares WHERE game_id = ? AND client_id = ?", b.id, PHONE)).toEqual([{ n: 3 }]);
    // Both were on board B: the canonical row stays, the laptop's goes.
    expect(rows("SELECT client_id, name FROM players WHERE game_id = ? ORDER BY joined_at", b.id)).toEqual([
      { client_id: FRIEND, name: "Jordan" },
      { client_id: PHONE, name: "Jordan" },
    ]);
    expect(rows("SELECT COUNT(*) AS n FROM players WHERE client_id = ?", LAPTOP)).toEqual([{ n: 0 }]);
    expect(rows("SELECT host_client_id FROM games WHERE id = ?", c.id)).toEqual([{ host_client_id: PHONE }]);
    expect(rows("SELECT client_id FROM push_subscriptions")).toEqual([{ client_id: PHONE }]);
    expect(rows("SELECT game_id, client_id FROM game_mutes")).toEqual([{ game_id: b.id, client_id: PHONE }]);
    expect(rows("SELECT client_id FROM client_links ORDER BY client_id")).toEqual([{ client_id: LAPTOP }, { client_id: PHONE }]);

    // The public board names one player: the account. The laptop's old public id is gone, even from the feed.
    const state = (await call<GameState>("GET", `/games/${b.id}`, { client: null })).body;
    expect(state.squares.filter((s) => s.playerId === pid(PHONE))).toHaveLength(3);
    expect(JSON.stringify(state)).not.toContain(pid(LAPTOP));
    const claimed = state.activity.filter((a) => a.type === "claimed").map((a) => a.actor);
    expect(claimed).toContain(pid(PHONE));
    const boardC = (await call<GameState>("GET", `/games/${c.id}`, { client: null })).body;
    expect(boardC.game.hostPlayerId).toBe(pid(PHONE));

    // Open boards get the new state.
    await settle();
    const broadcastTo = new Set(roomCalls.filter((r) => r.url.endsWith("/broadcast")).map((r) => r.game));
    expect(broadcastTo).toEqual(new Set([b.id, c.id]));
    expectNoSecrets();
  });

  it("acts as the account on every route afterwards: squares, dashboard, host tools, push", async () => {
    const { a, b, c } = await twoDevices();
    await signIn("google", LAPTOP, "g-1");

    // A square claimed on the laptop is the account's.
    const claim = await call<{ state: GameState }>("POST", `/games/${b.id}/claim`, { client: LAPTOP, body: { cells: [{ row: 4, col: 4 }] } });
    expect(claim.status).toBe(200);
    expect(claim.body.state.squares.find((s) => s.row === 4 && s.col === 4)?.playerId).toBe(pid(PHONE));
    expect(rows("SELECT client_id FROM squares WHERE game_id = ? AND row = 4 AND col = 4", b.id)).toEqual([{ client_id: PHONE }]);
    // ...and the phone can give it back.
    expect((await call("POST", `/games/${b.id}/release`, { client: PHONE, body: { cells: [{ row: 4, col: 4 }] } })).status).toBe(200);

    // Both devices see the same dashboard, hosting A and C.
    for (const client of [PHONE, LAPTOP]) {
      const dash = await call<{ games: GameSummary[] }>("GET", "/me/games", { client });
      const byId = new Map(dash.body.games.map((g) => [g.id, g]));
      expect([...byId.keys()].sort()).toEqual([a.id, b.id, c.id].sort());
      expect(byId.get(a.id)?.isHost).toBe(true);
      expect(byId.get(c.id)?.isHost).toBe(true);
      expect(byId.get(b.id)).toMatchObject({ isHost: false, joined: true, mySquares: 3 });
    }

    // Host tools from the laptop with the token it got back for the phone's board.
    const renamed = await call<{ state: GameState }>("PATCH", `/games/${a.id}`, { client: LAPTOP, admin: a.admin, body: { name: "Board A+" } });
    expect(renamed.status).toBe(200);
    // Joining the phone's board from the laptop is a rename, not a second player.
    await call("POST", `/games/${a.id}/join`, { client: LAPTOP, body: { name: "Jordan", color: "#ff6b35", emoji: "🦊" } });
    expect(rows("SELECT client_id FROM players WHERE game_id = ?", a.id)).toEqual([{ client_id: PHONE }]);

    // A push registration from the laptop is the account's, so the account's pushes reach it.
    const web = "dGVzdA:APA91bAnotherDeviceTokenForTheLaptopAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
    expect((await call("POST", "/push/register", { client: LAPTOP, body: { platform: "ios", token: web } })).status).toBe(200);
    expect(rows("SELECT DISTINCT client_id FROM push_subscriptions")).toEqual([{ client_id: PHONE }]);
    expect((await call<{ muted: boolean }>("GET", `/games/${b.id}/mute`, { client: PHONE })).body).toEqual({ muted: true });
    expectNoSecrets();
  });

  it("merges its Host Pass rows into the account, keeping the account's too, so either device is covered", async () => {
    // The phone (the account) has an ended pass, the laptop a test pass bought before signing in.
    expect((await signIn("google", PHONE, "g-1")).status).toBe(200);
    const now = Date.now();
    rows(
      `INSERT INTO host_passes (id, client_id, provider, external_id, status, current_period_end, auto_renew, livemode, event_at, created_at, updated_at)
       VALUES ('hp_old', ?, 'iap', '2000000000000001', 'ended', ?, 0, 1, ?, ?, ?)`,
      PHONE,
      now - 1000,
      now,
      now,
      now,
    );
    rows(`INSERT INTO stripe_customers (client_id, livemode, customer_id, created_at) VALUES (?, 0, 'cus_laptop', ?)`, LAPTOP, now);
    expect((await call<HostPassState>("POST", "/payments/pass/test", { client: LAPTOP })).body.pass?.active).toBe(true);
    expect((await call<HostPassState>("GET", "/payments/pass", { client: PHONE })).body.pass?.active).toBe(false);

    expect((await signIn("google", LAPTOP, "g-1")).status).toBe(200);
    expect(rows("SELECT provider, client_id FROM host_passes ORDER BY provider")).toEqual([
      { provider: "iap", client_id: PHONE },
      { provider: "test", client_id: PHONE },
    ]);
    expect(rows("SELECT client_id, customer_id FROM stripe_customers")).toEqual([{ client_id: PHONE, customer_id: "cus_laptop" }]);
    for (const client of [PHONE, LAPTOP]) {
      const res = await call<HostPassState>("GET", "/payments/pass", { client, headers: { "x-signed-in": "1" } });
      expect(res.body.pass).toMatchObject({ active: true, provider: "test" });
    }
    expect((await call<MeResponse>("GET", "/me", { client: PHONE })).body.hostPass).toMatchObject({ active: true });
    expectNoSecrets();
  });

  it("moves its Club Pass and its club into the account, so the account's boards carry the club", async () => {
    expect((await signIn("google", PHONE, "g-1")).status).toBe(200);
    const a = await boardBy(PHONE, "Board A");
    // The laptop, before signing in: a Club Pass, a named club and a TV link.
    expect((await call<HostPassState>("POST", "/payments/pass/test", { client: LAPTOP, body: { plan: "club" } })).body.club?.active).toBe(true);
    const named = await call<ClubSettings>("PATCH", "/clubs/mine", { client: LAPTOP, body: { name: "Laptop Lounge" } });
    expect(named.status).toBe(200);
    const link = await call<ClubSettings>("POST", "/clubs/mine/tv", { client: LAPTOP });
    expect(link.status).toBe(201);
    seen.pop();
    expect((await call("GET", "/clubs/mine", { client: PHONE })).status).toBe(404);

    expect((await signIn("google", LAPTOP, "g-1")).status).toBe(200);
    expect(rows("SELECT owner_client_id, name FROM clubs")).toEqual([{ owner_client_id: PHONE, name: "Laptop Lounge" }]);
    expect(rows("SELECT client_id, plan FROM host_passes")).toEqual([{ client_id: PHONE, plan: "club" }]);
    for (const client of [PHONE, LAPTOP]) {
      const mine = await call<ClubSettings>("GET", "/clubs/mine", { client, headers: { "x-signed-in": "1" } });
      expect(mine.body.club).toMatchObject({ id: named.body.club.id, name: "Laptop Lounge" });
      // The TV link the laptop made still works: it moved with the club.
      expect(mine.body.tvKey).toBe(link.body.tvKey);
    }
    expect((await call<MeResponse>("GET", "/me", { client: PHONE })).body.clubPass).toMatchObject({ active: true });
    // The account's board now shows the club (read fresh past the branding cache's TTL in other isolates; here, at once).
    const board = await call<GameState>("GET", `/games/${a.id}`, { client: null });
    expect(board.body.game.club?.name ?? "").toBe("Laptop Lounge");
    expectNoSecrets();
  });

  it("keeps the account's own club when both have one; an empty one gives way", async () => {
    expect((await signIn("google", PHONE, "g-1")).status).toBe(200);
    for (const client of [PHONE, LAPTOP, FRIEND]) await call("POST", "/payments/pass/test", { client, body: { plan: "club" } });
    await call("PATCH", "/clubs/mine", { client: PHONE, body: { name: "The Account Club" } });
    await call("PATCH", "/clubs/mine", { client: LAPTOP, body: { name: "The Laptop Club" } });
    expect((await signIn("google", LAPTOP, "g-1")).status).toBe(200);
    expect(rows("SELECT owner_client_id, name FROM clubs ORDER BY name")).toEqual([{ owner_client_id: PHONE, name: "The Account Club" }]);

    // Another account whose club is still empty takes its new device's.
    expect((await signIn("google", STRANGER, "g-2")).status).toBe(200);
    expect((await call("GET", "/clubs/mine", { client: STRANGER, body: undefined })).status).toBe(404);
    await call("POST", "/payments/pass/test", { client: STRANGER, body: { plan: "club" } });
    expect((await call("GET", "/clubs/mine", { client: STRANGER })).status).toBe(200);
    await call("PATCH", "/clubs/mine", { client: FRIEND, body: { name: "Friend's Bar" } });
    expect((await signIn("google", FRIEND, "g-2")).status).toBe(200);
    expect(rows("SELECT owner_client_id, name FROM clubs ORDER BY name")).toEqual([
      { owner_client_id: STRANGER, name: "Friend's Bar" },
      { owner_client_id: PHONE, name: "The Account Club" },
    ]);
  });

  it("keeps co-host rights: a co-host who signs in stays one on every device, and a board the account hosts drops its co-host row", async () => {
    // A friend's board the laptop co-hosts, and the phone's own board the laptop also co-hosts.
    const friends = await boardBy(FRIEND, "Friend's Board");
    const mine = await boardBy(PHONE, "Phone's Board");
    expect((await signIn("google", PHONE, "g-1")).status).toBe(200);
    for (const board of [friends, mine]) {
      await joinAndClaim(LAPTOP, board.id, "Lap", []);
      const host = board === friends ? FRIEND : PHONE;
      const link = await call<{ url: string }>("POST", `/games/${board.id}/cohost-invites`, { client: host, admin: board.admin });
      expect(link.status).toBe(201);
      const token = new URL(link.body.url).searchParams.get("cohost");
      expect((await call("POST", `/games/${board.id}/cohosts/accept`, { client: LAPTOP, body: { token } })).status).toBe(200);
    }
    expect(rows("SELECT game_id, client_id FROM cohosts ORDER BY game_id")).toHaveLength(2);

    expect((await signIn("google", LAPTOP, "g-1")).status).toBe(200);
    await settle();
    // The co-host row moved to the account; on the account's own board it's the host, not a co-host.
    expect(rows("SELECT game_id, client_id FROM cohosts")).toEqual([{ game_id: friends.id, client_id: PHONE }]);
    expect(roomCalls.some((r) => r.game === friends.id)).toBe(true);
    const friendsState = (await call<GameState>("GET", `/games/${friends.id}`, { client: null })).body;
    expect(friendsState.game.cohostIds).toEqual([pid(PHONE)]);
    expect((await call<GameState>("GET", `/games/${mine.id}`, { client: null })).body.game.cohostIds).toEqual([]);

    // Either device runs the friend's board as a co-host, by clientId, no token.
    for (const client of [LAPTOP, PHONE]) {
      const renamed = await call<{ state: GameState }>("PATCH", `/games/${friends.id}`, { client, headers: { "x-signed-in": "1" }, body: { name: `Renamed by ${client === LAPTOP ? "laptop" : "phone"}` } });
      expect(renamed.status).toBe(200);
    }
    const me = (await call<MeResponse>("GET", "/me", { client: LAPTOP })).body;
    expect(me.cohostGames).toEqual([friends.id]);
    // Only the account's own board's token; never the friend's.
    expect(me.hostTokens).toEqual({ [mine.id]: mine.admin });
    const summaries = (await call<{ games: GameSummary[] }>("GET", "/me/games", { client: LAPTOP, headers: { "x-signed-in": "1" } })).body.games;
    expect(summaries.find((g) => g.id === friends.id)).toMatchObject({ isHost: false, isCohost: true });
    expect(summaries.find((g) => g.id === mine.id)).toMatchObject({ isHost: true, isCohost: false });
    expectNoSecrets();
  });

  it("merges its email notice addresses into the account; where both have one on a board, the confirmed one stays", async () => {
    const { a, b, c } = await twoDevices();
    const now = Date.now();
    const sub = (id: string, client: string, email: string, status: string) =>
      rows(
        `INSERT INTO email_subscriptions (id, game_id, client_id, email, email_key, status, confirm_token_hash, confirm_sent_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)`,
        `es_${id}_${client}`,
        id,
        client,
        email,
        `key-${email}`.padEnd(32, "x").slice(0, 32),
        status,
        now,
        now,
        now,
      );
    sub(a.id, PHONE, "phone@gmail.com", "confirmed");
    sub(a.id, LAPTOP, "laptop-a@gmail.com", "pending");
    sub(b.id, PHONE, "phone-b@gmail.com", "pending");
    sub(b.id, LAPTOP, "laptop-b@gmail.com", "confirmed");
    sub(c.id, LAPTOP, "laptop-c@gmail.com", "pending");

    expect((await signIn("google", LAPTOP, "g-1")).status).toBe(200);
    expect(rows("SELECT game_id, client_id, email, status FROM email_subscriptions ORDER BY email")).toEqual(
      [
        { game_id: b.id, client_id: PHONE, email: "laptop-b@gmail.com", status: "confirmed" },
        { game_id: c.id, client_id: PHONE, email: "laptop-c@gmail.com", status: "pending" },
        { game_id: a.id, client_id: PHONE, email: "phone@gmail.com", status: "confirmed" },
      ].sort((x, y) => x.email.localeCompare(y.email)),
    );
    expectNoSecrets();
  });

  it("can't sign in to a second account while signed in to one", async () => {
    expect((await signIn("google", PHONE, "g-1")).status).toBe(200);
    const other = await signIn("google", PHONE, "g-2");
    expect(other.status).toBe(409);
    expect(other.body).toEqual({ error: "You're signed in to a different account on this device. Sign out first." });
    // An existing account behind another provider, too.
    expect((await signIn("apple", LAPTOP, "apple-1")).status).toBe(200);
    expect((await signIn("apple", PHONE, "apple-1")).status).toBe(409);
    expect(rows("SELECT client_id, account_id FROM client_links")).toHaveLength(2);
    expect(rows("SELECT * FROM accounts")).toHaveLength(2);
  });
});

describe("sign-out", () => {
  it("drops this device's link and its push registration; the account and other devices stay", async () => {
    const a = await boardBy(PHONE);
    await signIn("google", PHONE, "g-1");
    await call("POST", "/push/register", { client: LAPTOP, body: { platform: "ios", token: FCM_TOKEN } });
    await signIn("google", LAPTOP, "g-1");
    expect((await call<{ games: GameSummary[] }>("GET", "/me/games", { client: LAPTOP })).body.games.map((g) => g.id)).toEqual([a.id]);

    const out = await call("POST", "/auth/sign-out", { client: LAPTOP, body: { token: FCM_TOKEN } });
    expect(out.status).toBe(200);
    expect(out.body).toEqual({ ok: true });
    expect(rows("SELECT client_id FROM client_links")).toEqual([{ client_id: PHONE }]);
    expect(rows("SELECT * FROM push_subscriptions")).toEqual([]);

    // The laptop is just itself again (the app throws its clientId away anyway).
    const me = await call<MeResponse>("GET", "/me", { client: LAPTOP });
    expect(me.body).toEqual({ playerId: pid(LAPTOP), account: null, hostTokens: {}, profile: null, hostPass: null, clubPass: null, cohostGames: [] });
    expect((await call<{ games: GameSummary[] }>("GET", "/me/games", { client: LAPTOP })).body.games).toEqual([]);
    expect((await call<MeResponse>("GET", "/me", { client: PHONE })).body.account).not.toBeNull();
    // Signing out twice (or when never signed in) is fine.
    expect((await call("POST", "/auth/sign-out", { client: LAPTOP })).status).toBe(200);
    expectNoSecrets();
  });
});

describe("signing back in after signing out", () => {
  it("gets the host's boards back on the fresh device, with the host tokens (web Sign in with Apple)", async () => {
    const a = await boardBy(PHONE);
    const webApple = { claims: { aud: SERVICES_ID } };
    expect((await signIn("apple", PHONE, "apple-web-1", webApple)).status).toBe(200);
    // Signing out of the canonical device: the app starts fresh with a new clientId.
    expect((await call("POST", "/auth/sign-out", { client: PHONE })).status).toBe(200);
    const again = await signIn("apple", LAPTOP, "apple-web-1", webApple);
    expect(again.status).toBe(200);
    expect(again.body.hostTokens).toEqual({ [a.id]: a.admin });
    const games = await call<{ games: GameSummary[] }>("GET", "/me/games", { client: LAPTOP, headers: { "x-signed-in": "1" } });
    expect(games.body.games.map((g) => [g.id, g.isHost])).toEqual([[a.id, true]]);
  });
});

describe("one account per email", () => {
  const myGames = async (client: string) =>
    (await call<{ games: GameSummary[] }>("GET", "/me/games", { client, headers: { "x-signed-in": "1" } })).body.games.map((g) => g.id).sort();

  it("puts Apple after Google (same verified email, any case) in the same account, with the boards", async () => {
    const a = await boardBy(PHONE);
    expect((await signIn("google", PHONE, "g-1", { email: "Jo@Example.com" })).status).toBe(200);
    const apple = await signIn("apple", LAPTOP, "apple-1", { email: "jo@example.com", claims: { email_verified: "true" } });
    expect(apple.status).toBe(200);
    expect(apple.body.account).toMatchObject({ provider: "google", providers: ["google", "apple"] });
    expect(apple.body.hostTokens).toEqual({ [a.id]: a.admin });
    expect(await myGames(LAPTOP)).toEqual([a.id]);
    expect(rows("SELECT count(*) AS n FROM accounts")).toEqual([{ n: 1 }]);
    // Either one signs in from now on, wherever.
    expect((await signIn("apple", STRANGER, "apple-1", { email: null })).body.account).toMatchObject({ providers: ["google", "apple"] });
  });

  it("never matches an unverified email or Apple's private relay address, and never swaps a real address for one", async () => {
    await signIn("google", PHONE, "g-1", { email: "jo@example.com" });
    const unverified = await signIn("google", LAPTOP, "g-2", { email: "jo@example.com", claims: { email_verified: false } });
    expect(unverified.body.account?.providers).toEqual(["google"]);
    expect(rows("SELECT count(*) AS n FROM accounts")).toEqual([{ n: 2 }]);
    const relay = await signIn("apple", FRIEND, "apple-9", { email: "x7q2@privaterelay.appleid.com" });
    expect(relay.body.account?.providers).toEqual(["apple"]);
    expect(rows("SELECT count(*) AS n FROM accounts")).toEqual([{ n: 3 }]);
  });
});

describe("adding Apple or Google to an account", () => {
  const myGames = async (client: string) =>
    (await call<{ games: GameSummary[] }>("GET", "/me/games", { client, headers: { "x-signed-in": "1" } })).body.games.map((g) => g.id).sort();

  it("adds a sign-in the account didn't have (a hidden Apple email), and either one signs in after", async () => {
    const a = await boardBy(PHONE);
    await signIn("google", PHONE, "g-1");
    const added = await signIn("apple", PHONE, "apple-1", { link: true, email: "q9@privaterelay.appleid.com" });
    expect(added.status).toBe(200);
    expect(added.body.account).toMatchObject({ provider: "google", providers: ["google", "apple"], email: "g-1@example.com" });
    const laptop = await signIn("apple", LAPTOP, "apple-1", { email: "q9@privaterelay.appleid.com" });
    expect(laptop.body.hostTokens).toEqual({ [a.id]: a.admin });
    // Adding it again is fine.
    expect((await signIn("apple", PHONE, "apple-1", { link: true })).status).toBe(200);
  });

  it("asks first when that sign-in has its own account, then combines the two: boards, devices and sign-ins", async () => {
    const a = await boardBy(PHONE, "Google Board");
    const b = await boardBy(LAPTOP, "Apple Board");
    await signIn("google", PHONE, "g-1");
    await signIn("apple", LAPTOP, "apple-1");
    expect(rows("SELECT count(*) AS n FROM accounts")).toEqual([{ n: 2 }]);

    const asked = await call<{ error: string; code: string }>("POST", "/auth/apple/link", { client: PHONE, body: {} });
    expect(asked.status).toBe(400); // no token: nothing happens
    const exists = await signIn("apple", PHONE, "apple-1", { link: true });
    expect(exists.status).toBe(409);
    expect(exists.body).toEqual({ error: "That Apple sign-in already has its own JaxSquares account.", code: ACCOUNT_EXISTS_CODE });
    expect(rows("SELECT count(*) AS n FROM accounts")).toEqual([{ n: 2 }]);

    const combined = await signIn("apple", PHONE, "apple-1", { link: true, body: { combine: true } });
    expect(combined.status).toBe(200);
    expect(combined.body.account).toMatchObject({ providers: ["google", "apple"] });
    expect(combined.body.hostTokens).toEqual({ [a.id]: a.admin, [b.id]: b.admin });
    expect(rows("SELECT count(*) AS n FROM accounts")).toEqual([{ n: 1 }]);
    // The laptop, signed in to the other account, is this account now.
    expect(await myGames(LAPTOP)).toEqual([a.id, b.id].sort());
    expect((await call<MeResponse>("GET", "/me", { client: LAPTOP })).body.playerId).toBe(pid(PHONE));
    expectNoSecrets();
  });

  it("needs this device to be signed in", async () => {
    const res = await signIn("apple", PHONE, "apple-1", { link: true });
    expect(res.status).toBe(409);
    expect(rows("SELECT count(*) AS n FROM accounts")).toEqual([{ n: 0 }]);
  });
});

describe("the link-devices ops script (scripts/ops/link-devices.ts)", () => {
  it("attaches a device that never signed in exactly as its signing in would: boards, squares, host tokens, and a link", async () => {
    const a = await boardBy(PHONE, "Phone Board");
    const theirs = await boardBy(FRIEND, "Friend Board");
    await joinAndClaim(PHONE, theirs.id, "Jarryd", [{ row: 3, col: 3 }]);
    // The account was made on another browser, which then signed out; this one signed back in.
    await signIn("apple", LAPTOP, "apple-1");
    expect((await call("POST", "/auth/sign-out", { client: LAPTOP })).status).toBe(200);
    await signIn("apple", STRANGER, "apple-1");
    const [account] = rows<{ id: string; canonical_client_id: string }>("SELECT id, canonical_client_id FROM accounts");

    const sql = await linkSql([PHONE], { id: account.id, canonical: account.canonical_client_id }, Date.now());
    for (const statement of sql.split(";\n")) t.query(statement.replace(/;$/, ""));

    const me = await call<MeResponse>("GET", "/me", { client: STRANGER, headers: { "x-signed-in": "1" } });
    expect(me.body.hostTokens).toEqual({ [a.id]: a.admin });
    const games = (await call<{ games: GameSummary[] }>("GET", "/me/games", { client: STRANGER, headers: { "x-signed-in": "1" } })).body.games;
    expect(games.map((g) => g.id).sort()).toEqual([a.id, theirs.id].sort());
    const state = (await call<GameState>("GET", `/games/${theirs.id}`, { client: STRANGER, headers: { "x-signed-in": "1" } })).body;
    expect(state.squares.find((sq) => sq.row === 3 && sq.col === 3)?.playerId).toBe(pid(LAPTOP));
    // The browser that made the board is signed in to the account now, too.
    expect((await call<MeResponse>("GET", "/me", { client: PHONE, headers: { "x-signed-in": "1" } })).body.account).not.toBeNull();
  });

  it("writes parameters in as SQL literals, leaving string literals alone", () => {
    expect(inline("UPDATE t SET a = ?2, b = '?' WHERE c = ?1 AND d = 'it''s ?'", ["x'y", 5])).toBe("UPDATE t SET a = 5, b = '?' WHERE c = 'x''y' AND d = 'it''s ?'");
    expect(inline("INSERT INTO t VALUES (?, ?, ?)", ["a", null, 3])).toBe("INSERT INTO t VALUES ('a', NULL, 3)");
  });
});

describe("DELETE /api/account", () => {
  it("deletes the account, its identities and links, revokes the Apple token, and leaves the boards", async () => {
    env = { ...env, APPLE_TEAM_ID: "TEAM123456", APPLE_KEY_ID: "KEY1234567", APPLE_SIGNIN_PRIVATE_KEY: pem };
    const a = await boardBy(PHONE);
    await joinAndClaim(FRIEND, a.id, "Friend", [{ row: 2, col: 2 }]);
    const res = await signIn("apple", PHONE, "apple-1", { body: { authorizationCode: "c0de", name: "Jordan Lee" } });
    expect(res.status).toBe(200);
    expect(res.body.account).toMatchObject({ provider: "apple", name: "Jordan Lee" });
    await settle();

    // The code was exchanged with a fresh ES256 client secret for the iOS app's bundle id.
    const exchange = fetchMock.mock.calls.find(([url]) => String(url) === APPLE_TOKEN_URL)!;
    const form = new URLSearchParams(String((exchange[1] as RequestInit).body));
    expect(form.get("client_id")).toBe(BUNDLE);
    expect(form.get("code")).toBe("c0de");
    expect(form.get("grant_type")).toBe("authorization_code");
    const [header, payload] = form.get("client_secret")!.split(".").slice(0, 2).map((p) => JSON.parse(atob(p.replace(/-/g, "+").replace(/_/g, "/"))));
    expect(header).toEqual({ alg: "ES256", kid: "KEY1234567" });
    expect(payload).toMatchObject({ iss: "TEAM123456", sub: BUNDLE, aud: "https://appleid.apple.com" });
    expect(rows("SELECT refresh_token, token_client_id FROM account_identities")).toEqual([{ refresh_token: "apple-refresh-1", token_client_id: BUNDLE }]);

    await call("POST", "/push/register", { client: LAPTOP, body: { platform: "ios", token: FCM_TOKEN } });
    await signIn("apple", LAPTOP, "apple-1");
    // An email notice address the account added (nobody could manage it once the account is gone).
    rows(
      `INSERT INTO email_subscriptions (id, game_id, client_id, email, email_key, status, created_at, updated_at)
       VALUES ('es_1', ?, ?, 'jordan@gmail.com', 'kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk', 'confirmed', 1, 1)`,
      a.id,
      PHONE,
    );

    const del = await call("DELETE", "/account", { client: LAPTOP });
    expect(del.status).toBe(200);
    expect(del.body).toEqual({ ok: true });
    const revoke = fetchMock.mock.calls.find(([url]) => String(url) === APPLE_REVOKE_URL)!;
    const revokeForm = new URLSearchParams(String((revoke[1] as RequestInit).body));
    expect(revokeForm.get("token")).toBe("apple-refresh-1");
    expect(revokeForm.get("client_id")).toBe(BUNDLE);
    expect(revokeForm.get("token_type_hint")).toBe("refresh_token");

    for (const table of ["accounts", "account_identities", "client_links", "push_subscriptions", "email_subscriptions"]) expect(rows(`SELECT * FROM ${table}`)).toEqual([]);
    // The board and its squares stay, as anonymous data under the canonical clientId.
    expect(rows("SELECT host_client_id FROM games WHERE id = ?", a.id)).toEqual([{ host_client_id: PHONE }]);
    expect(rows("SELECT client_id FROM squares WHERE game_id = ?", a.id)).toEqual([{ client_id: FRIEND }]);
    expect((await call<MeResponse>("GET", "/me", { client: PHONE })).body.account).toBeNull();
    expect((await call<MeResponse>("GET", "/me", { client: LAPTOP })).body).toMatchObject({ playerId: pid(LAPTOP), account: null });
    expect((await call("DELETE", "/account", { client: LAPTOP })).status).toBe(404);
    expectNoSecrets();
  });

  it("stops a web Host Pass from renewing first, and deletes nothing if Stripe can't be reached", async () => {
    env = { ...env, STRIPE_SECRET_KEY: "sk_test_1" };
    expect((await signIn("google", PHONE, "g-1")).status).toBe(200);
    const now = Date.now();
    rows(
      `INSERT INTO host_passes (id, client_id, provider, external_id, status, current_period_end, auto_renew, livemode, event_at, created_at, updated_at)
       VALUES ('hp_web', ?, 'stripe', 'sub_1', 'active', ?, 1, 0, ?, ?, ?)`,
      PHONE,
      now + 100 * 86_400_000,
      now,
      now,
      now,
    );
    const stripeCalls: { url: string; body: string }[] = [];
    let stripeUp = false;
    const base = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (!url.startsWith("https://api.stripe.com/")) return base(input, init);
      if (!stripeUp) return new Response(JSON.stringify({ error: { message: "down" } }), { status: 500 });
      stripeCalls.push({ url, body: String(init?.body) });
      return json({ id: "sub_1", object: "subscription", status: "active", customer: "cus_1", current_period_end: Math.floor(now / 1000) + 8_640_000, cancel_at_period_end: true, livemode: false, metadata: { product: "host_pass" }, latest_invoice: null });
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const failed = await call<{ error: string }>("DELETE", "/account", { client: PHONE });
    expect(failed.status).toBe(502);
    expect(rows("SELECT * FROM accounts")).toHaveLength(1);

    stripeUp = true;
    expect((await call("DELETE", "/account", { client: PHONE })).status).toBe(200);
    expect(stripeCalls).toEqual([{ url: "https://api.stripe.com/v1/subscriptions/sub_1", body: "cancel_at_period_end=true" }]);
    expect(rows("SELECT status, auto_renew FROM host_passes")).toEqual([{ status: "active", auto_renew: 0 }]);
    expect(rows("SELECT * FROM accounts")).toEqual([]);
  });

  it("deletes a Club Pass holder's club (its name, logo and TV link) with the account", async () => {
    expect((await signIn("google", PHONE, "g-1")).status).toBe(200);
    await call("POST", "/payments/pass/test", { client: PHONE, body: { plan: "club" } });
    await call("PATCH", "/clubs/mine", { client: PHONE, body: { name: "The Rusty Anchor" } });
    expect(rows("SELECT name FROM clubs")).toEqual([{ name: "The Rusty Anchor" }]);
    expect((await call("DELETE", "/account", { client: PHONE })).status).toBe(200);
    expect(rows("SELECT * FROM clubs")).toEqual([]);
  });

  it("skips Apple's token exchange and revocation quietly without the Sign in with Apple key", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    expect((await signIn("apple", PHONE, "apple-1", { body: { authorizationCode: "c0de" } })).status).toBe(200);
    await settle();
    expect((await call("DELETE", "/account", { client: PHONE })).status).toBe(200);
    const urls = fetchMock.mock.calls.map(([url]) => String(url));
    expect(urls).not.toContain(APPLE_TOKEN_URL);
    expect(urls).not.toContain(APPLE_REVOKE_URL);
    expect(rows("SELECT * FROM accounts")).toEqual([]);
    log.mockRestore();
  });
});

describe("refused sign-ins", () => {
  it("refuses a token for another app, a wrong nonce, a bad body or no device id", async () => {
    const quiet = vi.spyOn(console, "log").mockImplementation(() => {});
    const wrongAud = await signIn("google", PHONE, "g-1", { claims: { aud: "someone-else.apps.googleusercontent.com" } });
    expect(wrongAud.status).toBe(401);
    expect(wrongAud.body).toEqual({ error: "That sign-in didn't go through. Try again." });
    expect((await signIn("google", PHONE, "g-1", { body: { nonce: "not-the-nonce" } })).status).toBe(401);
    expect((await signIn("apple", PHONE, "a-1", { claims: { iss: "https://accounts.google.com" } })).status).toBe(401);
    // The web's Services ID is an Apple audience too.
    expect((await signIn("apple", PHONE, "a-1", { claims: { aud: SERVICES_ID } })).status).toBe(200);
    expect((await call("POST", "/auth/google", { client: LAPTOP, body: {} })).status).toBe(400);
    expect((await call("POST", "/auth/google", { client: null, body: { idToken: "x.y.z" } })).status).toBe(401);
    expect(rows("SELECT COUNT(*) AS n FROM accounts")).toEqual([{ n: 1 }]);
    quiet.mockRestore();
  });

  it(`allows ${RATE_LIMITS.auth.limit} sign-in attempts per device per hour`, async () => {
    const quiet = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.UTC(2026, 9, 18, 17, 0, 1));
    try {
      for (let i = 0; i < RATE_LIMITS.auth.limit; i++) {
        expect((await call("POST", "/auth/google", { client: STRANGER, body: { idToken: "bad.token.here" } })).status).toBe(401);
      }
      const limited = await call("POST", "/auth/google", { client: STRANGER, body: { idToken: "bad.token.here" } });
      expect(limited.status).toBe(429);
      expect(limited.body).toEqual({ error: RATE_LIMITS.auth.message });
    } finally {
      vi.useRealTimers();
      quiet.mockRestore();
    }
  });
});

describe("resolving a signed-in device", () => {
  it("skips a cached 'not signed in' answer when the app says it's signed in (a sign-in another isolate handled)", async () => {
    const a = await boardBy(PHONE);
    // The laptop's first request caches "not linked" in this isolate.
    expect((await call<{ games: GameSummary[] }>("GET", "/me/games", { client: LAPTOP })).body.games).toEqual([]);
    // Meanwhile another isolate signs the laptop in to the phone's account.
    const now = Date.now();
    t.query(`INSERT INTO accounts (id, canonical_client_id, created_at, updated_at) VALUES ('acct1', ?, ?, ?)`, PHONE, now, now);
    t.query(`INSERT INTO client_links (client_id, account_id, created_at) VALUES (?, 'acct1', ?), (?, 'acct1', ?)`, PHONE, now, LAPTOP, now);
    // Without the hint the cached answer stands for a few seconds; with it, the link is read fresh.
    expect((await call<{ games: GameSummary[] }>("GET", "/me/games", { client: LAPTOP })).body.games).toEqual([]);
    const fresh = await call<{ games: GameSummary[] }>("GET", "/me/games", { client: LAPTOP, headers: { "x-signed-in": "1" } });
    expect(fresh.body.games.map((g) => g.id)).toEqual([a.id]);
    // GET /me always reads fresh.
    expect((await call<MeResponse>("GET", "/me", { client: LAPTOP })).body.playerId).toBe(pid(PHONE));
  });

  it("fails open to the device itself when the account tables aren't there yet", async () => {
    t = await createTestD1(MIGRATIONS.filter((m) => !m.includes("0010") && !m.includes("0011") && !m.includes("0016")));
    env = { ...env, DB: t.d1 };
    const a = await boardBy(PHONE);
    expect((await call<{ games: GameSummary[] }>("GET", "/me/games", { client: PHONE, headers: { "x-signed-in": "1" } })).body.games.map((g) => g.id)).toEqual([a.id]);
    expect((await call<MeResponse>("GET", "/me", { client: PHONE })).body).toMatchObject({ playerId: pid(PHONE), account: null, hostTokens: { [a.id]: a.admin } });
  });
});
