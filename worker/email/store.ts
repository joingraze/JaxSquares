// D1 access for email notices (tables from migrations/0013_email.sql):
// email_subscriptions and email_suppressions. They belong to the email
// module, so their SQL lives only here, like push/store.ts and
// payments/store.ts. The address column never leaves the server except back
// to its owner, masked (routes.ts), and in the email itself.

/** An unconfirmed address and its link last this long (from the last confirmation email). */
export const CONFIRM_TTL_MS = 7 * 24 * 60 * 60_000;
/** A board's addresses are deleted this long after its final. */
export const KEEP_AFTER_FINAL_MS = 7 * 24 * 60 * 60_000;
/** A board nobody has touched for this long (never finished) loses its addresses too. */
export const KEEP_IDLE_MS = 60 * 24 * 60 * 60_000;

/** D1 allows 100 bound parameters per statement; leave room for the others. */
const IN_CHUNK = 90;

export type SubscriptionStatus = "pending" | "confirmed" | "unsubscribed";

export interface SubscriptionRow {
  id: string;
  game_id: string;
  client_id: string;
  email: string;
  email_key: string;
  status: SubscriptionStatus;
  confirm_sent_at: number | null;
  created_at: number;
  confirmed_at: number | null;
}

const COLUMNS = `id, game_id, client_id, email, email_key, status, confirm_sent_at, created_at, confirmed_at`;

/** D1 / SQLite says the table isn't there: migration 0013 isn't applied (yet). */
export function isMissingTable(err: unknown): boolean {
  return /no such table/i.test(String(err instanceof Error ? err.message : err));
}

export function isUniqueViolation(err: unknown): boolean {
  return /UNIQUE constraint failed/i.test(String(err instanceof Error ? err.message : err));
}

export function newSubscriptionId(): string {
  return `es_${crypto.randomUUID().replace(/-/g, "")}`;
}

/** The caller's row on this board. */
export async function subscriptionOf(db: D1Database, gameId: string, clientId: string): Promise<SubscriptionRow | null> {
  return db.prepare(`SELECT ${COLUMNS} FROM email_subscriptions WHERE game_id = ? AND client_id = ?`).bind(gameId, clientId).first<SubscriptionRow>();
}

export interface Lookup {
  /** The caller's row on this board. */
  mine: SubscriptionRow | null;
  /** The row holding this address on this board (maybe the caller's). */
  holder: SubscriptionRow | null;
  /** The address asked for no JaxSquares email at all. */
  suppressed: boolean;
}

/** Everything a sign-up decides on, in one round trip. */
export async function lookup(db: D1Database, gameId: string, clientId: string, emailKey: string): Promise<Lookup> {
  const [mine, holder, suppressed] = await db.batch([
    db.prepare(`SELECT ${COLUMNS} FROM email_subscriptions WHERE game_id = ? AND client_id = ?`).bind(gameId, clientId),
    db.prepare(`SELECT ${COLUMNS} FROM email_subscriptions WHERE game_id = ? AND email_key = ?`).bind(gameId, emailKey),
    db.prepare(`SELECT 1 AS hit FROM email_suppressions WHERE email_key = ?`).bind(emailKey),
  ]);
  return {
    mine: (mine.results[0] as SubscriptionRow | undefined) ?? null,
    holder: (holder.results[0] as SubscriptionRow | undefined) ?? null,
    suppressed: suppressed.results.length > 0,
  };
}

export interface PendingInput {
  gameId: string;
  clientId: string;
  email: string;
  emailKey: string;
  tokenHash: string;
  now: number;
}

/**
 * The caller's address for this board, waiting for its confirmation link: a
 * new row, or theirs replaced (a different address, or the same one again
 * after unsubscribing). Throws on a UNIQUE violation: someone else holds the
 * address on this board.
 */
