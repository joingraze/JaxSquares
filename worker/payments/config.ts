// Which checkout the app runs and what a board (or the yearly Host Pass) costs.
// Live mode needs an explicit PAYMENTS_MODE=live AND every key for both rails
// (Stripe on the web, Apple IAP in the iOS app); anything less runs the clearly
// labeled no-charge test checkout.

import type { ClubPassOffer, Game, HostPassOffer, PaymentConfig, SeasonFeeOffer } from "../../shared/types";
import type { Env } from "../env";

export const DEFAULT_PRICE_CENTS = 499;
export const DEFAULT_IAP_PRODUCT_ID = "com.jaxsquares.app.board";
/** A season board's host fee: $14.99, once, at its draw (wrangler.jsonc SEASON_BOARD_PRICE_CENTS sets it). */
export const DEFAULT_SEASON_PRICE_CENTS = 1499;
/** The App Store consumable for a season board's host fee. */
export const DEFAULT_IAP_SEASON_PRODUCT_ID = "com.jaxsquares.app.seasonboard";
/** The Host Pass: $19.99 a year on the web (wrangler.jsonc HOST_PASS_PRICE_CENTS sets it); the App Store sets its own localized price. */
export const DEFAULT_HOST_PASS_PRICE_CENTS = 1999;
export const DEFAULT_IAP_HOST_PASS_PRODUCT_ID = "com.jaxsquares.app.hostpass.yearly";
/** The Club Pass: $49 a year, on the web only (wrangler.jsonc CLUB_PASS_PRICE_CENTS sets it). */
export const DEFAULT_CLUB_PASS_PRICE_CENTS = 4900;
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

export function seasonPriceCents(env: Env): number {
  const n = Number(env.SEASON_BOARD_PRICE_CENTS);
  return Number.isInteger(n) && n >= MIN_PRICE_CENTS ? n : DEFAULT_SEASON_PRICE_CENTS;
}

export function iapSeasonProductId(env: Env): string {
  return env.IAP_SEASON_PRODUCT_ID?.trim() || DEFAULT_IAP_SEASON_PRODUCT_ID;
}

/** A season board's host fee (one fee for every game of the season). */
export function seasonFeeOffer(env: Env): SeasonFeeOffer {
  return { priceCents: seasonPriceCents(env), iapProductId: iapSeasonProductId(env) };
}

/** What a board's host fee is: a season board's (Game.kind "season"), else one board's. */
export function boardFeeFor(env: Env, game: Pick<Game, "kind">): { amountCents: number; iapProductId: string } {
  return game.kind === "season"
    ? { amountCents: seasonPriceCents(env), iapProductId: iapSeasonProductId(env) }
    : { amountCents: boardPriceCents(env), iapProductId: iapProductId(env) };
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

export function clubPassPriceCents(env: Env): number {
  const n = Number(env.CLUB_PASS_PRICE_CENTS);
  return Number.isInteger(n) && n >= MIN_PRICE_CENTS ? n : DEFAULT_CLUB_PASS_PRICE_CENTS;
}

/** The Stripe Price of the yearly Club Pass, or null while the owner hasn't set one. */
export function stripeClubPassPriceId(env: Env): string | null {
  return env.STRIPE_CLUB_PASS_PRICE_ID?.trim() || null;
}

/**
 * How the Club Pass is sold: on the web only (the iOS app never offers it),
 * as a no-charge test pass in test mode and in live mode once
 * STRIPE_CLUB_PASS_PRICE_ID is set.
 */
export function clubPassOffer(env: Env, live: boolean): ClubPassOffer {
  return { priceCents: clubPassPriceCents(env), currency: CURRENCY, web: !live || stripeClubPassPriceId(env) !== null };
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
    clubPass: clubPassOffer(env, live),
    season: seasonFeeOffer(env),
  };
}
