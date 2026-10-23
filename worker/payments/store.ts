// D1 access for the purchases ledger (migrations/0003_purchases.sql, 0006) and the
// Annual Pass (0011: host_passes, stripe_customers; 0016: host_passes.plan, which
// makes a row the Annual Pass + Venue). The tables belong to the payments module, so
// their SQL lives here rather than in worker/db.ts.
//
// A board has at most one 'paid' purchase: recordPaid decides that inside one
// transaction; any other verified charge for the board is kept as 'unused'.

import type { PassPlan } from "../../shared/types";

export type PurchaseProvider = "test" | "stripe" | "iap";
/** "unused": charged, but it paid for nothing (board already paid for, or deleted first); for refund follow-up. */
export type PurchaseStatus = "pending" | "paid" | "canceled" | "unused";

export interface Purchase {
  reference: string;
  gameId: string;
  provider: PurchaseProvider;
  status: PurchaseStatus;
  amountCents: number;
  currency: string;
  livemode: boolean;
  createdAt: number;
  paidAt: number | null;
}

export type NewPurchase = Pick<Purchase, "reference" | "gameId" | "provider" | "amountCents" | "currency" | "livemode">;

interface PurchaseRow {
  reference: string;
  game_id: string;
  provider: PurchaseProvider;
  status: PurchaseStatus;
  amount_cents: number;
  currency: string;
  livemode: number;
  created_at: number;
  paid_at: number | null;
}

function fromRow(r: PurchaseRow): Purchase {
  return {
    reference: r.reference,
    gameId: r.game_id,
    provider: r.provider,
    status: r.status,
    amountCents: r.amount_cents,
    currency: r.currency,
    livemode: r.livemode === 1,
    createdAt: r.created_at,
    paidAt: r.paid_at,
  };
}

const COLUMNS = "reference, game_id, provider, status, amount_cents, currency, livemode, created_at, paid_at";

const readRow = (db: D1Database, reference: string) => db.prepare(`SELECT ${COLUMNS} FROM purchases WHERE reference = ?`).bind(reference);

export async function getPurchase(db: D1Database, reference: string): Promise<Purchase | null> {
  const row = await readRow(db, reference).first<PurchaseRow>();
  return row ? fromRow(row) : null;
}

/** The newest payment still in flight for a board (a Stripe intent waiting to be paid). */
export async function latestPending(db: D1Database, gameId: string, provider: PurchaseProvider): Promise<Purchase | null> {
  const row = await db
    .prepare(
      `SELECT ${COLUMNS} FROM purchases WHERE game_id = ? AND provider = ? AND status = 'pending'
       ORDER BY created_at DESC LIMIT 1`,
    )
    .bind(gameId, provider)
    .first<PurchaseRow>();
  return row ? fromRow(row) : null;
}

export async function recordPending(db: D1Database, p: NewPurchase, now = Date.now()): Promise<void> {
  await db
    .prepare(
      `INSERT INTO purchases (${COLUMNS}) VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, NULL)
       ON CONFLICT(reference) DO NOTHING`,
    )
    .bind(p.reference, p.gameId, p.provider, Math.trunc(p.amountCents), p.currency, p.livemode ? 1 : 0, now)
    .run();
}

/**
 * A verified purchase that paid for nothing becomes 'unused': inserted, or a
 * pending (or canceled) row of the same board moved to it. A paid reference is
 * never downgraded and another board's reference is never touched.
 */
