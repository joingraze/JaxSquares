-- "Your board is full" is announced once per board.
--
-- The push used to go out on every claim that left no square open, so a player
-- giving back a square and taking one again on a full board pushed the host
-- again each time. The claim that first fills the board stamps this column in
-- the same transaction (worker/db.ts markBoardFull) and only that claim sends
-- the push. It is never cleared: once per board.

ALTER TABLE games ADD COLUMN board_full_at INTEGER;   -- when "board is full" was announced; NULL = not yet

-- Boards already full were announced under the old rule: don't announce them again.
UPDATE games SET board_full_at = updated_at
WHERE status = 'open'
  AND (SELECT COUNT(*) FROM squares s WHERE s.game_id = games.id) >= COALESCE(json_extract(format, '$.boardSize'), 100);
