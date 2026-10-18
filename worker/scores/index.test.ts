// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LinkedEvent, ScheduleResponse } from "../../shared/types";
import { scoreboard, status, summary, TEAMS, type EventFixture } from "./espn.fixtures";
import { clearMemoryCache } from "./cache";
import { fetchLiveForEvent, getSchedule, scheduleRoutes } from "./index";
import { MemoryCache } from "./testCache";

const NOW = Date.parse("2026-10-16T18:00:00Z");
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function ev(id: string, startsAt: number, st: EventFixture["status"], lines?: [number[], number[]]): EventFixture {
  return {
    id,
    date: new Date(startsAt).toISOString().replace(/:\d\d\.\d+Z$/, "Z"),
    home: { team: TEAMS.kc, lines: lines?.[0] },
    away: { team: TEAMS.buf, lines: lines?.[1] },
    status: st,
  };
}

let fetchMock: ReturnType<typeof vi.fn>;
let cache: MemoryCache;

function respondWith(handler: (url: URL) => unknown) {
  fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
    const body = handler(new URL(String(input)));
    if (body instanceof Response) return body;
    return new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
  });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  fetchMock = vi.fn();
  cache = new MemoryCache();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("caches", { default: cache });
  vi.spyOn(console, "warn").mockImplementation(() => {});
  clearMemoryCache();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("GET /schedule", () => {
  it("lists upcoming and live games for the next ~week, soonest first", async () => {
    respondWith(() =>
      scoreboard([
        ev("later", NOW + 3 * DAY, status.scheduled()),
        ev("done", NOW - 20 * HOUR, status.final(), [[7, 0, 0, 0], [0, 0, 0, 3]]),
        ev("live", NOW - HOUR, status.inProgress(2, "3:00"), [[7, 0], [0, 3]]),
        ev("soon", NOW + 2 * HOUR, status.scheduled()),
        ev("too-far", NOW + 12 * DAY, status.scheduled()),
      ]),
    );
    const res = await scheduleRoutes.request("/schedule?league=nfl");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("public, max-age=60");
    const body = (await res.json()) as ScheduleResponse;
    expect(body.unavailable).toBeUndefined();
    expect(body.events.map((e) => e.eventId)).toEqual(["live", "soon", "later"]);
    expect(body.events[0]).toMatchObject({ league: "nfl", state: "in", home: { abbr: "KC" }, away: { abbr: "BUF" } });

    // The current slate plus one request per day ahead (ESPN rejects date ranges).
    const urls = fetchMock.mock.calls.map((c) => new URL(String(c[0])));
    expect(urls[0].pathname).toBe("/apis/site/v2/sports/football/nfl/scoreboard");
    expect(urls[0].searchParams.has("dates")).toBe(false);
    expect(urls.slice(1).map((u) => u.searchParams.get("dates"))).toEqual([
      "20261016", "20261017", "20261018", "20261019", "20261020", "20261021", "20261022", "20261023",
    ]);
    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
    expect(new Headers(fetchMock.mock.calls[0][1].headers).has("user-agent")).toBe(false);
  });

  it("still lists games when some days fail", async () => {
    respondWith((url) =>
      url.searchParams.get("dates") === "20261018"
        ? new Response("busy", { status: 503 })
        : url.searchParams.has("dates")
          ? scoreboard([ev(`day-${url.searchParams.get("dates")}`, NOW + 3 * HOUR, status.scheduled())])
          : scoreboard([ev("slate", NOW + 2 * HOUR, status.scheduled())]),
    );
    const events = await getSchedule("nfl");
    expect(events?.map((e) => e.eventId)).toContain("slate");
    expect(events?.map((e) => e.eventId)).toContain("day-20261017");
    expect(events?.map((e) => e.eventId)).not.toContain("day-20261018");
  });

  it("queries FBS college games for league=ncaaf", async () => {
    respondWith(() => scoreboard([]));
    const res = await scheduleRoutes.request("/schedule?league=ncaaf");
    expect(await res.json()).toEqual({ events: [] });
    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.pathname).toContain("/college-football/scoreboard");
    expect(url.searchParams.get("groups")).toBe("80");
  });

  it("rejects unknown leagues", async () => {
    const res = await scheduleRoutes.request("/schedule?league=custom");
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ["a network error", () => Promise.reject(new TypeError("fetch failed"))],
    ["an HTTP error", async () => new Response("bad gateway", { status: 502 })],
    ["an unexpected body", async () => new Response(JSON.stringify({ code: 400 }))],
  ])("answers 200 { events: [], unavailable: true } on %s", async (_label, impl) => {
    fetchMock.mockImplementation(impl);
    const res = await scheduleRoutes.request("/schedule?league=nfl");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ events: [], unavailable: true });
  });

  it("shares one upstream fetch through the cache, and falls back to it if ESPN goes down", async () => {
    respondWith(() => scoreboard([ev("soon", NOW + 2 * HOUR, status.scheduled())]));
    await getSchedule("nfl");
    const perRefresh = fetchMock.mock.calls.length;
    vi.setSystemTime(NOW + 5 * 60 * 1000);
    expect((await getSchedule("nfl", Date.now()))?.map((e) => e.eventId)).toEqual(["soon"]);
    expect(fetchMock).toHaveBeenCalledTimes(perRefresh);

    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    vi.setSystemTime(NOW + 30 * 60 * 1000);
    expect((await getSchedule("nfl", Date.now()))?.map((e) => e.eventId)).toEqual(["soon"]);
    expect(fetchMock).toHaveBeenCalledTimes(perRefresh * 2);
  });
});

