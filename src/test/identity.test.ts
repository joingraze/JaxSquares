import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as Identity from "../lib/identity";

// identity.ts caches the parsed profile, so each test gets a fresh module.
let id: typeof Identity;

beforeEach(async () => {
  localStorage.clear();
  vi.resetModules();
  id = await import("../lib/identity");
});

function memoryStore(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getStored: vi.fn(async (k: string) => data.get(k) ?? null),
    setStored: vi.fn(async (k: string, v: string) => {
      data.set(k, v);
    }),
  };
}

describe("client id", () => {
  it("is generated once and persisted under jaxsquares.clientId", () => {
    const a = id.getClientId();
    expect(a).toMatch(/^[0-9a-f-]{36}$/);
    expect(localStorage.getItem("jaxsquares.clientId")).toBe(a);
    expect(id.getClientId()).toBe(a);
  });
});

describe("player id", () => {
  it("is the public hash of the clientId, stable and never the clientId itself", async () => {
    const { derivePlayerId } = await import("../../shared/playerId");
    const clientId = id.getClientId();
    const pid = id.getPlayerId();
    expect(pid).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(pid).not.toBe(clientId);
    expect(pid).toBe(await derivePlayerId(clientId));
    expect(id.getPlayerId()).toBe(pid);
  });

  it("is computed during hydration and follows the native clientId", async () => {
    const { derivePlayerId } = await import("../../shared/playerId");
    localStorage.setItem("jaxsquares.clientId", "local-id-0001");
    const before = id.getPlayerId();
    await id.hydrateIdentity(memoryStore({ "jaxsquares.clientId": "native-id-0001" }));
    expect(id.getPlayerId()).toBe(await derivePlayerId("native-id-0001"));
    expect(id.getPlayerId()).not.toBe(before);
  });
});

describe("profile", () => {
  it("fills in a fun default color and emoji, with no name yet", () => {
    const p = id.getProfile();
    expect(p.name).toBe("");
    expect(id.PLAYER_COLORS.map((c) => c.value)).toContain(p.color);
    expect(id.PLAYER_EMOJIS).toContain(p.emoji);
    expect(id.hasProfileName()).toBe(false);
    expect(id.getProfile()).toBe(p); // stable for useSyncExternalStore
  });

  it("saves changes, trims names to the server limit and notifies subscribers", () => {
    const listener = vi.fn();
    id.subscribeIdentity(listener);
    const next = id.setProfile({ name: "A very long name that keeps going", emoji: "🦖" });
    expect(next.name).toHaveLength(id.NAME_MAX_LENGTH);
    expect(next.emoji).toBe("🦖");
    expect(listener).toHaveBeenCalledTimes(1);
    expect(JSON.parse(localStorage.getItem("jaxsquares.profile")!)).toMatchObject({ emoji: "🦖" });
    expect(id.hasProfileName()).toBe(true);
  });

  it("ignores a corrupt stored profile", () => {
    localStorage.setItem("jaxsquares.profile", "{not json");
    expect(id.getProfile().name).toBe("");
  });
});

describe("native mirroring of new values", () => {
  it("a new clientId and an admin token are also written to the native store", async () => {
    vi.resetModules();
    const setStored = vi.fn(async () => {});
    vi.doMock("../lib/native", () => ({ getStored: vi.fn(async () => null), setStored, removeStored: vi.fn(async () => {}) }));
    try {
      const fresh = await import("../lib/identity");
      const clientId = fresh.getClientId();
      fresh.saveAdminToken("g9", "tok-9");
      expect(setStored).toHaveBeenCalledWith("jaxsquares.clientId", clientId);
      expect(setStored).toHaveBeenCalledWith("jaxsquares.admin.g9", "tok-9");
    } finally {
      vi.doUnmock("../lib/native");
    }
  });
});

describe("host tokens and known games", () => {
  it("stores admin tokens per game and remembers the game", () => {
    id.saveAdminToken("g1", "tok-1");
    expect(localStorage.getItem("jaxsquares.admin.g1")).toBe("tok-1");
    expect(id.getAdminToken("g1")).toBe("tok-1");
    expect(id.isHostOf("g1")).toBe(true);
    expect(id.isHostOf("g2")).toBe(false);
    expect(id.getKnownGames()).toEqual(["g1"]);
  });

  it("keeps known games most-recent-first without duplicates", () => {
    id.rememberGame("a");
    id.rememberGame("b");
    id.rememberGame("a");
    expect(id.getKnownGames()).toEqual(["a", "b"]);
    id.forgetGame("a");
    expect(id.getKnownGames()).toEqual(["b"]);
  });

  it("forgetting a game drops its admin token", () => {
    id.saveAdminToken("g1", "tok");
    id.forgetGame("g1");
    expect(id.getAdminToken("g1")).toBeNull();
  });
});

