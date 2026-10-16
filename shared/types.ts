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
  /** 0 means unlimited squares per player. Counted per device: with no accounts, one person can use more. */
  maxPerPlayer: number;
  /**
   * null until locked. Key "*" holds the single draw; with freshNumbers there is
   * one draw per quarter keyed by period key ("q1", "q2", ...).
   */
  numbers: Record<string, NumberDraw> | null;
  status: GameStatus;
  linkedEvent: LinkedEvent | null;
  /** Public id of the host's player (see Player.id). */
  hostPlayerId: string;
  createdAt: number;
  lockedAt: number | null;
}

/**
 * Someone who has joined a board (host included once they pick a name).
 *
 * Identity model: a device's `clientId` is a secret bearer credential sent only
 * as the `x-client-id` header and never appears in any response. Everything
 * public (GameState, live messages, results, activity) names people by their
 * public player id = base64url(SHA-256("jaxsquares:player:" + clientId)), first
 * 22 chars (shared/playerId.ts). The id is stable per device and can't be turned
 * back into the clientId.
 */
export interface Player {
  /** Public player id (not the clientId). */
  id: string;
  name: string;
  color: string;
  /** Optional single emoji avatar. */
  emoji: string;
  joinedAt: number;
  isHost: boolean;
}

/** A claimed square. Look up name/color via `players` by `playerId` (= Player.id). */
export interface Square {
  row: number; // grid position (board layout, independent of numbers)
  col: number;
  playerId: string;
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
  /** Public player id of who did it; null for system events (live scores, auto-lock at kickoff). */
  actor: string | null;
  /**
   * Small structured payload; see ActivityData for the shape per type, e.g.
   * { count: 3, cells } or { periodKey: "q1", ... }.
   */
  data: Record<string, unknown>;
}

/**
 * The `data` payload of each activity type (documented here; `Activity.data`
 * stays loosely typed so older rows never break parsing).
 */
export interface ActivityData {
  created: Record<string, never>;
  joined: { name: string };
  claimed: { count: number; cells: { row: number; col: number }[] };
  released: { count: number; cells: { row: number; col: number }[] };
  /** `auto` when a linked board locked itself at kickoff (actor null). */
  locked: { auto?: true };
  score: { periodKey: string; label: string; scoreX: number; scoreY: number; source: Score["source"] };
  winner: {
    periodKey: string;
    label: string;
    /** Public ids of the players whose squares won (regular and reverse), deduplicated. */
    playerIds: string[];
    cell: { row: number; col: number } | null;
    reverseCell?: { row: number; col: number } | null;
    prize: string | null;
    /** True when the host picked the winning square. */
    manual?: true;
  };
  final: Record<string, never>;
}

/**
 * id of the `<script type="application/json">` holding the board's GameState on
 * an invite page (GET /g/:id), so the client can render it before its first fetch.
 */
export const BOOT_STATE_ID = "jx-boot";

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
  /**
   * Newest score on the board: the live feed's while a linked game is on (or
   * over), else the latest recorded period. `label` is the clock ("Q3 4:12",
   * "Final") or the period ("Q1", "Half", "Score 3"). null before any score.
   * Always sent by `GET /api/me/games`; optional only so older fixtures type-check.
   */
  latestScore?: { scoreX: number; scoreY: number; label: string } | null;
  /**
   * Public player id holding the square the live score points at, else the
   * latest period's winner. null when there is none yet or nobody claimed
   * that square. Always sent by `GET /api/me/games`.
   */
  leaderPlayerId?: string | null;
  /**
   * The board's `GameState.version` when this summary was read (a lower bound:
   * nothing in it is older). Home lays a board's live state over the summary
   * only when that state is at least this new: a finished board still changes
   * (a corrected score, a reopened final). Always sent by `GET /api/me/games`.
   */
  version?: number;
}

// ---- Live socket messages (server -> client) ----
// Connect to /api/games/:id/live?player=<public player id> (the param only
// de-duplicates the watcher count; never send the clientId). Add `&watch=0` for
// a passive socket (e.g. Home following every board you're in): it receives
// every message but isn't counted in `presence.watching`. Plain-text "ping" is
// answered with "pong" (also {"type":"ping"} -> {"type":"pong"}).
// The board was deleted: `{ type: "deleted" }` arrives first, then the socket
// closes with code 4404. Treat either one as "gone" and stop reconnecting.

export type LiveMessage =
  | { type: "state"; state: GameState }
  | { type: "presence"; watching: number }
  | { type: "event"; activity: Activity }
  | { type: "deleted" };

// ---- Request payloads ----
// Every request identifies the device with the `x-client-id` header (secret,
// never echoed back). Host-only endpoints also require `x-admin-token`.

export interface CreateGameInput {
  name: string;
  sport: Sport;
  league: League;
  teamX: Team;
  teamY: Team;
  format: GameFormat;
  /** Free-text notes; rejected (400) if one mentions money (see validatePrizeNote). */
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
  /** Free-text notes; rejected (400) if one mentions money (see validatePrizeNote). */
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

/** GET /api/schedule. `unavailable` is true when the provider couldn't be reached (still 200). */
export interface ScheduleResponse {
  events: ScheduleEvent[];
  unavailable?: boolean;
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
