import { describe, expect, it } from "vitest";
import type { Game, GameState, GameSummary, NumberDraw, Player } from "../../../shared/types";
import {
  actionFor,
  boardBuzz,
  BURST_MS,
  BUZZ_WINDOW_MS,
  capitalize,
  cardModel,
  finalSummary,
  groupBoards,
  headlineFor,
  homeBoards,
  hostAction,
  inviteModel,
  liveHits,
  liveSnapshot,
  phraseOf,
  primaryActionId,
  relationOf,
  sectionOf,
  withState,
} from "./sections";

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
    joined: true,
    host: null,
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

describe("sectionOf / hostAction / actionFor", () => {
  it("puts host to-dos under Needs you and boards waiting on my picks under Invites", () => {
    expect(sectionOf(summary({ status: "final" }))).toBe("final");
    expect(sectionOf(summary({ status: "locked" }))).toBe("live");
    expect(sectionOf(summary({ status: "open", isHost: true }))).toBe("needs");
    expect(sectionOf(summary({ status: "draft", isHost: true }))).toBe("needs");
    // A friend's board with open squares and none of them mine: an invite, joined or only opened.
    expect(sectionOf(summary({ status: "open" }))).toBe("invites");
    expect(sectionOf(summary({ status: "open", joined: false }))).toBe("invites");
    expect(actionFor(summary({ status: "open" }))).toBe("pick");
    // Already playing, or nothing left to pick: just waiting.
    expect(sectionOf(summary({ status: "open", mySquares: 3 }))).toBe("next");
    expect(sectionOf(summary({ status: "open", claimed: 100 }))).toBe("next");
    // My own board is never an invite, even before I pick.
    expect(sectionOf(summary({ status: "open", isHost: true, claimed: 3 }))).toBe("needs");
    const live = { state: "in" as const, period: 1, clock: "9:00", detail: "Q1 9:00", scoreX: 0, scoreY: 0, updatedAt: 1 };
    expect(sectionOf(summary({ status: "open", isHost: true, live }))).toBe("live");
    expect(actionFor(summary({ status: "open", isHost: true, live }))).toBeNull();
  });

  it("asks the host for the right next step", () => {
    expect(hostAction(summary({ status: "draft" }))).toBe("finish-setup");
    expect(hostAction(summary({ claimed: 100 }))).toBe("lock");
    expect(hostAction(summary({ claimed: 25, totalSquares: 25 }))).toBe("lock");
    expect(hostAction(summary({ claimed: 58 }))).toBe("invite");
    // Nearly full counts, same as the host bar: 90% claimed, or last call on a 5x5.
    expect(hostAction(summary({ claimed: 89 }))).toBe("invite");
    expect(hostAction(summary({ claimed: 92 }))).toBe("lock");
    expect(hostAction(summary({ claimed: 22, totalSquares: 25 }))).toBe("lock");
  });
});

