// @vitest-environment node
// The Host Pass routes end to end (the real Worker, real SQL with every
// migration): the web subscription (Stripe Billing, behind a mocked fetch) with
// its account gate, confirm, webhooks and Manage; the App Store subscription
// (the App Store Server API behind a mocked fetch) with purchase, restore and
// Server Notifications V2. Apple's JWS signature check is mocked at its module
// boundary (appleJws.ts has its own tests against real certificates).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ACCOUNT_REQUIRED_CODE, type HostPassIntent, type HostPassState } from "../../shared/types";
import type { Env } from "../env";
import worker from "../index";
import { APP_STORE_HOSTS } from "./apple";
import { verifyAppleJws } from "./appleJws";
import { base64UrlEncode } from "./encoding";
import { signStripePayload } from "./stripe";
import { createTestD1, type TestD1 } from "./testD1";

vi.mock("../push", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../push")>()),
  notify: vi.fn(async () => {}),
}));

// The x5c chain check is appleJws.ts's job (tested there); here a JWS whose
// payload says it's forged is refused like a bad signature, anything else reads.
vi.mock("./appleJws", async (importOriginal) => {
  const orig = await importOriginal<typeof import("./appleJws")>();
  const { decodeJwsPayload } = await import("./apple");
  return {
    ...orig,
    verifyAppleJws: vi.fn(async (jws: string) => {
      const payload = decodeJwsPayload<Record<string, unknown>>(jws);
      if (payload.forged) throw new orig.AppleJwsError("signature doesn't verify");
      return payload;
    }),
  };
});

const PHONE = "phone-client-aaaa-00001";
const LAPTOP = "laptop-client-bbbb-0002";
const ANA = "ana-client-cccc-0000003";
const WEBHOOK_SECRET = "whsec_test";
const BUNDLE = "com.jaxsquares.app";
const PASS_PRODUCT = "com.jaxsquares.app.hostpass.yearly";
const DAY = 24 * 60 * 60_000;

const MIGRATIONS = [
  "migrations/0001_init.sql",
  "migrations/0002_core_model.sql",
  "migrations/0003_purchases.sql",
  "migrations/0004_push.sql",
  "migrations/0005_housekeeping.sql",
  "migrations/0006_purchases_unused.sql",
  "migrations/0007_board_full_announced.sql",
  "migrations/0008_custom_kickoff.sql",
  "migrations/0009_pay_at_draw.sql",
  "migrations/0010_accounts.sql",
  "migrations/0011_host_pass.sql",
  "migrations/0012_board_groups.sql",
  "migrations/0013_email.sql",
  "migrations/0014_cohosts.sql",
];

let t: TestD1;
let env: Env;
let fetchMock: ReturnType<typeof vi.fn>;
let pem: string;
/** Every response body, to check none carries a clientId. */
let seen: string[];

async function testPem(): Promise<string> {
  const pair = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign"])) as CryptoKeyPair;
  const der = new Uint8Array((await crypto.subtle.exportKey("pkcs8", pair.privateKey)) as ArrayBuffer);
  return `-----BEGIN PRIVATE KEY-----\n${btoa(String.fromCharCode(...der))}\n-----END PRIVATE KEY-----`;
}

