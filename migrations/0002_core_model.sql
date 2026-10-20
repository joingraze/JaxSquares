-- v1 data model: players, squares by client id, host/live scores, manual
-- winners, activity feed, live status and per-game versioning. Prices and
-- payouts are gone for good: no money moves between players.
--
-- The app is pre-launch, so the 0001 tables are replaced rather than migrated.
-- Children are dropped before the parent so D1's foreign-key enforcement never
-- sees a dangling reference.

PRAGMA defer_foreign_keys = true;

DROP TABLE IF EXISTS squares;
DROP TABLE IF EXISTS scores;
DROP TABLE IF EXISTS games;

CREATE TABLE games (
  id                   TEXT PRIMARY KEY,
  name                 TEXT NOT NULL,
  sport                TEXT NOT NULL DEFAULT 'football',
  league               TEXT NOT NULL DEFAULT 'custom',  -- nfl | ncaaf | custom
  team_x               TEXT NOT NULL,                   -- JSON Team (columns)
  team_y               TEXT NOT NULL,                   -- JSON Team (rows)
  format               TEXT NOT NULL,                   -- JSON GameFormat
  periods              TEXT NOT NULL,                   -- JSON Period[] (empty for every-score)
  prizes               TEXT NOT NULL DEFAULT '{}',      -- JSON map period key -> free-text note
  max_per_player       INTEGER NOT NULL DEFAULT 0,      -- 0 = unlimited
  numbers              TEXT,                            -- JSON Record<string, NumberDraw>, NULL until locked
  status               TEXT NOT NULL DEFAULT 'draft'
                         CHECK (status IN ('draft', 'open', 'locked', 'final')),
  linked_event         TEXT,                            -- JSON LinkedEvent, NULL for typed-in matchups
  starts_at            INTEGER,                         -- linked_event.startsAt, for the cron wake-up query
  host_client_id       TEXT NOT NULL,
  admin_token          TEXT NOT NULL,
  created_at           INTEGER NOT NULL,
  locked_at            INTEGER,
  activated_at         INTEGER,                         -- draft -> open (creator's payment confirmed)
  payment_provider     TEXT,                            -- test | stripe | iap
  payment_reference    TEXT,
  payment_amount_cents INTEGER,
  updated_at           INTEGER NOT NULL,                -- last mutation; drives dashboard ordering
  version              INTEGER NOT NULL DEFAULT 1       -- bumped on every mutation
);

CREATE INDEX idx_games_host ON games(host_client_id);
CREATE INDEX idx_games_starts ON games(starts_at) WHERE starts_at IS NOT NULL;

CREATE TABLE players (
  game_id    TEXT NOT NULL,
  client_id  TEXT NOT NULL,
  name       TEXT NOT NULL,
  color      TEXT NOT NULL,
  emoji      TEXT NOT NULL DEFAULT '',
  joined_at  INTEGER NOT NULL,
  PRIMARY KEY (game_id, client_id),
  FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE
);

CREATE INDEX idx_players_client ON players(client_id);

CREATE TABLE squares (
  game_id    TEXT NOT NULL,
  row        INTEGER NOT NULL,   -- grid position (0..9 or 0..4)
  col        INTEGER NOT NULL,
  client_id  TEXT NOT NULL,
  claimed_at INTEGER NOT NULL,
  PRIMARY KEY (game_id, row, col),
  FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE
);

CREATE INDEX idx_squares_owner ON squares(game_id, client_id);
CREATE INDEX idx_squares_client ON squares(client_id);

CREATE TABLE scores (
  game_id    TEXT NOT NULL,
  period_key TEXT NOT NULL,      -- q1 | q2 | q3 | final | s1..sN
  label      TEXT,               -- every-score entries only
  score_x    INTEGER NOT NULL,
  score_y    INTEGER NOT NULL,
  source     TEXT NOT NULL DEFAULT 'host' CHECK (source IN ('live', 'host')),
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (game_id, period_key),
  FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE
);

CREATE TABLE manual_winners (
  game_id    TEXT NOT NULL,
  period_key TEXT NOT NULL,
  row        INTEGER NOT NULL,
  col        INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (game_id, period_key),
  FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE
);

CREATE TABLE activity (
  id      TEXT PRIMARY KEY,
  game_id TEXT NOT NULL,
  type    TEXT NOT NULL,
  at      INTEGER NOT NULL,
  actor   TEXT,                  -- client id, NULL for system events (live scores)
  data    TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE
);

CREATE INDEX idx_activity_game ON activity(game_id, at DESC);

CREATE TABLE live_status (
  game_id    TEXT PRIMARY KEY,
  state      TEXT NOT NULL CHECK (state IN ('pre', 'in', 'post')),
  period     INTEGER NOT NULL DEFAULT 0,
  clock      TEXT NOT NULL DEFAULT '',
  detail     TEXT NOT NULL DEFAULT '',
  score_x    INTEGER NOT NULL DEFAULT 0,
  score_y    INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE
);
