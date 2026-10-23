import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { derivePlayerIdSync } from "../../shared/playerId";
import type { AccountInfo, MeResponse } from "../../shared/types";
import type * as Api from "../lib/api";
import type * as Auth from "../lib/auth";
import type * as Identity from "../lib/identity";

// Each test gets fresh modules: identity.ts caches what it parsed.
let id: typeof Identity;
let auth: typeof Auth;
let api: typeof Api;
const fetchMock = vi.fn();

const CANONICAL = "CanonicalPlayerId00001";
const ACCOUNT: AccountInfo = { provider: "apple", email: "maya@privaterelay.appleid.com", name: "Maya", since: 1_760_000_000_000 };

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

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

/** The request the app last sent to `path`. */
function sent(path: string): { url: string; init: RequestInit; headers: Record<string, string>; body: unknown } {
  const call = [...fetchMock.mock.calls].reverse().find(([url]) => String(url).endsWith(`/api${path}`));
  if (!call) throw new Error(`no request to ${path}`);
  const init = (call[1] ?? {}) as RequestInit;
  return { url: String(call[0]), init, headers: init.headers as Record<string, string>, body: init.body ? JSON.parse(String(init.body)) : undefined };
}

beforeEach(async () => {
  localStorage.clear();
  vi.resetModules();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  id = await import("../lib/identity");
  auth = await import("../lib/auth");
  api = await import("../lib/api");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the player id when signed in", () => {
  it("is the server-confirmed canonical id, kept across launches, and back to the derived one when signed out", async () => {
    const own = id.getPlayerId();
    expect(own).toBe(derivePlayerIdSync(id.getClientId()));
    expect(id.setServerIdentity(CANONICAL, ACCOUNT)).toBe(true);
    expect(id.getPlayerId()).toBe(CANONICAL);
    expect(id.isSignedIn()).toBe(true);
    expect(id.getAccount()).toEqual(ACCOUNT);
    expect(JSON.parse(localStorage.getItem("jaxsquares.playerId")!)).toEqual({ for: own, id: CANONICAL });
    // Same answer again: nothing changes.
    expect(id.setServerIdentity(CANONICAL, ACCOUNT)).toBe(false);

    // A relaunch reads it back before any network.
    vi.resetModules();
    const fresh = await import("../lib/identity");
    expect(fresh.getPlayerId()).toBe(CANONICAL);

    fresh.setServerIdentity(own, null);
    expect(fresh.getPlayerId()).toBe(own);
    expect(localStorage.getItem("jaxsquares.playerId")).toBeNull();
    expect(fresh.isSignedIn()).toBe(false);
  });

  it("only counts for the clientId it was given for, and ignores junk", () => {
    id.setServerIdentity(CANONICAL, ACCOUNT);
    localStorage.setItem("jaxsquares.clientId", "another-device-id-0001");
    expect(id.getPlayerId()).toBe(derivePlayerIdSync("another-device-id-0001"));
    localStorage.setItem("jaxsquares.playerId", "{not json");
    expect(id.getPlayerId()).toBe(derivePlayerIdSync("another-device-id-0001"));
  });

  it("is restored from the native store at startup, with the account", async () => {
    const clientId = "native-device-id-0001";
    const store = memoryStore({
      "jaxsquares.clientId": clientId,
      "jaxsquares.playerId": JSON.stringify({ for: derivePlayerIdSync(clientId), id: CANONICAL }),
      "jaxsquares.account": JSON.stringify(ACCOUNT),
    });
    await id.hydrateIdentity(store);
    expect(id.getPlayerId()).toBe(CANONICAL);
    expect(id.getAccount()).toEqual(ACCOUNT);
  });
});

