// @vitest-environment node
// End to end through notify(): real D1 SQL (node:sqlite), real VAPID signing and
// encryption, a real RS256 service account; only the network and core's
// getGame/getMembers are faked.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Game } from "../../shared/types";
import type { Member } from "../db";
import type { Env } from "../env";
import { createTestD1, type TestD1 } from "../payments/testD1";
import { resetSiblings } from "./coalesce";
import { GOOGLE_TOKEN_URL, resetTokenCache } from "./fcm";
import { notify } from "./notify";
import { setMuted, upsertSubscription } from "./store";
import { HOST, decryptWebPush, makeBrowserSubscription, makeGame, makePlayer, makeServiceAccount, makeVapidKeys, pid } from "./testFixtures";

const db = vi.hoisted(() => ({ game: null as Game | null, players: [] as Member[], fail: false }));
vi.mock("../db", () => ({
  getGame: vi.fn(async () => {
    if (db.fail) throw new Error("D1 is down");
    return db.game;
  }),
  getMembers: vi.fn(async () => db.players),
}));

const JAX = "client-jax-001";
const SAM = "client-sam-002";
const LEE = "client-lee-003";
const FCM_SEND = "https://fcm.googleapis.com/v1/projects/jaxsquares-test/messages:send";

let t: TestD1;
let env: Env;
let vapid: { publicKey: string; privateKey: string };
let saJson: string;
let hostBrowser: Awaited<ReturnType<typeof makeBrowserSubscription>>;
let jaxBrowser: Awaited<ReturnType<typeof makeBrowserSubscription>>;
let goneBrowser: Awaited<ReturnType<typeof makeBrowserSubscription>>;

/** What the fake network saw, decoded. */
let sent: { web: { endpoint: string; payload: Record<string, unknown> }[]; fcm: { token: string; body: string; badge: number }[] };
let fcmReply: (token: string) => Response;

beforeAll(async () => {
  vapid = await makeVapidKeys();
  saJson = (await makeServiceAccount()).json;
  hostBrowser = await makeBrowserSubscription("https://web.push.apple.com/host-device");
  jaxBrowser = await makeBrowserSubscription("https://fcm.googleapis.com/fcm/send/jax-device");
  goneBrowser = await makeBrowserSubscription("https://updates.push.services.mozilla.com/wpush/v2/gone-device");
});

beforeEach(async () => {
  t = await createTestD1(["migrations/0002_core_model.sql", "migrations/0004_push.sql"]);
  t.query(
    `INSERT INTO games (id, name, team_x, team_y, format, periods, host_client_id, admin_token, created_at, updated_at)
     VALUES ('abc234', 'Super Bowl LX', '{}', '{}', '{}', '[]', ?, 'tok', 0, 0)`,
    HOST,
  );
  env = {
    DB: t.d1,
    VAPID_PUBLIC_KEY: vapid.publicKey,
    VAPID_PRIVATE_KEY: vapid.privateKey,
    VAPID_SUBJECT: "mailto:hello@jaxsquares.com",
    FCM_SERVICE_ACCOUNT: saJson,
  } as Env;
  db.game = makeGame();
  db.players = [makePlayer(HOST, "Jordan"), makePlayer(JAX, "Jax"), makePlayer(SAM, "Sam"), makePlayer(LEE, "Lee")];
  db.fail = false;
  sent = { web: [], fcm: [] };
  fcmReply = () => Response.json({ name: "projects/jaxsquares-test/messages/1" });

  const browsers = [hostBrowser, jaxBrowser, goneBrowser];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url === GOOGLE_TOKEN_URL) return Response.json({ access_token: "ya29.test", expires_in: 3599 });
      if (url === FCM_SEND) {
        const { message } = JSON.parse(String(init?.body));
        sent.fcm.push({ token: message.token, body: message.notification.body, badge: message.apns.payload.aps.badge });
        return fcmReply(message.token);
      }
      const browser = browsers.find((b) => b.endpoint === url);
      if (!browser) throw new Error(`unexpected fetch ${url}`);
      const payload = JSON.parse(await decryptWebPush(new Uint8Array(init!.body as Uint8Array), browser));
      sent.web.push({ endpoint: url, payload });
      return new Response(null, { status: url === goneBrowser.endpoint ? 410 : 201 });
    }),
  );

  // Host: iPhone home-screen web app. Jax: Chrome + a dead Firefox. Sam: iOS app. Lee: Android app.
  const webReg = (b: typeof hostBrowser) => ({ platform: "web" as const, key: b.endpoint, p256dh: b.p256dh, auth: b.auth });
  await upsertSubscription(t.d1, HOST, webReg(hostBrowser), 1);
  await upsertSubscription(t.d1, JAX, webReg(jaxBrowser), 1);
  await upsertSubscription(t.d1, JAX, webReg(goneBrowser), 1);
  await upsertSubscription(t.d1, SAM, { platform: "ios", key: "sam-ios-token-000000000000000000000" }, 1);
  await upsertSubscription(t.d1, LEE, { platform: "android", key: "lee-android-token-0000000000000000" }, 1);
});

afterEach(() => {
  vi.unstubAllGlobals();
  resetTokenCache();
  resetSiblings();
});

const keys = () => t.query<{ k: string; unread: number }>(`SELECT endpoint_or_token AS k, unread FROM push_subscriptions ORDER BY k`);

