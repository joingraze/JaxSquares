// All D1 access. Row <-> domain mapping lives here so routes stay focused on
// validation and orchestration.
//
// Writes are built as prepared statements and run through `commit`, which
// appends a version bump and the full state read to the same batch: one round
// trip per mutation, and the state it returns is exactly what was written.

import { myWins, resolveResults, totalSquares } from "../shared/squares";
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

const ACTIVITY_LIMIT = 50;

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

export function rowToGame(r: GameRow): Game {
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
    hostClientId: r.host_client_id,
    createdAt: r.created_at,
    lockedAt: r.locked_at,
  };
}

const rowToPlayer =
  (hostClientId: string) =>
  (r: PlayerRow): Player => ({
    clientId: r.client_id,
    name: r.name,
    color: r.color,
    emoji: r.emoji,
    joinedAt: r.joined_at,
    isHost: r.client_id === hostClientId,
  });

const rowToSquare = (r: SquareRow): Square => ({ row: r.row, col: r.col, clientId: r.client_id, claimedAt: r.claimed_at });

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

const rowToActivity = (r: ActivityRow): Activity => ({
  id: r.id,
  type: r.type as Activity["type"],
  at: r.at,
  actor: r.actor,
  data: json<Record<string, unknown>>(r.data, {}),
});

// ---- Reads ----

export async function getGameRow(db: D1Database, id: string): Promise<GameRow | null> {
  return db.prepare(`SELECT * FROM games WHERE id = ?`).bind(id).first<GameRow>();
}

export async function getGame(db: D1Database, id: string): Promise<Game | null> {
  const row = await getGameRow(db, id);
  return row ? rowToGame(row) : null;
}

export async function getPlayers(db: D1Database, gameId: string): Promise<Player[]> {
  const [game, players] = await db.batch([
    db.prepare(`SELECT host_client_id FROM games WHERE id = ?`).bind(gameId),
    db.prepare(`SELECT client_id, name, color, emoji, joined_at FROM players WHERE game_id = ? ORDER BY joined_at`).bind(gameId),
  ]);
  const host = (game.results[0] as { host_client_id: string } | undefined)?.host_client_id ?? "";
  return (players.results as PlayerRow[]).map(rowToPlayer(host));
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

function stateFrom(results: D1Result[]): GameState | null {
  const [games, players, squares, scores, manual, live, activity] = results;
  const row = games.results[0] as GameRow | undefined;
  if (!row) return null;
  const game = rowToGame(row);
  const liveRow = live.results[0] as LiveRow | undefined;
  return {
    game,
    players: (players.results as PlayerRow[]).map(rowToPlayer(game.hostClientId)),
    squares: (squares.results as SquareRow[]).map(rowToSquare),
    scores: (scores.results as ScoreRow[]).map(rowToScore),
    manualWinners: (manual.results as ManualWinnerRow[]).map(rowToManual),
    live: liveRow ? rowToLive(liveRow) : null,
    activity: (activity.results as ActivityRow[]).map(rowToActivity),
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
  const state = stateFrom(results);
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
  return { results: all.slice(0, writes.length), state: stateFrom(all.slice(writes.length + 1)) };
}

// ---- Write statements (run them through commit) ----

export function newActivityId(): string {
  return crypto.randomUUID();
}

/** Plain activity insert; OR IGNORE makes re-sending the same activity harmless. */
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
  adminToken: string,
  host: Omit<Player, "isHost" | "clientId">,
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
        game.hostClientId,
        adminToken,
        game.createdAt,
        game.createdAt,
      ),
    db
      .prepare(`INSERT INTO players (game_id, client_id, name, color, emoji, joined_at) VALUES (?, ?, ?, ?, ?, ?)`)
      .bind(game.id, game.hostClientId, host.name, host.color, host.emoji, host.joinedAt),
    insertActivity(db, game.id, created),
  ];
}

