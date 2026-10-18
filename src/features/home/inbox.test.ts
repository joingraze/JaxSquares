import { describe, expect, it } from "vitest";
import type { Activity, GameState, GameSummary, NumberDraw } from "../../../shared/types";
import { buildInbox, INBOX_MAX_AGE_MS, unreadCount } from "./inbox";

const ME = "me-public-id-000000000";
const MAYA = "maya-public-id-0000000";
const DRE = "dre-public-id-00000000";
const NOW = 100 * INBOX_MAX_AGE_MS;

const IDENTITY: NumberDraw = {
  x: Array.from({ length: 10 }, (_, i) => [i]),
  y: Array.from({ length: 10 }, (_, i) => [i]),
};

function summary(over: Partial<GameSummary> = {}): GameSummary {
  return {
    id: "g1",
    name: "Monday Night Mayhem",
    sport: "football",
    teamX: { name: "Seahawks", abbr: "SEA" },
    teamY: { name: "Cardinals", abbr: "ARI" },
    status: "open",
    format: { periods: "quarters", reverse: false, boardSize: 100, freshNumbers: false },
    isHost: true,
    joined: true,
    host: null,
    mySquares: 0,
    claimed: 0,
    totalSquares: 100,
    playerCount: 3,
    live: null,
    startsAt: null,
    myWins: [],
    lastActivityAt: NOW,
    createdAt: 1,
    ...over,
  };
}

let n = 0;
const act = (over: Partial<Activity>): Activity => ({ id: `a${++n}`, type: "claimed", at: NOW - 1000, actor: MAYA, data: { count: 1 }, ...over });

function state(over: Partial<GameState> & { status?: GameState["game"]["status"]; numbers?: boolean } = {}): GameState {
  const { status = "open", numbers = false, ...rest } = over;
  return {
    game: {
      id: "g1",
      name: "Monday Night Mayhem",
      sport: "football",
      league: "custom",
      teamX: { name: "Seahawks", abbr: "SEA" },
      teamY: { name: "Cardinals", abbr: "ARI" },
      format: { periods: "quarters", reverse: false, boardSize: 100, freshNumbers: false },
      periods: [
        { key: "q1", label: "Q1" },
        { key: "q2", label: "Half" },
        { key: "q3", label: "Q3" },
        { key: "final", label: "Final" },
      ],
      prizes: { q2: "Loser buys wings" },
      maxPerPlayer: 0,
      numbers: numbers ? { "*": IDENTITY } : null,
      status,
      linkedEvent: null,
      hostPlayerId: ME,
      createdAt: 1,
      lockedAt: null,
    },
    players: [
      { id: ME, name: "Jordan", color: "#38b6ff", emoji: "🏈", joinedAt: 1, isHost: true },
      { id: MAYA, name: "Maya", color: "#ff6b6b", emoji: "🦊", joinedAt: 2, isHost: false },
      { id: DRE, name: "Dre", color: "#4dabf7", emoji: "🐻", joinedAt: 3, isHost: false },
    ],
    squares: [],
    scores: [],
    manualWinners: [],
    live: null,
    activity: [],
    version: 1,
    ...rest,
  };
}

