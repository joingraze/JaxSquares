// Domain types shared between the Cloudflare Worker (API) and the React client.
// Keeping a single source of truth avoids drift between server and UI.
//
// JaxSquares never handles money between players: it never collects, holds,
// sends or tracks a payment between them. A host may show a square price and
// prize amounts (GameFormat.squarePrice, Prize.amount, Prize.byKind, and the
// final's Prize.rest: "the rest of the board total") as display-only,
// structured fields in "$" or points, plus a free-text note per prize ("Loser
// buys wings"). Amounts stay in the app: never in push notifications, link
// previews or share text. The only money the product touches is the host
// paying JaxSquares a fee for a board, due when they draw its numbers, or a
// yearly Host Pass (or Club Pass) that covers that fee on every board they host.

export type Sport = "football" | "basketball" | "baseball" | "hockey" | "soccer" | "other";

/** Leagues we can pull live schedules/scores for. "custom" = typed-in matchup. */
export type League = "nfl" | "ncaaf" | "custom";

/**
 * draft  – legacy: a board waiting on its creator's payment before it opened,
 *          from before the host fee moved to the draw. Migration 0009 opened
 *          them all and new boards never start here; kept for old data.
 * open   – friends are claiming squares (a new board starts here, free)
 * locked – numbers drawn (the host fee is paid), no more claiming;
 *          scores/winners being recorded
 * final  – every period resolved (or the host ended it)
 */
export type GameStatus = "draft" | "open" | "locked" | "final";

/**
 * Which scoring moments win a square. "custom" = the rules' moments match no
 * preset (e.g. every score plus the quarters).
 */
export type PeriodsPreset = "quarters" | "halves" | "final" | "every-score" | "custom";

/** 100 = classic 10x10 (one digit per row/col); 25 = 5x5 (two digits per row/col). */
export type BoardSize = 100 | 25;

/** A moment a square can win at: every score change, or the score at the end of Q1 / halftime / Q3 / the game. */
export type Moment = "score" | "q1" | "q2" | "q3" | "final";

/**
 * The kind of score an every-score entry was (football): derived on read from
 * its change versus the entry before it (`entryPlays` in shared/squares.ts),
 * never stored, so host corrections and overturned scores stay consistent.
 * Every entry has one. Boards saved before the extra point and the 2-point
 * conversion were told apart may hold `byKind.conversion`: it reads as both
 * (`kindAmount` and `upgradeFormat` in shared/formats.ts).
 */
export type ScoreKind = "touchdown" | "fieldGoal" | "extraPoint" | "twoPoint" | "safety";

/**
 * What a winning square gets. `amount` is display-only (in the board's unit):
 * JaxSquares never collects or sends it. `note` is free text ("" when none),
 * checked by validatePrizeNote.
 */
export interface Prize {
  amount: number | null;
  note: string;
  /**
   * Every score change only (the "score" moment's square/reverse): a
   * display-only amount per kind of score, so an extra point can show less
   * than a touchdown. `amount` is the flat amount when there are none, and a
   * quiet fallback for a kind missing from older data. Absent = `amount` for
   * every score (rules made before it behave exactly as before).
   */
  byKind?: Partial<Record<ScoreKind, number>>;
  /**
   * The final score's square only, and only with a square price: it shows
   * "the rest of the board total", everything the other prizes didn't give
   * out (`resolveResults` / `restSoFar` in shared/squares.ts). `amount` is
   * ignored and stored null. Display-only like every amount.
   */
  rest?: true;
}

/** Who wins at one moment. */
export interface MomentRule {
  moment: Moment;
  /** The square matching the score's last digits; null = it doesn't win at this moment. */
  square: Prize | null;
  /** The square with the digits swapped; null = no reverse winner at this moment. */
  reverse: Prize | null;
}

/** How amounts read: dollars ("$50") or points ("50 pts"). */
export type AmountUnit = "$" | "pts";