describe("notify", () => {
  it("sends each player their own copy on every device and records the results", async () => {
    await notify(env, "abc234", { kind: "winner", periodKey: "q2", label: "Half", playerIds: [pid(JAX)] });

    const jax = sent.web.find((w) => w.endpoint === jaxBrowser.endpoint)!.payload;
    expect(jax).toMatchObject({ title: "Super Bowl LX", body: "🎉 Your square hit at Half!", url: "/g/abc234", badge: 1 });
    expect(sent.web.find((w) => w.endpoint === hostBrowser.endpoint)!.payload.body).toBe("Jax's square hit at Half.");
    expect(sent.fcm.map((f) => [f.token, f.body]).sort()).toEqual([
      ["lee-android-token-0000000000000000", "Jax's square hit at Half."],
      ["sam-ios-token-000000000000000000000", "Jax's square hit at Half."],
    ]);

    // The dead Firefox endpoint (410) is removed; everything delivered counts toward the badge.
    expect(keys().map((r) => r.k)).not.toContain(goneBrowser.endpoint);
    expect(keys().every((r) => r.unread === 1)).toBe(true);
  });

  it("skips muted players and the actor", async () => {
    await setMuted(t.d1, "abc234", SAM, true, 1);
    await notify(env, "abc234", { kind: "numbers-drawn", actor: pid(HOST) });
    expect(sent.web.map((w) => w.endpoint)).not.toContain(hostBrowser.endpoint);
    expect(sent.fcm.map((f) => f.token)).toEqual(["lee-android-token-0000000000000000"]);
  });

  it("drops tokens FCM reports as UNREGISTERED and keeps ones that hit a transient error", async () => {
    fcmReply = (token) =>
      token.startsWith("sam")
        ? Response.json(
            { error: { code: 404, status: "NOT_FOUND", details: [{ "@type": "type.googleapis.com/google.firebase.fcm.v1.FcmError", errorCode: "UNREGISTERED" }] } },
            { status: 404 },
          )
        : Response.json({ error: { code: 503, status: "UNAVAILABLE" } }, { status: 503 });
    await notify(env, "abc234", { kind: "final" });
    const left = keys();
    expect(left.map((r) => r.k)).not.toContain("sam-ios-token-000000000000000000000");
    expect(left.find((r) => r.k.startsWith("lee"))).toEqual({ k: "lee-android-token-0000000000000000", unread: 0 });
  });

  it("counts the badge up until the device opens the app again", async () => {
    await notify(env, "abc234", { kind: "final" });
    await notify(env, "abc234", { kind: "numbers-drawn" });
    expect(sent.fcm.filter((f) => f.token.startsWith("sam")).map((f) => f.badge)).toEqual([1, 2]);
    await upsertSubscription(t.d1, SAM, { platform: "ios", key: "sam-ios-token-000000000000000000000" }, 99);
    await notify(env, "abc234", { kind: "game-starting" });
    expect(sent.fcm.filter((f) => f.token.startsWith("sam")).map((f) => f.badge)).toEqual([1, 2, 1]);
  });

  it("only uses the services that are configured", async () => {
    env.FCM_SERVICE_ACCOUNT = undefined;
    await notify(env, "abc234", { kind: "final" });
    expect(sent.fcm).toEqual([]);
    expect(sent.web.length).toBeGreaterThan(0);
    // Native devices are kept for when FCM is set up.
    expect(keys().map((r) => r.k)).toContain("sam-ios-token-000000000000000000000");
  });

  it("does nothing (not even a DB read) when push isn't configured at all", async () => {
    const { getGame } = await import("../db");
    vi.mocked(getGame).mockClear();
    await notify({ DB: t.d1 } as Env, "abc234", { kind: "final" });
    expect(getGame).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("never throws, even when the database does", async () => {
    db.fail = true;
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(notify(env, "abc234", { kind: "final" })).resolves.toBeUndefined();
    expect(errors).toHaveBeenCalled();
    errors.mockRestore();
  });

  it("buzzes once at kickoff when kickoff also drew the numbers", async () => {
    db.game = makeGame({ lockedAt: Date.now() });
    await Promise.all([notify(env, "abc234", { kind: "game-starting" }), notify(env, "abc234", { kind: "numbers-drawn" })]);
    const bodies = sent.fcm.filter((f) => f.token.startsWith("sam")).map((f) => f.body);
    expect(bodies).toEqual(["🏈 Kickoff! Numbers are in. Find your squares."]);
  });

  it("lets the last period's push stand in for the separate final push", async () => {
    await Promise.all([
      notify(env, "abc234", { kind: "winner", periodKey: "final", label: "Final", playerIds: [pid(JAX)] }),
      notify(env, "abc234", { kind: "final" }),
    ]);
    expect(sent.fcm.map((f) => f.body)).toEqual([
      "🏁 Jax's square hit at the Final. See who won each quarter.",
      "🏁 Jax's square hit at the Final. See who won each quarter.",
    ]);
  });

  it("still sends numbers-drawn on its own (host draws before kickoff)", async () => {
    await notify(env, "abc234", { kind: "numbers-drawn" });
    expect(sent.fcm).toHaveLength(2);
  });

  it("ignores draft boards", async () => {
    db.game = makeGame({ status: "draft" });
    await notify(env, "abc234", { kind: "board-full" });
    expect(fetch).not.toHaveBeenCalled();
  });
});
