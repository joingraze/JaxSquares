// Board checkout endpoints (mounted under /api by worker/index.ts). Three rails,
// one outcome: activateGame() flips the board from draft to open.
//   test   – no-charge checkout while PAYMENTS_MODE isn't live
//   stripe – Apple Pay / Google Pay / card on the web, confirmed by webhook
//   iap    – Apple In-App Purchase in the iOS app (App Store guideline 3.1.1)

import { Hono, type Context } from "hono";
import type { Game } from "../../shared/types";
import { getGame } from "../db";
import type { Env } from "../env";
import { activateGame, isHost, loadState } from "../service";
import { fetchAppStoreTransaction, transactionProblem, type AppStoreCredentials, type AppStoreTransaction } from "./apple";
import { CURRENCY, boardPriceCents, getPaymentConfig, iapProductId } from "./config";
import { milliunitsToMinor } from "./encoding";
import * as store from "./store";
import {
  BOARD_PRODUCT,
  StripeApiError,
  boardIdempotencyKey,
  createBoardPaymentIntent,
  retrievePaymentIntent,
  verifyStripeSignature,
  type PaymentIntent,
  type StripeEvent,
} from "./stripe";

type Ctx = Context<{ Bindings: Env }>;

export const paymentsRoutes = new Hono<{ Bindings: Env }>();

/** The board when the caller is its host, otherwise the error response to send. */
async function hostedGame(c: Ctx, gameId: string): Promise<Game | Response> {
  if (!c.req.header("x-client-id")) return c.json({ error: "Missing x-client-id" }, 400);
  const game = await getGame(c.env.DB, gameId);
  if (!game) return c.json({ error: "Game not found" }, 404);
  if (!(await isHost(c.env, gameId, c.req.header("x-admin-token") ?? ""))) {
    return c.json({ error: "Only the host can do that" }, 403);
  }
  return game;
}

function activatePurchase(env: Env, purchase: store.Purchase) {
  return activateGame(env, purchase.gameId, {
    provider: purchase.provider,
    reference: purchase.reference,
    amountCents: purchase.amountCents,
  });
}

async function activate(c: Ctx, purchase: store.Purchase): Promise<Response> {
  const state = await activatePurchase(c.env, purchase);
  return state ? c.json({ state }) : c.json({ error: "Game not found" }, 404);
}

async function alreadyActive(c: Ctx, gameId: string): Promise<Response> {
  return c.json({ error: "This board is already active", state: await loadState(c.env, gameId) }, 409);
}

// ---- Test checkout ----

paymentsRoutes.post("/games/:id/pay/test", async (c) => {
  if (getPaymentConfig(c.env).mode !== "test") return c.json({ error: "Test checkout is off" }, 403);
  const gameId = c.req.param("id");
  const game = await hostedGame(c, gameId);
  if (game instanceof Response) return game;
  if (game.status !== "draft") return c.json({ state: await loadState(c.env, gameId) });

  const purchase = await store.recordPaid(c.env.DB, {
    reference: `test:${gameId}`,
    gameId,
    provider: "test",
    amountCents: 0,
    currency: CURRENCY,
    livemode: false,
  });
  return activate(c, purchase);
});

// ---- Stripe (web: Apple Pay / Google Pay, card fallback) ----

/** Intent states the browser can still complete; anything else gets a fresh intent. */
const REUSABLE: ReadonlySet<PaymentIntent["status"]> = new Set([
  "requires_payment_method",
  "requires_confirmation",
  "requires_action",
  "processing",
]);

function recordStripePaid(db: D1Database, gameId: string, intent: PaymentIntent): Promise<store.Purchase> {
  return store.recordPaid(db, {
    reference: intent.id,
    gameId,
    provider: "stripe",
    amountCents: intent.amount_received || intent.amount,
    currency: intent.currency,
    livemode: intent.livemode,
  });
}

async function retrieveOrNull(secretKey: string, id: string): Promise<PaymentIntent | null> {
  try {
    return await retrievePaymentIntent(secretKey, id);
  } catch (err) {
    // The intent is gone from this Stripe account (e.g. keys switched from test to live).
    if (err instanceof StripeApiError && err.status === 404) return null;
    throw err;
  }
}