describe("host links", () => {
  const none = { search: "", hash: "" };

  it("parses /g/<id>#host=<token>, and the older /g/<id>?host=<token>", () => {
    expect(id.parseHostLink("/g/abcd", "", "#host=t0k")).toEqual({ gameId: "abcd", token: "t0k" });
    expect(id.parseHostLink("/g/abcd", "?host=t0k")).toEqual({ gameId: "abcd", token: "t0k" });
    expect(id.parseHostLink("/g/abcd/", "?x=1&host=t")).toEqual({ gameId: "abcd", token: "t" });
    expect(id.parseHostLink("/g/abcd", "?host=old", "#host=new")).toEqual({ gameId: "abcd", token: "new" });
    expect(id.parseHostLink("/new", "?host=t")).toBeNull();
    expect(id.parseHostLink("/g/abcd", "?host=")).toBeNull();
    expect(id.parseHostLink("/g/abcd", "", "#host=")).toBeNull();
    expect(id.parseHostLink("/g/abcd", "", "#squares")).toBeNull();
    expect(id.parseHostLink("/g/abcd", "")).toBeNull();
  });

  it("ignores a malformed or non-board id instead of throwing", () => {
    // Served by the SPA fallback; decodeURIComponent("%E0") throws, which used to blank the app on startup.
    expect(() => id.parseHostLink("/g/%E0", "?host=1")).not.toThrow();
    expect(id.parseHostLink("/g/%E0", "?host=1")).toBeNull();
    expect(id.captureHostLink("/g/%E0", "?host=1")).toBeNull();
    expect(id.captureHostLink("/g/%E0", "", "#host=1")).toBeNull();
    for (const bad of ["/g/ab", "/g/a%2Fb%2Fcd", "/g/abcd%20x", "/g/" + "a".repeat(17)]) expect(id.parseHostLink(bad, "?host=t")).toBeNull();
    expect(localStorage.length).toBe(0);
    // A board code typed in capitals is the same board (GameView lowercases it too).
    expect(id.parseHostLink("/g/ABCD", "", "#host=t")).toEqual({ gameId: "abcd", token: "t" });
  });

  it("captures the token and returns the search and fragment without it", () => {
    expect(id.captureHostLink("/g/abcd", "?utm=x", "#host=secret")).toEqual({ search: "?utm=x", hash: "" });
    expect(id.getAdminToken("abcd")).toBe("secret");
    expect(id.captureHostLink("/g/abcd", "?host=secret&utm=x")).toEqual({ search: "?utm=x", hash: "" });
    expect(id.captureHostLink("/g/abcd", "?host=secret", "#top")).toEqual({ search: "", hash: "#top" });
    expect(id.captureHostLink("/g/abcd", "", "#host=secret&a=1")).toEqual({ search: "", hash: "#a=1" });
    expect(id.captureHostLink("/", "?host=secret")).toBeNull();
  });

  it("never overwrites a token this device already holds", () => {
    // Anyone with the invite can post /g/<id>#host=x; the host tapping it must keep control.
    id.saveAdminToken("abcd", "REAL-TOKEN");
    expect(id.captureHostLink("/g/abcd", "?host=x")).toEqual(none);
    expect(id.captureHostLink("/g/abcd", "", "#host=x")).toEqual(none);
    expect(id.getAdminToken("abcd")).toBe("REAL-TOKEN");
    expect(localStorage.getItem("jaxsquares.admin.abcd")).toBe("REAL-TOKEN");
    expect(id.hostLinkUrl("abcd", "https://app")).toBe("https://app/g/abcd#host=REAL-TOKEN");
    // The link's token is only kept aside, for the API client to try if the held one is refused.
    expect(id.linkAdminToken("abcd")).toBe("x");
    id.settleLinkAdminToken("abcd", false);
    expect(id.linkAdminToken("abcd")).toBeNull();
    expect(id.getAdminToken("abcd")).toBe("REAL-TOKEN");
    // The same token again is a no-op.
    id.captureHostLink("/g/abcd", "?host=REAL-TOKEN");
    expect(id.linkAdminToken("abcd")).toBeNull();
  });

  it("drops a link's token the server refuses on a device that held none", async () => {
    // A crafted #host=x would otherwise give a player host tools that all answer 403, and skip their join sheet.
    const listener = vi.fn();
    id.subscribeIdentity(listener);
    const check = vi.fn(async (_game: string, token: string) => token === "real");
    id.captureHostLink("/g/abcd", "", "#host=x", check);
    expect(id.getAdminToken("abcd")).toBe("x"); // used at once, so a real host's tools show straight away
    await vi.waitFor(() => expect(id.getAdminToken("abcd")).toBeNull());
    expect(check).toHaveBeenCalledWith("abcd", "x");
    expect(localStorage.getItem("jaxsquares.admin.abcd")).toBeNull();
    expect(listener).toHaveBeenCalled();

    // The real one stays, and so does one the server couldn't be asked about (offline).
    id.captureHostLink("/g/efgh", "", "#host=real", check);
    id.captureHostLink("/g/ijkl", "", "#host=maybe", async () => null);
    await new Promise((r) => setTimeout(r, 0));
    expect(id.getAdminToken("efgh")).toBe("real");
    expect(id.getAdminToken("ijkl")).toBe("maybe");
  });

  it("builds a host link only on the host's device, with the token in the fragment", () => {
    // The fragment never reaches the server, so the token stays out of the Worker's request logs.
    expect(id.hostLinkUrl("abcd", "https://jaxsquares.com")).toBeNull();
    id.saveAdminToken("abcd", "t/k");
    const url = id.hostLinkUrl("abcd", "https://jaxsquares.com")!;
    expect(url).toBe("https://jaxsquares.com/g/abcd#host=t%2Fk");
    const parsed = new URL(url);
    expect(parsed.search).toBe("");
    expect(id.parseHostLink(parsed.pathname, parsed.search, parsed.hash)).toEqual({ gameId: "abcd", token: "t/k" });
  });
});

