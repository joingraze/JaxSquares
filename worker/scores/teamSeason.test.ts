// @vitest-environment node
// A team's season from ESPN (season boards): the teams list and one team's
// schedule, parsed from fixtures in ESPN's shape, and the two routes the
// create flow reads. The sandbox can't reach ESPN; espn.probe.ts checks the
// real thing from a GitHub runner.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SeasonTeamsResponse, TeamScheduleResponse } from "../../shared/types";
import { clearMemoryCache } from "./cache";
import { parseSeasonTeam, parseTeamSchedule, parseTeamsList, teamScheduleUrl, teamsUrl } from "./espn";
import { getTeamSeason, scheduleRoutes } from "./index";
import { NBA, NFL, teamSchedule, teamsList } from "./season.fixtures";
import { MemoryCache } from "./testCache";

const NOW = Date.parse("2026-10-19T12:00:00Z");
const DAY = 86_400_000;

let fetchMock: ReturnType<typeof vi.fn>;

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

const jaxSeason = (seasonType = 2) =>
  teamSchedule(
    NFL.jax,
    2026,
    seasonType === 3
      ? [{ id: "401800901", date: NOW + 90 * DAY, home: NFL.jax, away: NFL.kc, seasonType: 3, week: { number: 1, text: "Wild Card" } }]
      : [
          { id: "401800101", date: NOW - 30 * DAY, home: NFL.mia, away: NFL.jax, week: { number: 1, text: "Week 1" }, state: "post", score: { home: 17, away: 24 } },
          { id: "401800107", date: NOW + 7 * DAY, home: NFL.jax, away: NFL.hou, week: { number: 8, text: "Week 8" } },
          { id: "401800108", date: NOW + 14 * DAY, home: NFL.ten, away: NFL.jax, week: { number: 9, text: "Week 9" } },
        ],
    seasonType,
  );

describe("URLs", () => {
  it("asks for the league's whole team list, and one team's season by year and season type", () => {
    expect(teamsUrl("nfl")).toBe("https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams?limit=1000");
    expect(teamsUrl("ncaaf")).toContain("football/college-football/teams?groups=80&limit=1000");
    expect(teamScheduleUrl("nfl", "30", { year: 2026, seasonType: 3 })).toBe(
      "https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/30/schedule?season=2026&seasontype=3",
    );
    expect(teamScheduleUrl("nba", "13")).toBe("https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/13/schedule");
  });
});

describe("parsing", () => {
  it("reads the teams list: ids, names and colors, by name, never the logos ESPN sends", () => {
    const teams = parseTeamsList(teamsList([NFL.mia, NFL.jax]));
    expect(teams).toStrictEqual([
      { id: "30", name: "Jacksonville Jaguars", abbr: "JAX", color: "#007487", shortName: "Jaguars" },
      { id: "15", name: "Miami Dolphins", abbr: "MIA", color: "#008e97", shortName: "Dolphins" },
    ]);
    // Odd data: no list, an inactive team, a TBD slot.
    expect(parseTeamsList({})).toEqual([]);
    const odd = teamsList([NFL.kc]) as { sports: { leagues: { teams: { team: Record<string, unknown> }[] }[] }[] };
    expect(parseTeamsList(odd)[0]).not.toHaveProperty("logo");
    odd.sports[0].leagues[0].teams[0].team.isActive = false;
    expect(parseTeamsList(odd)).toEqual([]);
    expect(parseSeasonTeam({ id: "x y", displayName: "Bad Id" })).toBeNull();
  });

  it("reads a team's schedule: every game in order, labels, playoff games, results", () => {
    const { team, year, events } = parseTeamSchedule(jaxSeason(), "nfl");
    expect(team).toMatchObject({ id: "30", name: "Jacksonville Jaguars", abbr: "JAX", color: "#007487" });
    expect(year).toBe(2026);
    expect(events.map((e) => [e.eventId, e.shortName, e.label, e.state, e.homeId, e.awayId])).toEqual([
      ["401800101", "JAX @ MIA", "Week 1", "post", "15", "30"],
      ["401800107", "HOU @ JAX", "Week 8", "pre", "30", "34"],
      ["401800108", "JAX @ TEN", "Week 9", "pre", "10", "30"],
    ]);
    expect(events[0].result).toEqual({ home: 17, away: 24 });
    expect(events[1].result).toBeUndefined();
    expect(events[1]).toMatchObject({ league: "nfl", home: { name: "Jacksonville Jaguars", abbr: "JAX" }, away: { name: "Houston Texans", abbr: "HOU" } });
    const post = parseTeamSchedule(jaxSeason(3), "nfl").events;
    expect(post.map((e) => [e.eventId, e.label, e.playoff])).toEqual([["401800901", "Wild Card", true]]);
  });

  it("skips TBD playoff slots and malformed games, and never throws", () => {
    const raw = jaxSeason(3) as { events: Record<string, unknown>[] };
    const tbd = JSON.parse(JSON.stringify(raw.events[0]));
    tbd.id = "401800902";
    tbd.competitions[0].competitors[1].team = { id: "-1", abbreviation: "TBD", displayName: "TBD" };
    raw.events.push(tbd, { id: "bad" }, { nope: true });
    expect(parseTeamSchedule(raw, "nfl").events.map((e) => e.eventId)).toEqual(["401800901"]);
    expect(parseTeamSchedule(null, "nfl")).toEqual({ team: null, year: null, events: [] });
  });
});