beforeEach(async () => {
  pem ??= await testPem();
  t = await createTestD1(MIGRATIONS);
  seen = [];
  const stub = { fetch: async () => new Response(null, { status: 204 }) };
  env = {
    DB: t.d1,
    GAME_ROOM: { idFromName: (n: string) => n, get: () => stub } as unknown as DurableObjectNamespace,
    ASSETS: { fetch: async () => new Response("<html></html>") } as unknown as Fetcher,
    APP_ORIGIN: "https://jaxsquares.com",
    STRIPE_SECRET_KEY: "sk_test_1",
    STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET,
    STRIPE_HOST_PASS_PRICE_ID: "price_pass",
    APPLE_IAP_KEY_ID: "KEYID",
    APPLE_IAP_ISSUER_ID: "issuer",
    APPLE_IAP_PRIVATE_KEY: pem,
    APPLE_BUNDLE_ID: BUNDLE,
  } as Env;
  fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    throw new Error(`unexpected fetch ${String(input)}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  vi.mocked(verifyAppleJws).mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  for (const body of seen) for (const secret of [PHONE, LAPTOP, ANA]) expect(body).not.toContain(secret);
});

async function call<T = Record<string, unknown>>(
  method: string,
  path: string,
  opts: { client?: string | null; body?: unknown; raw?: string; headers?: Record<string, string> } = {},
): Promise<{ status: number; body: T; text: string }> {
  const headers: Record<string, string> = { ...opts.headers };
  if (opts.client !== null) headers["x-client-id"] = opts.client ?? PHONE;
  if (opts.body !== undefined || opts.raw !== undefined) headers["content-type"] = "application/json";
  const res = await worker.fetch(
    new Request(`https://jaxsquares.test/api${path}`, { method, headers, body: opts.raw ?? (opts.body === undefined ? undefined : JSON.stringify(opts.body)) }),
    env,
    { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext,
  );
  const text = await res.text();
  seen.push(text);
  return { status: res.status, body: (text ? JSON.parse(text) : {}) as T, text };
}

/** Signs `clients` in to one account (the first is canonical), the way worker/auth leaves it. */
function signedIn(...clients: string[]): void {
  const now = Date.now();
  t.query(`INSERT INTO accounts (id, canonical_client_id, created_at, updated_at) VALUES ('acct-1', ?, ?, ?)`, clients[0], now, now);
  for (const c of clients) t.query(`INSERT INTO client_links (client_id, account_id, created_at) VALUES (?, 'acct-1', ?)`, c, now);
}

const passes = () =>
  t.query<{ client_id: string; provider: string; external_id: string; status: string; current_period_end: number | null; auto_renew: number }>(
    `SELECT client_id, provider, external_id, status, current_period_end, auto_renew FROM host_passes ORDER BY created_at`,
  );

// ---- Stripe ----

const PERIOD_END = Math.floor((Date.now() + 365 * DAY) / 1000);

function subscription(over: Record<string, unknown> = {}) {
  return {
    id: "sub_1",
    object: "subscription",
    status: "incomplete",
    customer: "cus_1",
    current_period_end: PERIOD_END,
    cancel_at_period_end: false,
    livemode: false,
    metadata: { product: "host_pass", pass_id: "hp_x" },
    latest_invoice: {
      id: "in_1",
      object: "invoice",
      subscription: "sub_1",
      amount_due: 999,
      currency: "usd",
      status: "open",
      livemode: false,
      payment_intent: {
        id: "pi_sub_1",
        object: "payment_intent",
        amount: 999,
        amount_received: 0,
        currency: "usd",
        status: "requires_payment_method",
        client_secret: "pi_sub_1_secret_abc",
        livemode: false,
        metadata: {},
      },
    },
    ...over,
  };
}

/** Stripe answers by endpoint; `sub` is what the subscription reads as right now. */
function stripeAnswers(state: { sub: Record<string, unknown> }) {
  fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === "https://api.stripe.com/v1/customers") return Response.json({ id: "cus_1", object: "customer", livemode: false });
    if (url === "https://api.stripe.com/v1/subscriptions" && init?.method === "POST") return Response.json(state.sub);
    if (url.startsWith("https://api.stripe.com/v1/subscriptions/sub_1")) return Response.json(state.sub);
    if (url === "https://api.stripe.com/v1/billing_portal/sessions") return Response.json({ id: "bps_1", url: "https://billing.stripe.com/p/session/test_1" });
    throw new Error(`unexpected fetch ${url}`);
  });
}

