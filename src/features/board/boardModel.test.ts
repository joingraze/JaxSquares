import { describe, expect, it } from "vitest";
import { resolveResults } from "../../../shared/squares";
import type { Activity, GameState, NumberDraw, Player, Score, Square } from "../../../shared/types";
import {
  EMPTY_SELECTION,
  applyTap,
  axisLabels,
  boardPhase,
  buildCells,
  cellsOf,
  decideTap,
  defaultDrawKey,
  drawTabs,
  fallbackActivityText,
  headlineScore,
  lostToOthers,
  myNumbers,
  myWinIds,
  nearestPath,
  nextChange,
  periodCards,
  periodNoun,
  playerRows,
  pruneSelection,
  rightNow,
  squaresLeftFor,
  type Selection,
} from "./boardModel";

const ME = "me_public_id";
const MAYA = "maya_public_id";
const DIGITS: NumberDraw = {
  // column c holds digit c, row r holds digit 9 - r
  x: [[0], [1], [2], [3], [4], [5], [6], [7], [8], [9]],
  y: [[9], [8], [7], [6], [5], [4], [3], [2], [1], [0]],
};

function player(id: string, name: string, joinedAt = 1): Player {
  return { id, name, color: "#ff6b35", emoji: "", joinedAt, isHost: false };
}

function sq(row: number, col: number, playerId: string): Square {
  return { row, col, playerId, claimedAt: 1 };
}

function score(periodKey: string, scoreX: number, scoreY: number, label?: string): Score {
  return { periodKey, scoreX, scoreY, source: "host", updatedAt: 1, ...(label ? { label } : {}) };
}

function makeState(over: Omit<Partial<GameState>, "game"> & { game?: Partial<GameState["game"]> } = {}): GameState {
  const { game, ...rest } = over;
  return {
    game: {
      id: "g1",
      name: "Test board",
      sport: "football",
      league: "custom",
      teamX: { name: "Chiefs", abbr: "KC", color: "#e31837" },
      teamY: { name: "Bills", abbr: "BUF", color: "#00338d" },
      format: { periods: "quarters", reverse: false, boardSize: 100, freshNumbers: false },
      periods: [
        { key: "q1", label: "Q1" },
        { key: "q2", label: "Half" },
        { key: "q3", label: "Q3" },
        { key: "final", label: "Final" },
      ],
      prizes: {},
      maxPerPlayer: 0,
      numbers: null,
      status: "open",
      linkedEvent: null,
      hostPlayerId: MAYA,
      createdAt: 1,
      lockedAt: null,
      ...game,
    },
    players: [player(ME, "Jordan", 2), player(MAYA, "Maya", 1)],
    squares: [],
    scores: [],
    manualWinners: [],
    live: null,
    activity: [],
    version: 1,
    ...rest,
  };
}

const sel = (claim: string[] = [], release: string[] = []): Selection => ({ claim: new Set(claim), release: new Set(release) });

describe("decideTap", () => {
  const empty = { key: "0,0", ownerId: null, mine: false };
  const mine = { key: "1,1", ownerId: ME, mine: true };
  const theirs = { key: "2,2", ownerId: MAYA, mine: false };
  const base = { status: "open" as const, selection: EMPTY_SELECTION, maxPerPlayer: 0, mineCount: 0 };

  it("selects and unselects open squares", () => {
    expect(decideTap({ ...base, cell: empty }).kind).toBe("select");
    expect(decideTap({ ...base, cell: empty, selection: sel(["0,0"]) }).kind).toBe("unselect");
  });

  it("toggles my own squares for release", () => {
    expect(decideTap({ ...base, cell: mine }).kind).toBe("select-release");
    expect(decideTap({ ...base, cell: mine, selection: sel([], ["1,1"]) }).kind).toBe("unselect-release");
  });

  it("only inspects someone else's square, or any square once locked", () => {
    expect(decideTap({ ...base, cell: theirs }).kind).toBe("inspect");
    expect(decideTap({ ...base, status: "locked", cell: empty }).kind).toBe("inspect");
    expect(decideTap({ ...base, status: "draft", cell: empty }).kind).toBe("inspect");
  });

  it("respects the per-player limit, counting what's already picked", () => {
    expect(decideTap({ ...base, cell: empty, maxPerPlayer: 3, mineCount: 2 }).kind).toBe("select");
    expect(decideTap({ ...base, cell: empty, maxPerPlayer: 3, mineCount: 2, selection: sel(["5,5"]) })).toEqual({ kind: "limit", max: 3 });
    // Unselecting is always allowed, even at the limit.
    expect(decideTap({ ...base, cell: empty, maxPerPlayer: 1, mineCount: 1, selection: sel(["0,0"]) }).kind).toBe("unselect");
  });
});

