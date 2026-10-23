// All core D1 access. Row <-> domain mapping lives here so routes stay focused
// on validation and orchestration. (Module-owned tables live with their module:
// worker/payments/store.ts and worker/push/store.ts.)
//
// Identity: rows store the device's secret clientId (players.client_id,
// squares.client_id, games.host_client_id, cohosts.client_id); for a signed-in device that is its
// account's canonical clientId (worker/auth/canonical.ts resolves it before
// any route reads it). Every domain object built here for clients carries the
// public player id instead (worker/playerIds.ts); the clientId never leaves
// this file except as `Member.clientId` for push.
//
// Writes are built as prepared statements and run through `commit`, which
// appends a version bump and the full state read to the same batch: one round
// trip per mutation, and the state it returns is exactly what was written.

import { upgradeFormat } from "../shared/formats";
import { clubBrandOf } from "./clubs/brand";
import { isFreeHolderCount } from "../shared/hostFee";
import { gameKickoff } from "../shared/kickoff";
import { isPlayerId } from "../shared/playerId";
import {
  SEASON_PROVIDER,
  isSeasonNumbers,
  isSeasonScope,
  plannedGame,
  seasonPositionOf,
  seasonStateOf,
  seasonSummaryOf,
  type SeasonGameSource,
} from "../shared/season";
import { MAX_GROUP_BOARDS, siblingSummary } from "../shared/siblings";
import { boardPeriods, liveCell, liveLabel, myWins, primaryAward, resolveResults, totalSquares } from "../shared/squares";
import type {
  Activity,
  ClubBoard,
  Game,
  GameFormat,
  GameState,
  GameSummary,
  League,
  LinkedEvent,
  LiveStatus,
  ManualWinner,
  NumberDraw,
  Period,
  Player,
  PrizeCollected,
  Score,
  SeasonEvent,
  SeasonGame,
  SeasonPosition,
  SeasonSpec,
  SeasonState,
  SeasonSummary,
  SiblingBoard,
  Sport,
  Square,
  Team,
  TvDisplay,
} from "../shared/types";
import { playerIdMap, playerIdOf } from "./playerIds";

const ACTIVITY_LIMIT = 50;

/**
 * Server-only view of a player: the public Player plus the device's clientId,
 * which push needs to find their registered devices. Never send it to a client.
 */
export interface Member extends Player {
  clientId: string;
}

export interface GameRow {
  id: string;
  name: string;
  sport: string;
  league: string;
  team_x: string;
  team_y: string;
  format: string;
  periods: string;
  prizes: string;
  max_per_player: number;
  numbers: string | null;
  status: string;
  linked_event: string | null;
  starts_at: number | null;
  host_client_id: string;
  admin_token: string;
  created_at: number;
  locked_at: number | null;
  activated_at: number | null;
  payment_provider: string | null;
  payment_reference: string | null;
  payment_amount_cents: number | null;
  updated_at: number;
  version: number;
  /** When "your board is full" was announced (migration 0007); null until then. Server-only. */
  board_full_at?: number | null;
  /** When the host fee was paid (migration 0009); null = not yet. Public as `Game.paid`. */
  paid_at?: number | null;
  /** When the host was reminded to draw before kickoff (migration 0009). Server-only. */
  draw_reminder_at?: number | null;
  /** Boards for the same game share it: the group's first board's id (migration 0012); null = on its own. */
  board_group?: string | null;
  /** 'board' or 'season' (migration 0017). Absent before it: a board. */
  kind?: string | null;
  /** A season board: what it covers (StoredSeason JSON, public). */
  season?: string | null;
  /** A season's game board: its season board's id, and its game's event id. */
  season_id?: string | null;
  season_event?: string | null;
  /** A season board: when its team's schedule was last read for new games. Server-only. */
  season_synced_at?: number | null;
  /** What TV mode shows (TvDisplay JSON, migration 0020); null = every part at its default. */
  tv?: string | null;
}

interface PlayerRow {
  client_id: string;
  name: string;
  color: string;
  emoji: string;
  joined_at: number;
}

interface SquareRow {
  row: number;
  col: number;
  client_id: string;
  claimed_at: number;
}

interface ScoreRow {
  period_key: string;
  label: string | null;
  score_x: number;
  score_y: number;
  source: string;
  updated_at: number;
}

interface ManualWinnerRow {
  period_key: string;
  row: number;
  col: number;
  updated_at: number;
}

interface LiveRow {
  state: string;
  period: number;
  clock: string;
  detail: string;
  score_x: number;
  score_y: number;
  updated_at: number;
}

interface ActivityRow {
  id: string;
  type: string;
  at: number;
  actor: string | null;
  data: string;
}

