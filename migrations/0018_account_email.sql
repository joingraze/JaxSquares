-- Signing in with a second provider (Google after Apple, or the other way)
-- joins the account with the same verified email instead of making a second
-- one (docs/auth.md "One account per email"): looked up lowercased.
CREATE INDEX IF NOT EXISTS idx_accounts_email ON accounts(lower(email));
