// Goal-minute soccer squares (shared/soccer.ts and the soccer paths of
// shared/squares.ts): which square a minute is, the feed's goals, and who
// wins the first goal, every goal and the last goal.

import { describe, expect, it } from "vitest";
import { periodPhrase, rulesForPreset, rulesSummary, withRules } from "./formats";
import {
  boardMinute,
  goalMinuteText,
  goalsFromFeed,
  minuteCell,
  minuteDigits,
  minuteText,
  parseMinute,
  periodsDecidedBy,
  reverseMinuteCell,
  squareMinute,
} from "./soccer";
import { boardPeriods, liveCell, momentInPlay, resolveResults, restSoFar, upcomingPeriod, type ResultsInput } from "./squares";
import type { Game, GameFormat, LiveGoal, LiveStatus, ManualWinner, MomentRule, NumberDraw, Score, Square } from "./types";

// Column i / row i hold digit i: the 43rd minute is row 4, column 3.
const IDENTITY: NumberDraw = {
  x: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => [d]),
  y: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => [d]),
};
// A shuffled draw: column digits and row digits in another order.
const SHUFFLED: NumberDraw = {
  x: [7, 2, 9, 0, 4, 1, 8, 3, 6, 5].map((d) => [d]),
  y: [3, 8, 0, 5, 9, 4, 1, 6, 2, 7].map((d) => [d]),
};

function soccerGame(rules: MomentRule[], over: Partial<Game> = {}, format: Partial<GameFormat> = {}): Game {
  const f = withRules({ periods: "custom", reverse: false, boardSize: 100, freshNumbers: false, rules, ...format });
  return {
    id: "g1",
    name: "Derby squares",
    sport: "soccer",
    league: "custom",
    teamX: { name: "Arsenal", abbr: "ARS" },
    teamY: { name: "Chelsea", abbr: "CHE" },
    format: f,
    periods: [],
    prizes: {},
    maxPerPlayer: 0,
    numbers: { "*": IDENTITY },
    status: "locked",
    linkedEvent: null,
    hostPlayerId: "host",
    createdAt: 0,
    lockedAt: 0,
    ...over,
  };
}

const goal = (n: number, minute: number, added: number, scoreX: number, scoreY: number, extra: Partial<Score> = {}): Score => ({
  periodKey: `s${n}`,
  label: `Goal ${n}`,
  scoreX,
  scoreY,
  minute,
  added,
  source: "live",
  updatedAt: 0,
  ...extra,
});
const fullTime = (scoreX: number, scoreY: number): Score => ({ periodKey: "final", scoreX, scoreY, source: "live", updatedAt: 0 });
const sq = (row: number, col: number, playerId: string): Square => ({ row, col, playerId, claimedAt: 0 });
const input = (game: Game, squares: Square[], scores: Score[], manualWinners: ManualWinner[] = []): ResultsInput => ({ game, squares, scores, manualWinners });

const ALL = [...rulesForPreset("first-last", false), ...rulesForPreset("every-score", false)];

