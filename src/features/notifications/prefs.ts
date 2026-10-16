// "Never nag": remembers when someone waved off the notifications ask, per
// trigger, so the same contextual ask doesn't come back. A tap on a bell or a
// "turn on" button is an explicit request and always opens it.

export type AskTrigger = "claimed" | "created" | "joined";

const KEY = (trigger: AskTrigger) => `jaxsquares.notifyAsk.${trigger}`;
/** A sheet opened this soon after a tap was opened by that tap (the bell), not by a timer. */
const TAP_WINDOW_MS = 700;

export function wasAskDismissed(trigger: AskTrigger): boolean {
  try {
    return localStorage.getItem(KEY(trigger)) !== null;
  } catch {
    return false;
  }
}

export function rememberAskDismissed(trigger: AskTrigger, now = Date.now()): void {
  try {
    localStorage.setItem(KEY(trigger), String(now));
  } catch {
    // storage unavailable: worst case we ask once more next session
  }
}

/** Notifications are on: the asks are moot, so start fresh if they're ever turned off. */
export function clearAskDismissals(): void {
  for (const t of ["claimed", "created", "joined"] as const) {
    try {
      localStorage.removeItem(KEY(t));
    } catch {
      // ignore
    }
  }
}

// ---- Was this opened by a tap? ----

let lastTapAt = Number.NEGATIVE_INFINITY;

export function noteTap(now = Date.now()): void {
  lastTapAt = now;
}

export function openedByTap(now = Date.now()): boolean {
  return now - lastTapAt <= TAP_WINDOW_MS;
}

if (typeof document !== "undefined") {
  // Capture phase so we see the tap before the handler that opens the sheet runs.
  document.addEventListener("click", () => noteTap(), true);
}

/** Auto-asks respect earlier dismissals; explicit taps always open. */
export function shouldShowAsk(trigger: AskTrigger, explicit: boolean): boolean {
  return explicit || !wasAskDismissed(trigger);
}
