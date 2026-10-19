// @vitest-environment node
// Basketball's schedule goes by day: GET /api/schedule?league=nba[&date=YYYYMMDD],
// one cached ESPN scoreboard per day, through the league's own ScoreHub.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LinkedEvent, ScheduleResponse } from "../../shared/types";
import type { Env } from "../env";
import { BB_TEAMS, bbScoreboard, bbStatus, type BbEventFixture } from "./basketball.fixtures";
import { clearMemoryCache } from "./cache";
import { ScoreHub } from "./hub";
import { SCHEDULE_DAYS, dayInRange, fetchLiveForEvent, getDaySchedule, liveVia, scheduleRoutes, scheduleVia } from "./index";
import { MemoryCache } from "./testCache";

// Friday March 20, 2026, 3:00 PM Eastern.
const NOW = Date.parse("2026-03-20T19:00:00Z");
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function ev(id: string, startsAt: number, st: BbEventFixture["status"], lines?: [number[], number[]]): BbEventFixture {
  return {
    id,
    date: new Date(startsAt).toISOString().replace(/:\d\d\.\d+Z$/, "Z"),
    home: { team: BB_TEAMS.lal, lines: lines?.[0] },
    away: { team: BB_TEAMS.bos, lines: lines?.[1] },
    status: st,
  };
}

let fetchMock: ReturnType<typeof vi.fn>;

/** Answers each scoreboard request by its `dates` value (YYYYMMDD). */
function byDay(days: Record<string, BbEventFixture[]>, path: Parameters<typeof bbScoreboard>[1] = "nba") {
  fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    return new Response(JSON.stringify(bbScoreboard(days[url.searchParams.get("dates") ?? ""] ?? [], path)));
  });
}

const requested = () => fetchMock.mock.calls.map((c) => new URL(String(c[0])));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("caches", { default: new MemoryCache() });
  vi.spyOn(console, "warn").mockImplementation(() => {});
  clearMemoryCache();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("GET /schedule for basketball", () => {
  it("lists the next 7 days of games, today first, one scoreboard per day", async () => {
    byDay({
      "20260320": [ev("tonight", NOW + 4 * HOUR, bbStatus.scheduled()), ev("on-now", NOW - HOUR, bbStatus.inProgress(2, "4:12"), [[20, 10], [18, 9]]), ev("done", NOW - 3 * HOUR, bbStatus.final(4), [[25, 25, 25, 25], [20, 20, 20, 20]])],
      "20260321": [ev("sat", NOW + DAY, bbStatus.scheduled())],
      "20260326": [ev("next-thu", NOW + 6 * DAY, bbStatus.scheduled())],
      "20260327": [ev("too-far", NOW + 7 * DAY, bbStatus.scheduled())],
    });
    const res = await scheduleRoutes.request("/schedule?league=nba");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("public, max-age=60");
    const body = (await res.json()) as ScheduleResponse;
    expect(body.events.map((e) => e.eventId)).toEqual(["on-now", "tonight", "sat", "next-thu"]);
    expect(body.events[0]).toMatchObject({ league: "nba", state: "in", home: { abbr: "LAL" } });
    expect(body.dates).toEqual(["20260320", "20260321", "20260322", "20260323", "20260324", "20260325", "20260326"]);
    expect(body.week).toBeUndefined();
    expect(body.weeks).toBeUndefined();

    expect(fetchMock).toHaveBeenCalledTimes(SCHEDULE_DAYS);
    for (const url of requested()) expect(url.pathname).toBe("/apis/site/v2/sports/basketball/nba/scoreboard");
    expect(requested().map((u) => u.searchParams.get("dates"))).toEqual(body.dates);
  });

  it("starts from last night's slate in the small hours (games still on)", async () => {
    vi.setSystemTime(Date.parse("2026-03-21T06:30:00Z")); // 2:30 AM Eastern Saturday
    byDay({ "20260320": [ev("late", Date.parse("2026-03-21T05:00:00Z"), bbStatus.inProgress(4, "1:02"), [[30, 30, 30, 10], [28, 31, 25, 12]])] });
    const body = (await (await scheduleRoutes.request("/schedule?league=nba")).json()) as ScheduleResponse;
    expect(body.dates?.[0]).toBe("20260320");
    expect(body.events.map((e) => e.eventId)).toEqual(["late"]);
  });

  it("answers ?date= with that day's games", async () => {
    byDay({ "20260402": [ev("apr2", Date.parse("2026-04-02T23:00:00Z"), bbStatus.scheduled())] });
    const res = await scheduleRoutes.request("/schedule?league=nba&date=20260402");
    expect(res.headers.get("cache-control")).toBe("public, max-age=300");
    const body = (await res.json()) as ScheduleResponse;
    expect(body.events.map((e) => e.eventId)).toEqual(["apr2"]);
    expect(body.dates).toEqual(["20260402"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(requested()[0].searchParams.get("dates")).toBe("20260402");
  });

  it("asks men's college for all of Division I", async () => {
    byDay({}, "mens-college-basketball");
    await scheduleRoutes.request("/schedule?league=ncaab&date=20260320");
    const [url] = requested();
    expect(url.pathname).toBe("/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard");
    expect(url.searchParams.get("groups")).toBe("50");
  });

  it.each([
    ["league=nba&week=2-7"],
    ["league=nba&date=2026-03-20"],
    ["league=nba&date=20260230"],
    ["league=ncaaw&date=20260101"],
    ["league=wnba&date=20300101"],
    ["league=nfl&date=20260320"],
    ["league=nhl"],
  ])("rejects %s", async (query) => {
    const res = await scheduleRoutes.request(`/schedule?${query}`);
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("answers 200 { events: [], unavailable: true } when no day can be read", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    const res = await scheduleRoutes.request("/schedule?league=wnba");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ events: [], unavailable: true });
  });

  it("leaves out a day that can't be read while the others answer", async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const date = new URL(String(input)).searchParams.get("dates");
      if (date === "20260321") return new Response("bad gateway", { status: 502 });
      return new Response(JSON.stringify(bbScoreboard(date === "20260320" ? [ev("tonight", NOW + 4 * HOUR, bbStatus.scheduled())] : [])));
    });
    const body = (await (await scheduleRoutes.request("/schedule?league=nba")).json()) as ScheduleResponse;
    expect(body.unavailable).toBeUndefined();
    expect(body.events.map((e) => e.eventId)).toEqual(["tonight"]);
  });

  it("caches each day: a second look within the TTL makes no request", async () => {
    byDay({ "20260320": [ev("tonight", NOW + 4 * HOUR, bbStatus.scheduled())] });
    await getDaySchedule("nba");
    vi.setSystemTime(NOW + 5 * 60 * 1000);
    expect((await getDaySchedule("nba"))?.events.map((e) => e.eventId)).toEqual(["tonight"]);
    expect(fetchMock).toHaveBeenCalledTimes(SCHEDULE_DAYS);
    // Today's slate refreshes after 10 minutes; days further out keep for 30.
    vi.setSystemTime(NOW + 11 * 60 * 1000);
    await getDaySchedule("nba");
    expect(fetchMock).toHaveBeenCalledTimes(SCHEDULE_DAYS + 2);
  });

  it("keeps a day's range to yesterday's slate through a year ahead", () => {
    expect(dayInRange("20260319", NOW)).not.toBeNull();
    expect(dayInRange("20260318", NOW)).toBeNull();
    expect(dayInRange("20270320", NOW)).not.toBeNull();
    expect(dayInRange("20270501", NOW)).toBeNull();
  });
});

