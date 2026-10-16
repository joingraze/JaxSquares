// STUB — owned by the payments builder. Client-side checkout (test / Stripe wallet / Apple IAP).
import type { PaymentConfig } from "../../shared/types";

export type CheckoutMethod = "test" | "wallet" | "iap" | "card";
export type CheckoutResult = "paid" | "cancelled" | "failed";

/** Which checkout this device will use for the given config. */
export function checkoutMethod(config: PaymentConfig): CheckoutMethod {
  return config.mode === "test" ? "test" : "card";
}
