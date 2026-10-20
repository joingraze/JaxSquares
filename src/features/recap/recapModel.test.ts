// The recap card as data: what it says (teams, score, each moment's winner,
// period and digits, the board, the sign-off) and where it all goes, tested
// apart from the canvas. Above all: no amount ever makes it onto the image.

import { describe, expect, it } from "vitest";
import { validatePrizeNote } from "../../../shared/formats";
import type { GameFormat, GameState, MomentRule, Player, Score } from "../../../shared/types";
import {
  RECAP_FOOTER,
  RECAP_HEIGHT,
  RECAP_ROW_CAPACITY,
  RECAP_WIDTH,
  fitRows,
  readableOnCard,
  recapCard,
  recapLayout,
  recapShareText,
  recapTexts,
  type RecapRow,
} from "./recapModel";

/** Digit d in column d and row d: a score's square is (y % 10, x % 10). */
const digits = Array.from({ length: 10 }, (_, d) => [d]);

const player = (id: string, name: string, emoji = ""): Player => ({ id, name, color: "#38b6ff", emoji, joinedAt: 0, isHost: id === "ana" });
const score = (periodKey: string, scoreX: number, scoreY: number): Score => ({ periodKey, scoreX, scoreY, source: "live", updatedAt: 0 });
const sq = (row: number, col: number, playerId: string) => ({ row, col, playerId, claimedAt: 0 });

// Amounts everywhere a host can put one: the price, every prize, by score type, the rest.
const prize = (amount: number) => ({ amount, note: "Loser buys wings" });
const quarters: MomentRule[] = [
  { moment: "q1", square: prize(250), reverse: prize(40) },
  { moment: "q2", square: prize(250), reverse: prize(40) },
  { moment: "q3", square: prize(250), reverse: prize(40) },
  { moment: "final", square: { amount: null, note: "", rest: true }, reverse: prize(40) },
];
const format = (rules: MomentRule[]): GameFormat => ({ periods: "custom", reverse: true, boardSize: 100, freshNumbers: false, rules, unit: "$", squarePrice: 25 });

function state(over: Partial<GameState["game"]> = {}, extra: Partial<GameState> = {}): GameState {
  return {
    game: {
      id: "k7m2px",
      name: "Office Squares",
      sport: "football",
      league: "nfl",
      teamX: { name: "Kansas City Chiefs", abbr: "KC", color: "#e31837" },
      teamY: { name: "Buffalo Bills", abbr: "BUF", color: "#00338d" },
      format: format(quarters),
      periods: [
        { key: "q1", label: "Q1" },
        { key: "q2", label: "Half" },
        { key: "q3", label: "Q3" },
        { key: "final", label: "Final" },
      ],
      prizes: {},
      maxPerPlayer: 0,
      numbers: { "*": { x: digits, y: digits } },
      status: "final",
      linkedEvent: null,
      hostPlayerId: "ana",
      createdAt: 0,
      lockedAt: 1,
      ...over,
    },
    players: [player("ana", "Ana", "🦊"), player("ben", "Ben Okafor"), player("cy", "Cy")],
    // Q1 7-3: Ana (3,7), reverse Ben (7,3). Half 14-10: nobody (0,4), reverse Cy (4,0). Q3 17-10: Ben (0,7). Final 27-24: Cy (4,7).
    squares: [sq(3, 7, "ana"), sq(7, 3, "ben"), sq(4, 0, "cy"), sq(0, 7, "ben"), sq(4, 7, "cy")],
    scores: [score("q1", 7, 3), score("q2", 14, 10), score("q3", 17, 10), score("final", 27, 24)],
    manualWinners: [],
    live: null,
    activity: [],
    version: 9,
    ...extra,
  };
}

