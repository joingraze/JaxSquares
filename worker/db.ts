// All core D1 access. Row <-> domain mapping lives here so routes stay focused
// on validation and orchestration. (Module-owned tables live with their module:
// worker/payments/store.ts and worker/push/store.ts.)
//
// Identity: rows store the device's secret clientId (players.client_id,
// squares.client_id, games.host_client_id). Every domain object built here for
// clients carries the public player id instead (worker/playerIds.ts); the
// clientId never leaves this file except as `Member.clientId` for push.
//
// Writes are built as prepared statements and run through `commit`, which
// appends a version bump and the full state read to the same batch: one round
// trip per mutation, and the state it returns is exactly what was written.

import { isPlayerId } from "../shared/playerId";
import { boardPeriods, liveCell, liveLabel, myWins, primaryAward, resolveResults, totalSquares } from "../shared/squares";
import type {
  Activity,
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
  Score,
  Sport,
  Square,
  Team,
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
  return {
    id: r.id,
    name: r.name,
    sport: r.sport as Sport,
    league: r.league as League,
    teamX: json<Team>(r.team_x, { name: "Team X" }),
    teamY: json<Team>(r.team_y, { name: "Team Y" }),
    format: json<GameFormat>(r.format, { periods: "quarters", reverse: false, boardSize: 100, freshNumbers: false }),
    periods: json<Period[]>(r.periods, []),
    prizes: json<Record<string, string>>(r.prizes, {}),
    maxPerPlayer: r.max_per_player,
    numbers: json<Record<string, NumberDraw> | null>(r.numbers, null),
    status: r.status as Game["status"],
    linkedEvent: json<LinkedEvent | null>(r.linked_event, null),
    hostPlayerId,
    createdAt: r.created_at,
    lockedAt: r.locked_at,
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

export async function getAdminToken(db: D1Database, gameId: string): Promise<string | null> {
  const row = await db.prepare(`SELECT admin_token FROM games WHERE id = ?`).bind(gameId).first<{ admin_token: string }>();
  return row?.admin_token ?? null;
}

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
  ];
}

async function stateFrom(results: D1Result[]): Promise<GameState | null> {
  const [games, players, squares, scores, manual, live, activity] = results;
  const row = games.results[0] as GameRow | undefined;
  if (!row) return null;
  const playerRows = players.results as PlayerRow[];
  const squareRows = squares.results as SquareRow[];
  const ids = await playerIdMap([row.host_client_id, ...playerRows.map((p) => p.client_id), ...squareRows.map((s) => s.client_id)]);
  const liveRow = live.results[0] as LiveRow | undefined;
  return {
    game: rowToGame(row, publicId(ids, row.host_client_id)),
    players: playerRows.map(rowToPlayer(ids, row.host_client_id)),
    squares: squareRows.map(rowToSquare(ids)),
    scores: (scores.results as ScoreRow[]).map(rowToScore),
    manualWinners: (manual.results as ManualWinnerRow[]).map(rowToManual),
    live: liveRow ? rowToLive(liveRow) : null,
    activity: (activity.results as ActivityRow[]).map(rowToActivity(ids)),
    version: row.version,
  };
}

/** Full game state in one round trip. */
export async function getGameState(db: D1Database, id: string): Promise<GameState | null> {
  return stateFrom(await db.batch(stateReads(db, id)));
}

