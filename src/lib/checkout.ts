// Client checkout for creating a board. No UI here: the checkout sheet calls these.
//   test   – no-charge test checkout while payments aren't live
//   iap    – Apple In-App Purchase inside the iOS app (App Store guideline 3.1.1)
//   wallet – Apple Pay / Google Pay one tap on the web (Stripe Express Checkout)
//   card   – Stripe Payment Element when the browser has no wallet
// Stripe.js and the IAP plugin are loaded on first use so they stay out of the
// main bundle; call preloadCheckout() when the sheet opens to hide that latency.

import type { NativePurchasesPlugin } from "@capgo/native-purchases";
import type { Appearance, Stripe, StripeExpressCheckoutElement, StripePaymentElement } from "@stripe/stripe-js";
import type { AppConfig, GameState, PaymentConfig } from "../../shared/types";
import { getClientId } from "./identity";

export type CheckoutMethod = "test" | "iap" | "wallet" | "card";
export type CheckoutResult = "paid" | "cancelled" | "failed";
export type Platform = "ios" | "android" | "web";

/** How an App Store purchase ended. "pending" = Ask to Buy; the board opens once a parent approves. */
export type PurchaseOutcome = { status: "paid"; state: GameState } | { status: "cancelled" } | { status: "pending" };

const API_BASE = String(import.meta.env.VITE_API_BASE ?? "").replace(/\/+$/, "");

