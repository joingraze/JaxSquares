// Stripe setup for live payments (.github/workflows/stripe-setup.yml): run from
// GitHub with the account's keys in repository secrets, so a key is never
// typed into a chat or a terminal. Safe to run again: it finds what it made
// before and keeps it. It never prints a key or a signing secret.
//
// In the Stripe account the secret key belongs to, it makes or checks:
//   - the two yearly Prices, found by lookup key: the Annual Pass and the
//     Annual Pass + Venue, at the amounts in wrangler.jsonc (a changed amount
//     gets a new Price and the lookup key moves to it; subscriptions keep
//     renewing at the Price they started on);
//   - jaxsquares.com as a payment method domain (Apple Pay on the web);
//   - the webhook endpoint for /api/stripe/webhook with the events the Worker
//     handles, at the API version stripe.ts pins. A new endpoint's signing
//     secret goes to the file WEBHOOK_SECRET_OUT names, for the workflow to
//     store in Cloudflare;
//   - the Customer Portal settings Manage opens (update the card, receipts,
//     cancel at the end of the year).
// Then it prints the ids wrangler.jsonc needs (they're not secrets).

import { readFileSync, writeFileSync } from "node:fs";
import { formEncode, STRIPE_API_VERSION } from "../../worker/payments/stripe";

export type StripeCall = <T = Record<string, unknown>>(method: "GET" | "POST" | "DELETE", path: string, params?: Record<string, unknown>) => Promise<T>;

/** A Stripe error answer (no request data in it: never a key). */
export class StripeSetupError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "StripeSetupError";
  }
}

/** Every event the Worker acts on (worker/payments/routes.ts and passStripe.ts). */
export const WEBHOOK_EVENTS = [
  "payment_intent.succeeded",
  "payment_intent.canceled",
  "invoice.paid",
  "invoice.payment_failed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
] as const;

export interface PriceSpec {
  /** wrangler.jsonc's var for the Price id. */
  envVar: "STRIPE_HOST_PASS_PRICE_ID" | "STRIPE_CLUB_PASS_PRICE_ID";
  lookupKey: string;
  /** Our own Product id, so a rerun finds it. */
  productId: string;
  name: string;
  description: string;
  cents: number;
}

/** The two yearly Prices, at wrangler.jsonc's amounts. */
export function priceSpecs(hostCents: number, clubCents: number): PriceSpec[] {
  return [
    {
      envVar: "STRIPE_HOST_PASS_PRICE_ID",
      lookupKey: "jaxsquares_annual_pass_yearly",
      productId: "jaxsquares_annual_pass",
      name: "Annual Pass",
      description: "Every board you host for a year: draw the numbers with no host fee.",
      cents: hostCents,
    },
    {
      envVar: "STRIPE_CLUB_PASS_PRICE_ID",
      lookupKey: "jaxsquares_annual_pass_venue_yearly",
      productId: "jaxsquares_annual_pass_venue",
      name: "Annual Pass + Venue",
      description:
        "For bars and restaurants: every board you host for a year, venue boards included, with your venue's name and logo, 10 co-hosts, players lists and a TV link.",
      cents: clubCents,
    },
  ];
}

/** Live or test, from the keys' prefixes; the two keys must be the same mode. */
export function keyMode(secretKey: string, publishableKey: string): "live" | "test" {
  const secret = /^(sk|rk)_(live|test)_/.exec(secretKey)?.[2];
  const publishable = /^pk_(live|test)_/.exec(publishableKey)?.[1];
  if (!secret) throw new Error("STRIPE_SECRET_KEY isn't a Stripe secret key (sk_live_… or rk_live_…).");
  if (!publishable) throw new Error("STRIPE_PUBLISHABLE_KEY isn't a Stripe publishable key (pk_live_…).");
  if (secret !== publishable) throw new Error(`The secret key is a ${secret} key but the publishable key is a ${publishable} key: use the same mode for both.`);
  return secret as "live" | "test";
}

/** The Stripe API over fetch, at the version the Worker pins. */
export function stripeCaller(secretKey: string, fetchImpl: typeof fetch = fetch): StripeCall {
  return async <T,>(method: "GET" | "POST" | "DELETE", path: string, params?: Record<string, unknown>): Promise<T> => {
    const query = method === "GET" && params ? `?${formEncode(params)}` : "";
    const res = await fetchImpl(`https://api.stripe.com/v1${path}${query}`, {
      method,
      headers: {
        authorization: `Bearer ${secretKey}`,
        "stripe-version": STRIPE_API_VERSION,
        ...(method === "POST" ? { "content-type": "application/x-www-form-urlencoded" } : {}),
      },
      body: method === "POST" && params ? formEncode(params) : undefined,
    });
    const body = (await res.json().catch(() => ({}))) as { error?: { message?: string; code?: string } };
    if (!res.ok) throw new StripeSetupError(`Stripe ${method} ${path}: ${body.error?.message ?? res.status}`, res.status, body.error?.code);
    return body as T;
  };
}