describe("applyTap / pruneSelection / cellsOf", () => {
  it("toggles keys without mutating the previous selection", () => {
    const a = EMPTY_SELECTION;
    const b = applyTap(a, "3,4", { kind: "select" });
    expect([...b.claim]).toEqual(["3,4"]);
    expect(a.claim.size).toBe(0);
    const c = applyTap(b, "3,4", { kind: "unselect" });
    expect(c.claim.size).toBe(0);
    const d = applyTap(c, "1,1", { kind: "select-release" });
    expect([...d.release]).toEqual(["1,1"]);
    expect(applyTap(d, "9,9", { kind: "inspect" })).toBe(d);
  });

  it("drops picks someone else just took and keeps the same object when nothing changed", () => {
    const state = makeState({ squares: [sq(0, 0, MAYA), sq(1, 1, ME)] });
    const s1 = sel(["0,0", "0,1"], ["1,1"]);
    const pruned = pruneSelection(s1, state, ME);
    expect([...pruned.claim]).toEqual(["0,1"]);
    expect([...pruned.release]).toEqual(["1,1"]);
    const s2 = sel(["0,1"], ["1,1"]);
    expect(pruneSelection(s2, state, ME)).toBe(s2);
  });

  it("only blames someone else for picks they took, not my own optimistic claim", () => {
    const state = makeState({ squares: [sq(0, 0, MAYA), sq(0, 1, ME)] });
    expect(lostToOthers(sel(["0,0", "0,1", "0,2"]), state, ME)).toBe(1);
    expect(lostToOthers(sel(["0,1"]), state, ME)).toBe(0);
    expect(lostToOthers(EMPTY_SELECTION, state, ME)).toBe(0);
  });

  it("clears everything once squares lock", () => {
    const state = makeState({ game: { status: "locked" } });
    expect(pruneSelection(sel(["0,1"]), state, ME)).toBe(EMPTY_SELECTION);
  });

  it("sorts cells for the API", () => {
    expect(cellsOf(new Set(["2,1", "0,9", "2,0"]))).toEqual([
      { row: 0, col: 9 },
      { row: 2, col: 0 },
      { row: 2, col: 1 },
    ]);
  });

  it("counts what's left under a limit", () => {
    expect(squaresLeftFor(0, 5)).toBeNull();
    expect(squaresLeftFor(4, 1)).toBe(3);
    expect(squaresLeftFor(4, 6)).toBe(0);
  });
});

describe("buildCells", () => {
  it("assigns every data-state", () => {
    const state = makeState({ squares: [sq(0, 1, ME), sq(0, 2, MAYA)] });
    const cells = buildCells({ state, me: ME, selection: sel(["0,3"], ["0,1"]), results: [] });
    expect(cells).toHaveLength(10);
    expect(cells[0][0].state).toBe("empty");
    expect(cells[0][1].state).toBe("selected");
    expect(cells[0][1].selected).toBe("release");
    expect(cells[0][2].state).toBe("taken");
    expect(cells[0][2].owner?.name).toBe("Maya");
    expect(cells[0][3].state).toBe("selected");
    expect(cells[0][3].selected).toBe("claim");
    const plain = buildCells({ state, me: ME, selection: EMPTY_SELECTION, results: [] });
    expect(plain[0][1].state).toBe("mine");
  });

  it("marks winners (regular and reverse) and the live square", () => {
    const state = makeState({
      game: { status: "locked", numbers: { "*": DIGITS }, format: { periods: "quarters", reverse: true, boardSize: 100, freshNumbers: false } },
      squares: [sq(6, 7, ME), sq(2, 3, MAYA)],
      // Q1 7-3: col 7, row with digit 3 = row 6. Reverse 3-7: col 3, row with 7 = row 2.
      scores: [score("q1", 7, 3)],
      live: { state: "in", period: 2, clock: "5:00", detail: "Q2 5:00", scoreX: 14, scoreY: 10, updatedAt: 1 },
    });
    const results = resolveResults(state);
    const cells = buildCells({ state, me: ME, selection: EMPTY_SELECTION, results });
    expect(cells[6][7].state).toBe("winner");
    expect(cells[6][7].wins).toEqual([{ periodKey: "q1", label: "Q1", reverse: false }]);
    expect(cells[2][3].state).toBe("winner");
    expect(cells[2][3].wins[0].reverse).toBe(true);
    // Live 14-10: col 4, row with digit 0 = row 9; reverse 10-14: col 0, row with 4 = row 5.
    expect(cells[9][4].live).toBe(true);
    expect(cells[5][0].liveReverse).toBe(true);
  });

  it("drops the live marker once the board is final", () => {
    const state = makeState({
      game: { status: "final", numbers: { "*": DIGITS } },
      live: { state: "post", period: 4, clock: "0:00", detail: "Final", scoreX: 14, scoreY: 10, updatedAt: 1 },
    });
    const cells = buildCells({ state, me: ME, selection: EMPTY_SELECTION, results: [] });
    expect(cells.flat().some((c) => c.live)).toBe(false);
  });

  it("builds a 5x5 board", () => {
    const state = makeState({ game: { format: { periods: "final", reverse: false, boardSize: 25, freshNumbers: false } } });
    const cells = buildCells({ state, me: ME, selection: EMPTY_SELECTION, results: [] });
    expect(cells).toHaveLength(5);
    expect(cells[4]).toHaveLength(5);
  });
});

