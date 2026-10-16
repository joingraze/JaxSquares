import { describe, expect, it } from "vitest";
import type { Activity, ActivityType, GameState, NumberDraw, Player, Square } from "../../../shared/types";
import { BURST_WINDOW_MS, describeActivity, joinNames, myNumberPairs, periodPhrase } from "./activity";

const ME = "me_public_id_000000000";
const MAYA = "maya_public_id_0000000";
const SAM = "sam_public_id_00000000";
const LEE = "lee_public_id_00000000";

const digits = (order: number[]): number[][] => order.map((d) => [d]);
/** Columns 0..9 hold digits 0..9 for X; rows hold 9..0 for Y (so row r = digit 9 - r). */
const DRAW: NumberDraw = { x: digits([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]), y: digits([9, 8, 7, 6, 5, 4, 3, 2, 1, 0]) };

function player(id: string, name: string): Player {
  return { id, name, color: "#ff6b35", emoji: "🦊", joinedAt: 1, isHost: id === MAYA };
}

function squares(owner: string, count: number, startRow = 0): Square[] {
  return Array.from({ length: count }, (_, i) => ({ row: startRow + Math.floor(i / 10), col: i % 10, playerId: owner, claimedAt: 1 }));
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

/** State whose activity list (newest first) holds these activities. */
function withActivity(state: GameState, ...list: Activity[]): GameState {
  return { ...state, activity: [...list].sort((a, b) => b.at - a.at) };
}

describe("describeActivity: my own actions", () => {
  it("stays quiet about what I did", () => {
    const s = makeState();
    for (const type of ["created", "joined", "claimed", "released", "locked", "score", "final"] as const) {
      const a = act(type, ME, { count: 2, name: "Jordan", periodKey: "q1", label: "Q1", scoreX: 7, scoreY: 3 });
      expect(describeActivity(a, withActivity(s, a), ME)).toBeNull();
    }
  });

  it("still celebrates my win when I typed the score myself", () => {
    const a = act("winner", ME, { periodKey: "q1", label: "Q1", playerIds: [ME], cell: { row: 0, col: 0 }, prize: null });
    const ann = describeActivity(a, withActivity(makeState(), a), ME);
    expect(ann).toMatchObject({ text: "Your square hit at Q1! 🎉", tone: "win", haptic: "success", celebrate: true });
  });
});

describe("describeActivity: joined", () => {
  it("names the newcomer with a friendly line", () => {
    const a = act("joined", SAM, { name: "Sam" });
    const ann = describeActivity(a, withActivity(makeState(), a), ME)!;
    expect(ann.text).toMatch(/^Sam (joined the board|pulled up|is in) 👋$/);
    expect(ann.tone).toBe("info");
    expect(ann.haptic).toBeUndefined();
    // Same activity, same words.
    expect(describeActivity(a, withActivity(makeState(), a), ME)!.text).toBe(ann.text);
  });

  it("calls out player milestones for the latest join", () => {
    const players = ["a", "b", "c", "d"].map((id) => player(id, id.toUpperCase()));
    const s = makeState({ players: [...players, player(SAM, "Sam")] });
    const a = act("joined", SAM, { name: "Sam" });
    expect(describeActivity(a, withActivity(s, a), ME)!.text).toBe("Sam joined. That's 5 players! 🔥");
  });

  it("falls back to the player list when the name is missing", () => {
    const a = act("joined", MAYA, {});
    expect(describeActivity(a, withActivity(makeState(), a), ME)!.text).toContain("Maya");
  });
});

describe("describeActivity: claimed", () => {
  it("counts squares", () => {
    const one = act("claimed", MAYA, { count: 1, cells: [] });
    expect(describeActivity(one, withActivity(makeState(), one), ME)!.text).toBe("Maya grabbed a square");
    const three = act("claimed", MAYA, { count: 3, cells: [] });
    expect(describeActivity(three, withActivity(makeState(), three), ME)!.text).toBe("Maya grabbed 3 squares");
  });

  it("groups a burst of claims by the same person", () => {
    const first = act("claimed", MAYA, { count: 2 }, 1_000_000);
    const other = act("claimed", SAM, { count: 4 }, 1_010_000);
    const second = act("claimed", MAYA, { count: 3 }, 1_030_000);
    const s = withActivity(makeState(), first, other, second);
    expect(describeActivity(second, s, ME)!.text).toBe("Maya grabbed 3 more squares · 5 total");
    expect(describeActivity(first, s, ME)!.text).toBe("Maya grabbed 2 squares");
    const single = act("claimed", MAYA, { count: 1 }, 1_040_000);
    expect(describeActivity(single, withActivity(makeState(), first, second, single), ME)!.text).toBe(
      "Maya grabbed another square · 6 total",
    );
  });

  it("starts a new burst after a quiet spell", () => {
    const old = act("claimed", MAYA, { count: 2 }, 1_000_000);
    const later = act("claimed", MAYA, { count: 1 }, 1_000_000 + BURST_WINDOW_MS + 1);
    expect(describeActivity(later, withActivity(makeState(), old, later), ME)!.text).toBe("Maya grabbed a square");
  });

  it("mentions scarcity on the latest claim only", () => {
    const s = makeState({ squares: squares(SAM, 94) });
    const older = act("claimed", SAM, { count: 1 }, 1_000_000);
    const latest = act("claimed", MAYA, { count: 2 }, 1_005_000);
    const state = withActivity(s, older, latest);
    expect(describeActivity(latest, state, ME)!.text).toBe("Maya grabbed 2 squares · only 6 left");
    expect(describeActivity(older, state, ME)!.text).toBe("Sam grabbed a square");
  });

  it("drops scarcity once the board is locked", () => {
    const s = makeState({ squares: squares(SAM, 99), game: { status: "locked" } });
    const a = act("claimed", MAYA, { count: 1 });
    expect(describeActivity(a, withActivity(s, a), ME)!.text).toBe("Maya grabbed a square");
    const r = act("released", MAYA, { count: 1 });
    expect(describeActivity(r, withActivity(s, r), ME)).toBeNull();
  });

  it("makes a moment of the last square", () => {
    const s = makeState({ squares: squares(SAM, 100) });
    const a = act("claimed", MAYA, { count: 1 });
    expect(describeActivity(a, withActivity(s, a), ME)).toMatchObject({
      text: "Maya grabbed the last square. Board's full! 🔥",
      tone: "live",
      haptic: "medium",
    });
  });

  it("copes with a claim from someone who isn't in the player list yet", () => {
    const a = act("claimed", LEE, { count: 2 });
    expect(describeActivity(a, withActivity(makeState(), a), ME)!.text).toBe("Someone grabbed 2 squares");
  });
});

describe("describeActivity: released", () => {
  it("is noise while squares are plentiful", () => {
    const a = act("released", MAYA, { count: 2 });
    expect(describeActivity(a, withActivity(makeState(), a), ME)).toBeNull();
  });

  it("is news when the board is nearly full", () => {
    const s = makeState({ squares: squares(SAM, 97) });
    const a = act("released", MAYA, { count: 1 });
    expect(describeActivity(a, withActivity(s, a), ME)!.text).toBe("Maya freed up a square 👀 Grab it fast");
  });
});

describe("describeActivity: locked", () => {
  const locked = (mine: Square[], extra: Partial<GameState["game"]> = {}) =>
    makeState({ game: { status: "locked", numbers: { "*": DRAW }, ...extra }, squares: mine });

  it("tells me my numbers", () => {
    const mine: Square[] = [
      { row: 2, col: 7, playerId: ME, claimedAt: 1 },
      { row: 9, col: 3, playerId: ME, claimedAt: 1 },
    ];
    const a = act("locked", MAYA);
    expect(describeActivity(a, withActivity(locked(mine), a), ME)).toMatchObject({
      text: "Your numbers: KC 7 · BUF 7 +1 more",
      tone: "live",
      haptic: "medium",
      // My news wears my avatar, not the host's who drew them.
      subject: { kind: "me" },
      chip: {
        kind: "numbers",
        pairs: [
          { x: "7", y: "7", row: 2, col: 7 },
          { x: "3", y: "0", row: 9, col: 3 },
        ],
        more: 0,
      },
      cell: { row: 2, col: 7 },
    });
  });

  it("summarises lots of squares", () => {
    const a = act("locked", null, { auto: true });
    const ann = describeActivity(a, withActivity(locked(squares(ME, 5)), a), ME)!;
    expect(ann.text).toBe("Kickoff! Your numbers: KC 0 · BUF 9 +4 more");
    expect(ann.chip).toMatchObject({ kind: "numbers", more: 3 });
    const three = act("locked", MAYA);
    expect(describeActivity(three, withActivity(locked(squares(ME, 3)), three), ME)!.text).toBe(
      "Your numbers: KC 0 · BUF 9 +2 more",
    );
  });

  it("keeps it short when I have no squares", () => {
    const a = act("locked", MAYA);
    const ann = describeActivity(a, withActivity(locked([]), a), ME)!;
    expect(ann.text).toBe("Numbers are in 🔢");
    // Nobody's news in particular: the board's glyph, never the host's avatar.
    expect(ann.subject).toEqual({ kind: "system", glyph: "numbers" });
  });

  it("doesn't spell out two-digit 5x5 lines", () => {
    const draw5: NumberDraw = { x: [[0, 5], [1, 6], [2, 7], [3, 8], [4, 9]], y: [[0, 5], [1, 6], [2, 7], [3, 8], [4, 9]] };
    const s = makeState({
      game: { status: "locked", numbers: { "*": draw5 }, format: { periods: "quarters", reverse: false, boardSize: 25, freshNumbers: false } },
      squares: [
        { row: 0, col: 0, playerId: ME, claimedAt: 1 },
        { row: 1, col: 1, playerId: ME, claimedAt: 1 },
      ],
    });
    const a = act("locked", MAYA);
    expect(describeActivity(a, withActivity(s, a), ME)!.text).toBe("Numbers are in 🔢 Find your 2 squares");
    expect(myNumberPairs(s, ME)).toBeNull();
  });

  it("uses the Q1 draw when numbers change each quarter", () => {
    const q1: NumberDraw = { x: digits([5, 1, 2, 3, 4, 0, 6, 7, 8, 9]), y: digits([3, 1, 2, 0, 4, 5, 6, 7, 8, 9]) };
    const s = makeState({
      game: {
        status: "locked",
        numbers: { q1, q2: DRAW, q3: DRAW, final: DRAW },
        format: { periods: "quarters", reverse: false, boardSize: 100, freshNumbers: true },
      },
      squares: [{ row: 0, col: 0, playerId: ME, claimedAt: 1 }],
    });
    expect(myNumberPairs(s, ME)).toEqual(["KC 5 · BUF 3"]);
  });
});

describe("describeActivity: score", () => {
  it("announces a period score", () => {
    const a = act("score", null, { periodKey: "q1", label: "Q1", scoreX: 7, scoreY: 3, source: "live" });
    expect(describeActivity(a, withActivity(makeState(), a), ME)).toMatchObject({ text: "End of Q1: KC 7–3 BUF", tone: "live", haptic: "light" });
    const half = act("score", null, { periodKey: "q2", label: "Half", scoreX: 14, scoreY: 10, source: "live" });
    expect(describeActivity(half, withActivity(makeState(), half), ME)!.text).toBe("End of Half: KC 14–10 BUF");
    const fin = act("score", MAYA, { periodKey: "final", label: "Final", scoreX: 27, scoreY: 24, source: "host" });
    expect(describeActivity(fin, withActivity(makeState(), fin), ME)!.text).toBe("Final: KC 27–24 BUF");
    const every = act("score", null, { periodKey: "s3", label: "Score 3", scoreX: 10, scoreY: 7, source: "live" });
    expect(describeActivity(every, withActivity(makeState(), every), ME)!.text).toBe("Score! KC 10–7 BUF");
  });

  it("lets the winner line speak when the score produced one", () => {
    const sc = act("score", MAYA, { periodKey: "q1", label: "Q1", scoreX: 7, scoreY: 3, source: "host" }, 5);
    const win = act("winner", MAYA, { periodKey: "q1", label: "Q1", playerIds: [SAM], cell: null, prize: null }, 5);
    expect(describeActivity(sc, withActivity(makeState(), sc, win), ME)).toBeNull();
  });

  it("uses the team name when there's no abbreviation", () => {
    const s = makeState({ game: { teamX: { name: "Packers" }, teamY: { name: "Bears" } } });
    const a = act("score", null, { periodKey: "q3", label: "Q3", scoreX: 21, scoreY: 17, source: "live" });
    expect(describeActivity(a, withActivity(s, a), ME)!.text).toBe("End of Q3: Packers 21–17 Bears");
  });
});

describe("describeActivity: winner", () => {
  const win = (playerIds: string[], extra: Record<string, unknown> = {}) =>
    act("winner", null, { periodKey: "q1", label: "Q1", playerIds, cell: { row: 1, col: 1 }, prize: null, ...extra });

  it("celebrates my square", () => {
    const a = win([ME], { prize: "Loser buys wings" });
    expect(describeActivity(a, withActivity(makeState(), a), ME)).toEqual({
      text: "Your square hit at Q1! 🎉 Loser buys wings",
      tone: "win",
      haptic: "success",
      celebrate: true,
      subject: { kind: "me" },
      cell: { row: 1, col: 1 },
    });
  });

  it("shares the moment when I split it with someone", () => {
    const a = win([MAYA, ME]);
    const ann = describeActivity(a, withActivity(makeState(), a), ME)!;
    expect(ann.text).toBe("You and Maya both hit at Q1! 🎉");
    expect(ann.celebrate).toBe(true);
  });

  it("names someone else's win without confetti", () => {
    const a = win([MAYA]);
    expect(describeActivity(a, withActivity(makeState(), a), ME)).toEqual({
      text: "Maya wins Q1 🎉",
      tone: "win",
      haptic: "light",
      // The winner's face, not whoever typed the score.
      subject: { kind: "player", id: MAYA },
      cell: { row: 1, col: 1 },
    });
    const two = win([MAYA, SAM]);
    expect(describeActivity(two, withActivity(makeState(), two), ME)!.text).toBe("Maya & Sam win Q1 🎉");
  });

  it("uses the board's words for Half and the Final", () => {
    const half = act("winner", null, { periodKey: "q2", label: "Half", playerIds: [MAYA] });
    expect(describeActivity(half, withActivity(makeState(), half), ME)!.text).toBe("Maya wins Half 🎉");
    const fin = act("winner", null, { periodKey: "final", label: "Final", playerIds: [ME] });
    expect(describeActivity(fin, withActivity(makeState(), fin), ME)!.text).toBe("Your square hit at the Final! 🎉");
  });

  it("handles a host pick of an empty square", () => {
    const a = win([], { manual: true });
    expect(describeActivity(a, withActivity(makeState(), a), ME)).toMatchObject({ text: "Nobody had the winning square at Q1", tone: "info" });
  });

  it("ignores junk in playerIds", () => {
    const a = win([MAYA, 3, "", MAYA] as unknown as string[]);
    expect(describeActivity(a, withActivity(makeState(), a), ME)!.text).toBe("Maya wins Q1 🎉");
  });
});

describe("describeActivity: final", () => {
  // DRAW: column c = X digit c, row r = Y digit 9 - r.
  const finished = (owners: Record<string, string>) => {
    const sq: Square[] = Object.entries(owners).map(([key, playerId]) => {
      const [row, col] = key.split(",").map(Number);
      return { row, col, playerId, claimedAt: 1 };
    });
    return makeState({
      game: { status: "final", numbers: { "*": DRAW } },
      squares: sq,
      scores: [
        { periodKey: "q1", scoreX: 7, scoreY: 3, source: "host", updatedAt: 1 }, // col 7, row 6
        { periodKey: "q2", scoreX: 14, scoreY: 10, source: "host", updatedAt: 1 }, // col 4, row 9
        { periodKey: "q3", scoreX: 17, scoreY: 13, source: "host", updatedAt: 1 }, // col 7, row 6
        { periodKey: "final", scoreX: 24, scoreY: 20, source: "host", updatedAt: 1 }, // col 4, row 9
      ],
    });
  };

  it("sums up my wins", () => {
    const s = finished({ "6,7": ME, "9,4": MAYA });
    const a = act("final", null);
    expect(describeActivity(a, withActivity(s, a), ME)).toMatchObject({
      text: "That's a wrap! 🏁 You won Q1 & Q3",
      tone: "win",
      celebrate: true,
    });
  });

  it("names the clear leader when I didn't win", () => {
    const s = finished({ "6,7": SAM, "9,4": SAM });
    const a = act("final", MAYA);
    expect(describeActivity(a, withActivity(s, a), ME)!.text).toBe("That's a wrap! 🏁 Sam won 4 times");
  });

  it("keeps it neutral on a tie", () => {
    const s = finished({ "6,7": SAM, "9,4": MAYA });
    const a = act("final", null);
    expect(describeActivity(a, withActivity(s, a), ME)!.text).toBe("That's a wrap! 🏁 See who won each round");
  });
});

describe("helpers", () => {
  it("joins names", () => {
    expect(joinNames([])).toBe("");
    expect(joinNames(["Maya"])).toBe("Maya");
    expect(joinNames(["Maya", "Sam"])).toBe("Maya & Sam");
    expect(joinNames(["Maya", "Sam", "Lee"])).toBe("Maya, Sam & Lee");
  });

  it("phrases periods", () => {
    expect(periodPhrase("Q1", "q1")).toBe("Q1");
    expect(periodPhrase("Half", "q2")).toBe("Half");
    expect(periodPhrase("Halftime", "q2")).toBe("Half");
    expect(periodPhrase("Final", "final")).toBe("the Final");
    expect(periodPhrase("Score 4", "s4")).toBe("Score 4");
  });

  it("never throws on unknown types", () => {
    const a = { ...act("created", MAYA), type: "mystery" as ActivityType };
    expect(describeActivity(a, makeState(), ME)).toBeNull();
  });
});