function unusedStatement(db: D1Database, p: NewPurchase, now: number): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO purchases (${COLUMNS})
       SELECT ?1, ?2, ?3, 'unused', ?4, ?5, ?6, ?7, ?7
       WHERE NOT EXISTS (SELECT 1 FROM purchases WHERE reference = ?1 AND status = 'paid')
       ON CONFLICT(reference) DO UPDATE SET
         status = 'unused',
         amount_cents = excluded.amount_cents,
         currency = excluded.currency,
         livemode = excluded.livemode,
         paid_at = COALESCE(purchases.paid_at, excluded.paid_at)
       WHERE purchases.game_id = excluded.game_id AND purchases.status <> 'paid'`,
    )
    .bind(p.reference, p.gameId, p.provider, Math.trunc(p.amountCents), p.currency, p.livemode ? 1 : 0, now);
}

/**
 * Records a verified payment for a board and returns the stored row, all in
 * one transaction. It becomes the board's one 'paid' purchase unless another
 * reference already paid for this board: two App Store transactions, or a
 * Stripe webhook and an App Store purchase, confirmed at the same instant can't
 * both pay for it. The loser is kept as 'unused' (charged, paid for nothing;
 * for refund follow-up), like a purchase for a board that was already paid for.
 *
 * `board.createdAt` scopes "this board": ledger rows outlive deleted boards,
 * and a new board could be given a deleted one's id; only purchases made since
 * this board was created count.
 *
 * A reference already held by another board is left untouched, so the returned
 * row's gameId tells the caller who owns it.
 */
export async function recordPaid(db: D1Database, p: NewPurchase, board: { createdAt: number }, now = Date.now()): Promise<Purchase> {
  const [, , read] = await db.batch<PurchaseRow>([
    db
      .prepare(
        `INSERT INTO purchases (${COLUMNS})
         SELECT ?1, ?2, ?3, 'paid', ?4, ?5, ?6, ?7, ?7
         WHERE NOT EXISTS (
           SELECT 1 FROM purchases
           WHERE game_id = ?2 AND status = 'paid' AND reference <> ?1 AND created_at >= ?8
         )
         ON CONFLICT(reference) DO UPDATE SET
           status = 'paid',
           amount_cents = excluded.amount_cents,
           currency = excluded.currency,
           livemode = excluded.livemode,
           paid_at = COALESCE(purchases.paid_at, excluded.paid_at)
         WHERE purchases.game_id = excluded.game_id`,
      )
      .bind(p.reference, p.gameId, p.provider, Math.trunc(p.amountCents), p.currency, p.livemode ? 1 : 0, now, board.createdAt),
    // Only applies when the line above didn't (another reference paid first).
    unusedStatement(db, p, now),
    readRow(db, p.reference),
  ]);
  return fromRow(read.results[0]);
}

/**
 * Records a verified purchase that can't pay for its board (already paid, or
 * deleted) so it isn't lost, and returns the stored row. A paid reference is
 * never downgraded and another board's reference is never taken (that row is
 * returned as it is).
 */
export async function recordUnused(db: D1Database, p: NewPurchase, now = Date.now()): Promise<Purchase> {
  const [, read] = await db.batch<PurchaseRow>([unusedStatement(db, p, now), readRow(db, p.reference)]);
  return fromRow(read.results[0]);
}

export async function markCanceled(db: D1Database, reference: string): Promise<void> {
  await db.prepare(`UPDATE purchases SET status = 'canceled' WHERE reference = ? AND status = 'pending'`).bind(reference).run();
}

// ---- The Annual Pass (migrations/0011_host_pass.sql): host_passes, stripe_customers ----
// Keyed by the holder's canonical clientId, which never leaves the server. A
// row's plan (migrations/0016_club.sql) says whether it's the Annual Pass or the
// Annual Pass + Venue; both cover the host fee.

export type PassProvider = "stripe" | "iap" | "test";
export type PassStatus = "pending" | "active" | "past_due" | "ended" | "revoked";
/** Which pass a row is (migrations/0016_club.sql): the Annual Pass, or the Annual Pass + Venue (web only). */
export type { PassPlan };

export interface PassRow {
  /** "hp_<random>": the reference a board paid through this pass records. Server-only. */
  id: string;
  clientId: string;
  provider: PassProvider;
  /** 'host' or 'club'. Both cover the host fee; an Annual Pass + Venue adds the club features. */
  plan: PassPlan;
  /** Stripe subscription id, Apple originalTransactionId, or "test:<random>". */
  externalId: string;
  status: PassStatus;
  /** Paid up until then (epoch ms); null while a Stripe subscription waits for its first payment. */
  currentPeriodEnd: number | null;
  autoRenew: boolean;
  livemode: boolean;
  /** Provider time of the stored state: older events don't overwrite it. */
  eventAt: number;
  createdAt: number;
  updatedAt: number;
}

/** What a provider says about a subscription right now. */
export interface PassState {
  /** Which pass it is, when the provider says (a Stripe subscription's Price); absent keeps what's stored ('host' for a new row). */
  plan?: PassPlan;
  status: PassStatus;
  currentPeriodEnd: number | null;
  autoRenew: boolean;
  livemode: boolean;
  /** When the provider said it (a Stripe event's `created`, an App Store `signedDate`, or now for an API read). */
  eventAt: number;
}

interface PassDbRow {
  id: string;
  client_id: string;
  provider: PassProvider;
  plan: PassPlan | null;
  external_id: string;
  status: PassStatus;
  current_period_end: number | null;
  auto_renew: number;
  livemode: number;
  event_at: number;
  created_at: number;
  updated_at: number;
}

const PASS_COLUMNS = "id, client_id, provider, external_id, status, current_period_end, auto_renew, livemode, event_at, created_at, updated_at";
/** PASS_COLUMNS plus the plan (migration 0016), for reads. */
const PASS_READ = `${PASS_COLUMNS}, plan`;

function passFromRow(r: PassDbRow): PassRow {
  return {
    id: r.id,
    clientId: r.client_id,
    provider: r.provider,
    plan: r.plan === "club" ? "club" : "host",
    externalId: r.external_id,
    status: r.status,
    currentPeriodEnd: r.current_period_end,
    autoRenew: r.auto_renew === 1,
    livemode: r.livemode === 1,
    eventAt: r.event_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/** D1 / SQLite says the table isn't there: migration 0011 isn't applied (yet). */
export function isMissingTable(err: unknown): boolean {
  return /no such table/i.test(String(err instanceof Error ? err.message : err));
}

export function newPassId(): string {
  return `hp_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;
}