describe("basketball live scores", () => {
  // 10:30 PM Eastern on the 20th is 02:30 UTC on the 21st.
  const tip = Date.parse("2026-03-21T02:30:00Z");
  const linked: LinkedEvent = { provider: "espn", league: "nba", eventId: "401705001", startsAt: tip, xIsHome: false };

  it("reads the game from its slate day's basketball scoreboard", async () => {
    byDay({ "20260320": [ev("401705001", tip, bbStatus.halftime(), [[28, 31], [30, 26]])] });
    const update = await fetchLiveForEvent(linked);
    expect(update).toMatchObject({ live: { state: "in", detail: "Halftime", scoreX: 56, scoreY: 59 }, linescoresX: [30, 26], completedPeriods: 2 });
    const [url] = requested();
    expect(url.pathname).toBe("/apis/site/v2/sports/basketball/nba/scoreboard");
    expect(url.searchParams.get("dates")).toBe("20260320");
  });
});

describe("basketball through the ScoreHub", () => {
  function envWith(fetchImpl: (req: Request) => Promise<Response>): { env: Env; names: string[] } {
    const names: string[] = [];
    const ns = {
      idFromName: (name: string) => {
        names.push(name);
        return name;
      },
      get: () => ({ fetch: (input: RequestInfo, init?: RequestInit) => fetchImpl(new Request(input, init)) }),
    };
    return { env: { SCORE_HUB: ns } as unknown as Env, names };
  }

  it("gives each basketball league its own hub", async () => {
    byDay({ "20260320": [ev("401705001", Date.parse("2026-03-20T23:00:00Z"), bbStatus.scheduled())] });
    const h = new ScoreHub({} as DurableObjectState, {} as Env);
    const { env, names } = envWith((req) => h.fetch(req));
    expect((await scheduleVia(env, "nba"))?.events.map((e) => e.eventId)).toEqual(["401705001"]);
    expect((await scheduleVia(env, "ncaab", undefined, "20260320"))?.dates).toEqual(["20260320"]);
    expect(await liveVia(env, { provider: "espn", league: "wnba", eventId: "x", startsAt: NOW, xIsHome: true })).toBeNull();
    expect(names).toEqual(["espn:nba", "espn:ncaab", "espn:wnba"]);
  });

  it("shares one fetch per day between concurrent pickers", async () => {
    byDay({});
    const h = new ScoreHub({} as DurableObjectState, {} as Env);
    await Promise.all([h.fetch(new Request("https://hub/schedule?league=nba")), h.fetch(new Request("https://hub/schedule?league=nba"))]);
    expect(fetchMock).toHaveBeenCalledTimes(SCHEDULE_DAYS);
  });

  it("refuses a week for basketball and a date for football", async () => {
    const h = new ScoreHub({} as DurableObjectState, {} as Env);
    expect((await h.fetch(new Request("https://hub/schedule?league=nba&week=2-7"))).status).toBe(400);
    expect((await h.fetch(new Request("https://hub/schedule?league=nba&date=junk"))).status).toBe(400);
    expect((await h.fetch(new Request("https://hub/schedule?league=nfl&date=20260320"))).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
