// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { boardAccountToken, gameIdFromAccountToken } from "./boardToken";
import { milliunitsToMinor } from "./encoding";
import * as store from "./store";
import { createTestD1, type TestD1 } from "./testD1";

let t: TestD1;
beforeEach(async () => {
  t = await createTestD1(["migrations/0003_purchases.sql"]);
});

const iap = (gameId: string): store.NewPurchase => ({
  reference: "2000000000000001",
  gameId,
  provider: "iap",
  amountCents: 499,
  currency: "usd",
  livemode: true,
});

describe("purchases ledger", () => {
  it("keeps a reference with the first board that claimed it", async () => {
    expect((await store.recordPaid(t.d1, iap("g1"), 1)).gameId).toBe("g1");
    const second = await store.recordPaid(t.d1, { ...iap("g2"), amountCents: 999, livemode: false }, 2);
    expect(second).toMatchObject({ gameId: "g1", amountCents: 499, livemode: true, paidAt: 1 });
    expect(t.query("SELECT game_id FROM purchases")).toEqual([{ game_id: "g1" }]);
  });

  it("moves a pending Stripe intent to paid, keeping the first paid time", async () => {
    const pi = { reference: "pi_1", gameId: "g1", provider: "stripe", amountCents: 499, currency: "usd", livemode: false } as const;
    await store.recordPending(t.d1, pi, 10);
    expect((await store.latestPending(t.d1, "g1", "stripe"))?.reference).toBe("pi_1");
    const paid = await store.recordPaid(t.d1, pi, 20);
    expect(paid).toMatchObject({ status: "paid", createdAt: 10, paidAt: 20 });
    expect((await store.recordPaid(t.d1, pi, 30)).paidAt).toBe(20);
    expect(await store.latestPending(t.d1, "g1", "stripe")).toBeNull();
  });

  it("only cancels pending rows", async () => {
    await store.recordPaid(t.d1, iap("g1"));
    await store.markCanceled(t.d1, "2000000000000001");
    expect((await store.getPurchase(t.d1, "2000000000000001"))?.status).toBe("paid");
  });

  it("rejects unknown providers at the schema level", async () => {
    await expect(store.recordPaid(t.d1, { ...iap("g1"), provider: "cash" as store.PurchaseProvider })).rejects.toThrow(/CHECK/);
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
