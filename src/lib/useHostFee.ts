// What drawing a board costs as this device shows it ("Draw the numbers ·
// $4.99", $14.99 with the Venue add-on): on the host's draw buttons, the create
// flow's Review line and the Terms and Support pages. Web: the server's
// prices (shared/pricing.ts). iOS app: only the App Store's localized price
// (App Store guideline 3.1.1), never the web one.

import { useEffect, useState } from "react";
import type { PassCover, PricedBoard } from "../../shared/pricing";
import type { PaymentConfig } from "../../shared/types";
import { fetchAppConfig, hostFeePrice } from "./checkout";
import { platform } from "./native";

export interface HostFee {
  /** "$4.99" on the web, the App Store's own string in the iOS app; null while loading, when StoreKit can't say, or when nothing per board is due. */
  price: string | null;
  /** The checkout config once loaded (the checkout sheet reuses it), else null. */
  payments: PaymentConfig | null;
}

/**
 * Loads the price when `enabled` (e.g. only on a board whose fee is still
 * due): what `board` costs to draw with this pass cover (one board's host
 * fee, plus the Venue add-on on a venue board, less what the pass covers).
 */
export function useHostFee(enabled = true, board: PricedBoard = { format: {} }, cover: PassCover = "none"): HostFee {
  const [payments, setPayments] = useState<PaymentConfig | null>(null);
  const [price, setPrice] = useState<string | null>(null);
  const season = board.kind === "season";
  const venue = board.format.venue === true;
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    fetchAppConfig()
      .then(async ({ payments: config }) => {
        if (!live) return;
        setPayments(config);
        const shown = await hostFeePrice(config, platform(), { kind: season ? "season" : "board", format: { venue } }, cover);
        if (live) setPrice(shown);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [enabled, season, venue, cover]);
  return { price, payments };
}
