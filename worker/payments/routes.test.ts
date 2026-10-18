// @vitest-environment node
// Route flows for every checkout rail, against a real SQLite purchases ledger.
// Core's service/db are mocked: activation itself is core's (idempotent) job.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Game, GameState } from "../../shared/types";
import * as db from "../db";
import type { Env } from "../env";
import * as service from "../service";
import { APP_STORE_HOSTS } from "./apple";
import { boardAccountToken } from "./boardToken";
import { base64UrlEncode } from "./encoding";
import { paymentsRoutes } from "./routes";
import { signStripePayload } from "./stripe";
import { createTestD1, type TestD1 } from "./testD1";

vi.mock("../service", () => ({ isHost: vi.fn(), markPaid: vi.fn(), loadState: vi.fn() }));
vi.mock("../db", () => ({ getGame: vi.fn() }));

const ADMIN = "admin-token-1";
const WEBHOOK_SECRET = "whsec_test";
const BUNDLE = "com.jaxsquares.app";
const PRODUCT = "com.jaxsquares.app.board";

let ledger: TestD1;
let games: Map<string, Game>;
let fetchMock: ReturnType<typeof vi.fn>;

const stateOf = (game: Game) => ({ game, version: 1 }) as unknown as GameState;

/** A new board: open (friends picking squares), its host fee not paid yet. */
function unpaid(id: string): Game {
  return { id, name: "Big Game", status: "open", paid: false, createdAt: 0 } as Game;
}

async function testPem(): Promise<string> {
  const pair = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign"])) as CryptoKeyPair;
  const der = new Uint8Array((await crypto.subtle.exportKey("pkcs8", pair.privateKey)) as ArrayBuffer);
  return `-----BEGIN PRIVATE KEY-----\n${btoa(String.fromCharCode(...der))}\n-----END PRIVATE KEY-----`;
}

let pem: string;

function makeEnv(vars: Partial<Env> = {}): Env {
  return {
    DB: ledger.d1,
    BOARD_PRICE_CENTS: "499",
    IAP_PRODUCT_ID: PRODUCT,
    STRIPE_SECRET_KEY: "sk_test_1",
    STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET,
    APPLE_IAP_KEY_ID: "KEYID",
    APPLE_IAP_ISSUER_ID: "issuer",
    APPLE_IAP_PRIVATE_KEY: pem,
    APPLE_BUNDLE_ID: BUNDLE,
    ...vars,
  } as Env;
}

function call(path: string, opts: { env?: Env; admin?: string | null; clientId?: string | null; body?: unknown } = {}) {
  const headers: Record<string, string> = {};
  if (opts.clientId !== null) headers["x-client-id"] = opts.clientId ?? "client-1";
  if (opts.admin !== null) headers["x-admin-token"] = opts.admin ?? ADMIN;
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  return paymentsRoutes.request(
    path,
    { method: "POST", headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) },
    opts.env ?? makeEnv(),
  );
}

const purchases = () => ledger.query("SELECT reference, game_id, provider, status, amount_cents, currency, livemode FROM purchases ORDER BY created_at, reference");

