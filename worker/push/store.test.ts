// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { createTestD1, type TestD1 } from "../payments/testD1";
import {
  MAX_DEVICES_PER_CLIENT,
  applyOutcomes,
  deleteSubscription,
  isMuted,
  setMuted,
  subscriptionsFor,
  subscriptionsForClient,
  upsertSubscription,
  type ParsedRegistration,
} from "./store";

let t: TestD1;

function insertGame(id: string) {
  t.query(
    `INSERT INTO games (id, name, team_x, team_y, format, periods, host_client_id, admin_token, created_at, updated_at)
     VALUES (?, 'Board', '{"name":"A"}', '{"name":"B"}', '{}', '[]', 'host-client-0001', 'tok', 0, 0)`,
    id,
  );
}

const web = (n: number): ParsedRegistration => ({
  platform: "web",
  key: `https://fcm.googleapis.com/fcm/send/endpoint-${n}`,
  p256dh: "p256dh",
  auth: "auth",
});
const ios = (token: string): ParsedRegistration => ({ platform: "ios", key: token });

beforeEach(async () => {
  t = await createTestD1(["migrations/0002_core_model.sql", "migrations/0004_push.sql"]);
  insertGame("game0001");
});

describe("push_subscriptions", () => {
  it("stores web keys and native tokens", async () => {
    await upsertSubscription(t.d1, "client-a-0001", web(1), 100);
    await upsertSubscription(t.d1, "client-a-0001", ios("ios-token-1"), 100);
    const rows = await subscriptionsForClient(t.d1, "client-a-0001");
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.platform === "web")).toMatchObject({ p256dh: "p256dh", auth: "auth", unread: 0 });
    expect(rows.find((r) => r.platform === "ios")).toMatchObject({ endpoint_or_token: "ios-token-1", p256dh: null, auth: null });
  });

  it("re-registering resets the badge count and can move a device to a new clientId", async () => {
    await upsertSubscription(t.d1, "client-a-0001", ios("ios-token-1"), 100);
    await applyOutcomes(t.d1, [{ key: "ios-token-1", outcome: "ok" }], 200);
    await applyOutcomes(t.d1, [{ key: "ios-token-1", outcome: "ok" }], 300);
    expect(t.query(`SELECT unread, last_ok_at FROM push_subscriptions`)).toEqual([{ unread: 2, last_ok_at: 300 }]);

    await upsertSubscription(t.d1, "client-b-0002", ios("ios-token-1"), 400);
    expect(t.query(`SELECT client_id, unread, created_at, updated_at FROM push_subscriptions`)).toEqual([
      { client_id: "client-b-0002", unread: 0, created_at: 100, updated_at: 400 },
    ]);
  });

  it(`keeps only the ${MAX_DEVICES_PER_CLIENT} most recently registered devices per client`, async () => {
    for (let i = 0; i < MAX_DEVICES_PER_CLIENT + 3; i++) await upsertSubscription(t.d1, "client-a-0001", web(i), 1000 + i);
    const keys = (await subscriptionsForClient(t.d1, "client-a-0001")).map((r) => r.endpoint_or_token);
    expect(keys).toHaveLength(MAX_DEVICES_PER_CLIENT);
    expect(keys).not.toContain(web(0).key);
    expect(keys).toContain(web(MAX_DEVICES_PER_CLIENT + 2).key);
  });

  it("only lets a client remove its own device", async () => {
    await upsertSubscription(t.d1, "client-a-0001", ios("ios-token-1"), 100);
    await deleteSubscription(t.d1, "client-b-0002", "ios-token-1");
    expect(await subscriptionsForClient(t.d1, "client-a-0001")).toHaveLength(1);
    await deleteSubscription(t.d1, "client-a-0001", "ios-token-1");
    expect(await subscriptionsForClient(t.d1, "client-a-0001")).toHaveLength(0);
  });

  it("deletes devices that are gone and leaves failed ones alone", async () => {
    await upsertSubscription(t.d1, "client-a-0001", ios("tok-ok"), 100);
    await upsertSubscription(t.d1, "client-a-0001", ios("tok-gone"), 100);
    await upsertSubscription(t.d1, "client-a-0001", ios("tok-error"), 100);
    await applyOutcomes(
      t.d1,
      [
        { key: "tok-ok", outcome: "ok" },
        { key: "tok-gone", outcome: "gone" },
        { key: "tok-error", outcome: "error" },
      ],
      500,
    );
    expect(t.query(`SELECT endpoint_or_token AS k, unread, last_ok_at FROM push_subscriptions ORDER BY k`)).toEqual([
      { k: "tok-error", unread: 0, last_ok_at: null },
      { k: "tok-ok", unread: 1, last_ok_at: 500 },
    ]);
  });

  it("rejects unknown platforms at the schema level", () => {
    expect(() =>
      t.query(`INSERT INTO push_subscriptions (endpoint_or_token, client_id, platform, created_at, updated_at) VALUES ('x', 'c', 'pager', 0, 0)`),
    ).toThrow();
  });
});

describe("subscriptionsFor", () => {
  it("returns the players' devices minus anyone who muted the game", async () => {
    await upsertSubscription(t.d1, "client-a-0001", web(1), 100);
    await upsertSubscription(t.d1, "client-b-0002", ios("tok-b"), 100);
    await upsertSubscription(t.d1, "client-c-0003", ios("tok-c"), 100);
    await setMuted(t.d1, "game0001", "client-b-0002", true, 100);
    const rows = await subscriptionsFor(t.d1, "game0001", ["client-a-0001", "client-b-0002"]);
    expect(rows.map((r) => r.client_id)).toEqual(["client-a-0001"]);
  });

  it("handles boards with more players than D1 allows bound parameters", async () => {
    const ids = Array.from({ length: 205 }, (_, i) => `client-${String(i).padStart(4, "0")}`);
    for (const [i, id] of ids.entries()) await upsertSubscription(t.d1, id, ios(`tok-${i}`), 100);
    const rows = await subscriptionsFor(t.d1, "game0001", ids);
    expect(rows).toHaveLength(205);
    expect(await subscriptionsFor(t.d1, "game0001", [])).toEqual([]);
  });
});

describe("game_mutes", () => {
  it("mutes idempotently and unmutes", async () => {
    await setMuted(t.d1, "game0001", "client-a-0001", true, 100);
    await setMuted(t.d1, "game0001", "client-a-0001", true, 200);
    expect(await isMuted(t.d1, "game0001", "client-a-0001")).toBe(true);
    await setMuted(t.d1, "game0001", "client-a-0001", false, 300);
    expect(await isMuted(t.d1, "game0001", "client-a-0001")).toBe(false);
  });

  it("goes away with the game", async () => {
    await setMuted(t.d1, "game0001", "client-a-0001", true, 100);
    t.query(`DELETE FROM games WHERE id = 'game0001'`);
    expect(t.query(`SELECT * FROM game_mutes`)).toEqual([]);
  });
});
