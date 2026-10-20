import { describe, expect, it } from "vitest";
import { MONEY_ERRORS } from "../../../shared/formats";
import { KICKOFF_ERRORS } from "../../../shared/kickoff";
import type { GameState, NumberDraw, Player, Score, Square } from "../../../shared/types";
import {
  FREE_DRAW_NOTE,
  FREE_TIER_LINE,
  NEXT_ENTRY,
  drawIsFree,
  addPoints,
  canSaveScore,
  cleanTyped,
  defaultTargetKey,
  canEditKickoff,
  editDraftOf,
  editErrors,
  editPatch,
  hostSummary,
  gameStarted,
  hostStatusLine,
  initialDraft,
  invitedAnyone,
  isUnchangedEntry,
  landingOrder,
  lockFacts,
  lockIsTheMove,
  lockReadiness,
  canPayAhead,
  needsHostFee,
  numbersFor,
  parseScore,
  pressKey,
  previewWinner,
  removeCopy,
  resolvedKey,
  revealDraw,
  saveEndsGame,
  scoreSuggestion,
  scoreTargets,
  winnerRows,
} from "./hostModel";

const ME = "me_public_id";
const MAYA = "maya_public_id";
// column c holds digit c, row r holds digit 9 - r
const DRAW: NumberDraw = {
  x: [[0], [1], [2], [3], [4], [5], [6], [7], [8], [9]],
  y: [[9], [8], [7], [6], [5], [4], [3], [2], [1], [0]],
};

const player = (id: string, name: string): Player => ({ id, name, color: "#ff6b35", emoji: "", joinedAt: 1, isHost: false });
const sq = (row: number, col: number, playerId: string): Square => ({ row, col, playerId, claimedAt: 1 });
const score = (periodKey: string, scoreX: number, scoreY: number, label?: string): Score => ({
  periodKey,
  scoreX,
  scoreY,
  source: "host",
  updatedAt: 1,
  ...(label ? { label } : {}),
});

