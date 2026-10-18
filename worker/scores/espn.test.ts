// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  espnDate,
  parseSchedule,
  parseScoreboardSnapshots,
  parseSummarySnapshot,
  scoreboardUrl,
  summaryUrl,
  toLiveUpdate,
  type GameSnapshot,
} from "./espn";
import { LITERAL_FINAL_EVENT, scoreboard, status, summary, TEAMS, type EventFixture } from "./espn.fixtures";

const NOW = Date.parse("2026-10-18T19:00:00Z");

/** KC (home) vs BUF (away), with whatever status/lines a test needs. */
function game(st: EventFixture["status"], home?: number[], away?: number[], extra: Partial<EventFixture> = {}): EventFixture {
  return {
    id: "401773001",
    date: "2026-10-18T17:00Z",
    home: { team: TEAMS.kc, lines: home },
    away: { team: TEAMS.buf, lines: away },
    status: st,
    ...extra,
  };
}

function snapshotOf(e: EventFixture): GameSnapshot {
  const [snap] = parseScoreboardSnapshots(scoreboard([e]));
  expect(snap).toBeDefined();
  return snap;
}

function live(e: EventFixture, xIsHome = true) {
  return toLiveUpdate(snapshotOf(e), xIsHome, NOW);
}

describe("URLs", () => {
  it("formats ESPN dates in UTC", () => {
    expect(espnDate(Date.parse("2026-10-19T00:20:00Z"))).toBe("20261019");
  });

  it("builds the current-slate scoreboard URL with no dates", () => {
    expect(scoreboardUrl("nfl")).toBe("https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard");
  });

  it("builds a single-day scoreboard URL (ESPN rejects date ranges)", () => {
    const url = new URL(scoreboardUrl("nfl", Date.parse("2026-10-17T00:00Z")));
    expect(url.origin + url.pathname).toBe("https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard");
    expect(url.searchParams.get("dates")).toBe("20261017");
    expect(url.searchParams.has("groups")).toBe(false);
  });

  it("limits college to FBS", () => {
    const url = new URL(scoreboardUrl("ncaaf", NOW));
    expect(url.pathname).toBe("/apis/site/v2/sports/football/college-football/scoreboard");
    expect(url.searchParams.get("groups")).toBe("80");
    expect(url.searchParams.get("limit")).toBe("300");
  });

  it("builds the summary URL", () => {
    expect(summaryUrl("nfl", "401773001")).toBe(
      "https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=401773001",
    );
  });
});

describe("parseSchedule", () => {
  it("maps events to ScheduleEvent with ESPN team names, abbreviations and colors", () => {
    const [event] = parseSchedule(scoreboard([game(status.scheduled())]), "nfl");
    expect(event).toEqual({
      eventId: "401773001",
      league: "nfl",
      name: "Buffalo Bills at Kansas City Chiefs",
      shortName: "BUF @ KC",
      startsAt: Date.parse("2026-10-18T17:00:00Z"),
      home: { name: "Kansas City Chiefs", abbr: "KC", color: "#e31837" },
      away: { name: "Buffalo Bills", abbr: "BUF", color: "#00338d" },
      state: "pre",
    });
  });

  it("omits color when ESPN has none and lowercases hex", () => {
    const sb = scoreboard([
      { id: "401760100", date: "2026-10-17T19:30Z", home: { team: TEAMS.uga }, away: { team: TEAMS.app }, status: status.scheduled() },
    ]);
    const [event] = parseSchedule(sb, "ncaaf");
    expect(event.league).toBe("ncaaf");
    expect(event.away).toEqual({ name: "App State Mountaineers", abbr: "APP" });
    expect(event.home.color).toBe("#ba0c2f");

    const [literal] = parseSchedule({ events: [LITERAL_FINAL_EVENT] }, "nfl");
    expect(literal.home.color).toBe("#06424d");
    expect(literal.state).toBe("post");
  });

  it("reports each game's state", () => {
    const sb = scoreboard([
      game(status.scheduled()),
      { ...game(status.inProgress(2, "4:12"), [7, 3], [0, 7]), id: "2" },
      { ...game(status.final(), [7, 3, 0, 7], [0, 7, 3, 3]), id: "3" },
    ]);
    expect(parseSchedule(sb, "nfl").map((e) => e.state)).toEqual(["pre", "in", "post"]);
  });

  it("skips unannounced matchups and malformed events", () => {
    const sb = scoreboard([
      game(status.scheduled()),
      { ...game(status.scheduled()), id: "2", away: { team: TEAMS.tbd } },
      { ...game(status.scheduled()), id: "3", date: "not a date" },
    ]);
    const raw = sb as { events: unknown[] };
    raw.events.push({ id: "4", competitions: [{ competitors: [] }] }, null, "junk");
    expect(parseSchedule(sb, "nfl").map((e) => e.eventId)).toEqual(["401773001"]);
  });

  it("returns nothing for a non-scoreboard body", () => {
    expect(parseSchedule({ code: 404 }, "nfl")).toEqual([]);
    expect(parseSchedule(null, "nfl")).toEqual([]);
  });
});

