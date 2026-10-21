import { describe, expect, it } from "vitest";
import { resolveResults } from "../../../shared/squares";
import type { Activity, GameFormat, GameState, MomentRule, NumberDraw, Player, Square } from "../../../shared/types";
import { periodCards } from "../board/boardModel";
import { tvShowAll } from "../../../shared/tv";
import { CLAIM_LINE } from "../../../shared/venue";
import { celebrationFor, firstName, latest, resultLabel, tvCellName, tvDetails, tvLayout, tvUpcoming, tvWinners } from "./tvModel";

// Column c holds digit c for the Chiefs; row r holds 9 - r for the Bills: 7–3 lands on row 6, column 7.
const DRAW: NumberDraw = {
  x: [[0], [1], [2], [3], [4], [5], [6], [7], [8], [9]],
  y: [[9], [8], [7], [6], [5], [4], [3], [2], [1], [0]],
};
const RULES: MomentRule[] = [
  { moment: "q1", square: { amount: 200, note: "Loser buys wings" }, reverse: null },
  { moment: "q2", square: { amount: 200, note: "" }, reverse: { amount: 50, note: "" } },
  { moment: "q3", square: { amount: 200, note: "" }, reverse: null },
  { moment: "final", square: { amount: null, note: "", rest: true }, reverse: null },
];
const FORMAT: GameFormat = { periods: "custom", reverse: true, boardSize: 100, freshNumbers: false, rules: RULES, unit: "$", squarePrice: 10 };

const player = (id: string, name: string, color = "#ff6b35"): Player => ({ id, name, color, emoji: "", joinedAt: 0, isHost: false });
const PLAYERS = [player("maya", "Maya"), player("dre", "Dre", "#4dabf7"), player("kim", "Kim")];
const everySquare = (): Square[] =>
  Array.from({ length: 100 }, (_, i) => ({ row: Math.floor(i / 10), col: i % 10, playerId: PLAYERS[i % 3].id, claimedAt: 0 }));

function makeState(over: Partial<GameState["game"]> = {}, rest: Partial<GameState> = {}): GameState {
  return {
    game: {
      id: "tv1234",
      name: "Sunday Night Squares",
      sport: "football",
      league: "custom",
      teamX: { name: "Chiefs", abbr: "KC", color: "#e31837" },
      teamY: { name: "Bills", abbr: "BUF", color: "#00338d" },
      format: FORMAT,
      periods: [
        { key: "q1", label: "Q1" },
        { key: "q2", label: "Half" },
        { key: "q3", label: "Q3" },
        { key: "final", label: "Final" },
      ],
      prizes: {},
      maxPerPlayer: 0,
      numbers: { "*": DRAW },
      status: "locked",
      linkedEvent: null,
      hostPlayerId: "maya",
      createdAt: 0,
      lockedAt: 1,
      ...over,
    },
    players: PLAYERS,
    squares: everySquare(),
    scores: [],
    manualWinners: [],
    live: null,
    activity: [],
    version: 1,
    ...rest,
  };
}

const score = (periodKey: string, scoreX: number, scoreY: number) => ({ periodKey, scoreX, scoreY, source: "host" as const, updatedAt: 1 });

