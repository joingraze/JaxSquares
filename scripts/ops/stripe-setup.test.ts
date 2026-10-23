// @vitest-environment node
// The Stripe setup script against a fake Stripe that keeps what it's asked to
// make: a first run makes everything, a second run keeps it, a price change
// moves the lookup key to a new Price, and a webhook endpoint whose secret
// Cloudflare doesn't hold is replaced so a fresh one can be stored.

import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { STRIPE_API_VERSION } from "../../worker/payments/stripe";
import { keyMode, setup, setWranglerVar, StripeSetupError, stripeCaller, WEBHOOK_EVENTS, wranglerVar, type StripeCall } from "./stripe-setup";

type Obj = Record<string, unknown> & { id: string };

/** Just enough of Stripe for the script: products, prices, wallet domains, webhook endpoints, portal settings, the account. */
function fakeStripe(account: Record<string, unknown> = { charges_enabled: true, payouts_enabled: true, details_submitted: true }) {
  let n = 0;
  const next = (prefix: string) => `${prefix}_${++n}`;
  const products = new Map<string, Obj>();
  const prices: Obj[] = [];
  const domains: Obj[] = [];
  const webhooks: Obj[] = [];
  const portals: Obj[] = [];
  const calls: string[] = [];
  const missing = () => new StripeSetupError("No such object", 404, "resource_missing");

  const call: StripeCall = async <T,>(method: "GET" | "POST" | "DELETE", path: string, params: Record<string, unknown> = {}) => {
    calls.push(`${method} ${path}`);
    const out = (v: unknown) => v as T;
    let m: RegExpExecArray | null;
    if (method === "GET" && path === "/account") return out(account);
    if (method === "GET" && path === "/prices") {
      const keys = params.lookup_keys as string[];
      return out({ data: prices.filter((p) => p.active && keys.includes(p.lookup_key as string)) });
    }
    if (method === "POST" && path === "/prices") {
      const holder = prices.find((p) => p.lookup_key === params.lookup_key);
      if (holder && !params.transfer_lookup_key) throw new StripeSetupError("lookup_key already in use", 400);
      if (holder) holder.lookup_key = null;
      const price = { id: next("price"), active: true, product: params.product, unit_amount: params.unit_amount, currency: params.currency, recurring: params.recurring, lookup_key: params.lookup_key };
      prices.push(price);
      return out(price);
    }
    if ((m = /^\/products\/(\w+)$/.exec(path)) && method === "GET") {
      const p = products.get(m[1]);
      if (!p) throw missing();
      return out(p);
    }
    if (method === "POST" && path === "/products") {
      const p = { ...params, id: params.id as string, active: true };
      products.set(p.id, p);
      return out(p);
    }
    if (method === "GET" && path === "/payment_method_domains") return out({ data: domains.filter((d) => d.domain_name === params.domain_name) });
    if (method === "POST" && path === "/payment_method_domains") {
      const d = { id: next("pmd"), domain_name: params.domain_name, apple_pay: { status: "inactive" }, google_pay: { status: "active" } };
      domains.push(d);
      return out(d);
    }
    if ((m = /^\/payment_method_domains\/(\w+)\/validate$/.exec(path))) {
      const d = domains.find((x) => x.id === m![1])!;
      d.apple_pay = { status: "active" };
      return out(d);
    }
    if (method === "GET" && path === "/webhook_endpoints") return out({ data: webhooks });
    if (method === "POST" && path === "/webhook_endpoints") {
      const w = { id: next("we"), url: params.url, enabled_events: params.enabled_events, api_version: params.api_version, secret: `whsec_${n}` };
      webhooks.push(w);
      return out(w);
    }
    if ((m = /^\/webhook_endpoints\/(\w+)$/.exec(path))) {
      const i = webhooks.findIndex((w) => w.id === m![1]);
      if (method === "DELETE") return out(webhooks.splice(i, 1)[0]);
      Object.assign(webhooks[i], params);
      // Stripe shows the signing secret only when the endpoint is made.
      return out({ ...webhooks[i], secret: undefined });
    }
    if (method === "GET" && path === "/billing_portal/configurations") return out({ data: portals });
    if (method === "POST" && path === "/billing_portal/configurations") {
      const c = { ...params, id: next("bpc"), active: true };
      portals.push(c);
      return out(c);
    }
    if ((m = /^\/billing_portal\/configurations\/(\w+)$/.exec(path))) {
      const c = portals.find((x) => x.id === m![1])!;
      Object.assign(c, params);
      return out(c);
    }
    throw new Error(`fake Stripe: ${method} ${path}`);
  };
  return { call, products, prices, domains, webhooks, portals, calls };
}