describe("POST /payments/pass/stripe (web)", () => {
  it("refuses a device with no account (409 account_required) and never reaches Stripe", async () => {
    const res = await call<{ error: string; code: string }>("POST", "/payments/pass/stripe");
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: expect.stringMatching(/Sign in first/), code: ACCOUNT_REQUIRED_CODE });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(passes()).toEqual([]);
  });

  it("creates the account's Customer and an incomplete yearly subscription, and hands back its first payment", async () => {
    signedIn(PHONE);
    stripeAnswers({ sub: subscription() });
    const res = await call<HostPassIntent>("POST", "/payments/pass/stripe");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ clientSecret: "pi_sub_1_secret_abc", amountCents: 999, currency: "usd" });
    const [, init] = fetchMock.mock.calls.find(([u, i]) => String(u) === "https://api.stripe.com/v1/subscriptions" && (i as RequestInit).method === "POST")! as [string, RequestInit];
    const params = new URLSearchParams(init.body as string);
    expect(Object.fromEntries(params)).toMatchObject({
      customer: "cus_1",
      "items[0][price]": "price_pass",
      payment_behavior: "default_incomplete",
      "payment_settings[save_default_payment_method]": "on_subscription",
      "metadata[product]": "host_pass",
      "expand[0]": "latest_invoice.payment_intent",
    });
    expect((init.headers as Record<string, string>)["idempotency-key"]).toBe("hostpass-cus_1-price_pass-0");
    expect((init.headers as Record<string, string>)["stripe-version"]).toBe("2024-06-20");
    expect(passes()).toEqual([{ client_id: PHONE, provider: "stripe", external_id: "sub_1", status: "pending", current_period_end: PERIOD_END * 1000, auto_renew: 1 }]);
    expect(t.query(`SELECT client_id, livemode, customer_id FROM stripe_customers`)).toEqual([{ client_id: PHONE, livemode: 0, customer_id: "cus_1" }]);
    // Not active until Stripe says it's paid.
    expect((await call<HostPassState>("GET", "/payments/pass")).body.pass).toBeNull();
  });

  it("reuses the subscription waiting for its first payment on a retry", async () => {
    signedIn(PHONE);
    const state = { sub: subscription() };
    stripeAnswers(state);
    await call("POST", "/payments/pass/stripe");
    fetchMock.mockClear();
    const again = await call<HostPassIntent>("POST", "/payments/pass/stripe");
    expect(again.body.clientSecret).toBe("pi_sub_1_secret_abc");
    expect(fetchMock.mock.calls.map(([u, i]) => `${(i as RequestInit).method} ${String(u).split("?")[0]}`)).toEqual([
      "GET https://api.stripe.com/v1/subscriptions/sub_1",
    ]);
    expect(passes()).toHaveLength(1);
  });

  it("turns active only from Stripe's own data: confirm reads the subscription back", async () => {
    signedIn(PHONE, LAPTOP);
    const state = { sub: subscription() };
    stripeAnswers(state);
    await call("POST", "/payments/pass/stripe");
    // The browser says it paid, but Stripe doesn't yet: still not active.
    expect((await call<HostPassState>("POST", "/payments/pass/stripe/confirm")).body.pass).toBeNull();
    state.sub = subscription({ status: "active" });
    const confirmed = await call<HostPassState>("POST", "/payments/pass/stripe/confirm");
    expect(confirmed.body.pass).toEqual({ active: true, status: "active", provider: "stripe", renewsAt: PERIOD_END * 1000, endsAt: null, autoRenew: true });
    // The account's other device has it too.
    expect((await call<HostPassState>("GET", "/payments/pass", { client: LAPTOP, headers: { "x-signed-in": "1" } })).body.pass?.active).toBe(true);
    // And it won't sell a second one.
    const second = await call<HostPassState & { error: string }>("POST", "/payments/pass/stripe");
    expect(second.status).toBe(409);
    expect(second.body.pass?.active).toBe(true);
  });

  it("answers 503 while the Stripe price isn't set, and 502 when Stripe errors", async () => {
    signedIn(PHONE);
    env = { ...env, STRIPE_HOST_PASS_PRICE_ID: "" };
    expect((await call("POST", "/payments/pass/stripe")).status).toBe(503);
    env = { ...env, STRIPE_HOST_PASS_PRICE_ID: "price_pass" };
    vi.spyOn(console, "error").mockImplementation(() => {});
    fetchMock.mockResolvedValue(Response.json({ error: { message: "boom" } }, { status: 500 }));
    expect((await call("POST", "/payments/pass/stripe")).status).toBe(502);
  });
});

