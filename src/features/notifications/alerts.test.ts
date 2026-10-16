import { describe, expect, it } from "vitest";
import type { Activity, ActivityType, GameState, NumberDraw, Player, Square } from "../../../shared/types";
import { boardAlert } from "./alerts";

const ME = "me_public_id_000000000";
const MAYA = "maya_public_id_0000000";
const SAM = "sam_public_id_00000000";

const digits = (order: number[]): number[][] => order.map((d) => [d]);
/** Column c = X digit c; row r = Y digit 9 - r. */
const DRAW: NumberDraw = { x: digits([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]), y: digits([9, 8, 7, 6, 5, 4, 3, 2, 1, 0]) };

function player(id: string, name: string): Player {
  return { id, name, color: "#ff6b35", emoji: "🦊", joinedAt: 1, isHost: id === MAYA };
}

function makeState(over: Omit<Partial<GameState>, "game"> & { game?: Partial<GameState["game"]> } = {}): GameState {
  const { game, ...rest } = over;
  return {
    game: {
      id: "g1",
      name: "Sunday Squares",
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
      hostPlayerId: MAYA,
      createdAt: 1,
      lockedAt: null,
      ...game,
    },
    players: [player(ME, "Jordan"), player(MAYA, "Maya"), player(SAM, "Sam")],
    squares: [],
    scores: [],
    manualWinners: [],
    live: null,
    activity: [],
    version: 1,
    ...rest,
  };
}

let seq = 0;
function act(type: ActivityType, actor: string | null, data: Record<string, unknown> = {}, at = 1_000_000): Activity {
  return { id: `a${++seq}`, type, actor, at, data };
}

function withActivity(state: GameState, ...list: Activity[]): GameState {
  return { ...state, activity: [...list].sort((a, b) => b.at - a.at) };
}

// Q1 7-3 -> (6,7), Half 14-10 -> (9,4), Q3 17-13 -> (6,7), Final 24-20 -> (9,4).
function finished(owners: Record<string, string>): GameState {
  const squares: Square[] = Object.entries(owners).map(([key, playerId]) => {
    const [row, col] = key.split(",").map(Number);
    return { row, col, playerId, claimedAt: 1 };
  });
  return makeState({
    game: { status: "final", numbers: { "*": DRAW } },
    squares,
    scores: [
      { periodKey: "q1", scoreX: 7, scoreY: 3, source: "host", updatedAt: 1 },
      { periodKey: "q2", scoreX: 14, scoreY: 10, source: "host", updatedAt: 1 },
      { periodKey: "q3", scoreX: 17, scoreY: 13, source: "host", updatedAt: 1 },
      { periodKey: "final", scoreX: 24, scoreY: 20, source: "host", updatedAt: 1 },
    ],
  });
}

/** The three activities a typed-in Final score writes, all at once. */
function finalMoment(winner: string, host = SAM) {
  const at = 5_000_000;
  const score = act("score", host, { periodKey: "final", label: "Final", scoreX: 24, scoreY: 20, source: "host" }, at);
  const win = act("winner", host, { periodKey: "final", label: "Final", playerIds: [winner], cell: { row: 9, col: 4 }, prize: "Loser does the dishes" }, at);
  const whistle = act("final", host, {}, at);
  return { score, win, whistle };
}

describe("boardAlert: the final whistle is one moment", () => {
  it("folds the Final's winner, the score and my wins into one summary card", () => {
    const { score, win, whistle } = finalMoment(MAYA);
    const s = withActivity(finished({ "6,7": ME, "9,4": MAYA }), score, win, whistle);
    expect(boardAlert(score, s, ME)).toBeNull();
    expect(boardAlert(win, s, ME)).toBeNull();
    expect(boardAlert(whistle, s, ME)).toMatchObject({
      key: "moment:final",
      kind: "final",
      title: "Maya wins at the final whistle 🏁",
      detail: "You won Q1 & Q3",
      // About Maya, so it wears Maya's sticker (not the host's who typed it).
      subject: { kind: "player", id: MAYA },
      chip: { kind: "score", scoreX: 24, scoreY: 20, label: "Final" },
      cell: { row: 9, col: 4 },
      tone: "win",
      banner: false,
    });
  });

  it("lets the gold banner speak when the Final is mine", () => {
    const { win, whistle } = finalMoment(ME);
    const s = withActivity(finished({ "9,4": ME }), win, whistle);
    expect(boardAlert(whistle, s, ME)).toMatchObject({
      title: "Your square hit at the final whistle! 🏁",
      detail: "You won Half & Final",
      subject: { kind: "me" },
      banner: true,
    });
  });

  it("still names the Final's winner for the host who typed the score", () => {
    const { win, whistle } = finalMoment(MAYA, ME);
    const s = withActivity(finished({ "9,4": MAYA }), win, whistle);
    expect(boardAlert(whistle, s, ME)).toBeNull();
    expect(boardAlert(win, s, ME)).toMatchObject({ title: "Maya wins at the final whistle", subject: { kind: "player", id: MAYA } });
  });
});

