// Push notifications on this device.
//
// Web (incl. iOS 16.4+ home-screen web apps): service worker + Push API, keyed
// by the VAPID public key from /api/config. Native (Capacitor iOS/Android): FCM
// via @capacitor-firebase/messaging. Either way the device is registered with
// POST /api/push/register under this device's clientId.
//
// Startup: call initPush() once (safe on every load). In UI code:
//   getPushState()        -> what to show ("needs-install" = iOS Safari tab: show "Add to Home Screen")
//   enablePush()          -> from a tap; asks permission and registers
//   onNotificationTap(cb) -> route to the tapped notification's in-app URL

import { Capacitor } from "@capacitor/core";
import type { PushRegistration } from "../../shared/types";
import { getClientId } from "./identity";

export type PushState =
  | "unsupported" // no push here (old browser, push not configured on the server)
  | "needs-install" // iOS/iPadOS browser tab: push only works once added to the Home Screen
  | "default" // can ask
  | "granted" // on; this device is (being) registered
  | "denied"; // blocked in system/browser settings

export interface ForegroundPush {
  title: string;
  body: string;
  url: string;
}

const API_BASE: string = import.meta.env.VITE_API_BASE ?? "";
const MUTED_KEY = (gameId: string) => `jaxsquares.muted.${gameId}`;
/** Must match the channel ids in worker/push/fcm.ts. */
const ANDROID_CHANNEL_ID = "game-updates";
const ANDROID_QUIET_CHANNEL_ID = "board-activity";
/** Re-registering also resets the server's badge count, so do it on every open, but not on every tab flick. */
const SYNC_INTERVAL_MS = 60 * 1000;
const SW_READY_TIMEOUT_MS = 10 * 1000;
/** A tap nobody claims (no onNotificationTap listener yet) falls back to a full navigation. */
const UNCLAIMED_TAP_MS = 2000;

const isNative = () => Capacitor.isNativePlatform();

let lastSync = 0;
let syncing: Promise<void> | null = null;

// ---- API ----