describe("axes and draws", () => {
  it("shows ? until drawn, and digit pairs on 5x5", () => {
    expect(axisLabels(null, 5)).toEqual({ x: ["?", "?", "?", "?", "?"], y: ["?", "?", "?", "?", "?"], drawn: false });
    const pairs: NumberDraw = { x: [[1, 2], [3, 4], [5, 6], [7, 8], [9, 0]], y: [[0, 9], [8, 7], [6, 5], [4, 3], [2, 1]] };
    const a = axisLabels(pairs, 5);
    expect(a.x[0]).toBe("1·2");
    expect(a.y[4]).toBe("2·1");
    expect(a.drawn).toBe(true);
  });

  it("picks the draw in play for fresh numbers", () => {
    const numbers = { q1: DIGITS, q2: DIGITS, q3: DIGITS, final: DIGITS };
    const fresh = { periods: "quarters" as const, reverse: false, boardSize: 100 as const, freshNumbers: true };
    expect(defaultDrawKey(makeState({ game: { numbers: { "*": DIGITS } } }))).toBe("*");
    expect(defaultDrawKey(makeState({ game: { numbers, format: fresh, status: "locked" } }))).toBe("q1");
    expect(defaultDrawKey(makeState({ game: { numbers, format: fresh, status: "locked" }, scores: [score("q1", 1, 1)] }))).toBe("q2");
    const live = { state: "in" as const, period: 3, clock: "1:00", detail: "", scoreX: 0, scoreY: 0, updatedAt: 1 };
    expect(defaultDrawKey(makeState({ game: { numbers, format: fresh, status: "locked" }, live }))).toBe("q3");
    expect(drawTabs(makeState({ game: { numbers, format: fresh } }).game).map((t) => t.label)).toEqual(["Q1", "Half", "Q3", "Final"]);
    expect(drawTabs(makeState({ game: { numbers: { "*": DIGITS } } }).game)).toEqual([]);
  });

  it("lists my numbers for a draw", () => {
    const state = makeState({ game: { numbers: { "*": DIGITS }, status: "locked" }, squares: [sq(9, 4, ME), sq(0, 0, MAYA), sq(1, 2, ME)] });
    expect(myNumbers(state, ME, "*")).toEqual([
      { row: 1, col: 2, x: "2", y: "8" },
      { row: 9, col: 4, x: "4", y: "0" },
    ]);
    expect(myNumbers(makeState(), ME, "*")).toEqual([]);
  });
});

