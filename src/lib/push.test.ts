import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// A browser with web push: permission granted, a service worker and a push subscription.
const sub = {
  endpoint: "https://fcm.googleapis.com/fcm/send/abc",
  options: { applicationServerKey: null },
  toJSON: () => ({ endpoint: "https://fcm.googleapis.com/fcm/send/abc", keys: { p256dh: "p", auth: "a" } }),
  unsubscribe: vi.fn(async () => true),
};
const reg = { pushManager: { getSubscription: vi.fn(async () => sub), subscribe: vi.fn(async () => sub) } };
const calls: string[] = [];

beforeAll(() => {
  vi.stubGlobal("PushManager", class {});
  vi.stubGlobal("Notification", { permission: "granted", requestPermission: vi.fn(async () => "granted") });
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: {
      register: vi.fn(async () => reg),
      ready: Promise.resolve(reg),
      getRegistration: vi.fn(async () => reg),
      addEventListener: vi.fn(),
    },
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const path = String(url).replace(/^.*\/api/, "");
      calls.push(path);
      const body = path === "/config" ? { vapidPublicKey: "BAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" } : { ok: true, sent: 1 };
      return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
    }),
  );
});

afterAll(() => {
  vi.unstubAllGlobals();
});

beforeEach(() => {
  calls.length = 0;
  localStorage.clear();
});

const push = await import("./push");

describe("turning notifications off on this device", () => {
  it("sticks: the silent re-sync doesn't turn them back on", async () => {
    expect(push.isPushOff()).toBe(false);
    await push.disablePush();
    expect(push.isPushOff()).toBe(true);
    expect(calls).toContain("/push/unregister");
    // The system permission is still granted, but nothing re-registers.
    calls.length = 0;
    await push.syncPush(true);
    expect(calls).not.toContain("/push/register");
  });

  it("clears when turned back on from a tap", async () => {
    await push.disablePush();
    calls.length = 0;
    expect(await push.enablePush()).toBe("granted");
    expect(push.isPushOff()).toBe(false);
    expect(calls).toContain("/push/register");
  });

  it("re-registers on sync while on (resets the server's badge count)", async () => {
    calls.length = 0;
    await push.syncPush(true);
    expect(calls).toContain("/push/register");
  });
});