async function call(method: "GET" | "POST", path: string, body?: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(`${API_BASE}/api${path}`, {
    method,
    headers: { "x-client-id": getClientId(), ...(body === undefined ? {} : { "content-type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : `Request failed (${res.status})`);
  return data;
}

const register = (reg: PushRegistration) => call("POST", "/push/register", reg);

// ---- Environment ----

function iosVersion(ua: string): number | null {
  const m = /OS (\d+)_(\d+)/.exec(ua);
  return m ? Number(m[1]) + Number(m[2]) / 100 : null;
}

function isIos(): boolean {
  const ua = navigator.userAgent;
  // iPadOS reports itself as a Mac; touch support gives it away.
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

function isStandalone(): boolean {
  return (navigator as Navigator & { standalone?: boolean }).standalone === true || matchMedia("(display-mode: standalone)").matches;
}

function webPushSupported(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

/** Why web push isn't available here. */
function webUnavailable(): PushState {
  if (!isIos() || isStandalone()) return "unsupported";
  const v = iosVersion(navigator.userAgent);
  // Home-screen web apps got push in iOS 16.4; iPadOS-as-Mac has no version in its UA.
  return v !== null && v < 16.04 ? "unsupported" : "needs-install";
}

// ---- Server config (VAPID key) ----

let vapidKey: string | null | undefined; // undefined = not fetched yet
let vapidLoading: Promise<string | null> | null = null;

function loadVapidKey(): Promise<string | null> {
  if (vapidKey !== undefined) return Promise.resolve(vapidKey);
  vapidLoading ??= call("GET", "/config")
    .then((cfg) => {
      vapidKey = typeof cfg.vapidPublicKey === "string" && cfg.vapidPublicKey ? cfg.vapidPublicKey : null;
      return vapidKey;
    })
    .catch(() => null) // offline: don't remember, try again next time
    .finally(() => {
      vapidLoading = null;
    });
  return vapidLoading;
}

function base64UrlToBytes(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/").replace(/=+$/, ""));
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function sameKey(a: ArrayBuffer | null, b: Uint8Array): boolean {
  if (!a || a.byteLength !== b.length) return false;
  const x = new Uint8Array(a);
  return x.every((v, i) => v === b[i]);
}

// ---- Taps and foreground pushes ----

const tapListeners = new Set<(url: string) => void>();
const foregroundListeners = new Set<(push: ForegroundPush) => void>();
let pendingTap: string | null = null;
let pendingTimer: ReturnType<typeof setTimeout> | undefined;

/** Our own in-app path for a tapped notification, or null for anything else. */
function appPath(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw) return null;
  // Paths are taken as-is: the native WebView's capacitor:// origin doesn't survive URL parsing.
  if (/^\/(?![/\\])/.test(raw)) return raw;
  try {
    const url = new URL(raw);
    const ours = /^https?:$/.test(url.protocol) && (url.origin === location.origin || (!!API_BASE && url.origin === new URL(API_BASE).origin));
    return ours ? `${url.pathname}${url.search}${url.hash}` : null;
  } catch {
    return null;
  }
}

function emitTap(raw: unknown): void {
  const path = appPath(raw);
  if (!path) return;
  if (tapListeners.size > 0) {
    for (const cb of tapListeners) cb(path);
    return;
  }
  // Cold start: the app may not have mounted its router yet.
  pendingTap = path;
  clearTimeout(pendingTimer);
  pendingTimer = setTimeout(() => {
    if (pendingTap) location.assign(pendingTap);
    pendingTap = null;
  }, UNCLAIMED_TAP_MS);
}

/** Called with the in-app path (e.g. "/g/abc123") when the user taps a notification. Returns an unsubscribe. */
export function onNotificationTap(cb: (url: string) => void): () => void {
  tapListeners.add(cb);
  if (isNative()) void ensureNativeListeners();
  if (pendingTap) {
    const path = pendingTap;
    pendingTap = null;
    clearTimeout(pendingTimer);
    queueMicrotask(() => cb(path));
  }
  return () => {
    tapListeners.delete(cb);
  };
}

/** Called when a push arrives while the app is open (the system banner still shows). Returns an unsubscribe. */
export function onForegroundPush(cb: (push: ForegroundPush) => void): () => void {
  foregroundListeners.add(cb);
  if (isNative()) void ensureNativeListeners();
  return () => {
    foregroundListeners.delete(cb);
  };
}

function emitForeground(p: { title?: unknown; body?: unknown; url?: unknown }): void {
  const push = { title: String(p.title ?? ""), body: String(p.body ?? ""), url: appPath(p.url) ?? "/" };
  for (const cb of foregroundListeners) cb(push);
}

// ---- Native (Capacitor + FCM) ----

type Fm = typeof import("@capacitor-firebase/messaging");
let fm: Promise<Fm> | null = null;
const loadFm = () => (fm ??= import("@capacitor-firebase/messaging"));

let nativeListeners: Promise<void> | null = null;

function ensureNativeListeners(): Promise<void> {
  nativeListeners ??= (async () => {
    const { FirebaseMessaging } = await loadFm();
    const dataOf = (n: { data?: unknown }) => (n.data && typeof n.data === "object" ? (n.data as Record<string, unknown>) : {});
    await FirebaseMessaging.addListener("notificationActionPerformed", (e) => emitTap(dataOf(e.notification).url));
    await FirebaseMessaging.addListener("notificationReceived", (e) =>
      emitForeground({ title: e.notification.title, body: e.notification.body, url: dataOf(e.notification).url }),
    );
    // FCM rotates tokens; keep the server's copy current.
    await FirebaseMessaging.addListener("tokenReceived", async (e) => {
      const { receive } = await FirebaseMessaging.checkPermissions();
      if (receive === "granted") await registerNative(e.token).catch((err) => console.warn("push re-register failed", err));
    });
  })().catch((err) => {
    nativeListeners = null;
    console.warn("push listeners unavailable", err);
  });
  return nativeListeners;
}

function nativeState(receive: string): PushState {
  if (receive === "granted") return "granted";
  if (receive === "denied") return "denied";
  return "default";
}

async function registerNative(token?: string): Promise<void> {
  const mod = await loadFm();
  const platform = Capacitor.getPlatform() === "android" ? "android" : "ios";
  if (platform === "android") {
    // Two channels so people can keep winning squares loud and silence board chatter in Android settings.
    await mod.FirebaseMessaging.createChannel({
      id: ANDROID_CHANNEL_ID,
      name: "Game updates",
      description: "Numbers drawn, kickoffs and winning squares",
      importance: mod.Importance.High,
      visibility: mod.Visibility.Public,
      vibration: true,
    });
    await mod.FirebaseMessaging.createChannel({
      id: ANDROID_QUIET_CHANNEL_ID,
      name: "Board activity",
      description: "Friends joining your boards",
      importance: mod.Importance.Low,
      visibility: mod.Visibility.Public,
      vibration: false,
    });
  }
  const t = token ?? (await mod.FirebaseMessaging.getToken()).token;
  await register({ platform, token: t });
}

async function enableNative(): Promise<PushState> {
  const { FirebaseMessaging } = await loadFm();
  await ensureNativeListeners();
  let { receive } = await FirebaseMessaging.checkPermissions();
  if (receive !== "granted" && receive !== "denied") ({ receive } = await FirebaseMessaging.requestPermissions());
  if (receive !== "granted") return nativeState(receive);
  await registerNative();
  return "granted";
}

// ---- Web (service worker + Push API) ----

let swRegistration: Promise<ServiceWorkerRegistration | null> | null = null;

function onServiceWorkerMessage(event: MessageEvent): void {
  const msg = event.data as { type?: string; url?: unknown; payload?: { title?: unknown; body?: unknown; url?: unknown } } | null;
  if (msg?.type === "jaxsquares:navigate") emitTap(msg.url);
  else if (msg?.type === "jaxsquares:push" && msg.payload) emitForeground(msg.payload);
  else if (msg?.type === "jaxsquares:resubscribe") void syncPush(true);
}

/** Register the service worker (web only; never inside the native app). Safe to call on every load. */
export async function registerServiceWorker(): Promise<void> {
  if (isNative() || !("serviceWorker" in navigator)) return;
  if (!swRegistration) {
    navigator.serviceWorker.addEventListener("message", onServiceWorkerMessage);
    swRegistration = navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((err) => {
      console.warn("service worker registration failed", err);
      swRegistration = null;
      return null;
    });
  }
  await swRegistration;
}

async function readyRegistration(): Promise<ServiceWorkerRegistration> {
  await registerServiceWorker();
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("Service worker didn't start")), SW_READY_TIMEOUT_MS),
  );
  return Promise.race([navigator.serviceWorker.ready, timeout]);
}

async function subscribeWeb(key: string): Promise<void> {
  const reg = await readyRegistration();
  const appKey = base64UrlToBytes(key);
  let sub = await reg.pushManager.getSubscription();
  // The server's VAPID key changed: the old subscription can't receive our pushes.
  if (sub && !sameKey(sub.options.applicationServerKey, appKey)) {
    await sub.unsubscribe().catch(() => false);
    sub = null;
  }
  sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: appKey });
  const json = sub.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) throw new Error("Push subscription is incomplete");
  await register({ platform: "web", subscription: { endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } } });
}

