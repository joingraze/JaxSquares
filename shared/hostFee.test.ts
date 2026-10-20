import { describe, expect, it } from "vitest";
import { FREE_PLAYER_LIMIT, isFreeDraw, isFreeHolderCount, squareHolders } from "./hostFee";

const sq = (playerId: string, row = 0, col = 0) => ({ row, col, playerId, claimedAt: 0 });
/** One square each for players p0..p(n-1), plus extra squares for p0. */
const held = (players: number, extra = 0) => [
  ...Array.from({ length: players }, (_, i) => sq(`p${i}`, i, 0)),
  ...Array.from({ length: extra }, (_, i) => sq("p0", i, 1)),
];

describe("the free tier", () => {
  it("is 5 players", () => {
    expect(FREE_PLAYER_LIMIT).toBe(5);
  });

  it("counts distinct players holding at least one square, however many each holds", () => {
    expect(squareHolders([])).toBe(0);
    expect(squareHolders(held(1, 40))).toBe(1);
    expect(squareHolders(held(3))).toBe(3);
    expect(squareHolders([sq("a", 0, 0), sq("b", 0, 1), sq("a", 1, 1), sq("b", 2, 2)])).toBe(2);
  });

  it("draws for free with up to 5 holders, not 6", () => {
    for (const n of [0, 1, 4, 5]) expect(isFreeHolderCount(n)).toBe(true);
    for (const n of [6, 7, 100]) expect(isFreeHolderCount(n)).toBe(false);
    expect(isFreeDraw({ squares: held(5, 95) })).toBe(true);
    expect(isFreeDraw({ squares: held(6) })).toBe(false);
  });

  it("only counts squares: players who joined without picking don't make a board paid", () => {
    // isFreeDraw reads squares alone; the players list never enters into it.
    const state = { squares: held(5), players: Array.from({ length: 12 }, (_, i) => ({ id: `p${i}` })) };
    expect(isFreeDraw(state)).toBe(true);
  });
});
