// @vitest-environment jsdom
// Tests for the payments client, src/lib/checkout.ts. The module is loaded
// through a computed path so the worker tsconfig (no DOM types) doesn't typecheck
// it; vitest still resolves and transforms it normally.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GameState, PaymentConfig } from "../../shared/types";
import * as server from "./boardToken";

const native = {
  configure: vi.fn(async () => {}),
  purchaseProduct: vi.fn(),
  finishTransaction: vi.fn(async () => {}),
  getUnfinishedTransactions: vi.fn(),
};
vi.mock("@capgo/native-purchases", () => ({ NativePurchases: native }));
vi.mock("@capacitor/core", () => ({ Capacitor: { getPlatform: () => "ios" } }));

type Handler = (e: Record<string, unknown>) => unknown;
const stripeMock = {
  loadStripe: vi.fn(),
  handlers: {} as Record<string, Handler>,
  element: { on: vi.fn(), mount: vi.fn(), destroy: vi.fn() },
  confirmPayment: vi.fn(),
};
vi.mock("@stripe/stripe-js", () => ({ loadStripe: (...args: unknown[]) => stripeMock.loadStripe(...args) }));

interface CheckoutError extends Error {
  status: number;
  state?: GameState;
}
interface Client {
  fetchAppConfig(opts?: { refresh?: boolean }): Promise<{ payments: PaymentConfig }>;
  checkoutMethod(config: PaymentConfig, platform: "ios" | "android" | "web"): string;
  formatPrice(cents: number, currency?: string, locale?: string): string;
  payTest(gameId: string, adminToken: string): Promise<GameState>;
  payWithIAP(gameId: string, adminToken: string): Promise<{ status: string; state?: GameState }>;
  recoverIAPPurchases(adminTokenFor: (gameId: string) => string | null): Promise<GameState[]>;
  createStripeIntent(gameId: string, adminToken: string): Promise<{ clientSecret: string }>;
  confirmStripePaid(gameId: string, adminToken: string): Promise<GameState | null>;
  mountWalletButton(el: unknown, opts: Record<string, unknown>): Promise<{ destroy(): void }>;
  boardAccountToken(gameId: string): string | null;
  gameIdFromAccountToken(token: string): string | null;
}

const CLIENT_PATH: string = "../../src/lib/checkout.ts";
async function load(): Promise<Client> {
  vi.resetModules();
  return (await import(/* @vite-ignore */ CLIENT_PATH)) as Client;
}

// DOM globals via globalThis: this file is typechecked by the worker tsconfig, which has no DOM lib.
const dom = globalThis as unknown as Record<string, unknown> & { document: { createElement(tag: string): unknown } };
const div = () => dom.document.createElement("div");

const PRODUCT = "com.jaxsquares.app.board";
const live: PaymentConfig = { mode: "live", priceCents: 499, currency: "usd", stripePublishableKey: "pk_test_1", iapProductId: PRODUCT };
const test: PaymentConfig = { ...live, mode: "test", stripePublishableKey: null };
const openState = { game: { id: "g1", status: "open" } } as unknown as GameState;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

let fetchMock: ReturnType<typeof vi.fn>;
let calls: { url: string; method: string; headers: Record<string, string>; body: unknown }[];

function route(handler: (url: string, method: string) => Response | Promise<Response>) {
  fetchMock.mockImplementation(async (url: string, init: RequestInit = {}) => {
    calls.push({
      url,
      method: init.method ?? "GET",
      headers: (init.headers ?? {}) as Record<string, string>,
      body: init.body ? JSON.parse(init.body as string) : undefined,
    });
    return handler(url, init.method ?? "GET");
  });
}

