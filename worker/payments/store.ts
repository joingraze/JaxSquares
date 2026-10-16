// D1 access for the purchases ledger (migrations/0003_purchases.sql, 0006). The table
// belongs to the payments module, so its SQL lives here rather than in worker/db.ts.
//
// A board has at most one 'paid' purchase: recordPaid decides that inside one
// transaction; any other verified charge for the board is kept as 'unused'.

export type PurchaseProvider = "test" | "stripe" | "iap";
/** "unused": charged, but it opened nothing (board already open, or deleted first); for refund follow-up. */
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
 * A verified purchase that opened nothing becomes 'unused': inserted, or a
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
 * both pay for it. The loser is kept as 'unused' (charged, opened nothing; for
 * refund follow-up), like a purchase for a board that was already open.
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
 * Records a verified purchase that can't open its board (already open, or
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
