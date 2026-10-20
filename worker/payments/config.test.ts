// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import type { Env } from "../env";
import {
  DEFAULT_IAP_HOST_PASS_PRODUCT_ID,
  DEFAULT_IAP_PRODUCT_ID,
  DEFAULT_IAP_SEASON_PRODUCT_ID,
  boardFeeFor,
  boardPriceCents,
  getPaymentConfig,
  hostPassPriceCents,
  missingLiveKeys,
} from "./config";

const LIVE_KEYS: Partial<Env> = {
  STRIPE_SECRET_KEY: "sk_live_x",
  STRIPE_PUBLISHABLE_KEY: "pk_live_x",
  STRIPE_WEBHOOK_SECRET: "whsec_x",
};

const env = (vars: Partial<Env>) => vars as Env;

describe("getPaymentConfig", () => {
  it("runs the test checkout when PAYMENTS_MODE is unset, even with every key present", () => {
    const cfg = getPaymentConfig(env({ ...LIVE_KEYS }));
    expect(cfg.mode).toBe("test");
    expect(cfg.stripePublishableKey).toBeNull();
  });

  it("goes live only with PAYMENTS_MODE=live and every Stripe key", () => {
    const cfg = getPaymentConfig(env({ ...LIVE_KEYS, PAYMENTS_MODE: "live", BOARD_PRICE_CENTS: "499" }));
    expect(cfg).toEqual({
      mode: "live",
      priceCents: 499,
      currency: "usd",
      stripePublishableKey: "pk_live_x",
      iapProductId: DEFAULT_IAP_PRODUCT_ID,
      // No Stripe price for the Host Pass yet: the web doesn't sell it in live mode.
      hostPass: { priceCents: 1999, currency: "usd", iapProductId: DEFAULT_IAP_HOST_PASS_PRODUCT_ID, web: false },
      // Nor for the Club Pass (web only).
      clubPass: { priceCents: 4900, currency: "usd", web: false },
      // A season board's one host fee, at its draw.
      season: { priceCents: 1499, iapProductId: DEFAULT_IAP_SEASON_PRODUCT_ID },
    });
    expect(getPaymentConfig(env({ ...LIVE_KEYS, PAYMENTS_MODE: " LIVE " })).mode).toBe("live");
  });

  it("stays in test mode (and says which keys are missing) when live is asked for but a key is absent", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    for (const key of Object.keys(LIVE_KEYS) as (keyof Env)[]) {
      const partial = env({ ...LIVE_KEYS, [key]: "  ", PAYMENTS_MODE: "live" });
      expect(getPaymentConfig(partial).mode).toBe("test");
      expect(missingLiveKeys(partial)).toEqual([key]);
    }
    expect(error).toHaveBeenCalledTimes(1); // once per isolate, not per request
    error.mockRestore();
  });

  it("doesn't wait on the App Store keys (a web-only launch)", () => {
    expect(getPaymentConfig(env({ ...LIVE_KEYS, PAYMENTS_MODE: "live" })).mode).toBe("live");
    expect(missingLiveKeys(env({ ...LIVE_KEYS, PAYMENTS_MODE: "live" }))).toEqual([]);
  });

  it("goes live with Stripe test keys too (staging the real flow without charging anyone)", () => {
    const cfg = getPaymentConfig(env({ STRIPE_SECRET_KEY: "rk_test_x", STRIPE_PUBLISHABLE_KEY: "pk_test_x", STRIPE_WEBHOOK_SECRET: "whsec_x", PAYMENTS_MODE: "live" }));
    expect(cfg.mode).toBe("live");
    expect(cfg.stripePublishableKey).toBe("pk_test_x");
  });

  it("only treats the exact word live as live", () => {
    expect(getPaymentConfig(env({ ...LIVE_KEYS, PAYMENTS_MODE: "production" })).mode).toBe("test");
    expect(getPaymentConfig(env({ ...LIVE_KEYS, PAYMENTS_MODE: "test" })).mode).toBe("test");
  });

  it("uses the configured IAP product id", () => {
    expect(getPaymentConfig(env({ IAP_PRODUCT_ID: "com.example.board" })).iapProductId).toBe("com.example.board");
  });
});

