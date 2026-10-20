// Big-screen plumbing for TV mode: keep the screen awake, go full screen, hide
// the toolbar (and the cursor) when nobody's touching anything, and a theme of
// its own (dark unless picked otherwise on that screen) that never changes the
// device's Appearance choice.

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type MutableRefObject } from "react";
import { applyTheme, getResolvedTheme, subscribeTheme, type ResolvedTheme } from "../../lib/theme";

// ---- Screen Wake Lock ----

interface WakeLockSentinelLike {
  released: boolean;
  release(): Promise<void>;
  addEventListener?(type: "release", cb: () => void): void;
}
interface WakeLockLike {
  request(type: "screen"): Promise<WakeLockSentinelLike>;
}

function wakeLockApi(): WakeLockLike | null {
  if (typeof navigator === "undefined") return null;
  const wl = (navigator as Navigator & { wakeLock?: WakeLockLike }).wakeLock;
  return wl && typeof wl.request === "function" ? wl : null;
}

/**
 * Keeps the screen on while mounted, where the Screen Wake Lock API exists.
 * The browser drops the lock whenever the page is hidden, so it's taken again
 * each time the page comes back. Returns whether a lock is held.
 */
export function useWakeLock(enabled = true): boolean {
  const [held, setHeld] = useState(false);
  useEffect(() => {
    const api = wakeLockApi();
    if (!enabled || !api) return;
    let alive = true;
    let sentinel: WakeLockSentinelLike | null = null;
    const acquire = async () => {
      if (!alive || document.visibilityState !== "visible" || (sentinel && !sentinel.released)) return;
      try {
        const s = await api.request("screen");
        if (!alive) {
          void s.release().catch(() => undefined);
          return;
        }
        sentinel = s;
        setHeld(true);
        s.addEventListener?.("release", () => {
          if (alive) setHeld(false);
        });
      } catch {
        // Battery saver, an iframe without permission, or not visible yet: try again on the next show.
        if (alive) setHeld(false);
      }
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void acquire();
    };
    void acquire();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", onVisible);
      if (sentinel && !sentinel.released) void sentinel.release().catch(() => undefined);
      sentinel = null;
    };
  }, [enabled]);
  return held;
}

// ---- Fullscreen ----

export function fullscreenSupported(): boolean {
  return typeof document !== "undefined" && !!document.fullscreenEnabled && typeof document.documentElement.requestFullscreen === "function";
}

/** Full screen on the whole page (the TV view fills it). `supported` is false on iPhone and in most WebViews. */
export function useFullscreen(): { supported: boolean; active: boolean; toggle: () => void } {
  const [active, setActive] = useState(() => typeof document !== "undefined" && !!document.fullscreenElement);
  useEffect(() => {
    const onChange = () => setActive(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);
  const toggle = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen?.().catch(() => undefined);
    else void document.documentElement.requestFullscreen?.({ navigationUI: "hide" }).catch(() => undefined);
  }, []);
  // On the way out (Exit), leave full screen too.
  useEffect(
    () => () => {
      if (typeof document !== "undefined" && document.fullscreenElement) void document.exitFullscreen?.().catch(() => undefined);
    },
    [],
  );
  return { supported: fullscreenSupported(), active, toggle };
}

// ---- Auto-hiding chrome ----

/** How long the toolbar stays after the last touch, click, mouse move or key press. */
export const IDLE_MS = 3500;

/**
 * True while someone is using the screen: any pointer move, tap or key
 * (a TV remote's arrows and OK send keys) shows the toolbar, and it hides
 * again after `ms` of nothing. Focus inside `keepRef` (a toolbar button
 * picked with the remote) keeps it up. Never hover-only.
 */
export function useAwake<T extends HTMLElement>(ms = IDLE_MS): { awake: boolean; keepRef: MutableRefObject<T | null>; wake: () => void } {
  const [awake, setAwake] = useState(true);
  const keepRef = useRef<T | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wake = useCallback(() => {
    setAwake(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (keepRef.current?.contains(document.activeElement)) return;
      setAwake(false);
    }, ms);
  }, [ms]);
  useEffect(() => {
    wake();
    const events = ["pointermove", "pointerdown", "keydown", "wheel", "touchstart"] as const;
    for (const e of events) window.addEventListener(e, wake, { passive: true });
    return () => {
      for (const e of events) window.removeEventListener(e, wake);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [wake]);
  return { awake, keepRef, wake };
}

// ---- The TV's own theme ----

export const TV_THEME_KEY = "jaxsquares.tvTheme";

function readTvTheme(): ResolvedTheme {
  try {
    return localStorage.getItem(TV_THEME_KEY) === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

let tvTheme: ResolvedTheme | null = null;
const tvListeners = new Set<() => void>();
const getTvTheme = (): ResolvedTheme => (tvTheme ??= readTvTheme());
const subscribeTv = (cb: () => void) => {
  tvListeners.add(cb);
  return () => tvListeners.delete(cb);
};

/** Dark or light on this screen's TV view (saved on the device, separately from Appearance). */
export function setTvTheme(next: ResolvedTheme): void {
  tvTheme = next;
  try {
    localStorage.setItem(TV_THEME_KEY, next);
  } catch {
    // Private mode: it still applies until the page closes.
  }
  for (const l of tvListeners) l();
}

/**
 * TV mode's theme, on <html data-theme> while mounted: dark by default (a
 * dim room, a bright TV), light when picked on this screen. Anything that
 * re-applies the device's own theme meanwhile (the OS flipping at sunset,
 * another tab) is put back; on the way out the device's theme returns.
 */
export function useTvTheme(): ResolvedTheme {
  const theme = useSyncExternalStore(subscribeTv, getTvTheme, () => "dark" as const);
  useEffect(() => {
    applyTheme(theme);
    return subscribeTheme(() => applyTheme(theme));
  }, [theme]);
  useEffect(() => () => applyTheme(getResolvedTheme()), []);
  return theme;
}
