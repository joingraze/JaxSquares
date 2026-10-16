import { describe, expect, it } from "vitest";
import type { GameSummary } from "../../../../shared/types";
import { nextPing, pingBoards, upcomingResult, wouldMiss } from "./pings";

function summary(over: Partial<GameSummary> = {}): GameSummary {
  return {
    id: "g1",
    name: "Sunday Night Squares",
    sport: "football",
    teamX: { name: "Chiefs", abbr: "KC" },
    teamY: { name: "Bills", abbr: "BUF" },
    status: "open",
    format: { periods: "quarters", reverse: false, boardSize: 100, freshNumbers: false },
    isHost: false,
    mySquares: 0,
    claimed: 40,
    totalSquares: 100,
    playerCount: 5,
    live: null,
    startsAt: null,
    myWins: [],
    lastActivityAt: 10,
    createdAt: 1,
    latestScore: null,
    leaderPlayerId: null,
    ...over,
  };
}

const live = (period: number) => ({ state: "in" as const, period, clock: "4:12", detail: `Q${period} 4:12`, scoreX: 14, scoreY: 10, updatedAt: 1 });

describe("pingBoards", () => {
  it("keeps a stable order: live first, then by kickoff, and sets finished boards apart", () => {
    const games = [
      summary({ id: "open-early", status: "open", createdAt: 1 }),
      summary({ id: "done", status: "final" }),
      summary({ id: "locked-late", status: "locked", startsAt: 900 }),
      summary({ id: "live", status: "locked", live: live(3), startsAt: 1000 }),
      summary({ id: "draft", status: "draft" }),
      summary({ id: "locked-soon", status: "locked", startsAt: 500 }),
    ];
    const { active, ended } = pingBoards(games);
    expect(active.map((g) => g.id)).toEqual(["live", "locked-soon", "locked-late", "open-early"]);
    expect(ended.map((g) => g.id)).toEqual(["done"]);
    // Same input in another order: same output.
    expect(pingBoards([...games].reverse()).active.map((g) => g.id)).toEqual(active.map((g) => g.id));
  });
});

describe("nextPing", () => {
  it("says what's next while picking", () => {
    expect(nextPing(summary())).toBe("Next: numbers drawn");
    expect(nextPing(summary({ mySquares: 3 }))).toBe("Next: numbers drawn · you have 3 squares");
    expect(nextPing(summary({ isHost: true }))).toBe("Next: friends joining · 60 squares left");
    expect(nextPing(summary({ isHost: true, claimed: 100 }))).toBe("Next: time to draw the numbers");
  });

  it("names the next result once the numbers are in", () => {
    expect(nextPing(summary({ status: "locked", mySquares: 17 }))).toBe("Next: Q1 result · you have 17 squares");
    expect(nextPing(summary({ status: "locked", latestScore: { scoreX: 7, scoreY: 3, label: "Q1" } }))).toBe("Next: Half result");
    expect(nextPing(summary({ status: "locked", live: live(3), mySquares: 1 }))).toBe("Live · next: Q3 result · you have 1 square");
    expect(nextPing(summary({ status: "locked", startsAt: 5_000 }), 1_000)).toBe("Next: kickoff");
    expect(nextPing(summary({ status: "final" }))).toBe("Ended · no more pings");
  });

  it("follows the board's format", () => {
    expect(upcomingResult({ format: { periods: "halves", reverse: false, boardSize: 100, freshNumbers: false }, live: live(1), latestScore: null })).toBe("Half");
    expect(upcomingResult({ format: { periods: "every-score", reverse: false, boardSize: 100, freshNumbers: false }, live: null, latestScore: null })).toBe(
      "the next score",
    );
  });
});

describe("wouldMiss", () => {
  it("names the soonest ping you'd miss", () => {
    expect(wouldMiss([summary({ name: "Sunday Night" })])).toBe("numbers drawn on Sunday Night");
    expect(wouldMiss([summary({ status: "final" })])).toBeNull();
  });
});
