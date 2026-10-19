// The Host Pass on this device: whether the identity holds an active one (so
// drawing the numbers costs nothing more), what it costs here, and the one
// gate every purchase goes through (startPassPurchase). The state lives in
// hostPassStore.ts: GET /api/me primes it at startup and on sign-in, the pass
// routes answer with the new state after a purchase, and sign-out clears it.
//
// Prices: the server's on the web ("$19.99/year"), only the App Store's own
// localized string in the iOS app (App Store guideline 3.1.1), never the web price.

import { useEffect, useState, useSyncExternalStore } from "react";
import type { HostPass, HostPassOffer, PaymentConfig } from "../../shared/types";
import { fetchAppConfig, fetchPassState, hostPassPrice, hostPrices, passCheckoutMethod, type CheckoutMethod, type Platform, type PriceAmount } from "./checkout";
import { getHostPassSnapshot, hostPassGeneration, setHostPassState, subscribeHostPass } from "./hostPassStore";
import { platform } from "./native";

let inflight: { promise: Promise<void>; generation: number } | null = null;

/** Re-reads the pass from the server (deduplicated). Failures leave what's known. */
export function refreshHostPass(): Promise<void> {
  const generation = hostPassGeneration();
  if (inflight?.generation === generation) return inflight.promise;
  const promise = fetchPassState()
    .then((state) => {
      if (generation === hostPassGeneration()) setHostPassState(state);
    })
    .catch(() => {})
    .finally(() => {
      if (inflight?.promise === promise) inflight = null;
    });
  inflight = { promise, generation };
  return promise;
}

export interface HostPassView {
  pass: HostPass | null;
  offer: HostPassOffer | null;
  /** Covers the host fee right now: drawing costs nothing more. */
  active: boolean;
  loaded: boolean;
  refresh: () => Promise<void>;
}

/** React binding. Loads the pass when `enabled` (e.g. only where a fee is due) and the offer isn't known yet. */
export function useHostPass(enabled = true): HostPassView {
  const s = useSyncExternalStore(subscribeHostPass, getHostPassSnapshot, getHostPassSnapshot);
  const known = s.loaded && s.offer !== null;
  useEffect(() => {
    if (enabled && !known) void refreshHostPass();
  }, [enabled, known]);
  return { pass: s.pass, offer: s.offer, active: s.pass?.active === true, loaded: s.loaded, refresh: refreshHostPass };
}

/** The pass's yearly price on this device ("$19.99", or the App Store's string), null while loading or when it can't be said. */
export function useHostPassPrice(enabled = true): { price: string | null; payments: PaymentConfig | null } {
  const [payments, setPayments] = useState<PaymentConfig | null>(null);
  const [price, setPrice] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    fetchAppConfig()
      .then(async ({ payments: config }) => {
        if (!live) return;
        setPayments(config);
        const shown = await hostPassPrice(config, platform());
        if (live) setPrice(shown);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [enabled]);
  return { price, payments };
}

/**
 * The board fee and the pass as amounts this device can compare (for "Pays
 * for itself by your fifth board", passPaysOffAt): the two web prices, or in
 * the iOS app the App Store's (StoreKit) prices. Each is null while loading or
 * when it can't be said. `payments`: the config when the caller has it
 * already (else it's loaded).
 */
export function useHostPrices(enabled = true, payments?: PaymentConfig | null): { board: PriceAmount | null; pass: PriceAmount | null } {
  const [prices, setPrices] = useState<{ board: PriceAmount | null; pass: PriceAmount | null }>({ board: null, pass: null });
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    (payments ? Promise.resolve(payments) : fetchAppConfig().then((c) => c.payments))
      .then((config) => hostPrices(config, platform()))
      .then((p) => live && setPrices(p))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [enabled, payments]);
  return prices;
}

// ---- The purchase gate ----

export type PassStart =
  /** Go ahead: run this checkout method. */
  | { kind: "checkout"; method: CheckoutMethod }
  /** The web needs an account first: open the sign-in sheet, then come back here. */
  | { kind: "sign-in" }
  /** Not sold on this device (the web in live mode before the Stripe price is set). */
  | { kind: "unavailable" };

/**
 * Every Host Pass purchase starts here. Buying on the web needs a signed-in
 * account (a web subscription kept only in a browser would be lost with it;
 * the server refuses one too, 409 account_required). The iOS app needs none
 * (Apple keeps the subscription; Restore purchases brings it back), and the
 * no-charge test pass needs none either, so it stays easy to try.
 */
export function startPassPurchase(config: PaymentConfig, on: Platform, signedIn: boolean): PassStart {
  const method = passCheckoutMethod(config, on);
  if (!method) return { kind: "unavailable" };
  if ((method === "wallet" || method === "card") && !signedIn) return { kind: "sign-in" };
  return { kind: "checkout", method };
}
