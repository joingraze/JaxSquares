import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, api, checkHostToken, errorMessage } from "../lib/api";
import { captureHostLink, getAdminToken, getClientId, getKnownGames, saveAdminToken } from "../lib/identity";

const fetchMock = vi.fn();

function reply(status: number, body: unknown) {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
}

beforeEach(() => {
  localStorage.clear();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function lastCall() {
  const [url, init] = fetchMock.mock.calls.at(-1)! as [string, RequestInit];
  return { url, init, headers: init.headers as Record<string, string> };
}

describe("api client", () => {
  it("sends x-client-id on every request", async () => {
    fetchMock.mockReturnValue(reply(200, { games: [] }));
    await api.myGames();
    const { url, init, headers } = lastCall();
    expect(url).toBe("/api/me/games");
    expect(init.method).toBe("GET");
    expect(headers["x-client-id"]).toBe(getClientId());
    expect(headers["x-admin-token"]).toBeUndefined();
  });

  it("uses the stored admin token for host endpoints, or an explicit one", async () => {
    saveAdminToken("g1", "stored-token");
    fetchMock.mockImplementation(() => reply(200, { state: {} }));
    await api.lock("g1");
    expect(lastCall().headers["x-admin-token"]).toBe("stored-token");
    expect(lastCall().url).toBe("/api/games/g1/lock");
    await api.setScore("g1", { periodKey: "q1", scoreX: 7, scoreY: 3 }, "explicit");
    expect(lastCall().headers["x-admin-token"]).toBe("explicit");
    expect(JSON.parse(lastCall().init.body as string)).toEqual({ periodKey: "q1", scoreX: 7, scoreY: 3 });
    expect(lastCall().headers["content-type"]).toBe("application/json");
  });

  it("encodes path segments", async () => {
    fetchMock.mockImplementation(() => reply(200, { state: {} }));
    await api.deleteScore("g 1", "s/2", "t");
    expect(lastCall().url).toBe("/api/games/g%201/scores/s%2F2");
    expect(lastCall().init.method).toBe("DELETE");
  });

  it("throws ApiError with the server's message and status", async () => {
    fetchMock.mockReturnValue(reply(409, { error: "Squares are locked" }));
    const err = await api.claim("g1", [{ row: 0, col: 0 }]).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(409);
    expect((err as ApiError).message).toBe("Squares are locked");
    expect(errorMessage(err)).toBe("Squares are locked");
  });

  it("falls back to a friendly message when the body has none", async () => {
    fetchMock.mockReturnValue(Promise.resolve(new Response("oops", { status: 502 })));
    const err = (await api.getGame("g1").catch((e: unknown) => e)) as ApiError;
    expect(err.status).toBe(502);
    expect(err.message).toMatch(/server/i);
  });

  it("reports network failures as status 0", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    const err = (await api.getGame("g1").catch((e: unknown) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.isNetwork).toBe(true);
  });

  it("createGame saves the admin token; join remembers the board", async () => {
    fetchMock.mockReturnValueOnce(reply(201, { game: { id: "new1" }, adminToken: "adm", paymentRequired: true }));
    await api.createGame({} as Parameters<typeof api.createGame>[0]);
    expect(getAdminToken("new1")).toBe("adm");

    fetchMock.mockReturnValueOnce(reply(200, { state: {} }));
    await api.join("other", { name: "Jax", color: "#ff6b35", emoji: "🔥" });
    expect(getKnownGames()).toEqual(["other", "new1"]);
  });

  it("keeps the held host token over a host link's, and adopts the link's only once the server takes it", async () => {
    // The server accepts only "real"; anything else is the 403 every host route answers.
    fetchMock.mockImplementation((_url: string, init: RequestInit) =>
      (init.headers as Record<string, string>)["x-admin-token"] === "real" ? reply(200, { state: {} }) : reply(403, { error: "Only the host can do that" }),
    );
    const sent = () => fetchMock.mock.calls.map(([, init]) => (init as RequestInit & { headers: Record<string, string> }).headers["x-admin-token"]);

    // The host's real token wins over a bogus link: it's sent, and it stays.
    saveAdminToken("hst1", "real");
    expect(captureHostLink("/g/hst1", "", "#host=bogus")).toEqual({ search: "", hash: "" });
    await api.lock("hst1");
    expect(sent()).toEqual(["real"]);
    expect(getAdminToken("hst1")).toBe("real");

    // A device that first got a truncated link still recovers with the real one: tried after the 403, then kept.
    fetchMock.mockClear();
    saveAdminToken("hst2", "trunc");
    captureHostLink("/g/hst2", "", "#host=real");
    await api.finish("hst2");
    expect(sent()).toEqual(["trunc", "real"]);
    expect(getAdminToken("hst2")).toBe("real");

    // Two bad tokens: the call fails, the held one stays and the link's is dropped.
    fetchMock.mockClear();
    saveAdminToken("hst3", "held");
    captureHostLink("/g/hst3", "", "#host=bogus");
    const err = (await api.lock("hst3").catch((e: unknown) => e)) as ApiError;
    expect(err.status).toBe(403);
    expect(getAdminToken("hst3")).toBe("held");
    await api.lock("hst3").catch(() => {});
    expect(sent()).toEqual(["held", "bogus", "held"]);
  });

  it("checkHostToken asks the server about a host link's token before the device trusts it", async () => {
    fetchMock.mockImplementation((_url: string, init: RequestInit) =>
      (init.headers as Record<string, string>)["x-admin-token"] === "real" ? reply(200, { ok: true }) : reply(403, { error: "Only the host can do that" }),
    );
    expect(await checkHostToken("hst4", "real")).toBe(true);
    const { url, init, headers } = lastCall();
    expect([url, init.method, headers["x-admin-token"]]).toEqual(["/api/games/hst4/host-check", "GET", "real"]);
    expect(await checkHostToken("hst4", "bogus")).toBe(false);
    fetchMock.mockImplementation(() => reply(404, { error: "Game not found" }));
    expect(await checkHostToken("gone", "real")).toBe(false);
    // Unknown (offline, or the server fumbled): the caller keeps the token.
    fetchMock.mockImplementation(() => Promise.reject(new TypeError("Failed to fetch")));
    expect(await checkHostToken("hst4", "real")).toBeNull();
    fetchMock.mockImplementation(() => reply(500, {}));
    expect(await checkHostToken("hst4", "real")).toBeNull();
  });

  it("deleteGame forgets the board locally", async () => {
    saveAdminToken("g1", "t");
    fetchMock.mockReturnValue(reply(200, { ok: true }));
    await api.deleteGame("g1");
    expect(getAdminToken("g1")).toBeNull();
    expect(getKnownGames()).toEqual([]);
  });
});