/** State plus the host's admin token (never sent to clients), in one round trip. */
export async function getGameStateWithToken(
  db: D1Database,
  id: string,
): Promise<{ state: GameState; adminToken: string } | null> {
  const results = await db.batch(stateReads(db, id));
  const state = await stateFrom(results);
  if (!state) return null;
  return { state, adminToken: (results[0].results[0] as GameRow).admin_token };
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
  return { results: all.slice(0, writes.length), state: await stateFrom(all.slice(writes.length + 1)) };
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
        game.linkedEvent?.startsAt ?? null,
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

/** What a host's PATCH may change. `format` (rules + prizes) comes with its fixed `periods`. */
export interface GameFieldUpdate {
  name?: string;
  prizes?: Record<string, string>;
  maxPerPlayer?: number;
  format?: GameFormat;
  periods?: Period[];
}

export function updateGameFields(db: D1Database, gameId: string, fields: GameFieldUpdate): D1PreparedStatement | null {
  const sets: string[] = [];
  const args: (string | number)[] = [];
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
  if (sets.length === 0) return null;
  return db.prepare(`UPDATE games SET ${sets.join(", ")} WHERE id = ?`).bind(...args, gameId);
}

export async function deleteGame(db: D1Database, gameId: string): Promise<boolean> {
  const tables = ["activity", "live_status", "manual_winners", "scores", "squares", "players"];
  const results = await db.batch([
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
 * (re-checked inside the transaction), and never the host.
 */
export async function removePlayer(db: D1Database, gameId: string, playerId: string): Promise<D1PreparedStatement[] | null> {
  const { rows, ids } = await memberRows(db, gameId);
  const clientId = rows.find((r) => publicId(ids, r.client_id) === playerId)?.client_id;
  if (!clientId) return null;
  const picking = `EXISTS (SELECT 1 FROM games WHERE id = ?1 AND status IN ('draft', 'open') AND host_client_id <> ?2)`;
  return [
    db.prepare(`DELETE FROM squares WHERE game_id = ?1 AND client_id = ?2 AND ${picking}`).bind(gameId, clientId),
    db.prepare(`DELETE FROM players WHERE game_id = ?1 AND client_id = ?2 AND ${picking}`).bind(gameId, clientId),
  ];
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

/** open -> locked with the drawn numbers. No-op unless the board is open. */
export function lockGame(db: D1Database, gameId: string, numbers: Record<string, NumberDraw>, now: number): D1PreparedStatement {
  return db
    .prepare(`UPDATE games SET status = 'locked', numbers = ?, locked_at = ? WHERE id = ? AND status = 'open'`)
    .bind(JSON.stringify(numbers), now, gameId);
}

/** draft -> open after the creator's payment. No-op unless still a draft. */
export function activateGame(
  db: D1Database,
  gameId: string,
  purchase: { provider: string; reference: string; amountCents: number },
  now: number,
): D1PreparedStatement {
  return db
    .prepare(
      `UPDATE games SET status = 'open', activated_at = ?, payment_provider = ?, payment_reference = ?, payment_amount_cents = ?
       WHERE id = ? AND status = 'draft'`,
    )
    .bind(now, purchase.provider, purchase.reference, Math.trunc(purchase.amountCents) || 0, gameId);
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

/** Linked boards that kick off within `leadMs` or are still in progress. */
export async function gamesToWake(db: D1Database, now: number, leadMs: number): Promise<string[]> {
  const { results } = await db
    .prepare(
      `SELECT g.id FROM games g LEFT JOIN live_status l ON l.game_id = g.id
       WHERE g.starts_at IS NOT NULL AND g.starts_at <= ?1 AND g.starts_at >= ?2
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
}

/** Boards this device hosts or has joined, most recently active first. */
export async function listGamesForClient(db: D1Database, clientId: string, limit = 100): Promise<GameSummary[]> {
  const { results: rows } = await db
    .prepare(
      `SELECT g.*,
         (SELECT COUNT(*) FROM squares s WHERE s.game_id = g.id) AS claimed,
         (SELECT COUNT(*) FROM squares s WHERE s.game_id = g.id AND s.client_id = ?1) AS my_squares,
         (SELECT COUNT(*) FROM players p WHERE p.game_id = g.id) AS player_count
       FROM games g
       WHERE g.host_client_id = ?1
          OR EXISTS (SELECT 1 FROM players p WHERE p.game_id = g.id AND p.client_id = ?1)
       ORDER BY g.updated_at DESC
       LIMIT ?2`,
    )
    .bind(clientId, limit)
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
    return {
      id: game.id,
      name: game.name,
      sport: game.sport,
      teamX: game.teamX,
      teamY: game.teamY,
      status: game.status,
      format: game.format,
      isHost: r.host_client_id === clientId,
      mySquares: r.my_squares,
      claimed: r.claimed,
      totalSquares: totalSquares(game.format.boardSize),
      playerCount: r.player_count,
      live: liveStatus,
      startsAt: game.linkedEvent?.startsAt ?? null,
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
    };
  });
}

/** The live feed's score while it's on (or over), else the latest recorded period's. */
export function latestScoreOf(
  game: Pick<Game, "format" | "periods" | "status">,
  scores: Score[],
  live: LiveStatus | null,
): GameSummary["latestScore"] {
  if (live && live.state !== "pre") return { scoreX: live.scoreX, scoreY: live.scoreY, label: liveLabel(live, game.status) };
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

// ---- Housekeeping (cron) ----

const GAME_TABLES = ["activity", "live_status", "manual_winners", "scores", "squares", "players"] as const;

/**
 * Deletes up to `limit` boards still in "draft" (never paid for) that were
 * created before `before`. Returns their ids. Purchases are a ledger and stay.
 */
export async function deleteStaleDrafts(db: D1Database, before: number, limit = 100): Promise<string[]> {
  const { results } = await db
    .prepare(`SELECT id FROM games WHERE status = 'draft' AND created_at < ? ORDER BY created_at LIMIT ?`)
    .bind(before, limit)
    .all<{ id: string }>();
  if (results.length === 0) return [];
  const ids = JSON.stringify(results.map((r) => r.id));
  // Re-checked inside the transaction: a draft paid for since the SELECT is
  // kept, so only the ids the last statement actually deleted are returned
  // (the cron closes their rooms).
  const stillDraft = `SELECT id FROM games WHERE status = 'draft' AND id IN (SELECT value FROM json_each(?1))`;
  const out = await db.batch([
    ...GAME_TABLES.map((t) => db.prepare(`DELETE FROM ${t} WHERE game_id IN (${stillDraft})`).bind(ids)),
    db.prepare(`DELETE FROM games WHERE id IN (${stillDraft}) RETURNING id`).bind(ids),
  ]);
  return (out[out.length - 1].results as { id: string }[]).map((r) => r.id);
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
