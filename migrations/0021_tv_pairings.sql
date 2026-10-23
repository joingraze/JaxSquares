-- Pairing a TV with a board (shared/tvBrowser.ts): a TV on jaxsquares.com/tv
-- shows a short code; the host enters it in Host tools and the TV opens the
-- board's TV mode. token_hash is SHA-256 of the TV's own secret (only that TV
-- can ask what it was sent); rows expire in minutes and housekeeping drops them.
CREATE TABLE IF NOT EXISTS tv_pairings (
  code TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL,
  game_id TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tv_pairings_expires ON tv_pairings (expires_at);
