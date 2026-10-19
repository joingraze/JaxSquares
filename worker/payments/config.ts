// Which checkout the app runs and what a board (or the yearly Host Pass) costs.
// Live mode needs an explicit PAYMENTS_MODE=live AND every key for both rails
// (Stripe on the web, Apple IAP in the iOS app); anything less runs the clearly
// labeled no-charge test checkout.

import type { HostPassOffer, PaymentConfig } from "../../shared/types";
import type { Env } from "../env";

export const DEFAULT_PRICE_CENTS = 499;
export const DEFAULT_IAP_PRODUCT_ID = "com.jaxsquares.app.board";
/** The Host Pass: $9.99 a year on the web; the App Store sets its own localized price. */
export const DEFAULT_HOST_PASS_PRICE_CENTS = 999;
export const DEFAULT_IAP_HOST_PASS_PRODUCT_ID = "com.jaxsquares.app.hostpass.yearly";
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

export function hostPassPriceCents(env: Env): number {
  const n = Number(env.HOST_PASS_PRICE_CENTS);
  return Number.isInteger(n) && n >= MIN_PRICE_CENTS ? n : DEFAULT_HOST_PASS_PRICE_CENTS;
}

export function iapHostPassProductId(env: Env): string {
  return env.IAP_HOST_PASS_PRODUCT_ID?.trim() || DEFAULT_IAP_HOST_PASS_PRODUCT_ID;
}

/** The Stripe Price of the yearly Host Pass, or null while the owner hasn't set one. */
export function stripeHostPassPriceId(env: Env): string | null {
  return env.STRIPE_HOST_PASS_PRICE_ID?.trim() || null;
}

/**
 * How the Host Pass is sold here. The web sells it in test mode (a no-charge
 * test pass) and in live mode once STRIPE_HOST_PASS_PRICE_ID is set; the iOS
 * app sells it through the App Store whenever StoreKit knows the product.
 */
export function hostPassOffer(env: Env, live: boolean): HostPassOffer {
  return {
    priceCents: hostPassPriceCents(env),
    currency: CURRENCY,
    iapProductId: iapHostPassProductId(env),
    web: !live || stripeHostPassPriceId(env) !== null,
  };
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
    hostPass: hostPassOffer(env, live),
  };
}
