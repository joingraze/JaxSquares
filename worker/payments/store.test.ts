// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { boardAccountToken, gameIdFromAccountToken } from "./boardToken";
import { milliunitsToMinor } from "./encoding";
import * as store from "./store";
import { createTestD1, type TestD1 } from "./testD1";

let t: TestD1;
beforeEach(async () => {
  t = await createTestD1(["migrations/0003_purchases.sql", "migrations/0006_purchases_unused.sql"]);
});

/** Boards in these tests were created at time 0. */
const BOARD = { createdAt: 0 };

const iap = (gameId: string, reference = "2000000000000001"): store.NewPurchase => ({
  reference,
  gameId,
  provider: "iap",
  amountCents: 499,
  currency: "usd",
  livemode: true,
});

describe("purchases ledger", () => {
  it("keeps a reference with the first board that claimed it", async () => {
    expect((await store.recordPaid(t.d1, iap("g1"), BOARD, 1)).gameId).toBe("g1");
    const second = await store.recordPaid(t.d1, { ...iap("g2"), amountCents: 999, livemode: false }, BOARD, 2);
    expect(second).toMatchObject({ gameId: "g1", amountCents: 499, livemode: true, paidAt: 1 });
    expect(t.query("SELECT game_id FROM purchases")).toEqual([{ game_id: "g1" }]);
  });

  it("moves a pending Stripe intent to paid, keeping the first paid time", async () => {
    const pi = { reference: "pi_1", gameId: "g1", provider: "stripe", amountCents: 499, currency: "usd", livemode: false } as const;
    await store.recordPending(t.d1, pi, 10);
    expect((await store.latestPending(t.d1, "g1", "stripe"))?.reference).toBe("pi_1");
    const paid = await store.recordPaid(t.d1, pi, BOARD, 20);
    expect(paid).toMatchObject({ status: "paid", createdAt: 10, paidAt: 20 });
    expect((await store.recordPaid(t.d1, pi, BOARD, 30)).paidAt).toBe(20);
    expect(await store.latestPending(t.d1, "g1", "stripe")).toBeNull();
  });

  it("only cancels pending rows", async () => {
    await store.recordPaid(t.d1, iap("g1"), BOARD);
    await store.markCanceled(t.d1, "2000000000000001");
    expect((await store.getPurchase(t.d1, "2000000000000001"))?.status).toBe("paid");
  });

  it("keeps a purchase that opened nothing as unused, without touching a reference already in the ledger", async () => {
    expect(await store.recordUnused(t.d1, iap("g1"), 5)).toMatchObject({ gameId: "g1", status: "unused", amountCents: 499, paidAt: 5 });
    // Already paid for g2: neither downgraded nor taken by g1.
    const paid = { ...iap("g2"), reference: "2000000000000002" };
    await store.recordPaid(t.d1, paid, BOARD, 6);
    expect(await store.recordUnused(t.d1, { ...paid, gameId: "g1" }, 7)).toMatchObject({ gameId: "g2", status: "paid", paidAt: 6 });
    expect(await store.latestPending(t.d1, "g1", "iap")).toBeNull();
  });

  it("rejects unknown providers at the schema level", async () => {
    await expect(store.recordPaid(t.d1, { ...iap("g1"), provider: "cash" as store.PurchaseProvider }, BOARD)).rejects.toThrow(/CHECK/);
  });
});