function json<T>(text: string | null | undefined, fallback: T): T {
  if (text == null) return fallback;
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

/** `hostPlayerId` is the public id derived from `r.host_client_id`. */
export function rowToGame(r: GameRow, hostPlayerId: string): Game {
  const linkedEvent = json<LinkedEvent | null>(r.linked_event, null);
  return {
    id: r.id,
    name: r.name,
    sport: r.sport as Sport,
    league: r.league as League,
    teamX: json<Team>(r.team_x, { name: "Team X" }),
    teamY: json<Team>(r.team_y, { name: "Team Y" }),
    // A board saved with one "conversion" amount by score type reads it as the extra point's and the 2-point conversion's.
    format: upgradeFormat(json<GameFormat>(r.format, { periods: "quarters", reverse: false, boardSize: 100, freshNumbers: false })),
    periods: json<Period[]>(r.periods, []),
    prizes: json<Record<string, string>>(r.prizes, {}),
    maxPerPlayer: r.max_per_player,
    numbers: json<Record<string, NumberDraw> | null>(r.numbers, null),
    status: r.status as Game["status"],
    linkedEvent,
    // A linked board's kickoff is its event's; a custom board's is the host's (migration 0008).
    startsAt: linkedEvent?.startsAt ?? r.starts_at ?? null,
    hostPlayerId,
    createdAt: r.created_at,
    lockedAt: r.locked_at,
    // Grandfathered boards (made under pay-to-open) were stamped by migration 0009.
    paid: r.paid_at != null,
    // Season boards (migration 0017): only said where it's so, so every other board reads as before.
    ...(r.kind === "season" ? { kind: "season" as const } : {}),
    ...(r.season_id ? { seasonId: r.season_id } : {}),
    // The host's TV choices (migration 0020): only on a board whose host changed one.
    ...(r.tv ? { tv: json<TvDisplay>(r.tv, {}) } : {}),
  };
}

/** clientId -> public id; every id passed in must be in the map (see playerIdMap). */
type Ids = Map<string, string>;

const publicId = (ids: Ids, clientId: string): string => ids.get(clientId) ?? "";

const rowToPlayer =
  (ids: Ids, hostClientId: string) =>
  (r: PlayerRow): Player => ({
    id: publicId(ids, r.client_id),
    name: r.name,
    color: r.color,
    emoji: r.emoji,
    joinedAt: r.joined_at,
    isHost: r.client_id === hostClientId,
  });

const rowToSquare =
  (ids: Ids) =>
  (r: SquareRow): Square => ({ row: r.row, col: r.col, playerId: publicId(ids, r.client_id), claimedAt: r.claimed_at });

function rowToScore(r: ScoreRow): Score {
  const s: Score = {
    periodKey: r.period_key,
    scoreX: r.score_x,
    scoreY: r.score_y,
    source: r.source === "live" ? "live" : "host",
    updatedAt: r.updated_at,
  };
  if (r.label) s.label = r.label;
  return s;
}

const rowToManual = (r: ManualWinnerRow): ManualWinner => ({
  periodKey: r.period_key,
  row: r.row,
  col: r.col,
  updatedAt: r.updated_at,
});

interface PrizeClaimRow {
  period_key: string;
  side: string;
  client_id: string;
  collected_at: number;
  collected_by: string;
}

const rowToCollected =
  (ids: Ids) =>
  (r: PrizeClaimRow): PrizeCollected => ({
    periodKey: r.period_key,
    reverse: r.side === "reverse",
    playerId: publicId(ids, r.client_id),
    at: r.collected_at,
    by: r.collected_by === "winner" ? "winner" : "host",
  });

const rowToLive = (r: LiveRow): LiveStatus => ({
  state: r.state as LiveStatus["state"],
  period: r.period,
  clock: r.clock,
  detail: r.detail,
  scoreX: r.score_x,
  scoreY: r.score_y,
  updatedAt: r.updated_at,
});

/**
 * Activity rows store public ids. Rows written before public ids existed hold
 * clientIds (as `actor` and in a winner's `clientIds`); those are translated
 * here, and anything that isn't a known player or a well-formed public id is
 * dropped, so no clientId can ever reach a client through the feed. A value
 * that is already a member's public id stays as it is, even if a row's
 * clientId equals it (the API refuses such clientIds now; an older row may
 * hold one), so nobody can take over another player's entries.
 */
function rowToActivity(ids: Ids) {
  const publicIds = new Set(ids.values());
  const actorOf = (v: unknown): string | null =>
    typeof v !== "string" ? null : publicIds.has(v) ? v : (ids.get(v) ?? (isPlayerId(v) ? v : null));
  return (r: ActivityRow): Activity => {
    const data = json<Record<string, unknown>>(r.data, {});
    if (Array.isArray(data.clientIds)) {
      data.playerIds ??= data.clientIds.map(actorOf).filter((x): x is string => !!x);
      delete data.clientIds;
    }
    delete data.clientId;
    return { id: r.id, type: r.type as Activity["type"], at: r.at, actor: actorOf(r.actor), data };
  };
}

// ---- Reads ----

export async function getGameRow(db: D1Database, id: string): Promise<GameRow | null> {
  return db.prepare(`SELECT * FROM games WHERE id = ?`).bind(id).first<GameRow>();
}

export async function getGame(db: D1Database, id: string): Promise<Game | null> {
  const row = await getGameRow(db, id);
  return row ? rowToGame(row, await playerIdOf(row.host_client_id)) : null;
}

async function memberRows(db: D1Database, gameId: string): Promise<{ host: string; rows: PlayerRow[]; ids: Ids }> {
  const [game, players] = await db.batch([
    db.prepare(`SELECT host_client_id FROM games WHERE id = ?`).bind(gameId),
    db.prepare(`SELECT client_id, name, color, emoji, joined_at FROM players WHERE game_id = ? ORDER BY joined_at`).bind(gameId),
  ]);
  const host = (game.results[0] as { host_client_id: string } | undefined)?.host_client_id ?? "";
  const rows = players.results as PlayerRow[];
  const ids = await playerIdMap([host, ...rows.map((r) => r.client_id)].filter(Boolean));
  return { host, rows, ids };
}

/** Players with their clientIds. Server-only (push uses it to reach devices). */
export async function getMembers(db: D1Database, gameId: string): Promise<Member[]> {
  const { host, rows, ids } = await memberRows(db, gameId);
  const toPlayer = rowToPlayer(ids, host);
  const members: Member[] = rows.map((r) => ({ ...toPlayer(r), clientId: r.client_id }));
  // The host joins at creation; keep them reachable even if that row is missing.
  if (host && !members.some((m) => m.clientId === host)) {
    members.push({ id: publicId(ids, host), name: "", color: "", emoji: "", joinedAt: 0, isHost: true, clientId: host });
  }
  return members;
}

/** Public players (no clientIds). */
export async function getPlayers(db: D1Database, gameId: string): Promise<Player[]> {
  const { host, rows, ids } = await memberRows(db, gameId);
  return rows.map(rowToPlayer(ids, host));
}

/**
 * The board's host's clientId (server-only, never sent anywhere): whose Host
 * Pass can cover its fee when it's drawn (worker/payments/pass.ts).
 */
export async function hostClientIdOf(db: D1Database, gameId: string): Promise<string | null> {
  const row = await db.prepare(`SELECT host_client_id FROM games WHERE id = ?`).bind(gameId).first<{ host_client_id: string }>();
  return row?.host_client_id ?? null;
}

export async function getAdminToken(db: D1Database, gameId: string): Promise<string | null> {
  const row = await db.prepare(`SELECT admin_token FROM games WHERE id = ?`).bind(gameId).first<{ admin_token: string }>();
  return row?.admin_token ?? null;
}

/** The board whose co-hosts run board ?1: its season board for a season's game board, else itself. */
const RUN_BY = `COALESCE((SELECT season_id FROM games WHERE id = ?1), ?1)`;

function stateReads(db: D1Database, id: string): D1PreparedStatement[] {
  return [
    db.prepare(`SELECT * FROM games WHERE id = ?`).bind(id),
    db.prepare(`SELECT client_id, name, color, emoji, joined_at FROM players WHERE game_id = ? ORDER BY joined_at, rowid`).bind(id),
    db.prepare(`SELECT row, col, client_id, claimed_at FROM squares WHERE game_id = ?`).bind(id),
    db.prepare(`SELECT period_key, label, score_x, score_y, source, updated_at FROM scores WHERE game_id = ?`).bind(id),
    db.prepare(`SELECT period_key, row, col, updated_at FROM manual_winners WHERE game_id = ?`).bind(id),
    db.prepare(`SELECT state, period, clock, detail, score_x, score_y, updated_at FROM live_status WHERE game_id = ?`).bind(id),
    db
      .prepare(`SELECT id, type, at, actor, data FROM activity WHERE game_id = ? ORDER BY at DESC, rowid DESC LIMIT ${ACTIVITY_LIMIT}`)
      .bind(id),
    // Co-hosts (migration 0014), in the order they became co-hosts. A season's
    // game board is run by its season board's co-hosts (migration 0017).
    db.prepare(`SELECT client_id FROM cohosts WHERE game_id = ${RUN_BY} ORDER BY added_at, rowid`).bind(id),
    // Prizes handed over on a board with claim codes (migration 0019).
    db.prepare(`SELECT period_key, side, client_id, collected_at, collected_by FROM prize_claims WHERE game_id = ?`).bind(id),
  ];
}

/** The co-hosts' clientIds from a stateReads batch (server-only). */
const cohostRowsOf = (results: D1Result[]): string[] => ((results[7]?.results ?? []) as { client_id: string }[]).map((r) => r.client_id);

async function stateFrom(db: D1Database, results: D1Result[]): Promise<GameState | null> {
  const [games, players, squares, scores, manual, live, activity] = results;
  const row = games.results[0] as GameRow | undefined;
  if (!row) return null;
  const playerRows = players.results as PlayerRow[];
  const squareRows = squares.results as SquareRow[];
  const cohosts = cohostRowsOf(results);
  const claimRows = (results[8]?.results ?? []) as PrizeClaimRow[];
  const [ids, siblings, club, position] = await Promise.all([
    playerIdMap([row.host_client_id, ...playerRows.map((p) => p.client_id), ...squareRows.map((s) => s.client_id), ...cohosts, ...claimRows.map((r) => r.client_id)]),
    // Only a board in a group (migration 0012) reads its siblings: one more indexed query.
    row.board_group ? siblingsOf(db, row.id, row.board_group) : null,
    // The host's club while their Annual Pass + Venue is active (worker/clubs, cached per isolate): its public branding only.
    clubBrandOf(db, row.host_client_id),
    // A season's game board (migration 0017): where it sits in its season, one more round trip.
    row.season_id ? seasonPositionFor(db, row.id, row.season_id) : null,
  ]);
  const liveRow = live.results[0] as LiveRow | undefined;
  const state: GameState = {
    // Co-hosts by public id only.
    game: { ...rowToGame(row, publicId(ids, row.host_client_id)), cohostIds: cohosts.map((c) => publicId(ids, c)), club },
    players: playerRows.map(rowToPlayer(ids, row.host_client_id)),
    squares: squareRows.map(rowToSquare(ids)),
    scores: (scores.results as ScoreRow[]).map(rowToScore),
    manualWinners: (manual.results as ManualWinnerRow[]).map(rowToManual),
    live: liveRow ? rowToLive(liveRow) : null,
    activity: (activity.results as ActivityRow[]).map(rowToActivity(ids)),
    version: row.version,
  };
  if (siblings) state.siblings = siblings;
  if (state.game.format.claimCodes) state.collected = claimRows.map(rowToCollected(ids));
  if (position) state.seasonGame = position;
  // A season board (migration 0017): its games and standings, one more round trip.
  if (row.kind === "season") state.season = await seasonOf(db, row, state.squares);
  return state;
}

/**
 * The other boards in a board's group, oldest first, as public summaries
 * (shared/siblings.ts): never a clientId or an admin token.
 */
async function siblingsOf(db: D1Database, id: string, group: string): Promise<SiblingBoard[]> {
  const { results } = await db
    .prepare(
      `SELECT g.id, g.name, g.status, g.format, (SELECT COUNT(*) FROM squares s WHERE s.game_id = g.id) AS claimed
       FROM games g WHERE g.board_group = ?1 AND g.id <> ?2
       ORDER BY g.created_at, g.id LIMIT ?3`,
    )
    .bind(group, id, MAX_GROUP_BOARDS)
    .all<{ id: string; name: string; status: string; format: string; claimed: number }>();
  return results.map((r) =>
    siblingSummary(
      {
        id: r.id,
        name: r.name,
        status: r.status as Game["status"],
        format: json<GameFormat>(r.format, { periods: "quarters", reverse: false, boardSize: 100, freshNumbers: false }),
      },
      r.claimed,
    ),
  );
}

/** Full game state in one round trip (one more for a board in a group). */
export async function getGameState(db: D1Database, id: string): Promise<GameState | null> {
  return stateFrom(db, await db.batch(stateReads(db, id)));
}

/**
 * State plus the host's admin token (never sent to clients), in one round
 * trip, and whether `clientId` (the request's canonical one) co-hosts the
 * board: the host routes accept either.
 */
export async function getGameStateWithToken(
  db: D1Database,
  id: string,
  clientId = "",
): Promise<{ state: GameState; adminToken: string; cohost: boolean } | null> {
  const results = await db.batch(stateReads(db, id));
  const state = await stateFrom(db, results);
  if (!state) return null;
  const cohost = !!clientId && cohostRowsOf(results).includes(clientId);
  return { state, adminToken: (results[0].results[0] as GameRow).admin_token, cohost };
}

/**
 * Whether `clientId` (a request's canonical one) co-hosts the board (a
 * season's game board: its season board). Server-only (the payment routes'
 * host check).
 */
export async function isCohost(db: D1Database, gameId: string, clientId: string): Promise<boolean> {
  const row = await db.prepare(`SELECT 1 AS ok FROM cohosts WHERE game_id = ${RUN_BY} AND client_id = ?2`).bind(gameId, clientId).first<{ ok: number }>();
  return !!row;
}

/**
 * Runs `writes`, bumps the game's version and reads the resulting state, all in
 * one batch (a single transaction). `results` lines up with `writes`.
 */
export async function commit(
  db: D1Database,
  gameId: string,
  writes: D1PreparedStatement[],
  now = Date.now(),
): Promise<{ results: D1Result[]; state: GameState | null }> {
  const bump = db.prepare(`UPDATE games SET version = version + 1, updated_at = ? WHERE id = ?`).bind(now, gameId);
  const all = await db.batch([...writes, bump, ...stateReads(db, gameId)]);
  return { results: all.slice(0, writes.length), state: await stateFrom(db, all.slice(writes.length + 1)) };
}

// ---- Write statements (run them through commit) ----

export function newActivityId(): string {
  return crypto.randomUUID();
}

/** Plain activity insert; OR IGNORE makes re-sending the same activity harmless. `a.actor` must be a public id. */
export function insertActivity(db: D1Database, gameId: string, a: Activity): D1PreparedStatement {
  return db
    .prepare(`INSERT OR IGNORE INTO activity (id, game_id, type, at, actor, data) VALUES (?, ?, ?, ?, ?, ?)`)
    .bind(a.id, gameId, a.type, a.at, a.actor, JSON.stringify(a.data));
}

/** Activity recorded only if the statement right before it in the batch changed a row. */
export function insertActivityIfChanged(db: D1Database, gameId: string, a: Activity): D1PreparedStatement {
  return db
    .prepare(`INSERT INTO activity (id, game_id, type, at, actor, data) SELECT ?, ?, ?, ?, ?, ? WHERE changes() > 0`)
    .bind(a.id, gameId, a.type, a.at, a.actor, JSON.stringify(a.data));
}

export function insertGame(
  db: D1Database,
  game: Game,
  hostClientId: string,
  adminToken: string,
  host: Pick<Player, "name" | "color" | "emoji" | "joinedAt">,
  created: Activity,
): D1PreparedStatement[] {
  return [
    db
      .prepare(
        `INSERT INTO games
          (id, name, sport, league, team_x, team_y, format, periods, prizes, max_per_player,
           numbers, status, linked_event, starts_at, host_client_id, admin_token, created_at,
           locked_at, updated_at, version)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, NULL, ?, 1)`,
      )
      .bind(
        game.id,
        game.name,
        game.sport,
        game.league,
        JSON.stringify(game.teamX),
        JSON.stringify(game.teamY),
        JSON.stringify(game.format),
        JSON.stringify(game.periods),
        JSON.stringify(game.prizes),
        game.maxPerPlayer,
        game.status,
        game.linkedEvent ? JSON.stringify(game.linkedEvent) : null,
        gameKickoff(game),
        hostClientId,
        adminToken,
        game.createdAt,
        game.createdAt,
      ),
    db
      .prepare(`INSERT INTO players (game_id, client_id, name, color, emoji, joined_at) VALUES (?, ?, ?, ?, ?, ?)`)
      .bind(game.id, hostClientId, host.name, host.color, host.emoji, host.joinedAt),
    insertActivity(db, game.id, created),
  ];
}

/**
 * A board another one is being added to the game of ("Add another board for
 * this game"): the board, its host and token for the route's check, and what
 * decides whether its game can still take a board (SiblingCheck). Server-only:
 * it carries the host's clientId and the admin token.
 */
export interface GroupSource {
  game: Game;
  hostClientId: string;
  adminToken: string;
  /** The group it's in (migration 0012), or null on its own. */
  group: string | null;
  /** Boards in its group, itself included. */
  groupSize: number;
  live: LiveStatus["state"] | null;
  /** Any score is recorded on it. */
  scored: boolean;
}

export async function groupSourceOf(db: D1Database, id: string): Promise<GroupSource | null> {
  const [games, live, group, scored] = await db.batch([
    db.prepare(`SELECT * FROM games WHERE id = ?`).bind(id),
    db.prepare(`SELECT state FROM live_status WHERE game_id = ?`).bind(id),
    db.prepare(`SELECT COUNT(*) AS n FROM games WHERE board_group = (SELECT board_group FROM games WHERE id = ?1)`).bind(id),
    db.prepare(`SELECT EXISTS (SELECT 1 FROM scores WHERE game_id = ?) AS scored`).bind(id),
  ]);
  const row = games.results[0] as GameRow | undefined;
  if (!row) return null;
  const liveState = (live.results[0] as { state?: string } | undefined)?.state;
  return {
    game: rowToGame(row, await playerIdOf(row.host_client_id)),
    hostClientId: row.host_client_id,
    adminToken: row.admin_token,
    group: row.board_group ?? null,
    groupSize: Math.max(1, Number((group.results[0] as { n?: number } | undefined)?.n ?? 0)),
    live: liveState === "pre" || liveState === "in" || liveState === "post" ? liveState : null,
    scored: !!(scored.results[0] as { scored?: number } | undefined)?.scored,
  };
}

/**
 * Puts a new board in its source board's group (run in the creating batch,
 * after insertGame): the group is the source's, or the source's own id when
 * it had none, which stamps the source too. The source's version moves, so
 * its open boards take the new sibling.
 */
export function joinGroupStatements(db: D1Database, gameId: string, sourceId: string, group: string, now: number): D1PreparedStatement[] {
  return [
    db.prepare(`UPDATE games SET board_group = ?2 WHERE id = ?1`).bind(gameId, group),
    db
      .prepare(`UPDATE games SET board_group = COALESCE(board_group, ?2), version = version + 1, updated_at = ?3 WHERE id = ?1`)
      .bind(sourceId, group, now),
  ];
}

/** What a host's PATCH may change. `format` (rules + prizes) comes with its fixed `periods`. */
export interface GameFieldUpdate {
  name?: string;
  prizes?: Record<string, string>;
  maxPerPlayer?: number;
  format?: GameFormat;
  periods?: Period[];
  /** A custom board's kickoff (null = no set time). Never for a linked board: its event's time stays. */
  startsAt?: number | null;
  /** What TV mode shows (migration 0020). */
  tv?: TvDisplay;
}

export function updateGameFields(db: D1Database, gameId: string, fields: GameFieldUpdate): D1PreparedStatement | null {
  const sets: string[] = [];
  const args: (string | number | null)[] = [];
  if (fields.name !== undefined) {
    sets.push("name = ?");
    args.push(fields.name);
  }
  if (fields.prizes !== undefined) {
    sets.push("prizes = ?");
    args.push(JSON.stringify(fields.prizes));
  }
  if (fields.format !== undefined) {
    sets.push("format = ?");
    args.push(JSON.stringify(fields.format));
  }
  if (fields.periods !== undefined) {
    sets.push("periods = ?");
    args.push(JSON.stringify(fields.periods));
  }
  if (fields.maxPerPlayer !== undefined) {
    sets.push("max_per_player = ?");
    args.push(fields.maxPerPlayer);
  }
  if (fields.tv !== undefined) {
    sets.push("tv = ?");
    args.push(JSON.stringify(fields.tv));
  }
  if (fields.startsAt !== undefined) {
    // Guarded in SQL too: a linked board's starts_at is its event's.
    sets.push("starts_at = CASE WHEN linked_event IS NULL THEN ? ELSE starts_at END");
    args.push(fields.startsAt);
  }
  if (sets.length === 0) return null;
  return db.prepare(`UPDATE games SET ${sets.join(", ")} WHERE id = ?`).bind(...args, gameId);
}

export async function deleteGame(db: D1Database, gameId: string): Promise<boolean> {
  const tables = ["activity", "live_status", "manual_winners", "scores", "squares", "cohost_invites", "cohosts", "players", "prize_claims"];
  // A season board's game boards go with it (migration 0017), first.
  const kids = `SELECT id FROM games WHERE season_id = ?1`;
  const results = await db.batch([
    ...tables.map((t) => db.prepare(`DELETE FROM ${t} WHERE game_id IN (${kids})`).bind(gameId)),
    db.prepare(`DELETE FROM games WHERE season_id = ?1`).bind(gameId),
    ...tables.map((t) => db.prepare(`DELETE FROM ${t} WHERE game_id = ?`).bind(gameId)),
    db.prepare(`DELETE FROM games WHERE id = ?`).bind(gameId),
  ]);
  return (results[results.length - 1].meta.changes ?? 0) > 0;
}

/**
 * Insert or rename a player. A new player goes in only while the board has
 * fewer than `maxPlayers` (checked inside the transaction, so racing joins
 * can't overshoot); renames always apply.
 */
export function upsertPlayer(
  db: D1Database,
  gameId: string,
  p: { clientId: string; name: string; color: string; emoji: string; joinedAt: number },
  maxPlayers: number,
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO players (game_id, client_id, name, color, emoji, joined_at)
       SELECT ?1, ?2, ?3, ?4, ?5, ?6
       WHERE EXISTS (SELECT 1 FROM players WHERE game_id = ?1 AND client_id = ?2)
          OR (SELECT COUNT(*) FROM players WHERE game_id = ?1) < ?7
       ON CONFLICT (game_id, client_id) DO UPDATE SET name = excluded.name, color = excluded.color, emoji = excluded.emoji`,
    )
    .bind(gameId, p.clientId, p.name, p.color, p.emoji, p.joinedAt, maxPlayers);
}

/**
 * Host removes a player (by public id) and frees their squares; null when
 * nobody on the board has that id. Only while squares are still being picked
 * (re-checked inside the transaction), and never the host. A co-host taken off
 * the board stops being one too (the route decides who may remove a co-host).
 */
export async function removePlayer(db: D1Database, gameId: string, playerId: string): Promise<D1PreparedStatement[] | null> {
  const { rows, ids } = await memberRows(db, gameId);
  const clientId = rows.find((r) => publicId(ids, r.client_id) === playerId)?.client_id;
  if (!clientId) return null;
  const picking = `EXISTS (SELECT 1 FROM games WHERE id = ?1 AND status IN ('draft', 'open') AND host_client_id <> ?2)`;
  return [
    db.prepare(`DELETE FROM squares WHERE game_id = ?1 AND client_id = ?2 AND ${picking}`).bind(gameId, clientId),
    db.prepare(`DELETE FROM cohosts WHERE game_id = ?1 AND client_id = ?2 AND ${picking}`).bind(gameId, clientId),
    db.prepare(`DELETE FROM players WHERE game_id = ?1 AND client_id = ?2 AND ${picking}`).bind(gameId, clientId),
  ];
}

// ---- Season boards (migration 0017; shared/season.ts) ----

/**
 * What a season board keeps in games.season: what it covers, and every game
 * known for it (the ones the host saw at create, plus games the draw and the
 * cron found since: labels like "Wild Card" come from here). Public data.
 */
export interface StoredSeason extends SeasonSpec {
  events: SeasonEvent[];
}

/** A season board's stored season (null for any other board, or one that can't be read). */
export function storedSeasonOf(row: Pick<GameRow, "season">): StoredSeason | null {
  const s = json<StoredSeason | null>(row.season, null);
  if (!s || typeof s !== "object" || !isSeasonScope(s.scope) || !isSeasonNumbers(s.numbers)) return null;
  return { ...s, events: Array.isArray(s.events) ? s.events : [] };
}

/** Marks a board just inserted (insertGame, same batch) as a season board covering `season`. */
export function markSeasonStatement(db: D1Database, gameId: string, season: StoredSeason): D1PreparedStatement {
  return db.prepare(`UPDATE games SET kind = 'season', season = ?2 WHERE id = ?1`).bind(gameId, JSON.stringify(season));
}

/** Rewrites a season board's stored season (new games found, labels). */
export function storeSeasonStatement(db: D1Database, gameId: string, season: StoredSeason): D1PreparedStatement {
  return db.prepare(`UPDATE games SET season = ?2 WHERE id = ?1 AND kind = 'season'`).bind(gameId, JSON.stringify(season));
}

/** The columns of a season's game board the season reads. */
const SEASON_GAME_COLUMNS = `id, name, status, numbers, format, periods, prizes, sport, league, team_x, team_y, linked_event, starts_at, season_event`;
type SeasonGameRow = Pick<
  GameRow,
  "id" | "name" | "status" | "numbers" | "format" | "periods" | "prizes" | "sport" | "league" | "team_x" | "team_y" | "linked_event" | "starts_at" | "season_event"
>;

const inSeason = `game_id IN (SELECT id FROM games WHERE season_id = ?1)`;

/** A season's game board as a Game (enough of it for results). */
function seasonGameOfRow(r: SeasonGameRow): Game {
  return rowToGame({ ...(r as GameRow), host_client_id: "", admin_token: "", created_at: 0, locked_at: null, version: 0, updated_at: 0 } as GameRow, "");
}

/**
 * A season board's public season: what it covers, its games (each game
 * board's results, decided by that board, with the season's squares: every
 * game board holds the same ones) and the standings. Planned games before
 * the draw. One round trip; public ids only.
 */
async function seasonOf(db: D1Database, row: GameRow, squares: Square[]): Promise<SeasonState> {
  const stored = storedSeasonOf(row) ?? { scope: "games", numbers: "same", league: "nfl", team: null, year: null, label: row.name, events: [] };
  const { events, ...spec } = stored;
  const [kids, scores, manual, live] = await db.batch([
    db.prepare(`SELECT ${SEASON_GAME_COLUMNS} FROM games WHERE season_id = ?1 ORDER BY starts_at, id`).bind(row.id),
    db.prepare(`SELECT game_id, period_key, label, score_x, score_y, source, updated_at FROM scores WHERE ${inSeason}`).bind(row.id),
    db.prepare(`SELECT game_id, period_key, row, col, updated_at FROM manual_winners WHERE ${inSeason}`).bind(row.id),
    db.prepare(`SELECT game_id, state, period, clock, detail, score_x, score_y, updated_at FROM live_status WHERE ${inSeason}`).bind(row.id),
  ]);
  const by = <T extends { game_id: string }>(list: T[]) => {
    const m = new Map<string, T[]>();
    for (const r of list) m.set(r.game_id, [...(m.get(r.game_id) ?? []), r]);
    return m;
  };
  const scoresBy = by(scores.results as (ScoreRow & { game_id: string })[]);
  const manualBy = by(manual.results as (ManualWinnerRow & { game_id: string })[]);
  const liveBy = by(live.results as (LiveRow & { game_id: string })[]);
  const known = new Map(events.map((e) => [e.eventId, e]));
  const games: SeasonGameSource[] = (kids.results as SeasonGameRow[]).map((k) => {
    const event = known.get(k.season_event ?? "");
    const liveRow = liveBy.get(k.id)?.[0];
    return {
      game: seasonGameOfRow(k),
      eventId: k.season_event ?? "",
      ...(event?.label ? { label: event.label } : {}),
      ...(event?.playoff ? { playoff: true } : {}),
      scores: (scoresBy.get(k.id) ?? []).map(rowToScore),
      manualWinners: (manualBy.get(k.id) ?? []).map(rowToManual),
      live: liveRow ? rowToLive(liveRow) : null,
    };
  });
  return seasonStateOf(spec, { planned: events, games, squares });
}

/** Where a season's game board sits in its season (its season board's name, which game of how many). */
async function seasonPositionFor(db: D1Database, id: string, seasonId: string): Promise<SeasonPosition | null> {
  const [parent, kids] = await db.batch([
    db.prepare(`SELECT id, name FROM games WHERE id = ?`).bind(seasonId),
    db.prepare(`SELECT id FROM games WHERE season_id = ? ORDER BY starts_at, id`).bind(seasonId),
  ]);
  const p = parent.results[0] as { id: string; name: string } | undefined;
  if (!p) return null;
  return seasonPositionOf(p, (kids.results as { id: string }[]).map((k) => k.id), id);
}

/** One game board of a season, as the draw, the cron and the season board's edits need it. Server-only. */
export interface SeasonChild {
  id: string;
  eventId: string;
  status: Game["status"];
  linkedEvent: LinkedEvent | null;
  teamX: Team;
  teamY: Team;
  /** A score or a host pick is in (its rules are locked then). */
  scored: boolean;
  /** The feed has said the game started (or is over). */
  started: boolean;
}

/** A season board's game boards, by kickoff. */
export async function seasonChildren(db: D1Database, seasonId: string): Promise<SeasonChild[]> {
  const { results } = await db
    .prepare(
      `SELECT g.id, g.season_event, g.status, g.linked_event, g.team_x, g.team_y,
              (EXISTS (SELECT 1 FROM scores s WHERE s.game_id = g.id) OR EXISTS (SELECT 1 FROM manual_winners m WHERE m.game_id = g.id)) AS scored,
              EXISTS (SELECT 1 FROM live_status l WHERE l.game_id = g.id AND l.state <> 'pre') AS started
       FROM games g WHERE g.season_id = ? ORDER BY g.starts_at, g.id`,
    )
    .bind(seasonId)
    .all<{ id: string; season_event: string | null; status: string; linked_event: string | null; team_x: string; team_y: string; scored: number; started: number }>();
  return results.map((r) => ({
    id: r.id,
    eventId: r.season_event ?? "",
    status: r.status as Game["status"],
    linkedEvent: json<LinkedEvent | null>(r.linked_event, null),
    teamX: json<Team>(r.team_x, { name: "Team X" }),
    teamY: json<Team>(r.team_y, { name: "Team Y" }),
    scored: !!r.scored,
    started: !!r.started,
  }));
}

/** A new game board for a season: what the route decided (its id, teams, link, name, numbers). */
export interface NewSeasonGame {
  id: string;
  eventId: string;
  name: string;
  teamX: Team;
  teamY: Team;
  linkedEvent: LinkedEvent;
  numbers: Record<string, NumberDraw>;
}

/**
 * A game board for a drawn season board, in one batch: the board (locked,
 * paid through its season board: provider SEASON_PROVIDER, reference = the
 * season board's id, amount 0; the season board's host, admin token, sport,
 * league, rules and prizes, read from it in SQL so they're current), then
 * the season's players and squares copied, then a "locked" activity. The
 * board goes in only while the season board is drawn and the game has none
 * yet (the unique season_id + season_event index, OR IGNORE); every copy
 * after it checks the board went in as this season's board, so a lost race
 * (or an id that's taken) copies nothing anywhere.
 */
export function seasonGameStatements(db: D1Database, seasonId: string, g: NewSeasonGame, now: number): D1PreparedStatement[] {
  const made = `EXISTS (SELECT 1 FROM games WHERE id = ?1 AND season_id = ?2 AND season_event = ?3)`;
  return [
    db
      .prepare(
        `INSERT OR IGNORE INTO games
          (id, name, sport, league, team_x, team_y, format, periods, prizes, max_per_player, numbers, status,
           linked_event, starts_at, host_client_id, admin_token, created_at, locked_at, activated_at, updated_at, version,
           paid_at, payment_provider, payment_reference, payment_amount_cents, board_full_at, kind, season_id, season_event)
         SELECT ?1, ?4, p.sport, p.league, ?5, ?6, p.format, p.periods, '{}', p.max_per_player, ?7, 'locked',
           ?8, ?9, p.host_client_id, p.admin_token, ?10, ?10, ?10, ?10, 1,
           ?10, ?11, p.id, 0, ?10, 'board', p.id, ?3
         FROM games p WHERE p.id = ?2 AND p.kind = 'season' AND p.status = 'locked'`,
      )
      .bind(
        g.id,
        seasonId,
        g.eventId,
        g.name,
        JSON.stringify(g.teamX),
        JSON.stringify(g.teamY),
        JSON.stringify(g.numbers),
        JSON.stringify(g.linkedEvent),
        g.linkedEvent.startsAt,
        now,
        SEASON_PROVIDER,
      ),
    db
      .prepare(
        `INSERT OR IGNORE INTO players (game_id, client_id, name, color, emoji, joined_at)
         SELECT ?1, client_id, name, color, emoji, joined_at FROM players WHERE game_id = ?2 AND ${made}`,
      )
      .bind(g.id, seasonId, g.eventId),
    db
      .prepare(
        `INSERT OR IGNORE INTO squares (game_id, row, col, client_id, claimed_at)
         SELECT ?1, row, col, client_id, claimed_at FROM squares WHERE game_id = ?2 AND ${made}`,
      )
      .bind(g.id, seasonId, g.eventId),
    db
      .prepare(`INSERT INTO activity (id, game_id, type, at, actor, data) SELECT ?4, ?1, 'locked', ?5, NULL, '{"auto":true}' WHERE ${made}`)
      .bind(g.id, seasonId, g.eventId, newActivityId(), now),
  ];
}

/**
 * The season board's new rules and prizes reach its game boards that haven't
 * had a score or a host pick yet (the edit-lock rules: who wins locks at the
 * first score), and aren't over. Same batch as the season board's own edit.
 */
export function seasonFormatStatement(db: D1Database, seasonId: string, format: GameFormat, periods: Period[], now: number): D1PreparedStatement {
  return db
    .prepare(
      `UPDATE games SET format = ?2, periods = ?3, prizes = '{}', version = version + 1, updated_at = ?4
       WHERE season_id = ?1 AND status = 'locked'
         AND NOT EXISTS (SELECT 1 FROM scores s WHERE s.game_id = games.id)
         AND NOT EXISTS (SELECT 1 FROM manual_winners m WHERE m.game_id = games.id)`,
    )
    .bind(seasonId, JSON.stringify(format), JSON.stringify(periods), now);
}

/** A game board's new name (its season board was renamed). */
export function renameStatement(db: D1Database, gameId: string, name: string, now: number): D1PreparedStatement {
  return db.prepare(`UPDATE games SET name = ?2, version = version + 1, updated_at = ?3 WHERE id = ?1`).bind(gameId, name, now);
}

/** A game the provider moved (a flexed kickoff): its board's link and kickoff, only before it starts. */
export function moveSeasonGameStatement(db: D1Database, gameId: string, linkedEvent: LinkedEvent, now: number): D1PreparedStatement {
  return db
    .prepare(
      `UPDATE games SET linked_event = ?2, starts_at = ?3, version = version + 1, updated_at = ?4
       WHERE id = ?1 AND status = 'locked' AND NOT EXISTS (SELECT 1 FROM live_status l WHERE l.game_id = ?1 AND l.state <> 'pre')`,
    )
    .bind(gameId, JSON.stringify(linkedEvent), linkedEvent.startsAt, now);
}

/** Drawn season boards due a schedule read (never read, or read before `before`), oldest first. */
export async function seasonsDue(db: D1Database, before: number, limit: number): Promise<string[]> {
  const { results } = await db
    .prepare(
      `SELECT id FROM games WHERE kind = 'season' AND status = 'locked' AND (season_synced_at IS NULL OR season_synced_at <= ?1)
       ORDER BY season_synced_at LIMIT ?2`,
    )
    .bind(before, limit)
    .all<{ id: string }>();
  return results.map((r) => r.id);
}

/** When a season board's schedule was (or counts as) last read: the cron reads it again SEASON_SYNC_MS later. */
export function seasonSyncedStatement(db: D1Database, gameId: string, at: number): D1PreparedStatement {
  return db.prepare(`UPDATE games SET season_synced_at = ?2 WHERE id = ?1`).bind(gameId, at);
}

/** A season's game board's season board id, else null (email notices go to the season board's addresses). */
export async function seasonIdOf(db: D1Database, gameId: string): Promise<string | null> {
  const row = await db.prepare(`SELECT season_id FROM games WHERE id = ?`).bind(gameId).first<{ season_id: string | null }>();
  return row?.season_id ?? null;
}

/** Ids of a season board's game boards (deleting the season board deletes them too). */
export async function seasonChildIds(db: D1Database, seasonId: string): Promise<string[]> {
  const { results } = await db.prepare(`SELECT id FROM games WHERE season_id = ?`).bind(seasonId).all<{ id: string }>();
  return results.map((r) => r.id);
}

/**
 * Season boards on Home: each one's games at a glance (no results: the
 * season page has those), from its game boards and their live feeds.
 */
async function seasonSummariesFor(db: D1Database, parents: GameRow[], now: number): Promise<Map<string, SeasonSummary>> {
  const out = new Map<string, SeasonSummary>();
  if (parents.length === 0) return out;
  const ids = JSON.stringify(parents.map((p) => p.id));
  const [kids, live] = await db.batch([
    db
      .prepare(`SELECT ${SEASON_GAME_COLUMNS}, season_id FROM games WHERE season_id IN (SELECT value FROM json_each(?1)) ORDER BY starts_at, id`)
      .bind(ids),
    db
      .prepare(
        `SELECT game_id, state, period, clock, detail, score_x, score_y, updated_at FROM live_status
         WHERE game_id IN (SELECT id FROM games WHERE season_id IN (SELECT value FROM json_each(?1)))`,
      )
      .bind(ids),
  ]);
  const liveBy = new Map((live.results as (LiveRow & { game_id: string })[]).map((l) => [l.game_id, rowToLive(l)]));
  const kidsBy = new Map<string, (SeasonGameRow & { season_id: string })[]>();
  for (const k of kids.results as (SeasonGameRow & { season_id: string })[]) kidsBy.set(k.season_id, [...(kidsBy.get(k.season_id) ?? []), k]);
  for (const p of parents) {
    const stored = storedSeasonOf(p);
    if (!stored) continue;
    const rows = kidsBy.get(p.id) ?? [];
    const games: SeasonGame[] = rows.length
      ? rows.map((k, i) => {
          const g = seasonGameOfRow(k);
          const l = liveBy.get(k.id) ?? null;
          return {
            id: k.id,
            eventId: k.season_event ?? "",
            index: i + 1,
            startsAt: g.startsAt ?? 0,
            teamX: g.teamX,
            teamY: g.teamY,
            status: g.status,
            live: l?.state ?? null,
            score: l && l.state !== "pre" ? { scoreX: l.scoreX, scoreY: l.scoreY, label: liveLabel(l, g.status, g) } : null,
            winners: [],
          };
        })
      : [...stored.events].sort((a, b) => a.startsAt - b.startsAt).map((e, i) => plannedGame(stored, e, i + 1));
    out.set(p.id, seasonSummaryOf({ label: stored.label, games }, now));
  }
  return out;
}

// ---- Co-hosts (migration 0014; shared/cohosts.ts) ----

/** A new single-use co-host invite. Only the token's hash is stored. */
export function insertCohostInvite(db: D1Database, gameId: string, tokenHash: string, expiresAt: number): D1PreparedStatement {
  return db
    .prepare(`INSERT INTO cohost_invites (token_hash, game_id, expires_at, used_at) VALUES (?, ?, ?, NULL)`)
    .bind(tokenHash, gameId, expiresAt);
}

/** This board's co-host invite with that token hash (null when there's none), to say why it can't be used. */
export async function cohostInvite(
  db: D1Database,
  gameId: string,
  tokenHash: string,
): Promise<{ expiresAt: number; usedAt: number | null } | null> {
  const row = await db
    .prepare(`SELECT expires_at, used_at FROM cohost_invites WHERE token_hash = ? AND game_id = ?`)
    .bind(tokenHash, gameId)
    .first<{ expires_at: number; used_at: number | null }>();
  return row ? { expiresAt: row.expires_at, usedAt: row.used_at } : null;
}

/**
 * Accepting a co-host invite, in one transaction (run it through commit, with
 * insertActivityIfChanged right after): the invite is used up only while it's
 * unused and unexpired, the board has fewer than `max` co-hosts, and
 * `clientId` is a player there who isn't its host or a co-host already; then,
 * only if it was, `clientId` becomes a co-host. All checked inside the
 * statements, so racing accepts can't go past `max` or use one link twice.
 */
export function acceptCohostInvite(
  db: D1Database,
  a: { gameId: string; tokenHash: string; clientId: string; now: number; max: number },
): D1PreparedStatement[] {
  return [
    db
      .prepare(
        `UPDATE cohost_invites SET used_at = ?3
         WHERE token_hash = ?2 AND game_id = ?1 AND used_at IS NULL AND expires_at > ?3
           AND (SELECT COUNT(*) FROM cohosts WHERE game_id = ?1) < ?5
           AND EXISTS (SELECT 1 FROM players WHERE game_id = ?1 AND client_id = ?4)
           AND NOT EXISTS (SELECT 1 FROM games WHERE id = ?1 AND host_client_id = ?4)
           AND NOT EXISTS (SELECT 1 FROM cohosts WHERE game_id = ?1 AND client_id = ?4)`,
      )
      .bind(a.gameId, a.tokenHash, a.now, a.clientId, a.max),
    db.prepare(`INSERT INTO cohosts (game_id, client_id, added_at) SELECT ?1, ?2, ?3 WHERE changes() > 0`).bind(a.gameId, a.clientId, a.now),
  ];
}

/** Takes a co-host (by public id) off the board's co-hosts; they stay a player. Null when nobody co-hosts with that id. */
export async function removeCohost(db: D1Database, gameId: string, playerId: string): Promise<D1PreparedStatement | null> {
  const { results } = await db.prepare(`SELECT client_id FROM cohosts WHERE game_id = ?`).bind(gameId).all<{ client_id: string }>();
  const ids = await playerIdMap(results.map((r) => r.client_id));
  const clientId = results.find((r) => publicId(ids, r.client_id) === playerId)?.client_id;
  if (!clientId) return null;
  return db.prepare(`DELETE FROM cohosts WHERE game_id = ? AND client_id = ?`).bind(gameId, clientId);
}

/** Most board ids GET /api/me lists as co-hosted. */
const COHOST_GAMES_MAX = 200;

/** Ids of the boards `clientId` (the caller's own, resolved identity: never anyone else's) co-hosts, newest first. */
export async function cohostGamesFor(db: D1Database, clientId: string): Promise<string[]> {
  const { results } = await db
    .prepare(`SELECT game_id FROM cohosts WHERE client_id = ? ORDER BY added_at DESC LIMIT ?`)
    .bind(clientId, COHOST_GAMES_MAX)
    .all<{ game_id: string }>();
  return results.map((r) => r.game_id);
}

/** Housekeeping: drops co-host invites that expired or were used before `before`. Returns how many went. */
// ---- Pairing a TV (migration 0021) ----

/** A TV's new code; false when the code is taken (draw another). */
export async function insertTvPairing(db: D1Database, p: { code: string; tokenHash: string; now: number; expiresAt: number }): Promise<boolean> {
  // A taken code that has expired is free again.
  await db.prepare(`DELETE FROM tv_pairings WHERE code = ? AND expires_at < ?`).bind(p.code, p.now).run();
  const res = await db
    .prepare(`INSERT OR IGNORE INTO tv_pairings (code, token_hash, game_id, created_at, expires_at) VALUES (?, ?, NULL, ?, ?)`)
    .bind(p.code, p.tokenHash, p.now, p.expiresAt)
    .run();
  return (res.meta.changes ?? 0) > 0;
}

/** What a TV was sent, asked with its own secret's hash; null when the code is unknown, someone else's or expired. */
export async function tvPairing(db: D1Database, code: string, tokenHash: string, now: number): Promise<{ gameId: string | null; expiresAt: number } | null> {
  const row = await db
    .prepare(`SELECT game_id, expires_at FROM tv_pairings WHERE code = ? AND token_hash = ? AND expires_at >= ?`)
    .bind(code, tokenHash, now)
    .first<{ game_id: string | null; expires_at: number }>();
  return row ? { gameId: row.game_id, expiresAt: row.expires_at } : null;
}

/** Sends a board to the TV showing `code`; false when no live TV has it. */
export async function sendToTv(db: D1Database, code: string, gameId: string, now: number): Promise<boolean> {
  const res = await db.prepare(`UPDATE tv_pairings SET game_id = ? WHERE code = ? AND expires_at >= ?`).bind(gameId, code, now).run();
  return (res.meta.changes ?? 0) > 0;
}

export async function pruneTvPairings(db: D1Database, before: number): Promise<number> {
  const res = await db.prepare(`DELETE FROM tv_pairings WHERE expires_at < ?`).bind(before).run();
  return res.meta.changes ?? 0;
}

export async function pruneCohostInvites(db: D1Database, before: number): Promise<number> {
  const res = await db.prepare(`DELETE FROM cohost_invites WHERE expires_at < ?1 OR used_at < ?1`).bind(before).run();
  return res.meta.changes ?? 0;
}

/**
 * One conditional insert per cell. Each re-checks, inside the transaction, that
 * the board is open, the client has joined and is under the per-player cap, so
 * racing requests can never exceed the cap or claim after the lock.
 * Follow with claimActivity to record what was actually claimed.
 */
export function claimSquares(
  db: D1Database,
  gameId: string,
  clientId: string,
  cells: { row: number; col: number }[],
  now: number,
): D1PreparedStatement[] {
  const stmt = db.prepare(
    `INSERT OR IGNORE INTO squares (game_id, row, col, client_id, claimed_at)
     SELECT ?1, ?2, ?3, ?4, ?5
     WHERE EXISTS (SELECT 1 FROM games g WHERE g.id = ?1 AND g.status = 'open'
                   AND (g.max_per_player = 0
                        OR (SELECT COUNT(*) FROM squares s WHERE s.game_id = ?1 AND s.client_id = ?4) < g.max_per_player))
       AND EXISTS (SELECT 1 FROM players p WHERE p.game_id = ?1 AND p.client_id = ?4)`,
  );
  return cells.map((c) => stmt.bind(gameId, c.row, c.col, clientId, now));
}

/** "claimed" activity listing the cells this request actually got (none -> no row). Recorded under the public `actor` id. */
export function claimActivity(
  db: D1Database,
  gameId: string,
  id: string,
  who: { clientId: string; playerId: string },
  now: number,
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO activity (id, game_id, type, at, actor, data)
       SELECT ?1, ?2, 'claimed', ?3, ?5,
              json_object('count', COUNT(*), 'cells', json_group_array(json_object('row', row, 'col', col)))
       FROM squares WHERE game_id = ?2 AND client_id = ?4 AND claimed_at = ?3
       HAVING COUNT(*) > 0`,
    )
    .bind(id, gameId, now, who.clientId, who.playerId);
}