/** D1 allows 100 bound parameters per statement. */
const PASS_IN_CHUNK = 90;

/** Every pass these identities hold, newest first. Throws when the table is missing (see isMissingTable). */
export async function passesOf(db: D1Database, clientIds: readonly string[], opts: { activeOnly?: boolean } = {}): Promise<PassRow[]> {
  const ids = [...new Set(clientIds.filter(Boolean))];
  if (ids.length === 0) return [];
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += PASS_IN_CHUNK) chunks.push(ids.slice(i, i + PASS_IN_CHUNK));
  const status = opts.activeOnly ? ` AND status = 'active'` : "";
  const results = await db.batch<PassDbRow>(
    chunks.map((chunk) =>
      db
        .prepare(`SELECT ${PASS_READ} FROM host_passes WHERE client_id IN (${chunk.map(() => "?").join(", ")})${status} ORDER BY created_at DESC`)
        .bind(...chunk),
    ),
  );
  return results.flatMap((r) => (r.results as PassDbRow[]).map(passFromRow)).sort((a, b) => b.createdAt - a.createdAt);
}

export async function passByExternalId(db: D1Database, externalId: string): Promise<PassRow | null> {
  const row = await db.prepare(`SELECT ${PASS_READ} FROM host_passes WHERE external_id = ?`).bind(externalId).first<PassDbRow>();
  return row ? passFromRow(row) : null;
}

export interface NewPass extends PassState {
  id?: string;
  clientId: string;
  provider: PassProvider;
  externalId: string;
}

/**
 * Stores a provider's word on a subscription and returns the row:
 * - a subscription new to us becomes a pass of `clientId` (plan 'host' unless
 *   the provider says otherwise);
 * - one we know takes the new state unless it's older than what's stored
 *   (event_at), and stays with its holder unless `moveTo` (a verified App
 *   Store restore moves it to the identity that restored it).
 */
export async function upsertPass(db: D1Database, p: NewPass, opts: { moveTo?: boolean; now?: number } = {}): Promise<PassRow> {
  const now = opts.now ?? Date.now();
  const [, read] = await db.batch<PassDbRow>([
    db
      .prepare(
        `INSERT INTO host_passes (${PASS_COLUMNS}, plan) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?10, COALESCE(?12, 'host'))
         ON CONFLICT(external_id) DO UPDATE SET
           plan = CASE WHEN ?12 IS NOT NULL AND excluded.event_at >= host_passes.event_at THEN ?12 ELSE host_passes.plan END,
           status = CASE WHEN excluded.event_at >= host_passes.event_at THEN excluded.status ELSE host_passes.status END,
           current_period_end = CASE WHEN excluded.event_at >= host_passes.event_at THEN excluded.current_period_end ELSE host_passes.current_period_end END,
           auto_renew = CASE WHEN excluded.event_at >= host_passes.event_at THEN excluded.auto_renew ELSE host_passes.auto_renew END,
           livemode = excluded.livemode,
           event_at = MAX(host_passes.event_at, excluded.event_at),
           client_id = CASE WHEN ?11 = 1 THEN excluded.client_id ELSE host_passes.client_id END,
           updated_at = excluded.updated_at`,
      )
      .bind(
        p.id ?? newPassId(),
        p.clientId,
        p.provider,
        p.externalId,
        p.status,
        p.currentPeriodEnd,
        p.autoRenew ? 1 : 0,
        p.livemode ? 1 : 0,
        Math.trunc(p.eventAt),
        now,
        opts.moveTo ? 1 : 0,
        p.plan ?? null,
      ),
    db.prepare(`SELECT ${PASS_READ} FROM host_passes WHERE external_id = ?`).bind(p.externalId),
  ]);
  return passFromRow(read.results[0]);
}