/** A failed checkout call. `status` 0 = never reached the server. `state` is set when the board is already open. */
export class CheckoutError extends Error {
  constructor(
    message: string,
    public status: number,
    public state?: GameState,
  ) {
    super(message);
    this.name = "CheckoutError";
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const gamePath = (gameId: string, rest: string) => `/games/${encodeURIComponent(gameId)}${rest}`;

async function request<T>(method: "GET" | "POST", path: string, opts: { adminToken?: string; body?: unknown } = {}): Promise<T> {
  // Same device id as every other call (identity.ts owns creating and storing it).
  const headers: Record<string, string> = { "x-client-id": getClientId() };
  if (opts.adminToken) headers["x-admin-token"] = opts.adminToken;
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api${path}`, {
      method,
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
  } catch {
    throw new CheckoutError("You're offline. Check your connection and try again.", 0);
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string; state?: GameState };
  if (!res.ok) throw new CheckoutError(data.error ?? `Request failed (${res.status})`, res.status, data.state);
  return data as T;
}

// ---- Config ----

let configPromise: Promise<AppConfig> | null = null;

/** GET /api/config, cached for the session (pass refresh to re-read). */
export function fetchAppConfig(opts: { refresh?: boolean } = {}): Promise<AppConfig> {
  if (!configPromise || opts.refresh) {
    const p = request<AppConfig>("GET", "/config");
    p.catch(() => {
      if (configPromise === p) configPromise = null;
    });
    configPromise = p;
  }
  return configPromise;
}

/** Which checkout this device uses. A "wallet" device still falls back to "card" via onUnavailable. */
export function checkoutMethod(config: PaymentConfig, platform: Platform): CheckoutMethod {
  if (config.mode === "test") return "test";
  if (platform === "ios") return "iap";
  // Android: Stripe wallets work for the web build. A Play Store build will need
  // Google Play Billing for this (Play payments policy) before it ships.
  return hasWalletApi() ? "wallet" : "card";
}

function hasWalletApi(): boolean {
  return typeof window !== "undefined" && ("PaymentRequest" in window || "ApplePaySession" in window);
}

/** Starts loading whatever the checkout will need, so the pay button is instant. */
export function preloadCheckout(config: PaymentConfig, platform: Platform): void {
  const method = checkoutMethod(config, platform);
  if (method === "iap") void nativePurchases().catch(() => {});
  if (method === "wallet" || method === "card") void getStripe(config.stripePublishableKey).catch(() => {});
}

export function formatPrice(cents: number, currency = "usd", locale?: string): string {
  const code = currency.toUpperCase();
  let digits = 2;
  try {
    digits = new Intl.NumberFormat("en", { style: "currency", currency: code }).resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    return `${(cents / 100).toFixed(2)} ${code}`;
  }
  const amount = cents / 10 ** digits;
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: code,
    // "$5" rather than "$5.00"; "$4.99" stays as is.
    minimumFractionDigits: Number.isInteger(amount) ? 0 : digits,
    maximumFractionDigits: digits,
  }).format(amount);
}

/**
 * The price to show for opening a board on this device, or null when there's
 * nothing to pay (test mode). Web: the server's price. iOS: the App Store's own
 * localized string (App Store guideline 3.1.1: the in-app price is Apple's),
 * null when StoreKit can't say.
 */
export async function checkoutPrice(config: PaymentConfig, platform: Platform): Promise<string | null> {
  const method = checkoutMethod(config, platform);
  if (method === "test") return null;
  if (method === "iap") return appStorePrice(platform, config.iapProductId);
  return formatPrice(config.priceCents, config.currency);
}

const storePrices = new Map<string, Promise<string | null>>();

/**
 * The App Store's localized price for the board product (StoreKit's
 * `priceString`, e.g. "$4.99" or "4,99 €"). Null off iOS or when the product
 * can't be loaded. Cached per product, and never queried concurrently (the
 * plugin's getProduct isn't safe to run in parallel).
 */
export function appStorePrice(platform: Platform, productId: string): Promise<string | null> {
  if (platform !== "ios" || !productId) return Promise.resolve(null);
  let p = storePrices.get(productId);
  if (!p) {
    p = nativePurchases()
      .then((store) => store.getProduct({ productIdentifier: productId }))
      .then(({ product }) => product.priceString?.trim() || null)
      .catch(() => null);
    // A failure (offline, StoreKit not ready) is retried on the next ask.
    void p.then((price) => price === null && storePrices.get(productId) === p && storePrices.delete(productId));
    storePrices.set(productId, p);
  }
  return p;
}

// ---- Test checkout ----

export async function payTest(gameId: string, adminToken: string): Promise<GameState> {
  const { state } = await request<{ state: GameState }>("POST", gamePath(gameId, "/pay/test"), { adminToken });
  return state;
}

// ---- Apple In-App Purchase ----

let pluginPromise: Promise<NativePurchasesPlugin> | null = null;

function nativePurchases(): Promise<NativePurchasesPlugin> {
  pluginPromise ??= import("@capgo/native-purchases").then(async ({ NativePurchases }) => {
    // Transactions are finished only after the server has verified them, so a
    // purchase interrupted mid-way can be recovered (recoverIAPPurchases).
    await NativePurchases.configure({ autoFinishTransactions: false }).catch(() => {});
    return NativePurchases;
  });
  return pluginPromise;
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err && "message" in err) return String((err as { message: unknown }).message);
  return String(err ?? "");
}

/** Buys one board in the App Store sheet, has the server verify it with Apple, then finishes the transaction. */
export async function payWithIAP(gameId: string, adminToken: string, productId?: string): Promise<PurchaseOutcome> {
  const [store, productIdentifier] = await Promise.all([
    nativePurchases(),
    productId ?? fetchAppConfig().then((c) => c.payments.iapProductId),
  ]);
  let transactionId: string;
  try {
    const tx = await store.purchaseProduct({
      productIdentifier,
      quantity: 1,
      appAccountToken: boardAccountToken(gameId) ?? undefined,
      autoAcknowledgePurchases: false,
    });
    transactionId = tx.transactionId;
  } catch (err) {
    const msg = errorMessage(err);
    if (/cancel/i.test(msg)) return { status: "cancelled" };
    if (/pending/i.test(msg)) return { status: "pending" };
    throw new CheckoutError(msg || "The App Store couldn't complete the purchase", 0);
  }
  return { status: "paid", state: await redeemTransaction(store, gameId, adminToken, transactionId) };
}

/** Server answers that won't change on retry (refunded, wrong product, used elsewhere, board gone). */
const FINAL_STATUSES = new Set([400, 404, 409]);

async function redeemTransaction(
  store: NativePurchasesPlugin,
  gameId: string,
  adminToken: string,
  transactionId: string,
): Promise<GameState> {
  let last: CheckoutError | null = null;
  // The host has already been charged, so ride out brief network or server blips.
  for (const delay of [0, 1000, 3000]) {
    if (delay) await sleep(delay);
    try {
      const { state } = await request<{ state: GameState }>("POST", gamePath(gameId, "/pay/iap"), {
        adminToken,
        body: { transactionId },
      });
      await store.finishTransaction({ transactionId }).catch(() => {});
      return state;
    } catch (err) {
      if (!(err instanceof CheckoutError)) throw err;
      last = err;
      if (FINAL_STATUSES.has(err.status)) {
        await store.finishTransaction({ transactionId }).catch(() => {});
        throw err;
      }
    }
  }
  // Left unfinished on purpose: recoverIAPPurchases() completes it on the next launch.
  throw last ?? new CheckoutError("Couldn't confirm the purchase. We'll retry next time you open the app.", 0);
}

/**
 * Completes App Store purchases that were charged but never confirmed (app killed,
 * offline). Call once at launch in the iOS app with a lookup for this device's
 * admin tokens. Returns the boards it opened.
 */
export async function recoverIAPPurchases(adminTokenFor: (gameId: string) => string | null): Promise<GameState[]> {
  const { Capacitor } = await import("@capacitor/core");
  if (Capacitor.getPlatform() !== "ios") return [];
  const [store, config] = await Promise.all([nativePurchases(), fetchAppConfig()]);
  const { transactions } = await store.getUnfinishedTransactions();
  const opened: GameState[] = [];
  for (const tx of transactions) {
    if (tx.productIdentifier !== config.payments.iapProductId || !tx.appAccountToken) continue;
    const gameId = gameIdFromAccountToken(tx.appAccountToken);
    const adminToken = gameId ? adminTokenFor(gameId) : null;
    if (!gameId || !adminToken) continue;
    try {
      opened.push(await redeemTransaction(store, gameId, adminToken, tx.transactionId));
    } catch {
      // Still unfinished (or finished as final); the next launch tries again if needed.
    }
  }
  return opened;
}

// ---- Stripe (web) ----

/**
 * The board's PaymentIntent client secret (created once, then reused). Throws a
 * CheckoutError with status 409 and `state` set when the board is already open.
 */
export function createStripeIntent(gameId: string, adminToken: string): Promise<{ clientSecret: string }> {
  return request<{ clientSecret: string }>("POST", gamePath(gameId, "/pay/stripe"), { adminToken });
}

/**
 * Call after onPaid: resolves with the open board. The webhook usually gets there
 * first; if not, the server checks the intent with Stripe directly. Null if it's
 * still settling after a few seconds (the live board will flip when it lands).
 */
export async function confirmStripePaid(gameId: string, adminToken: string): Promise<GameState | null> {
  for (const delay of [0, 800, 1600, 3200]) {
    if (delay) await sleep(delay);
    try {
      await createStripeIntent(gameId, adminToken);
    } catch (err) {
      if (err instanceof CheckoutError && err.status === 409 && err.state) return err.state;
      if (!(err instanceof CheckoutError) || (err.status > 0 && err.status < 500)) throw err;
    }
  }
  return null;
}

const stripeByKey = new Map<string, Promise<Stripe | null>>();

async function getStripe(publishableKey?: string | null): Promise<Stripe | null> {
  const key = publishableKey ?? (await fetchAppConfig()).payments.stripePublishableKey;
  if (!key) return null;
  let p = stripeByKey.get(key);
  if (!p) {
    p = import("@stripe/stripe-js").then((m) => m.loadStripe(key));
    p.catch(() => stripeByKey.delete(key));
    stripeByKey.set(key, p);
  }
  return p;
}

// Stripe renders in an iframe, so the theme tokens from src/index.css are repeated here.
const APPEARANCE: Appearance = {
  theme: "night",
  variables: {
    colorPrimary: "#22c55e",
    colorBackground: "#131c30",
    colorText: "#e6edf6",
    colorDanger: "#fb7185",
    borderRadius: "14px",
    fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  },
};

export interface MountedCheckout {
  destroy(): void;
}

export interface WalletButtonOptions {
  clientSecret: string;
  amountCents: number;
  /** Line item in the Apple Pay / Google Pay sheet, e.g. "Squares board". */
  label: string;
  onPaid: (paymentIntentId: string) => void;
  onCancel?: () => void;
  /** No wallet on this device, or Stripe.js couldn't load: show the card form instead. */
  onUnavailable: () => void;
  /** The wallet sheet reported a failed payment (already shown in the sheet too). */
  onError?: (message: string) => void;
  /** Defaults to the key from /api/config. */
  publishableKey?: string | null;
  /** 40–55 px. */
  buttonHeight?: number;
}

/** Mounts a single Apple Pay or Google Pay button (whichever the device has) into `el`. */
export async function mountWalletButton(el: HTMLElement, opts: WalletButtonOptions): Promise<MountedCheckout> {
  let element: StripeExpressCheckoutElement | null = null;
  let destroyed = false;
  const handle: MountedCheckout = {
    destroy() {
      destroyed = true;
      element?.destroy();
    },
  };

  const stripe = await getStripe(opts.publishableKey).catch(() => null);
  if (destroyed) return handle;
  if (!stripe) {
    opts.onUnavailable();
    return handle;
  }

  const elements = stripe.elements({ clientSecret: opts.clientSecret, appearance: APPEARANCE });
  element = elements.create("expressCheckout", {
    business: { name: "JaxSquares" },
    buttonHeight: opts.buttonHeight ?? 52,
    buttonType: { applePay: "plain", googlePay: "plain" },
    buttonTheme: { applePay: "white", googlePay: "white" },
    layout: { maxColumns: 1, maxRows: 1, overflow: "never" },
    paymentMethods: {
      applePay: "auto",
      googlePay: "auto",
      link: "never",
      paypal: "never",
      amazonPay: "never",
      klarna: "never",
    },
  });
  element.on("ready", ({ availablePaymentMethods: m }) => {
    if (!m?.applePay && !m?.googlePay) opts.onUnavailable();
  });
  element.on("loaderror", () => opts.onUnavailable());
  element.on("click", (e) => e.resolve({ lineItems: [{ name: opts.label, amount: opts.amountCents }] }));
  element.on("cancel", () => opts.onCancel?.());
  element.on("confirm", async (e) => {
    const result = await stripe.confirmPayment({ elements, clientSecret: opts.clientSecret, redirect: "if_required" });
    if (result.error) {
      e.paymentFailed({ reason: "fail" });
      opts.onError?.(result.error.message ?? "That payment didn't go through");
      return;
    }
    opts.onPaid(result.paymentIntent.id);
  });
  element.mount(el);
  return handle;
}

export interface CardFormOptions {
  clientSecret: string;
  publishableKey?: string | null;
  /** Fires as the form becomes complete/incomplete, to enable the pay button. */
  onChange?: (complete: boolean) => void;
}

export interface CardForm extends MountedCheckout {
  /** Confirms the payment (3-D Secure opens in a modal when the bank asks). */
  submit(): Promise<{ status: "paid"; paymentIntentId: string } | { status: "failed"; message: string }>;
}

/** Mounts Stripe's Payment Element (card entry) into `el`: the fallback when there's no wallet. */
export async function mountCardForm(el: HTMLElement, opts: CardFormOptions): Promise<CardForm> {
  const stripe = await getStripe(opts.publishableKey).catch(() => null);
  if (!stripe) throw new CheckoutError("Checkout couldn't load. Check your connection and try again.", 0);
  const elements = stripe.elements({ clientSecret: opts.clientSecret, appearance: APPEARANCE });
  const payment: StripePaymentElement = elements.create("payment", {
    layout: "tabs",
    wallets: { applePay: "never", googlePay: "never" },
  });
  payment.on("change", (e) => opts.onChange?.(e.complete));
  payment.mount(el);
  return {
    destroy: () => payment.destroy(),
    async submit() {
      const result = await stripe.confirmPayment({ elements, clientSecret: opts.clientSecret, redirect: "if_required" });
      if (result.error) return { status: "failed", message: result.error.message ?? "That payment didn't go through" };
      return { status: "paid", paymentIntentId: result.paymentIntent.id };
    },
  };
}

// ---- Board <-> App Store purchase binding ----
// Mirror of worker/payments/boardToken.ts (see the comment there); keep in sync.

const TOKEN_MARKER = "6a73";
const TOKEN_MAX_ID_BYTES = 13;

export function boardAccountToken(gameId: string): string | null {
  const bytes = new TextEncoder().encode(gameId);
  if (bytes.length === 0 || bytes.length > TOKEN_MAX_ID_BYTES) return null;
  let hex = TOKEN_MARKER + bytes.length.toString(16).padStart(2, "0");
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  hex = hex.padEnd(32, "0");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function gameIdFromAccountToken(token: string): string | null {
  const hex = token.replace(/-/g, "").toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(hex) || !hex.startsWith(TOKEN_MARKER)) return null;
  const len = parseInt(hex.slice(4, 6), 16);
  if (len < 1 || len > TOKEN_MAX_ID_BYTES) return null;
  if (!/^0*$/.test(hex.slice(6 + len * 2))) return null;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = parseInt(hex.slice(6 + i * 2, 8 + i * 2), 16);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}