/**
 * Stamps the board as announced full, once: changes a row only on the first
 * claim that leaves no square open (checked inside the transaction, after the
 * claim's inserts), so "your board is full" goes out once per board, not again
 * after a square is given back and taken again. Never cleared.
 */
export function markBoardFull(db: D1Database, gameId: string, totalSquares: number, now: number): D1PreparedStatement {
  return db
    .prepare(
      `UPDATE games SET board_full_at = ?3
       WHERE id = ?1 AND status = 'open' AND board_full_at IS NULL
         AND (SELECT COUNT(*) FROM squares WHERE game_id = ?1) >= ?2`,
    )
    .bind(gameId, totalSquares, now);
}

/** Release the client's own squares, only while the board is open. */
export function releaseSquares(
  db: D1Database,
  gameId: string,
  clientId: string,
  cells: { row: number; col: number }[],
): D1PreparedStatement[] {
  const stmt = db.prepare(
    `DELETE FROM squares WHERE game_id = ?1 AND row = ?2 AND col = ?3 AND client_id = ?4
       AND EXISTS (SELECT 1 FROM games WHERE id = ?1 AND status = 'open')`,
  );
  return cells.map((c) => stmt.bind(gameId, c.row, c.col, clientId));
}

/**
 * open -> locked with the drawn numbers. No-op unless the board is open and
 * its host fee is paid (the routes say why first; this keeps a race honest).
 */