describe("phase and headline score", () => {
  it("derives the phase", () => {
    expect(boardPhase(makeState())).toBe("open");
    expect(boardPhase(makeState({ game: { status: "draft" } }))).toBe("draft");
    expect(boardPhase(makeState({ game: { status: "locked" } }))).toBe("locked");
    const live = { state: "in" as const, period: 2, clock: "", detail: "", scoreX: 0, scoreY: 0, updatedAt: 1 };
    expect(boardPhase(makeState({ game: { status: "locked" }, live }))).toBe("live");
    expect(boardPhase(makeState({ game: { status: "locked" }, live: { ...live, state: "post" } }))).toBe("final");
    expect(boardPhase(makeState({ game: { status: "final" } }))).toBe("final");
  });

  it("prefers live data, then the latest recorded period", () => {
    expect(headlineScore(makeState())).toBeNull();
    const live = { state: "in" as const, period: 3, clock: "4:12", detail: "Q3 4:12", scoreX: 17, scoreY: 13, updatedAt: 1 };
    expect(headlineScore(makeState({ live }))).toEqual({ scoreX: 17, scoreY: 13, detail: "Q3 4:12" });
    expect(headlineScore(makeState({ live: { ...live, detail: "" } }))?.detail).toBe("Q3 4:12");
    expect(headlineScore(makeState({ live: { ...live, period: 5, clock: "", detail: "" } }))?.detail).toBe("OT");
    expect(headlineScore(makeState({ scores: [score("q1", 7, 3), score("q2", 14, 10)] }))).toEqual({ scoreX: 14, scoreY: 10, detail: "End of Half" });
    expect(headlineScore(makeState({ scores: [score("final", 27, 24)] }))?.detail).toBe("Final");
  });

  it("uses the newest entry on every-score boards", () => {
    const state = makeState({
      game: { format: { periods: "every-score", reverse: false, boardSize: 100, freshNumbers: false }, periods: [] },
      scores: [score("s2", 7, 3), score("s10", 14, 10), score("s9", 14, 3)],
    });
    expect(headlineScore(state)).toEqual({ scoreX: 14, scoreY: 10, detail: "Latest score" });
  });
});

describe("periodCards", () => {
  it("marks done, live and next periods with prizes", () => {
    const state = makeState({
      game: { status: "locked", numbers: { "*": DIGITS }, prizes: { q1: "Loser buys wings", "*": "Bragging rights" } },
      squares: [sq(6, 7, ME)],
      scores: [score("q1", 7, 3)],
      live: { state: "in", period: 2, clock: "5:00", detail: "", scoreX: 10, scoreY: 3, updatedAt: 1 },
    });
    const cards = periodCards(state, resolveResults(state));
    expect(cards.map((c) => [c.key, c.status])).toEqual([
      ["q1", "done"],
      ["q2", "live"],
      ["q3", "later"],
      ["final", "later"],
    ]);
    expect(cards[0].result?.winnerPlayerId).toBe(ME);
    expect(cards[0].prize).toBe("Loser buys wings");
    expect(cards[1].prize).toBe("Bragging rights");
  });

  it("points at the next period without live data", () => {
    const state = makeState({ game: { status: "locked", numbers: { "*": DIGITS } }, scores: [score("q1", 7, 3)] });
    expect(periodCards(state, resolveResults(state)).map((c) => c.status)).toEqual(["done", "next", "later", "later"]);
  });

  it("adds a next-score card on every-score boards until final", () => {
    const format = { periods: "every-score" as const, reverse: false, boardSize: 100 as const, freshNumbers: false };
    const state = makeState({ game: { status: "locked", numbers: { "*": DIGITS }, format, periods: [] }, scores: [score("s1", 7, 0, "Score 1")] });
    const cards = periodCards(state, resolveResults(state));
    expect(cards.map((c) => [c.key, c.label, c.status])).toEqual([
      ["s1", "Score 1", "done"],
      ["s2", "Next score", "next"],
    ]);
    const done = makeState({ ...state, game: { ...state.game, status: "final" } });
    expect(periodCards(done, resolveResults(done))).toHaveLength(1);
  });
});