describe("getTeamSeason", () => {
  it("joins the regular season and the playoffs, and paints opponents with the teams list's colors", async () => {
    respondWith((url) => {
      if (url.pathname.endsWith("/teams")) return teamsList(Object.values(NFL));
      const type = url.searchParams.get("seasontype");
      if (type === "3") {
        expect(url.searchParams.get("season")).toBe("2026");
        return jaxSeason(3);
      }
      return jaxSeason(2);
    });
    const season = await getTeamSeason("nfl", "30");
    expect(season?.year).toBe(2026);
    expect(season?.team).toMatchObject({ id: "30", shortName: "Jaguars" });
    expect(season?.team).not.toHaveProperty("logo");
    expect(season?.events.map((e) => [e.eventId, e.playoff ?? false])).toEqual([
      ["401800101", false],
      ["401800107", false],
      ["401800108", false],
      ["401800901", true],
    ]);
    // The schedule's competitors carry no color; the teams list does.
    expect(season?.events[1].away.color).toBe("#03202f");
  });

  it("reads the NBA's play-in too, and keeps going when a postseason read fails", async () => {
    const seen: string[] = [];
    respondWith((url) => {
      if (url.pathname.endsWith("/teams")) return new Response("down", { status: 503 });
      seen.push(url.searchParams.get("seasontype") ?? "");
      if (url.searchParams.get("seasontype") === "2")
        return teamSchedule(NBA.lal, 2027, [{ id: "401900001", date: NOW + DAY, home: NBA.lal, away: NBA.gs }]);
      return new Response("nope", { status: 400 });
    });
    const season = await getTeamSeason("nba", "13");
    expect(seen.sort()).toEqual(["2", "3", "5"]);
    expect(season?.events.map((e) => e.eventId)).toEqual(["401900001"]);
    expect(season?.year).toBe(2027);
  });

  it("is null when the regular season can't be read", async () => {
    respondWith(() => new Response("down", { status: 503 }));
    expect(await getTeamSeason("nfl", "30")).toBeNull();
  });
});

describe("GET /season/teams and /season/schedule", () => {
  it("lists a league's teams, and one team's season", async () => {
    respondWith((url) => (url.pathname.endsWith("/teams") ? teamsList([NFL.jax, NFL.mia]) : jaxSeason(Number(url.searchParams.get("seasontype")))));
    const teams = await scheduleRoutes.request("/season/teams?league=nfl");
    expect(teams.status).toBe(200);
    expect(((await teams.json()) as SeasonTeamsResponse).teams.map((t) => t.abbr)).toEqual(["JAX", "MIA"]);
    const schedule = await scheduleRoutes.request("/season/schedule?league=nfl&team=30");
    expect(schedule.status).toBe(200);
    const body = (await schedule.json()) as TeamScheduleResponse;
    expect(body.team?.abbr).toBe("JAX");
    expect(body.events).toHaveLength(4);
  });

  it("refuses a bad league, team or year", async () => {
    expect((await scheduleRoutes.request("/season/teams?league=custom")).status).toBe(400);
    expect((await scheduleRoutes.request("/season/schedule?league=nfl")).status).toBe(400);
    expect((await scheduleRoutes.request("/season/schedule?league=nfl&team=..%2F1")).status).toBe(400);
    expect((await scheduleRoutes.request("/season/schedule?league=nfl&team=30&year=26")).status).toBe(400);
  });

  it("answers 200 with unavailable when ESPN is down", async () => {
    respondWith(() => new Response("down", { status: 503 }));
    expect(await (await scheduleRoutes.request("/season/teams?league=nba")).json()).toEqual({ teams: [], unavailable: true });
    expect(await (await scheduleRoutes.request("/season/schedule?league=nba&team=13")).json()).toEqual({ team: null, year: null, events: [], unavailable: true });
  });
});