describe("tvLayout (grid sizing)", () => {
  it("fills a 1080p TV's height with the board and leaves the panel the rest", () => {
    const l = tvLayout(1920, 1080, 10);
    expect(l.orientation).toBe("landscape");
    expect(l.board).toBeLessThanOrEqual(1080 - 2 * l.pad);
    expect(l.board).toBeGreaterThan(1080 * 0.9);
    expect(l.board + l.panel.width + 3 * l.pad).toBeLessThanOrEqual(1920);
    expect(l.panel.width).toBeGreaterThan(700);
    // Whole pixels, and the parts add up to the board.
    expect(Number.isInteger(l.cell)).toBe(true);
    expect(l.band + l.axis + 10 * l.cell + 11 * l.gap).toBe(l.board);
    expect(l.cell).toBeGreaterThanOrEqual(80);
  });

  it("scales with the screen: 720p is two thirds of 1080p, 4K twice", () => {
    const hd = tvLayout(1280, 720, 10);
    const full = tvLayout(1920, 1080, 10);
    const uhd = tvLayout(3840, 2160, 10);
    expect(hd.unit).toBeCloseTo(7.2);
    expect(full.unit).toBeCloseTo(10.8);
    expect(uhd.unit).toBeCloseTo(21.6);
    expect(Math.abs(hd.cell - (full.cell * 2) / 3)).toBeLessThanOrEqual(2);
    expect(Math.abs(uhd.cell - full.cell * 2)).toBeLessThanOrEqual(3);
  });

  it("keeps room for the panel on a wide screen, and gives a 5×5 board bigger squares", () => {
    const wide = tvLayout(2560, 1080, 10);
    expect(wide.board).toBeLessThanOrEqual(1080);
    expect(tvLayout(1920, 1080, 5).cell).toBeGreaterThan(tvLayout(1920, 1080, 10).cell * 1.8);
    // A 4:3 laptop: the board yields width to the panel.
    const square = tvLayout(1024, 768, 10);
    expect(square.board).toBeLessThanOrEqual((1024 - 3 * square.pad) * 0.6 + 1);
  });

  it("stacks on a portrait screen (a phone mirroring to a TV)", () => {
    const l = tvLayout(390, 844, 10);
    expect(l.orientation).toBe("portrait");
    expect(l.board).toBeLessThanOrEqual(390 - 2 * l.pad);
    expect(l.panel.width).toBe(390 - 2 * l.pad);
    expect(l.panel.height).toBeGreaterThan(0);
  });
});

describe("tvCellName (a square's name under its sticker)", () => {
  it("shows the first name at the board's size, smaller when it's long, never below what reads across a room", () => {
    const maya = tvCellName("Maya", 90);
    expect(maya.text).toBe("Maya");
    expect(maya.size).toBeLessThanOrEqual(90 * 0.26);
    expect(tvCellName("Mary Elizabeth Johnson", 90).text).toBe("Mary");
    const priya = tvCellName("Priyanka", 90);
    expect(priya.size).toBeLessThanOrEqual(maya.size);
    expect(priya.size).toBeGreaterThanOrEqual(90 * 0.17);
    // Longer still: the floor, and the square clips the rest (like the board's).
    expect(tvCellName("Christopher", 60)).toEqual({ text: "Christopher", size: Math.floor(60 * 0.17 * 10) / 10 });
    expect(tvCellName("   ", 90).text).toBe("?");
  });

  it("takes the first word as the first name", () => {
    expect(firstName("  Mary   Beth ")).toBe("Mary");
    expect(firstName("")).toBe("");
  });
});

