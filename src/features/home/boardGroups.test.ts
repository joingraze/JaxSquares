// Home holds a player's boards from one game together (GameSummary.group),
// each section keeping its own order otherwise.

import { describe, expect, it } from "vitest";
import type { GameSummary } from "../../../shared/types";
import { clusterGroups, groupCardDetail, groupCardTitle, groupLabel, groupRuns } from "./boardGroups";
import { groupBoards } from "./sections";

const NOW = Date.UTC(2026, 9, 19, 12);

function summary(id: string, over: Partial<GameSummary> = {}): GameSummary {
  return {
    id,
    name: id,
    sport: "football",
    teamX: { name: "Kansas City Chiefs", abbr: "KC" },
    teamY: { name: "Buffalo Bills", abbr: "BUF" },
    status: "open",
    format: { periods: "quarters", reverse: false, boardSize: 100, freshNumbers: false },
    isHost: true,
    joined: true,
    host: null,
    mySquares: 0,
    claimed: 10,
    totalSquares: 100,
    playerCount: 2,
    live: null,
    startsAt: NOW + 86_400_000,
    myWins: [],
    lastActivityAt: NOW,
    createdAt: NOW,
    group: null,
    ...over,
  };
}

describe("clusterGroups", () => {
  it("moves a game's boards up next to its first board; boards on their own stay put", () => {
    const list = [summary("a", { group: "g1" }), summary("x"), summary("b", { group: "g2" }), summary("c", { group: "g1" }), summary("y"), summary("d", { group: "g2" })];
    expect(clusterGroups(list).map((g) => g.id)).toEqual(["a", "c", "x", "b", "d", "y"]);
    expect(clusterGroups([summary("x"), summary("y")]).map((g) => g.id)).toEqual(["x", "y"]);
  });

  it("makes runs to render: a group's boards together, one board alone", () => {
    const runs = groupRuns(clusterGroups([summary("a", { group: "g1" }), summary("x"), summary("c", { group: "g1" })]));
    expect(runs.map((r) => r.boards.map((g) => g.id))).toEqual([["a", "c"], ["x"]]);
    expect(new Set(runs.map((r) => r.key)).size).toBe(2);
  });

  it("labels a group by its game, how many boards and when they kick off", () => {
    expect(groupLabel([summary("a"), summary("b"), summary("c")])).toBe("Chiefs vs Bills · 3 boards");
    expect(groupLabel([summary("a"), summary("b")], "Sun 1:00 PM")).toBe("Chiefs vs Bills · 2 boards · Sun 1:00 PM");
    expect(groupLabel([summary("a", { teamX: { name: "Tigers" }, teamY: { name: "Lions" } }), summary("b")])).toBe("Tigers vs Lions · 2 boards");
  });

  it("shortens a numbered board's title inside its group, and says its square price", () => {
    const names = ["Office Squares", "Office Squares · Board 2", "Office Squares · Board 3"];
    expect(names.map((n) => groupCardTitle(n, names))).toEqual(["Office Squares", "Board 2", "Board 3"]);
    // The first board was deleted: the numbered ones still share their base.
    expect(groupCardTitle("Office Squares · Board 3", ["Office Squares · Board 2", "Office Squares · Board 3"])).toBe("Board 3");
    // A board the host renamed keeps its name.
    expect(groupCardTitle("Family board · Board 2", ["Office Squares", "Family board · Board 2"])).toBe("Family board · Board 2");
    expect(groupCardDetail({ periods: "quarters", reverse: false, boardSize: 100, freshNumbers: false, unit: "$", squarePrice: 5 })).toBe("$5 a square");
    expect(groupCardDetail({ periods: "quarters", reverse: false, boardSize: 100, freshNumbers: false, justForFun: true })).toBe("Just for fun");
    expect(groupCardDetail({ periods: "quarters", reverse: false, boardSize: 100, freshNumbers: false })).toBeNull();
  });
});

describe("groupBoards keeps a game's boards together in each section", () => {
  it("holds the $1, $5 and $20 boards side by side under Needs you", () => {
    const later = NOW + 5 * 86_400_000;
    const boards = [
      summary("one", { group: "one", startsAt: later, createdAt: NOW - 3 }),
      summary("solo", { startsAt: NOW + 2 * 86_400_000 }),
      // The $5 board is full: its draw is the most urgent thing on the page.
      summary("five", { group: "one", startsAt: later, claimed: 100, createdAt: NOW - 2 }),
      summary("twenty", { group: "one", startsAt: later, createdAt: NOW - 1 }),
    ];
    // By urgency then kickoff alone it would be five, solo, one, twenty. The group goes
    // where its most urgent board is, its boards in the order they were made.
    const { needs } = groupBoards(boards);
    expect(needs.map((g) => g.id)).toEqual(["one", "five", "twenty", "solo"]);
  });
});
