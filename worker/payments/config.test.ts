// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import type { Env } from "../env";
import { feeDue } from "../../shared/pricing";
import {
  DEFAULT_IAP_HOST_PASS_PRODUCT_ID,
  DEFAULT_IAP_PRODUCT_ID,
  boardPriceCents,
  boardPrices,
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
      // A venue board's Venue add-on, on top of its host fee.
      venuePriceCents: 1000,
      currency: "usd",
      stripePublishableKey: "pk_live_x",
      iapProductId: DEFAULT_IAP_PRODUCT_ID,
      // No Stripe price for the Annual Pass yet: the web doesn't sell it in live mode.
      hostPass: { priceCents: 1999, currency: "usd", iapProductId: DEFAULT_IAP_HOST_PASS_PRODUCT_ID, web: false },
      // Nor for the Annual Pass + Venue (web only).
      clubPass: { priceCents: 9999, currency: "usd", web: false },
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

describe("one board's prices", () => {
  it("are the host fee and the Venue add-on (VENUE_PRICE_CENTS, $10 by default), each with Stripe's minimum", () => {
    expect(boardPrices(env({}))).toEqual({ boardCents: 499, venueCents: 1000 });
    expect(boardPrices(env({ BOARD_PRICE_CENTS: "599", VENUE_PRICE_CENTS: "1500" }))).toEqual({ boardCents: 599, venueCents: 1500 });
    // Below Stripe's minimum or not whole cents: the default.
    expect(boardPrices(env({ VENUE_PRICE_CENTS: "20" })).venueCents).toBe(1000);
    expect(boardPrices(env({ VENUE_PRICE_CENTS: "9.99" })).venueCents).toBe(1000);
    expect(getPaymentConfig(env({ VENUE_PRICE_CENTS: "1500" })).venuePriceCents).toBe(1500);
  });

  it("price a board as shared/pricing.ts says: venue boards add the add-on, a season board needs the pass", () => {
    const prices = boardPrices(env({}));
    expect(feeDue({ format: {} }, prices, "none").cents).toBe(499);
    expect(feeDue({ format: { venue: true } }, prices, "none")).toEqual({ cents: 1499, boardCents: 499, venueCents: 1000, needsPass: false });
    expect(feeDue({ format: { venue: true } }, prices, "pass")).toEqual({ cents: 1000, boardCents: 0, venueCents: 1000, needsPass: false });
    expect(feeDue({ format: { venue: true } }, prices, "venue").cents).toBe(0);
    expect(feeDue({ kind: "season", format: {} }, prices, "none").needsPass).toBe(true);
    expect(feeDue({ kind: "season", format: {} }, prices, "pass")).toEqual({ cents: 0, boardCents: 0, venueCents: 0, needsPass: false });
  });
});

describe("the Annual Pass offer", () => {
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
