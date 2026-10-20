-- Optional accounts: Sign in with Apple / Google keeps a person's boards on
-- every device they sign in on (docs/auth.md). Playing never needs one.
--
-- Identity stays the device's secret clientId. Each account has one canonical
-- clientId: the clientId of the first device that signed in, so that device's
-- rows need no rewrite. Every linked device's clientId maps to the account in
-- client_links, and the Worker resolves a request's x-client-id to the
-- canonical one before anything else reads it (worker/auth/canonical.ts).
-- Signing in on another device moves that device's rows (squares, players,
-- hosted boards, push registrations, mutes) to the canonical clientId in one
-- batch (worker/auth/store.ts linkDevice).
--
-- These tables belong to the auth module: only worker/auth/store.ts queries
-- them. Like every clientId column, canonical_client_id and client_id never
-- leave the server, and email/name are shown only to the account's owner.
-- (0009 is another module's migration.)

CREATE TABLE IF NOT EXISTS accounts (
  id                  TEXT PRIMARY KEY,               -- random, server-only
  canonical_client_id TEXT NOT NULL UNIQUE,           -- the clientId every linked device acts as
  email               TEXT,                           -- if the provider shared one; "Signed in as" only
  name                TEXT,                           -- if the provider shared one; shown only to the owner
  created_at          INTEGER NOT NULL,
  updated_at          INTEGER NOT NULL
);

-- The Apple / Google account behind an account. One identity belongs to one
-- account. For Apple, the refresh token from exchanging the sign-in's
-- authorization code (when the Sign in with Apple key is configured), so
-- deleting the account can revoke it (App Store guideline 5.1.1(v)).
CREATE TABLE IF NOT EXISTS account_identities (
  provider        TEXT NOT NULL CHECK (provider IN ('apple', 'google')),
  subject         TEXT NOT NULL,                      -- the provider's `sub`
  account_id      TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  refresh_token   TEXT,                               -- Apple only
  token_client_id TEXT,                               -- Apple: the client_id the refresh token was issued to
  created_at      INTEGER NOT NULL,
  last_used_at    INTEGER NOT NULL,
  UNIQUE (provider, subject)
);

CREATE INDEX IF NOT EXISTS idx_account_identities_account ON account_identities(account_id);

-- Which devices are signed in to which account: one row per signed-in clientId
-- (the canonical device included). Signing out deletes the device's row.
CREATE TABLE IF NOT EXISTS client_links (
  client_id  TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_client_links_account ON client_links(account_id);