describe("groupBoards", () => {
  it("orders to-dos by urgency, invites and upcoming boards by kickoff", () => {
    const s = groupBoards([
      summary({ id: "draft", isHost: true, status: "draft" }),
      summary({ id: "fill", isHost: true, claimed: 40 }),
      summary({ id: "full", isHost: true, claimed: 100 }),
      summary({ id: "pick", claimed: 10 }),
      summary({ id: "opened", joined: false, claimed: 10, startsAt: 2500 }),
      summary({ id: "later", mySquares: 2, startsAt: 3000 }),
      summary({ id: "tbd", mySquares: 2, startsAt: null }),
      summary({ id: "soon", mySquares: 2, startsAt: 2000 }),
      summary({ id: "old-final", status: "final", lastActivityAt: 1 }),
      summary({ id: "new-final", status: "final", lastActivityAt: 9 }),
    ]);
    // Picking moved out of Needs you: it's for host to-dos only.
    expect(s.needs.map((g) => g.id)).toEqual(["full", "fill", "draft"]);
    expect(s.invites.map((g) => g.id)).toEqual(["opened", "pick"]);
    expect(s.next.map((g) => g.id)).toEqual(["soon", "later", "tbd"]);
    expect(s.final.map((g) => g.id)).toEqual(["new-final", "old-final"]);
    expect(s.live).toEqual([]);
  });

  it("gives the filled button to the single most urgent action, whatever it is", () => {
    expect(primaryActionId(groupBoards([summary({ id: "fill", isHost: true, claimed: 3 }), summary({ id: "full", isHost: true, claimed: 100 })]))).toBe("full");
    expect(primaryActionId(groupBoards([summary({ id: "mine", mySquares: 4 }), summary({ id: "pick" })]))).toBe("pick");
    // A full board waiting on my draw beats an invite; an invite beats inviting more to mine.
    expect(primaryActionId(groupBoards([summary({ id: "pick" }), summary({ id: "full", isHost: true, claimed: 100 })]))).toBe("full");
    expect(primaryActionId(groupBoards([summary({ id: "fill", isHost: true, claimed: 3 }), summary({ id: "pick", joined: false })]))).toBe("pick");
    expect(primaryActionId(groupBoards([summary({ id: "draft", isHost: true, status: "draft" })]))).toBe("draft");
    expect(primaryActionId(groupBoards([summary({ id: "full", claimed: 100 })]))).toBeNull();
  });
});