const INPUT = { mode: "live" as const, site: "https://jaxsquares.com", hostCents: 1999, clubCents: 9999, webhookSecretStored: false };

describe("Stripe setup", () => {
  it("makes the two yearly Prices, the wallet domain, the webhook and the portal settings, then prints the ids", async () => {
    const stripe = fakeStripe();
    const lines: string[] = [];
    const result = await setup(stripe.call, INPUT, (l) => lines.push(l));

    expect([...stripe.products.keys()]).toEqual(["jaxsquares_annual_pass", "jaxsquares_annual_pass_venue"]);
    expect(stripe.prices.map((p) => [p.product, p.unit_amount, p.currency, (p.recurring as { interval: string }).interval, p.lookup_key])).toEqual([
      ["jaxsquares_annual_pass", 1999, "usd", "year", "jaxsquares_annual_pass_yearly"],
      ["jaxsquares_annual_pass_venue", 9999, "usd", "year", "jaxsquares_annual_pass_venue_yearly"],
    ]);
    expect(stripe.domains.map((d) => [d.domain_name, (d.apple_pay as { status: string }).status])).toEqual([["jaxsquares.com", "active"]]);
    expect(stripe.webhooks).toHaveLength(1);
    expect(stripe.webhooks[0]).toMatchObject({ url: "https://jaxsquares.com/api/stripe/webhook", api_version: STRIPE_API_VERSION, enabled_events: [...WEBHOOK_EVENTS] });
    expect(stripe.portals[0]).toMatchObject({
      default_return_url: "https://jaxsquares.com/me",
      business_profile: { privacy_policy_url: "https://jaxsquares.com/privacy", terms_of_service_url: "https://jaxsquares.com/terms" },
      features: { subscription_cancel: { enabled: true, mode: "at_period_end" }, payment_method_update: { enabled: true }, invoice_history: { enabled: true } },
      metadata: { app: "jaxsquares" },
    });

    expect(result.webhookSecret).toBe(stripe.webhooks[0].secret);
    expect(result.prices.map((p) => [p.envVar, p.id])).toEqual([
      ["STRIPE_HOST_PASS_PRICE_ID", stripe.prices[0].id],
      ["STRIPE_CLUB_PASS_PRICE_ID", stripe.prices[1].id],
    ]);
    expect(lines).toContain(`  STRIPE_HOST_PASS_PRICE_ID=${stripe.prices[0].id}`);
    expect(lines).toContain(`  STRIPE_PORTAL_CONFIGURATION_ID=${result.portalId}`);
    // Never a key or a signing secret in what it prints.
    expect(lines.join("\n")).not.toMatch(/whsec_|sk_live|rk_live/);
  });

  it("keeps everything on a second run, with the webhook secret already in Cloudflare", async () => {
    const stripe = fakeStripe();
    const first = await setup(stripe.call, INPUT, () => {});
    const again = await setup(stripe.call, { ...INPUT, webhookSecretStored: true }, () => {});
    expect(stripe.prices).toHaveLength(2);
    expect(stripe.products.size).toBe(2);
    expect(stripe.domains).toHaveLength(1);
    expect(stripe.webhooks.map((w) => w.id)).toEqual([stripe.webhooks[0].id]);
    expect(stripe.portals).toHaveLength(1);
    expect(again.prices.map((p) => [p.id, p.action])).toEqual(first.prices.map((p) => [p.id, "kept"]));
    expect(again.portalId).toBe(first.portalId);
    expect(again.webhookSecret).toBeNull();
  });

  it("replaces a webhook endpoint whose secret Cloudflare doesn't hold, so a fresh one can be stored", async () => {
    const stripe = fakeStripe();
    const first = await setup(stripe.call, INPUT, () => {});
    const again = await setup(stripe.call, INPUT, () => {});
    expect(stripe.webhooks).toHaveLength(1);
    expect(again.webhookSecret).not.toBe(first.webhookSecret);
    expect(again.webhookSecret).toBe(stripe.webhooks[0].secret);
  });

  it("moves the lookup key to a new Price when the amount changes (subscriptions keep theirs)", async () => {
    const stripe = fakeStripe();
    const first = await setup(stripe.call, INPUT, () => {});
    const again = await setup(stripe.call, { ...INPUT, hostCents: 2499, webhookSecretStored: true }, () => {});
    expect(again.prices[0].action).toBe("replaced");
    expect(again.prices[0].id).not.toBe(first.prices[0].id);
    expect(stripe.prices.find((p) => p.id === first.prices[0].id)).toMatchObject({ active: true, lookup_key: null, unit_amount: 1999 });
    expect(stripe.prices.find((p) => p.id === again.prices[0].id)).toMatchObject({ unit_amount: 2499, lookup_key: "jaxsquares_annual_pass_yearly" });
    expect(again.prices[1].action).toBe("kept");
  });

  it("says when the account can't take live payments yet, and still sets up", async () => {
    const stripe = fakeStripe({ charges_enabled: false, payouts_enabled: false, details_submitted: false });
    const lines: string[] = [];
    await setup(stripe.call, INPUT, (l) => lines.push(l));
    expect(lines.join("\n")).toMatch(/Finish activating the account/);
    expect(stripe.prices).toHaveLength(2);
  });
});

