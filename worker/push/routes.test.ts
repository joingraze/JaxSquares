// @vitest-environment node
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../env";
import { createTestD1, type TestD1 } from "../payments/testD1";
import { pushRoutes } from "./routes";
import { makeBrowserSubscription } from "./testFixtures";

vi.mock("../db", () => ({
  getGame: vi.fn(async (_db: unknown, id: string) => (id === "abc234" ? { id } : null)),
  getMembers: vi.fn(async () => []),
}));

const CLIENT = "client-jax-001";
const app = new Hono<{ Bindings: Env }>().route("/api", pushRoutes);

// Top-level: it.each below builds its cases at collection time.
const browser = await makeBrowserSubscription("https://web.push.apple.com/QGuQyavXutnMH9hSc");
let t: TestD1;
let env: Env;

beforeEach(async () => {
  t = await createTestD1(["migrations/0002_core_model.sql", "migrations/0004_push.sql"]);
  t.query(
    `INSERT INTO games (id, name, team_x, team_y, format, periods, host_client_id, admin_token, created_at, updated_at)
     VALUES ('abc234', 'Board', '{}', '{}', '{}', '[]', 'host-client-0001', 'tok', 0, 0)`,
  );
  env = { DB: t.d1 } as Env;
});

function req(method: string, path: string, body?: unknown, clientId: string | null = CLIENT) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (clientId) headers["x-client-id"] = clientId;
  return app.request(path, { method, headers, body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body) }, env);
}

const webBody = (over: Record<string, unknown> = {}) => ({
  platform: "web",
  subscription: { endpoint: browser.endpoint, keys: { p256dh: browser.p256dh, auth: browser.auth }, ...over },
});

const rows = () => t.query<{ client_id: string; platform: string; endpoint_or_token: string }>(
  `SELECT client_id, platform, endpoint_or_token FROM push_subscriptions ORDER BY endpoint_or_token`,
);

describe("POST /api/push/register", () => {
  it("stores a browser subscription", async () => {
    const res = await req("POST", "/api/push/register", webBody());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(rows()).toEqual([{ client_id: CLIENT, platform: "web", endpoint_or_token: browser.endpoint }]);
  });

  it("stores native FCM tokens", async () => {
    const token = "dGVzdA:APA91bHPRgkF3JUikC4ENAHEeMrd41Zxv3hVZjC9KtT8OvPVGJ-hQMRKRrZuJAEcl7B338qju59zJMjw2DELjzEvxwYv7hH5Ynpc1ODQ0aT4U4OFEeco8ohsN5PjL1iC2dNtk2BAokeMCg2ZXKqpc8FXKmhX94kIxQ";
    expect((await req("POST", "/api/push/register", { platform: "android", token })).status).toBe(200);
    expect(rows()[0]).toMatchObject({ platform: "android", endpoint_or_token: token });
  });

  it.each([
    ["no client id", webBody(), null, 401],
    ["a bad client id", webBody(), "x", 401],
    ["broken JSON", "{nope", CLIENT, 400],
    ["an unknown platform", { platform: "pager", token: "x".repeat(40) }, CLIENT, 400],
    ["a non-push-service endpoint", webBody({ endpoint: "https://evil.example.com/collect" }), CLIENT, 400],
    ["a lookalike host", webBody({ endpoint: "https://fcm.googleapis.com.evil.example/x" }), CLIENT, 400],
    ["plain http", webBody({ endpoint: "http://fcm.googleapis.com/fcm/send/x" }), CLIENT, 400],
    ["bad subscription keys", webBody({ keys: { p256dh: "short", auth: "short" } }), CLIENT, 400],
    ["a malformed token", { platform: "ios", token: "<script>" }, CLIENT, 400],
    ["an oversized body", { platform: "ios", token: "a".repeat(9000) }, CLIENT, 413],
  ])("rejects %s", async (_label, body, clientId, status) => {
    const res = await req("POST", "/api/push/register", body, clientId);
    expect(res.status).toBe(status);
    expect(await res.json()).toHaveProperty("error");
    expect(rows()).toEqual([]);
  });
});

describe("POST /api/push/unregister", () => {
  it("removes this client's device only", async () => {
    await req("POST", "/api/push/register", webBody());
    expect((await req("POST", "/api/push/unregister", { endpoint: browser.endpoint }, "client-sam-002")).status).toBe(200);
    expect(rows()).toHaveLength(1);
    expect((await req("POST", "/api/push/unregister", { endpoint: browser.endpoint })).status).toBe(200);
    expect(rows()).toEqual([]);
  });

  it("needs an endpoint or token", async () => {
    expect((await req("POST", "/api/push/unregister", {})).status).toBe(400);
  });
});

describe("/api/games/:id/mute", () => {
  it("mutes and unmutes a game for this device", async () => {
    expect(await (await req("GET", "/api/games/abc234/mute")).json()).toEqual({ muted: false });
    expect((await req("POST", "/api/games/abc234/mute", { muted: true })).status).toBe(200);
    expect(await (await req("GET", "/api/games/abc234/mute")).json()).toEqual({ muted: true });
    expect(await (await req("GET", "/api/games/abc234/mute", undefined, "client-sam-002")).json()).toEqual({ muted: false });
    await req("POST", "/api/games/abc234/mute", { muted: false });
    expect(await (await req("GET", "/api/games/abc234/mute")).json()).toEqual({ muted: false });
  });

  it("404s unknown games and 400s a missing flag", async () => {
    expect((await req("POST", "/api/games/zzzz99/mute", { muted: true })).status).toBe(404);
    expect((await req("POST", "/api/games/NOT-AN-ID/mute", { muted: true })).status).toBe(404);
    expect((await req("POST", "/api/games/abc234/mute", { muted: "yes" })).status).toBe(400);
    expect((await req("POST", "/api/games/abc234/mute", { muted: true }, null)).status).toBe(401);
  });
});

describe("POST /api/push/test", () => {
  it("reports how many of this client's devices it reached", async () => {
    const res = await req("POST", "/api/push/test", {});
    expect(await res.json()).toEqual({ ok: true, devices: 0, sent: 0, failed: 0 });
  });
});
