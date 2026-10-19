// A basketball board's live copy: "how close am I" in baskets and threes, a
// game of halves playing for halftime then the final, tip-off and the final
// buzzer in the feed, the home cards and the alerts.
import { describe, expect, it } from "vitest";
import { rulesForPreset, withRules } from "../../../shared/formats";
import type { Activity, GameState, GameSummary, NumberDraw, Player, Square } from "../../../shared/types";
import { describeActivity } from "../notifications/activity";
import { boardAlert } from "../notifications/alerts";
import { kickoffText } from "../home/sections";
import { nextPing } from "../notifications/profile/pings";
import { fallbackActivityText, nearestPath, nowSentence, playBookFor, playName, rightNow } from "./boardModel";

const ME = "me_public_id";
const MAYA = "maya_public_id";
const DIGITS: NumberDraw = {
  x: [[0], [1], [2], [3], [4], [5], [6], [7], [8], [9]],
  y: [[9], [8], [7], [6], [5], [4], [3], [2], [1], [0]],
};
const player = (id: string, name: string): Player => ({ id, name, color: "#ff6b35", emoji: "", joinedAt: 1, isHost: false });
const sq = (row: number, col: number, playerId: string): Square => ({ row, col, playerId, claimedAt: 1 });

function hoops(over: Omit<Partial<GameState>, "game"> & { game?: Partial<GameState["game"]> } = {}): GameState {
  const { game, ...rest } = over;
  return {
    game: {
      id: "g1",
      name: "March Squares",
      sport: "basketball",
      league: "nba",
      teamX: { name: "Boston Celtics", abbr: "BOS", color: "#008348" },
      teamY: { name: "Los Angeles Lakers", abbr: "LAL", color: "#552583" },
      format: withRules({ periods: "quarters", reverse: false, boardSize: 100, freshNumbers: false }),
      periods: [
        { key: "q1", label: "Q1" },
        { key: "q2", label: "Half" },
        { key: "q3", label: "Q3" },
        { key: "final", label: "Final" },
      ],
      prizes: {},
      maxPerPlayer: 0,
      numbers: { "*": DIGITS },
      status: "locked",
      linkedEvent: { provider: "espn", league: "nba", eventId: "1", startsAt: 0, xIsHome: false },
      hostPlayerId: MAYA,
      createdAt: 1,
      lockedAt: null,
      ...game,
    },
    players: [player(ME, "Jordan"), player(MAYA, "Maya")],
    squares: [],
    scores: [],
    manualWinners: [],
    live: null,
    activity: [],
    version: 1,
    ...rest,
  };
}

const activity = (type: Activity["type"], data: Record<string, unknown> = {}): Activity => ({ id: `a-${type}`, type, at: 1, actor: null, data });

describe("how close am I, in basketball", () => {
  it("names baskets, threes and free throws", () => {
    const kind = { sport: "basketball" as const };
    expect([2, 3, 1].map((p) => playName(p, kind))).toEqual(["basket", "three", "free throw"]);
    expect(playName(7)).toBe("touchdown");
    expect(playBookFor(kind).plays).toEqual([2, 3, 1]);
  });

  it("finds my square a basket or a three away, and the next score's squares in baskets and threes", () => {
    // 104-98 sits on col 4 / row 1. A Celtics three: 107-98 -> col 7, row 1.
    const book = playBookFor({ sport: "basketball" });
    expect(nearestPath({ scoreX: 104, scoreY: 98 }, DIGITS, new Set(["1,7"]), 2, 0, false, book)?.plays).toEqual([{ team: "x", points: 3 }]);
    const live = { state: "in" as const, period: 3, clock: "5:32", detail: "5:32 - 3rd", scoreX: 104, scoreY: 98, updatedAt: 1 };
    const now = rightNow(hoops({ live, squares: [sq(1, 6, ME), sq(1, 4, MAYA)] }), ME)!;
    expect(now).toMatchObject({ sport: "basketball", label: "Q3", ownerId: MAYA });
    // A Celtics basket: 106-98 -> col 6, row 1 (mine).
    expect(now.path?.plays).toEqual([{ team: "x", points: 2 }]);
    expect(now.outcomes.map((o) => `${o.play.team}+${o.play.points}`)).toEqual(["x+2", "x+3", "y+2", "y+3"]);
  });

  it("plays for halftime in the 1st half of a game of halves, then for the final", () => {
    const halves = withRules({ periods: "halves", reverse: false, boardSize: 100, freshNumbers: false, rules: rulesForPreset("halves", false) });
    const game = { league: "ncaab" as const, format: halves, periods: [{ key: "q2", label: "Half" }, { key: "final", label: "Final" }] };
    const first = { state: "in" as const, period: 1, clock: "8:14", detail: "8:14 - 1st Half", scoreX: 30, scoreY: 24, updatedAt: 1 };
    expect(rightNow(hoops({ game, live: first }), ME)).toMatchObject({ periodKey: "q2", label: "Half" });
    const second = { ...first, period: 2, detail: "12:41 - 2nd Half", scoreX: 61, scoreY: 51 };
    const scores = [{ periodKey: "q2", scoreX: 41, scoreY: 33, source: "live" as const, updatedAt: 1 }];
    const now = rightNow(hoops({ game, live: second, scores }), ME)!;
    expect(now).toMatchObject({ periodKey: "final", label: "Final" });
    expect(nowSentence(now)).toMatch(/at the final buzzer$/);
  });
});

describe("basketball words on the board", () => {
  it("says tip-off and the final buzzer in the feed", () => {
    const state = hoops();
    expect(fallbackActivityText(activity("locked", { auto: true }), state, ME)).toBe("Tip-off! Numbers are locked in");
    expect(fallbackActivityText(activity("final"), state, ME)).toBe("That's the final buzzer");
    expect(describeActivity(activity("locked", { auto: true }), state, ME)?.text).toMatch(/^Tip-off! /);
    expect(boardAlert(activity("locked", { auto: true }), state, ME)?.title).toBe("Tip-off! Numbers are in");
    // Football's stay as they were.
    const football = hoops({ game: { sport: "football", league: "nfl" } });
    expect(fallbackActivityText(activity("final"), football, ME)).toBe("That's the final whistle");
  });

  it("says tip-off on the home cards and in what pings next", () => {
    const now = Date.parse("2026-03-20T18:00:00Z");
    expect(kickoffText(now + 3 * 3_600_000, now, false, "basketball")).toBe("Tip-off in 3h 0m");
    expect(kickoffText(now + 3 * 3_600_000, now, true, "basketball")).toBe("tips off in 3h 0m");
    expect(kickoffText(now - 1, now, false, "basketball")).toBe("Tipping off");
    expect(kickoffText(now + 3 * 3_600_000, now)).toBe("Kickoff in 3h 0m");
    const summary = { status: "locked", sport: "basketball", league: "ncaab", format: hoops().game.format, live: null, latestScore: null, startsAt: now + 3_600_000, mySquares: 3 } as unknown as GameSummary;
    expect(nextPing(summary, now)).toBe("Next: tip-off · you have 3 squares");
  });
});
