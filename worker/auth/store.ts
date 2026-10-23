// D1 access for the account tables (migrations/0010_accounts.sql): accounts,
// account_identities and client_links. They belong to the auth module, so
// their SQL lives here, like payments/store.ts and push/store.ts.
//
// Signing a device in to an existing account runs in one batch: the core,
// push, payments and email statements that move the device's rows to the
// canonical clientId (built by worker/db.ts, worker/push/store.ts,
// worker/payments/store.ts and worker/email/store.ts, which own those
// tables) followed by the link written here.

import type { AccountInfo, AuthProvider } from "../../shared/types";

/** A signed-in device: its account and the clientId every device of that account acts as. */
export interface Link {
  accountId: string;
  canonical: string;
}

/** D1 / SQLite says the table isn't there: migration 0010 isn't applied (yet). */
export function isMissingTable(err: unknown): boolean {
  return /no such table/i.test(String(err instanceof Error ? err.message : err));
}

export function isUniqueViolation(err: unknown): boolean {
  return /UNIQUE constraint failed/i.test(String(err instanceof Error ? err.message : err));
}

function newAccountId(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

const linkQuery = (db: D1Database, clientId: string) =>
  db
    .prepare(
      `SELECT l.account_id AS account_id, a.canonical_client_id AS canonical
       FROM client_links l JOIN accounts a ON a.id = l.account_id
       WHERE l.client_id = ?`,
    )
    .bind(clientId);

const toLink = (row: { account_id: string; canonical: string } | undefined | null): Link | null =>
  row ? { accountId: row.account_id, canonical: row.canonical } : null;

/** The account `clientId` is signed in to, or null. Throws when the tables are missing (see isMissingTable). */
export async function linkOf(db: D1Database, clientId: string): Promise<Link | null> {
  return toLink(await linkQuery(db, clientId).first<{ account_id: string; canonical: string }>());
}

export interface SignInState {
  /** The account this Apple / Google identity already belongs to. */
  identity: Link | null;
  /**
   * For a new identity with a verified email: the (oldest) account with that
   * email, which the identity joins instead of making a second account.
   */
  emailAccount: Link | null;
  /** The account this device is signed in to. */
  device: Link | null;
  /** The account whose canonical clientId this device's is (even while signed out). */
  canonicalOf: string | null;
}

/** Everything a sign-in decides on, in one round trip. `matchEmail`: the token's verified email, lowercased (or null). */
export async function signInState(db: D1Database, provider: AuthProvider, subject: string, clientId: string, matchEmail: string | null = null): Promise<SignInState> {
  const [identity, device, canonical, byEmail] = await db.batch([
    db
      .prepare(
        `SELECT i.account_id AS account_id, a.canonical_client_id AS canonical
         FROM account_identities i JOIN accounts a ON a.id = i.account_id
         WHERE i.provider = ? AND i.subject = ?`,
      )
      .bind(provider, subject),
    linkQuery(db, clientId),
    db.prepare(`SELECT id FROM accounts WHERE canonical_client_id = ?`).bind(clientId),
    // Lowercased on both sides (idx_accounts_email, migration 0018); a null email matches nothing.
    db
      .prepare(
        `SELECT id AS account_id, canonical_client_id AS canonical FROM accounts
         WHERE lower(email) = ? ORDER BY created_at, rowid LIMIT 1`,
      )
      .bind(matchEmail),
  ]);
  return {
    identity: toLink(identity.results[0] as { account_id: string; canonical: string } | undefined),
    emailAccount: matchEmail ? toLink(byEmail.results[0] as { account_id: string; canonical: string } | undefined) : null,
    device: toLink(device.results[0] as { account_id: string; canonical: string } | undefined),
    canonicalOf: (canonical.results[0] as { id: string } | undefined)?.id ?? null,
  };
}

export interface NewAccount {
  provider: AuthProvider;
  subject: string;
  /** The first device to sign in: its clientId becomes the account's canonical one, so none of its rows move. */
  clientId: string;
  email: string | null;
  name: string | null;
  now: number;
}

/** Creates the account, its identity and the device's link in one batch; returns the account id. Throws on a race (UNIQUE). */
export async function createAccount(db: D1Database, a: NewAccount): Promise<string> {
  const id = newAccountId();
  await db.batch([
    db
      .prepare(`INSERT INTO accounts (id, canonical_client_id, email, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`)
      .bind(id, a.clientId, a.email, a.name, a.now, a.now),
    db
      .prepare(`INSERT INTO account_identities (provider, subject, account_id, created_at, last_used_at) VALUES (?, ?, ?, ?, ?)`)
      .bind(a.provider, a.subject, id, a.now, a.now),
    db.prepare(`INSERT INTO client_links (client_id, account_id, created_at) VALUES (?, ?, ?)`).bind(a.clientId, id, a.now),
  ]);
  return id;
}

export interface Touch {
  accountId: string;
  provider: AuthProvider;
  subject: string;
  email: string | null;
  name: string | null;
  now: number;
}

/** Apple's "Hide My Email" addresses: never matched, and never replace a real address on the account. */
export const PRIVATE_RELAY_DOMAIN = "privaterelay.appleid.com";

function touchStatements(db: D1Database, t: Touch): D1PreparedStatement[] {
  return [
    db
      .prepare(
        `UPDATE accounts SET
           email = CASE WHEN ?1 IS NULL THEN email
                        WHEN email IS NOT NULL AND lower(?1) LIKE '%@' || ?5 THEN email
                        ELSE ?1 END,
           name = COALESCE(?2, name), updated_at = ?3
         WHERE id = ?4`,
      )
      .bind(t.email, t.name, t.now, t.accountId, PRIVATE_RELAY_DOMAIN),
    db.prepare(`UPDATE account_identities SET last_used_at = ? WHERE provider = ? AND subject = ?`).bind(t.now, t.provider, t.subject),
  ];
}

/** Adds an Apple / Google identity to an account (email matching, or "Add Google" in Profile). Fails on UNIQUE if it's taken meanwhile. */
export function addIdentityStatement(db: D1Database, t: Pick<Touch, "accountId" | "provider" | "subject" | "now">): D1PreparedStatement {
  return db
    .prepare(`INSERT INTO account_identities (provider, subject, account_id, created_at, last_used_at) VALUES (?, ?, ?, ?, ?)`)
    .bind(t.provider, t.subject, t.accountId, t.now, t.now);
}

/** A device already signed in to this account signed in again: freshen the email, name and last use (`addIdentity`: the identity joins the account first). */
export async function touchAccount(db: D1Database, t: Touch, addIdentity = false): Promise<void> {
  await db.batch([...(addIdentity ? [addIdentityStatement(db, t)] : []), ...touchStatements(db, t)]);
}

/**
 * Signs `clientId` in to an existing account: `merge` (the statements moving
 * the device's rows to the canonical clientId; empty for the canonical device
 * itself) and the link, in one batch, so a device is never half moved.
 * Returns the batch results (`merge`'s first). Throws on a race (UNIQUE: the
 * device was linked meanwhile).
 */
export async function linkDevice(db: D1Database, t: Touch & { clientId: string }, merge: D1PreparedStatement[], addIdentity = false): Promise<D1Result[]> {
  return db.batch([
    ...merge,
    ...(addIdentity ? [addIdentityStatement(db, t)] : []),
    db.prepare(`INSERT INTO client_links (client_id, account_id, created_at) VALUES (?, ?, ?)`).bind(t.clientId, t.accountId, t.now),
    ...touchStatements(db, t),
  ]);
}

/** Every device signed in to an account (for the isolate cache when it's combined into another). */
export async function clientsOf(db: D1Database, accountId: string): Promise<string[]> {
  const { results } = await db.prepare(`SELECT client_id FROM client_links WHERE account_id = ?`).bind(accountId).all<{ client_id: string }>();
  return results.map((r) => r.client_id);
}

/**
 * Combines account `from` into `to` (after `merge` moved its canonical
 * clientId's rows): its devices and identities move over, then it's deleted.
 * Its name and email fill in only what `to` lacks.
 */
export function combineAccountStatements(db: D1Database, from: string, to: string, now: number): D1PreparedStatement[] {
  return [
    db
      .prepare(
        `UPDATE accounts SET
           email = COALESCE(email, (SELECT email FROM accounts WHERE id = ?1)),
           name = COALESCE(name, (SELECT name FROM accounts WHERE id = ?1)),
           updated_at = ?3
         WHERE id = ?2`,
      )
      .bind(from, to, now),
    db.prepare(`UPDATE client_links SET account_id = ?2 WHERE account_id = ?1`).bind(from, to),
    db.prepare(`UPDATE account_identities SET account_id = ?2 WHERE account_id = ?1`).bind(from, to),
    db.prepare(`DELETE FROM accounts WHERE id = ?`).bind(from),
  ];
}

/** Keeps the Apple refresh token from a sign-in's authorization code, for revoking it when the account is deleted. */
export async function setAppleRefreshToken(db: D1Database, subject: string, refreshToken: string, tokenClientId: string): Promise<void> {
  await db
    .prepare(`UPDATE account_identities SET refresh_token = ?, token_client_id = ? WHERE provider = 'apple' AND subject = ?`)
    .bind(refreshToken, tokenClientId, subject)
    .run();
}

/** Signs this device out: drops its link (the account and every other device stay). */
export function unlinkStatement(db: D1Database, clientId: string): D1PreparedStatement {
  return db.prepare(`DELETE FROM client_links WHERE client_id = ?`).bind(clientId);
}

/** What "Signed in with Apple · email" shows, and every way the account signs in (first one first). */
export async function accountInfo(db: D1Database, accountId: string): Promise<AccountInfo | null> {
  const [account, identities] = await db.batch([
    db.prepare(`SELECT email, name, created_at FROM accounts WHERE id = ?`).bind(accountId),
    db.prepare(`SELECT provider FROM account_identities WHERE account_id = ? ORDER BY created_at, rowid`).bind(accountId),
  ]);
  const row = account.results[0] as { email: string | null; name: string | null; created_at: number } | undefined;
  if (!row) return null;
  const providers = [...new Set((identities.results as { provider: AuthProvider }[]).map((i) => i.provider))];
  return { provider: providers[0] ?? "apple", providers, email: row.email, name: row.name, since: row.created_at };
}

export interface Doomed {
  /** Every clientId signed in to the account (for the isolate cache). */
  clients: string[];
  /** Apple refresh tokens to revoke. */
  appleTokens: { token: string; clientId: string }[];
  /** Apple identities with no refresh token (signed in before the key was configured): can't be revoked. */
  unrevocable: number;
}

/** What deleting the account has to clean up beyond its rows. */
export async function accountForDeletion(db: D1Database, accountId: string): Promise<Doomed> {
  const [links, identities] = await db.batch([
    db.prepare(`SELECT client_id FROM client_links WHERE account_id = ?`).bind(accountId),
    db.prepare(`SELECT provider, refresh_token, token_client_id FROM account_identities WHERE account_id = ?`).bind(accountId),
  ]);
  const apple = (identities.results as { provider: string; refresh_token: string | null; token_client_id: string | null }[]).filter(
    (i) => i.provider === "apple",
  );
  const appleTokens = apple
    .filter((i) => i.refresh_token && i.token_client_id)
    .map((i) => ({ token: i.refresh_token!, clientId: i.token_client_id! }));
  return {
    clients: (links.results as { client_id: string }[]).map((r) => r.client_id),
    appleTokens,
    unrevocable: apple.length - appleTokens.length,
  };
}

/** Deletes the account, its identities and every device link. The boards and squares stay under the canonical clientId. */
export function deleteAccountStatements(db: D1Database, accountId: string): D1PreparedStatement[] {
  return [
    db.prepare(`DELETE FROM client_links WHERE account_id = ?`).bind(accountId),
    db.prepare(`DELETE FROM account_identities WHERE account_id = ?`).bind(accountId),
    db.prepare(`DELETE FROM accounts WHERE id = ?`).bind(accountId),
  ];
}