// ---- Public API ----

export async function getPushState(): Promise<PushState> {
  if (isNative()) {
    try {
      const { FirebaseMessaging } = await loadFm();
      return nativeState((await FirebaseMessaging.checkPermissions()).receive);
    } catch {
      return "unsupported";
    }
  }
  if (!webPushSupported()) return webUnavailable();
  if (Notification.permission === "denied") return "denied";
  if (!(await loadVapidKey())) return "unsupported";
  return Notification.permission === "granted" ? "granted" : "default";
}

/**
 * Ask for permission (call straight from a tap) and register this device.
 * Resolves to the resulting state; rejects only if the device couldn't be
 * registered (e.g. offline), in which case permission stays granted and the next
 * app open retries.
 */
export async function enablePush(): Promise<PushState> {
  if (isNative()) return enableNative();
  if (!webPushSupported()) return webUnavailable();
  // Known to be unconfigured: don't prompt for something that can't work.
  if (vapidKey === null) return "unsupported";
  // Prompt before any other await: Safari only honors it within the tap itself.
  const permission = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
  if (permission !== "granted") return permission === "denied" ? "denied" : "default";
  const key = await loadVapidKey();
  if (!key) return "unsupported";
  await subscribeWeb(key);
  lastSync = Date.now();
  return "granted";
}

