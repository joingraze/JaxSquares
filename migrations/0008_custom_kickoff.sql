-- Custom boards can have a kickoff time. games.starts_at (0002) held only a
-- linked board's linked_event.startsAt, for the cron's wake-up query; it now
-- also holds a custom board's host-set kickoff (NULL = no set time), which
-- Home sorts and counts down by. Nothing to backfill: custom boards made
-- before this have no set time.
--
-- The cron only wakes linked boards (a custom board has no feed to poll and
-- never locks itself), so its index covers just those, and custom kickoffs
-- don't widen the per-minute scan.

DROP INDEX IF EXISTS idx_games_starts;
CREATE INDEX IF NOT EXISTS idx_games_linked_starts ON games(starts_at) WHERE linked_event IS NOT NULL;
