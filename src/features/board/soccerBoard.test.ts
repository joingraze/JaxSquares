// A goal-minute soccer board's live copy (shared/soccer.ts): "right now" is
// the square a goal now would land on (the match clock's minute), the last
// goal's or 00 when the clock isn't running, my next minute, the feed's
// goals with their minutes, and the recap's and TV's minutes.
import { describe, expect, it } from "vitest";
import { rulesForPreset, withRules } from "../../../shared/formats";
import { resolveResults } from "../../../shared/squares";
import type { Activity, GameState, LiveStatus, NumberDraw, Player, Score, Square } from "../../../shared/types";
import { describeActivity } from "../notifications/activity";
import { recapCard } from "../recap/recapModel";
import { tvWinners } from "../tv/tvModel";
import { fallbackActivityText, goalNowSentence, rightNow } from "./boardModel";

const ME = "me_public_id";
const MAYA = "maya_public_id";
// Column i holds digit i (the minute's ones), row i holds 9 - i (its tens): minute 43 is row 5, column 3.
const DIGITS: NumberDraw = {
  x: [[0], [1], [2], [3], [4], [5], [6], [7], [8], [9]],
  y: [[9], [8], [7], [6], [5], [4], [3], [2], [1], [0]],
};
const player = (id: string, name: string): Player => ({ id, name, color: "#ff6b35", emoji: "", joinedAt: 1, isHost: false });
const sq = (row: number, col: number, playerId: string): Square => ({ row, col, playerId, claimedAt: 1 });
const goal = (n: number, minute: number, added: number, scoreX: number, scoreY: number): Score => ({
  periodKey: `s${n}`,
  label: `Goal ${n}`,
  scoreX,
  scoreY,
  minute,
  added,
  source: "live",
  updatedAt: 1,
});
const live = (clock: string, scoreX = 0, scoreY = 0, detail = clock): LiveStatus => ({ state: "in", period: 1, clock, detail, scoreX, scoreY, updatedAt: 1 });

function soccer(over: Omit<Partial<GameState>, "game"> & { game?: Partial<GameState["game"]> } = {}): GameState {
  const { game, ...rest } = over;
  return {
    game: {
      id: "g1",
      name: "Derby Squares",
      sport: "soccer",
      league: "epl",
      teamX: { name: "Arsenal", abbr: "ARS", color: "#ef0107" },
      teamY: { name: "Chelsea", abbr: "CHE", color: "#034694" },
      format: withRules({
        periods: "custom",
        reverse: false,
        boardSize: 100,
        freshNumbers: false,
        rules: [...rulesForPreset("first-last", false), ...rulesForPreset("every-score", false)],
      }),
      periods: [],
      prizes: {},
      maxPerPlayer: 0,
      numbers: { "*": DIGITS },
      status: "locked",
      linkedEvent: { provider: "espn", league: "epl", eventId: "1", startsAt: 0, xIsHome: true },
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

describe("right now on a soccer board", () => {
  it("is the square a goal now lands on, for the first goal while it's to come", () => {
    const now = rightNow(soccer({ squares: [sq(5, 3, MAYA)], live: live("43'") }), ME)!;
    expect(now).toMatchObject({ live: true, periodKey: "first", cell: { row: 5, col: 3 }, ownerId: MAYA, goal: { minute: 43, text: "43'", basis: "now" } });
    expect(goalNowSentence(now)).toBe("Wins the first goal if it comes now");
  });

  it("plays for the next goal once the first is in, and counts 1st-half stoppage time as the 45th minute", () => {
    const state = soccer({ squares: [sq(5, 5, ME)], scores: [goal(1, 12, 0, 1, 0)], live: live("45'+2'", 1, 0) });
    const now = rightNow(state, ME)!;
    expect(now).toMatchObject({ periodKey: null, label: "Next goal", cell: { row: 5, col: 5 }, mine: true, goal: { minute: 45, text: "45+2'" } });
    expect(goalNowSentence(now)).toBe("Yours the next goal if it comes now");
  });

  it("finds my next minute on the clock", () => {
    // I hold the 47th minute (row 5, col 7) and it's the 43rd.
    const now = rightNow(soccer({ squares: [sq(5, 7, ME)], live: live("43'") }), ME)!;
    expect(now.goal?.next).toEqual({ minute: 47, text: "47'", inMinutes: 4 });
  });

  it("shows nothing live at halftime, then square 00 before any goal", () => {
    const now = rightNow(soccer({ squares: [sq(9, 0, ME)], live: live("45'+4'", 0, 0, "HT") }), ME)!;
    expect(now).toMatchObject({ live: false, cell: { row: 9, col: 0 }, mine: true, goal: { minute: 0, text: "00", basis: "none" } });
    expect(goalNowSentence(now)).toBe("Yours if there are no goals");
  });

  it("is the last goal's square on a host-run board between goals", () => {
    const state = soccer({ game: { linkedEvent: null }, squares: [sq(0, 3, MAYA)], scores: [goal(1, 90, 3, 1, 0)] });
    const now = rightNow(state, ME)!;
    expect(now).toMatchObject({ live: false, cell: { row: 0, col: 3 }, goal: { minute: 93, text: "90+3'", basis: "last" } });
    expect(goalNowSentence(now)).toBe("Wins the last goal if no more goals come");
  });
});

describe("goals in the feed", () => {
  it("says a goal's minute", () => {
    const a: Activity = { id: "a1", type: "score", at: 1, actor: null, data: { periodKey: "s2", label: "Goal 2", scoreX: 1, scoreY: 1, minute: 45, added: 2, source: "live" } };
    const state = soccer({ activity: [a] });
    expect(fallbackActivityText(a, state, ME)).toBe("Goal 2 · 45+2': ARS 1 – CHE 1");
    expect(describeActivity(a, state, ME)?.text).toBe("Goal! ARS 1–1 CHE · 45+2'");
    const final: Activity = { id: "a2", type: "score", at: 2, actor: null, data: { periodKey: "final", label: "Last goal", scoreX: 1, scoreY: 1, source: "live" } };
    expect(describeActivity(final, soccer({ activity: [final] }), ME)?.text).toBe("Full time: ARS 1–1 CHE");
  });
});

describe("results shown elsewhere", () => {
  const state = soccer({
    squares: [sq(8, 2, MAYA), sq(0, 4, ME)],
    scores: [goal(1, 12, 0, 1, 0), goal(2, 90, 4, 1, 1), { periodKey: "final", scoreX: 1, scoreY: 1, source: "live", updatedAt: 2 }],
    game: { status: "final" },
  });

  it("puts the minutes on the recap card", () => {
    const card = recapCard(state)!;
    expect(card.rows.map((r) => [r.label, r.minute, r.winner?.name ?? null])).toEqual([
      ["1st goal", "12'", "Maya"],
      ["Goal 1", "12'", "Maya"],
      ["Goal 2", "90+4'", "Jordan"],
      ["Last goal", "90+4'", "Jordan"],
    ]);
  });

  it("puts the minutes on the TV's winners", () => {
    const winners = tvWinners(state, resolveResults(state));
    expect(winners.map((w) => [w.label, w.score])).toEqual([
      ["1st goal", "12'"],
      ["Goal 1", "12'"],
      ["Goal 2", "90+4'"],
      ["Last goal", "90+4'"],
    ]);
  });
});