export async function savePending(db: D1Database, p: PendingInput): Promise<void> {
  await db
    .prepare(
      `INSERT INTO email_subscriptions
         (id, game_id, client_id, email, email_key, status, confirm_token_hash, confirm_sent_at, sent, created_at, confirmed_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, 'pending', ?6, ?7, '', ?7, NULL, ?7)
       ON CONFLICT (game_id, client_id) DO UPDATE SET
         email = excluded.email, email_key = excluded.email_key, status = 'pending',
         confirm_token_hash = excluded.confirm_token_hash, confirm_sent_at = excluded.confirm_sent_at,
         sent = '', created_at = excluded.created_at, confirmed_at = NULL, updated_at = excluded.updated_at`,
    )
    .bind(newSubscriptionId(), p.gameId, p.clientId, p.email, p.emailKey, p.tokenHash, p.now)
    .run();
}

/** A fresh link for a pending row (the old one stops working). False when it isn't pending any more. */
export async function renewPending(db: D1Database, id: string, tokenHash: string, now: number): Promise<boolean> {
  const res = await db
    .prepare(`UPDATE email_subscriptions SET confirm_token_hash = ?2, confirm_sent_at = ?3, updated_at = ?3 WHERE id = ?1 AND status = 'pending'`)
    .bind(id, tokenHash, now)
    .run();
  return (res.meta.changes ?? 0) > 0;
}

/** The pending row a confirmation link is for, while the link is fresh. */
export async function pendingByToken(db: D1Database, hash: string, now: number): Promise<SubscriptionRow | null> {
  return db
    .prepare(`SELECT ${COLUMNS} FROM email_subscriptions WHERE confirm_token_hash = ? AND status = 'pending' AND confirm_sent_at > ?`)
    .bind(hash, now - CONFIRM_TTL_MS)
    .first<SubscriptionRow>();
}

/** Confirms the row a fresh link is for (once: the token is cleared). The row, or null when the link is used, stale or unknown. */
export async function confirmByToken(db: D1Database, hash: string, now: number): Promise<SubscriptionRow | null> {
  return db
    .prepare(
      `UPDATE email_subscriptions SET status = 'confirmed', confirmed_at = ?2, confirm_token_hash = NULL, updated_at = ?2
       WHERE confirm_token_hash = ?1 AND status = 'pending' AND confirm_sent_at > ?3
       RETURNING ${COLUMNS}`,
    )
    .bind(hash, now, now - CONFIRM_TTL_MS)
    .first<SubscriptionRow>();
}

/** The caller turned email off for this board in the app: the row and its address go. */
export async function removeSubscription(db: D1Database, gameId: string, clientId: string): Promise<void> {
  await db.prepare(`DELETE FROM email_subscriptions WHERE game_id = ? AND client_id = ?`).bind(gameId, clientId).run();
}

const UNSUBSCRIBE = `UPDATE email_subscriptions
  SET status = 'unsubscribed', email = '', confirm_token_hash = NULL, updated_at = ?1`;

/**
 * An email's unsubscribe link, for one board: the address stops getting this
 * board's email and is blanked at once (the keyed hash stays, so the board
 * can't sign it up again). Returns how many rows changed.
 */
export async function unsubscribeBoard(db: D1Database, gameId: string, emailKey: string, now: number): Promise<number> {
  const res = await db.prepare(`${UNSUBSCRIBE} WHERE game_id = ?2 AND email_key = ?3 AND status <> 'unsubscribed'`).bind(now, gameId, emailKey).run();
  return res.meta.changes ?? 0;
}

/** "Unsubscribe from all": every board stops, and the address can't be signed up again. */
export async function unsubscribeAll(db: D1Database, emailKey: string, now: number): Promise<void> {
  await db.batch([
    db.prepare(`INSERT INTO email_suppressions (email_key, created_at) VALUES (?, ?) ON CONFLICT DO NOTHING`).bind(emailKey, now),
    db.prepare(`${UNSUBSCRIBE} WHERE email_key = ?2 AND status <> 'unsubscribed'`).bind(now, emailKey),
  ]);
}

export interface Recipient {
  id: string;
  client_id: string;
  email: string;
  email_key: string;
}

/** Confirmed addresses on a board: who notices can go to. */
export async function confirmedOn(db: D1Database, gameId: string): Promise<Recipient[]> {
  const { results } = await db
    .prepare(`SELECT id, client_id, email, email_key FROM email_subscriptions WHERE game_id = ? AND status = 'confirmed' AND email <> ''`)
    .bind(gameId)
    .all<Recipient>();
  return results;
}