describe("POST /payments/pass/portal (Manage on the web)", () => {
  it("opens a Customer Portal session for the identity's Customer, returning to Profile", async () => {
    signedIn(PHONE);
    stripeAnswers({ sub: subscription() });
    expect((await call("POST", "/payments/pass/portal")).status).toBe(404);
    await call("POST", "/payments/pass/stripe");
    const res = await call<{ url: string }>("POST", "/payments/pass/portal");
    expect(res.body).toEqual({ url: "https://billing.stripe.com/p/session/test_1" });
    const [, init] = fetchMock.mock.calls.find(([u]) => String(u).endsWith("/billing_portal/sessions"))! as [string, RequestInit];
    expect(Object.fromEntries(new URLSearchParams(init.body as string))).toEqual({ customer: "cus_1", return_url: "https://jaxsquares.com/me" });
  });
});

describe("the Stripe webhook keeps a web pass current", () => {
  const nowSec = () => Math.floor(Date.now() / 1000);

  async function deliver(type: string, object: Record<string, unknown>, created = nowSec(), signature?: string) {
    const payload = JSON.stringify({ id: `evt_${Math.random()}`, object: "event", type, created, livemode: false, data: { object } });
    return call("POST", "/stripe/webhook", { client: null, raw: payload, headers: { "stripe-signature": signature ?? (await signStripePayload(payload, WEBHOOK_SECRET, nowSec())) } });
  }

  async function activePass(): Promise<{ sub: Record<string, unknown> }> {
    signedIn(PHONE);
    const state = { sub: subscription() };
    stripeAnswers(state);
    await call("POST", "/payments/pass/stripe");
    return state;
  }

  /** The event's Subscription, and what Stripe answers when it's read back. */
  function changeTo(state: { sub: Record<string, unknown> }, over: Record<string, unknown>) {
    state.sub = subscription(over);
    const sub: Record<string, unknown> = { ...state.sub };
    delete sub.latest_invoice;
    return sub;
  }

  it("customer.subscription.updated: active, then auto-renew off (ends at the period end)", async () => {
    const state = await activePass();
    expect((await deliver("customer.subscription.updated", changeTo(state, { status: "active" }))).status).toBe(200);
    expect((await call<HostPassState>("GET", "/payments/pass")).body.pass).toMatchObject({ active: true, autoRenew: true, renewsAt: PERIOD_END * 1000 });
    await deliver("customer.subscription.updated", changeTo(state, { status: "active", cancel_at_period_end: true }));
    expect((await call<HostPassState>("GET", "/payments/pass")).body.pass).toEqual({
      active: true,
      status: "active",
      provider: "stripe",
      renewsAt: null,
      endsAt: PERIOD_END * 1000,
      autoRenew: false,
    });
    // Every event is read back from Stripe: the subscription, never the event's copy of it, decides.
    const reads = fetchMock.mock.calls.filter(([u, i]) => String(u).startsWith("https://api.stripe.com/v1/subscriptions/sub_1") && (i as RequestInit).method === "GET");
    expect(reads).toHaveLength(2);
  });

  it("customer.subscription.deleted ends it; a late event still carrying 'active' can't bring it back", async () => {
    const state = await activePass();
    const active = changeTo(state, { status: "active" });
    await deliver("customer.subscription.updated", active);
    await deliver("customer.subscription.deleted", changeTo(state, { status: "canceled" }));
    expect((await call<HostPassState>("GET", "/payments/pass")).body.pass).toMatchObject({ active: false, status: "ended" });
    // Stripe doesn't promise an order: the earlier "active" update arrives after the deletion.
    await deliver("customer.subscription.updated", active, nowSec() - 30);
    expect((await call<HostPassState>("GET", "/payments/pass")).body.pass).toMatchObject({ active: false, status: "ended" });
  });

  it("a failed renewal (past_due) stops covering boards until it's paid", async () => {
    const state = await activePass();
    await deliver("customer.subscription.updated", changeTo(state, { status: "past_due" }));
    expect((await call<HostPassState>("GET", "/payments/pass")).body.pass).toMatchObject({ active: false, status: "past_due" });
  });

  it("invoice.paid reads the subscription back for its new period", async () => {
    const state = await activePass();
    const renewed = Math.floor((Date.now() + 2 * 365 * DAY) / 1000);
    state.sub = subscription({ status: "active", current_period_end: renewed });
    expect((await deliver("invoice.paid", { id: "in_2", object: "invoice", subscription: "sub_1", amount_due: 999, currency: "usd", livemode: false })).status).toBe(200);
    expect((await call<HostPassState>("GET", "/payments/pass")).body.pass).toMatchObject({ active: true, renewsAt: renewed * 1000 });
  });

  it("ignores subscriptions that aren't the Host Pass, and refuses a bad signature", async () => {
    const state = await activePass();
    fetchMock.mockClear();
    const sub = changeTo(state, { status: "canceled", metadata: {} });
    await deliver("customer.subscription.updated", sub);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(passes()[0].status).toBe("pending");
    const res = await deliver("customer.subscription.deleted", { ...sub, metadata: { product: "host_pass" } }, nowSec(), "t=1,v1=00");
    expect(res.status).toBe(400);
    expect(passes()[0].status).toBe("pending");
  });
});

