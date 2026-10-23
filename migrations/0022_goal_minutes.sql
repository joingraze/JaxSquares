-- Goal-minute soccer squares (shared/soccer.ts): a soccer board's goals are
-- its score entries (s1..sN), each with the minute it was scored at as the
-- match showed it ("45'+2'" is minute 45, added 2). NULL on every other score.
ALTER TABLE scores ADD COLUMN minute INTEGER;
ALTER TABLE scores ADD COLUMN added INTEGER;
