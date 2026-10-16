// Pure helpers behind the invite + join screens: share copy and the per-state
// pitch, the link-card preview, board codes, the one social line, join button
// labels and default looks. No React, no IO.
//
// Copy rule: never mention money (prices, pots, payouts, odds, bets). The tests
// run every message through validatePrizeNote to keep it that way.

import { totalSquares } from "../../../shared/squares";
import type { Game, GameState, GameStatus, Player } from "../../../shared/types";

// ---- Matchup + board code ----

/** "Chiefs vs Bills" (columns team first, like the board); the board name if teams are missing. */
export function matchupLabel(game: Pick<Game, "teamX" | "teamY" | "name">): string {
  const x = game.teamX.name.trim();
  const y = game.teamY.name.trim();
  if (x && y) return `${x} vs ${y}`;
  return game.name.trim() || "squares";
}

/** The board id as a code to read aloud: uppercase (ids avoid look-alike characters). */
export function boardCode(gameId: string): string {
  return gameId.toUpperCase();
}

/** "k 7 m q 2 x" style label so screen readers spell the code. */
export function spelledCode(gameId: string): string {
  return [...boardCode(gameId)].join(" ");
}

/** "https://jaxsquares.com/g/k7mq2x" -> "jaxsquares.com/g/k7mq2x". */
export function displayLink(url: string): string {
  return url.replace(/^https?:\/\//i, "").replace(/\/$/, "");
}

// ---- Board stats + people ----

export interface BoardStats {
  total: number;
  claimed: number;
  left: number;
  players: number;
}

export function boardStats(state: Pick<GameState, "game" | "squares" | "players">): BoardStats {
  const total = totalSquares(state.game.format.boardSize);
  const claimed = Math.min(total, state.squares.length);
  return { total, claimed, left: total - claimed, players: state.players.length };
}

export function hostOf(state: Pick<GameState, "game" | "players">): Player | null {
  return state.players.find((p) => p.id === state.game.hostPlayerId) ?? null;
}

/** Host first, then the most recent joiners (fresh names feel like a live room). */
export function peopleInOrder(state: Pick<GameState, "game" | "players">): Player[] {
  const hostId = state.game.hostPlayerId;
  return [...state.players].sort((a, b) => {
    if (a.id === hostId) return -1;
    if (b.id === hostId) return 1;
    return b.joinedAt - a.joinedAt;
  });
}

/** Few enough squares left to say "hurry": 10% of the board, at least 3. */
export function isUrgent(left: number, total: number): boolean {
  return left > 0 && left <= Math.max(3, Math.ceil(total * 0.1));
}

/** Players not in `known`, newest first (to announce live joins). */
export function newArrivals<P extends Pick<Player, "id" | "joinedAt">>(known: ReadonlySet<string>, players: readonly P[]): P[] {
  return players.filter((p) => !known.has(p.id)).sort((a, b) => b.joinedAt - a.joinedAt);
}

/** "42 squares left", "1 square left", "Board's full". */
export function squaresLeftLabel(left: number): string {
  if (left <= 0) return "Board's full";
  return `${left} ${left === 1 ? "square" : "squares"} left`;
}

// ---- Share copy ----

/**
 * The text that goes with the invite link. Written in the voice of whoever
 * shares it: the host says "my board", anyone else "our board".
 */
export function inviteMessage(state: Pick<GameState, "game" | "squares" | "players">, viewerId: string | null): string {
  const { game } = state;
  const matchup = matchupLabel(game);
  const whose = viewerId && viewerId === game.hostPlayerId ? "my" : "our";
  const { left, total } = boardStats(state);
  switch (game.status) {
    case "locked":
      return `Numbers are drawn on ${whose} ${matchup} board. Follow along live 🏈`;
    case "final":
      return `See who won ${whose} ${matchup} board 🏆`;
    default:
      if (left === 0) return `Follow ${whose} ${matchup} board live with us 🏈`;
      if (isUrgent(left, total)) return `Last call 🏈 Only ${left} ${left === 1 ? "square" : "squares"} left on ${whose} ${matchup} board`;
      return `Grab a square on ${whose} ${matchup} board 🏈`;
  }
}

// ---- Invite sheet: one pitch per board state ----

/**
 * Where the board is, from the inviter's side:
 * fresh (nobody but the host yet), filling, last-call (a few squares left),
 * full (open but every square taken), locked (numbers drawn), final.
 */
export type InviteStage = "fresh" | "filling" | "last-call" | "full" | "locked" | "final";

export function inviteStage(state: Pick<GameState, "game" | "squares" | "players">): InviteStage {
  const { game } = state;
  if (game.status === "locked") return "locked";
  if (game.status === "final") return "final";
  const { left, total } = boardStats(state);
  if (left === 0) return "full";
  if (isUrgent(left, total)) return "last-call";
  return friendsIn(state) === 0 ? "fresh" : "filling";
}

/** Players other than the host. */
export function friendsIn(state: Pick<GameState, "game" | "players">): number {
  return state.players.filter((p) => p.id !== state.game.hostPlayerId).length;
}

export interface InvitePitch {
  /** Sheet title. */
  title: string;
  /** One line under the title. */
  subtitle: string;
  /** The one big button. */
  cta: string;
  /** "gold" for last call: the button turns amber so the moment feels different. */
  tone: "brand" | "gold";
}

/** Header, helper line and button copy for the invite sheet, per board state. */
export function invitePitch(state: Pick<GameState, "game" | "squares" | "players">, viewerIsHost: boolean): InvitePitch {
  const { left } = boardStats(state);
  switch (inviteStage(state)) {
    case "fresh":
      return {
        title: viewerIsHost ? "Your board's live. Who's first?" : "Who's first?",
        subtitle: "Friends tap the link and pick. No app needed.",
        cta: "Text your crew",
        tone: "brand",
      };
    case "filling":
      return {
        title: squaresLeftLabel(left),
        subtitle: "They tap the link and pick. No app needed.",
        cta: "Text your crew",
        tone: "brand",
      };
    case "last-call":
      return {
        title: left === 1 ? "Last square. Last call!" : `Last ${left} squares. Last call!`,
        subtitle: "One more nudge before the board fills.",
        cta: "Send last call",
        tone: "gold",
      };
    case "full":
      return {
        title: "Board's full! 🎉",
        subtitle: "Numbers drop soon. Friends can watch live.",
        cta: "Invite friends to watch",
        tone: "brand",
      };
    case "locked":
      return {
        title: "Invite friends to watch live",
        subtitle: "Numbers are drawn. Friends can follow live.",
        cta: "Invite friends to watch",
        tone: "brand",
      };
    case "final":
      return {
        title: "Share the results",
        subtitle: "Friends can see who won every square.",
        cta: "Share results",
        tone: "brand",
      };
  }
}

/**
 * The one social signal, in friend terms: "You + 5 friends in",
 * "Jordan + 7 friends in", "Just you so far".
 */
export function crewLine(state: Pick<GameState, "game" | "players">, viewerId: string | null): string {
  const host = hostOf(state);
  const others = friendsIn(state);
  const viewerIsHost = !!viewerId && viewerId === state.game.hostPlayerId;
  const hostName = host?.name.trim();
  if (others === 0) {
    if (viewerIsHost) return "Just you so far";
    return hostName ? `Just ${hostName} so far` : "Nobody's in yet";
  }
  const friends = `${others} ${others === 1 ? "friend" : "friends"}`;
  if (viewerIsHost) return `You + ${friends} in`;
  if (hostName) return `${hostName} + ${friends} in`;
  return `${state.players.length} friends in`;
}

/**
 * Title of the link card a friend's phone shows for the invite. Mirrors
 * og:title in worker/og.ts (inviteMeta) so the preview matches what they get.
 */
export function linkCardTitle(game: Pick<Game, "name" | "teamX" | "teamY">): string {
  return `Join ${game.name.trim() || matchupLabel(game)} on JaxSquares`;
}

/** "https://jaxsquares.com/g/k7mq2x" -> "jaxsquares.com": what a link card shows under the title. */
export function linkDomain(url: string): string {
  return displayLink(url).split("/")[0] || displayLink(url);
}

/** The status chip on the preview card: how full the board is, or what's left to see. */
export function previewStatus(state: Pick<GameState, "game" | "squares" | "players">): { text: string; tone: "brand" | "gold" | "muted" } {
  const { left } = boardStats(state);
  switch (inviteStage(state)) {
    case "fresh":
    case "filling":
      return { text: squaresLeftLabel(left), tone: "brand" };
    case "last-call":
      return { text: `Only ${left} left!`, tone: "gold" };
    case "full":
      return { text: "Board's full · watch live", tone: "muted" };
    case "locked":
      return { text: "Numbers drawn · follow live", tone: "muted" };
    case "final":
      return { text: "Final · see who won", tone: "muted" };
  }
}

// ---- Invite hero (the friend's landing) ----

/**
 * The hero's one button. "pick" sends them to the board (tapping a square is
 * the fastest way in); "join" opens the join sheet when there's nothing to pick.
 */
export function heroAction(state: Pick<GameState, "game" | "squares" | "players">): { label: string; kind: "pick" | "join" } | null {
  const { game } = state;
  if (game.status === "final") return null;
  if (game.status === "locked") return { label: "Join to follow along", kind: "join" };
  return boardStats(state).left > 0 ? { label: "Pick your squares", kind: "pick" } : { label: "Join to follow along", kind: "join" };
}

/** Copy for the "You're in!" card a newcomer sees right after claiming. */
export function joinedLine(
  state: Pick<GameState, "game" | "squares" | "players">,
  viewerId: string | null,
): { title: string; detail: string; share: string } {
  const me = viewerId ? state.players.find((p) => p.id === viewerId) : undefined;
  const name = me?.name.trim();
  const mine = viewerId ? state.squares.filter((s) => s.playerId === viewerId).length : 0;
  const host = hostOf(state);
  const whose = host && host.id !== viewerId ? ` on ${host.name.trim()}'s board` : "";
  const when = state.game.status === "open" ? "Numbers get drawn before the game starts." : "Numbers are drawn. Follow along live.";
  return {
    title: name ? `You're in, ${name}! 🎉` : "You're in! 🎉",
    detail: `You've got ${mine} ${mine === 1 ? "square" : "squares"}${whose}. ${when}`,
    share: inviteMessage(state, viewerId),
  };
}

// ---- Join ----

/**
 * Join button copy. The board claims the selected squares right after joining,
 * so say so; `undefined` means the board didn't tell us (assume a claim).
 */
export function joinLabel(status: GameStatus, selectedCount?: number, full = false): string {
  if (status === "locked" || status === "final" || full) return "Join to follow along";
  if (selectedCount === undefined) return "Join & claim";
  if (selectedCount <= 0) return "Join the board";
  if (selectedCount === 1) return "Join & claim my square";
  return `Join & claim ${selectedCount} squares`;
}

export const NAME_REQUIRED = "Add your name so friends know whose square it is.";

/** Blocking problem with a name, or null. */
export function nameProblem(name: string): string | null {
  return name.trim() ? null : NAME_REQUIRED;
}

/** Soft hint when someone else on the board already uses this name (case-insensitive). */
export function nameClash(name: string, players: Pick<Player, "id" | "name">[], myId: string | null): string | null {
  const n = name.trim().toLowerCase();
  if (!n) return null;
  const other = players.find((p) => p.id !== myId && p.name.trim().toLowerCase() === n);
  return other ? `There's already a ${other.name.trim()} here. Add an initial?` : null;
}

export interface Look {
  color: string;
  emoji: string;
}

/**
 * A look for someone joining. A returning player keeps theirs; a first-timer
 * gets their device default unless someone on this board already wears that
 * color/emoji, in which case the next free one in the palette is used.
 */
export function defaultLook(
  current: Look,
  players: Pick<Player, "id" | "color" | "emoji">[],
  opts: {
    returning: boolean;
    myId: string | null;
    colors: readonly string[];
    emojis: readonly string[];
    /** Palette colors never picked as a default (still choosable), e.g. a pale one that reads as "empty". */
    avoidColors?: readonly string[];
  },
): Look {
  if (opts.returning) return current;
  const others = players.filter((p) => p.id !== opts.myId);
  const usedColors = new Set([...others.map((p) => p.color.toLowerCase()), ...(opts.avoidColors ?? []).map((c) => c.toLowerCase())]);
  const usedEmojis = new Set(others.map((p) => p.emoji));
  return {
    color: nextFree(current.color, opts.colors, (c) => usedColors.has(c.toLowerCase())),
    emoji: nextFree(current.emoji, opts.emojis, (e) => usedEmojis.has(e)),
  };
}

function nextFree(start: string, palette: readonly string[], used: (v: string) => boolean): string {
  if (!used(start)) return start;
  const from = Math.max(0, palette.findIndex((v) => v.toLowerCase() === start.toLowerCase()));
  for (let i = 1; i <= palette.length; i++) {
    const v = palette[(from + i) % palette.length];
    if (!used(v)) return v;
  }
  return start; // everything is taken: duplicates are fine
}

/** A random look that differs from the current one (the shuffle button). */
export function shuffleLook(current: Look, colors: readonly string[], emojis: readonly string[], random: () => number = Math.random): Look {
  const pick = (list: readonly string[], not: string) => {
    const pool = list.filter((v) => v !== not);
    return pool.length ? pool[Math.floor(random() * pool.length) % pool.length] : not;
  };
  return { color: pick(colors, current.color), emoji: pick(emojis, current.emoji) };
}