describe("invites vs boards I'm playing", () => {
  const live = { state: "in" as const, period: 2, clock: "4:12", detail: "Q2 4:12", scoreX: 7, scoreY: 3, updatedAt: 1 };

  it("tells host, playing, invited and watching apart", () => {
    expect(relationOf(summary({ isHost: true }))).toBe("host");
    expect(relationOf(summary({ mySquares: 15 }))).toBe("playing");
    expect(relationOf(summary({ joined: false }))).toBe("invited");
    expect(relationOf(summary({ joined: true }))).toBe("invited");
    expect(relationOf(summary({ claimed: 100 }))).toBe("watching");
    expect(relationOf(summary({ status: "locked" }))).toBe("watching");
  });

  it("lists every open, not-full board where I have no squares under Invites, opened or joined", () => {
    const s = groupBoards([
      summary({ id: "opened", joined: false, claimed: 58 }),
      summary({ id: "joined", joined: true, claimed: 12 }),
      summary({ id: "playing", mySquares: 15, claimed: 40 }),
      summary({ id: "full", joined: false, claimed: 100 }),
    ]);
    expect(s.invites.map((g) => g.id).sort()).toEqual(["joined", "opened"]);
    expect(s.next.map((g) => g.id).sort()).toEqual(["full", "playing"]);
    expect(s.needs).toEqual([]);
  });

  it("orders Invites and Up next by kickoff, custom boards' host-set times included (no set time last)", () => {
    const now = Date.now();
    // Custom boards (no linked game) carry the host's kickoff in startsAt, like a linked game's.
    const s = groupBoards([
      summary({ id: "invite-none", joined: false, startsAt: null, lastActivityAt: 9 }),
      summary({ id: "invite-sunday", joined: false, startsAt: now + 5 * 86_400_000 }),
      summary({ id: "invite-tonight", startsAt: now + 3 * 3_600_000 }),
      summary({ id: "next-none", mySquares: 3, startsAt: null, lastActivityAt: 9 }),
      summary({ id: "next-monday", mySquares: 3, startsAt: now + 6 * 86_400_000 }),
      summary({ id: "next-tomorrow", mySquares: 3, startsAt: now + 86_400_000 }),
    ]);
    expect(s.invites.map((g) => g.id)).toEqual(["invite-tonight", "invite-sunday", "invite-none"]);
    expect(s.next.map((g) => g.id)).toEqual(["next-tomorrow", "next-monday", "next-none"]);
    expect(cardModel(summary({ mySquares: 3, startsAt: now + 3 * 3_600_000 }), now).status).toBe("Kickoff in 3h 0m");
  });

  it("moves an invite I never picked on to Live once numbers are drawn or the game is on, tagged Watching", () => {
    const s = groupBoards([summary({ id: "drawn", status: "locked", joined: false }), summary({ id: "kicked", status: "open", live, claimed: 30 })]);
    expect(s.invites).toEqual([]);
    expect(s.live.map((g) => g.id).sort()).toEqual(["drawn", "kicked"]);
    expect(relationOf(s.live.find((g) => g.id === "drawn")!)).toBe("watching");
    expect(cardModel(summary({ claimed: 100 }), 0)).toMatchObject({ relation: "watching", role: "Watching", action: null });
  });

  it("keeps boards I'm on, and only the seen invites still open, on Home", () => {
    const games = [
      summary({ id: "mine", isHost: true, status: "draft" }),
      summary({ id: "joined-final", joined: true, status: "final" }),
      summary({ id: "seen-open", joined: false }),
      summary({ id: "seen-locked", joined: false, status: "locked" }),
      summary({ id: "seen-final", joined: false, status: "final" }),
      summary({ id: "seen-draft", joined: false, status: "draft" }),
      summary({ id: "hidden", joined: false }),
    ];
    const shown = homeBoards(games, ["seen-open", "seen-locked", "seen-final", "seen-draft"]).map((g) => g.id);
    // A never-joined board drops off once it's final; one I hid ("Not for me") is out of the seen list.
    expect(shown).toEqual(["mine", "joined-final", "seen-open", "seen-locked"]);
    // A joined board stays in Final (as "Watched" when I never picked).
    expect(groupBoards(homeBoards(games, [])).final.map((g) => g.id)).toEqual(["joined-final"]);
  });

  it("says who invited me, what's left and what a square goes for, and only offers to hide what I only opened", () => {
    const now = 1_000_000;
    const host = { id: MAYA, name: "Maya", color: "#ff6b35", emoji: "🦊" };
    const format = { periods: "quarters" as const, reverse: false, boardSize: 100 as const, freshNumbers: false, unit: "$" as const, squarePrice: 10 };
    const m = inviteModel(summary({ joined: false, host, claimed: 58, format, startsAt: now + 2 * 3600_000 }), now);
    expect(m).toMatchObject({ inviter: host, from: "Maya invited you", left: 42, matchup: "Chiefs vs Bills", canHide: true });
    expect(m.kickoff).toMatch(/^kicks off in 2h/);
    expect(m.lineup).toEqual({ fun: false, parts: ["$10 a square"] });
    const joined = inviteModel(summary({ joined: true, host: null }), now);
    expect(joined).toMatchObject({ from: "You're invited", canHide: false, kickoff: null, lineup: null });
    expect(inviteModel(summary({ format: { ...format, squarePrice: null, justForFun: true } }), now).lineup).toEqual({ fun: true, parts: [] });
  });

  it("shows my squares count on a board I'm playing instead of a quiet role", () => {
    expect(cardModel(summary({ mySquares: 15, claimed: 40 }), 0)).toMatchObject({ relation: "playing", role: "15 squares yours", meta: null });
    expect(cardModel(summary({ mySquares: 1, claimed: 40 }), 0).role).toBe("1 square yours");
  });
});

describe("cardModel", () => {
  const now = 1_000_000;
  it("labels the role quietly and keeps game state separate", () => {
    expect(cardModel(summary({ isHost: true, claimed: 58, mySquares: 10 }), now)).toMatchObject({
      role: "Your board",
      status: "42 left",
      statusIsLeft: true,
      meta: "10 yours",
      action: { kind: "invite", label: "Invite" },
      meter: true,
      buzz: true,
    });
    const kickoff = cardModel(summary({ mySquares: 9, claimed: 37, startsAt: now + 3 * 24 * 3600_000 }), now);
    expect(kickoff).toMatchObject({ relation: "playing", role: "9 squares yours", statusTone: "muted", meta: null, action: null, buzz: false });
    expect(kickoff.status).toMatch(/^Kickoff /);
  });

  it("asks for the right thing on each kind of board", () => {
    expect(cardModel(summary({ claimed: 84 }), now)).toMatchObject({ status: "16 left", action: { kind: "pick", label: "Pick squares" } });
    expect(cardModel(summary({ isHost: true, claimed: 100 }), now)).toMatchObject({ status: "Board's full", statusTone: "gold", action: { label: "Draw numbers" }, buzz: false });
    expect(cardModel(summary({ isHost: true, claimed: 92 }), now)).toMatchObject({ status: "8 left", statusIsLeft: true, statusTone: "gold", action: { label: "Draw numbers" } });
    expect(cardModel(summary({ isHost: true, status: "draft" }), now)).toMatchObject({ status: "Not open yet", action: { label: "Finish setup" }, meter: false });
    expect(cardModel(summary({ mySquares: 5, claimed: 100 }), now)).toMatchObject({ status: "Board's full", action: null });
  });
});

