import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// A browser with web push: permission granted, a service worker and a push subscription.
const sub = {
  endpoint: "https://fcm.googleapis.com/fcm/send/abc",
  options: { applicationServerKey: null },
  toJSON: () => ({ endpoint: "https://fcm.googleapis.com/fcm/send/abc", keys: { p256dh: "p", auth: "a" } }),
  unsubscribe: vi.fn(async () => true),
};
// The native store (Capacitor Preferences), simulated: survives localStorage being cleared.
const nativeStore = vi.hoisted(() => new Map<string, string>());
vi.mock("./native", async (orig) => {
  const real = await orig<typeof import("./native")>();
  return {
    ...real,
    setStored: vi.fn(async (k: string, v: string) => {
      nativeStore.set(k, v);
      return real.setStored(k, v);
    }),
    removeStored: vi.fn(async (k: string) => {
      nativeStore.delete(k);
      return real.removeStored(k);
    }),
    getStored: vi.fn(async (k: string) => nativeStore.get(k) ?? real.getStored(k)),
  };
});

const reg = { pushManager: { getSubscription: vi.fn(async () => sub), subscribe: vi.fn(async () => sub) } };
const calls: string[] = [];
/** API paths that answer 503 (a flaky connection or an outage). */
const failing = new Set<string>();

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
      if (failing.has(path)) return new Response(JSON.stringify({ error: "boom" }), { status: 503, headers: { "content-type": "application/json" } });
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
  failing.clear();
  sub.unsubscribe.mockClear();
  localStorage.clear();
  nativeStore.clear();
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

  it("unsubscribes this device even when the server can't be told", async () => {
    failing.add("/push/unregister");
    await push.disablePush();
    expect(calls).toContain("/push/unregister");
    // The push service now rejects the dead endpoint, and the server drops it on its next send.
    expect(sub.unsubscribe).toHaveBeenCalledTimes(1);
    expect(push.isPushOff()).toBe(true);
  });

  it("doesn't claim to be off when this device is still subscribed and registered", async () => {
    failing.add("/push/unregister");
    sub.unsubscribe.mockRejectedValueOnce(new Error("no"));
    await expect(push.disablePush()).rejects.toThrow("boom");
    expect(push.isPushOff()).toBe(false);
  });

  it("re-registers on sync while on (resets the server's badge count)", async () => {
    calls.length = 0;
    await push.syncPush(true);
    expect(calls).toContain("/push/register");
  });
});

describe("the web badge", () => {
  it("resets the server's count whenever the app comes back and clears the badge", async () => {
    const clearAppBadge = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clearAppBadge", { configurable: true, value: clearAppBadge });
    push.initPush();
    await push.syncPush(); // whatever the first open started
    calls.length = 0;
    // Opened moments ago, a push came in, and now the app is back within the minute.
    document.dispatchEvent(new Event("visibilitychange"));
    await push.syncPush();
    expect(clearAppBadge).toHaveBeenCalled();
    // Otherwise the next push would count the one just seen: badge 2 for one new thing.
    expect(calls).toContain("/push/register");
  });
});

describe("the off flag survives iOS clearing WebView storage", () => {
  it("is mirrored to the native store", async () => {
    await push.disablePush();
    expect(nativeStore.get("jaxsquares.push.off")).toBe("1");
    await push.enablePush();
    expect(nativeStore.has("jaxsquares.push.off")).toBe(false);
  });

  it("is restored on the next launch before the silent re-sync", async () => {
    await push.disablePush();
    // iOS wiped localStorage between launches; Preferences still has the flag.
    localStorage.clear();
    vi.resetModules();
    const fresh = await import("./push");
    expect(fresh.isPushOff()).toBe(false);
    calls.length = 0;
    await fresh.syncPush(true);
    expect(fresh.isPushOff()).toBe(true);
    expect(calls).not.toContain("/push/register");
  });
});
