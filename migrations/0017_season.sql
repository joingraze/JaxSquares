-- Season boards (docs/ARCHITECTURE.md "Season boards"): one squares board for
-- a whole season, a team's games (playoffs included as they're scheduled) or
-- games the host picked. Core tables: only worker/db.ts queries these columns.
--
-- The season board is a games row with kind = 'season'. It holds the players,
-- the squares, the rules and prizes and the one host fee, and it has no
-- linked_event of its own. `season` keeps what it covers (shared/types.ts
-- SeasonSpec, plus the games the host saw when it was made), public data only.
--
-- Each game of the season gets a board of its own at the season board's draw
-- (and later, from the cron, as new games appear on the team's schedule): a
-- normal games row with season_id = the season board and season_event = the
-- provider's event id, linked to that game's feed. It copies the season's
-- players and squares (rows in the existing tables, which the sign-in merge
-- already moves), takes the season's numbers or a fresh draw, and is made
-- locked and paid through the season board (payment_provider 'season',
-- payment_reference = the season board's id, amount 0). Nothing here is keyed
-- by a clientId, so the sign-in merge needs nothing new.

-- 'board': one game's board (every row before this). 'season': a season board.
ALTER TABLE games ADD COLUMN kind TEXT NOT NULL DEFAULT 'board' CHECK (kind IN ('board', 'season'));
-- A season board: JSON of what it covers (scope, numbers, league, team, year, label, the games planned).
ALTER TABLE games ADD COLUMN season TEXT;
-- A season's game board: its season board's id, and its game's event id (one board per game).
ALTER TABLE games ADD COLUMN season_id TEXT;
ALTER TABLE games ADD COLUMN season_event TEXT;
-- A season board: when its team's schedule was last read for new games (the cron, about twice a day).
ALTER TABLE games ADD COLUMN season_synced_at INTEGER;

-- A season's games in order, and one board per game: a racing cron run and a
-- draw can't both add the same game (the second insert changes nothing).
CREATE UNIQUE INDEX IF NOT EXISTS idx_games_season_event ON games(season_id, season_event) WHERE season_id IS NOT NULL;

-- The cron's "which drawn season boards are due a schedule read".
CREATE INDEX IF NOT EXISTS idx_games_season_sync ON games(season_synced_at) WHERE kind = 'season' AND status = 'locked';