export interface GameFormat {
  /** The preset matching the rules' moments, else "custom" (derived by the server from `rules`). */
  periods: PeriodsPreset;
  /** Legacy/derived: some moment has a reverse winner. */
  reverse: boolean;
  boardSize: BoardSize;
  /** Draw a fresh set of numbers for each quarter (only with no every-score rule and at least one fixed moment). */
  freshNumbers: boolean;
  /**
   * Source of truth for who wins when (canonical order: score, q1, q2, q3,
   * final). Absent on boards made before rules existed: rulesOf() derives them
   * from `periods` + `reverse`.
   */
  rules?: MomentRule[];
  /** Unit for every amount on the board (default "$"). */
  unit?: AmountUnit;
  /** Display-only square price, in `unit`; null/absent = none shown. */
  squarePrice?: number | null;
  /**
   * The host said this board is just for fun: no square price or amounts
   * (they're cleared), and players see a "Just for fun" badge. Not set and no
   * amounts = the host chose nothing, and players see nothing about prizes.
   */
  justForFun?: boolean;
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
  /** Fixed periods for this board (from the rules; every-score entries come from scores). */
  periods: Period[];
  /**
   * Legacy free-text prize note per period key ("*" = every period without
   * its own). Boards made since rules existed store {} and keep notes in
   * `format.rules`; rulesOf() folds these into the rules for older boards.
   */
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
  /**
   * Kickoff, epoch ms: the linked event's time, or on a custom board the
   * host's (null = no set time). Display only: a custom board never locks
   * itself. Always sent by the API; optional only so older fixtures type-check.
   */
  startsAt?: number | null;
  /** Public id of the host's player (see Player.id). */
  hostPlayerId: string;
  /**
   * Public ids of the board's co-hosts (shared/cohosts.ts), in the order they
   * joined as co-hosts: up to MAX_COHOSTS players the host invited to run the
   * board with them. Never a clientId. Always sent by the API; optional only so
   * older fixtures and cached states type-check (absent reads as none).
   */
  cohostIds?: string[];
  createdAt: number;
  lockedAt: number | null;
  /**
   * The host fee for this board is paid: the host can draw the numbers
   * (POST /lock answers 402 with PAYMENT_REQUIRED_CODE until then), and a
   * linked board draws its own at kickoff. Boards made before the fee moved
   * to the draw count as paid. A board held by FREE_PLAYER_LIMIT (5) or fewer
   * players (shared/hostFee.ts `isFreeDraw`) draws without it, and reads as
   * paid once drawn. Always sent by the API; optional only so older fixtures
   * type-check (absent reads as paid).
   */
  paid?: boolean;
  /**
   * The host holds an active Club Pass (docs/payments.md "Club Pass"): the
   * club's public branding (its name shows only once the holder names it:
   * `shownClub` in shared/clubs.ts), and the board takes up to
   * CLUB_MAX_COHOSTS co-hosts (`cohostLimitOf`). null/absent on every other
   * board. Never says who owns the club beyond the host's public id.
   */
  club?: ClubBrand | null;
}

/** A club's branding as every one of its boards shows it. Public. */
export interface ClubBrand {
  /** The club's own random id (its logo and TV URLs), never tied to a clientId. */
  id: string;
  /** "" until the holder names the club: then the boards show no branding. */
  name: string;
  hasLogo: boolean;
  /** Changes with every new logo (the ETag; cache-busts /api/clubs/:id/logo?v=); null with no logo. */
  logoVersion: string | null;
}

/**
 * Someone who has joined a board (host included once they pick a name).
 *
 * Identity model: a device's `clientId` is a secret bearer credential sent only
 * as the `x-client-id` header and never appears in any response. Everything
 * public (GameState, live messages, results, activity) names people by their
 * public player id = base64url(SHA-256("jaxsquares:player:" + clientId)), first
 * 22 chars (shared/playerId.ts). The id is stable per device and can't be turned
 * back into the clientId. Devices signed in to one account share the account's
 * canonical clientId on the server, so they share one public id (MeResponse).
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
  | "final"
  | "rules"
  | "cohost";

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
  /**
   * The host edited the rules or prizes (PATCH format). `scoring` when who
   * wins changed (moments, square/reverse, fresh numbers), not just amounts,
   * notes, the unit or the square price. Never pushed.
   */
  rules: { scoring: boolean };
  /** Someone accepted a co-host invite (actor = the new co-host): "Maya is now a co-host". Pushed to the host only. */
  cohost: { name: string };
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
  /**
   * The other boards for the same game (a host's "$1, $5 and $20 boards"),
   * oldest first: present only on a board in a group (migration 0012), and
   * read with the board, so a sibling's squares left can trail it until this
   * board's next state. Public data only: no clientId, no admin token.
   */
  siblings?: SiblingBoard[];
}

/**
 * Another board for the same game, as a board's players see it ("More boards
 * for this game"). Built by `siblingSummary` in shared/siblings.ts.
 */