export function lockGame(db: D1Database, gameId: string, numbers: Record<string, NumberDraw>, now: number): D1PreparedStatement {
  return db
    .prepare(`UPDATE games SET status = 'locked', numbers = ?, locked_at = ? WHERE id = ? AND status = 'open' AND paid_at IS NOT NULL`)
    .bind(JSON.stringify(numbers), now, gameId);
}

const MARK_PAID = `UPDATE games SET paid_at = ?1, payment_provider = ?2, payment_reference = ?3, payment_amount_cents = ?4,
         activated_at = COALESCE(activated_at, ?1), status = CASE WHEN status = 'draft' THEN 'open' ELSE status END
       WHERE id = ?5 AND paid_at IS NULL`;

/**
 * Records the board's host fee: stamps paid_at with the purchase that paid
 * it (the ledger, worker/payments/store.ts, decides which one that is), or
 * with the Annual Pass that covered it (provider "pass", reference = the pass
 * id, amount 0). A legacy draft opens too. No-op once the board is paid.
 */
export function markPaid(
  db: D1Database,
  gameId: string,
  purchase: { provider: string; reference: string; amountCents: number },
  now: number,
): D1PreparedStatement {
  return db.prepare(MARK_PAID).bind(now, purchase.provider, purchase.reference, Math.trunc(purchase.amountCents) || 0, gameId);
}