paymentsRoutes.post("/games/:id/pay/stripe", async (c) => {
  const gameId = c.req.param("id");
  const game = await hostedGame(c, gameId);
  if (game instanceof Response) return game;
  const secretKey = c.env.STRIPE_SECRET_KEY?.trim();
  if (!secretKey) return c.json({ error: "Checkout isn't set up yet" }, 503);
  if (game.status !== "draft") return alreadyActive(c, gameId);

  const amountCents = boardPriceCents(c.env);
  try {
    // Reuse the board's open intent so retries and reloads never create a second charge.
    const pending = await store.latestPending(c.env.DB, gameId, "stripe");
    let replacing: string | null = null;
    let intent: PaymentIntent | null = null;
    if (pending) {
      intent = await retrieveOrNull(secretKey, pending.reference);
      const reusable =
        intent?.status === "succeeded" ||
        (intent && REUSABLE.has(intent.status) && intent.amount === amountCents && intent.currency === CURRENCY);
      if (!reusable) {
        await store.markCanceled(c.env.DB, pending.reference);
        replacing = pending.reference;
        intent = null;
      }
    }
    if (!intent) {
      intent = await createBoardPaymentIntent(secretKey, {
        gameId,
        amountCents,
        currency: CURRENCY,
        idempotencyKey: boardIdempotencyKey(gameId, amountCents, CURRENCY, replacing),
      });
      await store.recordPending(c.env.DB, {
        reference: intent.id,
        gameId,
        provider: "stripe",
        amountCents,
        currency: CURRENCY,
        livemode: intent.livemode,
      });
    }
    // Paid but the webhook hasn't landed yet: activate now instead of making the host wait.
    if (intent.status === "succeeded") {
      const state = await activatePurchase(c.env, await recordStripePaid(c.env.DB, gameId, intent));
      return c.json({ error: "This board is already active", state }, 409);
    }
    return c.json({ clientSecret: intent.client_secret });
  } catch (err) {
    if (!(err instanceof StripeApiError)) throw err;
    console.error(`stripe intent for ${gameId} failed: ${err.status} ${err.code ?? ""} ${err.message}`);
    return c.json({ error: "Couldn't start checkout. Try again." }, 502);
  }
});

paymentsRoutes.post("/stripe/webhook", async (c) => {
  const secret = c.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret) return c.json({ error: "Webhook isn't configured" }, 503);
  const payload = await c.req.text();
  const check = await verifyStripeSignature(payload, c.req.header("stripe-signature"), secret);
  if (check !== "ok") return c.json({ error: `Signature check failed: ${check}` }, 400);

  let event: StripeEvent<Partial<PaymentIntent>>;
  try {
    event = JSON.parse(payload);
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }
  const intent = event.data?.object;
  const gameId = intent?.object === "payment_intent" && intent.metadata?.product === BOARD_PRODUCT ? intent.metadata.game_id : null;
  if (!intent || !gameId) return c.json({ received: true });

  if (event.type === "payment_intent.succeeded") {
    const purchase = await recordStripePaid(c.env.DB, gameId, intent as PaymentIntent);
    // Errors propagate as a 500 so Stripe retries; activation is idempotent.
    if (purchase.gameId === gameId) await activatePurchase(c.env, purchase);
  } else if (event.type === "payment_intent.canceled" && intent.id) {
    await store.markCanceled(c.env.DB, intent.id);
  }
  return c.json({ received: true });
});

// ---- Apple In-App Purchase (iOS app) ----

function appStoreCredentials(env: Env): AppStoreCredentials | null {
  const keyId = env.APPLE_IAP_KEY_ID?.trim();
  const issuerId = env.APPLE_IAP_ISSUER_ID?.trim();
  const privateKeyPem = env.APPLE_IAP_PRIVATE_KEY?.trim();
  const bundleId = env.APPLE_BUNDLE_ID?.trim();
  return keyId && issuerId && privateKeyPem && bundleId ? { keyId, issuerId, privateKeyPem, bundleId } : null;
}

const usedElsewhere = (c: Ctx) => c.json({ error: "That purchase already opened another board" }, 409);

paymentsRoutes.post("/games/:id/pay/iap", async (c) => {
  const gameId = c.req.param("id");
  const game = await hostedGame(c, gameId);
  if (game instanceof Response) return game;
  const creds = appStoreCredentials(c.env);
  if (!creds) return c.json({ error: "In-app purchase isn't set up yet" }, 503);

  const body = (await c.req.json().catch(() => null)) as { transactionId?: unknown } | null;
  const transactionId = String(body?.transactionId ?? "").trim();
  if (!/^\d{1,32}$/.test(transactionId)) return c.json({ error: "Missing or invalid transactionId" }, 400);

  // A retry after a dropped response: already verified, skip Apple.
  const known = await store.getPurchase(c.env.DB, transactionId);
  if (known && known.gameId !== gameId) return usedElsewhere(c);
  if (known?.status === "paid") return activate(c, known);

  let tx: AppStoreTransaction | null;
  try {
    tx = await fetchAppStoreTransaction(creds, transactionId);
  } catch (err) {
    console.error(`App Store lookup for ${transactionId} failed`, err);
    return c.json({ error: "Couldn't reach the App Store. Try again." }, 502);
  }
  if (!tx) return c.json({ error: "Apple has no record of that purchase" }, 400);
  const problem = transactionProblem(tx, { transactionId, bundleId: creds.bundleId, productId: iapProductId(c.env), gameId });
  if (problem) return c.json({ error: problem }, 400);

  const currency = (tx.currency ?? CURRENCY).toLowerCase();
  const purchase = await store.recordPaid(c.env.DB, {
    reference: transactionId,
    gameId,
    provider: "iap",
    // Apple leaves price off some older transactions; fall back to the list price.
    amountCents: typeof tx.price === "number" ? milliunitsToMinor(tx.price, currency) : boardPriceCents(c.env),
    currency,
    livemode: tx.environment === "Production",
  });
  if (purchase.gameId !== gameId) return usedElsewhere(c);
  return activate(c, purchase);
});
