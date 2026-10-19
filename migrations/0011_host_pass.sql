-- The Host Pass: a yearly subscription that covers the host fee of every board
-- its holder hosts (docs/payments.md "Host Pass"). Owned by the payments
-- module: only worker/payments/store.ts queries these tables. Nothing here is
-- ever between players.
--
-- Both tables are keyed by the holder's identity, client_id: the canonical
-- clientId the Worker resolves for the request (c.get("clientId"); the
-- account's when signed in). Like every clientId column it never leaves the
-- server. Signing in on another device moves that device's rows here to the
-- account's canonical clientId in the sign-in merge (docs/auth.md), and both
-- the device's and the account's passes are kept: active means any row is.

-- One row per subscription. A pass covers a board while status = 'active' and
-- current_period_end (plus a short grace window while it auto-renews,
-- worker/payments/pass.ts) is in the future. A board it paid for records
-- payment_provider 'pass' and this row's id as payment_reference (amount 0).
CREATE TABLE IF NOT EXISTS host_passes (
  id                 TEXT PRIMARY KEY,                    -- "hp_<random>", server-only
  client_id          TEXT NOT NULL,                       -- the holder (see above)
  provider           TEXT NOT NULL CHECK (provider IN ('stripe', 'iap', 'test')),
  -- The Stripe subscription id (sub_...), the Apple originalTransactionId, or
  -- "test:<random>". Unique: one subscription is one pass, held by one identity.
  external_id        TEXT NOT NULL UNIQUE,
  -- pending:  a Stripe subscription created, its first payment not made yet
  -- active:   paid up (Apple's billing grace period counts)
  -- past_due: a renewal failed and is being retried (doesn't cover boards)
  -- ended:    canceled or expired
  -- revoked:  refunded or revoked
  status             TEXT NOT NULL CHECK (status IN ('pending', 'active', 'past_due', 'ended', 'revoked')),
  current_period_end INTEGER,                             -- epoch ms: paid up until then
  auto_renew         INTEGER NOT NULL DEFAULT 1,          -- 0 = ends at current_period_end
  livemode           INTEGER NOT NULL DEFAULT 0,          -- 1 = real money (Stripe live keys / App Store production)
  -- Provider time of the state stored here (a Stripe event's `created`, an App
  -- Store notification's `signedDate`, or when the server last read the
  -- provider's API): an event older than it is late and doesn't overwrite it.
  event_at           INTEGER NOT NULL DEFAULT 0,
  created_at         INTEGER NOT NULL,
  updated_at         INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_host_passes_client ON host_passes(client_id, status, current_period_end);

-- The Stripe Customer each identity's web subscriptions are billed to (and the
-- Customer Portal opens for). One per identity and Stripe mode, so switching
-- from test keys to live keys starts a fresh customer.
CREATE TABLE IF NOT EXISTS stripe_customers (
  client_id   TEXT NOT NULL,
  livemode    INTEGER NOT NULL,                           -- 1 = live keys, 0 = test keys
  customer_id TEXT NOT NULL UNIQUE,                       -- cus_...
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (client_id, livemode)
);
