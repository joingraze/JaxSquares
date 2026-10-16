// Some events arrive as pairs from one update: a linked board's kickoff also
// draws numbers, and the last period's winner lands with "final". Sending both
// would buzz every phone twice at the biggest moments, so the first event's
// copy covers both (see copy.ts) and the second is dropped.
//
// Siblings are dispatched together (notifyAll in worker/service.ts), so a mark
// taken synchronously when the first starts is visible to the second. A mark
// only lives a few seconds and per isolate, which is all a sibling needs.

import type { NotifyEvent } from "./types";

export const SIBLING_WINDOW_MS = 15_000;

const marks = new Map<string, number>();

function prune(now: number): void {
  for (const [k, at] of marks) if (now - at > SIBLING_WINDOW_MS) marks.delete(k);
}

/** True when `event` is already covered by a sibling sent moments ago. Call before any await. */
export function coveredBySibling(gameId: string, event: NotifyEvent, now = Date.now()): boolean {
  prune(now);
  const mark = (k: string) => marks.set(`${gameId}:${k}`, now);
  const seen = (k: string) => marks.has(`${gameId}:${k}`);
  switch (event.kind) {
    case "game-starting":
      mark("kickoff");
      return false;
    case "numbers-drawn":
      return seen("kickoff");
    case "winner":
      if (event.periodKey === "final") mark("final-winner");
      return false;
    case "final":
      return seen("final-winner");
    default:
      return false;
  }
}

export function resetSiblings(): void {
  marks.clear();
}
