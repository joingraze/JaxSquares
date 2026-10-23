// ESPN's soccer feed as the app reads it (worker/scores/espn.ts): the
// scoreboard's `details` and the summary's `keyEvents` become a match's goals
// (minutes as shown, stoppage time kept, own goals for the team they count
// for, shootout kicks left out), oriented to the board. The shapes are the
// ones the probe logged (worker/scores/espn.probe.ts, "soccer: what ESPN sends").

import { describe, expect, it } from "vitest";
import { parseGoals, parseScoreboardSnapshots, parseSummarySnapshot, scoreboardUrl, summaryUrl, toLiveUpdate } from "./espn";

const detail = (displayValue: string, value: number, team: string, extra: Record<string, unknown> = {}) => ({
  type: { text: "Goal" },
  clock: { value, displayValue },
  team: { id: team },
  scoringPlay: true,
  shootout: false,
  ownGoal: false,
  ...extra,
});

const competition = (details: unknown[], status: Record<string, unknown>, home = 2, away = 1) => ({
  id: "740700",
  date: "2025-10-18T14:00Z",
  competitors: [
    { id: "359", homeAway: "home", team: { id: "359", abbreviation: "ARS", displayName: "Arsenal", color: "ef0107" }, score: String(home) },
    { id: "363", homeAway: "away", team: { id: "363", abbreviation: "CHE", displayName: "Chelsea", color: "034694" }, score: String(away) },
  ],
  status,
  details,
});

const LIVE = { period: 2, clock: 5400, displayClock: "90'+3'", type: { name: "STATUS_SECOND_HALF", state: "in", completed: false, shortDetail: "90'+3'" } };
const DETAILS = [
  detail("11'", 612, "359"),
  { type: { text: "Yellow Card" }, clock: { value: 900, displayValue: "15'" }, team: { id: "363" }, scoringPlay: false },
  detail("45'+2'", 2700, "363", { type: { text: "Goal - Header" } }),
  detail("90'+1'", 5400, "359", { type: { text: "Own Goal" }, ownGoal: true }),
];

describe("soccer goals from ESPN", () => {
  it("reads the scoreboard's scoring plays with their minutes, in order", () => {
    const [snap] = parseScoreboardSnapshots({ events: [{ id: "740700", competitions: [competition(DETAILS, LIVE)] }] }, { goals: true });
    expect(snap.goals).toEqual([
      { minute: 11, added: 0, side: "home" },
      { minute: 45, added: 2, side: "away" },
      // An own goal counts for the team ESPN names (the one it went in for).
      { minute: 90, added: 1, side: "home" },
    ]);
    expect(snap.clock).toBe("90'+3'");
  });

  it("leaves goals out unless asked (football and basketball never read them)", () => {
    const [snap] = parseScoreboardSnapshots({ events: [{ id: "740700", competitions: [competition(DETAILS, LIVE)] }] });
    expect(snap.goals).toBeUndefined();
  });

  it("skips the shootout's kicks, and falls back to the clock's seconds without its text", () => {
    const home = { id: "364", team: { id: "364" } };
    const away = { id: "160", team: { id: "160" } };
    const goals = parseGoals(
      [
        detail("12'", 686, "160"),
        detail("120'", 7200, "160", { shootout: true }),
        detail("120'", 7200, "364", { shootout: true }),
        { clock: { value: 4210 }, team: { id: "364" }, scoringPlay: true },
        { clock: { value: 6600, displayValue: "110'" }, team: { id: "160" }, scoringPlay: true },
      ],
      home,
      away,
    );
    expect(goals).toEqual([
      { minute: 12, added: 0, side: "away" },
      { minute: 71, added: 0, side: "home" },
      { minute: 110, added: 0, side: "away" },
    ]);
    expect(parseGoals(undefined, home, away)).toBeUndefined();
    expect(parseGoals([], home, away)).toEqual([]);
  });

  it("reads the summary's key events when the match isn't on its scoreboard", () => {
    const summary = {
      header: { id: "740700", competitions: [competition([], LIVE)] },
      keyEvents: [
        { type: { text: "Kickoff" }, clock: { value: 0, displayValue: "0'" } },
        { type: { text: "Goal - Header" }, clock: { value: 2894, displayValue: "49'" }, team: { id: "363" }, scoringPlay: true, shootout: false },
      ],
    };
    expect(parseSummarySnapshot(summary, { goals: true })?.goals).toEqual([{ minute: 49, added: 0, side: "away" }]);
    expect(parseSummarySnapshot(summary)?.goals).toBeUndefined();
  });

  it("orients the goals to the board's teams", () => {
    const [snap] = parseScoreboardSnapshots({ events: [{ id: "740700", competitions: [competition(DETAILS, LIVE)] }] }, { goals: true });
    const homeOnTop = toLiveUpdate(snap, true, 1);
    expect(homeOnTop.goals?.map((g) => g.team)).toEqual(["x", "y", "x"]);
    expect(homeOnTop.live).toMatchObject({ state: "in", clock: "90'+3'", scoreX: 2, scoreY: 1 });
    const awayOnTop = toLiveUpdate(snap, false, 1);
    expect(awayOnTop.goals?.map((g) => g.team)).toEqual(["y", "x", "y"]);
  });

  it("calls a match over at full time, after extra time or penalties", () => {
    for (const name of ["STATUS_FULL_TIME", "STATUS_FINAL_AET", "STATUS_FINAL_PEN"]) {
      const status = { period: name === "STATUS_FULL_TIME" ? 2 : 5, clock: 5400, displayClock: "90'+4'", type: { name, state: "post", completed: true, shortDetail: "FT" } };
      const [snap] = parseScoreboardSnapshots({ events: [{ id: "740700", competitions: [competition(DETAILS, status)] }] }, { goals: true });
      const update = toLiveUpdate(snap, true, 1);
      expect(update.isFinal).toBe(true);
      expect(update.goals).toHaveLength(3);
    }
  });

  it("asks ESPN for a soccer league's scoreboard by day and its summary", () => {
    expect(scoreboardUrl("epl", Date.UTC(2025, 9, 18))).toBe("https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/scoreboard?dates=20251018");
    expect(scoreboardUrl("ucl", Date.UTC(2025, 2, 11))).toContain("/soccer/uefa.champions/scoreboard?dates=20250311");
    expect(summaryUrl("mls", "733144")).toBe("https://site.api.espn.com/apis/site/v2/sports/soccer/usa.1/summary?event=733144");
  });
});
