// Capacitor bridges with web fallbacks. Every export works in a plain browser,
// so callers never branch on platform themselves.

import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";
import { Preferences } from "@capacitor/preferences";
import { Share } from "@capacitor/share";
import { SplashScreen } from "@capacitor/splash-screen";
import { StatusBar, Style } from "@capacitor/status-bar";

export type Platform = "ios" | "android" | "web";
export type HapticKind = "light" | "medium" | "heavy" | "success" | "warning" | "error" | "selection";
export type ShareOutcome = "shared" | "copied" | "cancelled";

/** Hosts whose links open in the app (universal links / Android app links). */
const APP_HOSTS = new Set(["jaxsquares.com", "www.jaxsquares.com"]);
const APP_SCHEME = "jaxsquares:";

export const isNative = (): boolean => Capacitor.isNativePlatform();

export function platform(): Platform {
  const p = Capacitor.getPlatform();
  return p === "ios" || p === "android" ? p : "web";
}

// ---- Share ----

/**
 * Opens the share sheet (native app, or a phone browser with Web Share) and
 * falls back to copying the link. Desktop browsers copy straight away: a link
 * in the clipboard is what people expect there.
 */
export async function shareLink(opts: { title: string; text: string; url: string }): Promise<ShareOutcome> {
  if (isNative()) {
    try {
      await Share.share({ title: opts.title, text: opts.text, url: opts.url, dialogTitle: opts.title });
      return "shared";
    } catch (err) {
      if (isCancel(err)) return "cancelled";
      return copyText(opts.url);
    }
  }
  if (canWebShare(opts)) {
    try {
      await navigator.share(opts);
      return "shared";
    } catch (err) {
      if (isCancel(err)) return "cancelled";
      // NotAllowedError (no user gesture) or a failed target: fall back to copying.
    }
  }
  return copyText(opts.url);
}

/** The native share sheet with text only (a players list in the iOS app). Throws when it's canceled or unavailable. */
export async function shareTextNative(opts: { title: string; text: string }): Promise<void> {
  await Share.share({ title: opts.title, text: opts.text, dialogTitle: opts.title });
}

function canWebShare(data: ShareData): boolean {
  if (typeof navigator.share !== "function") return false;
  if (typeof navigator.canShare === "function" && !navigator.canShare(data)) return false;
  return typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
}

function isCancel(err: unknown): boolean {
  if (err instanceof DOMException && err.name === "AbortError") return true;
  const message = err instanceof Error ? err.message : String(err);
  return /cancel/i.test(message);
}

/** Copies text to the clipboard; the textarea path covers older iOS WebViews without the async API. */
export async function copyText(text: string): Promise<ShareOutcome> {
  try {
    await navigator.clipboard.writeText(text);
    return "copied";
  } catch {
    // fall through
  }
  try {
    const el = document.createElement("textarea");
    el.value = text;
    el.setAttribute("readonly", "");
    el.style.position = "fixed";
    el.style.opacity = "0";
    document.body.appendChild(el);
    el.select();
    el.setSelectionRange(0, text.length);
    const ok = document.execCommand("copy");
    el.remove();
    return ok ? "copied" : "cancelled";
  } catch {
    return "cancelled";
  }
}

// ---- Haptics ----

/**
 * Web vibration is limited to moments worth feeling (a win, an error). Buzzing
 * an Android phone on every tap feels broken; iOS Safari has no vibration API.
 */
const WEB_VIBRATION: Partial<Record<HapticKind, number | number[]>> = {
  heavy: 18,
  success: [12, 60, 18],
  warning: [24, 50, 24],
  error: [30, 40, 30, 40, 30],
};

export async function haptic(kind: HapticKind = "light"): Promise<void> {
  try {
    if (!isNative()) {
      const pattern = WEB_VIBRATION[kind];
      if (pattern !== undefined && typeof navigator.vibrate === "function") navigator.vibrate(pattern);
      return;
    }
    switch (kind) {
      case "light":
        return await Haptics.impact({ style: ImpactStyle.Light });
      case "medium":
        return await Haptics.impact({ style: ImpactStyle.Medium });
      case "heavy":
        return await Haptics.impact({ style: ImpactStyle.Heavy });
      case "success":
        return await Haptics.notification({ type: NotificationType.Success });
      case "warning":
        return await Haptics.notification({ type: NotificationType.Warning });
      case "error":
        return await Haptics.notification({ type: NotificationType.Error });
      case "selection":
        await Haptics.selectionStart();
        await Haptics.selectionChanged();
        return await Haptics.selectionEnd();
    }
  } catch {
    // Haptics are garnish; never let them break a tap handler.
  }
}

