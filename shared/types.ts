// Domain types shared between the Cloudflare Worker (API) and the React client.
// Keeping a single source of truth avoids drift between server and UI.

export type Sport = "football" | "basketball" | "baseball" | "hockey" | "soccer" | "other";

export type GameStatus = "open" | "locked";

/** A scoring checkpoint that can win a square (e.g. end of each quarter). */
export interface Period {
  /** Stable key, e.g. "q1", "final". */
  key: string;
  /** Display label, e.g. "Q1", "Final". */
  label: string;
}

/** A single claimed square on the 10x10 grid. */
export interface Square {
  row: number; // 0..9 grid position (board layout, independent of numbers)
  col: number; // 0..9 grid position
  playerName: string;
  playerColor: string;
  /** Anonymous per-device id of whoever claimed it (so a user sees "mine"). */
  clientId: string;
}

/** A recorded score for one period. */
export interface Score {
  periodKey: string;
  scoreX: number; // the column team's score
  scoreY: number; // the row team's score
}

export interface Game {
  id: string;
  name: string;
  sport: Sport;
  /** Team shown across the top (columns / x-axis numbers). */
  teamX: string;
  /** Team shown down the side (rows / y-axis numbers). */
  teamY: string;
  pricePerSquare: number;
  /** 0 means unlimited squares per player. */
  maxPerPlayer: number;
  periods: Period[];
  /** Payout amount per period, keyed by period.key. */
  payouts: Record<string, number>;
  /** 0..9 assigned to each column, in column order. null until locked. */
  xNumbers: number[] | null;
  /** 0..9 assigned to each row, in row order. null until locked. */
  yNumbers: number[] | null;
  status: GameStatus;
  createdAt: number;
}

/** Full game state returned by the API. */
export interface GameState {
  game: Game;
  squares: Square[];
  scores: Score[];
}

// ---- Request payloads ----

export interface CreateGameInput {
  name: string;
  sport: Sport;
  teamX: string;
  teamY: string;
  pricePerSquare: number;
  maxPerPlayer: number;
  periods: Period[];
  payouts: Record<string, number>;
}

export interface ClaimInput {
  clientId: string;
  playerName: string;
  playerColor: string;
  cells: { row: number; col: number }[];
}

export interface ReleaseInput {
  clientId: string;
  cells: { row: number; col: number }[];
}

export interface ScoreInput {
  periodKey: string;
  scoreX: number;
  scoreY: number;
}

export interface CreateGameResponse {
  game: Game;
  adminToken: string;
}

export const DEFAULT_FOOTBALL_PERIODS: Period[] = [
  { key: "q1", label: "Q1" },
  { key: "q2", label: "Half" },
  { key: "q3", label: "Q3" },
  { key: "final", label: "Final" },
];