describe("withState", () => {
  it("lays a live board state over a stale summary", () => {
    const s = state({
      game: { status: "open", numbers: null },
      squares: [
        { row: 0, col: 0, playerId: ME, claimedAt: 1 },
        { row: 0, col: 1, playerId: MAYA, claimedAt: 2 },
        { row: 0, col: 2, playerId: MAYA, claimedAt: 3 },
      ],
      activity: [{ id: "a1", type: "claimed", at: 50, actor: MAYA, data: { count: 2 } }],
    });
    const g = withState(summary({ claimed: 0, mySquares: 0, playerCount: 1, lastActivityAt: 10 }), s, ME);
    expect(g).toMatchObject({ claimed: 3, mySquares: 1, playerCount: 2, status: "open", lastActivityAt: 50, latestScore: null, leaderPlayerId: null });
  });

  it("computes wins, the latest score and the leader like the server does", () => {
    const s = state({
      scores: [
        { periodKey: "q1", scoreX: 17, scoreY: 13, source: "host", updatedAt: 1 },
        { periodKey: "q2", scoreX: 14, scoreY: 10, source: "host", updatedAt: 2 },
      ],
    });
    // q1 17-13 -> col 7, row 3 -> me; q2 14-10 -> col 4, row 0 -> Maya
    const g = withState(summary({ status: "open" }), s, ME);
    expect(g.status).toBe("locked");
    expect(g.myWins).toEqual([{ periodKey: "q1", label: "Q1" }]);
    expect(g.latestScore).toEqual({ scoreX: 14, scoreY: 10, label: "Half" });
    expect(g.leaderPlayerId).toBe(MAYA);
  });

  it("keeps a custom board's host-set kickoff (and a linked one's event time)", () => {
    const at = Date.now() + 86_400_000;
    expect(withState(summary({ startsAt: at }), state({ game: { linkedEvent: null, startsAt: at } }), ME).startsAt).toBe(at);
    expect(withState(summary({ startsAt: at }), state({ game: { linkedEvent: null, startsAt: null } }), ME).startsAt).toBeNull();
    const linkedEvent = { provider: "espn" as const, league: "nfl" as const, eventId: "1", startsAt: at + 1, xIsHome: false };
    expect(withState(summary(), state({ game: { linkedEvent } }), ME).startsAt).toBe(at + 1);
  });

  it("doesn't call a postponed game Final (only a finished one)", () => {
    const postponed = { state: "post" as const, period: 0, clock: "0:00", detail: "Postponed", scoreX: 0, scoreY: 0, updatedAt: 1 };
    const s = state({ live: postponed });
    expect(withState(summary({ status: "locked" }), s, ME).latestScore).toEqual({ scoreX: 0, scoreY: 0, label: "Postponed" });
    expect(liveSnapshot(s, ME)?.clock).toBe("Postponed");
    const over = state({ game: { status: "final" }, live: { ...postponed, period: 4, detail: "", scoreX: 27, scoreY: 24 } });
    expect(withState(summary({ status: "locked" }), over, ME).latestScore).toEqual({ scoreX: 27, scoreY: 24, label: "Final" });
    expect(liveSnapshot(over, ME)?.clock).toBe("Final");
  });
});

