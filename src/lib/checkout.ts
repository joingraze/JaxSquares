// Client checkout for a board's host fee, due when the host draws the numbers
// (POST /lock answers 402 until it's paid). No UI here: the checkout sheet calls these.
//   test   – no-charge test checkout while payments aren't live
//   iap    – Apple In-App Purchase inside the iOS app (App Store guideline 3.1.1)
//   wallet – Apple Pay / Google Pay one tap on the web (Stripe Express Checkout)
//   card   – Stripe Payment Element when the browser has no wallet
// Stripe.js and the IAP plugin are loaded on first use so they stay out of the
// main bundle; call preloadCheckout() when the sheet opens to hide that latency.

import type { NativePurchasesPlugin, Transaction } from "@capgo/native-purchases";
import type { PluginListenerHandle } from "@capacitor/core";
import type { Appearance, ClickResolveDetails, Stripe, StripeExpressCheckoutElement, StripePaymentElement } from "@stripe/stripe-js";
import type { AppConfig, GameState, HostPassIntent, HostPassState, HostPassTransaction, PaymentConfig } from "../../shared/types";
import { getClientId, isSignedIn } from "./identity";
import { getResolvedTheme, type ResolvedTheme } from "./theme";

export type CheckoutMethod = "test" | "iap" | "wallet" | "card";
export type CheckoutResult = "paid" | "cancelled" | "failed";
export type Platform = "ios" | "android" | "web";

/** How an App Store purchase ended. "pending" = Ask to Buy; the board is paid for once a parent approves. */
export type PurchaseOutcome = { status: "paid"; state: GameState } | { status: "cancelled" } | { status: "pending" };

const API_BASE = String(import.meta.env.VITE_API_BASE ?? "").replace(/\/+$/, "");

/**
 * A failed checkout call. `status` 0 = never reached the server. `state` is set when the board is already paid for.
 * `unused`: the server kept this App Store purchase but it paid for nothing (board already paid for, or deleted);
 * the message tells the host how to get a refund.
 */
export class CheckoutError extends Error {
  constructor(
    message: string,
    public status: number,
    public state?: GameState,
    public unused = false,
    /** The server's `code` (e.g. ACCOUNT_REQUIRED_CODE), and its Host Pass state when it sent one. */
    public code?: string,
    public pass?: HostPassState,
  ) {
    super(message);
    this.name = "CheckoutError";
  }
}

/** The App Store charged the host but the server hasn't confirmed it yet. Trying again confirms that purchase; it never buys again. */
export class UnconfirmedPurchaseError extends CheckoutError {}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const gamePath = (gameId: string, rest: string) => `/games/${encodeURIComponent(gameId)}${rest}`;

async function request<T>(method: "GET" | "POST", path: string, opts: { adminToken?: string | null; body?: unknown } = {}): Promise<T> {
  // Same device id as every other call (identity.ts owns creating and storing it), and the
  // signed-in hint so a pass bought on the account is found right after a sign-in (api.ts identityHeaders).
  const headers: Record<string, string> = { "x-client-id": getClientId() };
  if (isSignedIn()) headers["x-signed-in"] = "1";
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
  const data = (await res.json().catch(() => ({}))) as { error?: string; state?: GameState; unused?: boolean; code?: string } & Partial<HostPassState>;
  if (!res.ok) {
    const pass = data.offer ? { pass: data.pass ?? null, offer: data.offer } : undefined;
    throw new CheckoutError(data.error ?? `Request failed (${res.status})`, res.status, data.state, data.unused === true, data.code, pass);
  }
  return data as T;
}

// ---- Config ----

/** How long a loaded config is reused: checkout can go live (or the price change) while a page is open. */
const CONFIG_TTL_MS = 60_000;

let config: { promise: Promise<AppConfig>; at: number } | null = null;