// ---- App lifecycle ----

/**
 * Turns an opened URL into an in-app path, or null when it isn't ours:
 *   https://jaxsquares.com/g/abc?x=1 -> /g/abc?x=1
 *   jaxsquares://g/abc               -> /g/abc
 */
export function pathFromAppUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  let path: string;
  if (url.protocol === APP_SCHEME) {
    // jaxsquares://g/abc parses "g" as the host; jaxsquares:///g/abc has none.
    path = `/${url.host}${url.pathname}`.replace(/\/{2,}/g, "/");
  } else if ((url.protocol === "https:" || url.protocol === "http:") && APP_HOSTS.has(url.hostname)) {
    path = url.pathname || "/";
  } else {
    return null;
  }
  if (path.length > 1) path = path.replace(/\/+$/, "");
  return `${path}${url.search}${url.hash}`;
}

let started = false;

/**
 * Status bar text that reads on the theme's canvas: light text over the dark
 * theme, dark text over the light one. No-op on the web (theme-color covers it).
 */
export async function setStatusBarTheme(theme: "dark" | "light"): Promise<void> {
  if (!isNative()) return;
  try {
    await StatusBar.setStyle({ style: theme === "light" ? Style.Light : Style.Dark });
  } catch {
    // cosmetic
  }
}

/**
 * Native app start-up: status bar text for the current theme, hide the launch
 * screen once the first frame has painted, and route universal links /
 * jaxsquares:// links into the SPA. Call once after the first render. Returns a
 * cleanup function.
 */
export function initNative(opts: { navigate: (path: string) => void }): () => void {
  if (!isNative() || started) return () => {};
  started = true;
  const handles: Promise<{ remove: () => Promise<void> }>[] = [];

  // The theme is on <html> before first paint (index.html); theme.ts keeps the bar in step after that.
  void setStatusBarTheme(document.documentElement.dataset.theme === "light" ? "light" : "dark");
  if (platform() === "android") StatusBar.setOverlaysWebView({ overlay: true }).catch(() => {});

  // Two frames: React has committed and the browser has painted it.
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      SplashScreen.hide({ fadeOutDuration: 200 }).catch(() => {});
    }),
  );

  // Retained by the plugin until a listener attaches, so a cold start from a link still routes.
  handles.push(
    App.addListener("appUrlOpen", ({ url }) => {
      const path = pathFromAppUrl(url);
      if (path) opts.navigate(path);
    }),
  );

  return () => {
    started = false;
    for (const h of handles) h.then((l) => l.remove()).catch(() => {});
  };
}

/**
 * Runs `cb` when the app comes back to the foreground (native resume, or the
 * tab becoming visible on the web), e.g. to resync a live board. Returns an unsubscribe.
 */
export function onAppResume(cb: () => void): () => void {
  if (isNative()) {
    const handle = App.addListener("resume", cb);
    return () => {
      handle.then((h) => h.remove()).catch(() => {});
    };
  }
  const onVisible = () => {
    if (document.visibilityState === "visible") cb();
  };
  document.addEventListener("visibilitychange", onVisible);
  return () => document.removeEventListener("visibilitychange", onVisible);
}

// ---- Persistent storage ----
// iOS may clear a WebView's localStorage under storage pressure, so the native
// app keeps values in Capacitor Preferences (UserDefaults / SharedPreferences)
// and mirrors them to localStorage for code that reads synchronously.

const memory = new Map<string, string>();

function localGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return memory.get(key) ?? null;
  }
}

function localSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    memory.set(key, value);
  }
}

function localRemove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
  memory.delete(key);
}

export async function getStored(key: string): Promise<string | null> {
  if (!isNative()) return localGet(key);
  try {
    const { value } = await Preferences.get({ key });
    if (value !== null) {
      if (localGet(key) !== value) localSet(key, value);
      return value;
    }
    // Written before the native store existed (or by sync code): adopt it so it survives.
    const legacy = localGet(key);
    if (legacy !== null) await Preferences.set({ key, value: legacy });
    return legacy;
  } catch {
    return localGet(key);
  }
}

export async function setStored(key: string, value: string): Promise<void> {
  localSet(key, value);
  if (!isNative()) return;
  try {
    await Preferences.set({ key, value });
  } catch {
    // localStorage copy still holds it for this session.
  }
}

export async function removeStored(key: string): Promise<void> {
  localRemove(key);
  if (!isNative()) return;
  try {
    await Preferences.remove({ key });
  } catch {
    // ignore
  }
}