describe("a season board's host fee", () => {
  it("is SEASON_BOARD_PRICE_CENTS ($14.99 by default) with its own App Store product, and leaves the board's alone", () => {
    expect(getPaymentConfig(env({})).season).toEqual({ priceCents: 1499, iapProductId: "com.jaxsquares.app.seasonboard" });
    expect(getPaymentConfig(env({ SEASON_BOARD_PRICE_CENTS: "1999", IAP_SEASON_PRODUCT_ID: "com.example.season" })).season).toEqual({
      priceCents: 1999,
      iapProductId: "com.example.season",
    });
    // Below Stripe's minimum or not whole cents: the default.
    expect(getPaymentConfig(env({ SEASON_BOARD_PRICE_CENTS: "20" })).season?.priceCents).toBe(1499);
    expect(getPaymentConfig(env({ SEASON_BOARD_PRICE_CENTS: "14.99" })).season?.priceCents).toBe(1499);
    expect(getPaymentConfig(env({})).priceCents).toBe(499);
  });

  it("is what a season board's checkout charges; any other board pays the board fee", () => {
    const e = env({ BOARD_PRICE_CENTS: "499", SEASON_BOARD_PRICE_CENTS: "1499" });
    expect(boardFeeFor(e, { kind: "season" })).toEqual({ amountCents: 1499, iapProductId: DEFAULT_IAP_SEASON_PRODUCT_ID });
    expect(boardFeeFor(e, { kind: "board" })).toEqual({ amountCents: 499, iapProductId: DEFAULT_IAP_PRODUCT_ID });
    expect(boardFeeFor(e, {})).toEqual({ amountCents: 499, iapProductId: DEFAULT_IAP_PRODUCT_ID });
  });
});

describe("the Host Pass offer", () => {
  it("sells the pass on the web in test mode, and in live mode only once the Stripe price is set", () => {
    expect(getPaymentConfig(env({})).hostPass).toEqual({ priceCents: 1999, currency: "usd", iapProductId: DEFAULT_IAP_HOST_PASS_PRODUCT_ID, web: true });
    const live = env({ ...LIVE_KEYS, PAYMENTS_MODE: "live" });
    expect(getPaymentConfig(live).hostPass?.web).toBe(false);
    expect(getPaymentConfig({ ...live, STRIPE_HOST_PASS_PRICE_ID: " price_123 " }).hostPass?.web).toBe(true);
    expect(getPaymentConfig(env({ IAP_HOST_PASS_PRODUCT_ID: "com.example.pass" })).hostPass?.iapProductId).toBe("com.example.pass");
  });

  it("reads HOST_PASS_PRICE_CENTS, falling back to $19.99", () => {
    expect(hostPassPriceCents(env({ HOST_PASS_PRICE_CENTS: "1299" }))).toBe(1299);
    expect(hostPassPriceCents(env({}))).toBe(1999);
    expect(hostPassPriceCents(env({ HOST_PASS_PRICE_CENTS: "19.99" }))).toBe(1999);
  });
});

describe("boardPriceCents", () => {
  it("reads BOARD_PRICE_CENTS and falls back to $4.99 for missing, fractional or sub-minimum values", () => {
    expect(boardPriceCents(env({ BOARD_PRICE_CENTS: "999" }))).toBe(999);
    expect(boardPriceCents(env({}))).toBe(499);
    expect(boardPriceCents(env({ BOARD_PRICE_CENTS: "4.99" }))).toBe(499);
    expect(boardPriceCents(env({ BOARD_PRICE_CENTS: "25" }))).toBe(499);
    expect(boardPriceCents(env({ BOARD_PRICE_CENTS: "abc" }))).toBe(499);
  });
});
