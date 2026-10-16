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

vi.mock("../service", () => ({ isHost: vi.fn(), activateGame: vi.fn(), loadState: vi.fn() }));
vi.mock("../db", () => ({ getGame: vi.fn() }));

const ADMIN = "admin-token-1";
const WEBHOOK_SECRET = "whsec_test";
const BUNDLE = "com.jaxsquares.app";
const PRODUCT = "com.jaxsquares.app.board";

let ledger: TestD1;
let games: Map<string, Game>;
let fetchMock: ReturnType<typeof vi.fn>;

const stateOf = (game: Game) => ({ game, version: 1 }) as unknown as GameState;

function draft(id: string): Game {
  return { id, name: "Big Game", status: "draft" } as Game;
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
  ledger = await createTestD1(["migrations/0003_purchases.sql"]);
  games = new Map([["g1", draft("g1")], ["g2", draft("g2")]]);
  vi.mocked(db.getGame).mockImplementation(async (_db, id) => games.get(id) ?? null);
  vi.mocked(service.isHost).mockImplementation(async (_env, _id, token) => token === ADMIN);
  vi.mocked(service.loadState).mockImplementation(async (_env, id) => (games.has(id) ? stateOf(games.get(id)!) : null));
  vi.mocked(service.activateGame).mockImplementation(async (_env, id) => {
    const game = games.get(id);
    if (!game) return null;
    if (game.status === "draft") games.set(id, { ...game, status: "open" });
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
  it("opens the host's draft board with a no-charge purchase", async () => {
    const res = await call("/games/g1/pay/test");
    expect(res.status).toBe(200);
    expect(((await res.json()) as { state: GameState }).state.game.status).toBe("open");
    expect(service.activateGame).toHaveBeenCalledWith(expect.anything(), "g1", { provider: "test", reference: "test:g1", amountCents: 0 });
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
    expect(service.activateGame).not.toHaveBeenCalled();
  });

  it("is off in live mode", async () => {
    const env = makeEnv({ PAYMENTS_MODE: "live", STRIPE_PUBLISHABLE_KEY: "pk_live_1" });
    const res = await call("/games/g1/pay/test", { env });
    expect(res.status).toBe(403);
    expect(games.get("g1")!.status).toBe("draft");
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
    expect(await res.json()).toEqual({ clientSecret: "pi_1_secret_abc" });
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
    expect(await res.json()).toEqual({ clientSecret: "pi_1_secret_abc" });
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
    expect(await res.json()).toEqual({ clientSecret: "pi_2_secret" });
    expect(((fetchMock.mock.calls[2][1] as RequestInit).headers as Record<string, string>)["idempotency-key"]).toBe(
      "board-g1-499usd-after-pi_1",
    );
    expect(purchases().map((p) => [p.reference, p.status])).toEqual([
      ["pi_1", "canceled"],
      ["pi_2", "pending"],
    ]);
  });

  it("activates right away when the stored intent already succeeded (webhook still in flight)", async () => {
    fetchMock.mockResolvedValueOnce(Response.json(intent()));
    await call("/games/g1/pay/stripe");
    fetchMock.mockResolvedValueOnce(Response.json(intent({ status: "succeeded", amount_received: 499 })));
    const res = await call("/games/g1/pay/stripe");
    expect(res.status).toBe(409);
    const body = (await res.json()) as { state: GameState };
    expect(body.state.game.status).toBe("open");
    expect(service.activateGame).toHaveBeenCalledWith(expect.anything(), "g1", { provider: "stripe", reference: "pi_1", amountCents: 499 });
    expect(purchases()[0].status).toBe("paid");
  });

  it("says the board is already active instead of charging twice", async () => {
    games.set("g1", { ...draft("g1"), status: "open" });
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

  it("activates the board on payment_intent.succeeded", async () => {
    const res = await deliver(succeeded());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
    expect(service.activateGame).toHaveBeenCalledWith(expect.anything(), "g1", { provider: "stripe", reference: "pi_9", amountCents: 499 });
    expect(purchases()).toEqual([
      { reference: "pi_9", game_id: "g1", provider: "stripe", status: "paid", amount_cents: 499, currency: "usd", livemode: 1 },
    ]);
  });

  it("handles duplicate deliveries", async () => {
    await deliver(succeeded());
    expect((await deliver(succeeded())).status).toBe(200);
    expect(purchases()).toHaveLength(1);
    expect(games.get("g1")!.status).toBe("open");
  });

  it("rejects a tampered body", async () => {
    const payload = succeeded();
    const signature = await signStripePayload(payload, WEBHOOK_SECRET, NOW());
    const res = await deliver(payload.replace('"g1"', '"g2"'), signature);
    expect(res.status).toBe(400);
    expect(service.activateGame).not.toHaveBeenCalled();
  });

  it("rejects a replayed (stale) delivery", async () => {
    const payload = succeeded();
    const res = await deliver(payload, await signStripePayload(payload, WEBHOOK_SECRET, NOW() - 600));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toMatch(/stale/);
    expect(service.activateGame).not.toHaveBeenCalled();
  });

  it("ignores intents that aren't board purchases, and other event types", async () => {
    expect((await deliver(succeeded({ game_id: "g1" }))).status).toBe(200);
    expect((await deliver(event("charge.succeeded", { id: "ch_1", object: "charge", metadata: { game_id: "g1", product: "board" } }))).status).toBe(200);
    expect(service.activateGame).not.toHaveBeenCalled();
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

  it("verifies the purchase with Apple and opens the board", async () => {
    fetchMock.mockResolvedValueOnce(Response.json(signedTransaction()));
    const res = await call("/games/g1/pay/iap", { body: { transactionId: TX } });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { state: GameState }).state.game.status).toBe("open");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${APP_STORE_HOSTS.production}/inApps/v1/transactions/${TX}`);
    expect((init.headers as Record<string, string>).authorization).toMatch(/^Bearer /);
    expect(service.activateGame).toHaveBeenCalledWith(expect.anything(), "g1", { provider: "iap", reference: TX, amountCents: 499 });
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
    expect(games.get("g2")!.status).toBe("draft");
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
    expect(service.activateGame).not.toHaveBeenCalled();
  });

  it("answers a retry from the ledger without asking Apple again", async () => {
    fetchMock.mockResolvedValueOnce(Response.json(signedTransaction()));
    await call("/games/g1/pay/iap", { body: { transactionId: TX } });
    const res = await call("/games/g1/pay/iap", { body: { transactionId: TX } });
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
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