// ---- App Store ----

const TX = "2000000900000001";
const ORIGINAL = "2000000900000000";
const EXPIRES = Date.now() + 365 * DAY;

const part = (v: unknown) => base64UrlEncode(JSON.stringify(v));
/** A compact JWS with Apple's header shape (the mocked check reads the payload). */
const jws = (payload: unknown) => `${part({ alg: "ES256", x5c: ["leaf", "intermediate", "root"] })}.${part(payload)}.${base64UrlEncode(new Uint8Array(64))}`;

function transaction(over: Record<string, unknown> = {}) {
  return {
    transactionId: TX,
    originalTransactionId: ORIGINAL,
    bundleId: BUNDLE,
    productId: PASS_PRODUCT,
    type: "Auto-Renewable Subscription",
    purchaseDate: Date.now(),
    expiresDate: EXPIRES,
    price: 9990,
    currency: "USD",
    environment: "Production",
    signedDate: Date.now(),
    ...over,
  };
}

/** The App Store Server API: the transaction lookup, then the subscription's status. */
function appleAnswers(state: { tx?: Record<string, unknown>; status?: number; autoRenew?: number } = {}) {
  fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.startsWith(`${APP_STORE_HOSTS.production}/inApps/v1/transactions/`)) return Response.json({ signedTransactionInfo: jws(transaction(state.tx)) });
    if (url === `${APP_STORE_HOSTS.production}/inApps/v1/subscriptions/${ORIGINAL}`) {
      return Response.json({
        environment: "Production",
        bundleId: BUNDLE,
        data: [
          {
            subscriptionGroupIdentifier: "21000000",
            lastTransactions: [
              {
                originalTransactionId: ORIGINAL,
                status: state.status ?? 1,
                signedTransactionInfo: jws(transaction(state.tx)),
                signedRenewalInfo: jws({ originalTransactionId: ORIGINAL, productId: PASS_PRODUCT, autoRenewStatus: state.autoRenew ?? 1 }),
              },
            ],
          },
        ],
      });
    }
    throw new Error(`unexpected fetch ${url}`);
  });
}

