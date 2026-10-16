// Pure helpers behind the invite + join screens: share copy, board codes,
// social proof lines, join button labels and default looks. No React, no IO.
//
// Copy rule: never mention money (prices, pots, payouts, odds, bets). The tests
// run every message through validatePrizeNote to keep it that way.

import { prizeFor } from "../../../shared/formats";
import { totalSquares } from "../../../shared/squares";
import type { Game, GameState, GameStatus, PeriodsPreset, Player } from "../../../shared/types";

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

/** "K7MQ2X" -> ["K7M", "Q2X"]: two groups of three are easier to say and remember. */
export function codeGroups(gameId: string): string[] {
  const code = boardCode(gameId);
  if (code.length < 6) return [code];
  const mid = Math.ceil(code.length / 2);
  return [code.slice(0, mid), code.slice(mid)];
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

/** "1 player in", "6 players in". */
export function playersInLabel(count: number): string {
  return `${count} ${count === 1 ? "player" : "players"} in`;
}

/** True when the board's name just repeats the matchup ("Packers vs Bears"), so it needn't be shown twice. */
export function nameIsMatchup(game: Pick<Game, "teamX" | "teamY" | "name">): boolean {
  const norm = (v: string) => v.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const name = norm(game.name);
  const x = norm(game.teamX.name);
  const y = norm(game.teamY.name);
  return name === `${x} vs ${y}` || name === `${y} vs ${x}` || name === `${x} at ${y}` || name === `${y} at ${x}`;
}

/** Display size for the matchup headline: long team names step down instead of truncating. */
export function matchupSize(game: Pick<Game, "teamX" | "teamY">): "lg" | "md" | "sm" {
  const len = [...game.teamX.name.trim()].length + [...game.teamY.name.trim()].length;
  if (len <= 15) return "lg";
  if (len <= 24) return "md";
  return "sm";
}

/** Few enough squares left to say "hurry": 10% of the board, at least 3. */
export function isUrgent(left: number, total: number): boolean {
  return left > 0 && left <= Math.max(3, Math.ceil(total * 0.1));
}

/** Players not in `known`, newest first (to announce live joins). */
export function newArrivals<P extends Pick<Player, "id" | "joinedAt">>(known: ReadonlySet<string>, players: readonly P[]): P[] {
  return players.filter((p) => !known.has(p.id)).sort((a, b) => b.joinedAt - a.joinedAt);
}

/** How a board's squares win, in a casual fan's words. */
export function winnersLine(periods: PeriodsPreset): string {
  switch (periods) {
    case "quarters":
      return "A winner every quarter";
    case "halves":
      return "Winners at halftime and the final";
    case "final":
      return "One winner, at the final score";
    case "every-score":
      return "A winner every time the score changes";
  }
}

/** "42 squares left", "1 square left", "Board's full". */
export function squaresLeftLabel(left: number): string {
  if (left <= 0) return "Board's full";
  return `${left} ${left === 1 ? "square" : "squares"} left`;
}

/** The first prize note in period order ("*" applies to all), with the period it belongs to. */
export function headlinePrize(game: Pick<Game, "prizes" | "periods">): { label: string | null; note: string } | null {
  for (const p of game.periods) {
    const own = game.prizes[p.key];
    if (own) return { label: p.label, note: own };
  }
  const shared = prizeFor(game.prizes, "*");
  if (shared) return { label: null, note: shared };
  const any = Object.values(game.prizes).find(Boolean);
  return any ? { label: null, note: any } : null;
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
  const { left } = boardStats(state);
  switch (game.status) {
    case "locked":
      return `Numbers are drawn on ${whose} ${matchup} board. Follow along live 🏈`;
    case "final":
      return `See who won ${whose} ${matchup} board 🏆`;
    default:
      if (left === 0) return `Follow ${whose} ${matchup} board live with us 🏈`;
      if (left <= 10) return `Grab a square on ${whose} ${matchup} board 🏈 Only ${left} left!`;
      return `Grab a square on ${whose} ${matchup} board 🏈`;
  }
}

// ---- Join ----

/**
 * Join button copy. The board claims the selected squares right after joining,
 * so say so; `undefined` means the board didn't tell us (assume a claim).
 */
export function joinLabel(status: GameStatus, selectedCount?: number): string {
  if (status === "locked" || status === "final") return "Join to follow along";
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