describe("recapCard (what the card says)", () => {
  it("has the board, the teams, the final score and each moment's winner with its digits", () => {
    const card = recapCard(state())!;
    expect(card.boardName).toBe("Office Squares");
    expect([card.teamX.name, card.teamX.abbr, card.teamY.name, card.teamY.abbr]).toEqual(["Chiefs", "KC", "Bills", "BUF"]);
    expect(card.score).toEqual({ x: 27, y: 24 });
    expect(card.final).toBe(true);
    expect(card.status).toBe("Final");
    expect(card.winners).toBe(3);
    expect(card.rows.map((r) => [r.label, r.winner?.name ?? null, r.digits])).toEqual([
      ["Q1", "Ana", [7, 3]],
      ["Q1 reverse", "Ben Okafor", [3, 7]],
      ["Half", null, [4, 0]],
      ["Half reverse", "Cy", [0, 4]],
      ["Q3", "Ben Okafor", [7, 0]],
      ["Q3 reverse", null, [0, 7]],
      ["Final", "Cy", [7, 4]],
      ["Final reverse", null, [4, 7]],
    ]);
    expect(card.rows[0].winner).toMatchObject({ emoji: "🦊", initials: "AN" });
  });

  it("is nothing before the first moment is decided, and says where a game in progress stands", () => {
    expect(recapCard(state({ status: "locked" }, { scores: [] }))).toBeNull();
    const half = recapCard(state({ status: "locked" }, { scores: [score("q1", 7, 3), score("q2", 14, 10)] }))!;
    expect(half.final).toBe(false);
    expect(half.status).toBe("At halftime");
    expect(half.score).toEqual({ x: 14, y: 10 });
    // The live score once the feed is on.
    const live = recapCard(state({ status: "locked" }, { scores: [score("q1", 7, 3)], live: { state: "in", period: 2, clock: "4:12", detail: "Q2 4:12", scoreX: 10, scoreY: 3, updatedAt: 0 } }))!;
    expect(live.status).toBe("After Q1");
    expect(live.score).toEqual({ x: 10, y: 3 });
  });

  it("labels every-score entries by kind, never by amount", () => {
    const every: MomentRule[] = [{ moment: "score", square: { amount: 10, note: "", byKind: { touchdown: 20, fieldGoal: 10, extraPoint: 5 } }, reverse: null }];
    const s = state(
      { status: "locked", format: format(every), periods: [] },
      { scores: [score("s1", 6, 0), score("s2", 7, 0), score("s3", 7, 3)], squares: [sq(0, 6, "ana"), sq(0, 7, "ben"), sq(3, 7, "cy")] },
    );
    const card = recapCard(s)!;
    expect(card.rows.map((r) => r.label)).toEqual(["Score 1 · TD", "Score 2 · XP", "Score 3 · FG"]);
    expect(card.status).toBe("After score 3");
  });
});