describe("boardAlert: wins", () => {
  const locked = makeState({
    game: { status: "locked", numbers: { "*": DRAW } },
    scores: [{ periodKey: "q2", scoreX: 14, scoreY: 10, source: "host", updatedAt: 1 }],
  });

  it("marks my own win as already said by the banner", () => {
    const a = act("winner", MAYA, { periodKey: "q2", label: "Half", playerIds: [ME], cell: { row: 9, col: 4 }, prize: "Loser buys wings" });
    expect(boardAlert(a, withActivity(locked, a), ME)).toMatchObject({
      kind: "my-win",
      title: "Your square hit at halftime!",
      detail: "Loser buys wings",
      banner: true,
      subject: { kind: "me" },
      cell: { row: 9, col: 4 },
    });
  });

  it("shows someone else's win with their face, the score and a square to jump to", () => {
    const a = act("winner", MAYA, { periodKey: "q2", label: "Half", playerIds: [SAM], cell: { row: 9, col: 4 }, prize: null });
    expect(boardAlert(a, withActivity(locked, a), ME)).toMatchObject({
      kind: "win",
      title: "Sam wins at halftime",
      subject: { kind: "player", id: SAM },
      chip: { kind: "score", scoreX: 14, scoreY: 10, label: "Half" },
      cell: { row: 9, col: 4 },
    });
    expect(boardAlert(a, withActivity(locked, a), ME)!.banner).toBeFalsy();
  });
});

describe("boardAlert: chatter collapses into one running count", () => {
  it("adds up everyone's picks in the burst, newest first, and never mine", () => {
    const squares: Square[] = Array.from({ length: 12 }, (_, i) => ({ row: 0, col: i % 10, playerId: MAYA, claimedAt: 1 }));
    const s0 = makeState({ squares });
    const m = act("claimed", MAYA, { count: 3 }, 1_000);
    const mine = act("claimed", ME, { count: 4 }, 2_000);
    const sam = act("claimed", SAM, { count: 2 }, 3_000);
    const s = withActivity(s0, m, mine, sam);
    expect(boardAlert(mine, s, ME)).toBeNull();
    expect(boardAlert(sam, s, ME)).toMatchObject({
      key: "picks",
      title: "Sam & Maya grabbed 5 squares",
      detail: "88 left",
      subject: { kind: "player", id: SAM },
    });
  });

  it("joins share the people count", () => {
    const a = act("joined", SAM, { name: "Sam" });
    expect(boardAlert(a, withActivity(makeState(), a), ME)).toMatchObject({ key: "people", title: "Sam joined", detail: "3 players · 100 left" });
  });
});

describe("boardAlert: numbers drawn", () => {
  it("is my news when I have squares: my face and my team-labeled numbers", () => {
    const s = makeState({
      game: { status: "locked", numbers: { "*": DRAW } },
      squares: [{ row: 2, col: 7, playerId: ME, claimedAt: 1 }],
    });
    const a = act("locked", MAYA);
    expect(boardAlert(a, withActivity(s, a), ME)).toMatchObject({
      key: "numbers",
      title: "Numbers are in",
      subject: { kind: "me" },
      chip: { kind: "numbers", pairs: [{ x: "7", y: "7" }], more: 0 },
      cell: { row: 2, col: 7 },
    });
  });
});