describe("winners so far", () => {
  const decided = makeState({}, { scores: [score("q1", 7, 3), score("q2", 14, 10)] });
  const results = resolveResults(decided);

  it("labels each moment like the board's result cards, with its amount, and names the winner", () => {
    const winners = tvWinners(decided, results);
    expect(winners.map((w) => w.label)).toEqual(["Q1 · $200", "Half · $200"]);
    // 7–3: row 6, column 7 -> square 67 -> 67 % 3 = 1 -> Dre.
    expect(winners[0]).toMatchObject({ key: "q1", score: "7–3", player: { name: "Dre" }, prize: "Loser buys wings", reverse: null });
    expect(winners[1].prize).toBeNull();
    // Halftime 14–10: square 94 -> Dre; its reverse 10–14 (square 50) -> Kim.
    expect(winners[1].player?.name).toBe("Dre");
    expect(winners[1].reverse).toMatchObject({ label: "Reverse · $50", player: { name: "Kim" } });
    expect(resultLabel(results[0], "$")).toBe("Q1 · $200");
  });

  it("says nobody had it for an empty square, and leaves amounts out on a board without them", () => {
    const empty = makeState({ format: { ...FORMAT, rules: RULES.map((r) => ({ ...r, square: r.square && { amount: null, note: r.square.note } })), squarePrice: null } }, { squares: [], scores: [score("q1", 7, 3)] });
    const [w] = tvWinners(empty, resolveResults(empty));
    expect(w).toMatchObject({ label: "Q1", player: null, score: "7–3" });
  });

  it("shows the latest that fit, in game order", () => {
    expect(latest([1, 2, 3, 4, 5], 3)).toEqual({ shown: [3, 4, 5], earlier: 2 });
    expect(latest([1, 2], 5)).toEqual({ shown: [1, 2], earlier: 0 });
    expect(latest([1, 2], Number.POSITIVE_INFINITY)).toEqual({ shown: [1, 2], earlier: 0 });
    expect(latest([1, 2], 0)).toEqual({ shown: [], earlier: 2 });
  });

  it("lists what's still to play with what each can show (the final takes the rest)", () => {
    const upcoming = tvUpcoming(periodCards(decided, results), "$");
    expect(upcoming.map((u) => `${u.label}:${u.amount}`)).toEqual(["Q3:$200", "Final:the rest"]);
    expect(upcoming.map((u) => u.note)).toEqual([null, null]);
  });

  it("puts each prize's note on what's still to play (the reverse square's on a reverse-only moment)", () => {
    const rules: MomentRule[] = [
      { moment: "q3", square: { amount: null, note: "Free wings" }, reverse: null },
      { moment: "final", square: null, reverse: { amount: null, note: "Team jersey" } },
    ];
    const s = makeState({ format: { ...FORMAT, rules, squarePrice: null } });
    expect(tvUpcoming(periodCards(s, resolveResults(s)), "$").map((u) => `${u.label}:${u.note}`)).toEqual(["Q3:Free wings", "Final:Team jersey"]);
  });
});

describe("what the host lets the TV show", () => {
  const decided = makeState({}, { scores: [score("q1", 7, 3), score("q2", 14, 10)] });
  const results = resolveResults(decided);

  it("leaves amounts off winners, what's still to play and the prizes card when amounts are off", () => {
    const show = tvShowAll(decided.game, { amounts: false });
    const winners = tvWinners(decided, results, show);
    expect(winners.map((w) => w.label)).toEqual(["Q1", "Half"]);
    expect(winners[0].prize).toBe("Loser buys wings");
    expect(winners[1].reverse?.label).toBe("Reverse");
    expect(tvUpcoming(periodCards(decided, results), "$", show).map((u) => u.amount)).toEqual([null, null]);
    const d = tvDetails({ format: FORMAT }, show);
    expect(d?.price).toBeNull();
    expect(d?.prizes.map((p) => [p.label, p.amount, p.note])).toEqual([["Q1", null, "Loser buys wings"]]);
  });

  it("leaves prizes off when prizes are off, and nothing to spell out leaves no card", () => {
    const show = tvShowAll(decided.game, { prizes: false });
    expect(tvWinners(decided, results, show)[0].prize).toBeNull();
    expect(tvDetails({ format: FORMAT }, show)).toBeNull();
  });

  it("hides house rules, and shows free to play on any board with no square price, as the host picks", () => {
    const venueFormat = { ...FORMAT, squarePrice: null, houseRules: ["Must be present to win"] };
    expect(tvDetails({ format: venueFormat }, tvShowAll({ format: venueFormat }, { houseRules: false, prizes: false }))).toBeNull();
    expect(tvDetails({ format: venueFormat }, tvShowAll({ format: venueFormat }, { prizes: false, freeToPlay: true }))?.venue).toEqual([
      "Free to play · No purchase necessary",
    ]);
  });

  it("celebrates nobody when celebrations are off", () => {
    const winner: Activity = { id: "a", type: "winner", actor: null, data: { periodKey: "q1", label: "Q1", playerIds: ["dre"] }, at: 2 };
    expect(celebrationFor(winner, decided, results, tvShowAll(decided.game, { celebrations: false }))).toBeNull();
    expect(celebrationFor(winner, decided, results, tvShowAll(decided.game, { amounts: false }))).toMatchObject({ amount: null, prize: "Loser buys wings" });
  });
});

