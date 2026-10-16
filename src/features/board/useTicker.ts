// State for the board screen's bottom ticker: one note at a time, each
// leaving on its own after ~2 s. Rendered by <Ticker>.

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
        const which = ++seq.current;
        setNote({ ...next, seq: which, leaving: false });
        timers.current.push(setTimeout(() => leave(which), next.duration ?? DEFAULT_MS));
      },
      clear() {
        clearTimers();
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

