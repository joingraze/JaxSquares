// The Host Pass on the web: a yearly Stripe Billing subscription. The server
// creates (or reuses) the identity's Customer and an incomplete Subscription,
// the browser confirms its first invoice's PaymentIntent with Express Checkout
// or the card form, and the pass turns active only from Stripe's own data: a
// Subscription the server reads back from Stripe, or a signed webhook
// (invoice.paid, customer.subscription.updated / .deleted). The client is
// never trusted to say it paid.

import type { HostPassIntent } from "../../shared/types";
import type { Env } from "../env";
import { stripeHostPassPriceId } from "./config";
import { bestActive, stripePassStatus } from "./pass";
import * as store from "./store";
import {
  HOST_PASS_PRODUCT,
  StripeApiError,
  cancelSubscriptionAtPeriodEnd,
  cancelSubscriptionNow,
  createCustomer,
  createHostPassSubscription,
  createPortalSession,
  isLiveKey,
  retrieveSubscription,
  type PaymentIntent,
  type StripeEvent,
  type StripeInvoice,
  type StripeSubscription,
} from "./stripe";

/** First-payment states the browser can still complete. */
const PAYABLE: ReadonlySet<PaymentIntent["status"]> = new Set(["requires_payment_method", "requires_confirmation", "requires_action", "processing"]);

export function stripeSecret(env: Env): string | null {
  return env.STRIPE_SECRET_KEY?.trim() || null;
}

/** What a Subscription says about the pass, as of `eventAt`. */
export function stripePassState(sub: StripeSubscription, eventAt: number): store.PassState {
  const status = stripePassStatus(sub.status);
  return {
    status,
    currentPeriodEnd: Number.isFinite(sub.current_period_end) ? sub.current_period_end * 1000 : null,
    autoRenew: !sub.cancel_at_period_end && (status === "active" || status === "past_due" || status === "pending"),
    livemode: sub.livemode,
    eventAt,
  };
}

function invoiceOf(sub: StripeSubscription): StripeInvoice | null {
  return sub.latest_invoice && typeof sub.latest_invoice === "object" ? sub.latest_invoice : null;
}

function intentOf(sub: StripeSubscription): PaymentIntent | null {
  const pi = invoiceOf(sub)?.payment_intent;
  return pi && typeof pi === "object" ? pi : null;
}

async function retrieveOrNull(secretKey: string, id: string): Promise<StripeSubscription | null> {
  try {
    return await retrieveSubscription(secretKey, id);
  } catch (err) {
    // Gone from this Stripe account (e.g. keys switched from test to live).
    if (err instanceof StripeApiError && err.status === 404) return null;
    throw err;
  }
}

/** Reads a stored subscription back from Stripe and stores what it says now. */
export async function syncStripePass(env: Env, secretKey: string, row: store.PassRow, now = Date.now()): Promise<store.PassRow | null> {
  const sub = await retrieveOrNull(secretKey, row.externalId);
  if (!sub) {
    return store.updatePass(env.DB, row.externalId, { status: "ended", currentPeriodEnd: row.currentPeriodEnd, autoRenew: false, livemode: row.livemode, eventAt: now }, now);
  }
  return store.updatePass(env.DB, sub.id, stripePassState(sub, now), now);
}

export type StartOutcome =
  | { kind: "intent"; intent: HostPassIntent }
  /** Already covered (paid meanwhile, or another pass is active). */
  | { kind: "active" }
  | { kind: "unavailable" };

/**
 * The first payment of a new web pass for `clientId` (the account's canonical
 * clientId: the route checks the account link first). Reuses a subscription
 * still waiting for its first payment, so retries and reloads never start a
 * second one. Throws StripeApiError when Stripe refuses.
 */
export async function startStripePass(env: Env, clientId: string, now = Date.now()): Promise<StartOutcome> {
  const secretKey = stripeSecret(env);
  const priceId = stripeHostPassPriceId(env);
  if (!secretKey || !priceId) return { kind: "unavailable" };
  const rows = await store.passesOf(env.DB, [clientId]);
  if (bestActive(rows, now)) return { kind: "active" };

  const pending = rows.find((p) => p.provider === "stripe" && p.status === "pending");
  if (pending) {
    const sub = await retrieveOrNull(secretKey, pending.externalId);
    if (sub) {
      await store.updatePass(env.DB, sub.id, stripePassState(sub, now), now);
      if (stripePassStatus(sub.status) === "active") return { kind: "active" };
      const pi = intentOf(sub);
      if (sub.status === "incomplete" && pi && PAYABLE.has(pi.status) && pi.client_secret) {
        return { kind: "intent", intent: { clientSecret: pi.client_secret, amountCents: invoiceOf(sub)?.amount_due ?? pi.amount, currency: pi.currency } };
      }
    } else {
      await store.updatePass(env.DB, pending.externalId, { status: "ended", currentPeriodEnd: null, autoRenew: false, livemode: pending.livemode, eventAt: now }, now);
    }
  }

  const livemode = isLiveKey(secretKey);
  let customerId = await store.stripeCustomerOf(env.DB, clientId, livemode);
  if (!customerId) customerId = await store.saveStripeCustomer(env.DB, clientId, livemode, (await createCustomer(secretKey)).id, now);

  // One key per attempt: two taps at once get the same subscription; a later
  // purchase (after one ended) counts one more stripe pass and gets a new one.
  const attempt = rows.filter((p) => p.provider === "stripe").length;
  const passId = store.newPassId();
  const sub = await createHostPassSubscription(secretKey, {
    customerId,
    priceId,
    passId,
    idempotencyKey: `hostpass-${customerId}-${priceId}-${attempt}`,
  });
  await store.upsertPass(env.DB, { id: passId, clientId, provider: "stripe", externalId: sub.id, ...stripePassState(sub, now) }, { now });
  if (stripePassStatus(sub.status) === "active") return { kind: "active" };
  const pi = intentOf(sub);
  if (!pi?.client_secret) throw new StripeApiError("Subscription had no payment to confirm", 502);
  return { kind: "intent", intent: { clientSecret: pi.client_secret, amountCents: invoiceOf(sub)?.amount_due ?? pi.amount, currency: pi.currency } };
}

