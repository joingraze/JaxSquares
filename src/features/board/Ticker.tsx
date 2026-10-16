// The board screen's own notices: one short line at a time along the bottom,
// like a TV score ticker, so nothing covers the back button, the title or the
// scoreboard. Each note leaves on its own after ~2 s (tap to dismiss sooner).

import type { ReactNode } from "react";
import { CheckIcon, InfoIcon, LiveIcon, TrophyIcon, UsersIcon } from "../../components/icons";
import { cx } from "../../components/ui";
import type { Shown, TickerTone } from "./useTicker";

const TONE: Record<TickerTone, { icon: ReactNode; chip: string }> = {
  neutral: { icon: <InfoIcon size={16} />, chip: "bg-surface-4 text-ink" },
  success: { icon: <CheckIcon size={16} strokeWidth={3} />, chip: "bg-brand-400 text-ink-inverse" },
  win: { icon: <TrophyIcon size={16} filled />, chip: "bg-gold-400 text-ink-inverse" },
  live: { icon: <LiveIcon size={16} />, chip: "bg-live-500 text-white" },
  social: { icon: <UsersIcon size={16} />, chip: "bg-accent-500 text-white" },
};

/** Sits above the bottom safe area, or above the action bar when it's up. */
export function Ticker({ note, lifted, onDismiss }: { note: Shown | null; lifted: boolean; onDismiss: () => void }) {
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 z-40 flex justify-center px-4"
      style={{ bottom: `calc(max(var(--safe-bottom), 0.75rem) + ${lifted ? "6.75rem" : "0.25rem"})` }}
    >
      {note && (
        <button
          key={note.seq}
          type="button"
          onClick={onDismiss}
          data-leaving={note.leaving}
          className={cx(
            "jx-ticker pointer-events-auto flex w-full max-w-sm items-center gap-2.5 rounded-2xl bg-surface-3/95 py-2 pl-2 pr-3.5 text-left shadow-float ring-1 ring-inset backdrop-blur-xl",
            note.tone === "win" ? "ring-gold-400/55" : note.tone === "live" ? "ring-live-500/45" : "ring-line-strong",
          )}
        >
          <span className={cx("grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-xl", note.icon ? "" : TONE[note.tone ?? "neutral"].chip)}>
            {note.icon ?? TONE[note.tone ?? "neutral"].icon}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-subhead font-bold leading-snug text-ink">{note.title}</span>
            {note.detail && <span className="block truncate text-caption leading-snug text-ink-muted">{note.detail}</span>}
          </span>
        </button>
      )}
    </div>
  );
}
