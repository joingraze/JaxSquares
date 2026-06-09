import { describe, expect, it } from "vitest";
import {
  GRID_SIZE,
  lastDigit,
  resolveResults,
  shuffledDigits,
  winningCell,
} from "./squares";
import type { Game, Square } from "./types";

describe("shuffledDigits", () => {
  it("returns a permutation of 0..9", () => {
    const d = shuffledDigits(() => 0.5);
    expect(d).toHaveLength(GRID_SIZE);
    expect([...d].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it("is deterministic given a seeded rng", () => {
    const seq = [0.1, 0.9, 0.3, 0.7, 0.2, 0.8, 0.4, 0.6, 0.5];
    let i = 0;
    const rng = () => seq[i++ % seq.length];
    let j = 0;
    const rng2 = () => seq[j++ % seq.length];
    expect(shuffledDigits(rng)).toEqual(shuffledDigits(rng2));
  });
});

describe("lastDigit", () => {
  it("returns the ones digit", () => {
    expect(lastDigit(24)).toBe(4);
    expect(lastDigit(30)).toBe(0);
    expect(lastDigit(7)).toBe(7);
    expect(lastDigit(0)).toBe(0);
  });
});

describe("winningCell", () => {
  const xNumbers = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  const yNumbers = [9, 8, 7, 6, 5, 4, 3, 2, 1, 0];

  it("maps a score to the grid coordinate of the matching digits", () => {
    // x score 24 -> digit 4 -> column index 4. y score 17 -> digit 7 -> row index 2.
    expect(winningCell({ scoreX: 24, scoreY: 17 }, xNumbers, yNumbers)).toEqual({
      row: 2,
      col: 4,
    });
  });

  it("handles 0 digits", () => {
    expect(winningCell({ scoreX: 20, scoreY: 30 }, xNumbers, yNumbers)).toEqual({
      row: 9,
      col: 0,
    });
  });
});

describe("resolveResults", () => {
  const game: Game = {
    id: "g1",
    name: "Test",
    sport: "football",
    teamX: "X",
    teamY: "Y",
    pricePerSquare: 5,
    maxPerPlayer: 0,
    periods: [{ key: "final", label: "Final" }],
    payouts: { final: 100 },
    xNumbers: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    yNumbers: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    status: "locked",
    createdAt: 0,
  };

  it("attributes the win to the owner of the winning square", () => {
    const winner: Square = {
      row: 1,
      col: 4,
      playerName: "Sam",
      playerColor: "#fff",
      clientId: "c1",
    };
    const results = resolveResults(game, [winner], [{ periodKey: "final", scoreX: 14, scoreY: 21 }]);
    expect(results[0].winner?.playerName).toBe("Sam");
    expect(results[0].payout).toBe(100);
  });

  it("reports no winner when the winning square is unclaimed", () => {
    const results = resolveResults(game, [], [{ periodKey: "final", scoreX: 14, scoreY: 21 }]);
    expect(results[0].winner).toBeUndefined();
    expect(results[0].cell).toEqual({ row: 1, col: 4 });
  });

  it("returns nothing for an unlocked game", () => {
    expect(resolveResults({ ...game, xNumbers: null, yNumbers: null }, [], [])).toEqual([]);
  });
});