describe("recapLayout (where it goes)", () => {
  const texts = (s: GameState) => recapTexts(recapLayout(recapCard(s)!));

  it("is 1080×1350 with Jax, the board, the teams and the sign-off on it", () => {
    const layout = recapLayout(recapCard(state())!);
    expect([layout.width, layout.height]).toEqual([RECAP_WIDTH, RECAP_HEIGHT]);
    expect(layout.ops.filter((op) => op.kind === "jax")).toHaveLength(1);
    const all = recapTexts(layout);
    expect(all).toEqual(expect.arrayContaining(["OFFICE SQUARES", "Final", "KC", "BUF", "Chiefs", "Bills", "27", "24", "WINNERS", "3 players won", RECAP_FOOTER.join("")]));
    expect(all).toContain("Made with JaxSquares · jaxsquares.com");
    expect(all).toContain("7–3");
    expect(all).toContain("Nobody had it");
  });

  it("never puts an amount on the image: no price, prize, by-kind amount or the rest", () => {
    const every: MomentRule[] = [
      { moment: "score", square: { amount: 10, note: "", byKind: { touchdown: 20, fieldGoal: 10, extraPoint: 5 } }, reverse: null },
      { moment: "final", square: { amount: null, note: "Loser buys wings", rest: true }, reverse: null },
    ];
    const boards = [
      state(),
      state({ format: { ...format(quarters), unit: "pts", squarePrice: 40 } }),
      state({ status: "locked", format: format(every), periods: [{ key: "final", label: "Final" }] }, { scores: [score("s1", 6, 0), score("s2", 7, 0)], squares: [sq(0, 6, "ana")] }),
    ];
    for (const s of boards) {
      for (const text of texts(s)) {
        expect(text).not.toMatch(/\$|\bpts?\b|\brest\b|\b(250|40|25|20|10|5)\b(?!\s*(?:–|-))/);
        expect(text).not.toMatch(/bet|wager|pot\b|payout|buy-in|jackpot|odds|stakes|gamble/i);
        // The same checks a prize note gets: nothing reads as money.
        if (text !== "Made with JaxSquares · jaxsquares.com") expect(validatePrizeNote(text)).toBeNull();
      }
    }
  });

  it("keeps everything on the card", () => {
    for (const op of recapLayout(recapCard(state())!).ops) {
      if (op.kind === "rect" || op.kind === "jax") {
        expect(op.x).toBeGreaterThanOrEqual(0);
        expect(op.y).toBeGreaterThanOrEqual(0);
        expect(op.x + op.w).toBeLessThanOrEqual(RECAP_WIDTH);
        expect(op.y + op.h).toBeLessThanOrEqual(RECAP_HEIGHT);
      }
      if (op.kind === "text" || op.kind === "runs") {
        expect(op.y).toBeLessThanOrEqual(RECAP_HEIGHT - 24);
        expect(op.x).toBeGreaterThanOrEqual(0);
        expect(op.x).toBeLessThanOrEqual(RECAP_WIDTH);
      }
    }
  });

  it("fits the rows it can and says how many more there are, the Final's winner always among them", () => {
    expect(RECAP_ROW_CAPACITY).toBe(7);
    // Four moments, each with its reverse: eight rows for seven lines.
    const layout = recapLayout(recapCard(state())!);
    expect(layout.rows.map((r) => r.key)).toEqual(["q1", "q1:reverse", "q2", "q2:reverse", "q3", "final"]);
    expect(layout.more).toBe(2);
    expect(recapTexts(layout)).toContain("+ 2 more on the board");

    const row = (key: string, fixed: boolean, reverse = false): RecapRow => ({ key, label: key, winner: null, digits: null, reverse, fixed });
    const rows = [row("s1", false), row("q1", true), row("s2", false), row("s3", false), row("q2", true), row("s4", false)];
    // Fixed moments, then the latest scores; shown in game order.
    expect(fitRows(rows, 4).shown.map((r) => r.key)).toEqual(["q1", "q2", "s4"]);
    expect(fitRows(rows, 4).more).toBe(3);
    expect(fitRows(rows, 6)).toEqual({ shown: rows, more: 0 });
    // The Final first, then the other squares, then the reverse squares.
    const both = ["q1", "q2", "q3", "final"].flatMap((k) => [row(k, true), row(`${k}:reverse`, true, true)]);
    expect(fitRows(both, 4).shown.map((r) => r.key)).toEqual(["q1", "q2", "final"]);
    expect(fitRows(both, 6).shown.map((r) => r.key)).toEqual(["q1", "q1:reverse", "q2", "q3", "final"]);
  });

  it("lifts a dark team color until its digits read on the card", () => {
    const navy = readableOnCard("#0b2265");
    expect(navy).not.toBe("#0b2265");
    expect(readableOnCard("#ffd56b")).toBe("#ffd56b");
    const card = recapCard(state())!;
    expect(card.teamY.text).not.toBe(card.teamY.color);
  });
});

describe("recapShareText", () => {
  it("says the score and how many won, never an amount", () => {
    const text = recapShareText(recapCard(state())!);
    expect(text).toBe("Final: Chiefs 27, Bills 24 · 3 winners on Office Squares 🏈");
    expect(validatePrizeNote(text)).toBeNull();
  });
});
