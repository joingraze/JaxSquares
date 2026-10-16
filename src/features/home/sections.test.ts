import { describe, expect, it } from "vitest";
import type { Game, GameState, GameSummary, NumberDraw, Player } from "../../../shared/types";
import { BUZZ_WINDOW_MS, finalSummary, groupBoards, headlineFor, hostAction, latestBuzz, liveSnapshot, primaryActionId, sectionOf } from "./sections";

const ME = "me-public-id-000000000";
const MAYA = "maya-public-id-0000000";

function summary(over: Partial<GameSummary> = {}): GameSummary {
  return {
    id: "g1",
    name: "Board",
    sport: "football",
    teamX: { name: "Chiefs", abbr: "KC" },
    teamY: { name: "Bills", abbr: "BUF" },
    status: "open",
    format: { periods: "quarters", reverse: false, boardSize: 100, freshNumbers: false },
    isHost: false,
    mySquares: 0,
    claimed: 0,
    totalSquares: 100,
    playerCount: 1,
    live: null,
    startsAt: null,
    myWins: [],
    lastActivityAt: 1,
    createdAt: 1,
    ...over,
  };
}

/** Identity draw: column c has digit c, row r has digit r. */
const IDENTITY: NumberDraw = {
  x: Array.from({ length: 10 }, (_, i) => [i]),
  y: Array.from({ length: 10 }, (_, i) => [i]),
};

function player(id: string, name: string): Player {
  return { id, name, color: "#ff6b35", emoji: "🦊", joinedAt: 1, isHost: false };
}

function state(over: Omit<Partial<GameState>, "game"> & { game?: Partial<Game> } = {}): GameState {
  const { game, ...rest } = over;
  return {
    game: {
      id: "g1",
      name: "Board",
      sport: "football",
      league: "custom",
      teamX: { name: "Chiefs" },
      teamY: { name: "Bills" },
      format: { periods: "quarters", reverse: false, boardSize: 100, freshNumbers: false },
      periods: [
        { key: "q1", label: "Q1" },
        { key: "q2", label: "Half" },
        { key: "q3", label: "Q3" },
        { key: "final", label: "Final" },
      ],
      prizes: {},
      maxPerPlayer: 0,
      numbers: { "*": IDENTITY },
      status: "locked",
      linkedEvent: null,
      hostPlayerId: MAYA,
      createdAt: 1,
      lockedAt: 2,
      ...game,
    },
    players: [player(ME, "Jordan"), player(MAYA, "Maya")],
    // I own (row 3, col 7); Maya owns (row 0, col 4).
    squares: [
      { row: 3, col: 7, playerId: ME, claimedAt: 1 },
      { row: 0, col: 4, playerId: MAYA, claimedAt: 1 },
    ],
    scores: [],
    manualWinners: [],
    live: null,
    activity: [],
    version: 1,
    ...rest,
  };
}

describe("sectionOf / hostAction", () => {
  it("puts boards where they need attention", () => {
    expect(sectionOf(summary({ status: "final" }))).toBe("final");
    expect(sectionOf(summary({ status: "locked" }))).toBe("live");
    expect(sectionOf(summary({ status: "open", isHost: true }))).toBe("needs");
    expect(sectionOf(summary({ status: "draft", isHost: true }))).toBe("needs");
    expect(sectionOf(summary({ status: "open" }))).toBe("next");
    const live = { state: "in" as const, period: 1, clock: "9:00", detail: "Q1 9:00", scoreX: 0, scoreY: 0, updatedAt: 1 };
    expect(sectionOf(summary({ status: "open", isHost: true, live }))).toBe("live");
  });

  it("asks the host for the right next step", () => {
    expect(hostAction(summary({ status: "draft" }))).toBe("finish-setup");
    expect(hostAction(summary({ claimed: 100 }))).toBe("lock");
    expect(hostAction(summary({ claimed: 25, totalSquares: 25 }))).toBe("lock");
    expect(hostAction(summary({ claimed: 58 }))).toBe("invite");
  });
});