describe("signing in", () => {
  it("adopts who the server says this device is: the account's id, host tokens and profile", async () => {
    const me: MeResponse = {
      playerId: CANONICAL,
      account: ACCOUNT,
      hostTokens: { abc234: "host-token-1", xyz789: "host-token-2" },
      profile: { name: "Maya", color: "#ff4f9a", emoji: "🦄" },
    };
    fetchMock.mockImplementation(async () => json(me));
    const clientId = id.getClientId();
    await auth.completeSignIn("apple", { idToken: "a.b.c", nonce: "raw" });

    const req = sent("/auth/apple");
    expect(req.init.method).toBe("POST");
    expect(req.headers["x-client-id"]).toBe(clientId);
    expect(req.headers["x-signed-in"]).toBeUndefined();
    expect(req.body).toEqual({ idToken: "a.b.c", nonce: "raw" });

    // The clientId never changes on sign-in: the server maps it to the account.
    expect(id.getClientId()).toBe(clientId);
    expect(id.getPlayerId()).toBe(CANONICAL);
    expect(id.getAdminToken("abc234")).toBe("host-token-1");
    expect(id.getAdminToken("xyz789")).toBe("host-token-2");
    expect(id.getKnownGames()).toEqual(expect.arrayContaining(["abc234", "xyz789"]));
    expect(id.getProfile()).toMatchObject({ name: "Maya", emoji: "🦄" });

    // From now on every request says it's signed in (so the server never answers from a stale cache).
    fetchMock.mockImplementation(async () => json({ games: [] }));
    await api.api.myGames();
    expect(sent("/me/games").headers["x-signed-in"]).toBe("1");
  });

  it("offers Apple first in the iOS app, and only what the server set up", () => {
    const all = { googleWebClientId: "w", googleIosClientId: "i", appleServicesId: "s", appleNative: true };
    expect(auth.providersFor(all, "ios", "i")).toEqual(["apple", "google"]);
    expect(auth.providersFor(all, "web")).toEqual(["google", "apple"]);
    expect(auth.providersFor({ ...all, googleIosClientId: null }, "ios", "i")).toEqual(["apple"]);
    // An iOS build made without Google's URL scheme (or for another client id) never offers it: the SDK would crash.
    expect(auth.providersFor(all, "ios", "")).toEqual(["apple"]);
    expect(auth.providersFor(all, "ios", "older-id")).toEqual(["apple"]);
    expect(auth.providersFor({ googleWebClientId: null, googleIosClientId: null, appleServicesId: null, appleNative: true }, "web")).toEqual([]);
    expect(auth.providersFor(all, "android")).toEqual([]);
    expect(auth.providersFor(null, "ios")).toEqual([]);
  });

  it("makes a fresh nonce whose hash goes to the provider", async () => {
    const a = auth.newNonce();
    const b = auth.newNonce();
    expect(a.raw).not.toBe(b.raw);
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(a.raw)));
    expect(a.hashed).toBe(Array.from(digest, (x) => x.toString(16).padStart(2, "0")).join(""));
  });
});

/** A signed-in device with a hosted board, a seen invite, a profile and a theme. */
function signedInDevice() {
  id.setProfile({ name: "Maya" });
  id.saveAdminToken("abc234", "host-token-1");
  id.rememberSeen("seen999");
  id.setServerIdentity(CANONICAL, ACCOUNT);
  localStorage.setItem("jaxsquares.theme", "light");
  localStorage.setItem("jaxsquares.muted.abc234", "1");
  return id.getClientId();
}

function expectFresh(before: string) {
  expect(id.getClientId()).not.toBe(before);
  expect(id.isSignedIn()).toBe(false);
  expect(id.getPlayerId()).toBe(derivePlayerIdSync(id.getClientId()));
  expect(id.getAdminToken("abc234")).toBeNull();
  expect(id.getKnownGames()).toEqual([]);
  expect(id.getSeenGames()).toEqual([]);
  expect(id.getProfile().name).toBe("");
  expect(localStorage.getItem("jaxsquares.muted.abc234")).toBeNull();
  // Device settings stay.
  expect(localStorage.getItem("jaxsquares.theme")).toBe("light");
}

