import { describe, expect, it } from "vitest";
import { validatePrizeNote } from "../../../shared/formats";
import type { GameState, GameStatus, Player } from "../../../shared/types";
import {
  boardCode,
  boardStats,
  codeGroups,
  defaultLook,
  displayLink,
  headlinePrize,
  hostOf,
  inviteMessage,
  isUrgent,
  newArrivals,
  joinLabel,
  matchupLabel,
  matchupSize,
  nameClash,
  nameIsMatchup,
  nameProblem,
  peopleInOrder,
  playersInLabel,
  shuffleLook,
  spelledCode,
  squaresLeftLabel,
  winnersLine,
} from "./inviteModel";

const player = (id: string, name: string, extra: Partial<Player> = {}): Player => ({
  id,
  name,
  color: "#ff6b35",
  emoji: "🔥",
  joinedAt: 0,
  isHost: false,
  ...extra,
});

function makeState(over: { status?: GameStatus; claimed?: number; players?: Player[]; prizes?: Record<string, string> } = {}): GameState {
  const players = over.players ?? [player("host", "Jordan", { isHost: true }), player("p2", "Maya", { joinedAt: 5 })];
  return {
    game: {
      id: "k7mq2x",
      name: "Sunday Night Squares",
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
      prizes: over.prizes ?? {},
      maxPerPlayer: 0,
      numbers: null,
      status: over.status ?? "open",
      linkedEvent: null,
      hostPlayerId: "host",
      createdAt: 0,
      lockedAt: null,
    },
    players,
    squares: Array.from({ length: over.claimed ?? 0 }, (_, i) => ({
      row: Math.floor(i / 10),
      col: i % 10,
      playerId: "p2",
      claimedAt: 0,
    })),
    scores: [],
    manualWinners: [],
    live: null,
    activity: [],
    version: 1,
  };
}

describe("codes and links", () => {
  it("shows the id as an uppercase code in two groups", () => {
    expect(boardCode("k7mq2x")).toBe("K7MQ2X");
    expect(codeGroups("k7mq2x")).toEqual(["K7M", "Q2X"]);
    expect(codeGroups("abc")).toEqual(["ABC"]);
    expect(spelledCode("k7m")).toBe("K 7 M");
  });

  it("strips the scheme from links", () => {
    expect(displayLink("https://jaxsquares.com/g/k7mq2x")).toBe("jaxsquares.com/g/k7mq2x");
    expect(displayLink("http://127.0.0.1:5202/g/abc/")).toBe("127.0.0.1:5202/g/abc");
  });

  it("spots board names that only repeat the matchup", () => {
    const { game } = makeState();
    expect(nameIsMatchup(game)).toBe(false);
    expect(nameIsMatchup({ ...game, name: "Chiefs vs. Bills" })).toBe(true);
    expect(nameIsMatchup({ ...game, name: "bills at chiefs" })).toBe(true);
  });

  it("steps the matchup size down for long team names", () => {
    const { game } = makeState();
    expect(matchupSize(game)).toBe("lg");
    expect(matchupSize({ teamX: { name: "Cowboys" }, teamY: { name: "Commanders" } })).toBe("md");
    expect(matchupSize({ teamX: { name: "San Francisco 49ers" }, teamY: { name: "Philadelphia Eagles" } })).toBe("sm");
  });

  it("names the matchup X first, falling back to the board name", () => {
    const { game } = makeState();
    expect(matchupLabel(game)).toBe("Chiefs vs Bills");
    expect(matchupLabel({ ...game, teamY: { name: " " } })).toBe("Sunday Night Squares");
  });
});

describe("inviteMessage", () => {
  it("speaks as the host or as a player", () => {
    const s = makeState();
    expect(inviteMessage(s, "host")).toBe("Grab a square on my Chiefs vs Bills board 🏈");
    expect(inviteMessage(s, "p2")).toBe("Grab a square on our Chiefs vs Bills board 🏈");
    expect(inviteMessage(s, null)).toBe("Grab a square on our Chiefs vs Bills board 🏈");
  });

  it("adds urgency when the board is nearly full", () => {
    expect(inviteMessage(makeState({ claimed: 92 }), "host")).toBe("Grab a square on my Chiefs vs Bills board 🏈 Only 8 left!");
    expect(inviteMessage(makeState({ claimed: 100 }), "host")).toBe("Follow my Chiefs vs Bills board live with us 🏈");
  });

  it("switches to following once numbers are drawn or the game is over", () => {
    expect(inviteMessage(makeState({ status: "locked" }), "host")).toMatch(/^Numbers are drawn/);
    expect(inviteMessage(makeState({ status: "final" }), "p2")).toBe("See who won our Chiefs vs Bills board 🏆");
  });

  it("never uses money or betting words", () => {
    for (const status of ["open", "locked", "final"] as const) {
      for (const claimed of [0, 95, 100]) {
        for (const viewer of ["host", "p2", null]) {
          expect(validatePrizeNote(inviteMessage(makeState({ status, claimed }), viewer))).toBeNull();
        }
      }
    }
  });
});