/** Stop pushes to this device (all games). */
export async function disablePush(): Promise<void> {
  if (isNative()) {
    const { FirebaseMessaging } = await loadFm();
    const { token } = await FirebaseMessaging.getToken();
    await call("POST", "/push/unregister", { token });
    await FirebaseMessaging.deleteToken();
    return;
  }
  if (!("serviceWorker" in navigator)) return;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await call("POST", "/push/unregister", { endpoint: sub.endpoint });
  await sub.unsubscribe();
}

/**
 * If push is already allowed, re-register silently: picks up rotated tokens or
 * subscriptions and tells the server the app was opened (resets the badge count).
 */
export function syncPush(force = false): Promise<void> {
  if (syncing) return syncing;
  if (!force && Date.now() - lastSync < SYNC_INTERVAL_MS) return Promise.resolve();
  syncing = (async () => {
    try {
      if (isNative()) {
        const { FirebaseMessaging } = await loadFm();
        if ((await FirebaseMessaging.checkPermissions()).receive === "granted") await registerNative();
      } else if (webPushSupported() && Notification.permission === "granted") {
        const key = await loadVapidKey();
        if (key) await subscribeWeb(key);
      }
      lastSync = Date.now();
    } catch (err) {
      console.warn("push sync failed", err);
    } finally {
      syncing = null;
    }
  })();
  return syncing;
}

function onAppVisible(): void {
  if (document.visibilityState !== "visible") return;
  if (!isNative()) (navigator as Partial<Pick<Navigator, "clearAppBadge">>).clearAppBadge?.().catch(() => undefined);
  void syncPush();
}

let initialized = false;

/** Startup hook (safe on every load): service worker on web, FCM listeners in the app, silent re-sync. */
export function initPush(): void {
  if (initialized) return;
  initialized = true;
  if (isNative()) void ensureNativeListeners();
  else {
    void registerServiceWorker();
    // Knowing the VAPID key up front lets enablePush skip a pointless prompt when push is off.
    if (webPushSupported()) void loadVapidKey();
  }
  document.addEventListener("visibilitychange", onAppVisible);
  onAppVisible();
}

/** Sends a "you're all set" push to this device. Resolves to how many devices accepted it. */
export async function sendTestPush(): Promise<number> {
  const res = await call("POST", "/push/test", {});
  return typeof res.sent === "number" ? res.sent : 0;
}

// ---- Per-game mute ----

/** Last known mute setting for this game on this device (kept in sync by setGameMuted / refreshGameMuted). */
export function isGameMuted(gameId: string): boolean {
  try {
    return localStorage.getItem(MUTED_KEY(gameId)) === "1";
  } catch {
    return false;
  }
}

function rememberMuted(gameId: string, muted: boolean): void {
  try {
    if (muted) localStorage.setItem(MUTED_KEY(gameId), "1");
    else localStorage.removeItem(MUTED_KEY(gameId));
  } catch {
    // storage unavailable: the server still has it
  }
}

export async function setGameMuted(gameId: string, muted: boolean): Promise<void> {
  await call("POST", `/games/${encodeURIComponent(gameId)}/mute`, { muted });
  rememberMuted(gameId, muted);
}

export async function refreshGameMuted(gameId: string): Promise<boolean> {
  const { muted } = await call("GET", `/games/${encodeURIComponent(gameId)}/mute`);
  rememberMuted(gameId, muted === true);
  return muted === true;
}