describe("POST /payments/pass/iap (iOS)", () => {
  it("verifies the purchase with Apple (transaction, then subscription status) and attaches it, no sign-in needed", async () => {
    appleAnswers();
    const res = await call<HostPassState>("POST", "/payments/pass/iap", { body: { transactionId: TX } });
    expect(res.status).toBe(200);
    expect(res.body.pass).toEqual({ active: true, status: "active", provider: "iap", renewsAt: EXPIRES, endsAt: null, autoRenew: true });
    expect(fetchMock.mock.calls.map(([u]) => String(u))).toEqual([
      `${APP_STORE_HOSTS.production}/inApps/v1/transactions/${TX}`,
      `${APP_STORE_HOSTS.production}/inApps/v1/subscriptions/${ORIGINAL}`,
    ]);
    expect(passes()).toEqual([{ client_id: PHONE, provider: "iap", external_id: ORIGINAL, status: "active", current_period_end: EXPIRES, auto_renew: 1 }]);
  });

  it("rejects the board product, another app, and a bad transaction id", async () => {
    appleAnswers({ tx: { productId: "com.jaxsquares.app.board" } });
    expect((await call("POST", "/payments/pass/iap", { body: { transactionId: TX } })).status).toBe(400);
    appleAnswers({ tx: { bundleId: "com.copycat.app" } });
    expect((await call("POST", "/payments/pass/iap", { body: { transactionId: TX } })).status).toBe(400);
    expect((await call("POST", "/payments/pass/iap", { body: { transactionId: "abc" } })).status).toBe(400);
    expect(passes()).toEqual([]);
  });

  it("records auto-renew off and a billing retry from the subscription status", async () => {
    appleAnswers({ autoRenew: 0 });
    expect((await call<HostPassState>("POST", "/payments/pass/iap", { body: { transactionId: TX } })).body.pass).toMatchObject({ active: true, autoRenew: false, endsAt: EXPIRES, renewsAt: null });
    appleAnswers({ status: 3 });
    expect((await call<HostPassState>("POST", "/payments/pass/iap", { body: { transactionId: TX } })).body.pass).toMatchObject({ active: false, status: "past_due" });
  });

  it("answers 502 when Apple can't be reached, and 503 without the App Store key", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    fetchMock.mockResolvedValue(new Response("", { status: 500 }));
    expect((await call("POST", "/payments/pass/iap", { body: { transactionId: TX } })).status).toBe(502);
    env = { ...env, APPLE_IAP_PRIVATE_KEY: "" };
    expect((await call("POST", "/payments/pass/iap", { body: { transactionId: TX } })).status).toBe(503);
  });
});

describe("POST /payments/pass/iap/restore", () => {
  it("attaches the restored subscription to the requesting identity", async () => {
    appleAnswers();
    const res = await call<HostPassState & { restored: number }>("POST", "/payments/pass/iap/restore", { client: ANA, body: { transactions: [{ transactionId: TX, jws: jws(transaction()) }] } });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ restored: 1, pass: { active: true, provider: "iap" } });
    expect(passes()[0].client_id).toBe(ANA);
  });

  it("moves a subscription another identity holds only with StoreKit's signed transaction for it", async () => {
    appleAnswers();
    await call("POST", "/payments/pass/iap", { body: { transactionId: TX } });
    // A transaction id alone isn't proof.
    const bare = await call<{ error: string }>("POST", "/payments/pass/iap/restore", { client: ANA, body: { transactions: [{ transactionId: TX }] } });
    expect(bare.status).toBe(409);
    expect(passes()[0].client_id).toBe(PHONE);
    // A signature that doesn't check out, or one for another subscription, isn't either.
    for (const proof of [jws({ ...transaction(), forged: true }), jws(transaction({ originalTransactionId: "999" }))]) {
      expect((await call("POST", "/payments/pass/iap/restore", { client: ANA, body: { transactions: [{ transactionId: TX, jws: proof }] } })).status).toBe(409);
    }
    expect(passes()[0].client_id).toBe(PHONE);
    // Apple's signed transaction from Ana's device: it's hers now.
    const proved = await call<HostPassState>("POST", "/payments/pass/iap/restore", { client: ANA, body: { transactions: [{ transactionId: TX, jws: jws(transaction()) }] } });
    expect(proved.status).toBe(200);
    expect(passes().map((p) => p.client_id)).toEqual([ANA]);
    expect((await call<HostPassState>("GET", "/payments/pass")).body.pass).toBeNull();
    expect(verifyAppleJws).toHaveBeenCalled();
  });

  it("needs a list of transactions", async () => {
    expect((await call("POST", "/payments/pass/iap/restore", { body: {} })).status).toBe(400);
    const none = await call<HostPassState & { restored: number }>("POST", "/payments/pass/iap/restore", { body: { transactions: [] } });
    expect(none.body).toMatchObject({ restored: 0, pass: null });
  });
});

