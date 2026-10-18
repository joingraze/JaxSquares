// D1 access for the account tables (migrations/0010_accounts.sql): accounts,
// account_identities and client_links. They belong to the auth module, so
// their SQL lives here, like payments/store.ts and push/store.ts.
//
// Signing a device in to an existing account runs in one batch: the core and
// push statements that move the device's rows to the canonical clientId
// (built by worker/db.ts and worker/push/store.ts, which own those tables)
// followed by the link written here.

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
  /** The account this device is signed in to. */
  device: Link | null;
  /** The account whose canonical clientId this device's is (even while signed out). */
  canonicalOf: string | null;
}

/** Everything a sign-in decides on, in one round trip. */
export async function signInState(db: D1Database, provider: AuthProvider, subject: string, clientId: string): Promise<SignInState> {
  const [identity, device, canonical] = await db.batch([
    db
      .prepare(
        `SELECT i.account_id AS account_id, a.canonical_client_id AS canonical
         FROM account_identities i JOIN accounts a ON a.id = i.account_id
         WHERE i.provider = ? AND i.subject = ?`,
      )
      .bind(provider, subject),
    linkQuery(db, clientId),
    db.prepare(`SELECT id FROM accounts WHERE canonical_client_id = ?`).bind(clientId),
  ]);
  return {
    identity: toLink(identity.results[0] as { account_id: string; canonical: string } | undefined),
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

function touchStatements(db: D1Database, t: Touch): D1PreparedStatement[] {
  return [
    db
      .prepare(`UPDATE accounts SET email = COALESCE(?, email), name = COALESCE(?, name), updated_at = ? WHERE id = ?`)
      .bind(t.email, t.name, t.now, t.accountId),
    db.prepare(`UPDATE account_identities SET last_used_at = ? WHERE provider = ? AND subject = ?`).bind(t.now, t.provider, t.subject),
  ];
}

/** A device already signed in to this account signed in again: freshen the email, name and last use. */
export async function touchAccount(db: D1Database, t: Touch): Promise<void> {
  await db.batch(touchStatements(db, t));
}

/**
 * Signs `clientId` in to an existing account: `merge` (the statements moving
 * the device's rows to the canonical clientId; empty for the canonical device
 * itself) and the link, in one batch, so a device is never half moved.
 * Returns the batch results (`merge`'s first). Throws on a race (UNIQUE: the
 * device was linked meanwhile).
 */
export async function linkDevice(db: D1Database, t: Touch & { clientId: string }, merge: D1PreparedStatement[]): Promise<D1Result[]> {
  return db.batch([
    ...merge,
    db.prepare(`INSERT INTO client_links (client_id, account_id, created_at) VALUES (?, ?, ?)`).bind(t.clientId, t.accountId, t.now),
    ...touchStatements(db, t),
  ]);
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

/** What "Signed in with Apple · email" shows. */
export async function accountInfo(db: D1Database, accountId: string): Promise<AccountInfo | null> {
  const row = await db
    .prepare(
      `SELECT a.email, a.name, a.created_at,
         (SELECT provider FROM account_identities i WHERE i.account_id = a.id ORDER BY i.created_at, i.rowid LIMIT 1) AS provider
       FROM accounts a WHERE a.id = ?`,
    )
    .bind(accountId)
    .first<{ email: string | null; name: string | null; created_at: number; provider: AuthProvider | null }>();
  if (!row) return null;
  return { provider: row.provider ?? "apple", email: row.email, name: row.name, since: row.created_at };
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
