-- Initial schema for JaxSquares.

CREATE TABLE IF NOT EXISTS games (
  id               TEXT PRIMARY KEY,
  name             TEXT NOT NULL,
  sport            TEXT NOT NULL DEFAULT 'football',
  team_x           TEXT NOT NULL,
  team_y           TEXT NOT NULL,
  price_per_square REAL NOT NULL DEFAULT 0,
  max_per_player   INTEGER NOT NULL DEFAULT 0,
  periods          TEXT NOT NULL,            -- JSON array of {key,label}
  payouts          TEXT NOT NULL,            -- JSON map period.key -> amount
  x_numbers        TEXT,                     -- JSON array of 10 ints, NULL until locked
  y_numbers        TEXT,                     -- JSON array of 10 ints, NULL until locked
  status           TEXT NOT NULL DEFAULT 'open',
  admin_token      TEXT NOT NULL,
  created_at       INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS squares (
  game_id      TEXT NOT NULL,
  row          INTEGER NOT NULL,            -- 0..9 grid position
  col          INTEGER NOT NULL,            -- 0..9 grid position
  player_name  TEXT NOT NULL,
  player_color TEXT NOT NULL,
  client_id    TEXT NOT NULL,
  claimed_at   INTEGER NOT NULL,
  PRIMARY KEY (game_id, row, col),
  FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_squares_game ON squares(game_id);

CREATE TABLE IF NOT EXISTS scores (
  game_id    TEXT NOT NULL,
  period_key TEXT NOT NULL,
  score_x    INTEGER NOT NULL,
  score_y    INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (game_id, period_key),
  FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE
);
