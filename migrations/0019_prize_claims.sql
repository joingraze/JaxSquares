-- Venue boards (docs/ARCHITECTURE.md "Venue boards"): the prizes handed over.
-- One row per award (a moment's square or reverse square). client_id is the
-- winner it was handed to (it joins the sign-in merge, worker/db.ts); the
-- board's state shows a row only while that player still holds the award.
CREATE TABLE IF NOT EXISTS prize_claims (
  game_id TEXT NOT NULL,
  period_key TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('square', 'reverse')),
  client_id TEXT NOT NULL,
  collected_at INTEGER NOT NULL,
  collected_by TEXT NOT NULL CHECK (collected_by IN ('host', 'winner')),
  PRIMARY KEY (game_id, period_key, side)
);
CREATE INDEX IF NOT EXISTS idx_prize_claims_client ON prize_claims (client_id);