describe("the minute on the board", () => {
  it("counts 1st-half stoppage time as the 45th minute, and lets 2nd-half stoppage time run on", () => {
    expect(boardMinute(43)).toBe(43);
    expect(boardMinute(45, 2)).toBe(45);
    expect(boardMinute(46)).toBe(46);
    expect(boardMinute(90)).toBe(90);
    expect(boardMinute(90, 3)).toBe(93);
  });

  it("keeps extra time's last two digits, its 1st-half stoppage time on the 105th minute", () => {
    expect(boardMinute(105)).toBe(5);
    expect(boardMinute(105, 1)).toBe(5);
    expect(boardMinute(110)).toBe(10);
    expect(boardMinute(118)).toBe(18);
    expect(boardMinute(120, 2)).toBe(22);
    expect(boardMinute(1)).toBe(1);
  });

  it("reads the feed's minutes, and writes them back", () => {
    expect(parseMinute("45'+2'")).toEqual({ minute: 45, added: 2 });
    expect(parseMinute("90'+4")).toEqual({ minute: 90, added: 4 });
    expect(parseMinute("34'")).toEqual({ minute: 34, added: 0 });
    expect(parseMinute("105+1'")).toEqual({ minute: 105, added: 1 });
    expect(parseMinute("HT")).toBeNull();
    expect(parseMinute("FT")).toBeNull();
    expect(parseMinute("")).toBeNull();
    expect(parseMinute("999'")).toBeNull();
    expect(minuteText(45, 2)).toBe("45+2'");
    expect(minuteText(43)).toBe("43'");
    expect(goalMinuteText({ minute: 90, added: 4 })).toBe("90+4'");
    expect(goalMinuteText({})).toBeNull();
    expect(squareMinute(5)).toBe("05");
    expect(squareMinute(0)).toBe("00");
    expect(minuteDigits(43)).toEqual({ tens: 4, ones: 3 });
  });

  it("finds the square where the row's number (tens) meets the column's (ones)", () => {
    expect(minuteCell(43, IDENTITY)).toEqual({ row: 4, col: 3 });
    expect(reverseMinuteCell(43, IDENTITY)).toEqual({ row: 3, col: 4 });
    // Row 3 holds a 4 (y[5] = 4), column 7 holds a 3 (x[7] = 3).
    expect(minuteCell(43, SHUFFLED)).toEqual({ row: 5, col: 7 });
    // Every minute has its own square: 100 minutes, 100 squares.
    const cells = new Set(Array.from({ length: 100 }, (_, m) => JSON.stringify(minuteCell(m, SHUFFLED))));
    expect(cells.size).toBe(100);
  });

  it("puts two tens and two ones on each row and column of a 5x5 board", () => {
    const pairs: NumberDraw = { x: [[0, 1], [2, 3], [4, 5], [6, 7], [8, 9]], y: [[0, 1], [2, 3], [4, 5], [6, 7], [8, 9]] };
    expect(minuteCell(43, pairs)).toEqual({ row: 2, col: 1 });
    expect(minuteCell(52, pairs)).toEqual({ row: 2, col: 1 });
  });
});

