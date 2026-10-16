// Domain types shared between the Cloudflare Worker (API) and the React client.
// Keeping a single source of truth avoids drift between server and UI.
//
// JaxSquares never handles money between players. There are no prices, pots,
// buy-ins or payouts anywhere in this model; a creator may attach an optional
// free-text "prize note" to a period (e.g. "Loser buys wings"). The only money
// in the product is the creator paying JaxSquares to create a board.

export type Sport = "football" | "basketball" | "baseball" | "hockey" | "soccer" | "other";

/** Leagues we can pull live schedules/scores for. "custom" = typed-in matchup. */
export type League = "nfl" | "ncaaf" | "custom";

/**
 * draft  – created, waiting for the creator's payment (not joinable yet)
 * open   – friends are claiming squares
 * locked – numbers drawn, no more claiming; scores/winners being recorded
 * final  – every period resolved (or the host ended it)
 */
export type GameStatus = "draft" | "open" | "locked" | "final";

/** Which scoring moments win a square. */
export type PeriodsPreset = "quarters" | "halves" | "final" | "every-score";

/** 100 = classic 10x10 (one digit per row/col); 25 = 5x5 (two digits per row/col). */
export type BoardSize = 100 | 25;

export interface GameFormat {
  periods: PeriodsPreset;
  /** Also award the "reverse" square (the two digits swapped) each period. */
  reverse: boolean;
  boardSize: BoardSize;
  /** Draw a fresh set of numbers for each quarter (quarters preset only). */
  freshNumbers: boolean;
}

/** A scoring checkpoint that can win a square (e.g. end of each quarter). */
export interface Period {
  /** Stable key, e.g. "q1", "q2", "q3", "final", or "s1".."sN" for every-score. */
  key: string;
  /** Display label, e.g. "Q1", "Half", "Final", "Score 3". */
  label: string;
}

export interface Team {
  name: string;
  /** Short code, e.g. "KC". */
  abbr?: string;
  /** Primary team color as #rrggbb, used for fun accents. */
  color?: string;
}

/** A board linked to a real game so scores arrive automatically. */
export interface LinkedEvent {
  provider: "espn";
  league: Exclude<League, "custom">;
  eventId: string;
  /** Kickoff time, epoch ms. */
  startsAt: number;
  /** True when teamX (columns) is the home team. */
  xIsHome: boolean;
}

/** Raw live data for a linked game, oriented to the board's X/Y teams. */
export interface LiveUpdate {
  live: LiveStatus;
  /** Points scored in each period so far (index 0 = Q1, 4+ = OT), per team. */
  linescoresX: number[];
  linescoresY: number[];
  /** Number of fully completed periods (0-4, more with OT). */
  completedPeriods: number;
  isFinal: boolean;
}

/**
 * Numbers for one draw. x[col] lists the digit(s) for that column, y[row] the
 * digit(s) for that row. 10x10 boards have one digit per entry, 5x5 boards two.
 */
export interface NumberDraw {
  x: number[][];
  y: number[][];
}

export interface Game {
  id: string;
  name: string;
  sport: Sport;
  league: League;
  /** Team across the top (columns / x-axis numbers). */
  teamX: Team;
  /** Team down the side (rows / y-axis numbers). */
  teamY: Team;
  format: GameFormat;
  /** Fixed periods for this board (empty for every-score, whose periods come from scores). */
  periods: Period[];
  /** Optional free-text prize note per period key (max 60 chars each). Never money handling. */
  prizes: Record<string, string>;
  /** 0 means unlimited squares per player. */
  maxPerPlayer: number;
  /**
   * null until locked. Key "*" holds the single draw; with freshNumbers there is
   * one draw per quarter keyed by period key ("q1", "q2", ...).
   */
  numbers: Record<string, NumberDraw> | null;
  status: GameStatus;
  linkedEvent: LinkedEvent | null;
  /** The host's anonymous device id. */
  hostClientId: string;
  createdAt: number;
  lockedAt: number | null;
}

/** Someone who has joined a board (host included once they pick a name). */
export interface Player {
  clientId: string;
  name: string;
  color: string;
  /** Optional single emoji avatar. */
  emoji: string;
  joinedAt: number;
  isHost: boolean;
}

/** A claimed square. Look up name/color via `players` by clientId. */
export interface Square {
  row: number; // grid position (board layout, independent of numbers)
  col: number;
  clientId: string;
  claimedAt: number;
}