/** `games.payment_provider`, and `payment_reference`, of a board drawn for free (amount 0). */
export const FREE_PROVIDER = "free";

/**
 * The free tier (shared/hostFee.ts): marks the board paid with provider
 * "free" (reference "free", amount 0), but only while `maxHolders` or fewer
 * distinct players hold its squares, counted inside this statement. Put it in
 * the same batch as lockGame, which needs paid_at: D1 runs each batch as one
 * transaction, one at a time, so a 6th player whose claim committed after the
 * route read the board makes both writes no-ops, and a claim that comes after
 * the draw finds the board locked (claimSquares re-checks it's open). A legacy
 * draft opens too, like any payment. No-op once the board is paid.
 */
export function markFreeDraw(db: D1Database, gameId: string, maxHolders: number, now: number): D1PreparedStatement {
  return db
    .prepare(`${MARK_PAID} AND (SELECT COUNT(DISTINCT client_id) FROM squares WHERE game_id = ?5) <= ?6`)
    .bind(now, FREE_PROVIDER, FREE_PROVIDER, 0, gameId, maxHolders);
}

/** How many different players hold squares on the board (the free tier's count, server side). */
export async function squareHolderCount(db: D1Database, gameId: string): Promise<number> {
  const row = await db.prepare(`SELECT COUNT(DISTINCT client_id) AS n FROM squares WHERE game_id = ?`).bind(gameId).first<{ n: number }>();
  return row?.n ?? 0;
}