export function updateGameFields(
  db: D1Database,
  gameId: string,
  fields: { name?: string; prizes?: Record<string, string>; maxPerPlayer?: number },
): D1PreparedStatement | null {
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

/** Insert or rename a player. */
export function upsertPlayer(
  db: D1Database,
  gameId: string,
  p: { clientId: string; name: string; color: string; emoji: string; joinedAt: number },
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO players (game_id, client_id, name, color, emoji, joined_at) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (game_id, client_id) DO UPDATE SET name = excluded.name, color = excluded.color, emoji = excluded.emoji`,
    )
    .bind(gameId, p.clientId, p.name, p.color, p.emoji, p.joinedAt);
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

/** "claimed" activity listing the cells this request actually got (none -> no row). */
export function claimActivity(db: D1Database, gameId: string, id: string, clientId: string, now: number): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO activity (id, game_id, type, at, actor, data)
       SELECT ?1, ?2, 'claimed', ?3, ?4,
              json_object('count', COUNT(*), 'cells', json_group_array(json_object('row', row, 'col', col)))
       FROM squares WHERE game_id = ?2 AND client_id = ?4 AND claimed_at = ?3
       HAVING COUNT(*) > 0`,
    )
    .bind(id, gameId, now, clientId);
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

  const ids = JSON.stringify(rows.map((r) => r.id));
  const inIds = `game_id IN (SELECT value FROM json_each(?1))`;
  const [live, scores, manual, mine] = await db.batch([
    db.prepare(`SELECT game_id, state, period, clock, detail, score_x, score_y, updated_at FROM live_status WHERE ${inIds}`).bind(ids),
    db.prepare(`SELECT game_id, period_key, label, score_x, score_y, source, updated_at FROM scores WHERE ${inIds}`).bind(ids),
    db.prepare(`SELECT game_id, period_key, row, col, updated_at FROM manual_winners WHERE ${inIds}`).bind(ids),
    // Only this device's squares are needed to tell whether a winning cell is "mine".
    db.prepare(`SELECT game_id, row, col, client_id, claimed_at FROM squares WHERE ${inIds} AND client_id = ?2`).bind(ids, clientId),
  ]);

  const group = <T extends { game_id: string }>(list: T[]) => {
    const m = new Map<string, T[]>();
    for (const r of list) m.set(r.game_id, [...(m.get(r.game_id) ?? []), r]);
    return m;
  };
  const liveBy = group(live.results as (LiveRow & { game_id: string })[]);
  const scoresBy = group(scores.results as (ScoreRow & { game_id: string })[]);
  const manualBy = group(manual.results as (ManualWinnerRow & { game_id: string })[]);
  const mineBy = group(mine.results as (SquareRow & { game_id: string })[]);

  return rows.map((r) => {
    const game = rowToGame(r);
    const liveRow = liveBy.get(r.id)?.[0];
    const results = resolveResults({
      game,
      squares: (mineBy.get(r.id) ?? []).map(rowToSquare),
      scores: (scoresBy.get(r.id) ?? []).map(rowToScore),
      manualWinners: (manualBy.get(r.id) ?? []).map(rowToManual),
    });
    return {
      id: game.id,
      name: game.name,
      sport: game.sport,
      teamX: game.teamX,
      teamY: game.teamY,
      status: game.status,
      format: game.format,
      isHost: game.hostClientId === clientId,
      mySquares: r.my_squares,
      claimed: r.claimed,
      totalSquares: totalSquares(game.format.boardSize),
      playerCount: r.player_count,
      live: liveRow ? rowToLive(liveRow) : null,
      startsAt: game.linkedEvent?.startsAt ?? null,
      myWins: myWins(results, clientId).map((w) => ({
        periodKey: w.periodKey,
        label: w.reverse ? `${w.label} (reverse)` : w.label,
      })),
      lastActivityAt: r.updated_at,
      createdAt: game.createdAt,
    };
  });
}
