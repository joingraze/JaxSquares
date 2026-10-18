import { describe, expect, it, vi } from "vitest";
import type { GameSummary } from "../../../../shared/types";
import { boardsToSync, colorName, lookChanged, statsOf, syncLook, tagline } from "./profileSync";

function summary(id: string, over: Partial<GameSummary> = {}): GameSummary {
  return {
    id,
    name: id,
    sport: "football",
    teamX: { name: "Chiefs" },
    teamY: { name: "Bills" },
    status: "open",
    format: { periods: "quarters", reverse: false, boardSize: 100, freshNumbers: false },
    isHost: false,
    joined: true,
    host: null,
    mySquares: 0,
    claimed: 0,
    totalSquares: 100,
    playerCount: 2,
    live: null,
    startsAt: null,
    myWins: [],
    lastActivityAt: 1,
    createdAt: 1,
    ...over,
  };
}

const me = { name: "Jordan", color: "#ff6b35", emoji: "🏈" };

describe("profile sync", () => {
  it("only touches boards still in play", () => {
    const games = [summary("a"), summary("b", { status: "locked" }), summary("c", { status: "final" }), summary("d", { status: "draft" })];
    expect(boardsToSync(games)).toEqual(["a", "b"]);
  });

  it("never re-sends my look to a board I only opened (that would join me)", () => {
    const games = [summary("mine"), summary("opened", { joined: false }), summary("hosted", { joined: false, isHost: true })];
    expect(boardsToSync(games)).toEqual(["mine", "hosted"]);
  });

  it("notices real changes only", () => {
    expect(lookChanged(me, { ...me })).toBe(false);
    expect(lookChanged(me, { ...me, name: " Jordan " })).toBe(false);
    expect(lookChanged(me, { ...me, color: "#FF6B35" })).toBe(false);
    expect(lookChanged(me, { ...me, emoji: "🔥" })).toBe(true);
    expect(lookChanged(me, { ...me, name: "Jo" })).toBe(true);
  });

  it("joins each board with the new look and counts failures", async () => {
    const join = vi.fn((id: string) => (id === "bad" ? Promise.reject(new Error("nope")) : Promise.resolve({})));
    const res = await syncLook(["a", "bad", "c"], { ...me, name: "  Jordan " }, join);
    expect(res).toEqual({ updated: 2, failed: 1 });
    expect(join).toHaveBeenCalledWith("a", { name: "Jordan", color: "#ff6b35", emoji: "🏈" });
  });

  it("does nothing without a name", async () => {
    const join = vi.fn(() => Promise.resolve({}));
    expect(await syncLook(["a"], { ...me, name: " " }, join)).toEqual({ updated: 0, failed: 0 });
    expect(join).not.toHaveBeenCalled();
  });
});

describe("profile hero", () => {
  it("names palette colors", () => {
    expect(colorName("#FF6B35")).toBe("Blaze");
    expect(colorName("#123456")).toBeNull();
  });

  it("adds up stats across boards", () => {
    const games = [
      summary("a", { mySquares: 4, myWins: [{ periodKey: "q1", label: "Q1" }] }),
      summary("b", { mySquares: 6, status: "final", myWins: [{ periodKey: "q2", label: "Half" }, { periodKey: "final", label: "Final" }] }),
    ];
    expect(statsOf(games)).toEqual({ boards: 2, squares: 10, wins: 3, live: 0, drawn: 0 });
    expect(statsOf([])).toEqual({ boards: 0, squares: 0, wins: 0, live: 0, drawn: 0 });
    const live = { state: "in" as const, period: 2, clock: "4:12", detail: "Q2 4:12", scoreX: 7, scoreY: 3, updatedAt: 1 };
    const playing = [summary("c", { status: "locked", mySquares: 3, live }), summary("d", { status: "locked", mySquares: 0, live })];
    expect(statsOf(playing)).toMatchObject({ live: 1, drawn: 1 });
  });

  it("picks a tagline that fits", () => {
    const base = { boards: 2, squares: 8, wins: 0, live: 0, drawn: 0 };
    expect(tagline(null, false)).toMatch(/Pick a name/);
    expect(tagline({ ...base, boards: 0, squares: 0 }, true)).toMatch(/grab some squares/);
    expect(tagline(base, true)).toMatch(/Squares are set/);
    expect(tagline({ ...base, drawn: 1 }, true)).toMatch(/Numbers are in/);
    expect(tagline({ ...base, wins: 1 }, true)).toMatch(/scoreboard/);
    expect(tagline({ ...base, wins: 4 }, true)).toMatch(/closer/);
    expect(tagline({ ...base, wins: 4, live: 1 }, true)).toMatch(/Game's on/);
  });
});