interface Price {
  id: string;
  unit_amount: number | null;
  currency: string;
  recurring: { interval: string } | null;
}

/** A yearly Price at the spec's amount: the one holding its lookup key, or a new one that takes it over. */
export async function ensurePrice(call: StripeCall, spec: PriceSpec): Promise<{ id: string; action: "kept" | "created" | "replaced" }> {
  const found = (await call<{ data: Price[] }>("GET", "/prices", { lookup_keys: [spec.lookupKey], active: true, limit: 1 })).data[0];
  if (found && found.unit_amount === spec.cents && found.currency === "usd" && found.recurring?.interval === "year") return { id: found.id, action: "kept" };

  try {
    const product = await call<{ active: boolean }>("GET", `/products/${spec.productId}`);
    if (!product.active) await call("POST", `/products/${spec.productId}`, { active: true });
  } catch (err) {
    if (!(err instanceof StripeSetupError && err.status === 404)) throw err;
    await call("POST", "/products", { id: spec.productId, name: spec.name, description: spec.description, metadata: { app: "jaxsquares" } });
  }
  const price = await call<Price>("POST", "/prices", {
    product: spec.productId,
    unit_amount: spec.cents,
    currency: "usd",
    recurring: { interval: "year" },
    lookup_key: spec.lookupKey,
    transfer_lookup_key: found ? true : undefined,
    metadata: { app: "jaxsquares" },
  });
  return { id: price.id, action: found ? "replaced" : "created" };
}

interface MethodDomain {
  id: string;
  domain_name: string;
  apple_pay?: { status: string };
  google_pay?: { status: string };
}

/** The site's domain registered for wallets (Stripe registers it with Apple). */
export async function ensureDomain(call: StripeCall, domain: string): Promise<{ id: string; action: "kept" | "created"; applePay: string; googlePay: string }> {
  let found = (await call<{ data: MethodDomain[] }>("GET", "/payment_method_domains", { domain_name: domain })).data[0];
  const action = found ? "kept" : "created";
  if (!found) found = await call<MethodDomain>("POST", "/payment_method_domains", { domain_name: domain });
  if (found.apple_pay?.status !== "active") found = await call<MethodDomain>("POST", `/payment_method_domains/${found.id}/validate`);
  return { id: found.id, action, applePay: found.apple_pay?.status ?? "unknown", googlePay: found.google_pay?.status ?? "unknown" };
}

interface WebhookEndpoint {
  id: string;
  url: string;
  secret?: string;
}

/**
 * The webhook endpoint for the site. A new one comes with its signing secret.
 * An existing one keeps its secret, which Stripe never shows again: when
 * Cloudflare doesn't hold it (`secretStored` false) the endpoint is replaced,
 * so a fresh secret can be stored.
 */
export async function ensureWebhook(
  call: StripeCall,
  input: { url: string; secretStored: boolean },
): Promise<{ id: string; action: "updated" | "created" | "replaced"; secret: string | null }> {
  const endpoints = (await call<{ data: WebhookEndpoint[] }>("GET", "/webhook_endpoints", { limit: 100 })).data;
  const found = endpoints.find((e) => e.url === input.url);
  if (found && input.secretStored) {
    await call("POST", `/webhook_endpoints/${found.id}`, { enabled_events: [...WEBHOOK_EVENTS], disabled: false });
    return { id: found.id, action: "updated", secret: null };
  }
  if (found) await call("DELETE", `/webhook_endpoints/${found.id}`);
  const made = await call<WebhookEndpoint>("POST", "/webhook_endpoints", {
    url: input.url,
    enabled_events: [...WEBHOOK_EVENTS],
    api_version: STRIPE_API_VERSION,
    description: "JaxSquares: host fees and the Annual Pass",
  });
  if (!made.secret) throw new Error("Stripe didn't return the new webhook endpoint's signing secret.");
  return { id: made.id, action: found ? "replaced" : "created", secret: made.secret };
}

interface PortalConfiguration {
  id: string;
  active: boolean;
  metadata?: Record<string, string>;
}

/** The Customer Portal settings Manage opens: card, receipts, and cancel at the end of the year. */
export async function ensurePortal(call: StripeCall, site: string): Promise<{ id: string; action: "updated" | "created" }> {
  const params = {
    business_profile: { headline: "JaxSquares: manage your Annual Pass", privacy_policy_url: `${site}/privacy`, terms_of_service_url: `${site}/terms` },
    default_return_url: `${site}/me`,
    features: {
      customer_update: { enabled: false },
      invoice_history: { enabled: true },
      payment_method_update: { enabled: true },
      subscription_cancel: { enabled: true, mode: "at_period_end", proration_behavior: "none" },
      subscription_update: { enabled: false },
    },
    metadata: { app: "jaxsquares" },
  };
  const configs = (await call<{ data: PortalConfiguration[] }>("GET", "/billing_portal/configurations", { limit: 100 })).data;
  const found = configs.find((c) => c.active && c.metadata?.app === "jaxsquares");
  if (found) {
    await call("POST", `/billing_portal/configurations/${found.id}`, params);
    return { id: found.id, action: "updated" };
  }
  return { id: (await call<PortalConfiguration>("POST", "/billing_portal/configurations", params)).id, action: "created" };
}

