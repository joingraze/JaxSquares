// @vitest-environment node
// Basketball through the ESPN client: URLs, the schedule, live parsing (quarters,
// halftime, overtime, men's college halves) and how a live update lands on a
// board's moments. Mirrors espn.test.ts for football.
import { describe, expect, it } from "vitest";
import { rulesForPreset, withRules } from "../../shared/formats";
import { periodInPlay, periodKeyForLive, periodScoresFromLinescores } from "../../shared/squares";
import type { GameFormat, GameState, League } from "../../shared/types";
import { parseDayId, parseSchedule, parseScoreboardSnapshots, parseSummarySnapshot, scoreboardUrl, summaryUrl, toLiveUpdate, type GameSnapshot } from "./espn";
import {
  BB_TEAMS,
  LITERAL_NBA_OT_FINAL,
  LITERAL_NCAAM_HALFTIME,
  bbScoreboard,
  bbStatus,
  bbSummary,
  type BasketballPath,
  type BbEventFixture,
} from "./basketball.fixtures";

const NOW = Date.parse("2026-03-20T19:00:00Z");

/** LAL (home) vs BOS (away), with whatever status/lines a test needs. */
function nba(st: BbEventFixture["status"], home?: number[], away?: number[], extra: Partial<BbEventFixture> = {}): BbEventFixture {
  return { id: "401705001", date: "2026-03-21T02:30Z", home: { team: BB_TEAMS.lal, lines: home }, away: { team: BB_TEAMS.bos, lines: away }, status: st, ...extra };
}

/** Duke (home) vs Vermont (away), a men's college game of two halves. */
function ncaam(st: BbEventFixture["status"], home?: number[], away?: number[]): BbEventFixture {
  return { id: "401745001", date: "2026-03-20T16:15Z", home: { team: BB_TEAMS.duke, lines: home, rank: 2 }, away: { team: BB_TEAMS.vermont, lines: away }, status: st, neutralSite: true };
}

function snapshotOf(e: BbEventFixture, path: BasketballPath = "nba"): GameSnapshot {
  const [snap] = parseScoreboardSnapshots(bbScoreboard([e], path));
  expect(snap).toBeDefined();
  return snap;
}

const live = (e: BbEventFixture, path: BasketballPath = "nba", xIsHome = true) => toLiveUpdate(snapshotOf(e, path), xIsHome, NOW);

const quarters = withRules({ periods: "quarters", reverse: false, boardSize: 100, freshNumbers: false });
const halves = withRules({ periods: "halves", reverse: false, boardSize: 100, freshNumbers: false });

function boardOf(format: GameFormat, league: League, scores: GameState["scores"] = []): Pick<GameState, "game" | "scores" | "manualWinners"> {
  return {
    game: { format, league, sport: "basketball", periods: [], numbers: null } as unknown as GameState["game"],
    scores,
    manualWinners: [],
  };
}

describe("basketball URLs", () => {
  it("reads each league's scoreboard under basketball", () => {
    const path = (league: Parameters<typeof scoreboardUrl>[0]) => new URL(scoreboardUrl(league)).pathname;
    expect(path("nba")).toBe("/apis/site/v2/sports/basketball/nba/scoreboard");
    expect(path("wnba")).toBe("/apis/site/v2/sports/basketball/wnba/scoreboard");
    expect(path("ncaab")).toBe("/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard");
    expect(path("ncaaw")).toBe("/apis/site/v2/sports/basketball/womens-college-basketball/scoreboard");
    // Football is where it was.
    expect(path("nfl")).toBe("/apis/site/v2/sports/football/nfl/scoreboard");
  });

  it("asks one day at a time", () => {
    const url = new URL(scoreboardUrl("nba", Date.UTC(2026, 2, 20)));
    expect(url.searchParams.get("dates")).toBe("20260320");
    expect(url.searchParams.has("groups")).toBe(false);
    expect(url.searchParams.has("week")).toBe(false);
  });

  it("asks for all of Division I college basketball, men's and women's", () => {
    const url = new URL(scoreboardUrl("ncaab", Date.UTC(2026, 2, 20)));
    expect(url.searchParams.get("groups")).toBe("50");
    expect(Number(url.searchParams.get("limit"))).toBeGreaterThanOrEqual(300);
    const women = new URL(scoreboardUrl("ncaaw", Date.UTC(2026, 2, 20)));
    expect(women.searchParams.get("groups")).toBe("50");
    expect(Number(women.searchParams.get("limit"))).toBeGreaterThanOrEqual(300);
  });

  it("builds the summary URL", () => {
    expect(summaryUrl("ncaab", "401745001")).toBe(
      "https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/summary?event=401745001",
    );
  });

  it("reads day ids", () => {
    expect(parseDayId("20260320")).toBe(Date.UTC(2026, 2, 20));
    expect(parseDayId("20280229")).toBe(Date.UTC(2028, 1, 29));
    for (const bad of ["", "2026032", "202603200", "20260230", "20261301", "2026-03-20", "1999 0101", "19990101"]) expect(parseDayId(bad)).toBeNull();
  });
});

