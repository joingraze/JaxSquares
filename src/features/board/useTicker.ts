// State for the board screen's bottom ticker: one note at a time, each
// leaving on its own after ~2 s. Rendered by <Ticker>.
//
// A note with a `key` is a running story (claims piling up, a period's score
// then its winner): a newer note with the same key replaces the one showing
// in place, without sliding in again.

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

export type TickerTone = "neutral" | "success" | "win" | "live" | "social";

export interface TickerNote {
  title: ReactNode;
  detail?: ReactNode;
  /** Replaces the tone glyph (an avatar, an activity glyph). */
  icon?: ReactNode;
  tone?: TickerTone;
  /** ms on screen. */
  duration?: number;
  /** Same key as the note showing: update it in place instead of sliding in a new one. */
  key?: string;
  /** Tapping the note does this (and dismisses it); without it a tap just dismisses. */
  onTap?: () => void;
}

export interface TickerApi {
  show(note: TickerNote): void;
  clear(): void;
}

export interface Shown extends TickerNote {
  seq: number;
  leaving: boolean;
}

const DEFAULT_MS = 2200;
const EXIT_MS = 180;

export function useTicker(): { ticker: TickerApi; note: Shown | null; dismiss: () => void } {
  const [note, setNote] = useState<Shown | null>(null);
  const noteRef = useRef<Shown | null>(null);
  noteRef.current = note;
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const seq = useRef(0);

  const clearTimers = () => {
    for (const t of timers.current) clearTimeout(t);
    timers.current = [];
  };

  const leave = useCallback((which: number) => {
    setNote((n) => (n && n.seq === which ? { ...n, leaving: true } : n));
    timers.current.push(setTimeout(() => setNote((n) => (n && n.seq === which ? null : n)), EXIT_MS));
  }, []);

  const ticker = useMemo<TickerApi>(
    () => ({
      show(next) {
        clearTimers();
        const cur = noteRef.current;
        // Same story still on screen: keep its slot (no re-entry), refresh the words and the clock.
        const which = next.key && cur && !cur.leaving && cur.key === next.key ? cur.seq : ++seq.current;
        const shown = { ...next, seq: which, leaving: false };
        noteRef.current = shown;
        setNote(shown);
        timers.current.push(setTimeout(() => leave(which), next.duration ?? DEFAULT_MS));
      },
      clear() {
        clearTimers();
        noteRef.current = null;
        setNote(null);
      },
    }),
    [leave],
  );

  useEffect(() => () => clearTimers(), []);

  const dismiss = useCallback(() => {
    if (note) leave(note.seq);
  }, [note, leave]);

  return { ticker, note, dismiss };
}