describe("buildInbox", () => {
  it("adds up a friend's grabs on your board into one line", () => {
    const s = state({
      activity: [
        act({ at: NOW - 100 }),
        act({ at: NOW - 200, actor: ME }), // my own grab in between doesn't split Maya's run
        act({ at: NOW - 300, data: { count: 4 } }),
        act({ at: NOW - 400, type: "joined", data: { name: "Maya" } }),
        act({ at: NOW - 500, actor: DRE, type: "joined", data: { name: "Dre" } }),
      ],
    });
    const items = buildInbox([summary()], { g1: s }, ME, NOW);
    expect(items.map((i) => i.text)).toEqual(["Maya joined and grabbed 5 squares", "Dre joined"]);
    expect(items[0]).toMatchObject({ tone: "social", board: "Monday Night Mayhem", href: "/g/g1", player: { name: "Maya" } });
  });

  it("leaves other people's grabs out on boards you only play on, and once numbers are drawn", () => {
    const s = state({ activity: [act({}), act({ type: "joined", data: { name: "Maya" } })] });
    expect(buildInbox([summary({ isHost: false })], { g1: s }, ME, NOW)).toEqual([]);
    const locked = state({ status: "locked", numbers: true, activity: [act({}), act({ type: "joined", data: { name: "Maya" } })] });
    expect(buildInbox([summary({ status: "locked" })], { g1: locked }, ME, NOW)).toEqual([]);
  });

  it("keeps only the newest few social rows per board", () => {
    const friends = Array.from({ length: 8 }, (_, i) => ({ id: `friend-${i}-public-id-000`.slice(0, 22), name: `F${i}`, color: "#ff6b6b", emoji: "🦊", joinedAt: 2, isHost: false }));
    const s = state({ players: friends, activity: friends.map((f, i) => act({ actor: f.id, at: NOW - 100 * (i + 1) })) });
    expect(buildInbox([summary()], { g1: s }, ME, NOW).map((i) => i.text)).toEqual([
      "F0 grabbed a square",
      "F1 grabbed a square",
      "F2 grabbed a square",
      "F3 grabbed a square",
    ]);
  });

  it("says when your square hit, in plain words with the specifics", () => {
    const s = state({
      status: "locked",
      numbers: true,
      squares: [{ row: 6, col: 2, playerId: ME, claimedAt: 1 }],
      scores: [{ periodKey: "q2", scoreX: 22, scoreY: 26, source: "host", updatedAt: 1 }],
      activity: [act({ type: "winner", actor: null, data: { periodKey: "q2", label: "Half", playerIds: [ME], prize: "Loser buys wings" } })],
    });
    const [item] = buildInbox([summary({ status: "locked" })], { g1: s }, ME, NOW);
    expect(item).toMatchObject({ tone: "win", text: "Your square hit at halftime", detail: "SEA 22–26 ARI · Loser buys wings" });
  });

  it("names other winners, numbers drawn and finals", () => {
    const s = state({
      status: "final",
      numbers: true,
      squares: [
        { row: 3, col: 7, playerId: MAYA, claimedAt: 1 },
        { row: 0, col: 0, playerId: ME, claimedAt: 1 },
      ],
      scores: [{ periodKey: "q1", scoreX: 7, scoreY: 3, source: "host", updatedAt: 1 }],
      activity: [
        act({ at: NOW - 100, type: "final", actor: DRE, data: {} }),
        act({ at: NOW - 200, type: "winner", actor: null, data: { periodKey: "q1", label: "Q1", playerIds: [MAYA] } }),
        act({ at: NOW - 300, type: "locked", actor: DRE, data: {} }),
      ],
    });
    const items = buildInbox([summary({ isHost: false, status: "final" })], { g1: s }, ME, NOW);
    expect(items.map((i) => [i.text, i.detail])).toEqual([
      ["That's final", "SEA 7–3 ARI"],
      ["Maya hit at the end of Q1", "SEA 7–3 ARI"],
      ["Numbers are in", "Find your square"],
    ]);
  });

  it("puts a full board's draw on the to-do list, linked straight to the draw", () => {
    const squares = Array.from({ length: 100 }, (_, i) => ({ row: Math.floor(i / 10), col: i % 10, playerId: MAYA, claimedAt: 1 }));
    const s = state({ squares, activity: [act({ at: NOW - 50, data: { count: 100 } })] });
    const items = buildInbox([summary({ claimed: 100 })], { g1: s }, ME, NOW);
    expect(items.find((i) => i.tone === "todo")).toMatchObject({ text: "Your board is full", href: "/g/g1?draw=1", at: NOW - 50 });
  });

  it("drops old news and counts what's unread", () => {
    const s = state({ activity: [act({ at: NOW - 10 }), act({ at: NOW - INBOX_MAX_AGE_MS - 1, actor: DRE })] });
    const items = buildInbox([summary()], { g1: s }, ME, NOW);
    expect(items).toHaveLength(1);
    expect(unreadCount(items, NOW - 100)).toBe(1);
    expect(unreadCount(items, NOW)).toBe(0);
  });
});
