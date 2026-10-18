import { describe, expect, it } from "vitest";
import { defaultFormat, periodsFor } from "./formats";
import {
  boardPeriods,
  drawFor,
  drawNumbers,
  drawOne,
  gridSize,
  isValidCell,
  lastDigit,
  liveCell,
  liveChanged,
  liveLabel,
  myWins,
  nextEveryScoreEntry,
  periodKeyForLive,
  periodScoresFromLinescores,
  resolveResults,
  retractedEntries,
  reverseCell,
  shuffledDigits,
  squaresLeft,
  totalSquares,
  upcomingPeriod,
  winCounts,
  winnersOf,
  winningCell,
  momentInPlay,
  playerTake,
  primaryAward,
  prizeTotals,
  type ResultsInput,
} from "./squares";
import { fixedPeriods, withRules } from "./formats";
import type { Game, GameFormat, LiveStatus, LiveUpdate, ManualWinner, MomentRule, NumberDraw, Score, Square } from "./types";

/** Deterministic rng (mulberry32) so draws are reproducible. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Identity draw for a 10x10 board: column i / row i hold digit i.
const IDENTITY: NumberDraw = {
  x: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => [d]),
  y: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => [d]),
};

// 5x5: column/row i holds digits [2i, 2i+1].
const PAIRS: NumberDraw = {
  x: [[0, 1], [2, 3], [4, 5], [6, 7], [8, 9]],
  y: [[0, 1], [2, 3], [4, 5], [6, 7], [8, 9]],
};

function makeGame(format: Partial<GameFormat> = {}, over: Partial<Game> = {}): Game {
  const f = { ...defaultFormat(), ...format };
  return {
    id: "g1",
    name: "Test board",
    sport: "football",
    league: "custom",
    teamX: { name: "Chiefs", abbr: "KC" },
    teamY: { name: "Eagles", abbr: "PHI" },
    format: f,
    periods: periodsFor(f.periods),
    prizes: {},
    maxPerPlayer: 0,
    numbers: { "*": f.boardSize === 25 ? PAIRS : IDENTITY },
    status: "locked",
    linkedEvent: null,
    hostPlayerId: "host",
    createdAt: 0,
    lockedAt: 1,
    ...over,
  };
}

const sq = (row: number, col: number, playerId: string): Square => ({ row, col, playerId, claimedAt: 0 });
const score = (periodKey: string, scoreX: number, scoreY: number, extra: Partial<Score> = {}): Score => ({
  periodKey,
  scoreX,
  scoreY,
  source: "host",
  updatedAt: 0,
  ...extra,
});
const input = (game: Game, squares: Square[], scores: Score[], manualWinners: ResultsInput["manualWinners"] = []) => ({
  game,
  squares,
  scores,
  manualWinners,
});

function expectDigitsOnce(axis: number[][], perCell: number) {
  expect(axis.every((d) => d.length === perCell)).toBe(true);
  expect(axis.flat().sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
}

describe("grid", () => {
  it("is 10x10 or 5x5", () => {
    expect(gridSize(100)).toBe(10);
    expect(gridSize(25)).toBe(5);
    expect(totalSquares(100)).toBe(100);
    expect(totalSquares(25)).toBe(25);
  });

  it("validates cells against the board size", () => {
    expect(isValidCell(100, 9, 9)).toBe(true);
    expect(isValidCell(25, 4, 4)).toBe(true);
    expect(isValidCell(25, 5, 0)).toBe(false);
    expect(isValidCell(100, -1, 0)).toBe(false);
    expect(isValidCell(100, 1.5, 0)).toBe(false);
  });

  it("counts squares left", () => {
    const game = makeGame({ boardSize: 25 });
    expect(squaresLeft({ game, squares: [sq(0, 0, "a"), sq(1, 1, "b")] })).toBe(23);
  });
});

describe("lastDigit", () => {
  it("returns the ones digit", () => {
    expect(lastDigit(24)).toBe(4);
    expect(lastDigit(30)).toBe(0);
    expect(lastDigit(7)).toBe(7);
  });
});

describe("drawing numbers", () => {
  it("shuffledDigits is a permutation and deterministic for a seed", () => {
    const d = shuffledDigits(seeded(1));
    expect([...d].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(shuffledDigits(seeded(7))).toEqual(shuffledDigits(seeded(7)));
  });

  it("10x10 draws one digit per row/col, each digit once", () => {
    const draw = drawOne(100, seeded(3));
    expect(draw.x).toHaveLength(10);
    expect(draw.y).toHaveLength(10);
    expectDigitsOnce(draw.x, 1);
    expectDigitsOnce(draw.y, 1);
  });

  it("5x5 pairs shuffled digits two per row/col", () => {
    const draw = drawOne(25, seeded(4));
    expect(draw.x).toHaveLength(5);
    expect(draw.y).toHaveLength(5);
    expectDigitsOnce(draw.x, 2);
    expectDigitsOnce(draw.y, 2);
  });

  it("uses the secure rng by default", () => {
    const draw = drawOne(100);
    expectDigitsOnce(draw.x, 1);
  });

  it("draws once under * by default", () => {
    expect(Object.keys(drawNumbers(defaultFormat(), seeded(1)))).toEqual(["*"]);
  });

  it("draws per quarter with fresh numbers, each a valid draw", () => {
    const draws = drawNumbers({ ...defaultFormat(), freshNumbers: true, boardSize: 25 }, seeded(9));
    expect(Object.keys(draws)).toEqual(["q1", "q2", "q3", "final"]);
    for (const d of Object.values(draws)) {
      expectDigitsOnce(d.x, 2);
      expectDigitsOnce(d.y, 2);
    }
    // Different quarters get different shuffles.
    expect(draws.q1).not.toEqual(draws.q2);
  });

  it("drawFor prefers the period's own draw and falls back to *", () => {
    const q1: NumberDraw = { x: IDENTITY.x, y: [...IDENTITY.y].reverse() };
    const game = makeGame({ freshNumbers: true }, { numbers: { q1, q2: IDENTITY, q3: IDENTITY, final: IDENTITY } });
    expect(drawFor(game, "q1")).toBe(q1);
    expect(drawFor(game, "final")).toBe(IDENTITY);
    expect(drawFor(makeGame(), "s4")).toBe(IDENTITY);
    expect(drawFor(makeGame({}, { numbers: null }), "q1")).toBeNull();
  });
});

describe("winningCell / reverseCell", () => {
  const draw: NumberDraw = {
    x: IDENTITY.x,
    y: [9, 8, 7, 6, 5, 4, 3, 2, 1, 0].map((d) => [d]),
  };

  it("maps the last digit of each score to a column (X) and row (Y)", () => {
    // X 24 -> digit 4 -> col 4. Y 17 -> digit 7 -> row 2.
    expect(winningCell({ scoreX: 24, scoreY: 17 }, draw)).toEqual({ row: 2, col: 4 });
    expect(winningCell({ scoreX: 20, scoreY: 30 }, draw)).toEqual({ row: 9, col: 0 });
  });

  it("reverse swaps the digits", () => {
    // Reverse of 24-17: X digit 7 -> col 7, Y digit 4 -> row 5.
    expect(reverseCell({ scoreX: 24, scoreY: 17 }, draw)).toEqual({ row: 5, col: 7 });
  });

  it("finds digits inside 5x5 pairs", () => {
    expect(winningCell({ scoreX: 7, scoreY: 10 }, PAIRS)).toEqual({ row: 0, col: 3 });
    expect(winningCell({ scoreX: 3, scoreY: 2 }, PAIRS)).toEqual({ row: 1, col: 1 });
  });

  it("returns null for a malformed draw", () => {
    expect(winningCell({ scoreX: 3, scoreY: 2 }, { x: [[0]], y: [[2]] })).toBeNull();
  });
});

describe("resolveResults", () => {
  it("returns nothing before numbers are drawn", () => {
    expect(resolveResults(input(makeGame({}, { numbers: null }), [], [score("q1", 7, 0)]))).toEqual([]);
  });

  it("10x10: attributes each period to the owner of the winning square, in board order", () => {
    const game = makeGame({}, { prizes: { final: "Winner picks the movie", "*": "Bragging rights" } });
    const squares = [sq(3, 7, "sam"), sq(0, 4, "ali")];
    const results = resolveResults(
      input(game, squares, [score("final", 24, 20, { source: "live" }), score("q1", 7, 3), score("q2", 14, 10)]),
    );
    expect(results.map((r) => r.periodKey)).toEqual(["q1", "q2", "final"]);
    expect(results[0]).toMatchObject({
      label: "Q1",
      cell: { row: 3, col: 7 },
      winnerPlayerId: "sam",
      reverseCell: null,
      prize: "Bragging rights",
      source: "auto",
    });
    expect(results[1]).toMatchObject({ label: "Half", cell: { row: 0, col: 4 }, winnerPlayerId: "ali" });
    expect(results[2]).toMatchObject({ cell: { row: 0, col: 4 }, prize: "Winner picks the movie" });
    expect(results[2].score?.source).toBe("live");
  });

  it("reports no winner when the winning square is empty", () => {
    const [r] = resolveResults(input(makeGame(), [], [score("final", 14, 21)]));
    expect(r.cell).toEqual({ row: 1, col: 4 });
    expect(r.winnerPlayerId).toBeNull();
  });

  it("ignores scores for periods the board doesn't have", () => {
    const game = makeGame({ periods: "final" });
    expect(resolveResults(input(game, [], [score("q1", 7, 0), score("final", 10, 3)])).map((r) => r.periodKey)).toEqual(
      ["final"],
    );
  });

  it("5x5: winners come from digit pairs", () => {
    const game = makeGame({ boardSize: 25 });
    const [r] = resolveResults(input(game, [sq(1, 3, "kim")], [score("q1", 7, 3)]));
    expect(r.cell).toEqual({ row: 1, col: 3 });
    expect(r.winnerPlayerId).toBe("kim");
  });

  it("reverse: awards the swapped square too", () => {
    const game = makeGame({ reverse: true });
    const [r] = resolveResults(input(game, [sq(3, 7, "a"), sq(7, 3, "b")], [score("q1", 7, 3)]));
    expect(r.cell).toEqual({ row: 3, col: 7 });
    expect(r.reverseCell).toEqual({ row: 7, col: 3 });
    expect(r.winnerPlayerId).toBe("a");
    expect(r.reverseWinnerPlayerId).toBe("b");
    expect(winnersOf(r)).toEqual(["a", "b"]);
  });

  it("reverse on matching digits lands on the same square, which takes both", () => {
    const game = makeGame({ reverse: true });
    const [r] = resolveResults(input(game, [sq(7, 7, "a")], [score("q3", 17, 7)]));
    expect(r.cell).toEqual(r.reverseCell);
    expect(winnersOf(r)).toEqual(["a"]);
    expect(myWins([r], "a")).toHaveLength(2);
  });

  it("fresh numbers: each quarter uses its own draw", () => {
    const reversed: NumberDraw = { x: [...IDENTITY.x].reverse(), y: [...IDENTITY.y].reverse() };
    const game = makeGame(
      { freshNumbers: true },
      { numbers: { q1: IDENTITY, q2: reversed, q3: IDENTITY, final: reversed } },
    );
    const results = resolveResults(input(game, [], [score("q1", 7, 3), score("q2", 7, 3), score("final", 27, 23)]));
    expect(results[0].cell).toEqual({ row: 3, col: 7 });
    expect(results[1].cell).toEqual({ row: 6, col: 2 }); // digit 7 at col 2, digit 3 at row 6
    expect(results[2].cell).toEqual({ row: 6, col: 2 });
  });

  it("manual winner overrides the computed square; reverse still follows the score", () => {
    const game = makeGame({ reverse: true });
    const results = resolveResults(
      input(game, [sq(3, 7, "auto"), sq(5, 5, "picked"), sq(7, 3, "rev")], [score("q1", 7, 3)], [
        { periodKey: "q1", row: 5, col: 5, updatedAt: 0 },
      ]),
    );
    expect(results[0]).toMatchObject({
      cell: { row: 5, col: 5 },
      winnerPlayerId: "picked",
      reverseWinnerPlayerId: "rev",
      source: "host",
    });
  });

  it("manual winner without a recorded score still yields a result", () => {
    const results = resolveResults(
      input(makeGame(), [sq(2, 2, "x")], [], [{ periodKey: "q2", row: 2, col: 2, updatedAt: 0 }]),
    );
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ periodKey: "q2", label: "Half", score: null, winnerPlayerId: "x", source: "host" });
  });

  it("every-score: one result per entry, ordered numerically, labels from entries", () => {
    const game = makeGame({ periods: "every-score" }, { periods: [], prizes: { "*": "High five" } });
    const scores = [
      score("s10", 24, 17, { label: "Score 10" }),
      score("s2", 7, 3, { label: "Score 2" }),
      score("s1", 0, 3),
    ];
    const results = resolveResults(input(game, [sq(3, 0, "first")], scores));
    expect(results.map((r) => r.periodKey)).toEqual(["s1", "s2", "s10"]);
    expect(results[0]).toMatchObject({ label: "Score 1", winnerPlayerId: "first", prize: "High five" });
    expect(results[2].label).toBe("Score 10");
    expect(boardPeriods(game, scores).map((p) => p.key)).toEqual(["s1", "s2", "s10"]);
  });

  it("every-score: keeps a host pick for an entry and ignores fixed keys", () => {
    const game = makeGame({ periods: "every-score" }, { periods: [] });
    const results = resolveResults(
      input(game, [], [score("q1", 7, 0), score("s1", 7, 0)], [{ periodKey: "s2", row: 0, col: 0, updatedAt: 0 }]),
    );
    expect(results.map((r) => [r.periodKey, r.source])).toEqual([
      ["s1", "auto"],
      ["s2", "host"],
    ]);
  });
});

describe("periodScoresFromLinescores", () => {
  const live = (over: Partial<LiveStatus> = {}): LiveStatus => ({
    state: "in",
    period: 3,
    clock: "10:00",
    detail: "Q3 10:00",
    scoreX: 0,
    scoreY: 0,
    updatedAt: 0,
    ...over,
  });
  const update = (over: Partial<LiveUpdate>): LiveUpdate => ({
    live: live(),
    linescoresX: [],
    linescoresY: [],
    completedPeriods: 0,
    isFinal: false,
    ...over,
  });

  it("returns cumulative scores for completed quarters only", () => {
    const u = update({ linescoresX: [7, 3, 0], linescoresY: [0, 10, 7], completedPeriods: 2 });
    expect(periodScoresFromLinescores(defaultFormat(), u)).toEqual([
      { periodKey: "q1", label: "Q1", scoreX: 7, scoreY: 0 },
      { periodKey: "q2", label: "Half", scoreX: 10, scoreY: 10 },
    ]);
  });

  it("halves: Half is the score after two periods", () => {
    const u = update({ linescoresX: [7, 3, 7], linescoresY: [0, 10, 0], completedPeriods: 3 });
    expect(periodScoresFromLinescores({ ...defaultFormat(), periods: "halves" }, u)).toEqual([
      { periodKey: "q2", label: "Half", scoreX: 10, scoreY: 10 },
    ]);
  });

  it("Final waits for the end of the game and includes overtime", () => {
    const base = { linescoresX: [7, 3, 7, 3], linescoresY: [0, 10, 0, 10], completedPeriods: 4 };
    // End of regulation tied 20-20: not final yet, so no Final score.
    expect(
      periodScoresFromLinescores({ ...defaultFormat(), periods: "final" }, update({ ...base, live: live({ scoreX: 20, scoreY: 20 }) })),
    ).toEqual([]);
    const ot = update({
      linescoresX: [...base.linescoresX, 6],
      linescoresY: [...base.linescoresY, 0],
      completedPeriods: 5,
      isFinal: true,
      live: live({ state: "post", period: 5, scoreX: 26, scoreY: 20 }),
    });
    const scores = periodScoresFromLinescores(defaultFormat(), ot);
    expect(scores.map((s) => s.periodKey)).toEqual(["q1", "q2", "q3", "final"]);
    expect(scores[2]).toMatchObject({ scoreX: 17, scoreY: 10 });
    expect(scores[3]).toEqual({ periodKey: "final", label: "Final", scoreX: 26, scoreY: 20 });
  });

  it("treats missing linescore entries as zero", () => {
    const u = update({ linescoresX: [7], linescoresY: [], completedPeriods: 2 });
    expect(periodScoresFromLinescores(defaultFormat(), u)[1]).toMatchObject({ scoreX: 7, scoreY: 0 });
  });

  it("returns nothing for every-score boards", () => {
    const u = update({ linescoresX: [7], linescoresY: [3], completedPeriods: 1 });
    expect(periodScoresFromLinescores({ ...defaultFormat(), periods: "every-score" }, u)).toEqual([]);
  });
});

describe("nextEveryScoreEntry", () => {
  it("does nothing at 0-0", () => {
    expect(nextEveryScoreEntry([], 0, 0)).toBeNull();
  });

  it("never appends a score below the latest entry: that's a correction, not a new score", () => {
    // A touchdown overturned on review: 7-0 back to 0-0 must not make 0-0 a winner.
    expect(nextEveryScoreEntry([score("s1", 7, 0, { source: "live" })], 0, 0)).toBeNull();
    expect(nextEveryScoreEntry([score("s1", 7, 7), score("s2", 14, 7)], 7, 10)).toBeNull();
  });

  it("finds the live entries a correction took back, newest first, never a host's", () => {
    const live = (k: string, x: number, y: number) => score(k, x, y, { source: "live" });
    expect(retractedEntries([live("s1", 7, 0)], 0, 0)).toEqual(["s1"]);
    expect(retractedEntries([live("s1", 3, 0), live("s3", 10, 7), live("s2", 10, 0)], 3, 0)).toEqual(["s3", "s2"]);
    expect(retractedEntries([live("s1", 3, 0), live("s2", 10, 0)], 10, 3)).toEqual([]);
    expect(retractedEntries([live("s1", 3, 0), score("s2", 10, 0)], 3, 0)).toEqual([]);
    // Corrected to a different score: the entry goes, and the corrected score is the next entry.
    const scores = [live("s1", 3, 0), live("s2", 10, 0)];
    const gone = retractedEntries(scores, 6, 0);
    expect(gone).toEqual(["s2"]);
    expect(nextEveryScoreEntry(scores.filter((s) => !gone.includes(s.periodKey)), 6, 0)).toEqual({ periodKey: "s2", label: "Score 2", scoreX: 6, scoreY: 0 });
  });

  it("appends s1 for the first score and sN+1 after the latest entry", () => {
    expect(nextEveryScoreEntry([], 3, 0)).toEqual({ periodKey: "s1", label: "Score 1", scoreX: 3, scoreY: 0 });
    const scores = [score("s1", 3, 0), score("s2", 3, 7)];
    expect(nextEveryScoreEntry(scores, 3, 7)).toBeNull();
    expect(nextEveryScoreEntry(scores, 3, 8)).toEqual({ periodKey: "s3", label: "Score 3", scoreX: 3, scoreY: 8 });
  });

  it("compares against the highest-numbered entry, not array order", () => {
    const scores = [score("s10", 20, 17), score("s9", 17, 17)];
    expect(nextEveryScoreEntry(scores, 20, 17)).toBeNull();
    expect(nextEveryScoreEntry(scores, 20, 20)?.periodKey).toBe("s11");
  });
});

describe("live helpers", () => {
  it("maps live periods to the period in play", () => {
    const q = defaultFormat();
    expect(periodKeyForLive(q, 1)).toBe("q1");
    expect(periodKeyForLive(q, 4)).toBe("final");
    expect(periodKeyForLive(q, 6)).toBe("final");
    expect(periodKeyForLive({ ...q, periods: "halves" }, 1)).toBe("q2");
    expect(periodKeyForLive({ ...q, periods: "halves" }, 3)).toBe("final");
    expect(periodKeyForLive({ ...q, periods: "every-score" }, 2)).toBeNull();
  });

  it("liveCell points at the square the current score lands on", () => {
    const game = makeGame({ reverse: true });
    const live: LiveStatus = { state: "in", period: 2, clock: "1:00", detail: "", scoreX: 14, scoreY: 3, updatedAt: 0 };
    expect(liveCell({ game, squares: [sq(3, 4, "me")], live, scores: [], manualWinners: [] })).toEqual({
      periodKey: "q2",
      cell: { row: 3, col: 4 },
      playerId: "me",
      reverseCell: { row: 4, col: 3 },
    });
    expect(liveCell({ game, squares: [], live: { ...live, state: "pre" }, scores: [], manualWinners: [] })).toBeNull();
    expect(liveCell({ game: { ...game, numbers: null }, squares: [], live, scores: [], manualWinners: [] })).toBeNull();
  });

  it("liveCell skips ahead past a period that's already decided (halftime: ESPN still says period 2)", () => {
    const game = makeGame({ reverse: true });
    const halftime: LiveStatus = { state: "in", period: 2, clock: "0:00", detail: "Halftime", scoreX: 14, scoreY: 3, updatedAt: 0 };
    const at = (scores: Score[], manualWinners: ManualWinner[] = []) =>
      liveCell({ game, squares: [sq(3, 4, "me")], live: halftime, scores, manualWinners })?.periodKey;
    expect(at([score("q1", 7, 3)])).toBe("q2");
    expect(at([score("q1", 7, 3), score("q2", 14, 3)])).toBe("q3");
    // A host pick decides a period too.
    expect(at([score("q1", 7, 3)], [{ periodKey: "q2", row: 0, col: 0, updatedAt: 0 }])).toBe("q3");
    // Every period decided: back to the live period's own.
    expect(at([score("q1", 7, 3), score("q2", 14, 3), score("q3", 14, 3), score("final", 14, 3)])).toBe("q2");
  });

  it("liveChanged ignores updatedAt", () => {
    const a: LiveStatus = { state: "in", period: 1, clock: "5:00", detail: "Q1 5:00", scoreX: 0, scoreY: 0, updatedAt: 1 };
    expect(liveChanged(a, { ...a, updatedAt: 2 })).toBe(false);
    expect(liveChanged(a, { ...a, clock: "4:45" })).toBe(true);
    expect(liveChanged(null, a)).toBe(true);
    expect(liveChanged(null, null)).toBe(false);
  });

  it("liveLabel says Final only for a finished game, never for a postponed one", () => {
    const on = { state: "in" as const, period: 3, clock: "4:12", detail: "" };
    expect(liveLabel(on, "locked")).toBe("Q3 4:12");
    expect(liveLabel({ ...on, detail: "Halftime" }, "locked")).toBe("Halftime");
    expect(liveLabel({ ...on, state: "post" }, "final")).toBe("Final");
    expect(liveLabel({ ...on, state: "post", detail: "Final/OT" }, "locked")).toBe("Final");
    // ESPN reports postponed and canceled games as "post" without completing them.
    expect(liveLabel({ state: "post", period: 0, clock: "0:00", detail: "Postponed" }, "locked")).toBe("Postponed");
    expect(liveLabel({ state: "post", period: 0, clock: "0:00", detail: "Canceled" }, "open")).toBe("Canceled");
    expect(liveLabel({ state: "post", period: 0, clock: "0:00", detail: "" }, "open")).toBe("Postponed");
  });
});

describe("summary helpers", () => {
  const game = makeGame({ reverse: true });
  const squares = [sq(3, 7, "me"), sq(7, 3, "you")];
  const results = resolveResults(input(game, squares, [score("q1", 7, 3), score("q2", 13, 17)]));

  it("myWins lists regular and reverse wins", () => {
    // Q1 7-3 lands on (3,7) with reverse (7,3); Half 13-17 is the mirror image.
    expect(myWins(results, "me")).toEqual([
      { periodKey: "q1", label: "Q1", reverse: false },
      { periodKey: "q2", label: "Half", reverse: true },
    ]);
    expect(myWins(results, "you")).toEqual([
      { periodKey: "q1", label: "Q1", reverse: true },
      { periodKey: "q2", label: "Half", reverse: false },
    ]);
  });

  it("winCounts tallies per player", () => {
    expect(winCounts(results)).toEqual({ me: 2, you: 2 });
  });

  it("upcomingPeriod is the first period without a result", () => {
    expect(upcomingPeriod(input(game, squares, [score("q1", 7, 3), score("q2", 13, 17)]))).toEqual({
      key: "q3",
      label: "Q3",
    });
    const all = ["q1", "q2", "q3", "final"].map((k) => score(k, 1, 1));
    expect(upcomingPeriod(input(game, squares, all))).toBeNull();
  });
});

// ---- Rules: custom moments, square/reverse per moment, amounts ----

const prize = (amount: number | null, note = "") => ({ amount, note });

/** The owner's example: every score change -> the square, $50; each quarter-end -> the reverse square, $200. */
const OWNER_RULES: MomentRule[] = [
  { moment: "score", square: prize(50), reverse: null },
  { moment: "q1", square: null, reverse: prize(200) },
  { moment: "q2", square: null, reverse: prize(200) },
  { moment: "q3", square: null, reverse: prize(200) },
  { moment: "final", square: null, reverse: prize(200, "Loser buys wings") },
];

