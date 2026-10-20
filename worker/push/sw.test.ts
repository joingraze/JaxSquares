// @vitest-environment node
// Runs public/sw.js in a sandbox with a fake ServiceWorkerGlobalScope, so the
// push, notificationclick and offline-fallback handlers are exercised as written.
import { beforeAll, describe, expect, it, vi } from "vitest";

const nodeModule = (name: string): Promise<unknown> => import(/* @vite-ignore */ `node:${name}`);

type Handler = (event: Record<string, unknown>) => void;

interface FakeWindow {
  url: string;
  focus: ReturnType<typeof vi.fn>;
  postMessage: ReturnType<typeof vi.fn>;
}

let source: string;
let runInNewContext: (code: string, context: object) => unknown;

beforeAll(async () => {
  const { readFileSync } = (await nodeModule("fs")) as { readFileSync: (path: URL, enc: "utf8") => string };
  ({ runInNewContext } = (await nodeModule("vm")) as { runInNewContext: typeof runInNewContext });
  source = readFileSync(new URL("../../public/sw.js", import.meta.url), "utf8");
});

function win(path: string): FakeWindow {
  const w: FakeWindow = { url: `https://jaxsquares.com${path}`, focus: vi.fn(), postMessage: vi.fn() };
  w.focus.mockResolvedValue(w);
  return w;
}

function loadWorker(opts: { windows?: FakeWindow[]; fetch?: (req: unknown) => Promise<Response> } = {}) {
  const handlers: Record<string, Handler> = {};
  const windows = opts.windows ?? [];
  const self = {
    location: new URL("https://jaxsquares.com/sw.js"),
    addEventListener: (type: string, fn: Handler) => (handlers[type] = fn),
    skipWaiting: vi.fn(),
    registration: { showNotification: vi.fn(async () => undefined), navigationPreload: { enable: vi.fn(async () => undefined) } },
    clients: { matchAll: vi.fn(async () => windows), openWindow: vi.fn(async () => null), claim: vi.fn(async () => undefined) },
    navigator: { setAppBadge: vi.fn(async () => undefined) },
  };
  const fetchImpl = opts.fetch ?? (async () => new Response("<html>live</html>", { status: 200 }));
  runInNewContext(source, { self, URL, Response, Promise, Date, Number, Boolean, String, console, fetch: fetchImpl });

  async function fire(type: string, props: Record<string, unknown> = {}) {
    const waits: Promise<unknown>[] = [];
    let responded: Promise<Response> | undefined;
    handlers[type]({ ...props, waitUntil: (p: Promise<unknown>) => waits.push(p), respondWith: (p: Promise<Response>) => (responded = p) });
    await Promise.all(waits);
    return { response: responded ? await responded : undefined };
  }
  return { self, fire, windows };
}

const pushData = (obj: unknown) => ({ data: { json: () => obj, text: () => JSON.stringify(obj) } });
const payload = {
  title: "Big Game Night",
  body: "🎉 Your square hit at Half!",
  url: "/g/abc234",
  tag: "abc234:win:q2",
  renotify: true,
  badge: 3,
  gameId: "abc234",
  kind: "winner",
};

describe("sw.js push", () => {
  it("shows the notification, sets the app badge and tells open pages", async () => {
    const open = win("/");
    const { self, fire } = loadWorker({ windows: [open] });
    await fire("push", pushData(payload));
    expect(self.registration.showNotification).toHaveBeenCalledWith(
      "Big Game Night",
      expect.objectContaining({
        body: "🎉 Your square hit at Half!",
        tag: "abc234:win:q2",
        renotify: true,
        silent: false,
        data: { url: "/g/abc234", gameId: "abc234", kind: "winner" },
      }),
    );
    expect(self.navigator.setAppBadge).toHaveBeenCalledWith(3);
    expect(open.postMessage).toHaveBeenCalledWith({ type: "jaxsquares:push", payload });
  });

  it("still shows something for a non-JSON push (iOS revokes silent pushes)", async () => {
    const { self, fire } = loadWorker();
    await fire("push", { data: { json: () => JSON.parse("nope"), text: () => "plain text" } });
    expect(self.registration.showNotification).toHaveBeenCalledWith("JaxSquares", expect.objectContaining({ body: "plain text" }));
  });

  it("never links off-site and never renotifies without a tag", async () => {
    const { self, fire } = loadWorker();
    await fire("push", pushData({ ...payload, url: "https://evil.example.com/x", tag: "" }));
    const [, options] = self.registration.showNotification.mock.calls[0] as unknown as [string, { data: { url: string }; renotify: boolean }];
    expect(options.data.url).toBe("/");
    expect(options.renotify).toBe(false);
  });

  it("shows board chatter silently", async () => {
    const { self, fire } = loadWorker();
    await fire("push", pushData({ ...payload, quiet: true }));
    expect(self.registration.showNotification).toHaveBeenCalledWith("Big Game Night", expect.objectContaining({ silent: true }));
  });
});

