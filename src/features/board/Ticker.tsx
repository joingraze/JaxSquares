// The board screen's own notices: one short line at a time along the bottom,
// like a TV score ticker, so nothing covers the back button, the title or the
// scoreboard. Each note leaves on its own after ~2 s (tap to dismiss sooner,
// or, when the note is about a square, tap to jump to it).

import type { ReactNode } from "react";
import { CheckIcon, ChevronRightIcon, InfoIcon, LiveIcon, TrophyIcon, UsersIcon } from "../../components/icons";
import { cx } from "../../components/ui";
import { useBottomChromeOffset } from "../../components/ui/bottomChrome";
import type { Shown, TickerTone } from "./useTicker";

const TONE: Record<TickerTone, { icon: ReactNode; chip: string }> = {
  neutral: { icon: <InfoIcon size={16} />, chip: "bg-surface-4 text-ink" },
  success: { icon: <CheckIcon size={16} strokeWidth={3} />, chip: "bg-brand-400 text-ink-inverse" },
  win: { icon: <TrophyIcon size={16} filled />, chip: "bg-gold-400 text-ink-inverse" },
  live: { icon: <LiveIcon size={16} />, chip: "bg-live-500 text-white" },
  social: { icon: <UsersIcon size={16} />, chip: "bg-accent-500 text-white" },
};

/** Sits just above whatever is pinned to the bottom (the claim bar, the home indicator). */
export function Ticker({ note, onDismiss }: { note: Shown | null; onDismiss: () => void }) {
  const offset = useBottomChromeOffset();
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 z-40 flex justify-center px-4"
      style={{ bottom: `calc(${offset} + 0.25rem)` }}
    >
      {note && (
        <button
          key={note.seq}
          type="button"
          onClick={() => {
            note.onTap?.();
            onDismiss();
          }}
          data-leaving={note.leaving}
          className={cx(
            "jx-ticker pointer-events-auto flex min-h-12 w-full max-w-sm items-center gap-2.5 rounded-2xl bg-surface-3/95 py-2 pl-2 text-left shadow-float ring-1 ring-inset backdrop-blur-xl",
            note.onTap ? "pr-2.5" : "pr-3.5",
            note.tone === "win" ? "ring-gold-400/55" : note.tone === "live" ? "ring-live-500/45" : "ring-line-strong",
          )}
        >
          <span className={cx("grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-xl", note.icon ? "" : TONE[note.tone ?? "neutral"].chip)}>
            {note.icon ?? TONE[note.tone ?? "neutral"].icon}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-subhead font-bold leading-snug text-ink">{note.title}</span>
            {note.detail && <span className="mt-0.5 block min-w-0 text-caption leading-snug text-ink-muted">{note.detail}</span>}
          </span>
          {note.onTap && <ChevronRightIcon size={16} strokeWidth={2.6} className="shrink-0 text-ink-subtle" />}
        </button>
      )}
    </div>
  );
}