function rulesGame(rules: MomentRule[], over: Partial<Game> = {}): Game {
  const format = withRules({ ...defaultFormat(), rules });
  return makeGame(format, { periods: fixedPeriods(rules), ...over });
}

describe("rules: the owner's example (every score $50 to the square, each quarter $200 to the reverse)", () => {
  // IDENTITY draw: column = X's last digit, row = Y's last digit.
  const game = rulesGame(OWNER_RULES);
  const squares = [sq(0, 7, "ana"), sq(3, 7, "ana"), sq(7, 3, "ben"), sq(3, 4, "cy"), sq(0, 4, "dee"), sq(4, 0, "dee")];
  const scores = [
    score("s1", 7, 0),
    score("s2", 7, 3),
    score("q1", 7, 3),
    score("s3", 14, 3),
    score("s4", 14, 10),
    score("q2", 14, 10),
    score("s5", 17, 10),
  ];
  // Stored out of order, as D1 returns them.
  const results = resolveResults(input(game, squares, [...scores].reverse()));

  it("lays the moments out in the order they happened", () => {
    expect(results.map((r) => r.periodKey)).toEqual(["s1", "s2", "q1", "s3", "s4", "q2", "s5"]);
    expect(boardPeriods(game, scores).map((p) => p.label)).toEqual(["Score 1", "Score 2", "Q1", "Score 3", "Score 4", "Half", "Score 5", "Q3", "Final"]);
  });

  it("every score awards only the square, with its amount", () => {
    const s2 = results.find((r) => r.periodKey === "s2")!;
    expect(s2).toMatchObject({
      cell: { row: 3, col: 7 },
      winnerPlayerId: "ana",
      reverseCell: null,
      reverseWinnerPlayerId: null,
      awardsSquare: true,
      awardsReverse: false,
      amount: 50,
      reverseAmount: null,
    });
  });

  it("each quarter awards only the reverse square, with the bigger amount", () => {
    const q1 = results.find((r) => r.periodKey === "q1")!;
    expect(q1).toMatchObject({
      cell: null,
      winnerPlayerId: null,
      reverseCell: { row: 7, col: 3 },
      reverseWinnerPlayerId: "ben",
      awardsSquare: false,
      awardsReverse: true,
      amount: null,
      reverseAmount: 200,
      prize: null,
    });
    expect(primaryAward(q1)).toEqual({ cell: { row: 7, col: 3 }, playerId: "ben", amount: 200, note: null, reverse: true });
    expect(winnersOf(q1)).toEqual(["ben"]);
    expect(myWins(results, "ben")).toEqual([{ periodKey: "q1", label: "Q1", reverse: true }]);
  });

  it("totals each player's prizes", () => {
    expect(prizeTotals(results)).toEqual({ ana: 150, ben: 200, cy: 50, dee: 250 });
    expect(winCounts(results)).toEqual({ ana: 3, ben: 1, cy: 1, dee: 2 });
  });

  it("the final's note rides on the reverse square", () => {
    const withFinal = resolveResults(input(game, [...squares, sq(0, 7, "ana")], [...scores, score("final", 27, 20)]));
    const fin = withFinal.at(-1)!;
    expect(fin).toMatchObject({ periodKey: "final", reverseCell: { row: 7, col: 0 }, reversePrize: "Loser buys wings", reverseAmount: 200 });
    expect(playerTake(fin, "nobody")).toEqual({ amount: null, note: null, square: false, reverse: false });
  });

  it("a host pick on a reverse-only moment replaces the reverse square", () => {
    const [q3] = resolveResults(input(game, [sq(5, 5, "eve")], [], [{ periodKey: "q3", row: 5, col: 5, updatedAt: 0 }]));
    expect(q3).toMatchObject({ periodKey: "q3", cell: null, reverseCell: { row: 5, col: 5 }, reverseWinnerPlayerId: "eve", source: "host", reverseAmount: 200 });
  });

  it("the live square follows the moment in play (the reverse square mid-quarter)", () => {
    const live: LiveStatus = { state: "in", period: 2, clock: "3:00", detail: "Q2 3:00", scoreX: 21, scoreY: 10, updatedAt: 0 };
    const state = { game, squares: [sq(1, 0, "fay")], live, scores: scores.filter((s) => s.periodKey !== "q2"), manualWinners: [] };
    expect(liveCell(state)).toEqual({ periodKey: "q2", cell: { row: 1, col: 0 }, playerId: "fay", reverseCell: null, reverse: true });
    // Every fixed moment decided: what's left is the next score, which awards the square.
    const done = ["q1", "q2", "q3", "final"].map((k) => score(k, 21, 10));
    expect(momentInPlay({ game, scores: done, manualWinners: [] }, 4)).toMatchObject({ periodKey: null, rule: { moment: "score" } });
    expect(liveCell({ ...state, scores: done })).toMatchObject({ periodKey: null, cell: { row: 0, col: 1 }, reverseCell: null });
  });

  it("records both the quarter-ends and the next fixed period", () => {
    const update: LiveUpdate = {
      live: { state: "in", period: 2, clock: "9:00", detail: "Q2 9:00", scoreX: 10, scoreY: 3, updatedAt: 0 },
      linescoresX: [7, 3],
      linescoresY: [3, 0],
      completedPeriods: 1,
      isFinal: false,
    };
    expect(periodScoresFromLinescores(game.format, update)).toEqual([{ periodKey: "q1", label: "Q1", scoreX: 7, scoreY: 3 }]);
    expect(upcomingPeriod(input(game, [], scores))).toEqual({ key: "q3", label: "Q3" });
    expect(periodKeyForLive(game.format, 3)).toBe("q3");
  });

  it("a fixed period with no score yet comes after the entries", () => {
    expect(boardPeriods(game, [score("s1", 3, 0), score("s2", 3, 7)]).map((p) => p.key)).toEqual(["s1", "s2", "q1", "q2", "q3", "final"]);
    // A skipped Q1 sits before the recorded Half.
    expect(boardPeriods(game, [score("s1", 3, 0), score("q2", 3, 0), score("s2", 10, 0)]).map((p) => p.key)).toEqual(["q1", "s1", "q2", "s2", "q3", "final"]);
  });
});