describe("players and wins", () => {
  it("sorts by wins, then squares, then join order", () => {
    const state = makeState({
      game: { status: "locked", numbers: { "*": DIGITS } },
      players: [player(ME, "Jordan", 2), player(MAYA, "Maya", 1), player("kim", "Kim", 3)],
      squares: [sq(0, 0, MAYA), sq(0, 1, MAYA), sq(6, 7, "kim"), sq(1, 1, ME)],
      scores: [score("q1", 7, 3)],
    });
    const rows = playerRows(state, resolveResults(state), ME);
    expect(rows.map((r) => [r.player.name, r.squares, r.wins, r.isMe])).toEqual([
      ["Kim", 1, 1, false],
      ["Maya", 2, 0, false],
      ["Jordan", 1, 0, true],
    ]);
    expect(rows[0].winLabels).toEqual(["Q1"]);
    // Regular and reverse both on Kim's square: one label.
    const both = makeState({ ...state, game: { ...state.game, format: { ...state.game.format, reverse: true } }, scores: [score("q1", 7, 7)], squares: [sq(2, 7, "kim")] });
    expect(playerRows(both, resolveResults(both), ME).find((r) => r.player.name === "Kim")?.winLabels).toEqual(["Q1"]);
    expect(rows[1].winLabels).toEqual([]);
  });

  it("ids each of my wins once", () => {
    const state = makeState({
      game: { status: "locked", numbers: { "*": DIGITS }, format: { periods: "quarters", reverse: true, boardSize: 100, freshNumbers: false } },
      squares: [sq(6, 7, ME), sq(2, 3, ME), sq(9, 0, MAYA)],
      scores: [score("q1", 7, 3), score("q2", 0, 0)],
    });
    // q1: regular and reverse are both mine -> one id; q2 is Maya's.
    expect(myWinIds(resolveResults(state), ME)).toEqual(["q1"]);
    const rev = makeState({ ...state, squares: [sq(2, 3, ME), sq(6, 7, MAYA)] });
    expect(myWinIds(resolveResults(rev), ME)).toEqual(["q1:reverse"]);
  });
});

describe("fallbackActivityText", () => {
  const state = makeState();
  const act = (type: Activity["type"], actor: string | null, data: Record<string, unknown> = {}): Activity => ({ id: "a", type, at: 1, actor, data });

  it("words each activity from this device's point of view", () => {
    expect(fallbackActivityText(act("claimed", MAYA, { count: 3 }), state, ME)).toBe("Maya grabbed 3 squares");
    expect(fallbackActivityText(act("claimed", ME, { count: 1 }), state, ME)).toBe("You grabbed a square");
    expect(fallbackActivityText(act("released", MAYA, { count: 1 }), state, ME)).toBe("Maya gave back a square");
    expect(fallbackActivityText(act("joined", MAYA, { name: "Maya" }), state, ME)).toBe("Maya joined");
    expect(fallbackActivityText(act("joined", ME, { name: "Jordan" }), state, ME)).toBe("You joined the board");
    expect(fallbackActivityText(act("locked", null, { auto: true }), state, ME)).toBe("Kickoff! Numbers are locked in");
    expect(fallbackActivityText(act("score", null, { label: "Q1", scoreX: 7, scoreY: 3 }), state, ME)).toBe("Q1: KC 7 – BUF 3");
    expect(fallbackActivityText(act("winner", null, { label: "Q1", playerIds: [ME] }), state, ME)).toBe("Q1: You won!");
    expect(fallbackActivityText(act("winner", null, { label: "Half", playerIds: [MAYA, ME] }), state, ME)).toBe("Half: Maya & You win");
    expect(fallbackActivityText(act("winner", null, { label: "Q3", playerIds: [] }), state, ME)).toBe("Q3: the winning square was empty");
    expect(fallbackActivityText(act("claimed", "stranger", { count: 2 }), state, ME)).toBe("Someone grabbed 2 squares");
  });

  it("never mentions money", () => {
    const all: Activity["type"][] = ["created", "joined", "claimed", "released", "locked", "score", "winner", "final"];
    for (const t of all) {
      const text = fallbackActivityText(act(t, MAYA, { count: 2, label: "Q1", playerIds: [MAYA] }), state, ME);
      expect(text).not.toMatch(/\$|money|bet|wager|pot|payout|cash/i);
    }
  });
});

