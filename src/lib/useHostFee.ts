// The host fee as this device shows it ("Draw the numbers · $4.99"): on the
// host's draw buttons, the create flow's Review line and the Terms and Support
// pages. Web: the server's price. iOS app: only the App Store's localized
// price (App Store guideline 3.1.1), never the web one.

import { useEffect, useState } from "react";
import type { BoardKind, PaymentConfig } from "../../shared/types";
import { fetchAppConfig, hostFeePrice } from "./checkout";
import { platform } from "./native";

export interface HostFee {
  /** "$4.99" on the web, the App Store's own string in the iOS app; null while loading or when StoreKit can't say. */
  price: string | null;
  /** The checkout config once loaded (the checkout sheet reuses it), else null. */
  payments: PaymentConfig | null;
}

/**
 * Loads the fee when `enabled` (e.g. only on a board whose fee is still due):
 * one board's, or a season board's one fee for the season (`kind` "season").
 */
export function useHostFee(enabled = true, kind: BoardKind = "board"): HostFee {
  const [payments, setPayments] = useState<PaymentConfig | null>(null);
  const [price, setPrice] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    fetchAppConfig()
      .then(async ({ payments: config }) => {
        if (!live) return;
        setPayments(config);
        const shown = await hostFeePrice(config, platform(), kind);
        if (live) setPrice(shown);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [enabled, kind]);
  return { price, payments };
}