export interface SiblingBoard {
  id: string;
  name: string;
  status: GameStatus;
  /** Display-only square price in `unit`; null when none is set or the board is just for fun. In-app only. */
  squarePrice: number | null;
  unit: AmountUnit;
  justForFun: boolean;
  squaresLeft: number;
  totalSquares: number;
}

/** The host's public player profile on a dashboard summary ("Maya invited you"). */
export interface HostProfile {
  /** Public player id (= Game.hostPlayerId), never the clientId. */
  id: string;
  name: string;
  color: string;
  emoji: string;
}

/**
 * One row on the dashboard: a board this device hosts or has joined, or one it
 * only opened (an invite it hasn't acted on; `GET /api/me/games?seen=`).
 */
export interface GameSummary {
  id: string;
  name: string;
  sport: Sport;
  teamX: Team;
  teamY: Team;
  status: GameStatus;
  /**
   * Carries what an invite shows before anyone picks: the display-only square
   * price (`squarePrice` in `unit`) or `justForFun`, and the prize lineup.
   */
  format: GameFormat;
  isHost: boolean;
  /**
   * This identity co-hosts the board (shared/cohosts.ts): Home shows it with
   * the boards I host, tagged "Co-host". Sent by `GET /api/me/games`; absent reads as false.
   */
  isCohost?: boolean;
  /** This device has a player row on the board (false for a board it only opened). */
  joined: boolean;
  /** The host's public profile, or null when the host has no player row. */
  host: HostProfile | null;
  mySquares: number;
  claimed: number;
  totalSquares: number;
  playerCount: number;
  live: LiveStatus | null;
  /** Kickoff (Game.startsAt): the linked event's, or a custom board's host-set time; null = no set time. */
  startsAt: number | null;
  /**
   * Linked to a real game (live scores; locks itself at kickoff once the host
   * fee is paid). A custom board waits for its host to draw. Always sent by
   * `GET /api/me/games`.
   */
  linked?: boolean;
  /** Game.paid: the host fee is paid. Always sent by `GET /api/me/games`; absent reads as paid. */
  paid?: boolean;
  /**
   * Drawing would be free right now: FREE_PLAYER_LIMIT (5) or fewer players
   * hold squares (shared/hostFee.ts), so an unpaid linked board still draws
   * itself at kickoff. Sent by `GET /api/me/games`; absent reads as false.
   */
  freeDraw?: boolean;
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
  /**
   * Boards for the same game share this (the group's first board's id; see
   * GameState.siblings): Home shows a player's boards from one game together.
   * null for a board on its own. Sent by `GET /api/me/games`.
   */
  group?: string | null;
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
// never echoed back). Host-only endpoints also require `x-admin-token`. A
// signed-in device's clientId acts as its account's canonical one on the
// server (docs/auth.md); it still sends only its own.

export interface CreateGameInput {
  name: string;
  sport: Sport;
  league: League;
  teamX: Team;
  teamY: Team;
  /** With `rules` (current clients); a preset without rules is turned into rules. Notes inside are checked like prize notes. */
  format: GameFormat;
  /**
   * Legacy free-text notes from older clients (current ones send {} and put
   * notes in the rules); folded into the rules. Rejected (400) if one mentions
   * money (see validatePrizeNote).
   */
  prizes: Record<string, string>;
  maxPerPlayer: number;
  /** Set when the board is linked to a real game from /api/schedule. */
  linkedEvent: LinkedEvent | null;
  /**
   * Custom boards only: the host's kickoff time (epoch ms), or null for no set
   * time. From about a day ago to a year ahead (400 otherwise). A linked
   * board's kickoff is its event's, so this is ignored there.
   */
  startsAt?: number | null;
  /** The host's player profile, so they appear on the board right away. */
  host: { name: string; color: string; emoji: string };
  /**
   * "Add another board for this game": the board this one is made from. Only
   * that board's host may (its admin token as `x-admin-token`, or the same
   * identity that hosts it; 403 otherwise). The new board joins its group
   * and takes its game from it (sport, league, teams, linked event, kickoff;
   * those fields here are ignored). 409 once that game has started or is
   * over, or its group is full. The new board pays its own host fee at its
   * own draw, like any board.
   */
  fromGameId?: string;
}

export interface CreateGameResponse {
  game: Game;
  adminToken: string;
  /**
   * Always false: a new board opens right away, and the host fee is due when
   * the host draws the numbers (POST /lock answers 402 until it's paid).
   * Kept for app builds from when a board stayed in "draft" until paid.
   */
  paymentRequired: boolean;
}

/**
 * `code` of the 402 that POST /api/games/:id/lock answers on a board whose
 * host fee isn't paid yet and that more than FREE_PLAYER_LIMIT players hold
 * squares on (`{ error, code }`): the app opens the checkout, then draws.
 */
export const PAYMENT_REQUIRED_CODE = "payment_required";

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
  /**
   * Legacy free-text notes from older clients; on a board with rules they're
   * folded into the rules' notes. Rejected (400) if one mentions money (see validatePrizeNote).
   */
  prizes?: Record<string, string>;
  maxPerPlayer?: number;
  /**
   * New rules and prizes (the whole format). Amounts, notes, the unit and the
   * square price can change any time; which moments win and square/reverse
   * only until the first score (or host pick) is in, fresh numbers only until
   * the numbers are drawn (409 otherwise); the board size never.
   */
  format?: GameFormat;
  /**
   * Custom boards only: a new kickoff (epoch ms) or null for no set time,
   * validated like CreateGameInput.startsAt; 400 on a linked board.
   */
  startsAt?: number | null;
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
  /** Where it's played, when the provider says. */
  venue?: { name: string; city?: string; country?: string };
  /** Neither team's home field (bowls, international games, rivalry games at a third site). */
  neutralSite?: boolean;
  /** Poll ranks (college top 25) at kickoff time, when ranked. */
  ranks?: { home?: number; away?: number };
}

