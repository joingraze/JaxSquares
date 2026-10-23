// Which checkout the app runs and what a host pays (shared/pricing.ts): one
// board's host fee and its Venue add-on, or the yearly Annual Pass, with or
// without the Venue add-on.
// Live mode needs an explicit PAYMENTS_MODE=live AND the Stripe keys (the web
// checkout); anything less runs the clearly labeled no-charge test checkout.
// The App Store keys only matter to the iOS app: until they're set its
// purchase routes answer 503 (appStoreCredentials), so a web-only launch
// doesn't wait on them.

import type { BoardPrices } from "../../shared/pricing";
import type { ClubPassOffer, HostPassOffer, PaymentConfig } from "../../shared/types";
import type { Env } from "../env";

/** One board's host fee: $4.99 (wrangler.jsonc BOARD_PRICE_CENTS sets it). */
export const DEFAULT_PRICE_CENTS = 499;
export const DEFAULT_IAP_PRODUCT_ID = "com.jaxsquares.app.board";
/** One venue board's Venue add-on, on top of its host fee: $10 (wrangler.jsonc VENUE_PRICE_CENTS sets it). Web only. */
export const DEFAULT_VENUE_PRICE_CENTS = 1000;
/** The Annual Pass: $19.99 a year on the web (wrangler.jsonc HOST_PASS_PRICE_CENTS sets it); the App Store sets its own localized price. */
export const DEFAULT_HOST_PASS_PRICE_CENTS = 1999;
export const DEFAULT_IAP_HOST_PASS_PRODUCT_ID = "com.jaxsquares.app.hostpass.yearly";
/** The Annual Pass with the Venue add-on (plan "club"): $99.99 a year, on the web only (wrangler.jsonc CLUB_PASS_PRICE_CENTS sets it). */
export const DEFAULT_CLUB_PASS_PRICE_CENTS = 9999;
export const CURRENCY = "usd";
/** Stripe's minimum charge for USD. */
const MIN_PRICE_CENTS = 50;

const LIVE_KEYS = ["STRIPE_SECRET_KEY", "STRIPE_PUBLISHABLE_KEY", "STRIPE_WEBHOOK_SECRET"] as const satisfies readonly (keyof Env)[];

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

export function venuePriceCents(env: Env): number {
  const n = Number(env.VENUE_PRICE_CENTS);
  return Number.isInteger(n) && n >= MIN_PRICE_CENTS ? n : DEFAULT_VENUE_PRICE_CENTS;
}

/** One board's prices: its host fee and the Venue add-on. */
export function boardPrices(env: Env): BoardPrices {
  return { boardCents: boardPriceCents(env), venueCents: venuePriceCents(env) };
}

export function hostPassPriceCents(env: Env): number {
  const n = Number(env.HOST_PASS_PRICE_CENTS);
  return Number.isInteger(n) && n >= MIN_PRICE_CENTS ? n : DEFAULT_HOST_PASS_PRICE_CENTS;
}

export function iapHostPassProductId(env: Env): string {
  return env.IAP_HOST_PASS_PRODUCT_ID?.trim() || DEFAULT_IAP_HOST_PASS_PRODUCT_ID;
}

/** The Stripe Price of the yearly Annual Pass, or null while the owner hasn't set one. */
export function stripeHostPassPriceId(env: Env): string | null {
  return env.STRIPE_HOST_PASS_PRICE_ID?.trim() || null;
}

export function clubPassPriceCents(env: Env): number {
  const n = Number(env.CLUB_PASS_PRICE_CENTS);
  return Number.isInteger(n) && n >= MIN_PRICE_CENTS ? n : DEFAULT_CLUB_PASS_PRICE_CENTS;
}

/** The Stripe Price of the yearly Annual Pass with the Venue add-on, or null while the owner hasn't set one. */
export function stripeClubPassPriceId(env: Env): string | null {
  return env.STRIPE_CLUB_PASS_PRICE_ID?.trim() || null;
}

/** The Customer Portal configuration Manage opens, or null for Stripe's default one. */
export function stripePortalConfigurationId(env: Env): string | null {
  return env.STRIPE_PORTAL_CONFIGURATION_ID?.trim() || null;
}

/**
 * How the Annual Pass with the Venue add-on is sold: on the web only (the iOS
 * app never offers it), as a no-charge test pass in test mode and in live mode
 * once STRIPE_CLUB_PASS_PRICE_ID is set.
 */
export function clubPassOffer(env: Env, live: boolean): ClubPassOffer {
  return { priceCents: clubPassPriceCents(env), currency: CURRENCY, web: !live || stripeClubPassPriceId(env) !== null };
}

/**
 * How the Annual Pass is sold here. The web sells it in test mode (a no-charge
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
    venuePriceCents: venuePriceCents(env),
    currency: CURRENCY,
    stripePublishableKey: live ? env.STRIPE_PUBLISHABLE_KEY!.trim() : null,
    iapProductId: iapProductId(env),
    hostPass: hostPassOffer(env, live),
    clubPass: clubPassOffer(env, live),
  };
}