describe("POST /payments/apple/notifications (App Store Server Notifications V2)", () => {
  async function attached() {
    appleAnswers();
    await call("POST", "/payments/pass/iap", { body: { transactionId: TX } });
    fetchMock.mockReset();
  }

  function notification(type: string, over: { status?: number; tx?: Record<string, unknown>; renewal?: Record<string, unknown>; signedDate?: number; subtype?: string } = {}) {
    return jws({
      notificationType: type,
      subtype: over.subtype,
      notificationUUID: crypto.randomUUID(),
      version: "2.0",
      signedDate: over.signedDate ?? Date.now() + 1000,
      data: {
        bundleId: BUNDLE,
        environment: "Production",
        status: over.status,
        signedTransactionInfo: jws(transaction(over.tx)),
        signedRenewalInfo: jws({ originalTransactionId: ORIGINAL, productId: PASS_PRODUCT, autoRenewStatus: 1, ...over.renewal }),
      },
    });
  }

  const notify = (signedPayload: string) => call<{ received: boolean; outcome: string }>("POST", "/payments/apple/notifications", { client: null, body: { signedPayload } });
  const pass = async () => (await call<HostPassState>("GET", "/payments/pass")).body.pass;

  it("verifies the signed payload and the transaction and renewal info inside it", async () => {
    await attached();
    const later = EXPIRES + 365 * DAY;
    const res = await notify(notification("DID_RENEW", { status: 1, tx: { transactionId: "2000000900000002", expiresDate: later } }));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true, outcome: "updated" });
    expect(verifyAppleJws).toHaveBeenCalledTimes(3);
    expect(await pass()).toMatchObject({ active: true, renewsAt: later });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("auto-renew off, then expired, then a refund", async () => {
    await attached();
    const t0 = Date.now();
    await notify(notification("DID_CHANGE_RENEWAL_STATUS", { status: 1, subtype: "AUTO_RENEW_DISABLED", renewal: { autoRenewStatus: 0 }, signedDate: t0 + 1000 }));
    expect(await pass()).toMatchObject({ active: true, autoRenew: false, endsAt: EXPIRES, renewsAt: null });
    await notify(notification("EXPIRED", { status: 2, tx: { expiresDate: t0 - 1000 }, renewal: { autoRenewStatus: 0 }, signedDate: t0 + 2000 }));
    expect(await pass()).toMatchObject({ active: false, status: "ended" });
    await notify(notification("REFUND", { status: 5, tx: { revocationDate: t0, revocationReason: 0 }, signedDate: t0 + 3000 }));
    expect(await pass()).toMatchObject({ active: false, status: "revoked" });
  });

  it("keeps an auto-renewing pass active through Apple's billing grace period", async () => {
    await attached();
    const graceEnd = Date.now() + 6 * DAY;
    await notify(notification("DID_FAIL_TO_RENEW", { status: 4, subtype: "GRACE_PERIOD", tx: { expiresDate: Date.now() - 1000 }, renewal: { gracePeriodExpiresDate: graceEnd } }));
    expect(await pass()).toMatchObject({ active: true, renewsAt: graceEnd });
  });

  it("a notification signed before the stored state is late and changes nothing", async () => {
    await attached();
    await notify(notification("EXPIRED", { status: 2, signedDate: Date.now() - 60_000 }));
    expect(await pass()).toMatchObject({ active: true });
  });

  it("ignores subscriptions nobody holds yet, other products and other apps", async () => {
    expect((await notify(notification("SUBSCRIBED", { status: 1 }))).body.outcome).toBe("ignored");
    await attached();
    expect((await notify(notification("REFUND", { status: 5, tx: { productId: "com.jaxsquares.app.board" } }))).body.outcome).toBe("ignored");
    const otherApp = jws({ notificationType: "EXPIRED", signedDate: Date.now() + 1000, data: { bundleId: "com.copycat.app", status: 2, signedTransactionInfo: jws(transaction()) } });
    expect((await notify(otherApp)).body.outcome).toBe("ignored");
    expect(await pass()).toMatchObject({ active: true });
  });

  it("refuses a payload whose signature doesn't check out (400) and changes nothing", async () => {
    await attached();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const forged = jws({ notificationType: "EXPIRED", forged: true, data: { bundleId: BUNDLE, status: 2, signedTransactionInfo: jws(transaction()) } });
    expect((await notify(forged)).status).toBe(400);
    expect((await call("POST", "/payments/apple/notifications", { client: null, body: {} })).status).toBe(400);
    expect(await pass()).toMatchObject({ active: true });
  });
});