/**
 * Claims notices before they're sent, so each goes once per address even when
 * events race (two isolates, a retried request, a host correcting a score):
 * `key` is "numbers", a period key or "final". Returns "<id>:<key>" for every
 * claim this call won; the rest were sent already or the row isn't confirmed
 * any more.
 */
export async function claimNotices(db: D1Database, gameId: string, claims: { id: string; key: string }[]): Promise<Set<string>> {
  const byKey = new Map<string, string[]>();
  for (const c of claims) byKey.set(c.key, [...(byKey.get(c.key) ?? []), c.id]);
  const statements: { key: string; stmt: D1PreparedStatement }[] = [];
  for (const [key, ids] of byKey) {
    for (let i = 0; i < ids.length; i += IN_CHUNK) {
      const chunk = ids.slice(i, i + IN_CHUNK);
      statements.push({
        key,
        stmt: db
          .prepare(
            `UPDATE email_subscriptions SET sent = sent || ?2 || ','
             WHERE game_id = ?1 AND status = 'confirmed' AND instr(',' || sent, ',' || ?2 || ',') = 0
               AND id IN (${chunk.map((_, j) => `?${j + 3}`).join(", ")})
             RETURNING id`,
          )
          .bind(gameId, key, ...chunk),
      });
    }
  }
  const won = new Set<string>();
  if (statements.length === 0) return won;
  const results = await db.batch(statements.map((s) => s.stmt));
  results.forEach((r, i) => {
    for (const row of r.results as { id: string }[]) won.add(`${row.id}:${statements[i].key}`);
  });
  return won;
}

// ---- Accounts (optional sign-in: worker/auth, docs/auth.md) ----

/**
 * A device signing in to an account: its addresses move to the account's
 * canonical clientId (worker/auth/store.ts linkDevice runs these in the same
 * batch as the core rows and the link). Where both have one on a board, the
 * confirmed one wins; otherwise the account's stays and the device's goes.
 */
export function mergeClientStatements(db: D1Database, from: string, to: string): D1PreparedStatement[] {
  return [
    db
      .prepare(
        `DELETE FROM email_subscriptions WHERE client_id = ?2 AND status <> 'confirmed'
           AND game_id IN (SELECT game_id FROM email_subscriptions WHERE client_id = ?1 AND status = 'confirmed')`,
      )
      .bind(from, to),
    db.prepare(`UPDATE OR IGNORE email_subscriptions SET client_id = ?2 WHERE client_id = ?1`).bind(from, to),
    db.prepare(`DELETE FROM email_subscriptions WHERE client_id = ?`).bind(from),
  ];
}

/** Deleting the account: nobody could manage its addresses any more, so they go. */
export function deleteClientSubscriptionsStatement(db: D1Database, clientId: string): D1PreparedStatement {
  return db.prepare(`DELETE FROM email_subscriptions WHERE client_id = ?`).bind(clientId);
}

// ---- Housekeeping (worker/housekeeping.ts) ----

/**
 * Deletes addresses that aren't needed any more: every row of a board that
 * went final over KEEP_AFTER_FINAL_MS ago (games.updated_at is the last
 * change, so never earlier than that), of a board nobody has touched for
 * KEEP_IDLE_MS whose kickoff isn't ahead, or of a board that's gone; and
 * unconfirmed rows whose link expired. Returns how many went.
 */
export async function pruneSubscriptions(db: D1Database, now: number): Promise<number> {
  const res = await db
    .prepare(
      `DELETE FROM email_subscriptions WHERE
         (status = 'pending' AND COALESCE(confirm_sent_at, created_at) <= ?1)
         OR game_id NOT IN (SELECT id FROM games)
         OR game_id IN (
           SELECT id FROM games
           WHERE (status = 'final' AND updated_at <= ?2)
              OR (status <> 'final' AND updated_at <= ?3 AND COALESCE(starts_at, 0) <= ?4)
         )`,
    )
    .bind(now - CONFIRM_TTL_MS, now - KEEP_AFTER_FINAL_MS, now - KEEP_IDLE_MS, now)
    .run();
  return res.meta.changes ?? 0;
}