/** A recorded score. For fixed periods it's the cumulative score at the end of that period. */
export interface Score {
  periodKey: string;
  /** Only set for every-score entries, e.g. "Score 3". */
  label?: string;
  scoreX: number; // the column team's score
  scoreY: number; // the row team's score
  source: "live" | "host";
  updatedAt: number;
}

/** A host's manual winner pick for a period; overrides the computed square. */
export interface ManualWinner {
  periodKey: string;
  row: number;
  col: number;
  updatedAt: number;
}

/** Live game status from the score provider (linked boards only). */
export interface LiveStatus {
  state: "pre" | "in" | "post";
  /** Current period number (1-4, 5+ for OT). */
  period: number;
  clock: string;
  /** Provider's short status text, e.g. "Q3 4:12" or "Final". */
  detail: string;
  scoreX: number;
  scoreY: number;
  updatedAt: number;
}

export type ActivityType =
  | "created"
  | "joined"
  | "claimed"
  | "released"
  | "locked"
  | "score"
  | "winner"
  | "final";

export interface Activity {
  id: string;
  type: ActivityType;
  at: number;
  /** clientId of who did it, when a person did it. */
  actor: string | null;
  /** Small structured payload, e.g. { count: 3 } or { periodKey: "q1" }. */
  data: Record<string, unknown>;
}

/** Full game state returned by the API and pushed over the live socket. */
export interface GameState {
  game: Game;
  players: Player[];
  squares: Square[];
  scores: Score[];
  manualWinners: ManualWinner[];
  live: LiveStatus | null;
  /** Most recent first, capped (about 50). */
  activity: Activity[];
  /** Monotonic per game; clients ignore states older than the one they hold. */
  version: number;
}

/** One row on the dashboard. */
export interface GameSummary {
  id: string;
  name: string;
  sport: Sport;
  teamX: Team;
  teamY: Team;
  status: GameStatus;
  format: GameFormat;
  isHost: boolean;
  mySquares: number;
  claimed: number;
  totalSquares: number;
  playerCount: number;
  live: LiveStatus | null;
  startsAt: number | null;
  /** Periods this device's squares have won so far. */
  myWins: { periodKey: string; label: string }[];
  lastActivityAt: number;
  createdAt: number;
}

// ---- Live socket messages (server -> client) ----

export type LiveMessage =
  | { type: "state"; state: GameState }
  | { type: "presence"; watching: number }
  | { type: "event"; activity: Activity };

// ---- Request payloads ----
// Every request identifies the device with the `x-client-id` header. Host-only
// endpoints also require `x-admin-token`.

export interface CreateGameInput {
  name: string;
  sport: Sport;
  league: League;
  teamX: Team;
  teamY: Team;
  format: GameFormat;
  prizes: Record<string, string>;
  maxPerPlayer: number;
  /** Set when the board is linked to a real game from /api/schedule. */
  linkedEvent: LinkedEvent | null;
  /** The host's player profile, so they appear on the board right away. */
  host: { name: string; color: string; emoji: string };
}

export interface CreateGameResponse {
  game: Game;
  adminToken: string;
  /** True when the board stays in "draft" until the creator pays. */
  paymentRequired: boolean;
}

export interface JoinInput {
  name: string;
  color: string;
  emoji: string;
}

export interface CellsInput {
  cells: { row: number; col: number }[];
}

export interface ScoreInput {
  periodKey: string;
  scoreX: number;
  scoreY: number;
  /** every-score only: label for a new score entry. */
  label?: string;
}

export interface ManualWinnerInput {
  periodKey: string;
  row: number;
  col: number;
}

export interface UpdateGameInput {
  name?: string;
  prizes?: Record<string, string>;
  maxPerPlayer?: number;
}

/** An upcoming real game a board can be linked to. */
export interface ScheduleEvent {
  eventId: string;
  league: Exclude<League, "custom">;
  name: string;
  shortName: string;
  startsAt: number;
  home: Team;
  away: Team;
  state: "pre" | "in" | "post";
}

export interface PaymentConfig {
  /** "test" simulates checkout with no charge; "live" uses Stripe / Apple IAP. */
  mode: "test" | "live";
  priceCents: number;
  currency: string;
  stripePublishableKey: string | null;
  iapProductId: string;
}

export interface AppConfig {
  payments: PaymentConfig;
  /** Web push VAPID public key (base64url), null when push isn't configured. */
  vapidPublicKey: string | null;
}

export type PushRegistration =
  | { platform: "web"; subscription: { endpoint: string; keys: { p256dh: string; auth: string } } }
  | { platform: "ios" | "android"; token: string };