describe("fetchLiveForEvent", () => {
  // Sunday night kickoff: 8:20 PM ET on the 18th is 00:20 UTC on the 19th.
  const kickoff = Date.parse("2026-10-19T00:20:00Z");
  const linked: LinkedEvent = { provider: "espn", league: "nfl", eventId: "401773100", startsAt: kickoff, xIsHome: false };

  it("reads the game from its slate day's scoreboard, oriented to the board", async () => {
    respondWith(() =>
      scoreboard([
        ev("401773099", kickoff - 7 * HOUR, status.final(), [[3, 3, 3, 3], [0, 0, 0, 0]]),
        ev("401773100", kickoff, status.halftime(), [[7, 3], [0, 14]]),
      ]),
    );
    const update = await fetchLiveForEvent(linked);
    expect(update).toMatchObject({
      live: { state: "in", detail: "Halftime", scoreX: 14, scoreY: 10, updatedAt: NOW },
      linescoresX: [0, 14],
      linescoresY: [7, 3],
      completedPeriods: 2,
      isFinal: false,
    });
    // A Sunday night game is filed under Sunday the 18th (US date), not its UTC date.
    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.searchParams.get("dates")).toBe("20261018");
  });

  it("every board on the same slate shares one cached fetch", async () => {
    const early = Date.parse("2026-10-18T17:00:00Z"); // Sunday 1:00 PM ET
    const hawaii = Date.parse("2026-10-18T09:00:00Z"); // Saturday 11:00 PM HST
    respondWith(() =>
      scoreboard([
        ev("401773099", early, status.inProgress(4, "2:00"), [[3, 3, 3, 3], [0, 0, 0, 0]]),
        ev("401773100", kickoff, status.scheduled()),
        ev("401760200", hawaii, status.final(), [[7, 7, 7, 7], [0, 0, 0, 0]]),
      ]),
    );
    await fetchLiveForEvent(linked);
    await fetchLiveForEvent({ ...linked, eventId: "401773099", startsAt: early });
    await fetchLiveForEvent({ ...linked, xIsHome: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // A late Saturday game belongs to Saturday's slate.
    expect((await fetchLiveForEvent({ ...linked, eventId: "401760200", startsAt: hawaii }))?.isFinal).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const url = new URL(String(fetchMock.mock.calls[1][0]));
    expect(url.searchParams.get("dates")).toBe("20261017");

    vi.setSystemTime(NOW + 10_000);
    const before = fetchMock.mock.calls.length;
    await fetchLiveForEvent(linked);
    expect(fetchMock).toHaveBeenCalledTimes(before + 1);
  });

  it("falls back to the summary endpoint when the game moved to another day", async () => {
    respondWith((url) =>
      url.pathname.endsWith("/summary")
        ? summary(ev("401773100", kickoff + 7 * DAY, status.inProgress(1, "9:12"), [[7], [0]]))
        : scoreboard([]),
    );
    const update = await fetchLiveForEvent({ ...linked, xIsHome: true });
    expect(update).toMatchObject({ live: { state: "in", period: 1, scoreX: 7, scoreY: 0 }, completedPeriods: 0 });
    expect(String(fetchMock.mock.calls[1][0])).toBe(
      "https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=401773100",
    );
  });

  it("returns null without trying the summary when ESPN is unreachable", async () => {
    fetchMock.mockRejectedValue(new DOMException("The operation was aborted due to timeout", "TimeoutError"));
    expect(await fetchLiveForEvent(linked)).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns null when ESPN doesn't know the event", async () => {
    respondWith((url) =>
      url.pathname.endsWith("/summary") ? new Response("{}", { status: 404 }) : scoreboard([]),
    );
    expect(await fetchLiveForEvent(linked)).toBeNull();
  });

  it("doesn't mix up its cache with the schedule's for the same day", async () => {
    // The picker and the live lookup fetch the same scoreboard URL but cache different shapes.
    respondWith(() => scoreboard([ev("401773100", kickoff, status.scheduled())]));
    expect((await getSchedule("nfl"))?.map((e) => e.eventId)).toEqual(["401773100"]);
    expect(await fetchLiveForEvent(linked)).toMatchObject({ live: { state: "pre" }, completedPeriods: 0 });

    clearMemoryCache();
    cache = new MemoryCache();
    vi.stubGlobal("caches", { default: cache });
    expect(await fetchLiveForEvent(linked)).toMatchObject({ live: { state: "pre" } });
    expect((await getSchedule("nfl"))?.map((e) => e.eventId)).toEqual(["401773100"]);
  });

  it("works without the Cache API", async () => {
    vi.stubGlobal("caches", undefined);
    respondWith(() => scoreboard([ev("401773100", kickoff, status.final(), [[7, 0, 0, 3], [0, 0, 0, 0]])]));
    expect((await fetchLiveForEvent(linked))?.isFinal).toBe(true);
  });
});