describe("live updates", () => {
  it("before kickoff: no periods, zero scores", () => {
    const u = live(game(status.scheduled()));
    expect(u).toEqual({
      live: { state: "pre", period: 0, clock: "0:00", detail: "10/18 - 1:00 PM EDT", scoreX: 0, scoreY: 0, updatedAt: NOW },
      linescoresX: [],
      linescoresY: [],
      completedPeriods: 0,
      isFinal: false,
    });
  });

  it("Q2 in progress: Q1 complete", () => {
    const u = live(game(status.inProgress(2, "4:12"), [7, 3], [0, 7]));
    expect(u.live).toMatchObject({ state: "in", period: 2, clock: "4:12", detail: "4:12 - 2nd", scoreX: 10, scoreY: 7 });
    expect(u.linescoresX).toEqual([7, 3]);
    expect(u.linescoresY).toEqual([0, 7]);
    expect(u.completedPeriods).toBe(1);
    expect(u.isFinal).toBe(false);
  });

  it("does not end a period just because the clock reads 0:00", () => {
    // e.g. touchdown as the half expires, PAT still to come
    expect(live(game(status.inProgress(2, "0:00"), [7, 6], [0, 7])).completedPeriods).toBe(1);
  });

  it("end of the 1st quarter counts Q1 complete", () => {
    const u = live(game(status.endOfPeriod(1), [7], [3]));
    expect(u.completedPeriods).toBe(1);
    expect(u.live.detail).toBe("End of 1st");
    expect(u.linescoresX).toEqual([7]);
  });

  it("halftime counts both first-half quarters complete", () => {
    const u = live(game(status.halftime(), [7, 3], [0, 14]));
    expect(u.live).toMatchObject({ state: "in", period: 2, detail: "Halftime" });
    expect(u.completedPeriods).toBe(2);
    expect(u.linescoresY).toEqual([0, 14]);
  });

  it("Q4 in progress: three quarters complete", () => {
    const u = live(game(status.inProgress(4, "8:03"), [7, 3, 0, 7], [0, 7, 3, 0]));
    expect(u.completedPeriods).toBe(3);
    expect(u.live).toMatchObject({ period: 4, scoreX: 17, scoreY: 10 });
    expect(u.linescoresX).toHaveLength(4);
  });

  it("end of regulation in a tie is four periods complete but not final", () => {
    const u = live(game(status.endOfPeriod(4), [7, 3, 0, 7], [0, 7, 3, 7]));
    expect(u.completedPeriods).toBe(4);
    expect(u.isFinal).toBe(false);
  });

  it("overtime in progress: regulation complete, OT is period 5", () => {
    const u = live(game(status.inProgress(5, "6:21"), [7, 3, 0, 7, 3], [0, 7, 3, 7, 0]));
    expect(u.live).toMatchObject({ state: "in", period: 5, detail: "6:21 - OT", scoreX: 20, scoreY: 17 });
    expect(u.completedPeriods).toBe(4);
    expect(u.linescoresX).toEqual([7, 3, 0, 7, 3]);
  });

  it("final: every period complete", () => {
    const u = live(game(status.final(), [7, 3, 0, 14], [0, 7, 3, 3]));
    expect(u.live).toMatchObject({ state: "post", period: 4, detail: "Final", scoreX: 24, scoreY: 13 });
    expect(u.completedPeriods).toBe(4);
    expect(u.isFinal).toBe(true);
  });

  it("final in overtime includes the OT period", () => {
    const u = live(game(status.final(5), [7, 3, 0, 7, 6], [0, 7, 3, 7, 0]));
    expect(u.completedPeriods).toBe(5);
    expect(u.live.detail).toBe("Final/OT");
    expect(u.linescoresX).toEqual([7, 3, 0, 7, 6]);
    expect(u.isFinal).toBe(true);
  });

  it("parses a literal scoreboard event", () => {
    const [snap] = parseScoreboardSnapshots({ events: [LITERAL_FINAL_EVENT] });
    const u = toLiveUpdate(snap, false, NOW); // X = Dallas (away)
    expect(u.live).toMatchObject({ state: "post", scoreX: 20, scoreY: 27 });
    expect(u.linescoresX).toEqual([3, 7, 7, 3]);
    expect(u.linescoresY).toEqual([7, 10, 0, 10]);
    expect(u.completedPeriods).toBe(4);
  });

  describe("orientation", () => {
    const e = game(status.inProgress(3, "11:40"), [7, 3, 0], [0, 14, 6]);

    it("xIsHome puts the home team on X", () => {
      const u = live(e, true);
      expect([u.live.scoreX, u.live.scoreY]).toEqual([10, 20]);
      expect(u.linescoresX).toEqual([7, 3, 0]);
      expect(u.linescoresY).toEqual([0, 14, 6]);
    });

    it("!xIsHome puts the away team on X", () => {
      const u = live(e, false);
      expect([u.live.scoreX, u.live.scoreY]).toEqual([20, 10]);
      expect(u.linescoresX).toEqual([0, 14, 6]);
      expect(u.linescoresY).toEqual([7, 3, 0]);
    });

    it("falls back to ESPN's competitor order when homeAway is missing", () => {
      const sb = scoreboard([e]) as unknown as { events: { competitions: { competitors: { homeAway?: string }[] }[] }[] };
      for (const c of sb.events[0].competitions[0].competitors) delete c.homeAway;
      const [snap] = parseScoreboardSnapshots(sb);
      expect(snap.home.score).toBe(10); // competitors[0] is the home team
    });
  });

  describe("imperfect data", () => {
    it("credits points to the current period when the score updates before the linescores", () => {
      const e = game(status.inProgress(2, "1:55"), [7, 0], [3, 0]);
      e.home.score = 14;
      const u = live(e);
      expect(u.live.scoreX).toBe(14);
      expect(u.linescoresX).toEqual([7, 7]);
      expect(u.completedPeriods).toBe(1);
    });

    it("at end of a period the score settles that period", () => {
      const e = game(status.endOfPeriod(1), [], []);
      e.home.score = 7;
      const u = live(e);
      expect(u.linescoresX).toEqual([7]);
      expect(u.linescoresY).toEqual([0]);
      expect(u.completedPeriods).toBe(1);
    });

    it("holds back periods ESPN hasn't reported yet instead of inventing them", () => {
      const e = game(status.inProgress(3, "9:00"), [7], [3]);
      e.home.score = 17;
      e.away.score = 10;
      const u = live(e);
      expect(u.completedPeriods).toBe(1);
      expect(u.linescoresX).toEqual([7]);
      expect(u.linescoresY).toEqual([3]);
      expect(u.live).toMatchObject({ scoreX: 17, scoreY: 10 });
    });

    it("places linescores by their period number", () => {
      const sb = scoreboard([game(status.inProgress(3, "9:00"), [7, 3, 0], [0, 7, 3])]) as unknown as {
        events: { competitions: { competitors: { linescores: unknown[] }[] }[] }[];
      };
      sb.events[0].competitions[0].competitors[0].linescores.reverse();
      const u = toLiveUpdate(parseScoreboardSnapshots(sb)[0], true, NOW);
      expect(u.linescoresX).toEqual([7, 3, 0]);
    });

    it("recognizes a break from the detail text when the status name is unfamiliar", () => {
      const st = status.endOfPeriod(3);
      st.type.name = "STATUS_SOMETHING_NEW";
      expect(live(game(st, [7, 3, 0], [0, 7, 3])).completedPeriods).toBe(3);
    });

    it("a postponed game is not final and has nothing complete", () => {
      const u = live(game(status.postponed()));
      expect(u.live).toMatchObject({ state: "post", detail: "Postponed" });
      expect(u.isFinal).toBe(false);
      expect(u.completedPeriods).toBe(0);
    });

    it("a game called off mid-quarter is not final and doesn't award that quarter", () => {
      const st = status.inProgress(1, "5:58");
      st.type = { ...st.type, name: "STATUS_CANCELED", state: "post", description: "Canceled", detail: "Canceled", shortDetail: "Canceled" };
      const u = live(game(st, [3], [7]));
      expect(u.isFinal).toBe(false);
      expect(u.completedPeriods).toBe(0);
      expect(u.live.scoreY).toBe(7);
    });
  });
});

describe("parseSummarySnapshot", () => {
  it("reads the competition under header, including displayValue-only linescores", () => {
    const snap = parseSummarySnapshot(summary(game(status.halftime(), [7, 3], [0, 14])));
    expect(snap).not.toBeNull();
    const u = toLiveUpdate(snap!, false, NOW);
    expect(snap!.eventId).toBe("401773001");
    expect(u.live).toMatchObject({ state: "in", detail: "Halftime", scoreX: 14, scoreY: 10 });
    expect(u.linescoresX).toEqual([0, 14]);
    expect(u.linescoresY).toEqual([7, 3]);
    expect(u.completedPeriods).toBe(2);
  });

  it("returns null for an unexpected body", () => {
    expect(parseSummarySnapshot({ code: 404, message: "not found" })).toBeNull();
    expect(parseSummarySnapshot({ header: { id: "1", competitions: [] } })).toBeNull();
  });
});