beforeEach(() => {
  calls = [];
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  localStorage.setItem("jaxsquares.clientId", "client-abc");
  for (const fn of Object.values(native)) fn.mockClear();
  stripeMock.handlers = {};
  stripeMock.element.on.mockImplementation((name: string, fn: Handler) => {
    stripeMock.handlers[name] = fn;
    return stripeMock.element;
  });
  stripeMock.loadStripe.mockResolvedValue({
    elements: vi.fn(() => ({ create: vi.fn(() => stripeMock.element) })),
    confirmPayment: stripeMock.confirmPayment,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  localStorage.clear();
  delete dom.ApplePaySession;
});

describe("checkoutMethod", () => {
  it("uses the test checkout whenever payments aren't live", async () => {
    const c = await load();
    for (const p of ["ios", "android", "web"] as const) expect(c.checkoutMethod(test, p)).toBe("test");
  });

  it("uses IAP in the iOS app and Stripe everywhere else", async () => {
    const c = await load();
    expect(c.checkoutMethod(live, "ios")).toBe("iap");
    expect(c.checkoutMethod(live, "web")).toBe("card"); // jsdom has no wallet API
    dom.ApplePaySession = function ApplePaySession() {};
    expect(c.checkoutMethod(live, "web")).toBe("wallet");
    expect(c.checkoutMethod(live, "android")).toBe("wallet");
  });
});

describe("formatPrice", () => {
  it("formats minor units, dropping .00 on whole amounts", async () => {
    const c = await load();
    expect(c.formatPrice(499, "usd", "en-US")).toBe("$4.99");
    expect(c.formatPrice(500, "usd", "en-US")).toBe("$5");
    expect(c.formatPrice(800, "jpy", "en-US")).toBe("¥800");
    expect(c.formatPrice(499, "nope", "en-US")).toBe("4.99 NOPE");
  });
});

describe("API calls", () => {
  it("fetches config once per session and refetches on demand", async () => {
    const c = await load();
    route(() => json({ payments: live, vapidPublicKey: null }));
    await c.fetchAppConfig();
    await c.fetchAppConfig();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(calls[0].url).toBe("/api/config");
    await c.fetchAppConfig({ refresh: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("doesn't cache a failed config fetch", async () => {
    const c = await load();
    route(() => json({ error: "down" }, 500));
    await expect(c.fetchAppConfig()).rejects.toMatchObject({ status: 500 });
    route(() => json({ payments: live, vapidPublicKey: null }));
    expect((await c.fetchAppConfig()).payments.mode).toBe("live");
  });

  it("sends the device and host headers on test checkout", async () => {
    const c = await load();
    route(() => json({ state: openState }));
    expect(await c.payTest("g1", "tok")).toEqual(openState);
    expect(calls[0]).toMatchObject({
      url: "/api/games/g1/pay/test",
      method: "POST",
      headers: { "x-client-id": "client-abc", "x-admin-token": "tok" },
    });
  });

  it("reports an already-open board with its state", async () => {
    const c = await load();
    route(() => json({ error: "This board is already active", state: openState }, 409));
    const err = (await c.createStripeIntent("g1", "tok").catch((e) => e)) as CheckoutError;
    expect(err).toMatchObject({ name: "CheckoutError", status: 409, state: openState });
  });

  it("turns a network failure into a friendly offline error", async () => {
    const c = await load();
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(c.payTest("g1", "tok")).rejects.toMatchObject({ status: 0, message: expect.stringMatching(/offline/) });
  });

  it("confirmStripePaid waits until the server reports the board open", async () => {
    vi.useFakeTimers();
    const c = await load();
    let n = 0;
    route(() => (++n < 3 ? json({ clientSecret: "pi_secret" }) : json({ error: "This board is already active", state: openState }, 409)));
    const p = c.confirmStripePaid("g1", "tok");
    await vi.runAllTimersAsync();
    expect(await p).toEqual(openState);
    expect(n).toBe(3);
  });
});

describe("payWithIAP", () => {
  const TX = "2000000812345678";

  it("buys the board's product bound to the board, verifies on the server, then finishes", async () => {
    const c = await load();
    native.purchaseProduct.mockResolvedValue({ transactionId: TX, productIdentifier: PRODUCT });
    route((url) => (url.endsWith("/config") ? json({ payments: live, vapidPublicKey: null }) : json({ state: openState })));

    expect(await c.payWithIAP("g1", "tok")).toEqual({ status: "paid", state: openState });
    expect(native.configure).toHaveBeenCalledWith({ autoFinishTransactions: false });
    expect(native.purchaseProduct).toHaveBeenCalledWith({
      productIdentifier: PRODUCT,
      quantity: 1,
      appAccountToken: server.boardAccountToken("g1"),
      autoAcknowledgePurchases: false,
    });
    expect(calls.at(-1)).toMatchObject({ url: "/api/games/g1/pay/iap", headers: { "x-admin-token": "tok" }, body: { transactionId: TX } });
    expect(native.finishTransaction).toHaveBeenCalledWith({ transactionId: TX });
  });

  it("treats the user closing the sheet as a cancel, and Ask to Buy as pending", async () => {
    const c = await load();
    route(() => json({ payments: live, vapidPublicKey: null }));
    native.purchaseProduct.mockRejectedValueOnce(new Error("User cancelled"));
    expect(await c.payWithIAP("g1", "tok")).toEqual({ status: "cancelled" });
    native.purchaseProduct.mockRejectedValueOnce(new Error("Transaction pending"));
    expect(await c.payWithIAP("g1", "tok")).toEqual({ status: "pending" });
    expect(calls.filter((x) => x.url.includes("/pay/iap"))).toEqual([]);
  });

  it("finishes the transaction when the server's answer is final", async () => {
    const c = await load();
    native.purchaseProduct.mockResolvedValue({ transactionId: TX, productIdentifier: PRODUCT });
    route((url) => (url.endsWith("/config") ? json({ payments: live, vapidPublicKey: null }) : json({ error: "That purchase already opened another board" }, 409)));
    await expect(c.payWithIAP("g1", "tok")).rejects.toMatchObject({ status: 409 });
    expect(native.finishTransaction).toHaveBeenCalledWith({ transactionId: TX });
  });

  it("retries a flaky server and leaves the transaction unfinished for recovery if it never answers", async () => {
    vi.useFakeTimers();
    const c = await load();
    native.purchaseProduct.mockResolvedValue({ transactionId: TX, productIdentifier: PRODUCT });
    route((url) => (url.endsWith("/config") ? json({ payments: live, vapidPublicKey: null }) : json({ error: "upstream" }, 502)));
    const p = c.payWithIAP("g1", "tok").catch((e) => e);
    await vi.runAllTimersAsync();
    expect(await p).toMatchObject({ status: 502 });
    expect(calls.filter((x) => x.url.includes("/pay/iap"))).toHaveLength(3);
    expect(native.finishTransaction).not.toHaveBeenCalled();
  });

  it("recovers unfinished purchases for boards this device hosts", async () => {
    const c = await load();
    native.getUnfinishedTransactions.mockResolvedValue({
      transactions: [
        { transactionId: "1", productIdentifier: PRODUCT, appAccountToken: server.boardAccountToken("g1")!.toUpperCase() },
        { transactionId: "2", productIdentifier: PRODUCT, appAccountToken: server.boardAccountToken("g9") },
        { transactionId: "3", productIdentifier: "other.product", appAccountToken: server.boardAccountToken("g1") },
        { transactionId: "4", productIdentifier: PRODUCT },
      ],
    });
    route((url) => (url.endsWith("/config") ? json({ payments: live, vapidPublicKey: null }) : json({ state: openState })));
    const opened = await c.recoverIAPPurchases((id) => (id === "g1" ? "tok" : null));
    expect(opened).toEqual([openState]);
    expect(calls.filter((x) => x.url.includes("/pay/iap")).map((x) => x.body)).toEqual([{ transactionId: "1" }]);
    expect(native.finishTransaction).toHaveBeenCalledTimes(1);
  });
});

describe("mountWalletButton", () => {
  const opts = (over: Record<string, unknown> = {}) => ({
    clientSecret: "pi_1_secret",
    amountCents: 499,
    label: "Squares board",
    publishableKey: "pk_test_1",
    onPaid: vi.fn(),
    onCancel: vi.fn(),
    onUnavailable: vi.fn(),
    onError: vi.fn(),
    ...over,
  });

  it("falls back when Stripe.js can't load", async () => {
    const c = await load();
    stripeMock.loadStripe.mockResolvedValueOnce(null);
    const o = opts();
    await c.mountWalletButton(div(), o);
    expect(o.onUnavailable).toHaveBeenCalled();
  });

  it("falls back when the device has no Apple Pay or Google Pay", async () => {
    const c = await load();
    const o = opts();
    await c.mountWalletButton(div(), o);
    expect(stripeMock.element.mount).toHaveBeenCalled();
    stripeMock.handlers.ready({ availablePaymentMethods: undefined });
    expect(o.onUnavailable).toHaveBeenCalledTimes(1);
    stripeMock.handlers.ready({ availablePaymentMethods: { applePay: true, googlePay: false } });
    expect(o.onUnavailable).toHaveBeenCalledTimes(1);
  });

  it("shows the board as the line item and reports a paid intent", async () => {
    const c = await load();
    const o = opts();
    await c.mountWalletButton(div(), o);
    const resolve = vi.fn();
    stripeMock.handlers.click({ resolve });
    expect(resolve).toHaveBeenCalledWith({ lineItems: [{ name: "Squares board", amount: 499 }] });

    stripeMock.confirmPayment.mockResolvedValueOnce({ paymentIntent: { id: "pi_1", status: "succeeded" } });
    await stripeMock.handlers.confirm({ paymentFailed: vi.fn() });
    expect(stripeMock.confirmPayment).toHaveBeenCalledWith(expect.objectContaining({ clientSecret: "pi_1_secret", redirect: "if_required" }));
    expect(o.onPaid).toHaveBeenCalledWith("pi_1");
  });

  it("tells the wallet sheet and the caller when the payment fails", async () => {
    const c = await load();
    const o = opts();
    await c.mountWalletButton(div(), o);
    const paymentFailed = vi.fn();
    stripeMock.confirmPayment.mockResolvedValueOnce({ error: { message: "Your card was declined." } });
    await stripeMock.handlers.confirm({ paymentFailed });
    expect(paymentFailed).toHaveBeenCalledWith({ reason: "fail" });
    expect(o.onError).toHaveBeenCalledWith("Your card was declined.");
    expect(o.onPaid).not.toHaveBeenCalled();
  });
});

describe("board token mirror", () => {
  it("matches the server implementation exactly", async () => {
    const c = await load();
    for (const id of ["g1", "k7m2px", "abcdefghjkmnp", "x".repeat(14), ""]) {
      expect(c.boardAccountToken(id)).toBe(server.boardAccountToken(id));
    }
    for (const token of [server.boardAccountToken("k7m2px")!, "550e8400-e29b-41d4-a716-446655440000", "6a730261-6200-0000-0000-000000000001"]) {
      expect(c.gameIdFromAccountToken(token)).toBe(server.gameIdFromAccountToken(token));
    }
  });
});
