-- The host fee moves from creating a board to drawing its numbers.
--
-- A new board opens right away (no 'draft' step): setting it up, inviting
-- friends and picking squares are free. games.paid_at is stamped when the
-- board's host fee is paid (worker/db.ts markPaid, from the purchases ledger
-- in worker/payments), and POST /api/games/:id/lock answers 402 until it is.
-- A linked board draws its own numbers at kickoff only once it's paid.
--
-- Grandfathered: every board made under the old pay-to-open flow counts as
-- paid. That is every board past 'draft' (it was paid for, or opened before
-- payments existed). A draft that never paid opens now and pays at the draw
-- like any new board, unless the ledger already holds a paid purchase for it
-- (charged, but the old opening step never ran).

ALTER TABLE games ADD COLUMN paid_at INTEGER;            -- host fee paid; NULL = not yet
ALTER TABLE games ADD COLUMN draw_reminder_at INTEGER;   -- "kickoff soon, draw the numbers" sent to the host (linked boards); NULL = not yet

UPDATE games SET paid_at = COALESCE(activated_at, created_at) WHERE status <> 'draft';

UPDATE games SET paid_at = COALESCE(
    (SELECT MIN(p.paid_at) FROM purchases p
      WHERE p.game_id = games.id AND p.status = 'paid' AND p.created_at >= games.created_at),
    created_at)
WHERE status = 'draft'
  AND EXISTS (SELECT 1 FROM purchases p WHERE p.game_id = games.id AND p.status = 'paid' AND p.created_at >= games.created_at);

UPDATE games SET status = 'open' WHERE status = 'draft';