beforeEach(async () => {
  pem ??= await testPem();
  ledger = await createTestD1(["migrations/0003_purchases.sql", "migrations/0006_purchases_unused.sql"]);
  games = new Map([["g1", unpaid("g1")], ["g2", unpaid("g2")]]);
  vi.mocked(db.getGame).mockImplementation(async (_db, id) => games.get(id) ?? null);
  vi.mocked(service.isHost).mockImplementation(async (_env, _id, token) => token === ADMIN);
  vi.mocked(service.loadState).mockImplementation(async (_env, id) => (games.has(id) ? stateOf(games.get(id)!) : null));
  vi.mocked(service.markPaid).mockImplementation(async (_env, id) => {
    const game = games.get(id);
    if (!game) return null;
    if (!game.paid) games.set(id, { ...game, paid: true });
    return stateOf(games.get(id)!);
  });
  fetchMock = vi.fn(async () => {
    throw new Error("unexpected fetch");
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("POST /games/:id/pay/test", () => {
  it("marks the host's board paid with a no-charge purchase", async () => {
    const res = await call("/games/g1/pay/test");
    expect(res.status).toBe(200);
    expect(((await res.json()) as { state: GameState }).state.game.paid).toBe(true);
    expect(service.markPaid).toHaveBeenCalledWith(expect.anything(), "g1", { provider: "test", reference: "test:g1", amountCents: 0 });
    expect(purchases()).toEqual([
      { reference: "test:g1", game_id: "g1", provider: "test", status: "paid", amount_cents: 0, currency: "usd", livemode: 0 },
    ]);
  });

  it("is idempotent", async () => {
    await call("/games/g1/pay/test");
    const again = await call("/games/g1/pay/test");
    expect(again.status).toBe(200);
    expect(purchases()).toHaveLength(1);
  });

  it("is host-only and needs a client id", async () => {
    expect((await call("/games/g1/pay/test", { admin: "nope" })).status).toBe(403);
    expect((await call("/games/g1/pay/test", { admin: null })).status).toBe(403);
    expect((await call("/games/g1/pay/test", { clientId: null })).status).toBe(400);
    expect((await call("/games/zzz/pay/test")).status).toBe(404);
    expect(service.markPaid).not.toHaveBeenCalled();
  });

  it("is off in live mode", async () => {
    const env = makeEnv({ PAYMENTS_MODE: "live", STRIPE_PUBLISHABLE_KEY: "pk_live_1" });
    const res = await call("/games/g1/pay/test", { env });
    expect(res.status).toBe(403);
    expect(games.get("g1")!.paid).toBe(false);
  });
});

describe("POST /games/:id/pay/stripe", () => {
  const intent = (over: Record<string, unknown> = {}) => ({
    id: "pi_1",
    object: "payment_intent",
    amount: 499,
    amount_received: 0,
    currency: "usd",
    status: "requires_payment_method",
    client_secret: "pi_1_secret_abc",
    livemode: false,
    metadata: { game_id: "g1", product: "board" },
    ...over,
  });

  it("creates one PaymentIntent per board and returns its client secret", async () => {
    fetchMock.mockResolvedValueOnce(Response.json(intent()));
    const res = await call("/games/g1/pay/stripe");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ clientSecret: "pi_1_secret_abc", amountCents: 499, currency: "usd" });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.stripe.com/v1/payment_intents");
    expect((init.headers as Record<string, string>)["idempotency-key"]).toBe("board-g1-499usd");
    expect(new URLSearchParams(init.body as string).get("metadata[game_id]")).toBe("g1");
    expect(purchases()).toEqual([
      { reference: "pi_1", game_id: "g1", provider: "stripe", status: "pending", amount_cents: 499, currency: "usd", livemode: 0 },
    ]);
  });

  it("reuses the open intent on retry instead of creating another", async () => {
    fetchMock.mockResolvedValueOnce(Response.json(intent()));
    await call("/games/g1/pay/stripe");
    fetchMock.mockResolvedValueOnce(Response.json(intent()));
    const res = await call("/games/g1/pay/stripe");
    expect(await res.json()).toEqual({ clientSecret: "pi_1_secret_abc", amountCents: 499, currency: "usd" });
    expect(fetchMock.mock.calls[1][0]).toBe("https://api.stripe.com/v1/payment_intents/pi_1");
    expect((fetchMock.mock.calls[1][1] as RequestInit).method).toBe("GET");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("replaces a canceled intent with a fresh idempotency key", async () => {
    fetchMock.mockResolvedValueOnce(Response.json(intent()));
    await call("/games/g1/pay/stripe");
    fetchMock
      .mockResolvedValueOnce(Response.json(intent({ status: "canceled" })))
      .mockResolvedValueOnce(Response.json(intent({ id: "pi_2", client_secret: "pi_2_secret" })));
    const res = await call("/games/g1/pay/stripe");
    expect(await res.json()).toEqual({ clientSecret: "pi_2_secret", amountCents: 499, currency: "usd" });
    expect(((fetchMock.mock.calls[2][1] as RequestInit).headers as Record<string, string>)["idempotency-key"]).toBe(
      "board-g1-499usd-after-pi_1",
    );
    expect(purchases().map((p) => [p.reference, p.status])).toEqual([
      ["pi_1", "canceled"],
      ["pi_2", "pending"],
    ]);
  });

  it("returns the intent's own amount, so the page shows and charges the same price", async () => {
    fetchMock.mockResolvedValueOnce(Response.json(intent({ amount: 599 })));
    const res = await call("/games/g1/pay/stripe", { env: makeEnv({ BOARD_PRICE_CENTS: "599" }) });
    expect(await res.json()).toEqual({ clientSecret: "pi_1_secret_abc", amountCents: 599, currency: "usd" });
  });

  it("cancels a still-payable intent at Stripe before replacing it after a price change", async () => {
    fetchMock.mockResolvedValueOnce(Response.json(intent()));
    await call("/games/g1/pay/stripe");
    fetchMock
      .mockResolvedValueOnce(Response.json(intent()))
      .mockResolvedValueOnce(Response.json(intent({ status: "canceled" })))
      .mockResolvedValueOnce(Response.json(intent({ id: "pi_2", amount: 599, client_secret: "pi_2_secret" })));
    const res = await call("/games/g1/pay/stripe", { env: makeEnv({ BOARD_PRICE_CENTS: "599" }) });
    expect(await res.json()).toEqual({ clientSecret: "pi_2_secret", amountCents: 599, currency: "usd" });
    // An old tab can't pay the $4.99 intent any more.
    expect(fetchMock.mock.calls[2][0]).toBe("https://api.stripe.com/v1/payment_intents/pi_1/cancel");
    expect((fetchMock.mock.calls[2][1] as RequestInit).method).toBe("POST");
    expect(purchases().map((p) => [p.reference, p.status, p.amount_cents])).toEqual([
      ["pi_1", "canceled", 499],
      ["pi_2", "pending", 599],
    ]);
  });

  it("doesn't replace an intent Stripe won't cancel (it may be getting paid right now)", async () => {
    fetchMock.mockResolvedValueOnce(Response.json(intent()));
    await call("/games/g1/pay/stripe");
    vi.spyOn(console, "error").mockImplementation(() => {});
    fetchMock
      .mockResolvedValueOnce(Response.json(intent()))
      .mockResolvedValueOnce(Response.json({ error: { message: "unexpected state", code: "payment_intent_unexpected_state" } }, { status: 400 }));
    const res = await call("/games/g1/pay/stripe", { env: makeEnv({ BOARD_PRICE_CENTS: "599" }) });
    expect(res.status).toBe(502);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(purchases().map((p) => [p.reference, p.status])).toEqual([["pi_1", "pending"]]);
  });

  it("marks the board paid right away when the stored intent already succeeded (webhook still in flight)", async () => {
    fetchMock.mockResolvedValueOnce(Response.json(intent()));
    await call("/games/g1/pay/stripe");
    fetchMock.mockResolvedValueOnce(Response.json(intent({ status: "succeeded", amount_received: 499 })));
    const res = await call("/games/g1/pay/stripe");
    expect(res.status).toBe(409);
    const body = (await res.json()) as { state: GameState };
    expect(body.state.game.paid).toBe(true);
    expect(service.markPaid).toHaveBeenCalledWith(expect.anything(), "g1", { provider: "stripe", reference: "pi_1", amountCents: 499 });
    expect(purchases()[0].status).toBe("paid");
  });

  it("says the board is already paid for instead of charging twice", async () => {
    games.set("g1", { ...unpaid("g1"), paid: true });
    const res = await call("/games/g1/pay/stripe");
    expect(res.status).toBe(409);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 502 when Stripe errors, and 503 without a secret key", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ error: { message: "boom" } }, { status: 500 }));
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await call("/games/g1/pay/stripe")).status).toBe(502);
    expect((await call("/games/g1/pay/stripe", { env: makeEnv({ STRIPE_SECRET_KEY: undefined }) })).status).toBe(503);
    expect((await call("/games/g1/pay/stripe", { admin: "wrong" })).status).toBe(403);
  });
});

describe("POST /stripe/webhook", () => {
  const NOW = () => Math.floor(Date.now() / 1000);

  function event(type: string, object: Record<string, unknown>) {
    return JSON.stringify({ id: "evt_1", object: "event", type, livemode: true, data: { object } });
  }
  const succeeded = (metadata: Record<string, string> = { game_id: "g1", product: "board" }) =>
    event("payment_intent.succeeded", {
      id: "pi_9",
      object: "payment_intent",
      amount: 499,
      amount_received: 499,
      currency: "usd",
      status: "succeeded",
      livemode: true,
      metadata,
    });

  async function deliver(payload: string, signature?: string) {
    return paymentsRoutes.request(
      "/stripe/webhook",
      {
        method: "POST",
        headers: { "content-type": "application/json", "stripe-signature": signature ?? (await signStripePayload(payload, WEBHOOK_SECRET, NOW())) },
        body: payload,
      },
      makeEnv(),
    );
  }

  it("marks the board paid on payment_intent.succeeded", async () => {
    const res = await deliver(succeeded());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
    expect(service.markPaid).toHaveBeenCalledWith(expect.anything(), "g1", { provider: "stripe", reference: "pi_9", amountCents: 499 });
    expect(purchases()).toEqual([
      { reference: "pi_9", game_id: "g1", provider: "stripe", status: "paid", amount_cents: 499, currency: "usd", livemode: 1 },
    ]);
  });

  it("handles duplicate deliveries", async () => {
    await deliver(succeeded());
    expect((await deliver(succeeded())).status).toBe(200);
    expect(purchases()).toHaveLength(1);
    expect(games.get("g1")!.paid).toBe(true);
  });

  it("rejects a tampered body", async () => {
    const payload = succeeded();
    const signature = await signStripePayload(payload, WEBHOOK_SECRET, NOW());
    const res = await deliver(payload.replace('"g1"', '"g2"'), signature);
    expect(res.status).toBe(400);
    expect(service.markPaid).not.toHaveBeenCalled();
  });

  it("rejects a replayed (stale) delivery", async () => {
    const payload = succeeded();
    const res = await deliver(payload, await signStripePayload(payload, WEBHOOK_SECRET, NOW() - 600));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toMatch(/stale/);
    expect(service.markPaid).not.toHaveBeenCalled();
  });

  it("keeps a payment for a board deleted before it landed as unused, and marks nothing", async () => {
    games.delete("g1");
    expect((await deliver(succeeded())).status).toBe(200);
    expect(service.markPaid).not.toHaveBeenCalled();
    expect(purchases()).toEqual([
      { reference: "pi_9", game_id: "g1", provider: "stripe", status: "unused", amount_cents: 499, currency: "usd", livemode: 1 },
    ]);
  });

  it("ignores intents that aren't board purchases, and other event types", async () => {
    expect((await deliver(succeeded({ game_id: "g1" }))).status).toBe(200);
    expect((await deliver(event("charge.succeeded", { id: "ch_1", object: "charge", metadata: { game_id: "g1", product: "board" } }))).status).toBe(200);
    expect(service.markPaid).not.toHaveBeenCalled();
    expect(purchases()).toEqual([]);
  });
});

describe("POST /games/:id/pay/iap", () => {
  const TX = "2000000812345678";

  function signedTransaction(over: Record<string, unknown> = {}) {
    const payload = {
      transactionId: TX,
      originalTransactionId: TX,
      bundleId: BUNDLE,
      productId: PRODUCT,
      type: "Consumable",
      quantity: 1,
      price: 4990,
      currency: "USD",
      environment: "Production",
      appAccountToken: boardAccountToken("g1"),
      ...over,
    };
    const part = (v: unknown) => base64UrlEncode(JSON.stringify(v));
    return { signedTransactionInfo: `${part({ alg: "ES256", x5c: [] })}.${part(payload)}.${base64UrlEncode(new Uint8Array(64))}` };
  }

  it("verifies the purchase with Apple and marks the board paid", async () => {
    fetchMock.mockResolvedValueOnce(Response.json(signedTransaction()));
    const res = await call("/games/g1/pay/iap", { body: { transactionId: TX } });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { state: GameState }).state.game.paid).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${APP_STORE_HOSTS.production}/inApps/v1/transactions/${TX}`);
    expect((init.headers as Record<string, string>).authorization).toMatch(/^Bearer /);
    expect(service.markPaid).toHaveBeenCalledWith(expect.anything(), "g1", { provider: "iap", reference: TX, amountCents: 499 });
    expect(purchases()).toEqual([
      { reference: TX, game_id: "g1", provider: "iap", status: "paid", amount_cents: 499, currency: "usd", livemode: 1 },
    ]);
  });

  it("finds sandbox purchases (TestFlight, App Review) after a production 404", async () => {
    fetchMock
      .mockResolvedValueOnce(Response.json({ errorCode: 4040010 }, { status: 404 }))
      .mockResolvedValueOnce(Response.json(signedTransaction({ environment: "Sandbox" })));
    const res = await call("/games/g1/pay/iap", { body: { transactionId: TX } });
    expect(res.status).toBe(200);
    expect(fetchMock.mock.calls[1][0]).toBe(`${APP_STORE_HOSTS.sandbox}/inApps/v1/transactions/${TX}`);
    expect(purchases()[0].livemode).toBe(0);
  });

  it("won't let one purchase open two boards", async () => {
    fetchMock.mockResolvedValueOnce(Response.json(signedTransaction({ appAccountToken: undefined })));
    expect((await call("/games/g1/pay/iap", { body: { transactionId: TX } })).status).toBe(200);
    const res = await call("/games/g2/pay/iap", { body: { transactionId: TX } });
    expect(res.status).toBe(409);
    expect(games.get("g2")!.paid).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1); // the second board never reached Apple
  });

  it("rejects a purchase bound to a different board", async () => {
    fetchMock.mockResolvedValueOnce(Response.json(signedTransaction()));
    const res = await call("/games/g2/pay/iap", { body: { transactionId: TX } });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toMatch(/different board/);
    expect(purchases()).toEqual([]);
  });

  it("rejects the wrong product, the wrong app, and refunds", async () => {
    for (const over of [{ productId: "com.jaxsquares.app.other" }, { bundleId: "com.copycat.app" }, { revocationDate: 1 }]) {
      fetchMock.mockResolvedValueOnce(Response.json(signedTransaction(over)));
      expect((await call("/games/g1/pay/iap", { body: { transactionId: TX } })).status).toBe(400);
    }
    expect(service.markPaid).not.toHaveBeenCalled();
  });

  it("answers a retry from the ledger without asking Apple again", async () => {
    fetchMock.mockResolvedValueOnce(Response.json(signedTransaction()));
    await call("/games/g1/pay/iap", { body: { transactionId: TX } });
    const res = await call("/games/g1/pay/iap", { body: { transactionId: TX } });
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("won't let a second purchase pay for a board that's already paid for: it's kept as unused, not paid", async () => {
    // tx 1001 is charged but can't be confirmed (a bad Apple key answers 401 every time)...
    vi.spyOn(console, "error").mockImplementation(() => {});
    fetchMock.mockResolvedValue(new Response("", { status: 401 }));
    for (let i = 0; i < 3; i++) expect((await call("/games/g1/pay/iap", { body: { transactionId: "1001" } })).status).toBe(502);
    // ...another purchase pays for the board, then recovery sends 1001 again.
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (url: string) =>
      Response.json(signedTransaction({ transactionId: url.endsWith("1002") ? "1002" : "1001" })),
    );
    expect((await call("/games/g1/pay/iap", { body: { transactionId: "1002" } })).status).toBe(200);
    const res = await call("/games/g1/pay/iap", { body: { transactionId: "1001" } });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string; state: GameState; unused: boolean };
    expect(body).toMatchObject({ unused: true, state: { game: { paid: true } } });
    expect(body.error).toMatch(/already paid for.*reportaproblem\.apple\.com/);
    expect(service.markPaid).toHaveBeenCalledTimes(1);
    expect(purchases().map((p) => [p.reference, p.status])).toEqual([
      ["1002", "paid"],
      ["1001", "unused"],
    ]);
    // A retry is answered from the ledger.
    const calls = fetchMock.mock.calls.length;
    expect((await call("/games/g1/pay/iap", { body: { transactionId: "1001" } })).status).toBe(409);
    expect(fetchMock).toHaveBeenCalledTimes(calls);
  });

  it("keeps a verified purchase for a board deleted before it was confirmed (410), so it isn't lost", async () => {
    games.delete("g1");
    fetchMock.mockResolvedValue(Response.json(signedTransaction()));
    // Nobody can prove they host a deleted board, so the admin token isn't needed: Apple's binding is the proof.
    const res = await call("/games/g1/pay/iap", { body: { transactionId: TX }, admin: null });
    expect(res.status).toBe(410);
    expect(((await res.json()) as { error: string; unused: boolean })).toMatchObject({
      unused: true,
      error: expect.stringMatching(/deleted.*reportaproblem\.apple\.com/),
    });
    expect(purchases()).toEqual([
      { reference: TX, game_id: "g1", provider: "iap", status: "unused", amount_cents: 499, currency: "usd", livemode: 1 },
    ]);
    expect(service.markPaid).not.toHaveBeenCalled();
    // Not bound to the deleted board: nothing is recorded.
    fetchMock.mockResolvedValue(Response.json(signedTransaction({ transactionId: "77", appAccountToken: undefined })));
    expect((await call("/games/g1/pay/iap", { body: { transactionId: "77" } })).status).toBe(404);
    fetchMock.mockResolvedValue(Response.json(signedTransaction({ transactionId: "78", appAccountToken: boardAccountToken("g2") })));
    expect((await call("/games/g1/pay/iap", { body: { transactionId: "78" } })).status).toBe(400);
    expect(purchases()).toHaveLength(1);
  });

  it("answers 410 for a purchase that paid for a board that's since been deleted", async () => {
    fetchMock.mockResolvedValueOnce(Response.json(signedTransaction()));
    expect((await call("/games/g1/pay/iap", { body: { transactionId: TX } })).status).toBe(200);
    games.delete("g1");
    const res = await call("/games/g1/pay/iap", { body: { transactionId: TX } });
    expect(res.status).toBe(410);
    expect(((await res.json()) as { unused?: boolean }).unused).toBeUndefined();
    expect(purchases()[0].status).toBe("paid");
  });

  describe("two payments for one board at the same instant", () => {
    /** Apple answers for whichever transaction is asked about. */
    const appleAnswers = () =>
      fetchMock.mockImplementation(async (url: string) => Response.json(signedTransaction({ transactionId: url.split("/").pop() })));

    it("two App Store transactions: one pays for the board, the other is kept as unused (409) for a refund", async () => {
      appleAnswers();
      const [a, b] = await Promise.all([
        call("/games/g1/pay/iap", { body: { transactionId: "1001" } }),
        call("/games/g1/pay/iap", { body: { transactionId: "1002" } }),
      ]);
      expect([a.status, b.status].sort()).toEqual([200, 409]);
      const lost = (await (a.status === 409 ? a : b).json()) as { error: string; unused: boolean; state: GameState };
      expect(lost).toMatchObject({ unused: true, error: expect.stringMatching(/already paid for.*reportaproblem\.apple\.com/) });
      const rows = purchases();
      expect(rows.map((r) => r.status).sort()).toEqual(["paid", "unused"]);
      const winner = rows.find((r) => r.status === "paid")!.reference;
      expect(service.markPaid).toHaveBeenCalledTimes(1);
      expect(service.markPaid).toHaveBeenCalledWith(expect.anything(), "g1", { provider: "iap", reference: winner, amountCents: 499 });
      expect(games.get("g1")!.paid).toBe(true);
    });

    it("a Stripe webhook and an App Store purchase: only one is recorded as paying for the board", async () => {
      appleAnswers();
      const payload = JSON.stringify({
        id: "evt_1",
        object: "event",
        type: "payment_intent.succeeded",
        livemode: true,
        data: {
          object: {
            id: "pi_9",
            object: "payment_intent",
            amount: 499,
            amount_received: 499,
            currency: "usd",
            status: "succeeded",
            livemode: true,
            metadata: { game_id: "g1", product: "board" },
          },
        },
      });
      const signature = await signStripePayload(payload, WEBHOOK_SECRET, Math.floor(Date.now() / 1000));
      const [hook, iapRes] = await Promise.all([
        paymentsRoutes.request(
          "/stripe/webhook",
          { method: "POST", headers: { "content-type": "application/json", "stripe-signature": signature }, body: payload },
          makeEnv(),
        ),
        call("/games/g1/pay/iap", { body: { transactionId: TX } }),
      ]);
      expect(hook.status).toBe(200);
      const rows = purchases();
      expect(rows.map((r) => r.status).sort()).toEqual(["paid", "unused"]);
      const winner = rows.find((r) => r.status === "paid")!;
      // The App Store purchase is told when it lost, so the app finishes it and the host can ask for a refund.
      expect(iapRes.status).toBe(winner.reference === TX ? 200 : 409);
      expect(service.markPaid).toHaveBeenCalledTimes(1);
      expect(service.markPaid).toHaveBeenCalledWith(expect.anything(), "g1", expect.objectContaining({ reference: winner.reference }));
    });
  });

  it("validates input and reports Apple outages as retryable", async () => {
    expect((await call("/games/g1/pay/iap", { body: { transactionId: "abc" } })).status).toBe(400);
    expect((await call("/games/g1/pay/iap", { body: {} })).status).toBe(400);
    fetchMock.mockResolvedValueOnce(new Response("", { status: 401 }));
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await call("/games/g1/pay/iap", { body: { transactionId: TX } })).status).toBe(502);
    fetchMock.mockResolvedValue(Response.json({ errorCode: 4040010 }, { status: 404 }));
    expect((await call("/games/g1/pay/iap", { body: { transactionId: TX } })).status).toBe(400);
    expect((await call("/games/g1/pay/iap", { body: { transactionId: TX }, env: makeEnv({ APPLE_IAP_PRIVATE_KEY: "" }) })).status).toBe(503);
    expect((await call("/games/g1/pay/iap", { body: { transactionId: TX }, admin: "x" })).status).toBe(403);
  });
});
