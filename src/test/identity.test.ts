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
  it("parses /g/<id>?host=<token>", () => {
    expect(id.parseHostLink("/g/abc", "?host=t0k")).toEqual({ gameId: "abc", token: "t0k" });
    expect(id.parseHostLink("/g/abc/", "?x=1&host=t")).toEqual({ gameId: "abc", token: "t" });
    expect(id.parseHostLink("/new", "?host=t")).toBeNull();
    expect(id.parseHostLink("/g/abc", "?host=")).toBeNull();
    expect(id.parseHostLink("/g/abc", "")).toBeNull();
  });

  it("captures the token and returns the search string without it", () => {
    expect(id.captureHostLink("/g/abc", "?host=secret&utm=x")).toBe("?utm=x");
    expect(id.getAdminToken("abc")).toBe("secret");
    expect(id.captureHostLink("/g/abc", "?host=secret")).toBe("");
    expect(id.captureHostLink("/", "?host=secret")).toBeNull();
  });

  it("builds a host link only on the host's device", () => {
    expect(id.hostLinkUrl("abc", "https://jaxsquares.com")).toBeNull();
    id.saveAdminToken("abc", "t/k");
    expect(id.hostLinkUrl("abc", "https://jaxsquares.com")).toBe("https://jaxsquares.com/g/abc?host=t%2Fk");
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
