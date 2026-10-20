import { describe, expect, it } from "vitest";
import { mentionsMoney, validatePrizeNote } from "./formats";
import {
  MAX_GROUP_BOARDS,
  SIBLING_ERRORS,
  boardCountLine,
  groupSize,
  nextSiblingName,
  siblingBoardName,
  siblingCheckOf,
  siblingPriceLine,
  siblingProblem,
  siblingStatusLine,
  siblingSummary,
  type SiblingCheck,
} from "./siblings";
import type { GameState, SiblingBoard } from "./types";

const NOW = Date.UTC(2026, 9, 19, 12);

const sib = (over: Partial<SiblingBoard> = {}): SiblingBoard => ({
  id: "b2",
  name: "Board 2",
  status: "open",
  squarePrice: 5,
  unit: "$",
  justForFun: false,
  squaresLeft: 42,
  totalSquares: 100,
  ...over,
});

describe("siblingSummary (what a board's siblings list shows)", () => {
  it("keeps the public basics: name, status, the display-only square price and squares left", () => {
    const s = siblingSummary({ id: "abc", name: "Office · Board 2", status: "open", format: { boardSize: 100, squarePrice: 5, unit: "$" } }, 58);
    expect(s).toEqual({ id: "abc", name: "Office · Board 2", status: "open", squarePrice: 5, unit: "$", justForFun: false, squaresLeft: 42, totalSquares: 100 });
    // Exactly these keys: nothing about who hosts or plays it.
    expect(Object.keys(s).sort()).toEqual(["id", "justForFun", "name", "squarePrice", "squaresLeft", "status", "totalSquares", "unit"]);
  });

  it("drops the price on a just-for-fun board or without one, and reads 5x5 and points", () => {
    expect(siblingSummary({ id: "a", name: "A", status: "open", format: { boardSize: 25, squarePrice: 3, justForFun: true } }, 0)).toMatchObject({
      squarePrice: null,
      justForFun: true,
      squaresLeft: 25,
      totalSquares: 25,
    });
    expect(siblingSummary({ id: "a", name: "A", status: "locked", format: { boardSize: 100, squarePrice: null } }, 100)).toMatchObject({ squarePrice: null, squaresLeft: 0 });
    expect(siblingSummary({ id: "a", name: "A", status: "open", format: { boardSize: 100, squarePrice: 10, unit: "pts" } }, 0)).toMatchObject({ squarePrice: 10, unit: "pts" });
    // Never below zero, whatever the count says.
    expect(siblingSummary({ id: "a", name: "A", status: "open", format: { boardSize: 25 } }, 40).squaresLeft).toBe(0);
  });
});

describe("siblingProblem (can another board join this game?)", () => {
  const check = (over: Partial<SiblingCheck> = {}): SiblingCheck => ({ status: "open", linkedEvent: null, scored: false, live: null, groupSize: 1, ...over });

  it("is fine before the game starts, drawn or not", () => {
    expect(siblingProblem(check(), NOW)).toBeNull();
    expect(siblingProblem(check({ status: "locked" }), NOW)).toBeNull();
    expect(siblingProblem(check({ linkedEvent: { startsAt: NOW + 60_000 }, live: "pre" }), NOW)).toBeNull();
  });

  it("refuses a game that's over, has started, or a full group", () => {
    expect(siblingProblem(check({ status: "final" }), NOW)).toBe(SIBLING_ERRORS.final);
    expect(siblingProblem(check({ scored: true }), NOW)).toBe(SIBLING_ERRORS.started);
    expect(siblingProblem(check({ live: "in" }), NOW)).toBe(SIBLING_ERRORS.started);
    expect(siblingProblem(check({ live: "post" }), NOW)).toBe(SIBLING_ERRORS.started);
    expect(siblingProblem(check({ linkedEvent: { startsAt: NOW } }), NOW)).toBe(SIBLING_ERRORS.started);
    expect(siblingProblem(check({ groupSize: MAX_GROUP_BOARDS - 1 }), NOW)).toBeNull();
    expect(siblingProblem(check({ groupSize: MAX_GROUP_BOARDS }), NOW)).toBe(SIBLING_ERRORS.full);
  });

  it("reads the check off a board's state", () => {
    const state = {
      game: { status: "open", linkedEvent: { provider: "espn", league: "nfl", eventId: "1", startsAt: NOW + 1, xIsHome: false } },
      scores: [],
      live: { state: "pre" },
      siblings: [sib(), sib({ id: "b3" })],
    } as unknown as GameState;
    expect(siblingCheckOf(state)).toEqual({ status: "open", linkedEvent: state.game.linkedEvent, scored: false, live: "pre", groupSize: 3 });
    expect(groupSize({})).toBe(1);
  });
});

