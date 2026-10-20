-- Optional email notices (docs/email.md): a player who can't get push (a
-- browser tab without the Home Screen app) can ask for email about one board:
-- when the numbers are drawn, if they win, and the final results. Owned by
-- the email module: only worker/email/store.ts queries these tables. (0012
-- and 0014 are other modules' migrations.)
--
-- Double opt-in: an address starts `pending` and gets notices only once its
-- owner opens the confirmation link (the link carries a random token; only its
-- SHA-256 is stored here). client_id is the canonical clientId of the player
-- who asked (c.get("clientId"), the account's when signed in); like every
-- clientId column it never leaves the server, and it joins the sign-in merge
-- (docs/auth.md). The address itself is shown only to that player, masked.
--
-- Retention: the address goes once it isn't needed. Unsubscribing blanks it
-- at once (the keyed hash stays so that board doesn't email it again), an
-- unconfirmed address is deleted after 7 days, and every row goes 7 days after
-- its board's final (hourly housekeeping, worker/housekeeping.ts), or with the
-- board when the host deletes it.

CREATE TABLE IF NOT EXISTS email_subscriptions (
  id                 TEXT PRIMARY KEY,                     -- "es_<random>", server-only
  game_id            TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  client_id          TEXT NOT NULL,                        -- the player who asked (see above)
  email              TEXT NOT NULL,                        -- normalized lowercase; '' once unsubscribed
  -- HMAC-SHA-256 of the address under EMAIL_TOKEN_SECRET (base64url, 32
  -- chars): one address per board, the unsubscribe links, and suppression,
  -- without keeping the address itself any longer than the row needs it.
  email_key          TEXT NOT NULL,
  status             TEXT NOT NULL CHECK (status IN ('pending', 'confirmed', 'unsubscribed')),
  confirm_token_hash TEXT,                                 -- SHA-256 of the confirmation link's token; null once used
  confirm_sent_at    INTEGER,                              -- the last confirmation email (resend throttle, 7-day expiry)
  sent               TEXT NOT NULL DEFAULT '',             -- notices sent, each once: "numbers,q1,final,"
  created_at         INTEGER NOT NULL,
  confirmed_at       INTEGER,
  updated_at         INTEGER NOT NULL,
  UNIQUE (game_id, client_id),                             -- one address per player per board
  UNIQUE (game_id, email_key)                              -- and one confirmation per address per board
);

CREATE INDEX IF NOT EXISTS idx_email_subscriptions_client ON email_subscriptions(client_id);
CREATE INDEX IF NOT EXISTS idx_email_subscriptions_key ON email_subscriptions(email_key);
CREATE INDEX IF NOT EXISTS idx_email_subscriptions_token ON email_subscriptions(confirm_token_hash);

-- Addresses that asked for no JaxSquares email at all ("Unsubscribe from all"
-- in any email): only the keyed hash, kept so the request is honored. A
-- suppressed address can't be signed up again, so it gets no confirmation
-- email either.
CREATE TABLE IF NOT EXISTS email_suppressions (
  email_key  TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL
);