describe("signing out", () => {
  it("tells the server first, then the device starts fresh", async () => {
    const before = signedInDevice();
    fetchMock.mockImplementation(async () => json({ ok: true }));
    await auth.signOut();
    const req = sent("/auth/sign-out");
    expect(req.headers["x-client-id"]).toBe(before);
    expect(req.headers["x-signed-in"]).toBe("1");
    expectFresh(before);
  });

  it("changes nothing on this device when the server can't be reached", async () => {
    const before = signedInDevice();
    fetchMock.mockImplementation(async () => {
      throw new TypeError("offline");
    });
    await expect(auth.signOut()).rejects.toThrow(/offline/i);
    expect(id.getClientId()).toBe(before);
    expect(id.getPlayerId()).toBe(CANONICAL);
    expect(id.getAdminToken("abc234")).toBe("host-token-1");
  });

  it("deleting the account starts fresh too", async () => {
    const before = signedInDevice();
    fetchMock.mockImplementation(async () => json({ ok: true }));
    await auth.deleteAccount();
    expect(sent("/account").init.method).toBe("DELETE");
    expectFresh(before);
  });

  it("remembers only which provider signed in here, through sign-out, until the account is deleted", async () => {
    expect(id.signedInBeforeWith()).toBeNull();
    signedInDevice();
    expect(id.signedInBeforeWith()).toBe("apple");
    expect(localStorage.getItem("jaxsquares.signedInBefore")).toBe("apple");
    fetchMock.mockImplementation(async () => json({ ok: true }));
    await auth.signOut();
    expect(id.signedInBeforeWith()).toBe("apple");
    signedInDevice();
    await auth.deleteAccount();
    expect(id.signedInBeforeWith()).toBeNull();
  });

  it("restores the provider from the native store at startup", async () => {
    await id.hydrateIdentity(memoryStore({ "jaxsquares.clientId": "native-client-id", "jaxsquares.signedInBefore": "google" }));
    expect(id.signedInBeforeWith()).toBe("google");
  });
});

describe("refreshMe on start", () => {
  it("refreshes the player id and host tokens", async () => {
    fetchMock.mockImplementation(async () => json({ playerId: CANONICAL, account: ACCOUNT, hostTokens: { abc234: "t" }, profile: null }));
    await auth.refreshMe();
    expect(id.getPlayerId()).toBe(CANONICAL);
    expect(id.getAdminToken("abc234")).toBe("t");
  });

  it("keeps the boards the account co-hosts (no token: the server knows them by the account), and forgets them on sign-out", async () => {
    fetchMock.mockImplementation(async () => json({ playerId: CANONICAL, account: ACCOUNT, hostTokens: {}, profile: null, cohostGames: ["cohst1", "NOT A BOARD"] }));
    await auth.refreshMe();
    expect(id.getCohostGames()).toEqual(["cohst1"]);
    expect(id.isCohostGame("cohst1")).toBe(true);
    expect(id.getAdminToken("cohst1")).toBeNull();
    // An older server leaves the list out: what's held stays.
    fetchMock.mockImplementation(async () => json({ playerId: CANONICAL, account: ACCOUNT, hostTokens: {}, profile: null }));
    await auth.refreshMe();
    expect(id.getCohostGames()).toEqual(["cohst1"]);
    id.wipeIdentity();
    expect(id.getCohostGames()).toEqual([]);
  });

  it("starts fresh when the account was signed out or deleted elsewhere", async () => {
    const before = signedInDevice();
    fetchMock.mockImplementation(async () => json({ playerId: derivePlayerIdSync(before), account: null, hostTokens: {}, profile: null }));
    await auth.refreshMe();
    expectFresh(before);
  });

  it("changes nothing when it can't ask", async () => {
    const before = signedInDevice();
    fetchMock.mockImplementation(async () => json({ error: "Couldn't check your sign-in. Try again in a moment." }, 503));
    await auth.refreshMe();
    expect(id.getClientId()).toBe(before);
    expect(id.isSignedIn()).toBe(true);
  });
});