/** A provider's newer word on a subscription we know (webhooks, notifications); null when we don't know it. */
export async function updatePass(db: D1Database, externalId: string, s: PassState, now = Date.now()): Promise<PassRow | null> {
  const [, read] = await db.batch<PassDbRow>([
    db
      .prepare(
        `UPDATE host_passes SET status = ?2, current_period_end = ?3, auto_renew = ?4, livemode = ?5, event_at = ?6, updated_at = ?7,
           plan = COALESCE(?8, plan)
         WHERE external_id = ?1 AND event_at <= ?6`,
      )
      .bind(externalId, s.status, s.currentPeriodEnd, s.autoRenew ? 1 : 0, s.livemode ? 1 : 0, Math.trunc(s.eventAt), now, s.plan ?? null),
    db.prepare(`SELECT ${PASS_READ} FROM host_passes WHERE external_id = ?`).bind(externalId),
  ]);
  const row = read.results[0];
  return row ? passFromRow(row) : null;
}

/** Test mode's "End test pass": this identity's test passes of that plan end now. */
export async function endTestPasses(db: D1Database, clientId: string, now = Date.now(), plan: PassPlan = "host"): Promise<void> {
  await db
    .prepare(
      `UPDATE host_passes SET status = 'ended', current_period_end = ?2, auto_renew = 0, event_at = ?2, updated_at = ?2
       WHERE client_id = ?1 AND provider = 'test' AND status = 'active' AND plan = ?3`,
    )
    .bind(clientId, now, plan)
    .run();
}

/** The Stripe Customer this identity's web subscriptions bill to, for these keys (live or test). */
export async function stripeCustomerOf(db: D1Database, clientId: string, livemode: boolean): Promise<string | null> {
  const row = await db
    .prepare(`SELECT customer_id FROM stripe_customers WHERE client_id = ? AND livemode = ?`)
    .bind(clientId, livemode ? 1 : 0)
    .first<{ customer_id: string }>();
  return row?.customer_id ?? null;
}

/** Keeps the identity's Stripe Customer; returns the one stored (an earlier one wins a race). */
export async function saveStripeCustomer(db: D1Database, clientId: string, livemode: boolean, customerId: string, now = Date.now()): Promise<string> {
  const [, read] = await db.batch<{ customer_id: string }>([
    db
      .prepare(`INSERT OR IGNORE INTO stripe_customers (client_id, livemode, customer_id, created_at) VALUES (?, ?, ?, ?)`)
      .bind(clientId, livemode ? 1 : 0, customerId, now),
    db.prepare(`SELECT customer_id FROM stripe_customers WHERE client_id = ? AND livemode = ?`).bind(clientId, livemode ? 1 : 0),
  ]);
  return read.results[0]?.customer_id ?? customerId;
}

// ---- Accounts (optional sign-in: worker/auth, docs/auth.md) ----

/**
 * A device signing in to an account: its passes move to the account's
 * canonical clientId (the device's and the account's are both kept; the
 * identity is covered while any of them is active), and so does its Stripe
 * Customer, unless the account already has one for the same keys. That can't
 * really happen: the web only sells the pass to a device signed in to an
 * account, which already acts as the canonical clientId, so a device's own
 * clientId never has a Customer to bring. For the same batch as the core and
 * push rows and the link (worker/auth/store.ts linkDevice).
 */
export function mergeClientStatements(db: D1Database, from: string, to: string, now: number): D1PreparedStatement[] {
  return [
    db.prepare(`UPDATE host_passes SET client_id = ?2, updated_at = ?3 WHERE client_id = ?1`).bind(from, to, now),
    db.prepare(`UPDATE OR IGNORE stripe_customers SET client_id = ?2 WHERE client_id = ?1`).bind(from, to),
    db.prepare(`DELETE FROM stripe_customers WHERE client_id = ?`).bind(from),
  ];
}