describe("groupBoards", () => {
  it("orders host to-dos by urgency and upcoming boards by kickoff", () => {
    const s = groupBoards([
      summary({ id: "draft", isHost: true, status: "draft" }),
      summary({ id: "fill", isHost: true, claimed: 40 }),
      summary({ id: "full", isHost: true, claimed: 100 }),
      summary({ id: "later", startsAt: 3000 }),
      summary({ id: "tbd", startsAt: null }),
      summary({ id: "soon", startsAt: 2000 }),
      summary({ id: "old-final", status: "final", lastActivityAt: 1 }),
      summary({ id: "new-final", status: "final", lastActivityAt: 9 }),
    ]);
    expect(s.needs.map((g) => g.id)).toEqual(["full", "fill", "draft"]);
    expect(s.next.map((g) => g.id)).toEqual(["soon", "later", "tbd"]);
    expect(s.final.map((g) => g.id)).toEqual(["new-final", "old-final"]);
    expect(s.live).toEqual([]);
  });

  it("gives the filled button to one card only", () => {
    const withTodo = groupBoards([summary({ id: "fill", isHost: true, claimed: 3 }), summary({ id: "pick" })]);
    expect(primaryActionId(withTodo)).toBe("fill");
    const players = groupBoards([summary({ id: "mine", mySquares: 4 }), summary({ id: "pick" })]);
    expect(primaryActionId(players)).toBe("pick");
    expect(primaryActionId(groupBoards([summary({ id: "full", claimed: 100 })]))).toBeNull();
  });
});

describe("liveSnapshot", () => {
  it("is null before numbers are drawn", () => {
    expect(liveSnapshot(state({ game: { numbers: null, status: "open" } }), ME)).toBeNull();
  });

  it("waits for the first score once numbers are in", () => {
    const snap = liveSnapshot(state(), ME)!;
    expect(snap.hasScore).toBe(false);
    expect(snap.clock).toBe("Numbers drawn");
    expect(snap.leader).toBeNull();
    expect(snap.nextLabel).toBe("Q1");
  });

  it("names the latest period winner on boards without a live feed", () => {
    const snap = liveSnapshot(
      state({
        scores: [
          { periodKey: "q1", scoreX: 7, scoreY: 3, source: "host", updatedAt: 1 },
          { periodKey: "q2", scoreX: 14, scoreY: 10, source: "host", updatedAt: 2 },
        ],
      }),
      ME,
    )!;
    expect(snap).toMatchObject({ scoreX: 14, scoreY: 10, clock: "Halftime", nextLabel: "Q3", meWinning: false, inProgress: false });
    // 14-10 -> col 4, row 0 -> Maya
    expect(snap.leader).toMatchObject({ playerId: MAYA, kind: "last", periodLabel: "Half", digits: [4, 0] });
    expect(snap.leader?.player?.name).toBe("Maya");
  });

  it("says when I'm holding the square the live score points at", () => {
    const snap = liveSnapshot(
      state({ live: { state: "in", period: 3, clock: "4:12", detail: "Q3 4:12", scoreX: 17, scoreY: 13, updatedAt: 1 } }),
      ME,
    )!;
    expect(snap).toMatchObject({ scoreX: 17, scoreY: 13, inProgress: true, clock: "Q3 4:12", meWinning: true });
    expect(snap.leader).toMatchObject({ playerId: ME, kind: "now", periodLabel: "Q3", digits: [7, 3] });
  });

  it("counts the reverse square as winning", () => {
    const snap = liveSnapshot(
      state({
        game: { format: { periods: "quarters", reverse: true, boardSize: 100, freshNumbers: false } },
        live: { state: "in", period: 2, clock: "1:00", detail: "Q2 1:00", scoreX: 3, scoreY: 7, updatedAt: 1 },
      }),
      ME,
    )!;
    // Regular square (row 7, col 3) is empty; reverse (row 3, col 7) is mine.
    expect(snap.leader?.playerId).toBeNull();
    expect(snap.meWinning).toBe(true);
  });
});

