-- Co-hosts (docs/ARCHITECTURE.md "Co-hosts"): players the host invited to run
-- a board with them. Core tables: only worker/db.ts queries them.
--
-- `cohosts.client_id` is the co-host's canonical clientId (c.get("clientId"),
-- the account's when signed in). Like every clientId column it never leaves
-- the server: the public state names co-hosts by public player id
-- (Game.cohostIds). A co-host is authorized by that clientId, never by the
-- host's admin token. Signing in on another device moves its rows here to the
-- account's canonical clientId in the sign-in merge (db.mergeClientStatements,
-- docs/auth.md), so a co-host stays one on every device.
--
-- At most MAX_COHOSTS (3, shared/cohosts.ts) per board, checked inside the
-- accept's own statement.

CREATE TABLE IF NOT EXISTS cohosts (
  game_id   TEXT NOT NULL,
  client_id TEXT NOT NULL,
  added_at  INTEGER NOT NULL,
  PRIMARY KEY (game_id, client_id),
  FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE
);

-- GET /api/me (the boards an identity co-hosts) and GET /api/me/games.
CREATE INDEX IF NOT EXISTS idx_cohosts_client ON cohosts (client_id);

-- Single-use invite links (/g/<id>?cohost=<token>, 7 days). Only the token's
-- SHA-256 is kept, so a database read can't be turned into a working link. No
-- client column: an invite is always the board host's, and who accepted it is
-- in `cohosts` (so nothing here moves in the sign-in merge).
CREATE TABLE IF NOT EXISTS cohost_invites (
  token_hash TEXT PRIMARY KEY,
  game_id    TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at    INTEGER,
  FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_cohost_invites_game ON cohost_invites (game_id);