/** After the browser paid: read the identity's newest web pass back from Stripe (the webhook may not have landed yet). */
export async function confirmStripePass(env: Env, clientId: string, now = Date.now()): Promise<void> {
  const secretKey = stripeSecret(env);
  if (!secretKey) return;
  const rows = await store.passesOf(env.DB, [clientId]);
  const latest = rows.find((p) => p.provider === "stripe" && (p.status === "pending" || p.status === "active" || p.status === "past_due"));
  if (latest) await syncStripePass(env, secretKey, latest, now);
}

/** Manage: a Customer Portal session for the identity's Customer, or null when it has none here. */
export async function portalUrl(env: Env, clientId: string, returnUrl: string): Promise<string | null> {
  const secretKey = stripeSecret(env);
  if (!secretKey) return null;
  const customerId = await store.stripeCustomerOf(env.DB, clientId, isLiveKey(secretKey));
  if (!customerId) return null;
  return (await createPortalSession(secretKey, { customerId, returnUrl })).url;
}

/**
 * The account is being deleted: its web passes stop renewing (they run to the
 * end of what's paid, and nobody could manage them afterwards). One still
 * waiting for its first payment is canceled. Throws when Stripe can't be
 * reached, so the deletion can be retried rather than leave a renewal behind.
 */
export async function endWebPassRenewals(env: Env, clientId: string, now = Date.now()): Promise<void> {
  let rows: store.PassRow[];
  try {
    rows = await store.passesOf(env.DB, [clientId]);
  } catch (err) {
    if (store.isMissingTable(err)) return;
    throw err;
  }
  const renewing = rows.filter((p) => p.provider === "stripe" && p.autoRenew && (p.status === "active" || p.status === "past_due" || p.status === "pending"));
  if (renewing.length === 0) return;
  const secretKey = stripeSecret(env);
  if (!secretKey) throw new Error("STRIPE_SECRET_KEY isn't set; can't stop a web Host Pass from renewing");
  for (const p of renewing) {
    try {
      const sub = p.status === "pending" ? await cancelSubscriptionNow(secretKey, p.externalId) : await cancelSubscriptionAtPeriodEnd(secretKey, p.externalId);
      await store.updatePass(env.DB, sub.id, stripePassState(sub, now), now);
    } catch (err) {
      // Already gone at Stripe: nothing left to renew.
      if (err instanceof StripeApiError && err.status === 404) continue;
      throw err;
    }
  }
}

/**
 * The webhook's Host Pass events. Returns whether the event was one (handled
 * or deliberately ignored). Each one is a nudge: the Subscription is read back
 * from Stripe and stored as it is now, so events arriving late or out of order
 * (Stripe doesn't promise an order, and `created` only has whole seconds) can't
 * roll a pass back. Errors propagate, so Stripe retries.
 * - customer.subscription.created / .updated / .deleted: status, period end
 *   and auto-renew (cancel_at_period_end) changed;
 * - invoice.paid: the first payment or a renewal landed (a new period).
 * Only subscriptions this server created (metadata product=host_pass, and a
 * pass we hold) are read.
 */
export async function handleStripePassEvent(env: Env, event: StripeEvent<Record<string, unknown>>, now = Date.now()): Promise<boolean> {
  const object = event.data?.object as { object?: string } | undefined;
  let subId: string | null = null;
  if (object?.object === "subscription") {
    const sub = object as unknown as StripeSubscription;
    if (event.type.startsWith("customer.subscription.") && sub.metadata?.product === HOST_PASS_PRODUCT) subId = sub.id;
  } else if (object?.object === "invoice") {
    const invoice = object as unknown as StripeInvoice;
    if (event.type === "invoice.paid") subId = typeof invoice.subscription === "string" ? invoice.subscription : (invoice.subscription?.id ?? null);
  } else {
    return false;
  }
  if (!subId) return true;
  const row = await store.passByExternalId(env.DB, subId);
  const secretKey = stripeSecret(env);
  if (row && secretKey) await syncStripePass(env, secretKey, row, now);
  return true;
}