function makeState(over: Omit<Partial<GameState>, "game"> & { game?: Partial<GameState["game"]> } = {}): GameState {
  const { game, ...rest } = over;
  return {
    game: {
      id: "g1",
      name: "Test board",
      sport: "football",
      league: "custom",
      teamX: { name: "Chiefs", abbr: "KC", color: "#e31837" },
      teamY: { name: "Bills", abbr: "BUF", color: "#00338d" },
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
      hostPlayerId: ME,
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

const locked = (over: Parameters<typeof makeState>[0] = {}) =>
  makeState({ ...over, game: { status: "locked", numbers: { "*": DRAW }, ...over.game } });

const linked = (over: Parameters<typeof makeState>[0] = {}) =>
  locked({ ...over, game: { linkedEvent: { provider: "espn", league: "nfl", eventId: "1", startsAt: 1, xIsHome: true }, ...over.game } });

const everyScore = (scores: Score[] = [], over: Parameters<typeof makeState>[0] = {}) =>
  locked({
    ...over,
    scores,
    game: { format: { periods: "every-score", reverse: false, boardSize: 100, freshNumbers: false }, periods: [], ...over.game },
  });

describe("hostSummary", () => {
  const filled = (n: number, size = 10) => Array.from({ length: n }, (_, i) => sq(Math.floor(i / size), i % size, i % 2 ? MAYA : ME));
  const small = (n: number) =>
    makeState({ game: { format: { periods: "quarters", reverse: false, boardSize: 25, freshNumbers: false } }, squares: filled(n, 5) });

  it("keeps Invite primary, with the count left, while the board fills", () => {
    const s = makeState({ squares: [sq(0, 0, ME), sq(0, 1, MAYA)] });
    expect(hostSummary(s).action).toEqual({ kind: "invite", label: "Invite (98 left)" });
    const most = makeState({ squares: filled(58) });
    expect(hostSummary(most).action).toEqual({ kind: "invite", label: "Invite (42 left)" });
    expect(hostSummary(most).status).toBe("58 of 100 taken");
    expect(hostSummary(makeState({ squares: filled(89) })).action.kind).toBe("invite");
  });

  it("makes Lock & draw primary once the board is ~90% claimed, and celebrates a full board", () => {
    const nearly = makeState({ squares: filled(90) });
    expect(hostSummary(nearly).action).toEqual({ kind: "lock", label: "Lock & draw" });
    expect(hostSummary(nearly).status).toBe("10 squares left · ready to draw");
    expect(hostSummary(makeState({ squares: filled(99) })).status).toBe("1 square left · ready to draw");
    const full = makeState({ squares: filled(100) });
    expect(hostSummary(full).action.kind).toBe("lock");
    expect(hostSummary(full).status).toMatch(/full/);
    expect(hostSummary(full).progress).toBe(1);
  });

  it("uses the last-call rule on a 5x5 board (3 left is nearly full)", () => {
    expect(hostSummary(small(21)).action.kind).toBe("invite");
    expect(hostSummary(small(22)).action).toEqual({ kind: "lock", label: "Lock & draw" });
  });

  it("lockIsTheMove: full, 90% claimed or isUrgent; never on an empty board", () => {
    expect(lockIsTheMove(0, 100)).toBe(false);
    expect(lockIsTheMove(50, 100)).toBe(false);
    expect(lockIsTheMove(89, 100)).toBe(false);
    expect(lockIsTheMove(90, 100)).toBe(true);
    expect(lockIsTheMove(100, 100)).toBe(true);
    expect(lockIsTheMove(21, 25)).toBe(false);
    expect(lockIsTheMove(22, 25)).toBe(true);
    expect(lockIsTheMove(0, 0)).toBe(false);
  });

  it("points a typed-in locked board at the next period's score", () => {
    const s = locked({ scores: [score("q1", 7, 3)] });
    expect(hostSummary(s).action).toEqual({ kind: "score", label: "Half score" });
    expect(hostSummary(s).status).toBe("1 of 4 prizes decided");
  });

  it("counts host picks as decided", () => {
    const s = locked({ manualWinners: [{ periodKey: "q1", row: 0, col: 0, updatedAt: 1 }] });
    expect(hostSummary(s).status).toBe("1 of 4 prizes decided");
  });

  it("says linked boards run themselves", () => {
    const s = locked({
      game: { linkedEvent: { provider: "espn", league: "nfl", eventId: "1", startsAt: 2, xIsHome: true } },
    });
    expect(hostSummary(s).action.kind).toBe("auto");
  });

  it("offers Add score on every-score boards and handles draft/final", () => {
    expect(hostSummary(everyScore([score("s1", 7, 0)])).action).toEqual({ kind: "score", label: "Add score" });
    expect(hostSummary(locked({ game: { status: "final" } })).action.kind).toBe("final");
  });

  /** Every square, spread over `owners` players. */
  const fullBoard = (owners: number) => Array.from({ length: 100 }, (_, i) => sq(Math.floor(i / 10), i % 10, i % owners === 0 ? MAYA : `p${i % owners}`));

  it("puts the host fee on the draw of a 6-player board while it's due, and only then", () => {
    const full = fullBoard(6);
    const unpaid = hostSummary(makeState({ game: { paid: false }, squares: full }), "$4.99");
    expect(unpaid.action).toEqual({ kind: "lock", label: "Draw the numbers · $4.99" });
    expect(unpaid.fee).toBe(true);
    expect(unpaid.slim).toBe(false);
    // No price to show (StoreKit can't say): still plain about what the button does.
    expect(hostSummary(makeState({ game: { paid: false }, squares: full })).action.label).toBe("Draw the numbers");
    const paid = hostSummary(makeState({ game: { paid: true }, squares: full }), "$4.99");
    expect(paid.action).toEqual({ kind: "lock", label: "Lock & draw" });
    expect(paid.fee).toBe(false);
    // Still filling: inviting stays the move, fee or not.
    expect(hostSummary(makeState({ game: { paid: false } }), "$4.99").action.kind).toBe("invite");
    // A draft left from the pay-to-open flow reads like any open board (paying opens it).
    expect(hostSummary(makeState({ game: { status: "draft", paid: false }, squares: full }), "$4.99").action.label).toBe("Draw the numbers · $4.99");
  });

  it("draws a board of 5 or fewer players for free: no price, no checkout, whatever the pass", () => {
    const five = hostSummary(makeState({ game: { paid: false }, squares: fullBoard(5) }), "$4.99");
    expect(five.action).toEqual({ kind: "lock", label: "Draw the numbers · Free" });
    expect(five).toMatchObject({ free: true, fee: false, covered: false });
    // A pass holder's small board is free too: the pass isn't what covers it.
    expect(hostSummary(makeState({ game: { paid: false }, squares: fullBoard(1) }), "$4.99", Date.now(), true)).toMatchObject({
      action: { label: "Draw the numbers · Free" },
      free: true,
      covered: false,
    });
    // A 6th player brings the fee back, or the pass.
    expect(hostSummary(makeState({ game: { paid: false }, squares: fullBoard(6) }), "$4.99", Date.now(), true)).toMatchObject({
      action: { label: "Draw the numbers" },
      free: false,
      covered: true,
      fee: false,
    });
    // Paid boards and older copies (no `paid`) aren't "free": they just draw.
    expect(hostSummary(makeState({ game: { paid: true }, squares: fullBoard(2) }), "$4.99")).toMatchObject({ action: { label: "Lock & draw" }, free: false });
    expect(drawIsFree(makeState({ squares: fullBoard(2) }))).toBe(false);
    expect(drawIsFree(makeState({ game: { paid: false }, squares: fullBoard(5) }))).toBe(true);
    expect(drawIsFree(makeState({ game: { paid: false }, squares: fullBoard(6) }))).toBe(false);
    expect(FREE_DRAW_NOTE).toBe("Free for up to 5 players");
    expect(FREE_TIER_LINE).toBe("Boards with up to 5 players are free.");
  });

  it("makes drawing the move once a linked game kicked off without its numbers", () => {
    const linkedAt = { provider: "espn" as const, league: "nfl" as const, eventId: "1", startsAt: 1_000, xIsHome: true };
    const six = fullBoard(6).slice(0, 6);
    const s = hostSummary(makeState({ game: { paid: false, linkedEvent: linkedAt }, squares: six }), "$4.99", 2_000);
    expect(s).toMatchObject({ status: "Kicked off · numbers not drawn yet", action: { kind: "lock", label: "Draw the numbers · $4.99" }, fee: true });
    // Before kickoff it's still about filling the board.
    expect(hostSummary(makeState({ game: { paid: false, linkedEvent: linkedAt }, squares: six }), "$4.99", 500).action.kind).toBe("invite");
  });

  it("knows when the fee is due, and when a linked board can be paid ahead", () => {
    expect(needsHostFee({ status: "open", paid: false })).toBe(true);
    expect(needsHostFee({ status: "draft", paid: false })).toBe(true);
    expect(needsHostFee({ status: "open", paid: true })).toBe(false);
    // An older copy of the board without `paid`: the server's 402 decides.
    expect(needsHostFee({ status: "open" })).toBe(false);
    expect(needsHostFee({ status: "locked", paid: false })).toBe(false);
    const linked = (startsAt: number) => ({ provider: "espn" as const, league: "nfl" as const, eventId: "1", startsAt, xIsHome: true });
    expect(canPayAhead({ status: "open", paid: false, linkedEvent: linked(5_000) }, 1_000)).toBe(true);
    expect(canPayAhead({ status: "open", paid: false, linkedEvent: linked(500) }, 1_000)).toBe(false);
    expect(canPayAhead({ status: "open", paid: false, linkedEvent: null }, 1_000)).toBe(false);
    expect(canPayAhead({ status: "open", paid: true, linkedEvent: linked(5_000) }, 1_000)).toBe(false);
  });

  it("folds to a slim bar only when there's nothing to do", () => {
    const linked = locked({ game: { linkedEvent: { provider: "espn", league: "nfl", eventId: "1", startsAt: 2, xIsHome: true } } });
    expect(hostSummary(linked).slim).toBe(true);
    expect(hostSummary(locked({ game: { status: "final" } })).slim).toBe(true);
    expect(hostSummary(locked()).slim).toBe(false);
    expect(hostSummary(makeState()).slim).toBe(false);
  });

  it("says Invite friends until someone besides the host joins", () => {
    const alone = makeState({ players: [player(ME, "Jordan")] });
    expect(hostSummary(alone).action).toEqual({ kind: "invite", label: "Invite friends" });
    expect(invitedAnyone(alone)).toBe(false);
    expect(invitedAnyone(makeState())).toBe(true);
    expect(hostSummary(makeState()).action).toEqual({ kind: "invite", label: "Invite (100 left)" });
  });
});

describe("gameStarted", () => {
  const linkedAt = (startsAt: number) => ({ provider: "espn" as const, league: "nfl" as const, eventId: "1", startsAt, xIsHome: true });

  it("is false before kickoff with nothing recorded", () => {
    expect(gameStarted(locked({ game: { linkedEvent: linkedAt(5_000) } }), 1_000)).toBe(false);
    expect(gameStarted(locked(), 1_000)).toBe(false);
  });

  it("is true after kickoff, once live, or once a score or pick is in", () => {
    expect(gameStarted(locked({ game: { linkedEvent: linkedAt(5_000) } }), 6_000)).toBe(true);
    expect(gameStarted(locked({ live: { state: "in", period: 1, clock: "9:00", detail: "Q1 9:00", scoreX: 0, scoreY: 0, updatedAt: 1 } }), 0)).toBe(true);
    expect(gameStarted(locked({ scores: [score("q1", 7, 3)] }), 0)).toBe(true);
    expect(gameStarted(locked({ manualWinners: [{ periodKey: "q1", row: 0, col: 0, updatedAt: 1 }] }), 0)).toBe(true);
  });
});

describe("hostStatusLine", () => {
  it("names the state the same way the sheet's title never changes", () => {
    expect(hostStatusLine(makeState({ squares: [sq(0, 0, ME)] }))).toBe("Filling up · 1 of 100 squares taken");
    expect(hostStatusLine(makeState({ game: { status: "draft" }, squares: [sq(0, 0, ME)] }))).toBe("Filling up · 1 of 100 squares taken");
    expect(
      hostStatusLine(makeState({ game: { paid: false, linkedEvent: { provider: "espn", league: "nfl", eventId: "1", startsAt: 1_000, xIsHome: true } } }), 2_000),
    ).toBe("Kicked off · draw the numbers to start the board");
    expect(hostStatusLine(locked({ scores: [score("q1", 7, 3)] }))).toBe("Numbers drawn · Half is up next");
    expect(hostStatusLine(locked({ game: { linkedEvent: { provider: "espn", league: "nfl", eventId: "1", startsAt: Date.now() + 60_000, xIsHome: true } } }))).toBe(
      "Numbers drawn · waiting for kickoff",
    );
  });

  it("says when a final board still has prizes with no winner", () => {
    const s = locked({ game: { status: "final" }, scores: [score("final", 7, 3)] });
    expect(hostStatusLine(s)).toBe("Final · 1 prize has no winner yet");
    expect(hostStatusLine(locked({ game: { status: "final" }, squares: [sq(6, 7, MAYA)], scores: [score("final", 7, 3)] }))).toBe("Final · the winners are in");
  });
});

describe("lockFacts", () => {
  it("blocks locking an empty board and double-checks a thin one", () => {
    expect(lockReadiness({ claimed: 0, total: 100 })).toBe("empty");
    expect(lockReadiness({ claimed: 14, total: 100 })).toBe("low");
    expect(lockReadiness({ claimed: 25, total: 100 })).toBe("ok");
    expect(lockReadiness({ claimed: 25, total: 25 })).toBe("ok");
  });

  it("counts empty squares and players without a square", () => {
    const s = makeState({ squares: [sq(0, 0, ME)] });
    expect(lockFacts(s)).toEqual({ claimed: 1, total: 100, empty: 99, players: 2, idle: 1 });
  });
});

describe("removeCopy", () => {
  it("says plainly what happens to their squares", () => {
    expect(removeCopy("Maya", 6)).toEqual({
      title: "Remove Maya?",
      detail: "Their 6 squares open up again.",
      after: "Anyone can pick them.",
      confirm: "Remove Maya",
      done: "Maya removed",
      doneDetail: "6 squares are open again.",
    });
    expect(removeCopy("Maya", 1)).toMatchObject({ detail: "Their square opens up again.", after: "Anyone can pick it.", doneDetail: "1 square is open again." });
    expect(removeCopy("Maya", 0)).toMatchObject({ detail: "They haven't picked a square yet.", doneDetail: "They're off the board." });
  });

  it("never prints a blank name, and never mentions money", () => {
    expect(removeCopy("  ", 2)).toMatchObject({ title: "Remove this player?", confirm: "Remove this player", done: "This player removed" });
    for (const n of [0, 1, 6]) expect(Object.values(removeCopy("Maya", n)).join(" ")).not.toMatch(/\$|pay|owe|bet|money/i);
  });
});

describe("score targets", () => {
  it("lists fixed periods with what's recorded", () => {
    const t = scoreTargets(locked({ scores: [score("q1", 7, 3)] }));
    expect(t.map((x) => [x.key, !!x.existing])).toEqual([
      ["q1", true],
      ["q2", false],
      ["q3", false],
      ["final", false],
    ]);
  });

  it("lists every-score entries then a new one", () => {
    const t = scoreTargets(everyScore([score("s2", 7, 3), score("s1", 7, 0)]));
    expect(t.map((x) => x.key)).toEqual(["s1", "s2", NEXT_ENTRY]);
    expect(t[2].label).toBe("Score 3");
  });

  it("opens on the next undecided period, or the last one when all are done", () => {
    expect(defaultTargetKey(locked({ scores: [score("q1", 7, 3)] }))).toBe("q2");
    const done = locked({ scores: ["q1", "q2", "q3", "final"].map((k) => score(k, 1, 1)) });
    expect(defaultTargetKey(done)).toBe("final");
    expect(defaultTargetKey(everyScore())).toBe(NEXT_ENTRY);
  });

  it("resolves the next entry key", () => {
    expect(resolvedKey(everyScore([score("s1", 7, 0), score("s2", 7, 3)]), NEXT_ENTRY)).toBe("s3");
    expect(resolvedKey(everyScore(), NEXT_ENTRY)).toBe("s1");
    expect(resolvedKey(locked(), "q2")).toBe("q2");
  });
});

describe("initialDraft", () => {
  it("loads a recorded score for editing", () => {
    expect(initialDraft(locked({ scores: [score("q1", 7, 3)] }), "q1")).toEqual({ x: "7", y: "3" });
  });

  it("starts a new period blank, so nothing saves until the host enters it", () => {
    expect(initialDraft(locked({ scores: [score("q1", 7, 3)] }), "q2")).toEqual({ x: "", y: "" });
    const live = locked({ live: { state: "in", period: 2, clock: "4:00", detail: "Q2 4:00", scoreX: 14, scoreY: 3, updatedAt: 1 } });
    expect(initialDraft(live, "q2")).toEqual({ x: "", y: "" });
  });

  it("is blank for a first fixed period, the latest score for a new every-score entry", () => {
    expect(initialDraft(locked(), "q1")).toEqual({ x: "", y: "" });
    expect(initialDraft(everyScore(), NEXT_ENTRY)).toEqual({ x: "0", y: "0" });
    expect(initialDraft(everyScore([score("s1", 7, 0), score("s2", 7, 3)]), NEXT_ENTRY)).toEqual({ x: "7", y: "3" });
  });
});

describe("scoreSuggestion", () => {
  it("offers the previous period's score for a new period", () => {
    expect(scoreSuggestion(locked({ scores: [score("q1", 7, 3)] }), "q2")).toEqual({ label: "Same as Q1", draft: { x: "7", y: "3" } });
    expect(scoreSuggestion(locked({ scores: [score("q1", 7, 3), score("q2", 14, 10)] }), "q3")?.label).toBe("Same as Half");
  });

  it("offers the live score on linked boards only once it is that period's score", () => {
    const at = (period: number, detail: string, scores = [score("q1", 7, 3)]) =>
      linked({ scores, live: { state: "in", period, clock: "0:00", detail, scoreX: 14, scoreY: 3, updatedAt: 1 } });
    // Halftime (the feed hasn't recorded the Half yet): the live score is the Half's.
    expect(scoreSuggestion(at(2, "Halftime"), "q2")).toEqual({ label: "Live score", draft: { x: "14", y: "3" } });
    expect(scoreSuggestion(at(1, "End of 1st", []), "q1")).toEqual({ label: "Live score", draft: { x: "14", y: "3" } });
    // Mid-period it's only the score so far: a host score would pin the period for good.
    expect(scoreSuggestion(at(2, "Q2 4:00"), "q2")).toBeNull();
    expect(scoreSuggestion(at(3, "Q3 8:12", [score("q1", 7, 3), score("q2", 14, 3)]), "q3")).toBeNull();
    // Nor a guess from the previous period while the real game is on.
    expect(scoreSuggestion(at(3, "Q3 8:12", [score("q1", 7, 3), score("q2", 14, 3)]), "final")).toBeNull();
    // The final whistle: the live score is the Final's.
    const over = linked({ scores: [score("q1", 7, 3)], live: { state: "post", period: 4, clock: "0:00", detail: "Final", scoreX: 24, scoreY: 20, updatedAt: 1 } });
    expect(scoreSuggestion(over, "final")).toEqual({ label: "Live score", draft: { x: "24", y: "20" } });
    expect(scoreSuggestion(over, "q2")).toBeNull();
  });

  it("opens a linked board's fix on the latest decided period, never one still in play", () => {
    const live = (period: number, detail: string) => ({ state: "in" as const, period, clock: "8:12", detail, scoreX: 17, scoreY: 10, updatedAt: 1 });
    const decided = [score("q1", 7, 3), score("q2", 14, 10)];
    expect(defaultTargetKey(linked({ scores: decided, live: live(3, "Q3 8:12") }))).toBe("q2");
    expect(defaultTargetKey(linked({ scores: decided, live: live(2, "Halftime") }))).toBe("q2");
    // The period just ended but the feed hasn't recorded it: that's the one to fix.
    expect(defaultTargetKey(linked({ scores: [score("q1", 7, 3)], live: live(2, "Halftime") }))).toBe("q2");
    // Nothing decided yet: the period in play (with nothing suggested).
    expect(defaultTargetKey(linked({ live: live(1, "Q1 8:12") }))).toBe("q1");
    // Game over: anything undecided, else the Final.
    const post = { ...live(4, "Final"), state: "post" as const };
    expect(defaultTargetKey(linked({ scores: decided, live: post }))).toBe("q3");
  });

  it("has nothing to offer for the first period, a recorded one, or every-score entries", () => {
    expect(scoreSuggestion(locked(), "q1")).toBeNull();
    expect(scoreSuggestion(locked({ scores: [score("q1", 7, 3)] }), "q1")).toBeNull();
    expect(scoreSuggestion(everyScore([score("s1", 7, 0)]), NEXT_ENTRY)).toBeNull();
  });
});

describe("keypad", () => {
  it("replaces on a fresh field, appends otherwise, no leading zeros, max 3 digits", () => {
    expect(pressKey("14", "7", true)).toBe("7");
    expect(pressKey("1", "4", false)).toBe("14");
    expect(pressKey("0", "7", false)).toBe("7");
    expect(pressKey("", "0", false)).toBe("0");
    expect(pressKey("123", "4", false)).toBe("123");
  });

  it("backspace and clear", () => {
    expect(pressKey("14", "back", false)).toBe("1");
    expect(pressKey("14", "back", true)).toBe("");
    expect(pressKey("14", "clear", false)).toBe("");
  });

  it("cleans typed text and adds points", () => {
    expect(cleanTyped("0a21")).toBe("21");
    expect(cleanTyped("1234")).toBe("123");
    expect(cleanTyped("000")).toBe("0");
    expect(addPoints("14", 7)).toBe("21");
    expect(addPoints("", 3)).toBe("3");
    expect(addPoints("998", 7)).toBe("999");
  });

  it("parses scores strictly", () => {
    expect(parseScore("21")).toBe(21);
    expect(parseScore("")).toBeNull();
    expect(parseScore("1000")).toBeNull();
    expect(parseScore("-1")).toBeNull();
  });
});

describe("previewWinner", () => {
  it("names the owner of the square the score lands on", () => {
    // 17-13: KC digit 7 -> col 7; BUF digit 3 -> row 6.
    const s = locked({ squares: [sq(6, 7, MAYA)], game: { prizes: { q2: "Loser buys wings" } } });
    const p = previewWinner(s, "q2", { x: "17", y: "13" });
    expect(p).toMatchObject({ cell: { row: 6, col: 7 }, ownerId: MAYA, digitX: 7, digitY: 3, prize: "Loser buys wings", manual: null });
  });

  it("includes a distinct reverse square on reverse boards", () => {
    const s = locked({
      squares: [sq(6, 7, MAYA), sq(2, 3, ME)],
      game: { format: { periods: "quarters", reverse: true, boardSize: 100, freshNumbers: false } },
    });
    const p = previewWinner(s, "q1", { x: "17", y: "13" });
    expect(p?.reverse).toEqual({ cell: { row: 2, col: 3 }, ownerId: ME });
    // 7-7 lands on one square: no separate reverse.
    expect(previewWinner(s, "q1", { x: "7", y: "7" })?.reverse).toBeNull();
  });

  it("flags a host pick that will keep winning", () => {
    const s = locked({ manualWinners: [{ periodKey: "q1", row: 0, col: 0, updatedAt: 1 }] });
    expect(previewWinner(s, "q1", { x: "7", y: "3" })?.manual).toMatchObject({ row: 0, col: 0 });
  });

  it("is null before numbers or with an incomplete score", () => {
    expect(previewWinner(makeState(), "q1", { x: "7", y: "3" })).toBeNull();
    expect(previewWinner(locked(), "q1", { x: "7", y: "" })).toBeNull();
  });

  it("uses the next entry's prize on every-score boards", () => {
    const s = everyScore([score("s1", 7, 0)], { game: { prizes: { "*": "Winner picks the song" } } });
    expect(previewWinner(s, NEXT_ENTRY, { x: "7", y: "3" })).toMatchObject({ periodKey: "s2", prize: "Winner picks the song" });
  });

  it("uses the quarter's own draw when numbers are fresh each quarter", () => {
    const flipped: NumberDraw = { x: [...DRAW.x].reverse(), y: DRAW.y };
    const s = locked({ game: { numbers: { q1: DRAW, q2: flipped, q3: DRAW, final: DRAW } } });
    expect(previewWinner(s, "q1", { x: "0", y: "9" })?.cell).toEqual({ row: 0, col: 0 });
    expect(previewWinner(s, "q2", { x: "0", y: "9" })?.cell).toEqual({ row: 0, col: 9 });
  });
});

describe("canSaveScore", () => {
  it("needs both scores and a change", () => {
    const s = locked({ scores: [score("q1", 7, 3)] });
    expect(canSaveScore(s, "q2", { x: "7", y: "" })).toBe(false);
    expect(canSaveScore(s, "q2", { x: "7", y: "3" })).toBe(true);
    expect(canSaveScore(s, "q1", { x: "7", y: "3" })).toBe(false);
    expect(canSaveScore(s, "q1", { x: "10", y: "3" })).toBe(true);
  });

  it("refuses a new every-score entry equal to the latest one", () => {
    const s = everyScore([score("s1", 7, 0)]);
    expect(canSaveScore(s, NEXT_ENTRY, { x: "7", y: "0" })).toBe(false);
    expect(isUnchangedEntry(s, NEXT_ENTRY, { x: "7", y: "0" })).toBe(true);
    expect(canSaveScore(s, NEXT_ENTRY, { x: "7", y: "3" })).toBe(true);
    expect(canSaveScore(everyScore(), NEXT_ENTRY, { x: "0", y: "0" })).toBe(false);
  });
});

describe("saveEndsGame", () => {
  it("only for the Final of a typed-in locked board", () => {
    expect(saveEndsGame(locked().game, "final")).toBe(true);
    expect(saveEndsGame(locked().game, "q3")).toBe(false);
    expect(saveEndsGame({ status: "final", linkedEvent: null }, "final")).toBe(false);
    expect(
      saveEndsGame({ status: "locked", linkedEvent: { provider: "espn", league: "nfl", eventId: "1", startsAt: 1, xIsHome: true } }, "final"),
    ).toBe(false);
  });
});

describe("winnerRows", () => {
  it("shows decided periods plus the next open one", () => {
    const s = locked({ squares: [sq(2, 7, MAYA)], scores: [score("q1", 7, 7)] });
    const rows = winnerRows(s);
    expect(rows.map((r) => r.key)).toEqual(["q1", "q2"]);
    expect(rows[0].result?.winnerPlayerId).toBe(MAYA);
    expect(rows[1].result).toBeNull();
  });

  it("marks host picks", () => {
    const s = locked({ manualWinners: [{ periodKey: "q2", row: 0, col: 0, updatedAt: 1 }] });
    const rows = winnerRows(s);
    expect(rows.find((r) => r.key === "q2")?.manual).toBe(true);
    expect(rows.map((r) => r.key)).toEqual(["q1", "q2"]);
  });

  it("lists every-score entries", () => {
    const rows = winnerRows(everyScore([score("s1", 7, 0), score("s2", 7, 3)]));
    expect(rows.map((r) => r.label)).toEqual(["Score 1", "Score 2"]);
  });
});

describe("edit board", () => {
  it("edits the name, the cap and a custom board's kickoff (prices, prizes and notes live under Rules & prizes)", () => {
    expect(editDraftOf(locked().game)).toEqual({ name: "Test board", maxPerPlayer: 0, startsAt: null });
    expect(editErrors({ ...editDraftOf(locked().game), name: "  " }).name).toBeTruthy();
  });

  it("sends a custom board's new kickoff (or no set time), never a linked board's", () => {
    const now = Date.now();
    const custom = makeState({ game: { linkedEvent: null, startsAt: now + 3_600_000 } }).game;
    const later = now + 2 * 86_400_000;
    expect(editDraftOf(custom).startsAt).toBe(now + 3_600_000);
    expect(editPatch(custom, { ...editDraftOf(custom), startsAt: later })).toEqual({ startsAt: later });
    expect(editPatch(custom, { ...editDraftOf(custom), startsAt: null })).toEqual({ startsAt: null });
    const linked = makeState({
      game: { linkedEvent: { provider: "espn", league: "nfl", eventId: "1", startsAt: now + 1, xIsHome: false }, startsAt: now + 1 },
    }).game;
    expect(canEditKickoff(linked)).toBe(false);
    expect(editPatch(linked, { ...editDraftOf(linked), startsAt: later })).toBeNull();
  });

  it("checks a changed kickoff like the server, and leaves an old one alone", () => {
    const now = Date.now();
    const old = makeState({ game: { linkedEvent: null, startsAt: now - 30 * 86_400_000 } }).game;
    // A rename on a board whose kickoff is long past still saves.
    expect(editErrors({ ...editDraftOf(old), name: "Rematch" }, old, now).kickoff).toBeNull();
    expect(editErrors({ ...editDraftOf(old), startsAt: now + 500 * 86_400_000 }, old, now).kickoff).toBe(KICKOFF_ERRORS.future);
    expect(editErrors({ ...editDraftOf(old), startsAt: now + 86_400_000 }, old, now).kickoff).toBeNull();
  });

  it("flags money in the board name, inline, with the server's message", () => {
    expect(editErrors({ ...editDraftOf(locked().game), name: "$20 Squares Pool" }).name).toBe(MONEY_ERRORS.name);
    expect(editErrors({ ...editDraftOf(locked().game), name: "Bucks vs Packers" }).name).toBeNull();
  });

  it("sends only what changed, never touching notes", () => {
    const game = makeState({ game: { prizes: { q1: "Loser buys wings", "*": "Bragging rights" } } }).game;
    expect(editPatch(game, editDraftOf(game))).toBeNull();
    const renamed = editPatch(game, { ...editDraftOf(game), name: "  Big   Game " });
    expect(renamed).toEqual({ name: "Big Game" });
  });

  it("only changes max squares while the board is open", () => {
    const open = makeState().game;
    expect(editPatch(open, { ...editDraftOf(open), maxPerPlayer: 5 })).toEqual({ maxPerPlayer: 5 });
    const closed = locked().game;
    expect(editPatch(closed, { ...editDraftOf(closed), maxPerPlayer: 5 })).toBeNull();
  });
});

describe("number reveal", () => {
  it("shows the shared draw, or Q1's when every quarter has its own", () => {
    expect(revealDraw(locked().game)).toEqual({ key: "*", draw: DRAW });
    const fresh = locked({ game: { numbers: { q3: DRAW, q1: DRAW, final: DRAW, q2: DRAW } } }).game;
    expect(revealDraw(fresh).key).toBe("q1");
    expect(revealDraw(makeState().game).draw).toBeNull();
  });

  it("lists my numbers in board order", () => {
    const s = locked({ squares: [sq(3, 1, ME), sq(0, 4, ME), sq(1, 1, MAYA)] });
    expect(numbersFor(s, DRAW, ME)).toEqual([
      { key: "0,4", x: "4", y: "9" },
      { key: "3,1", x: "1", y: "6" },
    ]);
  });

  it("joins pairs on 5x5 boards", () => {
    const pairs: NumberDraw = { x: [[1, 2], [3, 4], [5, 6], [7, 8], [9, 0]], y: [[0, 9], [8, 7], [6, 5], [4, 3], [2, 1]] };
    expect(numbersFor({ squares: [sq(0, 0, ME)] }, pairs, ME)).toEqual([{ key: "0,0", x: "1·2", y: "0·9" }]);
  });

  it("lands across the top first, then down the side", () => {
    const order = landingOrder(3);
    expect(order).toEqual([
      { axis: "x", index: 0 },
      { axis: "x", index: 1 },
      { axis: "x", index: 2 },
      { axis: "y", index: 0 },
      { axis: "y", index: 1 },
      { axis: "y", index: 2 },
    ]);
  });
});
