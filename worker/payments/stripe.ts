// Stripe over plain fetch (no SDK in the Worker): PaymentIntents for board
// creation and webhook signature verification.
// Docs: https://docs.stripe.com/api/payment_intents
//       https://docs.stripe.com/webhooks#verify-manually

import { bytesToHex, hexToBytes, timingSafeEqual, utf8 } from "./encoding";

const STRIPE_API = "https://api.stripe.com/v1";
/** Pinned so a dashboard API upgrade can't change response shapes under us. */
export const STRIPE_API_VERSION = "2024-06-20";
export const WEBHOOK_TOLERANCE_SEC = 300;

/** The PaymentIntent fields we read. */
export interface PaymentIntent {
  id: string;
  object: "payment_intent";
  amount: number;
  amount_received: number;
  currency: string;
  status:
    | "requires_payment_method"
    | "requires_confirmation"
    | "requires_action"
    | "processing"
    | "requires_capture"
    | "canceled"
    | "succeeded";
  client_secret: string;
  livemode: boolean;
  metadata: Record<string, string>;
}

export interface StripeEvent<T = unknown> {
  id: string;
  type: string;
  livemode: boolean;
  data: { object: T };
}

/** Metadata tag on every intent we create, so the webhook ignores anything else on the account. */
export const BOARD_PRODUCT = "board";

export class StripeApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
    this.name = "StripeApiError";
  }
}

/** Stripe's form encoding, with nested objects as `a[b]=c`. */
export function formEncode(params: Record<string, unknown>, prefix = ""): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === "object") {
      const nested = formEncode(v as Record<string, unknown>, key);
      if (nested) parts.push(nested);
    } else {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
    }
  }
  return parts.join("&");
}

async function stripeFetch<T>(
  secretKey: string,
  method: "GET" | "POST",
  path: string,
  params?: Record<string, unknown>,
  idempotencyKey?: string,
): Promise<T> {
  const headers: Record<string, string> = {
    authorization: `Bearer ${secretKey}`,
    "stripe-version": STRIPE_API_VERSION,
  };
  if (idempotencyKey) headers["idempotency-key"] = idempotencyKey;
  let body: string | undefined;
  if (params) {
    headers["content-type"] = "application/x-www-form-urlencoded";
    body = formEncode(params);
  }
  const res = await fetch(`${STRIPE_API}${path}`, { method, headers, body });
  const data = (await res.json().catch(() => null)) as { error?: { message?: string; code?: string } } | null;
  if (!res.ok) {
    throw new StripeApiError(data?.error?.message ?? `Stripe request failed (${res.status})`, res.status, data?.error?.code);
  }
  return data as T;
}

export interface BoardIntentInput {
  gameId: string;
  amountCents: number;
  currency: string;
  /** Same key => Stripe returns the same intent instead of creating a second one. */
  idempotencyKey: string;
}

export function createBoardPaymentIntent(secretKey: string, input: BoardIntentInput): Promise<PaymentIntent> {
  return stripeFetch<PaymentIntent>(
    secretKey,
    "POST",
    "/payment_intents",
    {
      amount: input.amountCents,
      currency: input.currency,
      // Wallets and cards only: everything completes in the sheet, never via a redirect.
      automatic_payment_methods: { enabled: true, allow_redirects: "never" },
      description: "JaxSquares board",
      metadata: { game_id: input.gameId, product: BOARD_PRODUCT },
    },
    input.idempotencyKey,
  );
}

export function retrievePaymentIntent(secretKey: string, id: string): Promise<PaymentIntent> {
  return stripeFetch<PaymentIntent>(secretKey, "GET", `/payment_intents/${encodeURIComponent(id)}`);
}

/** Cancels an unpaid intent so it can't be paid any more. Stripe answers 400 once it's paid or being paid. */
export function cancelPaymentIntent(secretKey: string, id: string): Promise<PaymentIntent> {
  return stripeFetch<PaymentIntent>(secretKey, "POST", `/payment_intents/${encodeURIComponent(id)}/cancel`, {
    cancellation_reason: "abandoned",
  });
}

/**
 * Idempotency key per game and price. When a dead intent is replaced, the old id
 * is folded in so the replacement isn't answered with the cached dead one.
 */
export function boardIdempotencyKey(gameId: string, amountCents: number, currency: string, replacing?: string | null): string {
  const base = `board-${gameId}-${amountCents}${currency}`;
  return replacing ? `${base}-after-${replacing}` : base;
}

export type SignatureCheck = "ok" | "missing" | "malformed" | "stale" | "mismatch";

/**
 * Verifies a `Stripe-Signature` header (`t=...,v1=...[,v1=...]`): HMAC-SHA256 of
 * `${t}.${payload}` with the endpoint secret, any v1 may match (secret rolls),
 * and t must be within the tolerance to block replays.
 */
export async function verifyStripeSignature(
  payload: string,
  header: string | null | undefined,
  secret: string,
  nowSec = Math.floor(Date.now() / 1000),
  toleranceSec = WEBHOOK_TOLERANCE_SEC,
): Promise<SignatureCheck> {
  if (!header || !secret) return "missing";
  let timestamp: number | null = null;
  const signatures: Uint8Array[] = [];
  for (const part of header.split(",")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key === "t" && /^\d+$/.test(value)) timestamp = Number(value);
    else if (key === "v1") {
      const bytes = hexToBytes(value);
      if (bytes) signatures.push(bytes);
    }
  }
  if (timestamp === null || signatures.length === 0) return "malformed";
  if (Math.abs(nowSec - timestamp) > toleranceSec) return "stale";

  const expected = await hmacSha256(secret, `${timestamp}.${payload}`);
  let matched = false;
  for (const sig of signatures) matched = timingSafeEqual(expected, sig) || matched;
  return matched ? "ok" : "mismatch";
}

export async function hmacSha256(secret: string, message: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", utf8(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, utf8(message)));
}

/** Builds a valid `Stripe-Signature` header; used by tests and handy for local webhook replays. */
export async function signStripePayload(payload: string, secret: string, timestampSec: number): Promise<string> {
  return `t=${timestampSec},v1=${bytesToHex(await hmacSha256(secret, `${timestampSec}.${payload}`))}`;
}
