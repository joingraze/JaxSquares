import { describe, expect, it } from "vitest";
import type { GameState, NumberDraw, Player } from "../../../shared/types";
import { askCopy } from "./askCopy";

const ME = "me_public_id_000000000";
const MAYA = "maya_public_id_0000000";

const digits = (order: number[]): number[][] => order.map((d) => [d]);
const DRAW: NumberDraw = { x: digits([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]), y: digits([9, 8, 7, 6, 5, 4, 3, 2, 1, 0]) };
const player = (id: string, name: string, emoji: string): Player => ({ id, name, color: "#ff6b35", emoji, joinedAt: 1, isHost: id === ME });

function board(over: Partial<GameState["game"]> = {}, squares: GameState["squares"] = []): GameState {
  return {
    game: {
      id: "g1",
      name: "Sunday Night Squares",
      sport: "football",
      league: "custom",
      teamX: { name: "Chiefs", abbr: "KC" },
      teamY: { name: "Bills", abbr: "BUF" },
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
      hostPlayerId: ME,
      createdAt: 1,
      lockedAt: null,
      ...over,
    },
    players: [player(ME, "Jordan", "🏈"), player(MAYA, "Maya", "🦊")],
    squares,
    scores: [],
    manualWinners: [],
    live: null,
    activity: [],
    version: 1,
  };
}

describe("askCopy", () => {
  it("pitches the host on the pings that keep hosting effortless, for the board just made", () => {
    const c = askCopy("created", board(), ME);
    expect(c.boardName).toBe("Sunday Night Squares");
    expect(c.lines).toEqual(["🦊 Maya joined your board. 2 players in.", "🙌 Board's full. Time to draw the numbers."]);
    expect(c.scope).toContain("Friends joining (quietly)");
    expect(c.scope).toContain("Board's full: time to draw");
  });

  it("previews my own board and squares after a claim", () => {
    const squares = [
      { row: 0, col: 3, playerId: ME, claimedAt: 1 },
      { row: 1, col: 1, playerId: ME, claimedAt: 1 },
    ];
    const c = askCopy("claimed", board({ hostPlayerId: MAYA }, squares), ME);
    expect(c.lines[0]).toBe("🔢 Numbers are in. Find your 2 squares.");
    expect(c.lines[1]).toMatch(/^🎉 KC 7 – BUF 3 at Q1/);
    expect(c.body).toMatch(/one of your 2 squares/);
  });

  it("uses my real numbers once they're drawn", () => {
    const squares = [{ row: 2, col: 7, playerId: ME, claimedAt: 1 }];
    const c = askCopy("joined", board({ hostPlayerId: MAYA, status: "locked", numbers: { "*": DRAW } }, squares), ME);
    expect(c.lines).toEqual(["🔢 Numbers are in. You've got KC 7 · BUF 7", "🎉 KC 7 – BUF 7 at Q1. Your square hits! 🏆"]);
  });

  it("talks results, not the draw, once the numbers are in", () => {
    const squares = [{ row: 2, col: 7, playerId: ME, claimedAt: 1 }];
    const c = askCopy("joined", board({ hostPlayerId: MAYA, status: "locked", numbers: { "*": DRAW } }, squares), ME);
    expect(c.title).toBe("Get pinged when your square hits");
    expect(c.scope[0]).toBe("Who wins Q1, Half, Q3 & Final");
  });

  it("still reads well with no board (general Home ask)", () => {
    const c = askCopy("home", null, ME);
    expect(c.boardName).toBe("JaxSquares");
    expect(c.title).toBe("Get pinged when your square hits");
  });
});
