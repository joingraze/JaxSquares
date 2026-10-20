-- Several boards for one game ("a $1 board, a $5 board and a $20 board").
--
-- games.board_group links boards made for the same game: a host adds another
-- board from one they host (POST /api/games with fromGameId, checked against
-- that board's admin token or its host), and both end up in one group. The
-- group's id is its first board's id, so making the second board stamps the
-- first one too. NULL = a board on its own (every board made before this).
--
-- Public state lists a grouped board's siblings (id, name, square price,
-- squares left, status; GameState.siblings), read with the board. Nothing
-- here is keyed by a clientId, so the sign-in merge doesn't touch it, and
-- each board still pays its own host fee at its own draw.

ALTER TABLE games ADD COLUMN board_group TEXT;

CREATE INDEX IF NOT EXISTS idx_games_board_group ON games(board_group) WHERE board_group IS NOT NULL;