describe("finalSummary", () => {
  it("reports the final score and winners, most wins first", () => {
    const f = finalSummary(
      state({
        game: { status: "final" },
        scores: [
          { periodKey: "q1", scoreX: 7, scoreY: 3, source: "host", updatedAt: 1 },
          { periodKey: "q2", scoreX: 14, scoreY: 10, source: "host", updatedAt: 1 },
          { periodKey: "final", scoreX: 27, scoreY: 23, source: "host", updatedAt: 1 },
        ],
      }),
    );
    expect(f.scoreX).toBe(27);
    expect(f.scoreY).toBe(23);
    expect(f.winners.map((w) => [w.player.name, w.wins])).toEqual([
      ["Jordan", 2],
      ["Maya", 1],
    ]);
  });
});

describe("headlineFor", () => {
  const now = 0;
  it("leads with your winning square, then live games, then host to-dos", () => {
    const live = groupBoards([summary({ id: "a", status: "locked" }), summary({ id: "b", status: "locked" })]);
    expect(headlineFor(live, { winning: { kind: "now", periodLabel: "Q3" }, now })).toMatchObject({ hot: "winning right now.", tone: "win" });
    expect(headlineFor(live, { winning: { kind: "last", periodLabel: "Q1" }, now })).toMatchObject({ lead: "You won", hot: "Q1!" });
    expect(headlineFor(live, { winning: null, now })).toMatchObject({ lead: "2 games", tone: "live" });
    const full = groupBoards([summary({ isHost: true, claimed: 100 })]);
    expect(headlineFor(full, { winning: null, now }).hot).toBe("Draw the numbers.");
    expect(headlineFor(groupBoards([summary({ isHost: true, claimed: 3 })]), { winning: null, now }).hot).toBe("Invite the crew.");
    expect(headlineFor(groupBoards([summary({})]), { winning: null, now }).hot).toBe("Grab yours.");
    const kickoff = groupBoards([summary({ mySquares: 4, startsAt: now + 3 * 3600_000 })]);
    expect(headlineFor(kickoff, { winning: null, now })).toMatchObject({ lead: "Kickoff in", hot: "3h 0m." });
    expect(headlineFor(groupBoards([summary({ mySquares: 4 })]), { winning: null, now }).hot).toBe("Now we wait.");
    const done = groupBoards([summary({ status: "final" })]);
    expect(headlineFor(done, { winning: null, now }).hot).toBe("Run it back?");
  });
});

describe("latestBuzz", () => {
  const now = 10 * BUZZ_WINDOW_MS;
  const act = (over: Partial<GameState["activity"][number]>) => ({ id: Math.random().toString(), type: "claimed" as const, at: now - 1000, actor: MAYA, data: { count: 3 }, ...over });

  it("shows the freshest thing a friend did", () => {
    const s = state({ game: { status: "open", numbers: null }, activity: [act({ actor: ME }), act({}), act({ type: "joined", data: { name: "Maya" } })] });
    expect(latestBuzz(s, ME, now)).toMatchObject({ text: "Maya grabbed 3 squares", player: { name: "Maya" } });
    const one = state({ activity: [act({ data: { count: 1 } })] });
    expect(latestBuzz(one, ME, now)?.text).toBe("Maya grabbed a square");
    const joined = state({ activity: [act({ type: "joined", data: { name: "Maya" } })] });
    expect(latestBuzz(joined, ME, now)?.text).toBe("Maya joined");
  });

  it("ignores my own moves, system events and old news", () => {
    expect(latestBuzz(state({ activity: [act({ actor: ME })] }), ME, now)).toBeNull();
    expect(latestBuzz(state({ activity: [act({ actor: null, type: "locked", data: {} })] }), ME, now)).toBeNull();
    expect(latestBuzz(state({ activity: [act({ at: now - BUZZ_WINDOW_MS - 1 })] }), ME, now)).toBeNull();
  });
});