describe("who wins", () => {
  it("gives the first goal, each goal and the last goal their minute's square, whoever scored", () => {
    const game = soccerGame(ALL);
    const scores = [goal(1, 12, 0, 1, 0), goal(2, 45, 2, 1, 1), goal(3, 90, 3, 2, 1), fullTime(2, 1)];
    const squares = [sq(1, 2, "ana"), sq(4, 5, "ben"), sq(9, 3, "cy")];
    const results = resolveResults(input(game, squares, scores));
    expect(results.map((r) => [r.periodKey, r.label, r.goalMinute, r.cell, r.winnerPlayerId])).toEqual([
      ["first", "1st goal", 12, { row: 1, col: 2 }, "ana"],
      ["s1", "Goal 1", 12, { row: 1, col: 2 }, "ana"],
      ["s2", "Goal 2", 45, { row: 4, col: 5 }, "ben"],
      ["s3", "Goal 3", 93, { row: 9, col: 3 }, "cy"],
      ["final", "Last goal", 93, { row: 9, col: 3 }, "cy"],
    ]);
    // The last goal's result carries the full-time score; a goal's, the score after it.
    expect(results.at(-1)?.score?.periodKey).toBe("final");
    expect(results[2].score).toMatchObject({ scoreX: 1, scoreY: 1, minute: 45, added: 2 });
    expect(results.every((r) => r.scoreKind === null)).toBe(true);
  });

  it("waits for the final whistle for the last goal", () => {
    const game = soccerGame(rulesForPreset("first-last", false));
    const results = resolveResults(input(game, [], [goal(1, 30, 0, 0, 1)]));
    expect(results.map((r) => r.periodKey)).toEqual(["first"]);
    expect(upcomingPeriod(input(game, [], [goal(1, 30, 0, 0, 1)]))?.key).toBe("final");
    expect(upcomingPeriod(input(game, [], []))?.key).toBe("first");
  });

  it("gives square 00 every goal moment once when the match ends without a goal", () => {
    const game = soccerGame(ALL);
    const squares = [sq(0, 0, "zed")];
    const results = resolveResults(input(game, squares, [fullTime(0, 0)]));
    expect(results.map((r) => [r.periodKey, r.label, r.goalMinute, r.winnerPlayerId])).toEqual([
      ["first", "1st goal", 0, "zed"],
      ["s1", "No goals", 0, "zed"],
      ["final", "Last goal", 0, "zed"],
    ]);
    // The host ending the board says the match is over too.
    const ended = resolveResults(input({ ...game, status: "final" }, squares, []));
    expect(ended.map((r) => r.periodKey)).toEqual(["first", "s1", "final"]);
    // Not before then.
    expect(resolveResults(input(game, squares, []))).toEqual([]);
  });

  it("takes reverse squares (the minute's digits swapped) and host picks", () => {
    const rules: MomentRule[] = [{ moment: "first", square: { amount: null, note: "" }, reverse: { amount: null, note: "" } }];
    const game = soccerGame(rules);
    const [r] = resolveResults(input(game, [sq(3, 4, "rev")], [goal(1, 34, 0, 1, 0)]));
    expect(r.cell).toEqual({ row: 3, col: 4 });
    expect(r.reverseCell).toEqual({ row: 4, col: 3 });
    const picked = resolveResults(input(game, [sq(7, 7, "pick")], [], [{ periodKey: "first", row: 7, col: 7, updatedAt: 0 }]));
    expect(picked[0]).toMatchObject({ winnerPlayerId: "pick", source: "host", goalMinute: null });
  });

  it("gives the last goal the rest of the board total", () => {
    const rules: MomentRule[] = [
      { moment: "score", square: { amount: 10, note: "" }, reverse: null },
      { moment: "final", square: { amount: null, note: "", rest: true }, reverse: null },
    ];
    const game = soccerGame(rules, {}, { squarePrice: 2 });
    const squares = [sq(1, 2, "a"), sq(4, 5, "b"), sq(6, 0, "c"), sq(0, 0, "d")];
    // 4 claimed squares x $2 = $8 board total; goal 1's $10 is claimed, so the rest is 0.
    const scores = [goal(1, 12, 0, 1, 0), goal(2, 60, 0, 2, 0), fullTime(2, 0)];
    const results = resolveResults(input(game, squares, scores));
    expect(results.find((r) => r.periodKey === "final")).toMatchObject({ amountIsRest: true, amount: 0, winnerPlayerId: "c" });
    expect(restSoFar(input(game, squares, scores))).toBe(0);
  });

  it("lists its periods in game order, goals named for goals", () => {
    const game = soccerGame(ALL);
    expect(boardPeriods(game, [goal(2, 50, 0, 1, 1), goal(1, 5, 0, 1, 0)]).map((p) => `${p.key}:${p.label}`)).toEqual([
      "first:1st goal",
      "s1:Goal 1",
      "s2:Goal 2",
      "final:Last goal",
    ]);
    expect(rulesSummary(game.format.rules!, "soccer")).toBe("Every goal + first & last goal");
    expect(rulesSummary(rulesForPreset("every-score", false), "soccer")).toBe("Every goal");
    expect(rulesSummary(rulesForPreset("first-last", false), "soccer")).toBe("First & last goal");
  });

  it("phrases soccer periods in goals, with or without the sport", () => {
    expect(periodPhrase("first", "1st goal", "soccer")).toEqual({ short: "1st goal", moment: "on the first goal" });
    expect(periodPhrase("final", "Last goal")).toEqual({ short: "Last goal", moment: "on the last goal" });
    expect(periodPhrase("final", "Final", "soccer").short).toBe("Last goal");
    expect(periodPhrase("s2", "Goal 2")).toEqual({ short: "Goal 2", moment: "on goal 2" });
    expect(periodPhrase("s1", "No goals", "soccer")).toEqual({ short: "No goals", moment: "with no goals" });
    // Football's unchanged.
    expect(periodPhrase("final", "Final")).toEqual({ short: "Final", moment: "at the final whistle" });
    expect(periodPhrase("s2", "Score 2").moment).toBe("on score 2");
  });
});