describe("fresh numbers on the board", () => {
  // Half's draw is DIGITS shifted by one column, so Q1's winner sits elsewhere under it.
  const SHIFTED: NumberDraw = { x: DIGITS.x.map((_, i) => DIGITS.x[(i + 1) % 10]), y: DIGITS.y };
  const fresh = { periods: "quarters" as const, reverse: false, boardSize: 100 as const, freshNumbers: true };

  it("only shows a period's trophy under that period's digits", () => {
    const state = makeState({
      game: { status: "locked", format: fresh, numbers: { q1: DIGITS, q2: SHIFTED, q3: DIGITS, final: DIGITS } },
      squares: [sq(6, 7, ME)],
      scores: [score("q1", 7, 3)],
    });
    const results = resolveResults(state);
    expect(buildCells({ state, me: ME, selection: EMPTY_SELECTION, results, drawKey: "q1" })[6][7].state).toBe("winner");
    expect(buildCells({ state, me: ME, selection: EMPTY_SELECTION, results, drawKey: "q2" })[6][7].state).toBe("mine");
    // Without a draw key (shared numbers), every winner shows.
    expect(buildCells({ state, me: ME, selection: EMPTY_SELECTION, results })[6][7].state).toBe("winner");
  });

  it("uses the caller's now square, including none", () => {
    const state = makeState({
      game: { status: "locked", numbers: { "*": DIGITS } },
      live: { state: "in", period: 2, clock: "5:00", detail: "", scoreX: 14, scoreY: 10, updatedAt: 1 },
    });
    const now = buildCells({ state, me: ME, selection: EMPTY_SELECTION, results: [], now: { cell: { row: 1, col: 1 }, reverseCell: null } });
    expect(now[1][1].live).toBe(true);
    expect(now[9][4].live).toBe(false);
    const none = buildCells({ state, me: ME, selection: EMPTY_SELECTION, results: [], now: null });
    expect(none.flat().some((c) => c.live)).toBe(false);
  });
});