/** GET /api/config, reused for a minute (pass refresh to re-read now). */
export function fetchAppConfig(opts: { refresh?: boolean } = {}): Promise<AppConfig> {
  if (!config || opts.refresh || Date.now() - config.at > CONFIG_TTL_MS) {
    const entry = { promise: request<AppConfig>("GET", "/config"), at: Date.now() };
    entry.promise.catch(() => {
      if (config === entry) config = null;
    });
    config = entry;
  }
  return config.promise;
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
 * The host fee to show on this device ("Draw the numbers · $4.99"), or null
 * when it can't be said. Web: the server's price, test mode included (the
 * checkout itself says it charges nothing then). iOS: only the App Store's own
 * localized string (App Store guideline 3.1.1: the in-app price is Apple's;
 * never the web price), null when StoreKit can't say.
 */
export async function hostFeePrice(config: PaymentConfig, platform: Platform): Promise<string | null> {
  if (platform === "ios") return appStorePrice(platform, config.iapProductId);
  return formatPrice(config.priceCents, config.currency);
}

/** A price to compare with another one in the same currency: cents on the web, StoreKit's decimal amount in the iOS app. */
export interface PriceAmount {
  amount: number;
  currency: string;
}

/** A StoreKit product's price: its localized string, and its amount when StoreKit gives one. */
export interface StorePrice {
  label: string;
  amount: PriceAmount | null;
}

const storePrices = new Map<string, Promise<StorePrice | null>>();

/**
 * The App Store's price for a product (StoreKit's `priceString`, e.g. "$4.99"
 * or "4,99 €", and its `price` in `currencyCode`). Null off iOS or when the
 * product can't be loaded. Cached per product, and never queried
 * concurrently (the plugin's getProduct isn't safe to run in parallel).
 */
export function appStoreProduct(platform: Platform, productId: string): Promise<StorePrice | null> {
  if (platform !== "ios" || !productId) return Promise.resolve(null);
  let p = storePrices.get(productId);
  if (!p) {
    p = nativePurchases()
      .then((store) => store.getProduct({ productIdentifier: productId }))
      .then(({ product }): StorePrice | null => {
        const label = product.priceString?.trim();
        if (!label) return null;
        const ok = typeof product.price === "number" && Number.isFinite(product.price) && product.price > 0 && !!product.currencyCode;
        return { label, amount: ok ? { amount: product.price, currency: product.currencyCode.toUpperCase() } : null };
      })
      .catch(() => null);
    // A failure (offline, StoreKit not ready) is retried on the next ask.
    void p.then((price) => price === null && storePrices.get(productId) === p && storePrices.delete(productId));
    storePrices.set(productId, p);
  }
  return p;
}

/**
 * The App Store's localized price string for a product (the board's, or the
 * pass's), e.g. "$4.99" or "4,99 €". Null off iOS or when StoreKit can't say.
 */
export function appStorePrice(platform: Platform, productId: string): Promise<string | null> {
  return appStoreProduct(platform, productId).then((p) => p?.label ?? null);
}

/**
 * The board fee and the Host Pass as amounts this device can compare (for
 * "Pays for itself by your fifth board"): the server's prices on the web,
 * only the App Store's in the iOS app (never the web price there). Either is
 * null when it can't be said.
 */
export async function hostPrices(config: PaymentConfig, platform: Platform): Promise<{ board: PriceAmount | null; pass: PriceAmount | null }> {
  const offer = config.hostPass;
  if (platform === "ios") {
    // One after the other: the plugin's getProduct isn't made for parallel calls.
    const board = await appStoreProduct(platform, config.iapProductId);
    const pass = offer ? await appStoreProduct(platform, offer.iapProductId) : null;
    return { board: board?.amount ?? null, pass: pass?.amount ?? null };
  }
  return {
    board: { amount: config.priceCents, currency: config.currency.toUpperCase() },
    pass: offer ? { amount: offer.priceCents, currency: offer.currency.toUpperCase() } : null,
  };
}

// ---- The Host Pass: what's sold here, at what price ----

/**
 * How this device buys the Host Pass, or null when it isn't sold here: the
 * no-charge test pass in test mode, the App Store subscription in the iOS app,
 * Stripe on the web only once the server has a Stripe price for it.
 */
export function passCheckoutMethod(config: PaymentConfig, platform: Platform): CheckoutMethod | null {
  const offer = config.hostPass;
  if (!offer) return null;
  if (config.mode === "test") return "test";
  if (platform === "ios") return offer.iapProductId ? "iap" : null;
  if (!offer.web) return null;
  return hasWalletApi() ? "wallet" : "card";
}

/**
 * The pass's yearly price as this device shows it ("$19.99"; the caller adds
 * "/year"): the server's on the web (test mode too), only the App Store's own
 * localized string in the iOS app (App Store guideline 3.1.1), else null.
 */
export async function hostPassPrice(config: PaymentConfig, platform: Platform): Promise<string | null> {
  const offer = config.hostPass;
  if (!offer) return null;
  if (platform === "ios") return appStorePrice(platform, offer.iapProductId);
  return formatPrice(offer.priceCents, offer.currency);
}

// ---- Test checkout ----

/** `adminToken`: the host's; null for a co-host (the server knows them by clientId), here and below. */
export async function payTest(gameId: string, adminToken: string | null): Promise<GameState> {
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

/** The board an App Store transaction paid for, or null when it isn't a board purchase. */
function boardOf(tx: Pick<Transaction, "productIdentifier" | "appAccountToken">, productId: string): string | null {
  if (tx.productIdentifier !== productId || !tx.appAccountToken) return null;
  return gameIdFromAccountToken(tx.appAccountToken);
}

/**
 * Buys one board's host fee in the App Store sheet, has the server verify it with Apple, then finishes the
 * transaction. A purchase for this board that was charged but never confirmed (offline, an App Store outage)
 * or that a parent just approved is confirmed instead of buying again, and nothing is bought for a board
 * that's already paid for (on another device, or before the fee moved to the draw) or gone.
 */
export async function payWithIAP(gameId: string, adminToken: string | null, productId?: string): Promise<PurchaseOutcome> {
  const [store, productIdentifier] = await Promise.all([
    nativePurchases(),
    productId ?? fetchAppConfig().then((c) => c.payments.iapProductId),
  ]);
  let unfinished: Transaction[];
  try {
    ({ transactions: unfinished } = await store.getUnfinishedTransactions());
  } catch {
    // Without this check a retry could charge twice; better to not sell right now.
    throw new CheckoutError("The App Store isn't ready yet. Try again in a moment.", 0);
  }
  const earlier = unfinished.find((tx) => boardOf(tx, productIdentifier) === gameId);
  if (earlier) return { status: "paid", state: await redeemTransaction(store, gameId, adminToken, earlier.transactionId) };

  const current = await request<GameState>("GET", gamePath(gameId, ""));
  // Absent `paid` (an older server) reads as paid: never charge for a board that may be paid for already.
  if (current.game.paid !== false) throw new CheckoutError("This board is already paid for", 409, current);

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

/**
 * Server answers that are settled for good, so the transaction is finished: rejected (refunded, wrong
 * product, bound to another board: 400), used by another board or kept as unused (409), kept for a
 * deleted board (410). A bare 404 isn't one: nothing was recorded, so the purchase stays unfinished.
 */
const FINAL_STATUSES = new Set([400, 409, 410]);

const UNCONFIRMED = "Your purchase went through but isn't confirmed yet. Tap again to finish. You won't be charged again for this board.";

/** Confirmations in flight, by transaction id: a purchase, a resume and StoreKit's updates can all see the same one. */
const redeeming = new Map<string, Promise<GameState>>();
/** Settled (finished) in this run; StoreKit may still mention them once. */
const settled = new Set<string>();

function redeemTransaction(store: NativePurchasesPlugin, gameId: string, adminToken: string | null, transactionId: string): Promise<GameState> {
  let p = redeeming.get(transactionId);
  if (!p) {
    p = confirmTransaction(store, gameId, adminToken, transactionId).finally(() => redeeming.delete(transactionId));
    redeeming.set(transactionId, p);
  }
  return p;
}

async function confirmTransaction(
  store: NativePurchasesPlugin,
  gameId: string,
  adminToken: string | null,
  transactionId: string,
): Promise<GameState> {
  const finish = async () => {
    settled.add(transactionId);
    await store.finishTransaction({ transactionId }).catch(() => {});
  };
  let last: CheckoutError | null = null;
  // The host has already been charged, so ride out brief network or server blips.
  for (const delay of [0, 1000, 3000]) {
    if (delay) await sleep(delay);
    try {
      const { state } = await request<{ state: GameState }>("POST", gamePath(gameId, "/pay/iap"), {
        adminToken,
        body: { transactionId },
      });
      await finish();
      return state;
    } catch (err) {
      if (!(err instanceof CheckoutError)) throw err;
      if (FINAL_STATUSES.has(err.status)) {
        await finish();
        throw err;
      }
      last = err;
      // Not the host, not found: that won't change in a few seconds.
      if (err.status >= 400 && err.status < 500) break;
    }
  }
  // Left unfinished on purpose: the next tap, resume or launch confirms it (it's never bought again).
  throw new UnconfirmedPurchaseError(UNCONFIRMED, last?.status ?? 0);
}

/**
 * Confirms the purchases among `transactions` that nothing else is handling:
 * board host fees (returns the boards they paid for) and Host Pass
 * transactions (a purchase that landed later, or a renewal; `onPass` hears the
 * pass's new state).
 */
async function redeemBoardPurchases(
  store: NativePurchasesPlugin,
  transactions: Transaction[],
  adminTokenFor: (gameId: string) => string | null,
  onUnused?: (message: string) => void,
  onPass?: (state: HostPassState) => void,
): Promise<GameState[]> {
  if (transactions.length === 0) return [];
  const { payments } = await fetchAppConfig();
  const paid: GameState[] = [];
  const passProduct = payments.hostPass?.iapProductId;
  for (const tx of transactions) {
    if (passProduct && tx.productIdentifier === passProduct) {
      if (passRedeeming.has(tx.transactionId) || settled.has(tx.transactionId)) continue;
      await redeemPassTransaction(store, tx).then(onPass, () => {});
      continue;
    }
    const gameId = boardOf(tx, payments.iapProductId);
    if (!gameId || redeeming.has(tx.transactionId) || settled.has(tx.transactionId)) continue;
    try {
      // Sent even without this device's admin token (the board was deleted here): if
      // it's gone on the server too, the purchase is kept there for a refund.
      paid.push(await redeemTransaction(store, gameId, adminTokenFor(gameId) ?? "", tx.transactionId));
    } catch (err) {
      // Still unfinished (tried again next time), or settled; tell the host about a charge that paid for nothing.
      if (err instanceof CheckoutError && err.unused) onUnused?.(err.message);
    }
  }
  return paid;
}

/**
 * Completes App Store purchases that were charged but never confirmed (app killed,
 * offline). Call at launch in the iOS app with a lookup for this device's admin
 * tokens (watchIAPPurchases does, and again on every resume). Returns the boards they
 * paid for; `onUnused` hears about purchases kept without paying for anything.
 */
export async function recoverIAPPurchases(
  adminTokenFor: (gameId: string) => string | null,
  onUnused?: (message: string) => void,
  onPass?: (state: HostPassState) => void,
): Promise<GameState[]> {
  const { Capacitor } = await import("@capacitor/core");
  if (Capacitor.getPlatform() !== "ios") return [];
  const store = await nativePurchases();
  const { transactions } = await store.getUnfinishedTransactions();
  return redeemBoardPurchases(store, transactions, adminTokenFor, onUnused, onPass);
}

export interface IAPWatchOptions {
  adminTokenFor: (gameId: string) => string | null;
  /** A board's host fee this device bought is now confirmed: its host can draw the numbers. */
  onPaid: (state: GameState) => void;
  /** A purchase was kept but paid for nothing (board already paid for, or deleted); the message says what to do. */
  onUnused?: (message: string) => void;
  /** A Host Pass transaction (a purchase that landed later, or a renewal) is confirmed: the identity's pass now. */
  onPass?: (state: HostPassState) => void;
  /** Subscribes to the app returning to the foreground (onAppResume in lib/native). */
  onResume?: (cb: () => void) => () => void;
}

/**
 * Keeps App Store purchases moving while the iOS app runs: confirms what's
 * unfinished now and on every resume, and whatever StoreKit delivers meanwhile (an
 * Ask to Buy approval, a purchase on another device). With autoFinishTransactions
 * off, StoreKit reports those only through `transactionUpdated`. Returns a stop function.
 */
export function watchIAPPurchases(opts: IAPWatchOptions): () => void {
  let stopped = false;
  let listener: PluginListenerHandle | null = null;
  let stopResume: (() => void) | null = null;
  const onUnused = (message: string) => !stopped && opts.onUnused?.(message);
  const report = (paid: GameState[]) => !stopped && paid.forEach((state) => opts.onPaid(state));
  const onPass = (state: HostPassState) => !stopped && opts.onPass?.(state);
  const recover = () =>
    recoverIAPPurchases(opts.adminTokenFor, onUnused, onPass).then(report, (err: unknown) => console.warn("App Store purchase recovery failed", err));

  void (async () => {
    const { Capacitor } = await import("@capacitor/core");
    if (Capacitor.getPlatform() !== "ios" || stopped) return;
    const store = await nativePurchases();
    // Listening first, so nothing delivered during the launch pass is missed (duplicates are skipped).
    const handle = await store.addListener("transactionUpdated", (tx) => {
      // A refund arrives this way too; it pays for nothing (an unfinished one is settled by recovery).
      if (tx.revocationDate) return;
      redeemBoardPurchases(store, [tx], opts.adminTokenFor, onUnused, onPass).then(report, () => {});
    });
    if (stopped) return void handle.remove();
    listener = handle;
    stopResume = opts.onResume?.(() => void recover()) ?? null;
    await recover();
  })().catch((err: unknown) => console.warn("App Store purchase watch failed", err));

  return () => {
    stopped = true;
    void listener?.remove();
    stopResume?.();
  };
}

// ---- Stripe (web) ----

/** The board's PaymentIntent: what to confirm, and the amount it charges (show this, not the config's price). */
export interface StripeIntent {
  clientSecret: string;
  amountCents: number;
  currency: string;
}

/**
 * The board's PaymentIntent (created once, then reused). Throws a CheckoutError
 * with status 409 and `state` set when the board is already paid for.
 */
export function createStripeIntent(gameId: string, adminToken: string | null): Promise<StripeIntent> {
  return request<StripeIntent>("POST", gamePath(gameId, "/pay/stripe"), { adminToken });
}

/**
 * Call after onPaid: resolves with the paid-for board. The webhook usually gets
 * there first; if not, the server checks the intent with Stripe directly. Null if
 * it's still settling after a few seconds (the live board flips when it lands).
 */
export async function confirmStripePaid(gameId: string, adminToken: string | null): Promise<GameState | null> {
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

// Stripe renders in an iframe, so colors are repeated here, per theme (read when the form mounts).
const STRIPE_FONT = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
const APPEARANCE: Record<ResolvedTheme, Appearance> = {
  dark: {
    theme: "night",
    variables: {
      colorPrimary: "#22c55e",
      colorBackground: "#131c30",
      colorText: "#e6edf6",
      colorDanger: "#fb7185",
      borderRadius: "14px",
      fontFamily: STRIPE_FONT,
    },
  },
  // The light theme's tokens (src/index.css): white fields, ink text, the AA volt and red.
  light: {
    theme: "stripe",
    variables: {
      colorPrimary: "#4a6e00",
      colorBackground: "#ffffff",
      colorText: "#0f1a14",
      colorTextSecondary: "#46594d",
      colorDanger: "#c8152a",
      borderRadius: "14px",
      fontFamily: STRIPE_FONT,
    },
  },
};

const appearance = (): Appearance => APPEARANCE[getResolvedTheme()];

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
  /** Apple Pay's recurring payment request, for the Host Pass (Apple shows the yearly billing in the sheet). */
  applePay?: ClickResolveDetails["applePay"];
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

  const elements = stripe.elements({ clientSecret: opts.clientSecret, appearance: appearance() });
  element = elements.create("expressCheckout", {
    business: { name: "JaxSquares" },
    buttonHeight: opts.buttonHeight ?? 52,
    buttonType: { applePay: "plain", googlePay: "plain" },
    // Apple's rule: a white button on a dark sheet, a black one on a light sheet.
    buttonTheme: getResolvedTheme() === "light" ? { applePay: "black", googlePay: "black" } : { applePay: "white", googlePay: "white" },
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
  element.on("click", (e) => e.resolve({ lineItems: [{ name: opts.label, amount: opts.amountCents }], ...(opts.applePay ? { applePay: opts.applePay } : {}) }));
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
  const elements = stripe.elements({ clientSecret: opts.clientSecret, appearance: appearance() });
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

// ---- The Host Pass: buying, confirming, restoring, managing ----
// One yearly subscription that covers the host fee of every board its holder
// hosts. The server activates it only from Stripe's or Apple's own data.

/** This identity's pass and how it's sold here. */
export function fetchPassState(): Promise<HostPassState> {
  return request<HostPassState>("GET", "/payments/pass");
}

/** Test mode: a no-charge pass that lasts a year. */
export function startTestPass(): Promise<HostPassState> {
  return request<HostPassState>("POST", "/payments/pass/test");
}

/** Test mode: ends the test pass (to try buying again). */
export function endTestPass(): Promise<HostPassState> {
  return request<HostPassState>("POST", "/payments/pass/test/end");
}

/**
 * The web pass's first payment, to confirm with Stripe.js. A CheckoutError
 * 409 with `code` ACCOUNT_REQUIRED_CODE means sign in first; a 409 with
 * `pass` set means the identity already has an active one.
 */
export function createPassIntent(): Promise<HostPassIntent> {
  return request<HostPassIntent>("POST", "/payments/pass/stripe");
}

/**
 * Call after Stripe.js reports the payment: the server reads the subscription
 * back from Stripe (the webhook may not have landed yet). Resolves with the
 * pass once it's active, or the last state seen after a few seconds.
 */
export async function confirmPassPaid(): Promise<HostPassState | null> {
  let last: HostPassState | null = null;
  for (const delay of [0, 800, 1600, 3200]) {
    if (delay) await sleep(delay);
    try {
      last = await request<HostPassState>("POST", "/payments/pass/stripe/confirm");
      if (last.pass?.active) return last;
    } catch (err) {
      if (!(err instanceof CheckoutError) || (err.status > 0 && err.status < 500)) throw err;
    }
  }
  return last;
}

/** Manage on the web: a Stripe Customer Portal page (update the card, receipts, cancel). */
export async function passPortalUrl(): Promise<string> {
  return (await request<{ url: string }>("POST", "/payments/pass/portal")).url;
}

/** Apple's subscription management, for when the plugin can't open it. */
export const APPLE_SUBSCRIPTIONS_URL = "https://apps.apple.com/account/subscriptions";

/** Manage in the iOS app: Apple's own subscription management. */
export async function manageAppStoreSubscriptions(): Promise<void> {
  try {
    await (await nativePurchases()).manageSubscriptions();
  } catch {
    window.open(APPLE_SUBSCRIPTIONS_URL, "_blank");
  }
}

export type PassPurchaseOutcome = { status: "active"; state: HostPassState } | { status: "cancelled" } | { status: "pending" };

const PASS_UNCONFIRMED = "Your Host Pass went through but isn't confirmed yet. Open Profile in a moment, or tap Restore purchases. You won't be charged twice.";

/** Pass confirmations in flight, by transaction id. */
const passRedeeming = new Map<string, Promise<HostPassState>>();

function redeemPassTransaction(store: NativePurchasesPlugin, tx: Pick<Transaction, "transactionId" | "jwsRepresentation">): Promise<HostPassState> {
  let p = passRedeeming.get(tx.transactionId);
  if (!p) {
    p = confirmPassTransaction(store, tx).finally(() => passRedeeming.delete(tx.transactionId));
    passRedeeming.set(tx.transactionId, p);
  }
  return p;
}

async function confirmPassTransaction(store: NativePurchasesPlugin, tx: Pick<Transaction, "transactionId" | "jwsRepresentation">): Promise<HostPassState> {
  const finish = async () => {
    settled.add(tx.transactionId);
    await store.finishTransaction({ transactionId: tx.transactionId }).catch(() => {});
  };
  const body: HostPassTransaction = { transactionId: tx.transactionId, ...(tx.jwsRepresentation ? { jws: tx.jwsRepresentation } : {}) };
  let last: CheckoutError | null = null;
  for (const delay of [0, 1000, 3000]) {
    if (delay) await sleep(delay);
    try {
      const state = await request<HostPassState>("POST", "/payments/pass/iap", { body });
      await finish();
      return state;
    } catch (err) {
      if (!(err instanceof CheckoutError)) throw err;
      // Refused for good (not the pass, another app, held elsewhere): finish it, so StoreKit stops offering it.
      if (err.status === 400 || err.status === 409) {
        await finish();
        throw err;
      }
      last = err;
      if (err.status >= 400 && err.status < 500) break;
    }
  }
  throw new UnconfirmedPurchaseError(PASS_UNCONFIRMED, last?.status ?? 0);
}

/**
 * iOS: buys the yearly Host Pass in the App Store sheet (the App Store shows
 * its own price and terms), has the server verify it with Apple, then
 * finishes the transaction. No sign-in needed: Apple keeps the subscription,
 * and Restore purchases brings it back.
 */
export async function buyPassWithIAP(productId?: string): Promise<PassPurchaseOutcome> {
  const [store, productIdentifier] = await Promise.all([nativePurchases(), productId ?? fetchAppConfig().then((c) => c.payments.hostPass?.iapProductId ?? "")]);
  if (!productIdentifier) throw new CheckoutError("The Host Pass isn't available right now.", 0);
  let tx: Transaction;
  try {
    tx = await store.purchaseProduct({ productIdentifier, quantity: 1, autoAcknowledgePurchases: false });
  } catch (err) {
    const msg = errorMessage(err);
    if (/cancel/i.test(msg)) return { status: "cancelled" };
    if (/pending/i.test(msg)) return { status: "pending" };
    throw new CheckoutError(msg || "The App Store couldn't complete the purchase", 0);
  }
  return { status: "active", state: await redeemPassTransaction(store, tx) };
}

/**
 * iOS "Restore purchases" (App Store guideline 3.1.1): syncs with the App
 * Store, then sends this Apple ID's current Host Pass transactions (with
 * StoreKit's signed copy of each) for the server to verify and attach to
 * this identity. `restored` is how many it attached.
 */
export async function restorePassPurchases(productId?: string): Promise<HostPassState & { restored: number }> {
  const [store, productIdentifier] = await Promise.all([nativePurchases(), productId ?? fetchAppConfig().then((c) => c.payments.hostPass?.iapProductId ?? "")]);
  await store.restorePurchases().catch(() => {});
  let purchases: Transaction[] = [];
  try {
    ({ purchases } = await store.getPurchases({ onlyCurrentEntitlements: true }));
  } catch {
    throw new CheckoutError("The App Store isn't ready yet. Try again in a moment.", 0);
  }
  const transactions: HostPassTransaction[] = purchases
    .filter((p) => p.productIdentifier === productIdentifier && !p.revocationDate)
    .map((p) => ({ transactionId: p.transactionId, ...(p.jwsRepresentation ? { jws: p.jwsRepresentation } : {}) }));
  return request<HostPassState & { restored: number }>("POST", "/payments/pass/iap/restore", { body: { transactions } });
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
