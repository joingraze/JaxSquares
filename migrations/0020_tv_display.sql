-- What TV mode shows (shared/tv.ts): the host's choices per board, as JSON
-- ({ "prizes": false, ... }); NULL = every part at its default.
ALTER TABLE games ADD COLUMN tv TEXT;
