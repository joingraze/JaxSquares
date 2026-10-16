// STUB — owned by the payments builder. Replace with Stripe + IAP + test checkout.
import { Hono } from "hono";
import type { PaymentConfig } from "../../shared/types";
import type { Env } from "../env";

export const paymentsRoutes = new Hono<{ Bindings: Env }>();

export function getPaymentConfig(env: Env): PaymentConfig {
  return {
    mode: env.PAYMENTS_MODE === "live" ? "live" : "test",
    priceCents: Number(env.BOARD_PRICE_CENTS ?? 0) || 0,
    currency: "usd",
    stripePublishableKey: env.STRIPE_PUBLISHABLE_KEY ?? null,
    iapProductId: env.IAP_PRODUCT_ID ?? "com.jaxsquares.app.board",
  };
}