describe("rules: amounts on a classic board", () => {
  it("the same player holding both squares of a period gets both amounts", () => {
    const rules: MomentRule[] = [{ moment: "final", square: prize(100), reverse: prize(40) }];
    const [r] = resolveResults(input(rulesGame(rules), [sq(7, 7, "a")], [score("final", 17, 7)]));
    expect(r.cell).toEqual(r.reverseCell);
    expect(prizeTotals([r])).toEqual({ a: 140 });
    expect(playerTake(r, "a")).toEqual({ amount: 140, note: null, square: true, reverse: true });
  });

  it("skips moments the rules don't award, and amounts stay null without them", () => {
    const rules: MomentRule[] = [{ moment: "q2", square: prize(null, "Wings"), reverse: null }];
    const results = resolveResults(input(rulesGame(rules), [], [score("q1", 7, 3), score("q2", 14, 10), score("s1", 3, 0)]));
    expect(results.map((r) => [r.periodKey, r.amount, r.prize])).toEqual([["q2", null, "Wings"]]);
    expect(prizeTotals(results)).toEqual({});
  });

  it("legacy boards (no rules) resolve exactly as before, with no amounts", () => {
    const game = makeGame({ reverse: true }, { prizes: { q1: "Wings" } });
    const [r] = resolveResults(input(game, [sq(3, 7, "a"), sq(7, 3, "b")], [score("q1", 7, 3)]));
    expect(r).toMatchObject({
      cell: { row: 3, col: 7 },
      reverseCell: { row: 7, col: 3 },
      awardsSquare: true,
      awardsReverse: true,
      prize: "Wings",
      reversePrize: null,
      amount: null,
      reverseAmount: null,
    });
  });
});
