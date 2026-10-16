// D1 access for the purchases ledger (migrations/0003_purchases.sql). The table
// belongs to the payments module, so its SQL lives here rather than in worker/db.ts.

export type PurchaseProvider = "test" | "stripe" | "iap";
export type PurchaseStatus = "pending" | "paid" | "canceled";

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

export async function getPurchase(db: D1Database, reference: string): Promise<Purchase | null> {
  const row = await db.prepare(`SELECT ${COLUMNS} FROM purchases WHERE reference = ?`).bind(reference).first<PurchaseRow>();
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
 * Marks a reference paid for a board and returns the stored row. A reference
 * already held by another board is left untouched, so the returned row's gameId
 * tells the caller who owns it. Atomic, so two boards racing for one Apple
 * transaction can't both win.
 */
export async function recordPaid(db: D1Database, p: NewPurchase, now = Date.now()): Promise<Purchase> {
  const [, read] = await db.batch<PurchaseRow>([
    db
      .prepare(
        `INSERT INTO purchases (${COLUMNS}) VALUES (?, ?, ?, 'paid', ?, ?, ?, ?, ?)
         ON CONFLICT(reference) DO UPDATE SET
           status = 'paid',
           amount_cents = excluded.amount_cents,
           currency = excluded.currency,
           livemode = excluded.livemode,
           paid_at = COALESCE(purchases.paid_at, excluded.paid_at)
         WHERE purchases.game_id = excluded.game_id`,
      )
      .bind(p.reference, p.gameId, p.provider, Math.trunc(p.amountCents), p.currency, p.livemode ? 1 : 0, now, now),
    db.prepare(`SELECT ${COLUMNS} FROM purchases WHERE reference = ?`).bind(p.reference),
  ]);
  return fromRow(read.results[0]);
}

export async function markCanceled(db: D1Database, reference: string): Promise<void> {
  await db.prepare(`UPDATE purchases SET status = 'canceled' WHERE reference = ? AND status = 'pending'`).bind(reference).run();
}
