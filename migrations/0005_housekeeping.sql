-- Rate limits and housekeeping support.
--
-- Public player ids (base64url(SHA-256("jaxsquares:player:" + clientId)), 22
-- chars) are derived by the Worker on read (worker/playerIds.ts), so no player
-- column changes here. Activity rows written from now on store the public id in
-- `actor` (and `playerIds` in winner data); older rows that hold clientIds are
-- translated on read in worker/db.ts.

-- Fixed-window request counters (worker/index.ts RATE_LIMITS), keyed by
-- "<rule>:<public player id>". The hourly cron drops expired windows.
CREATE TABLE rate_limits (
  key          TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,   -- epoch ms, start of the current window
  count        INTEGER NOT NULL
);

CREATE INDEX idx_rate_limits_window ON rate_limits(window_start);

-- The cron deletes unpaid drafts older than 7 days.
CREATE INDEX idx_games_status_created ON games(status, created_at);
