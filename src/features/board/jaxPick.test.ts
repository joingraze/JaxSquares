import { describe, expect, it } from "vitest";
import { cellKey } from "../../../shared/squares";
import type { Square } from "../../../shared/types";
import { jaxPick, jaxPickBlocked, type JaxPickInput } from "./jaxPick";

const ME = "me-public-id";
const sq = (row: number, col: number, playerId = "someone"): Square => ({ row, col, playerId, claimedAt: 1 });

function input(over: Partial<JaxPickInput> = {}): JaxPickInput {
  return { status: "open", boardSize: 100, maxPerPlayer: 0, squares: [], me: ME, ...over };
}

/** Every square on a 10x10 except the listed open ones. */
function allBut(open: [number, number][], playerId = "someone"): Square[] {
  const free = new Set(open.map(([r, c]) => cellKey(r, c)));
  const out: Square[] = [];
  for (let r = 0; r < 10; r++) for (let c = 0; c < 10; c++) if (!free.has(cellKey(r, c))) out.push(sq(r, c, playerId));
  return out;
}

describe("jaxPick", () => {
  it("picks an open square on an empty board, spread by the rng", () => {
    expect(jaxPick(input(), () => 0)).toEqual({ row: 0, col: 0 });
    expect(jaxPick(input(), () => 0.999999)).toEqual({ row: 9, col: 9 });
    expect(jaxPick(input(), () => 0.5)).toEqual({ row: 5, col: 0 });
    expect(jaxPick(input({ boardSize: 25 }), () => 0.999999)).toEqual({ row: 4, col: 4 });
  });

  it("only ever picks open squares, never a taken one", () => {
    const squares = allBut([
      [2, 3],
      [7, 7],
      [9, 0],
    ]);
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const cell = jaxPick(input({ squares }));
      expect(cell).not.toBeNull();
      seen.add(cellKey(cell!.row, cell!.col));
    }
    expect([...seen].sort()).toEqual(["2,3", "7,7", "9,0"]);
    // Deterministic ends of the range land on the first and last open square.
    expect(jaxPick(input({ squares }), () => 0)).toEqual({ row: 2, col: 3 });
    expect(jaxPick(input({ squares }), () => 0.99)).toEqual({ row: 9, col: 0 });
  });

  it("skips excluded squares (a lost race, or my pending picks)", () => {
    const squares = allBut([
      [1, 1],
      [4, 4],
    ]);
    expect(jaxPick(input({ squares, exclude: new Set(["1,1"]) }), () => 0)).toEqual({ row: 4, col: 4 });
    expect(jaxPick(input({ squares, exclude: new Set(["1,1", "4,4"]) }))).toBeNull();
  });

  it("returns null on a full board", () => {
    const squares = allBut([]);
    expect(squares).toHaveLength(100);
    expect(jaxPick(input({ squares }))).toBeNull();
    expect(jaxPickBlocked(input({ squares }))).toBe("full");
  });

  it("honors the per-player max", () => {
    const mine = [sq(0, 0, ME), sq(0, 1, ME)];
    expect(jaxPick(input({ squares: mine, maxPerPlayer: 2 }))).toBeNull();
    expect(jaxPickBlocked(input({ squares: mine, maxPerPlayer: 2 }))).toBe("max");
    // Other people's squares don't count toward my max.
    const theirs = [sq(0, 0, "a"), sq(0, 1, "b"), sq(0, 2, ME)];
    expect(jaxPick(input({ squares: theirs, maxPerPlayer: 2 }), () => 0)).toEqual({ row: 0, col: 3 });
    expect(jaxPickBlocked(input({ squares: theirs, maxPerPlayer: 2 }))).toBeNull();
    // 0 means no limit.
    expect(jaxPick(input({ squares: mine, maxPerPlayer: 0 }), () => 0)).toEqual({ row: 0, col: 2 });
  });

  it("only picks while squares are open", () => {
    for (const status of ["draft", "locked", "final"] as const) {
      expect(jaxPick(input({ status }))).toBeNull();
      expect(jaxPickBlocked(input({ status }))).toBe("closed");
    }
  });

  it("clamps an rng that returns 1", () => {
    expect(jaxPick(input(), () => 1)).toEqual({ row: 9, col: 9 });
  });

  it("uses the platform CSPRNG by default", () => {
    const cell = jaxPick(input());
    expect(cell).not.toBeNull();
    expect(cell!.row).toBeGreaterThanOrEqual(0);
    expect(cell!.row).toBeLessThan(10);
  });
});
