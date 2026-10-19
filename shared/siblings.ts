// Several boards for one game (a $1 board, a $5 board and a $20 board on the
// same Super Bowl): the pure rules both sides share. A host adds a board from
// one they host (CreateGameInput.fromGameId); the boards share a group
// (games.board_group, migration 0012), and each board's public state lists the
// others (GameState.siblings). No framework or IO here.
//
// Amounts stay in the app: a sibling's square price is display-only, shown on
// the board's "More boards for this game" row, never in share text, a push or
// a link preview (boardCountLine says only how many boards there are). Board
// names never carry a price either (mentionsMoney: the name is every push's
// title), so a new board's suggested name counts boards instead.

import { formatAmount, unitOf } from "./formats";
import { totalSquares } from "./squares";
import type { GameFormat, GameState, GameStatus, LinkedEvent, LiveStatus, SiblingBoard } from "./types";

/** Most boards one game's group holds, the first one included. */
export const MAX_GROUP_BOARDS = 10;

/** The server's limit on a board name (worker create handler), which a suggested name stays under. */
const NAME_MAX = 60;

/** Why another board can't be added to a game (the API answers 409 with these). */
export const SIBLING_ERRORS = {
  final: "That game is over. Start a new board for the next one.",
  started: "That game has kicked off. Add boards for it before kickoff.",
  full: `This game already has ${MAX_GROUP_BOARDS} boards, the most it can have.`,
} as const;

/** What a stored board needs to be listed as a sibling. */
export interface SiblingSource {
  id: string;
  name: string;
  status: GameStatus;
  format: Pick<GameFormat, "boardSize" | "squarePrice" | "unit" | "justForFun">;
}

/**
 * One board as its siblings list it: name, status, the display-only square
 * price (none on a just-for-fun board) and how many squares are left.
 * Nothing about who plays or hosts it.
 */
export function siblingSummary(board: SiblingSource, claimed: number): SiblingBoard {
  const fun = board.format.justForFun === true;
  const total = totalSquares(board.format.boardSize);
  const price = board.format.squarePrice;
  return {
    id: board.id,
    name: board.name,
    status: board.status,
    squarePrice: !fun && typeof price === "number" && Number.isFinite(price) && price > 0 ? price : null,
    unit: unitOf(board.format),
    justForFun: fun,
    squaresLeft: Math.max(0, total - Math.max(0, Math.trunc(claimed) || 0)),
    totalSquares: total,
  };
}

/** Boards in this board's group, itself included (1 for a board on its own). */
export function groupSize(state: Pick<GameState, "siblings">): number {
  return (state.siblings?.length ?? 0) + 1;
}

/** What decides whether another board can join a board's game (the server reads it from D1, the app from GameState). */
export interface SiblingCheck {
  status: GameStatus;
  linkedEvent: Pick<LinkedEvent, "startsAt"> | null;
  /** Any score is recorded on the board. */
  scored: boolean;
  /** The live feed's state (linked boards), null without one. */
  live: LiveStatus["state"] | null;
  /** Boards in the group, the board itself included. */
  groupSize: number;
}

export function siblingCheckOf(state: Pick<GameState, "game" | "scores" | "live" | "siblings">): SiblingCheck {
  return {
    status: state.game.status,
    linkedEvent: state.game.linkedEvent,
    scored: state.scores.length > 0,
    live: state.live?.state ?? null,
    groupSize: groupSize(state),
  };
}

/**
 * Why no other board can be added to this board's game, or null when one
 * can: the game is over, or it has started (a score is in, the live feed is
 * on or over, or a linked game's kickoff has passed), or its group already
 * has MAX_GROUP_BOARDS boards. The server answers 409 with it; the host
 * tools hide "Add another board" meanwhile.
 */
export function siblingProblem(check: SiblingCheck, now: number): string | null {
  if (check.status === "final") return SIBLING_ERRORS.final;
  const started = check.scored || check.live === "in" || check.live === "post" || (check.linkedEvent !== null && check.linkedEvent.startsAt <= now);
  if (started) return SIBLING_ERRORS.started;
  if (check.groupSize >= MAX_GROUP_BOARDS) return SIBLING_ERRORS.full;
  return null;
}

const BOARD_SUFFIX = /\s*·\s*Board (\d+)$/;

/**
 * The name to suggest for a board added from this one: its name without a
 * board number, then the next number in the group ("Office Squares · Board
 * 3"), past every number in use (a deleted board's number isn't reused while
 * a later one stays).
 */
export function nextSiblingName(state: Pick<GameState, "game" | "siblings">): string {
  const names = [state.game.name, ...(state.siblings ?? []).map((s) => s.name)];
  const used = names.map((name) => Number(BOARD_SUFFIX.exec(name)?.[1] ?? 1));
  return siblingBoardName(state.game.name, Math.max(groupSize(state) + 1, ...used.map((u) => u + 1)));
}

/**
 * The name a new board in the group starts with: the first board's name and
 * its number, "Office Squares · Board 2". Never the price ("· $5 board"): a
 * board's name is every push's title and its link preview, and amounts stay
 * in the app (the server refuses a name that mentions money). `n` is the new
 * board's place in the group (2 for the second board).
 */
export function siblingBoardName(baseName: string, n: number): string {
  const suffix = ` · Board ${Math.max(2, Math.trunc(n) || 2)}`;
  const base = baseName.replace(BOARD_SUFFIX, "").trim() || "Squares";
  const room = NAME_MAX - suffix.length;
  return `${Array.from(base).slice(0, room).join("").trim()}${suffix}`;
}

/**
 * A board's name where its group's boards are listed together: "Board 2" for
 * "Office Squares · Board 2" when another board there carries the same name
 * before it (the group already says which game), else its own name.
 */
export function shortSiblingName(name: string, names: readonly string[]): string {
  const m = BOARD_SUFFIX.exec(name.trim());
  if (!m) return name;
  const base = name.trim().slice(0, m.index).trim();
  const baseOf = (other: string) => {
    const o = BOARD_SUFFIX.exec(other.trim());
    return o ? other.trim().slice(0, o.index).trim() : other.trim();
  };
  const shared = names.some((other) => other !== name && baseOf(other) === base);
  return shared ? `Board ${m[1]}` : name;
}

/** "$5 a square", "10 pts a square", "Just for fun", or null when the host set neither. In-app only. */
export function siblingPriceLine(s: Pick<SiblingBoard, "squarePrice" | "unit" | "justForFun">): string | null {
  if (s.justForFun) return "Just for fun";
  return s.squarePrice ? `${formatAmount(s.squarePrice, s.unit)} a square` : null;
}

/** Where a sibling stands: "42 left", "1 left", "Board's full", "Numbers drawn", "Final". */
export function siblingStatusLine(s: Pick<SiblingBoard, "status" | "squaresLeft">): string {
  switch (s.status) {
    case "locked":
      return "Numbers drawn";
    case "final":
      return "Final";
    default:
      return s.squaresLeft > 0 ? `${s.squaresLeft} left` : "Board's full";
  }
}

/**
 * The count for share text and the invite page: "This game has 3 boards".
 * Only how many (the names go with it in the app), never an amount. Null for
 * a board on its own.
 */
export function boardCountLine(state: Pick<GameState, "siblings">): string | null {
  const n = groupSize(state);
  return n > 1 ? `This game has ${n} boards` : null;
}