/**
 * A week of the season as the provider files it, e.g. "Week 7" or "Wild Card".
 * `id` is "<season type>-<week>" (1 preseason, 2 regular season, 3 postseason),
 * the value GET /api/schedule takes as `week`.
 */
export interface ScheduleWeek {
  id: string;
  label: string;
  startsAt: number;
  /** Exclusive end, epoch ms. */
  endsAt: number;
}

/**
 * GET /api/schedule?league=nfl[&week=2-8]. Without `week`: the first week that
 * still has games to link (this week, or next week once this one's are done)
 * plus the weeks after it, for picking further ahead. With `week`: that week's
 * games. `unavailable` is true when the provider couldn't be reached (still 200).
 */
export interface ScheduleResponse {
  events: ScheduleEvent[];
  unavailable?: boolean;
  /** The week `events` belongs to. */
  week?: ScheduleWeek | null;
  /** Later weeks through the end of the season (only without `week`). */
  weeks?: ScheduleWeek[];
}

/**
 * The host fee checkout: what a board costs its host (due when they draw the
 * numbers) and how this deployment takes it.
 */
export interface PaymentConfig {
  /** "test" simulates checkout with no charge; "live" uses Stripe / Apple IAP. */
  mode: "test" | "live";
  priceCents: number;
  currency: string;
  stripePublishableKey: string | null;
  iapProductId: string;
  /** How the Host Pass is sold here. Always sent; optional only so older fixtures type-check. */
  hostPass?: HostPassOffer;
  /** How the Club Pass is sold (the web only). Always sent; optional only so older fixtures type-check. */
  clubPass?: ClubPassOffer;
}

// ---- The Host Pass (docs/payments.md "Host Pass") ----
// A yearly subscription, an alternative to paying the host fee board by board:
// while it's active, drawing the numbers on any board its holder hosts costs
// nothing more. It belongs to the holder's identity (the account's, when signed
// in). Like the host fee, it's paid to JaxSquares; nothing moves between players.

/** Where a pass was bought: the web (Stripe), the iOS app (App Store), or the no-charge test checkout. */
export type HostPassProvider = "stripe" | "iap" | "test";

/**
 * active   – covers the host fee now
 * past_due – a renewal payment failed and is being retried; doesn't cover boards meanwhile
 * ended    – canceled or expired
 * revoked  – refunded
 */
export type HostPassStatus = "active" | "past_due" | "ended" | "revoked";

/** How the pass is sold. The iOS app shows the App Store's own price, never `priceCents` (App Store guideline 3.1.1). */
export interface HostPassOffer {
  /** The web price per year, in minor units of `currency` (1999 = "$19.99/year"). */
  priceCents: number;
  currency: string;
  /** App Store product id of the yearly auto-renewable subscription. */
  iapProductId: string;
  /** The web sells it: test mode (a no-charge test pass), or live mode once the Stripe price is set. */
  web: boolean;
}