describe("live", () => {
  const live = (clock: string, state: LiveStatus["state"] = "in"): LiveStatus => ({ state, period: 1, clock, detail: clock, scoreX: 0, scoreY: 0, updatedAt: 0 });

  it("points at the square a goal now would land on, for the moment it would win", () => {
    const game = soccerGame(ALL);
    const state = { ...input(game, [sq(3, 4, "ana")], []), live: live("34'") };
    expect(liveCell(state)).toMatchObject({ periodKey: "first", cell: { row: 3, col: 4 }, playerId: "ana" });
    // First goal in: every goal is next.
    const later = { ...input(game, [], [goal(1, 20, 0, 1, 0)]), live: live("45'+2'") };
    expect(liveCell(later)).toMatchObject({ periodKey: null, cell: { row: 4, col: 5 } });
    expect(momentInPlay(later, 1).rule?.moment).toBe("score");
    // Halftime and full time show no minute.
    expect(liveCell({ ...state, live: live("HT") })).toBeNull();
    expect(liveCell({ ...state, live: { ...live("45'+4'"), detail: "HT" } })).toBeNull();
    expect(liveCell({ ...state, live: live("90'+4'", "post") })).toBeNull();
  });

  it("plays for the last goal when only it wins", () => {
    const game = soccerGame(rulesForPreset("final", false));
    expect(liveCell({ ...input(game, [], [goal(1, 20, 0, 1, 0)]), live: live("71'") })).toMatchObject({ periodKey: "final", cell: { row: 7, col: 1 } });
  });
});

describe("goals from the feed", () => {
  const g = (minute: number, added: number, team: "x" | "y"): LiveGoal => ({ minute, added, team });

  it("records each goal with the score after it", () => {
    const { entries, retracted } = goalsFromFeed([], [g(12, 0, "x"), g(45, 2, "y")], { scoreX: 1, scoreY: 1 });
    expect(entries).toEqual([
      { periodKey: "s1", label: "Goal 1", scoreX: 1, scoreY: 0, minute: 12, added: 0 },
      { periodKey: "s2", label: "Goal 2", scoreX: 1, scoreY: 1, minute: 45, added: 2 },
    ]);
    expect(retracted).toEqual([]);
  });

  it("writes nothing it already has, and corrects a goal's minute", () => {
    const scores = [goal(1, 12, 0, 1, 0)];
    expect(goalsFromFeed(scores, [g(12, 0, "x")], { scoreX: 1, scoreY: 0 }).entries).toEqual([]);
    expect(goalsFromFeed(scores, [g(13, 0, "x")], { scoreX: 1, scoreY: 0 }).entries).toEqual([
      { periodKey: "s1", label: "Goal 1", scoreX: 1, scoreY: 0, minute: 13, added: 0 },
    ]);
  });

  it("never touches a goal the host entered", () => {
    const scores = [goal(1, 10, 0, 1, 0, { source: "host" })];
    expect(goalsFromFeed(scores, [g(12, 0, "x")], { scoreX: 1, scoreY: 0 }).entries).toEqual([]);
  });

  it("takes back a goal ruled out, once the goals add up to the score", () => {
    const scores = [goal(1, 12, 0, 1, 0), goal(2, 50, 0, 2, 0)];
    // The score dropped but the list still has the goal: wait.
    expect(goalsFromFeed(scores, [g(12, 0, "x"), g(50, 0, "x")], { scoreX: 1, scoreY: 0 }).retracted).toEqual([]);
    // Both agree: goal 2 goes.
    expect(goalsFromFeed(scores, [g(12, 0, "x")], { scoreX: 1, scoreY: 0 }).retracted).toEqual(["s2"]);
    // A goal in the score before it's in the list: nothing taken back.
    expect(goalsFromFeed(scores, [g(12, 0, "x")], { scoreX: 3, scoreY: 0 }).retracted).toEqual([]);
  });

  it("says which periods a change decides", () => {
    expect(periodsDecidedBy(["s1"], [goal(1, 5, 0, 1, 0)]).sort()).toEqual(["first", "s1"]);
    expect(periodsDecidedBy(["s2"], [goal(1, 5, 0, 1, 0), goal(2, 9, 0, 2, 0)])).toEqual(["s2"]);
    expect(periodsDecidedBy(["final"], []).sort()).toEqual(["final", "first", "s1"]);
    expect(periodsDecidedBy(["final"], [goal(1, 5, 0, 1, 0)])).toEqual(["final"]);
  });
});
