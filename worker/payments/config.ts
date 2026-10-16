// Which checkout the app runs and what a board costs. Live mode needs an explicit
// PAYMENTS_MODE=live AND every key for both rails (Stripe on the web, Apple IAP in
// the iOS app); anything less runs the clearly labeled no-charge test checkout.

import type { PaymentConfig } from "../../shared/types";
import type { Env } from "../env";

export const DEFAULT_PRICE_CENTS = 499;
export const DEFAULT_IAP_PRODUCT_ID = "com.jaxsquares.app.board";
export const CURRENCY = "usd";
/** Stripe's minimum charge for USD. */
const MIN_PRICE_CENTS = 50;

const LIVE_KEYS = [
  "STRIPE_SECRET_KEY",
  "STRIPE_PUBLISHABLE_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "APPLE_IAP_KEY_ID",
  "APPLE_IAP_ISSUER_ID",
  "APPLE_IAP_PRIVATE_KEY",
  "APPLE_BUNDLE_ID",
] as const satisfies readonly (keyof Env)[];

export function wantsLive(env: Env): boolean {
  return env.PAYMENTS_MODE?.trim().toLowerCase() === "live";
}

/** Secrets that still have to be set before live mode turns on. */
export function missingLiveKeys(env: Env): string[] {
  return LIVE_KEYS.filter((k) => !env[k]?.trim());
}

export function boardPriceCents(env: Env): number {
  const n = Number(env.BOARD_PRICE_CENTS);
  return Number.isInteger(n) && n >= MIN_PRICE_CENTS ? n : DEFAULT_PRICE_CENTS;
}

export function iapProductId(env: Env): string {
  return env.IAP_PRODUCT_ID?.trim() || DEFAULT_IAP_PRODUCT_ID;
}

let warnedMissing = false;

export function getPaymentConfig(env: Env): PaymentConfig {
  const missing = wantsLive(env) ? missingLiveKeys(env) : [];
  if (missing.length > 0 && !warnedMissing) {
    warnedMissing = true;
    console.error(`PAYMENTS_MODE=live but ${missing.join(", ")} not set; running the no-charge test checkout`);
  }
  const live = wantsLive(env) && missing.length === 0;
  return {
    mode: live ? "live" : "test",
    priceCents: boardPriceCents(env),
    currency: CURRENCY,
    stripePublishableKey: live ? env.STRIPE_PUBLISHABLE_KEY!.trim() : null,
    iapProductId: iapProductId(env),
  };
}
