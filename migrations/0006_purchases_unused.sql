-- Purchases that were charged but opened nothing: an App Store purchase for a
-- board that was already open (a second purchase), or for a draft that was
-- deleted before the purchase could be confirmed. They are kept as 'unused'
-- instead of 'paid' so they're never counted as opening a board, and support
-- can find them (the host is told to ask Apple for a refund):
--
--   SELECT * FROM purchases WHERE status = 'unused' ORDER BY created_at DESC;
--
-- SQLite can't change a CHECK constraint in place, so the table is rebuilt.

CREATE TABLE purchases_new (
  reference    TEXT PRIMARY KEY,
  game_id      TEXT NOT NULL,
  provider     TEXT NOT NULL CHECK (provider IN ('test', 'stripe', 'iap')),
  status       TEXT NOT NULL DEFAULT 'paid' CHECK (status IN ('pending', 'paid', 'canceled', 'unused')),
  amount_cents INTEGER NOT NULL DEFAULT 0,           -- minor units of currency
  currency     TEXT NOT NULL DEFAULT 'usd',
  livemode     INTEGER NOT NULL DEFAULT 0,           -- 1 = real money (Stripe live / App Store production)
  created_at   INTEGER NOT NULL,
  paid_at      INTEGER
);

INSERT INTO purchases_new (reference, game_id, provider, status, amount_cents, currency, livemode, created_at, paid_at)
  SELECT reference, game_id, provider, status, amount_cents, currency, livemode, created_at, paid_at FROM purchases;

DROP TABLE purchases;
ALTER TABLE purchases_new RENAME TO purchases;

CREATE INDEX idx_purchases_game ON purchases(game_id, provider, status);