describe("plain-language periods", () => {
  it("speaks the app's one vocabulary (periodPhrase), ignoring a reverse suffix", () => {
    expect(phraseOf("q2", "Half")).toEqual({ short: "Half", moment: "at halftime" });
    expect(phraseOf("q1", "Q1 (reverse)")).toEqual({ short: "Q1", moment: "at the end of Q1" });
    expect(phraseOf("final", "Final").moment).toBe("at the final whistle");
    expect(phraseOf("s2", "Score 2")).toEqual({ short: "Score 2", moment: "on score 2" });
    expect(capitalize("at halftime")).toBe("At halftime");
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
    expect(snap.nextMoment).toBe("at the end of Q1");
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
    expect(snap).toMatchObject({ scoreX: 14, scoreY: 10, clock: "Half", nextLabel: "Q3", nextMoment: "at the end of Q3", meWinning: false, inProgress: false });
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
  it("sums up the day: live games and your hits first, then to-dos, then kickoff", () => {
    const live = groupBoards([summary({ id: "a", status: "locked", mySquares: 4 }), summary({ id: "b", status: "locked", isHost: true })]);
    expect(headlineFor(live, { winningNow: true, hits: 0, now })).toMatchObject({ lead: "2 games live.", hot: "You're winning right now.", tone: "win" });
    expect(headlineFor(live, { winningNow: false, hits: 2, now })).toMatchObject({ lead: "2 games live.", hot: "You've hit twice.", tone: "win" });
    expect(headlineFor(live, { winningNow: false, hits: 0, now })).toMatchObject({ lead: "2 games", hot: "live right now.", tone: "live" });
    const one = groupBoards([summary({ status: "locked", mySquares: 4 })]);
    expect(headlineFor(one, { winningNow: false, hits: 1, now })).toMatchObject({ lead: "Your game is live.", hot: "You've hit once." });
    const full = groupBoards([summary({ isHost: true, claimed: 100 })]);
    expect(headlineFor(full, { winningNow: false, hits: 0, now }).hot).toBe("Draw the numbers.");
    const nearly = groupBoards([summary({ isHost: true, claimed: 93 })]);
    expect(headlineFor(nearly, { winningNow: false, hits: 0, now })).toMatchObject({ lead: "Almost full.", hot: "Draw the numbers." });
    expect(headlineFor(groupBoards([summary({ isHost: true, claimed: 3 })]), { winningNow: false, hits: 0, now }).hot).toBe("Invite the crew.");
    expect(headlineFor(groupBoards([summary({})]), { winningNow: false, hits: 0, now }).hot).toBe("Grab yours.");
    // The invite's host by name, or a count of boards waiting on my picks.
    const maya = { id: MAYA, name: "Maya", color: "#ff6b35", emoji: "🦊" };
    expect(headlineFor(groupBoards([summary({ joined: false, host: maya })]), { winningNow: false, hits: 0, now })).toMatchObject({
      lead: "Maya invited you.",
      hot: "Grab your squares.",
    });
    const two = groupBoards([summary({ id: "a", joined: false, host: maya }), summary({ id: "b" }), summary({ id: "mine", isHost: true, claimed: 3 })]);
    expect(headlineFor(two, { winningNow: false, hits: 0, now })).toMatchObject({ lead: "2 boards", hot: "waiting on your picks." });
    // A full board of mine waiting on the draw still comes first.
    const draw = groupBoards([summary({ id: "a" }), summary({ id: "full", isHost: true, claimed: 100 })]);
    expect(headlineFor(draw, { winningNow: false, hits: 0, now }).hot).toBe("Draw the numbers.");
    // A game I'm only watching isn't "my game", and doesn't beat my to-dos.
    const watching = groupBoards([summary({ id: "w", status: "locked", joined: false })]);
    expect(headlineFor(watching, { winningNow: false, hits: 0, now })).toMatchObject({ lead: "Game on.", hot: "You're watching live." });
    const watchingAndInvite = groupBoards([summary({ id: "w", status: "locked", joined: false }), summary({ id: "i", joined: false })]);
    expect(headlineFor(watchingAndInvite, { winningNow: false, hits: 0, now }).hot).toBe("Grab yours.");
    const mineAndWatching = groupBoards([summary({ id: "w", status: "locked", joined: false }), summary({ id: "m", status: "locked", mySquares: 2 })]);
    expect(headlineFor(mineAndWatching, { winningNow: false, hits: 0, now })).toMatchObject({ lead: "Your game is", hot: "live." });
    const kickoff = groupBoards([summary({ mySquares: 4, startsAt: now + 3 * 3600_000 })]);
    expect(headlineFor(kickoff, { winningNow: false, hits: 0, now })).toMatchObject({ lead: "Kickoff in", hot: "3h 0m." });
    expect(headlineFor(groupBoards([summary({ mySquares: 4 })]), { winningNow: false, hits: 0, now }).hot).toBe("Now we wait.");
    const done = groupBoards([summary({ status: "final" })]);
    expect(headlineFor(done, { winningNow: false, hits: 0, now }).hot).toBe("Run it back?");
  });

  it("counts your hits on boards in play, once per period", () => {
    const s = groupBoards([
      summary({ id: "a", status: "locked", myWins: [{ periodKey: "q1", label: "Q1" }, { periodKey: "q1", label: "Q1 (reverse)" }] }),
      summary({ id: "b", status: "locked", myWins: [{ periodKey: "q2", label: "Half" }] }),
      summary({ id: "c", status: "final", myWins: [{ periodKey: "final", label: "Final" }] }),
    ]);
    expect(liveHits(s)).toBe(2);
  });
});

describe("boardBuzz", () => {
  const now = 10 * BUZZ_WINDOW_MS;
  let n = 0;
  const act = (over: Partial<GameState["activity"][number]>): GameState["activity"][number] => ({
    id: `a${++n}`,
    type: "claimed",
    at: now - 1000,
    actor: MAYA,
    data: { count: 1 },
    ...over,
  });
  const open = (activity: GameState["activity"]) => state({ game: { status: "open", numbers: null }, activity });

  it("adds up one person's burst: five grabs read as five", () => {
    const five = open([act({ at: now - 100 }), act({ at: now - 200 }), act({ at: now - 300 }), act({ at: now - 400 }), act({ at: now - 500 })]);
    expect(boardBuzz(five, ME, now)).toMatchObject({ text: "Maya grabbed 5 squares", at: now - 100, others: 0 });
    const joined = open([act({ data: { count: 3 } }), act({ type: "joined", at: now - 5000, data: { name: "Maya" } })]);
    expect(boardBuzz(joined, ME, now)?.text).toBe("Maya grabbed 3 squares");
    expect(boardBuzz(open([act({})]), ME, now)?.text).toBe("Maya grabbed a square");
    expect(boardBuzz(open([act({ type: "joined", data: { name: "Maya" } })]), ME, now)?.text).toBe("Maya joined");
  });

  it("keeps separate bursts apart and counts other friends", () => {
    const DRE = "dre-public-id-00000000";
    const s = state({
      game: { status: "open", numbers: null },
      players: [player(ME, "Jordan"), player(MAYA, "Maya"), player(DRE, "Dre")],
      activity: [
        act({ at: now - 100, data: { count: 2 } }),
        act({ at: now - 200, actor: DRE, data: { count: 4 } }),
        act({ at: now - 100 - BURST_MS - 1, data: { count: 9 } }),
      ],
    });
    expect(boardBuzz(s, ME, now)).toMatchObject({ text: "Maya grabbed 2 squares", others: 1 });
  });

  it("ignores my own moves, system events and old news", () => {
    expect(boardBuzz(open([act({ actor: ME })]), ME, now)).toBeNull();
    expect(boardBuzz(open([act({ actor: null, type: "locked", data: {} })]), ME, now)).toBeNull();
    expect(boardBuzz(open([act({ at: now - BUZZ_WINDOW_MS - 1 })]), ME, now)).toBeNull();
    expect(boardBuzz(open([act({ type: "released" })]), ME, now)).toBeNull();
  });
});
