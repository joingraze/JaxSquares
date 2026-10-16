-- Board purchases: what each creator paid JaxSquares to open a board. This is the
-- only money in the product; nothing here is ever between players.
--
-- One row per payment reference: "test:<game id>" for the no-charge test
-- checkout, the Stripe PaymentIntent id, or the Apple transactionId. The unique
-- reference is what stops one Apple purchase from opening two boards.
--
-- No foreign key to games on purpose: the ledger outlives a deleted board, and a
-- deleted board must not free its Apple transaction for reuse.

CREATE TABLE purchases (
  reference    TEXT PRIMARY KEY,
  game_id      TEXT NOT NULL,
  provider     TEXT NOT NULL CHECK (provider IN ('test', 'stripe', 'iap')),
  status       TEXT NOT NULL DEFAULT 'paid' CHECK (status IN ('pending', 'paid', 'canceled')),
  amount_cents INTEGER NOT NULL DEFAULT 0,           -- minor units of currency
  currency     TEXT NOT NULL DEFAULT 'usd',
  livemode     INTEGER NOT NULL DEFAULT 0,           -- 1 = real money (Stripe live / App Store production)
  created_at   INTEGER NOT NULL,
  paid_at      INTEGER
);

CREATE INDEX idx_purchases_game ON purchases(game_id, provider, status);