describe("social proof", () => {
  it("counts squares and players", () => {
    expect(boardStats(makeState({ claimed: 58 }))).toEqual({ total: 100, claimed: 58, left: 42, players: 2 });
    expect(squaresLeftLabel(42)).toBe("42 squares left");
    expect(squaresLeftLabel(1)).toBe("1 square left");
    expect(squaresLeftLabel(0)).toBe("Board's full");
    expect(playersInLabel(1)).toBe("1 player in");
    expect(playersInLabel(6)).toBe("6 players in");
  });

  it("explains how squares win", () => {
    expect(winnersLine("quarters")).toBe("A winner every quarter");
    expect(winnersLine("halves")).toBe("Winners at halftime and the final");
    expect(winnersLine("final")).toBe("One winner, at the final score");
    expect(winnersLine("every-score")).toBe("A winner every time the score changes");
  });

  it("flags a nearly full board", () => {
    expect(isUrgent(42, 100)).toBe(false);
    expect(isUrgent(10, 100)).toBe(true);
    expect(isUrgent(0, 100)).toBe(false);
    expect(isUrgent(3, 25)).toBe(true);
    expect(isUrgent(4, 25)).toBe(false);
  });

  it("finds players who arrived since we last looked, newest first", () => {
    const players = [player("a", "A", { joinedAt: 1 }), player("b", "B", { joinedAt: 3 }), player("c", "C", { joinedAt: 2 })];
    expect(newArrivals(new Set(["a"]), players).map((p) => p.id)).toEqual(["b", "c"]);
    expect(newArrivals(new Set(["a", "b", "c"]), players)).toEqual([]);
  });

  it("finds the host and puts them first, then the newest joiners", () => {
    const players = [
      player("a", "Dre", { joinedAt: 1 }),
      player("host", "Jordan", { joinedAt: 0 }),
      player("b", "Priya", { joinedAt: 9 }),
    ];
    const s = makeState({ players });
    expect(hostOf(s)?.name).toBe("Jordan");
    expect(peopleInOrder(s).map((p) => p.name)).toEqual(["Jordan", "Priya", "Dre"]);
    expect(hostOf(makeState({ players: [] }))).toBeNull();
  });

  it("picks the first prize note in period order", () => {
    expect(headlinePrize(makeState().game)).toBeNull();
    expect(headlinePrize(makeState({ prizes: { final: "Bragging rights", q1: "Loser buys wings" } }).game)).toEqual({
      label: "Q1",
      note: "Loser buys wings",
    });
    expect(headlinePrize(makeState({ prizes: { "*": "Winner picks the music" } }).game)).toEqual({
      label: null,
      note: "Winner picks the music",
    });
  });
});

describe("join", () => {
  it("labels the button by what will happen", () => {
    expect(joinLabel("open")).toBe("Join & claim");
    expect(joinLabel("open", 0)).toBe("Join the board");
    expect(joinLabel("open", 1)).toBe("Join & claim my square");
    expect(joinLabel("open", 3)).toBe("Join & claim 3 squares");
    expect(joinLabel("locked", 2)).toBe("Join to follow along");
    expect(joinLabel("final")).toBe("Join to follow along");
  });

  it("requires a name and hints at clashes", () => {
    expect(nameProblem("  ")).not.toBeNull();
    expect(nameProblem("Sam")).toBeNull();
    const players = [player("a", "Sam"), player("me", "Jo")];
    expect(nameClash("sam ", players, "me")).toBe("There's already a Sam here. Add an initial?");
    expect(nameClash("Jo", players, "me")).toBeNull();
    expect(nameClash("", players, "me")).toBeNull();
  });

  const colors = ["#111111", "#222222", "#333333"];
  const emojis = ["🏈", "🔥", "⚡"];

  it("keeps a returning player's look", () => {
    const look = { color: "#222222", emoji: "🔥" };
    const taken = [player("x", "X", { color: "#222222", emoji: "🔥" })];
    expect(defaultLook(look, taken, { returning: true, myId: "me", colors, emojis })).toEqual(look);
  });

  it("gives a newcomer a color and emoji nobody on the board has", () => {
    const taken = [player("x", "X", { color: "#222222", emoji: "🔥" }), player("y", "Y", { color: "#333333", emoji: "🏈" })];
    expect(defaultLook({ color: "#222222", emoji: "🔥" }, taken, { returning: false, myId: "me", colors, emojis })).toEqual({
      color: "#111111",
      emoji: "⚡",
    });
    // Their own earlier row doesn't count as taken.
    const mine = [player("me", "Me", { color: "#222222", emoji: "🔥" })];
    expect(defaultLook({ color: "#222222", emoji: "🔥" }, mine, { returning: false, myId: "me", colors, emojis })).toEqual({
      color: "#222222",
      emoji: "🔥",
    });
  });

  it("never defaults to an avoided color", () => {
    expect(
      defaultLook({ color: "#333333", emoji: "🏈" }, [], { returning: false, myId: null, colors, emojis, avoidColors: ["#333333"] }).color,
    ).toBe("#111111");
  });

  it("allows duplicates once the palette is used up", () => {
    const taken = colors.map((c, i) => player(`p${i}`, "P", { color: c, emoji: emojis[i] }));
    expect(defaultLook({ color: "#111111", emoji: "🏈" }, taken, { returning: false, myId: null, colors, emojis })).toEqual({
      color: "#111111",
      emoji: "🏈",
    });
  });

  it("shuffles to a different look", () => {
    const next = shuffleLook({ color: "#111111", emoji: "🏈" }, colors, emojis, () => 0.99);
    expect(next.color).not.toBe("#111111");
    expect(next.emoji).not.toBe("🏈");
  });
});
