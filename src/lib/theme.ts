// Appearance: whatever the phone is set to (the default), or always the dark
// "game night" look, or always the light "day game" look. Set in Profile, and
// flipped between light and dark from a board's top bar.
//
// The preference is a per-device setting like the profile: localStorage for
// synchronous reads (the pre-paint script in index.html reads the same key),
// mirrored to Capacitor Preferences in the native app because iOS may evict a
// WebView's localStorage. The resolved theme lands on <html data-theme> (the
// light palette in src/index.css keys off it), the color-scheme and
// theme-color metas, and the native status bar.

import { useSyncExternalStore } from "react";
import { getStored, setStatusBarTheme, setStored } from "./native";

export type ThemePreference = "dark" | "light" | "system";
export type ResolvedTheme = "dark" | "light";

export const THEME_STORAGE_KEY = "jaxsquares.theme";
export const DEFAULT_THEME_PREFERENCE: ThemePreference = "system";

/**
 * Each theme's canvas (--color-canvas in src/index.css): the browser chrome
 * (theme-color) and the background painted before the CSS arrives. index.html
 * repeats these for its pre-paint script; theme.test.ts keeps them in sync.
 */
export const THEME_COLORS: Readonly<Record<ResolvedTheme, string>> = { dark: "#060c09", light: "#eef2ec" };

const LIGHT_QUERY = "(prefers-color-scheme: light)";
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
/** A little longer than the CSS fade (260ms) so it finishes before the class goes. */
const SWITCH_MS = 320;

export function parseThemePreference(raw: unknown): ThemePreference {
  return raw === "dark" || raw === "light" || raw === "system" ? raw : DEFAULT_THEME_PREFERENCE;
}

/** "system" follows the OS; a phone with no preference (or a dark one) gets the dark look. */
export function resolveTheme(preference: ThemePreference, systemPrefersLight: boolean): ResolvedTheme {
  if (preference === "system") return systemPrefersLight ? "light" : "dark";
  return preference;
}

// ---- Environment (every access guarded: SSR-free, but tests and old WebViews vary) ----

function media(query: string): MediaQueryList | null {
  try {
    return typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia(query) : null;
  } catch {
    return null;
  }
}

function systemPrefersLight(): boolean {
  return media(LIGHT_QUERY)?.matches ?? false;
}

function readLocal(): string | null {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeLocal(value: string): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, value);
  } catch {
    // Private mode: the choice still applies for this session.
  }
}

// ---- State ----

let preference: ThemePreference = parseThemePreference(readLocal());
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

export function subscribeTheme(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getThemePreference(): ThemePreference {
  return preference;
}

export function getResolvedTheme(): ResolvedTheme {
  return resolveTheme(preference, systemPrefersLight());
}

// ---- Applying ----

function setMeta(name: string, content: string): void {
  let el = document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.name = name;
    document.head.appendChild(el);
  }
  if (el.content !== content) el.content = content;
}

/** Puts `theme` on the page: <html data-theme>, the color-scheme and theme-color metas, the native status bar. */
export function applyTheme(theme: ResolvedTheme): void {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.theme = theme;
  setMeta("color-scheme", theme);
  setMeta("theme-color", THEME_COLORS[theme]);
  void setStatusBarTheme(theme);
}

/** A user-initiated switch: a short crossfade, or instant with reduced motion. */
function applyWithTransition(theme: ResolvedTheme): void {
  if (typeof document === "undefined") return;
  if (document.documentElement.dataset.theme === theme) return applyTheme(theme);
  if (media(REDUCED_MOTION_QUERY)?.matches) return applyTheme(theme);
  const doc = document as Document & { startViewTransition?: (update: () => void) => unknown };
  if (typeof doc.startViewTransition === "function") {
    try {
      doc.startViewTransition(() => applyTheme(theme));
      return;
    } catch {
      // fall through to the CSS fade
    }
  }
  const root = document.documentElement;
  root.classList.add("theme-switching");
  applyTheme(theme);
  window.setTimeout(() => root.classList.remove("theme-switching"), SWITCH_MS);
}

/** Profile's Appearance control: save on this device (and the native store), switch now. */
export function setThemePreference(next: ThemePreference): void {
  const value = parseThemePreference(next);
  preference = value;
  writeLocal(value);
  void setStored(THEME_STORAGE_KEY, value).catch(() => {});
  applyWithTransition(getResolvedTheme());
  emit();
}

export interface ThemeStore {
  getStored(key: string): Promise<string | null>;
}

/**
 * Native app: adopt the choice kept in Capacitor Preferences when the
 * WebView's localStorage lost it (or never had it). On the web this just
 * re-reads localStorage.
 */
export async function hydrateTheme(store: ThemeStore = { getStored }): Promise<void> {
  const stored = await store.getStored(THEME_STORAGE_KEY);
  if (stored === null) return;
  const next = parseThemePreference(stored);
  if (next === preference) return;
  preference = next;
  writeLocal(next);
  applyTheme(getResolvedTheme());
  emit();
}

/**
 * Startup (before the first render): syncs the page with the stored choice (the
 * pre-paint script already set data-theme), follows the OS live while the
 * choice is "system", follows other tabs, and restores the choice from the
 * native store. Returns a cleanup function.
 */
export function initTheme(): () => void {
  preference = parseThemePreference(readLocal());
  applyTheme(getResolvedTheme());

  const query = media(LIGHT_QUERY);
  const onSystemChange = () => {
    if (preference !== "system") return;
    applyTheme(getResolvedTheme());
    emit();
  };
  query?.addEventListener?.("change", onSystemChange);

  const onStorage = (e: StorageEvent) => {
    if (e.key !== THEME_STORAGE_KEY && e.key !== null) return;
    const next = parseThemePreference(readLocal());
    if (next === preference) return;
    preference = next;
    applyTheme(getResolvedTheme());
    emit();
  };
  window.addEventListener("storage", onStorage);

  void hydrateTheme().catch(() => {});

  return () => {
    query?.removeEventListener?.("change", onSystemChange);
    window.removeEventListener("storage", onStorage);
  };
}

// ---- React bindings ----

/** The saved choice: "dark", "light" or "system". */
export function useThemePreference(): ThemePreference {
  return useSyncExternalStore(subscribeTheme, getThemePreference, () => DEFAULT_THEME_PREFERENCE);
}

/** The theme on screen right now ("system" resolved), for colors computed in JS (team colors). */
export function useResolvedTheme(): ResolvedTheme {
  return useSyncExternalStore(subscribeTheme, getResolvedTheme, () => resolveTheme(DEFAULT_THEME_PREFERENCE, false));
}