describe("tvDetails (prizes and house rules on the TV)", () => {
  const club = { id: "c1", name: "The Rusty Anchor", hasLogo: false, logoVersion: null };

  it("is nothing on a board with amounts only: the open panel keeps its one-line amounts", () => {
    expect(tvDetails({ format: { ...FORMAT, rules: RULES.map((r) => ({ ...r, square: r.square && { ...r.square, note: "" } })) } })).toBeNull();
  });

  it("spells out each prize with its note, the reverse square's beside it", () => {
    const d = tvDetails({ format: FORMAT });
    expect(d?.price).toBe("$10 a square");
    expect(d?.prizes.map((p) => [p.label, p.amount, p.note, p.reverse])).toEqual([
      ["Q1", "$200", "Loser buys wings", null],
      ["Half", "$200", null, { amount: "$50", note: null }],
      ["Q3", "$200", null, null],
      ["Final", "the rest", null, null],
    ]);
    expect(d?.rules).toEqual([]);
  });

  it("adds a venue's house rules, how winners collect, and its free-to-play lines", () => {
    const rules: MomentRule[] = [{ moment: "final", square: { amount: null, note: "Gift card" }, reverse: null }];
    const d = tvDetails({ format: { ...FORMAT, rules, squarePrice: null, houseRules: ["Must be present to win"], claimCodes: true }, club });
    expect(d).toEqual({
      price: null,
      prizes: [{ moment: "final", label: "Final", amount: null, note: "Gift card", reverse: null }],
      rules: ["Must be present to win", CLAIM_LINE],
      venue: ["Free to play · No purchase necessary", "Prizes from The Rusty Anchor"],
    });
  });

  it("leaves amounts off a just-for-fun board's prizes", () => {
    const rules: MomentRule[] = [{ moment: "final", square: { amount: 100, note: "Bragging rights" }, reverse: null }];
    expect(tvDetails({ format: { ...FORMAT, rules, justForFun: true, squarePrice: null } })?.prizes).toEqual([
      { moment: "final", label: "Final", amount: null, note: "Bragging rights", reverse: null },
    ]);
  });
});

describe("celebrationFor", () => {
  const state = makeState({}, { scores: [score("q1", 7, 3), score("q2", 14, 10)] });
  const winner = (periodKey: string, label: string): Activity => ({
    id: `a-${periodKey}`,
    type: "winner",
    actor: null,
    data: { periodKey, label, playerIds: ["dre"], cell: { row: 6, col: 7 }, prize: null },
    at: 2,
  });

  it("celebrates a winner with the board's amount and score", () => {
    expect(celebrationFor(winner("q1", "Q1"), state)).toEqual({
      id: "a-q1",
      periodKey: "q1",
      title: "Q1 winner",
      kind: null,
      player: { id: "dre", name: "Dre", color: "#4dabf7", emoji: "" },
      amount: "$200",
      prize: "Loser buys wings",
      score: "KC 7 – 3 BUF",
      reverse: null,
      claim: false,
    });
    const half = celebrationFor(winner("q2", "Half"), state);
    expect(half).toMatchObject({ title: "Halftime winner", amount: "$200", prize: null, reverse: { player: { name: "Kim" }, amount: "$50", prize: null } });
  });

  it("says the winner has a claim code on a board that uses them (never the code)", () => {
    const venue = makeState({ format: { ...FORMAT, claimCodes: true } }, { scores: [score("q1", 7, 3)] });
    const c = celebrationFor(winner("q1", "Q1"), venue);
    expect(c?.claim).toBe(true);
    expect(JSON.stringify(c)).not.toMatch(/code/i);
  });

  it("ignores anything that isn't a winner, or a moment that was taken back", () => {
    expect(celebrationFor({ ...winner("q1", "Q1"), type: "score" }, state)).toBeNull();
    expect(celebrationFor(winner("q3", "Q3"), state)).toBeNull();
  });
});
