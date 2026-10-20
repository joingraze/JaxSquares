// Fixed chrome along the bottom of the screen (the tab dock, an ActionBar, an
// open sheet's footer) registers how far its top edge sits above the bottom of
// the viewport, as a CSS length. Toasts read the highest one so they always
// land just above whatever is there, never over the top bar or the scoreboard.
//
// A plain module store (not context): the ToastProvider sits above the router
// and the shell, so it can't see the shell's context.

import { useEffect, useId, useSyncExternalStore } from "react";

interface Entry {
  /** CSS length from the bottom of the viewport to this chrome's top edge. */
  offset: string;
  /** A modal surface (an open sheet): while one is up, only modal entries count. */
  modal: boolean;
}

/** With nothing at the bottom, toasts still clear the home indicator. */
export const BOTTOM_CHROME_BASE = "max(var(--safe-bottom), 0.75rem)";

const entries = new Map<string, Entry>();
const listeners = new Set<() => void>();
let snapshot = BOTTOM_CHROME_BASE;

function recompute(): void {
  const all = [...entries.values()];
  const modal = all.filter((e) => e.modal);
  const offsets = (modal.length ? modal : all).map((e) => e.offset);
  const next = offsets.length ? `max(${[BOTTOM_CHROME_BASE, ...offsets].join(", ")})` : BOTTOM_CHROME_BASE;
  if (next === snapshot) return;
  snapshot = next;
  for (const l of listeners) l();
}

/** Register (or with null, remove) one piece of bottom chrome. */
export function setBottomChrome(key: string, entry: Entry | null): void {
  const cur = entries.get(key);
  if (entry) {
    if (cur && cur.offset === entry.offset && cur.modal === entry.modal) return;
    entries.set(key, entry);
  } else {
    if (!cur) return;
    entries.delete(key);
  }
  recompute();
}

/** The CSS length toasts should sit above (always at least the safe-area base). */
export function getBottomChromeOffset(): string {
  return snapshot;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useBottomChromeOffset(): string {
  return useSyncExternalStore(subscribe, getBottomChromeOffset, getBottomChromeOffset);
}

/** Keep this component's bottom chrome registered while mounted; null = nothing on screen right now. */
export function useBottomChrome(offset: string | null, modal = false): void {
  const key = useId();
  useEffect(() => {
    setBottomChrome(key, offset ? { offset, modal } : null);
  }, [key, offset, modal]);
  useEffect(() => () => setBottomChrome(key, null), [key]);
}
