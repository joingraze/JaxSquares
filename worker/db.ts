// D1 data-access helpers. Row<->domain mapping lives here so the route handlers
// stay focused on validation and orchestration.

import type {
  Game,
  GameState,
  Period,
  Score,
  Sport,
  Square,
} from "../shared/types";

interface GameRow {
  id: string;
  name: string;
  sport: string;
  team_x: string;
  team_y: string;
  price_per_square: number;
  max_per_player: number;
  periods: string;
  payouts: string;
  x_numbers: string | null;
  y_numbers: string | null;
  status: string;
  admin_token: string;
  created_at: number;
}

interface SquareRow {
  row: number;
  col: number;
  player_name: string;
  player_color: string;
  client_id: string;
}

interface ScoreRow {
  period_key: string;
  score_x: number;
  score_y: number;
}

function rowToGame(r: GameRow): Game {
  return {
    id: r.id,
    name: r.name,
    sport: r.sport as Sport,
    teamX: r.team_x,
    teamY: r.team_y,
    pricePerSquare: r.price_per_square,
    maxPerPlayer: r.max_per_player,
    periods: JSON.parse(r.periods) as Period[],
    payouts: JSON.parse(r.payouts) as Record<string, number>,
    xNumbers: r.x_numbers ? (JSON.parse(r.x_numbers) as number[]) : null,
    yNumbers: r.y_numbers ? (JSON.parse(r.y_numbers) as number[]) : null,
    status: r.status as Game["status"],
    createdAt: r.created_at,
  };
}

function rowToSquare(r: SquareRow): Square {
  return {
    row: r.row,
    col: r.col,
    playerName: r.player_name,
    playerColor: r.player_color,
    clientId: r.client_id,
  };
}

function rowToScore(r: ScoreRow): Score {
  return { periodKey: r.period_key, scoreX: r.score_x, scoreY: r.score_y };
}

export async function insertGame(db: D1Database, game: Game, adminToken: string): Promise<void> {
  await db
    .prepare(
      `INSERT INTO games
        (id, name, sport, team_x, team_y, price_per_square, max_per_player,
         periods, payouts, x_numbers, y_numbers, status, admin_token, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      game.id,
      game.name,
      game.sport,
      game.teamX,
      game.teamY,
      game.pricePerSquare,
      game.maxPerPlayer,
      JSON.stringify(game.periods),
      JSON.stringify(game.payouts),
      game.xNumbers ? JSON.stringify(game.xNumbers) : null,
      game.yNumbers ? JSON.stringify(game.yNumbers) : null,
      game.status,
      adminToken,
      game.createdAt,
    )
    .run();
}

export async function getGameRow(db: D1Database, id: string): Promise<GameRow | null> {
  return db.prepare(`SELECT * FROM games WHERE id = ?`).bind(id).first<GameRow>();
}

export async function getGame(db: D1Database, id: string): Promise<Game | null> {
  const row = await getGameRow(db, id);
  return row ? rowToGame(row) : null;
}

export async function getSquares(db: D1Database, gameId: string): Promise<Square[]> {
  const { results } = await db
    .prepare(`SELECT row, col, player_name, player_color, client_id FROM squares WHERE game_id = ?`)
    .bind(gameId)
    .all<SquareRow>();
  return results.map(rowToSquare);
}

export async function getScores(db: D1Database, gameId: string): Promise<Score[]> {
  const { results } = await db
    .prepare(`SELECT period_key, score_x, score_y FROM scores WHERE game_id = ?`)
    .bind(gameId)
    .all<ScoreRow>();
  return results.map(rowToScore);
}

export async function getGameState(db: D1Database, id: string): Promise<GameState | null> {
  const game = await getGame(db, id);
  if (!game) return null;
  const [squares, scores] = await Promise.all([getSquares(db, id), getScores(db, id)]);
  return { game, squares, scores };
}

/**
 * Insert a batch of squares, ignoring any cell that is already taken.
 * Returns the number of rows actually inserted.
 */
export async function claimSquares(
  db: D1Database,
  gameId: string,
  cells: { row: number; col: number }[],
  player: { name: string; color: string; clientId: string },
  now: number,
): Promise<number> {
  if (cells.length === 0) return 0;
  const stmt = db.prepare(
    `INSERT OR IGNORE INTO squares
       (game_id, row, col, player_name, player_color, client_id, claimed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  const batch = cells.map((c) =>
    stmt.bind(gameId, c.row, c.col, player.name, player.color, player.clientId, now),
  );
  const results = await db.batch(batch);
  return results.reduce((n, r) => n + (r.meta.changes ?? 0), 0);
}

/** Release squares, but only those owned by the given client. */
export async function releaseSquares(
  db: D1Database,
  gameId: string,
  cells: { row: number; col: number }[],
  clientId: string,
): Promise<void> {
  if (cells.length === 0) return;
  const stmt = db.prepare(
    `DELETE FROM squares WHERE game_id = ? AND row = ? AND col = ? AND client_id = ?`,
  );
  await db.batch(cells.map((c) => stmt.bind(gameId, c.row, c.col, clientId)));
}

export async function lockGame(
  db: D1Database,
  gameId: string,
  xNumbers: number[],
  yNumbers: number[],
): Promise<void> {
  await db
    .prepare(`UPDATE games SET status = 'locked', x_numbers = ?, y_numbers = ? WHERE id = ?`)
    .bind(JSON.stringify(xNumbers), JSON.stringify(yNumbers), gameId)
    .run();
}

export async function upsertScore(db: D1Database, gameId: string, score: Score, now: number): Promise<void> {
  await db
    .prepare(
      `INSERT INTO scores (game_id, period_key, score_x, score_y, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(game_id, period_key)
       DO UPDATE SET score_x = excluded.score_x, score_y = excluded.score_y, updated_at = excluded.updated_at`,
    )
    .bind(gameId, score.periodKey, score.scoreX, score.scoreY, now)
    .run();
}

export async function deleteScore(db: D1Database, gameId: string, periodKey: string): Promise<void> {
  await db.prepare(`DELETE FROM scores WHERE game_id = ? AND period_key = ?`).bind(gameId, periodKey).run();
}

export async function isAdmin(db: D1Database, gameId: string, token: string): Promise<boolean> {
  const row = await db
    .prepare(`SELECT admin_token FROM games WHERE id = ?`)
    .bind(gameId)
    .first<{ admin_token: string }>();
  return !!row && !!token && row.admin_token === token;
}
