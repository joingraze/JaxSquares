import { describe, expect, it } from "vitest";
import { cellKey } from "../../../shared/squares";
import type { Square } from "../../../shared/types";
import { jaxPick, jaxPickBlocked, jaxPickLimit, jaxPickMany, jaxQuickCounts, type JaxPickInput } from "./jaxPick";

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

describe("jaxPickMany", () => {
  it("picks as many different open squares as asked", () => {
    let seed = 7;
    const rng = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    const squares = [sq(0, 0), sq(0, 1), sq(5, 5, ME)];
    const picked = jaxPickMany(input({ squares }), 10, rng);
    expect(picked).toHaveLength(10);
    const keys = picked.map((c) => cellKey(c.row, c.col));
    expect(new Set(keys).size).toBe(10);
    for (const k of ["0,0", "0,1", "5,5"]) expect(keys).not.toContain(k);
  });

  it("never picks more than the open squares or my per-player max allow", () => {
    const fewLeft = allBut([[2, 2], [7, 3]]);
    expect(jaxPickLimit(input({ squares: fewLeft }))).toBe(2);
    expect(jaxPickMany(input({ squares: fewLeft }), 5).map((c) => cellKey(c.row, c.col)).sort()).toEqual(["2,2", "7,3"]);

    const mine = [sq(0, 0, ME), sq(0, 1, ME)];
    expect(jaxPickLimit(input({ squares: mine, maxPerPlayer: 5 }))).toBe(3);
    expect(jaxPickMany(input({ squares: mine, maxPerPlayer: 5 }), 10)).toHaveLength(3);
    expect(jaxPickLimit(input({ maxPerPlayer: 0 }))).toBe(100);
  });

  it("skips excluded squares and counts them out of the limit", () => {
    const exclude = new Set(["0,0", "0,1"]);
    expect(jaxPickLimit(input({ boardSize: 25, exclude }))).toBe(23);
    const picked = jaxPickMany(input({ boardSize: 25, exclude }), 23);
    expect(picked.map((c) => cellKey(c.row, c.col))).not.toContain("0,0");
    expect(new Set(picked.map((c) => cellKey(c.row, c.col))).size).toBe(23);
  });

  it("picks nothing when blocked or asked for none", () => {
    expect(jaxPickMany(input({ status: "locked" }), 3)).toEqual([]);
    expect(jaxPickLimit(input({ status: "locked" }))).toBe(0);
    expect(jaxPickMany(input(), 0)).toEqual([]);
    expect(jaxPickMany(input({ squares: allBut([]) }), 3)).toEqual([]);
  });

  it("keeps the rng in range even if it returns 1", () => {
    const picked = jaxPickMany(input({ boardSize: 25 }), 25, () => 1);
    expect(new Set(picked.map((c) => cellKey(c.row, c.col))).size).toBe(25);
  });
});

describe("jaxQuickCounts", () => {
  it("offers the counts that fit, plus Max when my per-player max is the cap", () => {
    expect(jaxQuickCounts(100, false).map((c) => c.label)).toEqual(["1", "2", "3", "5", "10"]);
    expect(jaxQuickCounts(4, false).map((c) => c.label)).toEqual(["1", "2", "3"]);
    expect(jaxQuickCounts(4, true).map((c) => c.label)).toEqual(["1", "2", "3", "Max 4"]);
    expect(jaxQuickCounts(5, true).map((c) => c.label)).toEqual(["1", "2", "3", "5"]);
  });
});