describe("host link opened while the native store is still loading", () => {
  it("waits for hydration, so a token held only in the native store is never overwritten", async () => {
    // iOS evicted the WebView's localStorage and the native store is slow (main.tsx stops waiting after 1.5 s).
    vi.resetModules();
    const native = new Map<string, string>([
      ["jaxsquares.clientId", "native-client-id"],
      ["jaxsquares.games", JSON.stringify(["abcd"])],
      ["jaxsquares.admin.abcd", "REAL-TOKEN"],
    ]);
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    vi.doMock("../lib/native", () => ({
      getStored: vi.fn(async (k: string) => {
        await gate;
        return native.get(k) ?? null;
      }),
      setStored: vi.fn(async (k: string, v: string) => {
        native.set(k, v);
      }),
      removeStored: vi.fn(async (k: string) => {
        native.delete(k);
      }),
    }));
    try {
      const fresh = await import("../lib/identity");
      const hydrated = fresh.hydrateIdentity();
      expect(fresh.captureHostLink("/g/abcd", "", "#host=x")).toEqual({ search: "", hash: "" });
      release();
      await hydrated;
      await vi.waitFor(() => expect(fresh.linkAdminToken("abcd")).toBe("x"));
      expect(fresh.getAdminToken("abcd")).toBe("REAL-TOKEN");
      expect(native.get("jaxsquares.admin.abcd")).toBe("REAL-TOKEN");
    } finally {
      vi.doUnmock("../lib/native");
    }
  });
});

describe("hydrateIdentity (native store mirror)", () => {
  it("restores everything from the native store when localStorage was wiped", async () => {
    const store = memoryStore({
      "jaxsquares.clientId": "native-client-id",
      "jaxsquares.profile": JSON.stringify({ name: "Jax", color: "#ff6b35", emoji: "🔥" }),
      "jaxsquares.games": JSON.stringify(["g1"]),
      "jaxsquares.admin.g1": "host-token",
    });
    await id.hydrateIdentity(store);
    expect(id.getClientId()).toBe("native-client-id");
    expect(id.getProfile()).toEqual({ name: "Jax", color: "#ff6b35", emoji: "🔥" });
    expect(id.getAdminToken("g1")).toBe("host-token");
  });

  it("the native store wins over a different local client id", async () => {
    localStorage.setItem("jaxsquares.clientId", "local-id");
    const store = memoryStore({ "jaxsquares.clientId": "native-id" });
    await id.hydrateIdentity(store);
    expect(id.getClientId()).toBe("native-id");
  });

  it("seeds the native store from local values on first run", async () => {
    localStorage.setItem("jaxsquares.clientId", "local-id");
    const store = memoryStore();
    await id.hydrateIdentity(store);
    expect(store.data.get("jaxsquares.clientId")).toBe("local-id");
  });

  it("creates the clientId once on a fresh install and saves it to the native store", async () => {
    const store = memoryStore();
    await id.hydrateIdentity(store);
    const created = id.getClientId();
    expect(created).toMatch(/^[0-9a-f-]{32,36}$/);
    expect(store.data.get("jaxsquares.clientId")).toBe(created);
    expect(store.setStored.mock.calls.filter(([k]) => k === "jaxsquares.clientId")).toHaveLength(1);
  });

  it("merges known games from both sides", async () => {
    localStorage.setItem("jaxsquares.games", JSON.stringify(["local-only", "both"]));
    const store = memoryStore({ "jaxsquares.games": JSON.stringify(["native-only", "both"]) });
    await id.hydrateIdentity(store);
    expect(id.getKnownGames()).toEqual(["native-only", "both", "local-only"]);
    expect(JSON.parse(store.data.get("jaxsquares.games")!)).toEqual(["native-only", "both", "local-only"]);
  });

  it("notifies profile subscribers after hydrating", async () => {
    const listener = vi.fn();
    id.subscribeIdentity(listener);
    await id.hydrateIdentity(memoryStore());
    expect(listener).toHaveBeenCalled();
  });
});