describe("basketball schedule", () => {
  it("maps NBA events with team names, abbreviations and colors", () => {
    const [event] = parseSchedule(bbScoreboard([nba(bbStatus.scheduled())]), "nba");
    expect(event).toEqual({
      eventId: "401705001",
      league: "nba",
      name: "Boston Celtics at Los Angeles Lakers",
      shortName: "BOS @ LAL",
      startsAt: Date.parse("2026-03-21T02:30:00Z"),
      home: { name: "Los Angeles Lakers", abbr: "LAL", color: "#552583" },
      away: { name: "Boston Celtics", abbr: "BOS", color: "#008348" },
      state: "pre",
      venue: { name: "Test Arena", city: "Testville", country: "USA" },
    });
  });

  it("keeps college ranks and tournament neutral sites", () => {
    const sb = bbScoreboard([ncaam(bbStatus.scheduled())], "mens-college-basketball");
    const [event] = parseSchedule(sb, "ncaab");
    expect(event).toMatchObject({ league: "ncaab", ranks: { home: 2 }, neutralSite: true, away: { name: "Vermont Catamounts", abbr: "UVM" } });
    expect(event.away.color).toBeUndefined();
    const [literal] = parseSchedule({ events: [LITERAL_NCAAM_HALFTIME] }, "ncaab");
    expect(literal).toMatchObject({ ranks: { home: 2 }, state: "in", neutralSite: true, venue: { city: "Raleigh" } });
  });

  it("skips unannounced tournament slots", () => {
    const sb = bbScoreboard([ncaam(bbStatus.scheduled()), { ...ncaam(bbStatus.scheduled()), id: "2", away: { team: BB_TEAMS.tbd } }], "mens-college-basketball");
    expect(parseSchedule(sb, "ncaab").map((e) => e.eventId)).toEqual(["401745001"]);
  });

  it("reports each game's state", () => {
    const sb = bbScoreboard([
      nba(bbStatus.scheduled()),
      { ...nba(bbStatus.inProgress(3, "5:32"), [28, 31, 12], [30, 26, 9]), id: "2" },
      { ...nba(bbStatus.final(4), [28, 31, 24, 27], [30, 26, 29, 20]), id: "3" },
    ]);
    expect(parseSchedule(sb, "nba").map((e) => e.state)).toEqual(["pre", "in", "post"]);
  });
});