describe("the keys", () => {
  it("must be one mode", () => {
    expect(keyMode("sk_live_abc", "pk_live_abc")).toBe("live");
    expect(keyMode("rk_live_abc", "pk_live_abc")).toBe("live");
    expect(keyMode("sk_test_abc", "pk_test_abc")).toBe("test");
    expect(() => keyMode("sk_live_abc", "pk_test_abc")).toThrow(/same mode/);
    expect(() => keyMode("pk_live_abc", "pk_live_abc")).toThrow(/secret key/);
    expect(() => keyMode("sk_live_abc", "")).toThrow(/publishable key/);
  });
});

describe("the Stripe caller", () => {
  it("sends the key, the pinned API version and form-encoded params, and reports Stripe's error without the key", async () => {
    const fetchMock = vi.fn(async () => Response.json({ data: [] }));
    const call = stripeCaller("sk_live_secret", fetchMock as unknown as typeof fetch);
    await call("GET", "/prices", { lookup_keys: ["a"], active: true });
    await call("POST", "/webhook_endpoints", { url: "https://x", enabled_events: ["invoice.paid", "invoice.payment_failed"] });
    const [getUrl, getInit] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(getUrl).toBe("https://api.stripe.com/v1/prices?lookup_keys%5B0%5D=a&active=true");
    expect(getInit.headers).toMatchObject({ authorization: "Bearer sk_live_secret", "stripe-version": STRIPE_API_VERSION });
    const [, postInit] = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
    expect(decodeURIComponent(postInit.body as string)).toBe("url=https://x&enabled_events[0]=invoice.paid&enabled_events[1]=invoice.payment_failed");

    fetchMock.mockResolvedValueOnce(Response.json({ error: { message: "Invalid API Key provided", code: "api_key_invalid" } }, { status: 401 }));
    const err = await call("GET", "/account").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(StripeSetupError);
    expect((err as StripeSetupError).message).toBe("Stripe GET /account: Invalid API Key provided");
    expect((err as StripeSetupError).message).not.toMatch(/sk_live/);
  });
});

describe("wrangler.jsonc", () => {
  it("has the amounts and the site the setup reads", () => {
    const jsonc = readFileSync("wrangler.jsonc", "utf8");
    expect(wranglerVar(jsonc, "HOST_PASS_PRICE_CENTS")).toBe("1999");
    expect(wranglerVar(jsonc, "CLUB_PASS_PRICE_CENTS")).toBe("9999");
    expect(wranglerVar(jsonc, "APP_ORIGIN")).toBe("https://jaxsquares.com");
  });

  it("takes the ids the setup made, keeping everything else as it was", () => {
    const jsonc = readFileSync("wrangler.jsonc", "utf8");
    let next = setWranglerVar(jsonc, "STRIPE_HOST_PASS_PRICE_ID", "price_live_host");
    next = setWranglerVar(next, "STRIPE_CLUB_PASS_PRICE_ID", "price_live_club");
    next = setWranglerVar(next, "STRIPE_PORTAL_CONFIGURATION_ID", "bpc_live");
    expect(wranglerVar(next, "STRIPE_HOST_PASS_PRICE_ID")).toBe("price_live_host");
    expect(wranglerVar(next, "STRIPE_CLUB_PASS_PRICE_ID")).toBe("price_live_club");
    expect(wranglerVar(next, "STRIPE_PORTAL_CONFIGURATION_ID")).toBe("bpc_live");
    // Only those three lines change.
    const changed = next.split("\n").filter((line, i) => line !== jsonc.split("\n")[i]);
    expect(changed).toHaveLength(3);
    expect(() => setWranglerVar(jsonc, "NOT_A_VAR", "x")).toThrow(/no NOT_A_VAR/);
  });
});