/** An identity's Host Pass as the API reports it: never a clientId or a payment reference. */
export interface HostPass {
  /** Covers the host fee right now. */
  active: boolean;
  status: HostPassStatus;
  provider: HostPassProvider;
  /** Renews on this date (epoch ms) while it auto-renews and is paid up; else null. */
  renewsAt: number | null;
  /** Ends (or ended) on this date (epoch ms) when it won't renew; else null. */
  endsAt: number | null;
  autoRenew: boolean;
}

/** GET /api/payments/pass (and every pass route's answer): this identity's pass (null when it never had one) and the offer. */
export interface HostPassState {
  pass: HostPass | null;
  offer: HostPassOffer;
  /** This identity's Club Pass (null when it never had one). Always sent; optional so older fixtures type-check. */
  club?: HostPass | null;
  /** How the Club Pass is sold here. Always sent; optional so older fixtures type-check. */
  clubOffer?: ClubPassOffer;
}

// ---- The Club Pass (docs/payments.md "Club Pass") ----
// A yearly plan for bars, booster clubs, offices and fundraisers: everything
// the Host Pass does, plus the club's branding on the holder's boards, up to
// 10 co-hosts, a players CSV and a TV link that rotates the club's boards.
// Sold on the web only (Stripe Billing, signed in); the iOS app never offers
// it or links to buying it, but a holder's features work there. A row of
// host_passes with plan 'club': `HostPass` reads it the same way.

/** Which pass a host_passes row is. */
export type PassPlan = "host" | "club";

/** How the Club Pass is sold: on the web only, never in the iOS app. */
export interface ClubPassOffer {
  /** The price per year, in minor units of `currency` (4900 = "$49/year"). */
  priceCents: number;
  currency: string;
  /** The web sells it: test mode (a no-charge test pass), or live mode once its Stripe Price is set. */
  web: boolean;
}

/** One of the club's open or live boards, as the holder's club settings list them. */
export interface ClubBoard {
  id: string;
  name: string;
  status: GameStatus;
  squaresLeft: number;
  totalSquares: number;
  startsAt: number | null;
}

/** GET /api/clubs/mine (and every club settings route's answer): the holder's club. 404 without an active Club Pass. */
export interface ClubSettings {
  club: ClubBrand;
  /**
   * The current TV link's fingerprint (the first 8 hex of its token's hash),
   * null before there's one. Only a token's hash is kept, so the link itself
   * comes back once, when it's made (POST /api/clubs/mine/tv); a device keeps
   * it and shows it while this still matches.
   */
  tvKey: string | null;
  /** The club's open and live boards (what its TV goes round), newest kickoff last. */
  boards: ClubBoard[];
}

/** POST /api/clubs/mine/tv: a new TV link (the old one stops working). */
export interface ClubTvLink extends ClubSettings {
  /** `<origin>/club/<id>/tv#k=<token>`. */
  tvUrl: string;
}

/** GET /api/clubs/:id/tv (the TV link's token in x-club-tv-token): the club and its boards' public states. 404 for a wrong token. */
export interface ClubTvState {
  club: ClubBrand;
  /** The Club Pass is active; when it isn't, `boards` is empty. */
  active: boolean;
  /** Up to CLUB_TV_MAX_BOARDS of the club's open and live boards: live ones first, then by kickoff. */
  boards: GameState[];
}

/** POST /api/payments/pass/stripe: the first invoice's payment to confirm with Stripe.js, and what it charges. */
export interface HostPassIntent {
  clientSecret: string;
  amountCents: number;
  currency: string;
}

/** An App Store transaction for the pass, as StoreKit hands it over (`jws`: StoreKit 2's signed `jwsRepresentation`). */
export interface HostPassTransaction {
  transactionId: string;
  jws?: string;
}

/**
 * 409 `code` from POST /api/payments/pass/stripe for a device with no account:
 * a web subscription needs a sign-in first, or it would be lost with the browser.
 */
export const ACCOUNT_REQUIRED_CODE = "account_required";

export interface AppConfig {
  payments: PaymentConfig;
  /** Web push VAPID public key (base64url), null when push isn't configured. */
  vapidPublicKey: string | null;
  /** Which sign-in providers are set up. Always sent; optional so older fixtures type-check. */
  auth?: AuthConfig;
  /** Email notices are set up (docs/email.md); the app hides the opt-in otherwise. Always sent; optional for older fixtures. */
  emailEnabled?: boolean;
}