describe("basketball live: quarters (NBA, WNBA, women's college)", () => {
  it("before tip-off: no periods, zero scores", () => {
    const u = live(nba(bbStatus.scheduled()));
    expect(u).toMatchObject({ live: { state: "pre", period: 0, scoreX: 0, scoreY: 0 }, linescoresX: [], completedPeriods: 0, isFinal: false });
  });

  it("mid-quarter (Q3 5:32): two quarters complete, the third absorbs the running score", () => {
    const u = live(nba(bbStatus.inProgress(3, "5:32"), [28, 31, 12], [30, 26, 9]));
    expect(u.live).toMatchObject({ state: "in", period: 3, clock: "5:32", detail: "5:32 - 3rd", scoreX: 71, scoreY: 65 });
    expect(u.linescoresX).toEqual([28, 31, 12]);
    expect(u.completedPeriods).toBe(2);
    const scores = periodScoresFromLinescores(quarters, u, { sport: "basketball", league: "nba" });
    expect(scores.map((s) => `${s.periodKey} ${s.scoreX}-${s.scoreY}`)).toEqual(["q1 28-30", "q2 59-56"]);
  });

  it("reads a clock in tenths in the last minute", () => {
    const u = live(nba(bbStatus.inProgress(4, "45.2"), [28, 31, 24, 20], [30, 26, 29, 21]));
    expect(u.live).toMatchObject({ clock: "45.2", detail: "45.2 - 4th", period: 4 });
    expect(u.completedPeriods).toBe(3);
  });

  it("end of the 1st quarter decides Q1", () => {
    const u = live(nba(bbStatus.endOfPeriod(1), [28], [30]));
    expect(u.completedPeriods).toBe(1);
    expect(u.live.detail).toBe("End of 1st");
    expect(periodScoresFromLinescores(quarters, u, { league: "wnba" })).toEqual([{ periodKey: "q1", label: "Q1", scoreX: 28, scoreY: 30 }]);
  });

  it("halftime decides the half", () => {
    const u = live(nba(bbStatus.halftime(), [28, 31], [30, 26]));
    expect(u.live).toMatchObject({ state: "in", period: 2, detail: "Halftime" });
    expect(u.completedPeriods).toBe(2);
    expect(periodScoresFromLinescores(halves, u, { league: "nba" })).toEqual([{ periodKey: "q2", label: "Half", scoreX: 59, scoreY: 56 }]);
  });

  it("scores over 100 parse and only the totals matter", () => {
    const u = live(nba(bbStatus.inProgress(4, "2:10"), [28, 31, 24, 21], [30, 26, 29, 18]));
    expect([u.live.scoreX, u.live.scoreY]).toEqual([104, 103]);
  });

  it("an overtime final includes overtime", () => {
    const u = live(nba(bbStatus.final(5), [28, 31, 24, 27, 11], [30, 26, 29, 25, 7]));
    expect(u.live).toMatchObject({ state: "post", period: 5, detail: "Final/OT", scoreX: 121, scoreY: 117 });
    expect(u.completedPeriods).toBe(5);
    expect(u.isFinal).toBe(true);
    const scores = periodScoresFromLinescores(quarters, u, { league: "nba" });
    expect(scores.map((s) => `${s.periodKey} ${s.scoreX}-${s.scoreY}`)).toEqual(["q1 28-30", "q2 59-56", "q3 83-85", "final 121-117"]);
  });

  it("overtime in progress: regulation complete, still playing for the final", () => {
    const u = live(nba(bbStatus.inProgress(6, "3:01"), [28, 31, 24, 27, 9, 4], [30, 26, 29, 25, 9, 2]));
    expect(u.live).toMatchObject({ period: 6, detail: "3:01 - 2OT" });
    expect(u.completedPeriods).toBe(5);
    expect(u.isFinal).toBe(false);
    expect(periodKeyForLive(quarters, 6, { league: "nba" })).toBe("final");
  });

  it("parses a literal NBA overtime final", () => {
    const [snap] = parseScoreboardSnapshots({ events: [LITERAL_NBA_OT_FINAL] });
    const u = toLiveUpdate(snap, false, NOW); // X = Boston (away)
    expect(u.live).toMatchObject({ state: "post", scoreX: 117, scoreY: 121, detail: "Final/OT" });
    expect(u.linescoresX).toEqual([30, 26, 29, 25, 7]);
    expect(u.completedPeriods).toBe(5);
    const final = periodScoresFromLinescores(quarters, u, { league: "nba" }).find((s) => s.periodKey === "final");
    expect(final).toMatchObject({ scoreX: 117, scoreY: 121 });
  });

  it("women's college plays quarters too", () => {
    const e: BbEventFixture = { id: "9", date: "2026-03-21T00:00Z", home: { team: BB_TEAMS.sc, lines: [18, 20, 15] }, away: { team: BB_TEAMS.uconn, lines: [16, 19, 21] }, status: bbStatus.endOfPeriod(3) };
    const u = live(e, "womens-college-basketball");
    expect(u.completedPeriods).toBe(3);
    expect(periodScoresFromLinescores(quarters, u, { league: "ncaaw" }).map((s) => s.periodKey)).toEqual(["q1", "q2", "q3"]);
  });
});