describe("copy", () => {
  it("names a new board by its place in the group, never by its price", () => {
    expect(siblingBoardName("Office Squares", 2)).toBe("Office Squares · Board 2");
    // Made from a board that already has a number: the base name, not "· Board 2 · Board 3".
    expect(siblingBoardName("Office Squares · Board 2", 3)).toBe("Office Squares · Board 3");
    expect(siblingBoardName("", 2)).toBe("Squares · Board 2");
    // Under the server's 60-character limit.
    const long = siblingBoardName("A".repeat(70), 10);
    expect(Array.from(long).length).toBeLessThanOrEqual(60);
    expect(long.endsWith(" · Board 10")).toBe(true);
    // A board name is every push's title: the suggestion never mentions money.
    for (const name of [siblingBoardName("Bills vs Chiefs Squares", 2), siblingBoardName("Big Game", 9)]) expect(mentionsMoney(name)).toBe(false);
  });

  it("suggests the next number in the group, past any in use", () => {
    const game = { name: "Office Squares" } as GameState["game"];
    expect(nextSiblingName({ game })).toBe("Office Squares · Board 2");
    expect(nextSiblingName({ game, siblings: [sib({ name: "Office Squares · Board 2" })] })).toBe("Office Squares · Board 3");
    // Board 2 was deleted, Board 3 stays: the next is 4, not a second 3.
    expect(nextSiblingName({ game, siblings: [sib({ name: "Office Squares · Board 3" })] })).toBe("Office Squares · Board 4");
    // Made from a numbered board: the base name, the next number.
    expect(nextSiblingName({ game: { name: "Office Squares · Board 2" } as GameState["game"], siblings: [sib({ name: "Office Squares" })] })).toBe(
      "Office Squares · Board 3",
    );
  });

  it("says the price in the app, and where each sibling stands", () => {
    expect(siblingPriceLine(sib())).toBe("$5 a square");
    expect(siblingPriceLine(sib({ squarePrice: 2.5 }))).toBe("$2.50 a square");
    expect(siblingPriceLine(sib({ unit: "pts", squarePrice: 10 }))).toBe("10 pts a square");
    expect(siblingPriceLine(sib({ squarePrice: null }))).toBeNull();
    expect(siblingPriceLine(sib({ squarePrice: null, justForFun: true }))).toBe("Just for fun");
    expect(siblingStatusLine(sib())).toBe("42 left");
    expect(siblingStatusLine(sib({ squaresLeft: 0 }))).toBe("Board's full");
    expect(siblingStatusLine(sib({ status: "locked" }))).toBe("Numbers drawn");
    expect(siblingStatusLine(sib({ status: "final" }))).toBe("Final");
  });

  it("counts boards for share text with no amount in it", () => {
    expect(boardCountLine({})).toBeNull();
    expect(boardCountLine({ siblings: [] })).toBeNull();
    const line = boardCountLine({ siblings: [sib(), sib({ id: "b3", squarePrice: 20 })] });
    expect(line).toBe("This game has 3 boards");
    expect(validatePrizeNote(line!)).toBeNull();
    expect(mentionsMoney(line!)).toBe(false);
  });
});