describe("right now", () => {
  const live = { state: "in" as const, period: 3, clock: "8:41", detail: "Q3 8:41", scoreX: 17, scoreY: 13, updatedAt: 1 };

  it("finds the likeliest common scores onto one of my squares", () => {
    const at = { scoreX: 17, scoreY: 13 };
    // 17-13 sits on col 7 / row 6.
    expect(nearestPath(at, DIGITS, new Set(["6,7"]))).toEqual({ plays: [], cell: { row: 6, col: 7 } });
    // A team X field goal: 20-13 -> col 0, row 6.
    expect(nearestPath(at, DIGITS, new Set(["6,0"]))?.plays).toEqual([{ team: "x", points: 3 }]);
    // Field goals by both teams: 20-16 -> col 0, row 3.
    expect(nearestPath(at, DIGITS, new Set(["3,0"]))?.plays).toEqual([
      { team: "x", points: 3 },
      { team: "y", points: 3 },
    ]);
    // X needs +4 and Y needs +6: three scores, too far.
    expect(nearestPath(at, DIGITS, new Set(["0,1"]))).toBeNull();
    // A safety alone would do it (19-13 -> col 9, row 6), but a TD and a field goal (24-16 -> col 4, row 3) is likelier.
    expect(nearestPath(at, DIGITS, new Set(["6,9", "3,4"]))?.plays).toEqual([
      { team: "x", points: 7 },
      { team: "y", points: 3 },
    ]);
    // ...and with only the safety square, the safety it is.
    expect(nearestPath(at, DIGITS, new Set(["6,9"]))?.plays).toEqual([{ team: "x", points: 2 }]);
    expect(nearestPath(at, DIGITS, new Set())).toBeNull();
  });

  it("names the likeliest score that would take my square away", () => {
    const change = nextChange({ scoreX: 17, scoreY: 13 }, DIGITS, "6,7", [sq(6, 7, ME), sq(6, 4, MAYA)]);
    // A team X touchdown: 24-13 -> col 4, row 6 (Maya's).
    expect(change).toEqual({ play: { team: "x", points: 7 }, cell: { row: 6, col: 4 }, ownerId: MAYA });
    // If that lands on another of mine it isn't a threat: next is a team Y touchdown (17-20 -> row 9, col 7).
    const safe = nextChange({ scoreX: 17, scoreY: 13 }, DIGITS, "6,7", [sq(6, 7, ME), sq(6, 4, ME), sq(9, 7, MAYA)], ME);
    expect(safe).toEqual({ play: { team: "y", points: 7 }, cell: { row: 9, col: 7 }, ownerId: MAYA });
  });

  it("reads the live score for the period in play", () => {
    const state = makeState({
      game: { status: "locked", numbers: { "*": DIGITS } },
      squares: [sq(6, 7, MAYA), sq(6, 0, ME)],
      live,
    });
    const now = rightNow(state, ME);
    expect(now).toMatchObject({
      live: true,
      periodKey: "q3",
      label: "Q3",
      detail: "Q3 8:41",
      cell: { row: 6, col: 7 },
      digits: { x: "7", y: "3" },
      ownerId: MAYA,
      mine: false,
      mineCount: 1,
      threat: null,
    });
    expect(now?.path?.plays).toEqual([{ team: "x", points: 3 }]);
  });

  it("warns me what would take the lead away when it's mine", () => {
    const state = makeState({ game: { status: "locked", numbers: { "*": DIGITS } }, squares: [sq(6, 7, ME), sq(6, 4, MAYA)], live });
    const now = rightNow(state, ME);
    expect(now?.mine).toBe(true);
    expect(now?.path).toBeNull();
    expect(now?.threat).toEqual({ play: { team: "x", points: 7 }, ownerId: MAYA });
  });

  it("projects the next period from the last recorded score without live data", () => {
    const state = makeState({ game: { status: "locked", numbers: { "*": DIGITS } }, squares: [sq(6, 7, MAYA)], scores: [score("q1", 7, 3)] });
    expect(rightNow(state, ME)).toMatchObject({ live: false, periodKey: "q2", label: "Half", scoreX: 7, scoreY: 3, cell: { row: 6, col: 7 }, ownerId: MAYA });
    // Before any score: 0-0 for Q1.
    const pre = makeState({ game: { status: "locked", numbers: { "*": DIGITS } } });
    expect(rightNow(pre, ME)).toMatchObject({ periodKey: "q1", scoreX: 0, scoreY: 0, cell: { row: 9, col: 0 } });
  });

  it("uses the period's own draw on fresh-numbers boards", () => {
    const SHIFTED: NumberDraw = { x: DIGITS.x.map((_, i) => DIGITS.x[(i + 1) % 10]), y: DIGITS.y };
    const fresh = { periods: "quarters" as const, reverse: false, boardSize: 100 as const, freshNumbers: true };
    const state = makeState({ game: { status: "locked", format: fresh, numbers: { q1: DIGITS, q2: SHIFTED, q3: DIGITS, final: DIGITS } }, scores: [score("q1", 7, 3)] });
    const now = rightNow(state, ME);
    expect(now?.drawKey).toBe("q2");
    // Digit 7 is in column 6 of the shifted draw.
    expect(now?.cell).toEqual({ row: 6, col: 6 });
  });

  it("says nothing before the draw, once every period is decided, or after the final", () => {
    expect(rightNow(makeState(), ME)).toBeNull();
    const decided = makeState({
      game: { status: "locked", numbers: { "*": DIGITS } },
      scores: [score("q1", 7, 3), score("q2", 7, 3), score("q3", 7, 3), score("final", 7, 3)],
    });
    expect(rightNow(decided, ME)).toBeNull();
    expect(rightNow(makeState({ game: { status: "final", numbers: { "*": DIGITS } }, live }), ME)).toBeNull();
    expect(rightNow(makeState({ game: { status: "locked", numbers: { "*": DIGITS } }, live: { ...live, state: "post" } }), ME)).toBeNull();
  });

  it("lists where the next score lands on every-score boards", () => {
    const format = { periods: "every-score" as const, reverse: false, boardSize: 100 as const, freshNumbers: false };
    const state = makeState({
      game: { status: "locked", numbers: { "*": DIGITS }, format, periods: [] },
      // 7-3 sits on my square already, but that entry is decided: the next score is what counts.
      squares: [sq(6, 7, ME), sq(6, 4, MAYA), sq(3, 0, ME)],
      scores: [score("s1", 7, 3, "Score 1")],
    });
    const now = rightNow(state, ME);
    expect(now).toMatchObject({ everyScore: true, label: "Next score", periodKey: null, threat: null });
    expect(now?.outcomes.map((o) => [o.play.team, o.play.points, o.cell, o.ownerId])).toEqual([
      ["x", 7, { row: 6, col: 4 }, MAYA],
      ["x", 3, { row: 6, col: 0 }, null],
      ["y", 7, { row: 9, col: 7 }, null],
      ["y", 3, { row: 3, col: 7 }, null],
    ]);
    // Not "already there": a team X touchdown and field goal (17-3) comes back to mine, likelier than two field goals (10-6).
    expect(now?.path).toEqual({
      plays: [
        { team: "x", points: 7 },
        { team: "x", points: 3 },
      ],
      cell: { row: 6, col: 7 },
    });
  });

  it("speaks periods like a friend would", () => {
    expect(periodNoun({ key: "q2", label: "Half" })).toBe("the half");
    expect(periodNoun({ key: "q1", label: "Q1" })).toBe("Q1");
    expect(periodNoun({ key: "final", label: "Final" })).toBe("the final");
  });
});