describe("basketball live: men's college halves", () => {
  const kind = { sport: "basketball" as const, league: "ncaab" as const };

  it("1st half in progress: nothing complete, playing for halftime", () => {
    const u = live(ncaam(bbStatus.inProgress(1, "8:14", "halves"), [22], [17]), "mens-college-basketball");
    expect(u.live).toMatchObject({ period: 1, detail: "8:14 - 1st Half", scoreX: 22, scoreY: 17 });
    expect(u.completedPeriods).toBe(0);
    expect(periodScoresFromLinescores(halves, u, kind)).toEqual([]);
    expect(periodKeyForLive(halves, 1, kind)).toBe("q2");
  });

  it("halftime is period 1 and decides the half from the 1st half alone", () => {
    const u = live(ncaam(bbStatus.halftime("halves"), [41], [33]), "mens-college-basketball");
    expect(u.live).toMatchObject({ state: "in", period: 1, detail: "Halftime" });
    expect(u.completedPeriods).toBe(1);
    expect(periodScoresFromLinescores(halves, u, kind)).toEqual([{ periodKey: "q2", label: "Half", scoreX: 41, scoreY: 33 }]);
    // Read as quarters, period 1 would have been Q1: the league is what says halves.
    expect(periodScoresFromLinescores(halves, u)).toEqual([]);
  });

  it("parses a literal men's college halftime", () => {
    const [snap] = parseScoreboardSnapshots({ events: [LITERAL_NCAAM_HALFTIME] });
    const u = toLiveUpdate(snap, true, NOW);
    expect(u.completedPeriods).toBe(1);
    expect(periodScoresFromLinescores(halves, u, kind)).toEqual([{ periodKey: "q2", label: "Half", scoreX: 41, scoreY: 33 }]);
  });

  it("2nd half in progress: halftime done, playing for the final", () => {
    const u = live(ncaam(bbStatus.inProgress(2, "12:41", "halves"), [41, 20], [33, 18]), "mens-college-basketball");
    expect(u.live).toMatchObject({ period: 2, detail: "12:41 - 2nd Half", scoreX: 61, scoreY: 51 });
    expect(u.completedPeriods).toBe(1);
    expect(periodKeyForLive(halves, 2, kind)).toBe("final");
    const board = boardOf(halves, "ncaab", [{ periodKey: "q2", scoreX: 41, scoreY: 33, source: "live", updatedAt: NOW }]);
    expect(periodInPlay(board, 2)).toBe("final");
  });

  it("the end of regulation in a tie isn't final", () => {
    const u = live(ncaam(bbStatus.endOfPeriod(2, "halves"), [41, 30], [33, 38]), "mens-college-basketball");
    expect(u.live.detail).toBe("End of 2nd Half");
    expect(u.completedPeriods).toBe(2);
    expect(u.isFinal).toBe(false);
    expect(periodScoresFromLinescores(halves, u, kind).map((s) => s.periodKey)).toEqual(["q2"]);
  });

  it("an overtime final counts overtime toward the final", () => {
    const u = live(ncaam(bbStatus.final(3, "halves"), [41, 30, 9], [33, 38, 5]), "mens-college-basketball");
    expect(u.live).toMatchObject({ state: "post", period: 3, detail: "Final/OT", scoreX: 80, scoreY: 76 });
    expect(u.completedPeriods).toBe(3);
    expect(periodScoresFromLinescores(halves, u, kind)).toEqual([
      { periodKey: "q2", label: "Half", scoreX: 41, scoreY: 33 },
      { periodKey: "final", label: "Final", scoreX: 80, scoreY: 76 },
    ]);
  });

  it("a final-only board waits for the end", () => {
    const final = withRules({ periods: "final", reverse: false, boardSize: 100, freshNumbers: false, rules: rulesForPreset("final", true) });
    const u = live(ncaam(bbStatus.halftime("halves"), [41], [33]), "mens-college-basketball");
    expect(periodScoresFromLinescores(final, u, kind)).toEqual([]);
    expect(periodKeyForLive(final, 1, kind)).toBe("final");
  });

  it("reads the summary endpoint the same way", () => {
    const snap = parseSummarySnapshot(bbSummary(ncaam(bbStatus.halftime("halves"), [41], [33]), "mens-college-basketball"));
    expect(snap).not.toBeNull();
    const u = toLiveUpdate(snap!, true, NOW);
    expect(u.completedPeriods).toBe(1);
    expect(u.linescoresX).toEqual([41]);
  });
});