describe("one paid purchase per board", () => {
  const paidRows = (gameId: string) => t.query<{ reference: string }>(`SELECT reference FROM purchases WHERE game_id = ? AND status = 'paid'`, gameId);
  const statuses = () =>
    Object.fromEntries(t.query<{ reference: string; status: string }>(`SELECT reference, status FROM purchases`).map((r) => [r.reference, r.status]));

  it("two App Store transactions confirmed at the same instant: one pays, the other is kept as unused", async () => {
    const [a, b] = await Promise.all([
      store.recordPaid(t.d1, iap("g1", "1001"), BOARD, 5),
      store.recordPaid(t.d1, iap("g1", "1002"), BOARD, 5),
    ]);
    expect([a.status, b.status].sort()).toEqual(["paid", "unused"]);
    expect(paidRows("g1")).toHaveLength(1);
    // The loser's charge is in the ledger for a refund, with its amount and time.
    const loser = a.status === "unused" ? a : b;
    expect(loser).toMatchObject({ gameId: "g1", provider: "iap", amountCents: 499, paidAt: 5 });
  });

  it("many at once still leaves exactly one paid", async () => {
    const results = await Promise.all(Array.from({ length: 8 }, (_, i) => store.recordPaid(t.d1, iap("g1", `30${i}`), BOARD, 7)));
    expect(results.filter((r) => r.status === "paid")).toHaveLength(1);
    expect(results.filter((r) => r.status === "unused")).toHaveLength(7);
    expect(paidRows("g1")).toHaveLength(1);
  });

  it("a Stripe webhook and an App Store purchase at the same instant: the pending intent becomes unused if it loses", async () => {
    const pi = { reference: "pi_1", gameId: "g1", provider: "stripe", amountCents: 499, currency: "usd", livemode: true } as const;
    await store.recordPending(t.d1, pi, 3);
    const [iapRow, stripeRow] = await Promise.all([store.recordPaid(t.d1, iap("g1", "1001"), BOARD, 9), store.recordPaid(t.d1, pi, BOARD, 9)]);
    expect([iapRow.status, stripeRow.status].sort()).toEqual(["paid", "unused"]);
    expect(paidRows("g1")).toHaveLength(1);
    expect(await store.latestPending(t.d1, "g1", "stripe")).toBeNull();
    // The winner stays the winner on a retry (a dropped response, a duplicate webhook).
    const [winner, loser] = iapRow.status === "paid" ? [iap("g1", "1001"), pi] : [pi, iap("g1", "1001")];
    expect((await store.recordPaid(t.d1, winner, BOARD, 12)).status).toBe("paid");
    expect((await store.recordPaid(t.d1, loser, BOARD, 12)).status).toBe("unused");
    expect(paidRows("g1")).toEqual([{ reference: winner.reference }]);
  });

  it("other boards are unaffected, and a reference never moves to another board", async () => {
    await Promise.all([store.recordPaid(t.d1, iap("g1", "1001"), BOARD, 5), store.recordPaid(t.d1, iap("g2", "1002"), BOARD, 5)]);
    expect(statuses()).toEqual({ "1001": "paid", "1002": "paid" });
    // g2 trying g1's paid reference gets g1's row back, untouched.
    expect(await store.recordPaid(t.d1, iap("g2", "1001"), BOARD, 6)).toMatchObject({ gameId: "g1", status: "paid" });
  });

  it("only counts purchases made since this board was created (a deleted board's id can come back)", async () => {
    // An old board with this id was paid for, then deleted (the ledger keeps its row).
    await store.recordPaid(t.d1, iap("g1", "1001"), { createdAt: 100 }, 200);
    // A new board that happens to get the same id is created later and can still be paid for.
    expect((await store.recordPaid(t.d1, iap("g1", "1002"), { createdAt: 5_000 }, 6_000)).status).toBe("paid");
    // ...once.
    expect((await store.recordPaid(t.d1, iap("g1", "1003"), { createdAt: 5_000 }, 6_001)).status).toBe("unused");
  });
});

describe("boardAccountToken", () => {
  it("round-trips a game id through a UUID-shaped token", () => {
    const token = boardAccountToken("k7m2px")!;
    expect(token).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(gameIdFromAccountToken(token)).toBe("k7m2px");
    expect(gameIdFromAccountToken(token.toUpperCase())).toBe("k7m2px"); // Swift's uuidString
  });

  it("gives up on ids too long to encode, and ignores unrelated UUIDs", () => {
    expect(boardAccountToken("x".repeat(13))).not.toBeNull();
    expect(boardAccountToken("x".repeat(14))).toBeNull();
    expect(boardAccountToken("")).toBeNull();
    expect(gameIdFromAccountToken("550e8400-e29b-41d4-a716-446655440000")).toBeNull();
    expect(gameIdFromAccountToken("6a730261-6200-0000-0000-000000000001")).toBeNull(); // junk after the id
    expect(gameIdFromAccountToken("not-a-uuid")).toBeNull();
  });
});

describe("milliunitsToMinor", () => {
  it("converts Apple's milliunit prices to Stripe-style minor units", () => {
    expect(milliunitsToMinor(4990, "usd")).toBe(499);
    expect(milliunitsToMinor(800000, "JPY")).toBe(800);
    expect(milliunitsToMinor(4990, "KWD")).toBe(4990); // three-decimal currency
  });
});