/** Whether the account can take live payments yet (activation is done in the Dashboard). Null when the key can't read it. */
export async function accountStatus(call: StripeCall): Promise<{ charges: boolean; payouts: boolean; details: boolean } | null> {
  try {
    const a = await call<{ charges_enabled?: boolean; payouts_enabled?: boolean; details_submitted?: boolean }>("GET", "/account");
    return { charges: a.charges_enabled === true, payouts: a.payouts_enabled === true, details: a.details_submitted === true };
  } catch {
    return null;
  }
}

/** A var's value in wrangler.jsonc ("1999"), or null. */
export function wranglerVar(jsonc: string, name: string): string | null {
  return new RegExp(`"${name}"\\s*:\\s*"([^"]*)"`).exec(jsonc)?.[1] ?? null;
}

export interface SetupResult {
  mode: "live" | "test";
  prices: { envVar: string; id: string; action: string }[];
  portalId: string;
  webhookSecret: string | null;
}

export async function setup(
  call: StripeCall,
  input: { mode: "live" | "test"; site: string; hostCents: number; clubCents: number; webhookSecretStored: boolean },
  log: (line: string) => void = console.log,
): Promise<SetupResult> {
  log(`Stripe ${input.mode} mode`);
  const account = await accountStatus(call);
  if (account) {
    log(`Account: charges ${account.charges ? "enabled" : "NOT enabled"}, payouts ${account.payouts ? "enabled" : "NOT enabled"}, details ${account.details ? "submitted" : "NOT submitted"}`);
    if (input.mode === "live" && !account.charges) log("  Finish activating the account in the Stripe Dashboard (business details and bank account) before anyone can pay.");
  } else {
    log("Account: couldn't read it with this key");
  }

  const prices = [];
  for (const spec of priceSpecs(input.hostCents, input.clubCents)) {
    const p = await ensurePrice(call, spec);
    log(`Price ${spec.name} ($${(spec.cents / 100).toFixed(2)}/year): ${p.action} ${p.id}`);
    prices.push({ envVar: spec.envVar, id: p.id, action: p.action });
  }

  const domain = await ensureDomain(call, new URL(input.site).hostname);
  log(`Payment method domain ${new URL(input.site).hostname}: ${domain.action}; Apple Pay ${domain.applePay}, Google Pay ${domain.googlePay}`);

  const webhook = await ensureWebhook(call, { url: `${input.site}/api/stripe/webhook`, secretStored: input.webhookSecretStored });
  log(`Webhook endpoint: ${webhook.action} ${webhook.id} (${WEBHOOK_EVENTS.length} events)${webhook.secret ? "; new signing secret saved for Cloudflare" : ""}`);

  const portal = await ensurePortal(call, input.site);
  log(`Customer Portal settings: ${portal.action} ${portal.id}`);

  log("");
  log("wrangler.jsonc vars:");
  for (const p of prices) log(`  ${p.envVar}=${p.id}`);
  log(`  STRIPE_PORTAL_CONFIGURATION_ID=${portal.id}`);
  return { mode: input.mode, prices, portalId: portal.id, webhookSecret: webhook.secret };
}

async function main(): Promise<void> {
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim() ?? "";
  const publishableKey = process.env.STRIPE_PUBLISHABLE_KEY?.trim() ?? "";
  const mode = keyMode(secretKey, publishableKey);
  const jsonc = readFileSync("wrangler.jsonc", "utf8");
  const site = (process.env.SITE ?? wranglerVar(jsonc, "APP_ORIGIN") ?? "https://jaxsquares.com").replace(/\/+$/, "");
  const result = await setup(stripeCaller(secretKey), {
    mode,
    site,
    hostCents: Number(wranglerVar(jsonc, "HOST_PASS_PRICE_CENTS") ?? 1999),
    clubCents: Number(wranglerVar(jsonc, "CLUB_PASS_PRICE_CENTS") ?? 9999),
    webhookSecretStored: process.env.WEBHOOK_SECRET_STORED === "1",
  });
  const out = process.env.WEBHOOK_SECRET_OUT;
  if (result.webhookSecret && out) writeFileSync(out, result.webhookSecret, { mode: 0o600 });
}

if (process.env.STRIPE_SETUP_RUN === "1") {
  main().catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : "Stripe setup failed");
    process.exit(1);
  });
}
