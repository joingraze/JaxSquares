// The Host Pass (and the Club Pass, the same flow at its own Price) on the
// web: a yearly Stripe Billing subscription. The server
// creates (or reuses) the identity's Customer and an incomplete Subscription,
// the browser confirms its first invoice's PaymentIntent with Express Checkout
// or the card form, and the pass turns active only from Stripe's own data: a
// Subscription the server reads back from Stripe, or a signed webhook
// (invoice.paid / .payment_failed, customer.subscription.updated / .deleted). The client is
// never trusted to say it paid.

import type { HostPassIntent, PassPlan } from "../../shared/types";
import { forgetClubBrand } from "../clubs/brand";
import type { Env } from "../env";
import { stripeClubPassPriceId, stripeHostPassPriceId } from "./config";
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
  subscriptionOfInvoice,
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

/**
 * Which pass a Subscription is, from the Price it bills (re-read on every
 * webhook, so a plan change made in Stripe lands here): the Club Pass's Price
 * (STRIPE_CLUB_PASS_PRICE_ID) or the Host Pass's. A Price this deployment no
 * longer names (an older price kept by subscriptions made before a price
 * change) says nothing: the stored plan stays.
 */
export function planOfSubscription(env: Env, sub: StripeSubscription): PassPlan | undefined {
  const prices = (sub.items?.data ?? []).map((item) => item?.price?.id).filter((id): id is string => typeof id === "string");
  const club = stripeClubPassPriceId(env);
  const host = stripeHostPassPriceId(env);
  if (club && prices.includes(club)) return "club";
  if (host && prices.includes(host)) return "host";
  return undefined;
}

/** What a Subscription says about the pass, as of `eventAt` (with its plan, when its Price says: planOfSubscription). */
export function stripePassState(sub: StripeSubscription, eventAt: number, env?: Env): store.PassState {
  const status = stripePassStatus(sub.status);
  const plan = env ? planOfSubscription(env, sub) : undefined;
  return {
    ...(plan ? { plan } : {}),
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
  const next = sub
    ? await store.updatePass(env.DB, sub.id, stripePassState(sub, now, env), now)
    : await store.updatePass(env.DB, row.externalId, { status: "ended", currentPeriodEnd: row.currentPeriodEnd, autoRenew: false, livemode: row.livemode, eventAt: now }, now);
  // A Club Pass starting, ending or changing plan changes the holder's boards' branding.
  forgetClubBrand(env.DB, row.clientId);
  return next;
}

export type StartOutcome =
  | { kind: "intent"; intent: HostPassIntent }
  /** Already covered (paid meanwhile, or another pass is active). */
  | { kind: "active" }
  | { kind: "unavailable" };

/**
 * The first payment of a new web pass for `clientId` (the account's canonical
 * clientId: the route checks the account link first): the Host Pass, or with
 * `plan` "club" the Club Pass. Reuses a subscription of that plan still
 * waiting for its first payment, so retries and reloads never start a second
 * one. A Host Pass isn't sold to an identity a Club Pass already covers; a
 * Club Pass is sold to a Host Pass holder (it adds the club features). Throws
 * StripeApiError when Stripe refuses.
 */
export async function startStripePass(env: Env, clientId: string, now = Date.now(), plan: PassPlan = "host"): Promise<StartOutcome> {
  const secretKey = stripeSecret(env);
  const priceId = plan === "club" ? stripeClubPassPriceId(env) : stripeHostPassPriceId(env);
  if (!secretKey || !priceId) return { kind: "unavailable" };
  const all = await store.passesOf(env.DB, [clientId]);
  if (bestActive(plan === "club" ? all.filter((p) => p.plan === "club") : all, now)) return { kind: "active" };
  const rows = all.filter((p) => p.plan === plan);

  const pending = rows.find((p) => p.provider === "stripe" && p.status === "pending");
  if (pending) {
    const sub = await retrieveOrNull(secretKey, pending.externalId);
    if (sub) {
      await store.updatePass(env.DB, sub.id, stripePassState(sub, now, env), now);
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
    plan,
    idempotencyKey: `${plan === "club" ? "clubpass" : "hostpass"}-${customerId}-${priceId}-${attempt}`,
  });
  const state = stripePassState(sub, now, env);
  await store.upsertPass(env.DB, { id: passId, clientId, provider: "stripe", externalId: sub.id, ...state, plan: state.plan ?? plan }, { now });
  if (stripePassStatus(sub.status) === "active") return { kind: "active" };
  const pi = intentOf(sub);
  if (!pi?.client_secret) throw new StripeApiError("Subscription had no payment to confirm", 502);
  return { kind: "intent", intent: { clientSecret: pi.client_secret, amountCents: invoiceOf(sub)?.amount_due ?? pi.amount, currency: pi.currency } };
}

/** After the browser paid: read the identity's newest web pass of that plan back from Stripe (the webhook may not have landed yet). */
export async function confirmStripePass(env: Env, clientId: string, now = Date.now(), plan: PassPlan = "host"): Promise<void> {
  const secretKey = stripeSecret(env);
  if (!secretKey) return;
  const rows = await store.passesOf(env.DB, [clientId]);
  const latest = rows.find((p) => p.plan === plan && p.provider === "stripe" && (p.status === "pending" || p.status === "active" || p.status === "past_due"));
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
      await store.updatePass(env.DB, sub.id, stripePassState(sub, now, env), now);
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
 * - invoice.paid: the first payment or a renewal landed (a new period);
 * - invoice.payment_failed: a renewal didn't go through (past_due).
 * Invoices are read in either API shape (subscriptionOfInvoice), whatever
 * version the webhook endpoint was made with. Only subscriptions this server
 * created (metadata product=host_pass, and a pass we hold) are read.
 */
export async function handleStripePassEvent(env: Env, event: StripeEvent<Record<string, unknown>>, now = Date.now()): Promise<boolean> {
  const object = event.data?.object as { object?: string } | undefined;
  let subId: string | null = null;
  if (object?.object === "subscription") {
    const sub = object as unknown as StripeSubscription;
    if (event.type.startsWith("customer.subscription.") && sub.metadata?.product === HOST_PASS_PRODUCT) subId = sub.id;
  } else if (object?.object === "invoice") {
    const invoice = object as unknown as StripeInvoice;
    if (event.type === "invoice.paid" || event.type === "invoice.payment_failed") subId = subscriptionOfInvoice(invoice);
  } else {
    return false;
  }
  if (!subId) return true;
  const row = await store.passByExternalId(env.DB, subId);
  const secretKey = stripeSecret(env);
  if (row && secretKey) await syncStripePass(env, secretKey, row, now);
  return true;
}