describe("sw.js notificationclick", () => {
  const click = (url: string) => ({ notification: { close: vi.fn(), data: { url } } });

  it("focuses a tab already on that board", async () => {
    const board = win("/g/abc234");
    const home = win("/");
    const { self, fire } = loadWorker({ windows: [home, board] });
    const event = click("/g/abc234");
    await fire("notificationclick", event);
    expect(event.notification.close).toHaveBeenCalled();
    expect(board.focus).toHaveBeenCalled();
    expect(home.focus).not.toHaveBeenCalled();
    expect(self.clients.openWindow).not.toHaveBeenCalled();
  });

  it("routes an open app tab in place instead of reloading it", async () => {
    const home = win("/");
    const { self, fire } = loadWorker({ windows: [home] });
    await fire("notificationclick", click("/g/abc234"));
    expect(home.focus).toHaveBeenCalled();
    expect(home.postMessage).toHaveBeenCalledWith({ type: "jaxsquares:navigate", url: "/g/abc234" });
    expect(self.clients.openWindow).not.toHaveBeenCalled();
  });

  it("opens the board when the app isn't open", async () => {
    const { self, fire } = loadWorker();
    await fire("notificationclick", click("/g/abc234"));
    expect(self.clients.openWindow).toHaveBeenCalledWith("https://jaxsquares.com/g/abc234");
  });
});

describe("sw.js fetch", () => {
  const navigate = (path: string, extra: Record<string, unknown> = {}) => ({
    request: { mode: "navigate", method: "GET", url: `https://jaxsquares.com${path}` },
    preloadResponse: Promise.resolve(undefined),
    ...extra,
  });

  it("goes to the network for pages and shows the offline page when that fails", async () => {
    const online = loadWorker();
    expect(await (await online.fire("fetch", navigate("/g/abc234"))).response?.text()).toBe("<html>live</html>");

    const offline = loadWorker({ fetch: async () => Promise.reject(new TypeError("Failed to fetch")) });
    const { response } = await offline.fire("fetch", navigate("/g/abc234"));
    expect(response?.status).toBe(503);
    expect(await response?.text()).toContain("You're offline");
  });

  it("uses the navigation preload response when there is one", async () => {
    const fetchSpy = vi.fn(async () => new Response("network"));
    const { fire } = loadWorker({ fetch: fetchSpy });
    const { response } = await fire("fetch", navigate("/", { preloadResponse: Promise.resolve(new Response("preloaded")) }));
    expect(await response?.text()).toBe("preloaded");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("leaves API calls, assets and other origins alone", async () => {
    const { fire } = loadWorker();
    expect((await fire("fetch", navigate("/api/games/abc234"))).response).toBeUndefined();
    expect((await fire("fetch", { request: { mode: "cors", method: "GET", url: "https://jaxsquares.com/api/config" } })).response).toBeUndefined();
    expect((await fire("fetch", { request: { mode: "no-cors", method: "GET", url: "https://jaxsquares.com/assets/index.js" } })).response).toBeUndefined();
    expect((await fire("fetch", { request: { mode: "navigate", method: "GET", url: "https://example.com/" } })).response).toBeUndefined();
  });
});