// ---- Optional email notices (docs/email.md) ----
// A player can ask for email about one board: when the numbers are drawn, if
// they win, and the final results. The address is private: only its owner
// ever sees it, masked ("j•••@gmail.com"), and it's deleted a week after the
// board's final.

/** none: no address for this board; pending: waiting for the confirmation link; unsubscribed: stopped from an email's link. */
export type EmailNoticeStatus = "none" | "pending" | "confirmed" | "unsubscribed";

/** GET / POST / DELETE /api/games/:id/email: the caller's own email notices for that board. */
export interface EmailNotices {
  status: EmailNoticeStatus;
  /** The owner's address, masked; null when there's none (or after unsubscribing). */
  email: string | null;
}

/** POST /api/games/:id/email: an address to confirm, or `resend: true` for the pending one's link again. */
export interface EmailNoticesInput {
  email?: string;
  resend?: boolean;
}

// ---- Optional sign-in (docs/auth.md) ----
// Playing never needs an account. Signing in with Apple or Google links this
// device to an account, and every device signed in to it acts as one player
// (the account's canonical clientId, resolved on the server). Nothing here is
// public: email and name are only ever shown to the account's owner.

export type AuthProvider = "apple" | "google";

/** Public OAuth client ids the server is set up with; a provider without one is hidden. */
export interface AuthConfig {
  /** Google "Web application" client id (Sign in with Google on the web); null = off there. */
  googleWebClientId: string | null;
  /** Google iOS client id (Sign in with Google in the iOS app); null = off there. */
  googleIosClientId: string | null;
  /** Apple Services ID (Sign in with Apple JS on the web); null = off there. */
  appleServicesId: string | null;
  /** Native Sign in with Apple in the iOS app (needs only the app's bundle id). */
  appleNative: boolean;
}

/** POST /api/auth/apple | /api/auth/google. */
export interface SignInInput {
  /** The provider's ID token (JWT). */
  idToken: string;
  /** The raw nonce; the token carries its SHA-256 (lowercase hex). */
  nonce?: string;
  /** Apple only: the authorization code, exchanged for a refresh token so deleting the account can revoke it. */
  authorizationCode?: string;
  /** Apple only: the name Apple returns once, on the first authorization (it isn't in the token). */
  name?: string;
  /** Sign in with Apple JS only: the redirect URI the authorization code was issued for. */
  redirectUri?: string;
}

/** POST /api/auth/sign-out: this device's push registration, so the account's pushes stop reaching it. */
export interface SignOutInput {
  endpoint?: string;
  token?: string;
}

/** Shown only to the account's owner ("Signed in with Apple · maya@example.com"). */
export interface AccountInfo {
  provider: AuthProvider;
  email: string | null;
  name: string | null;
  /** When the account was created, epoch ms. */
  since: number;
}

/**
 * GET /api/me and the sign-in response: who this device is. An object so
 * later fields (the Host Pass) can be added.
 */
export interface MeResponse {
  /** This device's public player id: the account's (canonical) one when signed in. "Mine" compares against it. */
  playerId: string;
  /** null when this device isn't signed in. */
  account: AccountInfo | null;
  /** Game id -> admin token for every board this identity hosts (never anyone else's). */
  hostTokens: Record<string, string>;
  /** The name, color and emoji this identity last joined a board with, if any (public on that board already). */
  profile?: { name: string; color: string; emoji: string } | null;
  /** This identity's Host Pass (null when it never had one). Always sent; optional so older fixtures type-check. */
  hostPass?: HostPass | null;
  /** This identity's Club Pass (null when it never had one). Always sent; optional so older fixtures type-check. */
  clubPass?: HostPass | null;
  /**
   * Ids of the boards this identity co-hosts (newest 200). No token: a co-host
   * is authorized by its clientId, so host tools show on every signed-in
   * device. Always sent; optional so older fixtures type-check.
   */
  cohostGames?: string[];
}

/** POST /api/games/:id/cohost-invites (host only): a single-use co-host invite link, `/g/<id>?cohost=<token>`. */
export interface CohostInviteResponse {
  url: string;
  /** When the link stops working, epoch ms (COHOST_INVITE_TTL_MS after it was made). */
  expiresAt: number;
}

/** POST /api/games/:id/cohosts/accept: the token from a co-host invite link. */
export interface CohostAcceptInput {
  token: string;
}

export type PushRegistration =
  | { platform: "web"; subscription: { endpoint: string; keys: { p256dh: string; auth: string } } }
  | { platform: "ios" | "android"; token: string };