export function setFinal(db: D1Database, gameId: string): D1PreparedStatement {
  return db.prepare(`UPDATE games SET status = 'final' WHERE id = ? AND status = 'locked'`).bind(gameId);
}

/** final -> locked, e.g. when the host removes the Final score of a typed-in board. */
export function reopenFinal(db: D1Database, gameId: string): D1PreparedStatement {
  return db.prepare(`UPDATE games SET status = 'locked' WHERE id = ? AND status = 'final'`).bind(gameId);
}

/** A host-entered score always wins over (and replaces) a live one. */
export function upsertHostScore(
  db: D1Database,
  gameId: string,
  s: { periodKey: string; label?: string | null; scoreX: number; scoreY: number },
  now: number,
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO scores (game_id, period_key, label, score_x, score_y, source, updated_at)
       VALUES (?, ?, ?, ?, ?, 'host', ?)
       ON CONFLICT (game_id, period_key) DO UPDATE SET
         label = COALESCE(excluded.label, scores.label), score_x = excluded.score_x,
         score_y = excluded.score_y, source = 'host', updated_at = excluded.updated_at`,
    )
    .bind(gameId, s.periodKey, s.label ?? null, s.scoreX, s.scoreY, now);
}

/** A provider score; never overwrites a host-entered score for the same period. */
export function upsertLiveScore(
  db: D1Database,
  gameId: string,
  s: { periodKey: string; label?: string | null; scoreX: number; scoreY: number },
  now: number,
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO scores (game_id, period_key, label, score_x, score_y, source, updated_at)
       VALUES (?, ?, ?, ?, ?, 'live', ?)
       ON CONFLICT (game_id, period_key) DO UPDATE SET
         label = COALESCE(excluded.label, scores.label), score_x = excluded.score_x,
         score_y = excluded.score_y, updated_at = excluded.updated_at
       WHERE scores.source = 'live'`,
    )
    .bind(gameId, s.periodKey, s.label ?? null, s.scoreX, s.scoreY, now);
}

export function deleteScore(db: D1Database, gameId: string, periodKey: string): D1PreparedStatement {
  return db.prepare(`DELETE FROM scores WHERE game_id = ? AND period_key = ?`).bind(gameId, periodKey);
}

/**
 * Drops an every-score entry the feed took back: only a provider score (a host
 * entry stays), then its host pick once the entry is gone, so a later entry
 * reusing the index is decided by its own score.
 */
export function deleteLiveEntry(db: D1Database, gameId: string, periodKey: string): D1PreparedStatement[] {
  return [
    db.prepare(`DELETE FROM scores WHERE game_id = ? AND period_key = ? AND source = 'live'`).bind(gameId, periodKey),
    db
      .prepare(
        `DELETE FROM manual_winners WHERE game_id = ?1 AND period_key = ?2
           AND NOT EXISTS (SELECT 1 FROM scores WHERE game_id = ?1 AND period_key = ?2)`,
      )
      .bind(gameId, periodKey),
  ];
}

export function upsertManualWinner(
  db: D1Database,
  gameId: string,
  w: { periodKey: string; row: number; col: number },
  now: number,
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO manual_winners (game_id, period_key, row, col, updated_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (game_id, period_key) DO UPDATE SET row = excluded.row, col = excluded.col, updated_at = excluded.updated_at`,
    )
    .bind(gameId, w.periodKey, w.row, w.col, now);
}

export function deleteManualWinner(db: D1Database, gameId: string, periodKey: string): D1PreparedStatement {
  return db.prepare(`DELETE FROM manual_winners WHERE game_id = ? AND period_key = ?`).bind(gameId, periodKey);
}

/** Marks an award's prize handed over to the winner `clientId` (replacing an earlier mark: a corrected score's old winner). */
export function collectPrize(
  db: D1Database,
  gameId: string,
  c: { periodKey: string; reverse: boolean; clientId: string; by: "host" | "winner" },
  now: number,
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO prize_claims (game_id, period_key, side, client_id, collected_at, collected_by) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (game_id, period_key, side) DO UPDATE SET client_id = excluded.client_id, collected_at = excluded.collected_at, collected_by = excluded.collected_by`,
    )
    .bind(gameId, c.periodKey, c.reverse ? "reverse" : "square", c.clientId, now, c.by);
}

export function uncollectPrize(db: D1Database, gameId: string, periodKey: string, reverse: boolean): D1PreparedStatement {
  return db.prepare(`DELETE FROM prize_claims WHERE game_id = ? AND period_key = ? AND side = ?`).bind(gameId, periodKey, reverse ? "reverse" : "square");
}

export function upsertLive(db: D1Database, gameId: string, live: LiveStatus): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO live_status (game_id, state, period, clock, detail, score_x, score_y, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (game_id) DO UPDATE SET state = excluded.state, period = excluded.period, clock = excluded.clock,
         detail = excluded.detail, score_x = excluded.score_x, score_y = excluded.score_y, updated_at = excluded.updated_at`,
    )
    .bind(gameId, live.state, live.period, live.clock, live.detail, live.scoreX, live.scoreY, live.updatedAt);
}

// ---- Cron / dashboard ----

/**
 * Linked boards that kick off within `leadMs` or are still in progress. A
 * custom board's kickoff is in starts_at too, but it has no feed to poll.
 */
export async function gamesToWake(db: D1Database, now: number, leadMs: number): Promise<string[]> {
  const { results } = await db
    .prepare(
      `SELECT g.id FROM games g LEFT JOIN live_status l ON l.game_id = g.id
       WHERE g.linked_event IS NOT NULL AND g.starts_at IS NOT NULL AND g.starts_at <= ?1 AND g.starts_at >= ?2
         AND g.status IN ('open', 'locked')
         AND (l.state IS NULL OR l.state <> 'post')
       ORDER BY g.starts_at LIMIT 500`,
    )
    // Games that started more than 12h ago without a final are abandoned by the provider.
    .bind(now + leadMs, now - 12 * 60 * 60 * 1000)
    .all<{ id: string }>();
  return results.map((r) => r.id);
}

interface DashboardRow extends GameRow {
  claimed: number;
  my_squares: number;
  player_count: number;
  /** Players holding at least one square (the free tier's count). */
  holders: number;
  joined: number;
  /** This identity co-hosts the board. */
  cohost: number;
  /** The host's player row (null when there is none). */
  host_name: string | null;
  host_color: string | null;
  host_emoji: string | null;
}

/**
 * Boards this device hosts, co-hosts or has joined, plus the boards it only opened
 * (`seen`: invite links it hasn't acted on, already validated by the route),
 * most recently active first. Seen ids that no longer exist are simply absent.
 * Everything returned is public: the caller's clientId only selects rows.
 */
export async function listGamesForClient(
  db: D1Database,
  clientId: string,
  seen: readonly string[] = [],
  limit = 100,
): Promise<GameSummary[]> {
  const { results: rows } = await db
    .prepare(
      `SELECT g.*,
         (SELECT COUNT(*) FROM squares s WHERE s.game_id = g.id) AS claimed,
         (SELECT COUNT(*) FROM squares s WHERE s.game_id = g.id AND s.client_id = ?1) AS my_squares,
         (SELECT COUNT(*) FROM players p WHERE p.game_id = g.id) AS player_count,
         (SELECT COUNT(DISTINCT s.client_id) FROM squares s WHERE s.game_id = g.id) AS holders,
         EXISTS (SELECT 1 FROM players p WHERE p.game_id = g.id AND p.client_id = ?1) AS joined,
         EXISTS (SELECT 1 FROM cohosts c WHERE c.game_id = g.id AND c.client_id = ?1) AS cohost,
         hp.name AS host_name, hp.color AS host_color, hp.emoji AS host_emoji
       FROM games g
       LEFT JOIN players hp ON hp.game_id = g.id AND hp.client_id = g.host_client_id
       WHERE (g.id IN (
               SELECT m.id FROM games m
               WHERE m.season_id IS NULL
                 AND (m.host_client_id = ?1
                  OR EXISTS (SELECT 1 FROM players p WHERE p.game_id = m.id AND p.client_id = ?1)
                  OR EXISTS (SELECT 1 FROM cohosts c WHERE c.game_id = m.id AND c.client_id = ?1))
               ORDER BY m.updated_at DESC
               LIMIT ?2
             )
          -- Every seen board that exists, whatever the cap did to mine (a missing one reads as deleted).
          OR g.id IN (SELECT value FROM json_each(?3)))
         -- A season's game boards never show on Home: their season board does (migration 0017).
         AND g.season_id IS NULL
       ORDER BY g.updated_at DESC`,
    )
    .bind(clientId, limit, JSON.stringify(seen))
    .all<DashboardRow>();
  if (rows.length === 0) return [];
  const me = await playerIdOf(clientId);
  const hostIds = await playerIdMap(rows.map((r) => r.host_client_id));

  const ids = JSON.stringify(rows.map((r) => r.id));
  // Every square only where numbers are drawn: that's where a winner or the
  // live leader can be someone else. Elsewhere nothing is decided yet.
  const drawnIds = JSON.stringify(rows.filter((r) => r.numbers !== null).map((r) => r.id));
  const inIds = `game_id IN (SELECT value FROM json_each(?1))`;
  const [live, scores, manual, drawnSquares] = await db.batch([
    db.prepare(`SELECT game_id, state, period, clock, detail, score_x, score_y, updated_at FROM live_status WHERE ${inIds}`).bind(ids),
    db.prepare(`SELECT game_id, period_key, label, score_x, score_y, source, updated_at FROM scores WHERE ${inIds}`).bind(ids),
    db.prepare(`SELECT game_id, period_key, row, col, updated_at FROM manual_winners WHERE ${inIds}`).bind(ids),
    db.prepare(`SELECT game_id, row, col, client_id, claimed_at FROM squares WHERE ${inIds}`).bind(drawnIds),
  ]);

  const group = <T extends { game_id: string }>(list: T[]) => {
    const m = new Map<string, T[]>();
    for (const r of list) m.set(r.game_id, [...(m.get(r.game_id) ?? []), r]);
    return m;
  };
  const liveBy = group(live.results as (LiveRow & { game_id: string })[]);
  // Season boards (migration 0017): the game on now or next, from their game boards.
  const seasons = await seasonSummariesFor(
    db,
    rows.filter((r) => r.kind === "season"),
    Date.now(),
  );
  const scoresBy = group(scores.results as (ScoreRow & { game_id: string })[]);
  const manualBy = group(manual.results as (ManualWinnerRow & { game_id: string })[]);
  const squareRows = drawnSquares.results as (SquareRow & { game_id: string })[];
  const squaresBy = group(squareRows);
  const toSquare = rowToSquare(await playerIdMap([clientId, ...squareRows.map((s) => s.client_id)]));

  return rows.map((r) => {
    const game = rowToGame(r, publicId(hostIds, r.host_client_id));
    const liveRow = liveBy.get(r.id)?.[0];
    const liveStatus = liveRow ? rowToLive(liveRow) : null;
    const squares = (squaresBy.get(r.id) ?? []).map(toSquare);
    const boardScores = (scoresBy.get(r.id) ?? []).map(rowToScore);
    const manualWinners = (manualBy.get(r.id) ?? []).map(rowToManual);
    const results = resolveResults({ game, squares, scores: boardScores, manualWinners });
    const season = seasons.get(r.id) ?? null;
    const summary: GameSummary = {
      id: game.id,
      name: game.name,
      sport: game.sport,
      league: game.league,
      teamX: game.teamX,
      teamY: game.teamY,
      status: game.status,
      format: game.format,
      isHost: r.host_client_id === clientId,
      isCohost: !!r.cohost,
      joined: !!r.joined,
      linked: game.linkedEvent !== null,
      paid: game.paid,
      freeDraw: isFreeHolderCount(r.holders),
      // Public profile only: the host's public id, never their clientId.
      host: r.host_name !== null ? { id: game.hostPlayerId, name: r.host_name, color: r.host_color ?? "", emoji: r.host_emoji ?? "" } : null,
      mySquares: r.my_squares,
      claimed: r.claimed,
      totalSquares: totalSquares(game.format.boardSize),
      playerCount: r.player_count,
      live: liveStatus,
      startsAt: gameKickoff(game),
      myWins: myWins(results, me).map((w) => ({
        periodKey: w.periodKey,
        label: w.reverse ? `${w.label} (reverse)` : w.label,
      })),
      lastActivityAt: r.updated_at,
      createdAt: game.createdAt,
      latestScore: latestScoreOf(game, boardScores, liveStatus),
      leaderPlayerId: leaderOf({ game, squares, live: liveStatus, scores: boardScores, manualWinners }, results),
      // Read with the row, before the batch above: everything else is at least this new.
      version: r.version,
      // Boards for the same game (migration 0012): Home shows them together.
      group: r.board_group ?? null,
    };
    if (r.kind !== "season") return summary;
    // A season board reads as the game on now or next: its kickoff, its feed and score.
    const current = season?.current ?? null;
    return {
      ...summary,
      kind: "season",
      season,
      startsAt: current?.startsAt ?? null,
      latestScore: current?.score ?? null,
      leaderPlayerId: null,
    };
  });
}

/** The live feed's score while it's on (or over), else the latest recorded period's. */
export function latestScoreOf(
  game: Pick<Game, "format" | "periods" | "status"> & Partial<Pick<Game, "sport" | "league">>,
  scores: Score[],
  live: LiveStatus | null,
): GameSummary["latestScore"] {
  if (live && live.state !== "pre") return { scoreX: live.scoreX, scoreY: live.scoreY, label: liveLabel(live, game.status, game) };
  const byKey = new Map(scores.map((s) => [s.periodKey, s]));
  const last = boardPeriods(game, scores)
    .filter((p) => byKey.has(p.key))
    .at(-1);
  const score = last ? byKey.get(last.key) : undefined;
  return last && score ? { scoreX: score.scoreX, scoreY: score.scoreY, label: last.label } : null;
}

/** Who holds the square the live score points at; with no live square, the latest period's winner. */
export function leaderOf(
  state: Pick<GameState, "game" | "squares" | "live" | "scores" | "manualWinners">,
  results: ReturnType<typeof resolveResults>,
): string | null {
  const now = liveCell(state);
  if (now) return now.playerId;
  const last = results.at(-1);
  return last ? primaryAward(last).playerId : null;
}

// ---- Accounts (optional sign-in: worker/auth, docs/auth.md) ----

/** A clientId with its public id. */
export interface ClientIds {
  clientId: string;
  playerId: string;
}

/**
 * Statements that move every core row of `from` (a device signing in to an
 * account) to `to` (the account's canonical clientId), run in one batch with
 * the device's link (worker/auth/store.ts linkDevice). In order:
 * 0. reads the ids of the boards it touches (so their rooms can be sent the
 *    new state): hosted, co-hosted, joined or holding squares;
 * 1. bumps those boards' versions, so every client takes the new state;
 * 2. renames the device's public id in their feed (`actor`, or a legacy row's
 *    clientId) and in winner rows' `playerIds`;
 * 3. moves its players rows (where both are on a board, the canonical row
 *    stays and the device's goes), squares and hosted boards;
 * 4. moves its co-host rows the same way, so a co-host who signs in on another
 *    device stays one, then drops the account's co-host row on a board the
 *    account now hosts (one device hosted it, another co-hosted it: it's the
 *    host). No board gains a co-host here, so each stays within MAX_COHOSTS.
 * `cohost_invites` has no client column (an invite is the board host's), so
 * nothing there moves. A board can end up with more of the account's squares
 * than its squares-per-player cap: they were each picked within it.
 */
export function mergeClientStatements(db: D1Database, from: ClientIds, to: ClientIds, now: number): D1PreparedStatement[] {
  const touched = `SELECT id FROM games WHERE host_client_id = ?1
    UNION SELECT game_id FROM players WHERE client_id = ?1
    UNION SELECT game_id FROM squares WHERE client_id = ?1
    UNION SELECT game_id FROM cohosts WHERE client_id = ?1`;
  return [
    db.prepare(touched).bind(from.clientId),
    db.prepare(`UPDATE games SET version = version + 1, updated_at = ?2 WHERE id IN (${touched})`).bind(from.clientId, now),
    db
      .prepare(`UPDATE activity SET actor = ?3 WHERE game_id IN (${touched}) AND actor IN (?1, ?2)`)
      .bind(from.clientId, from.playerId, to.playerId),
    db
      .prepare(
        `UPDATE activity SET data = replace(data, '"' || ?2 || '"', '"' || ?3 || '"')
         WHERE game_id IN (${touched}) AND type = 'winner' AND instr(data, ?2) > 0`,
      )
      .bind(from.clientId, from.playerId, to.playerId),
    db
      .prepare(
        `INSERT OR IGNORE INTO players (game_id, client_id, name, color, emoji, joined_at)
         SELECT game_id, ?2, name, color, emoji, joined_at FROM players WHERE client_id = ?1`,
      )
      .bind(from.clientId, to.clientId),
    db.prepare(`DELETE FROM players WHERE client_id = ?`).bind(from.clientId),
    db.prepare(`UPDATE squares SET client_id = ?2 WHERE client_id = ?1`).bind(from.clientId, to.clientId),
    // Prizes handed over (migration 0019) go with the squares that won them.
    db.prepare(`UPDATE prize_claims SET client_id = ?2 WHERE client_id = ?1`).bind(from.clientId, to.clientId),
    db.prepare(`UPDATE games SET host_client_id = ?2 WHERE host_client_id = ?1`).bind(from.clientId, to.clientId),
    db
      .prepare(`INSERT OR IGNORE INTO cohosts (game_id, client_id, added_at) SELECT game_id, ?2, added_at FROM cohosts WHERE client_id = ?1`)
      .bind(from.clientId, to.clientId),
    db.prepare(`DELETE FROM cohosts WHERE client_id = ?`).bind(from.clientId),
    db
      .prepare(`DELETE FROM cohosts WHERE client_id = ?1 AND game_id IN (SELECT id FROM games WHERE host_client_id = ?1)`)
      .bind(to.clientId),
  ];
}

/** Most boards whose admin tokens GET /api/me hands back. */
const HOST_TOKENS_MAX = 200;

/**
 * Game id -> admin token for the boards `clientId` hosts (the caller's own,
 * resolved identity: never anyone else's), newest first.
 */
export async function hostTokensFor(db: D1Database, clientId: string): Promise<Record<string, string>> {
  const { results } = await db
    .prepare(`SELECT id, admin_token FROM games WHERE host_client_id = ? AND season_id IS NULL ORDER BY created_at DESC LIMIT ?`)
    .bind(clientId, HOST_TOKENS_MAX)
    .all<{ id: string; admin_token: string }>();
  return Object.fromEntries(results.map((r) => [r.id, r.admin_token]));
}

// ---- The Annual Pass + Venue (worker/clubs): a holder's boards ----

/** A board that hasn't moved in this long, with its kickoff past (or none), no longer goes round on the club's TV. */
const CLUB_BOARD_STALE_MS = 14 * 24 * 60 * 60_000;
/** A season's game board goes round on the club's TV from this long before its kickoff (and while it's on). */
const CLUB_SEASON_SOON_MS = 6 * 60 * 60_000;

/**
 * The open and live boards `clientId` (an Annual Pass + Venue holder's canonical
 * clientId: the caller's own, or the owner of a club whose TV link checked
 * out) hosts, as their club settings list them and their TV goes round:
 * live games first, then drawn boards, then boards being picked, each by
 * kickoff (boards without one last, newest first).
 * A board drawn long ago that nobody ended stops showing after a while.
 */
export async function clubBoards(db: D1Database, clientId: string, now: number, limit: number): Promise<ClubBoard[]> {
  const { results } = await db
    .prepare(
      `SELECT g.id, g.name, g.status, g.format, g.starts_at, g.linked_event,
              (SELECT COUNT(*) FROM squares s WHERE s.game_id = g.id) AS claimed
       FROM games g
       WHERE g.host_client_id = ?1 AND g.status IN ('open', 'locked')
         AND (g.updated_at >= ?2 OR g.starts_at >= ?3)
         -- A season board shows while squares are picked; then its game boards do, only the
         -- one on now or kicking off within the next few hours (migration 0017).
         AND NOT (g.kind = 'season' AND g.status <> 'open')
         AND (g.season_id IS NULL
              OR EXISTS (SELECT 1 FROM live_status l WHERE l.game_id = g.id AND l.state = 'in')
              OR (g.starts_at BETWEEN ?5 AND ?6 AND NOT EXISTS (SELECT 1 FROM live_status l WHERE l.game_id = g.id AND l.state = 'post')))
       ORDER BY EXISTS (SELECT 1 FROM live_status l WHERE l.game_id = g.id AND l.state = 'in') DESC,
                g.status = 'locked' DESC, g.starts_at IS NULL, g.starts_at, g.created_at DESC
       LIMIT ?4`,
    )
    .bind(clientId, now - CLUB_BOARD_STALE_MS, now - 12 * 60 * 60_000, limit, now - 6 * 60 * 60_000, now + CLUB_SEASON_SOON_MS)
    .all<{ id: string; name: string; status: string; format: string; starts_at: number | null; linked_event: string | null; claimed: number }>();
  return results.map((r) => {
    const format = json<GameFormat>(r.format, { periods: "quarters", reverse: false, boardSize: 100, freshNumbers: false });
    const total = totalSquares(format.boardSize);
    return {
      id: r.id,
      name: r.name,
      status: r.status as Game["status"],
      squaresLeft: Math.max(0, total - Number(r.claimed ?? 0)),
      totalSquares: total,
      startsAt: json<LinkedEvent | null>(r.linked_event, null)?.startsAt ?? r.starts_at ?? null,
    };
  });
}

/** The name, color and emoji `clientId` last joined a board with (public on that board), or null. */
export async function latestProfileOf(db: D1Database, clientId: string): Promise<{ name: string; color: string; emoji: string } | null> {
  const row = await db
    .prepare(`SELECT name, color, emoji FROM players WHERE client_id = ? AND name <> '' ORDER BY joined_at DESC LIMIT 1`)
    .bind(clientId)
    .first<{ name: string; color: string; emoji: string }>();
  return row ? { name: row.name, color: row.color, emoji: row.emoji } : null;
}

// ---- Rate limits (table from migrations/0005_housekeeping.sql) ----

/**
 * Fixed-window counter: counts one hit for `key` in the window containing
 * `now` and returns the hits so far in that window (this one included).
 */
export async function hitRateLimit(db: D1Database, key: string, windowMs: number, now: number): Promise<number> {
  const windowStart = now - (now % windowMs);
  const row = await db
    .prepare(
      `INSERT INTO rate_limits (key, window_start, count) VALUES (?1, ?2, 1)
       ON CONFLICT (key) DO UPDATE SET
         count = CASE WHEN rate_limits.window_start = excluded.window_start THEN rate_limits.count + 1 ELSE 1 END,
         window_start = excluded.window_start
       RETURNING count`,
    )
    .bind(key, windowStart)
    .first<{ count: number }>();
  return row?.count ?? 1;
}

/**
 * Claims the linked boards due a "kickoff soon, draw the numbers" reminder:
 * still open with the host fee unpaid and more than `freeHolders` players
 * holding squares (a free board draws itself at kickoff; it isn't stamped,
 * so it's reminded if it grows past that before kickoff), kicking off within
 * `leadMs`, made at least `minAgeMs` ago (a host setting up right now doesn't
 * need one), and not reminded yet. Stamped in the same statement, so each
 * board gets one.
 */
export async function claimDrawReminders(
  db: D1Database,
  now: number,
  leadMs: number,
  minAgeMs: number,
  freeHolders: number,
): Promise<{ id: string; hostClientId: string; venue: boolean }[]> {
  const { results } = await db
    .prepare(
      `UPDATE games SET draw_reminder_at = ?1
       WHERE linked_event IS NOT NULL AND starts_at IS NOT NULL AND starts_at > ?1 AND starts_at <= ?2
         AND status = 'open' AND paid_at IS NULL AND draw_reminder_at IS NULL AND created_at <= ?3
         AND (SELECT COUNT(DISTINCT s.client_id) FROM squares s WHERE s.game_id = games.id) > ?4
       RETURNING id, host_client_id, json_extract(format, '$.venue') AS venue`,
    )
    .bind(now, now + leadMs, now - minAgeMs, freeHolders)
    .all<{ id: string; host_client_id: string; venue: number | null }>();
  // Server-only: the cron skips hosts whose Annual Pass covers the board (worker/payments; a venue
  // board only with the Venue add-on).
  return results.map((r) => ({ id: r.id, hostClientId: r.host_client_id, venue: r.venue === 1 }));
}

// ---- Housekeeping (cron) ----

/**
 * Settles boards from the pay-to-open flow that migration 0009 couldn't see:
 * ones the previous Worker made or opened between the migration and the
 * deploy (CI applies migrations just before it deploys). A board its payment
 * opened counts as paid; a draft opens (it pays at the draw like any new
 * board). Returns the ids of the boards it opened.
 */
export async function settleLegacyBoards(db: D1Database, now: number): Promise<string[]> {
  const [, opened] = await db.batch([
    db.prepare(`UPDATE games SET paid_at = COALESCE(activated_at, ?1) WHERE paid_at IS NULL AND payment_reference IS NOT NULL`).bind(now),
    db.prepare(`UPDATE games SET status = 'open', version = version + 1, updated_at = ?1 WHERE status = 'draft' RETURNING id`).bind(now),
  ]);
  return (opened.results as { id: string }[]).map((r) => r.id);
}

/** Keeps only the newest `keep` activity rows of each game. Returns how many rows went. */
export async function pruneActivity(db: D1Database, keep: number): Promise<number> {
  const res = await db
    .prepare(
      `DELETE FROM activity WHERE id IN (
         SELECT id FROM (
           SELECT id, ROW_NUMBER() OVER (PARTITION BY game_id ORDER BY at DESC, rowid DESC) AS rn
           FROM activity
           WHERE game_id IN (SELECT game_id FROM activity GROUP BY game_id HAVING COUNT(*) > ?1)
         ) WHERE rn > ?1
       )`,
    )
    .bind(keep)
    .run();
  return res.meta.changes ?? 0;
}

/** Drops rate-limit windows that ended before `before`. */
export async function pruneRateLimits(db: D1Database, before: number): Promise<void> {
  await db.prepare(`DELETE FROM rate_limits WHERE window_start < ?`).bind(before).run();
}
