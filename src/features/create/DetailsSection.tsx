// Step 3: optional details, collapsed behind a one-line summary. Board name
// (auto-filled until edited), squares per person and fun prize notes.

import { useId } from "react";
import { PRIZE_MAX_LENGTH, validatePrizeNote } from "../../../shared/formats";
import type { GameFormat } from "../../../shared/types";
import { ChevronDownIcon, GiftIcon, SlidersIcon } from "../../components/icons";
import { cx, Stepper, TextField } from "../../components/ui";
import { pluralize } from "../../lib/format";
import { haptic } from "../../lib/native";
import { BOARD_NAME_MAX, cleanPrizes, prizeSlots } from "./model";

export interface DetailsSectionProps {
  open: boolean;
  onToggle: () => void;
  format: GameFormat;
  /** What the board will be called (auto or typed). */
  name: string;
  autoName: string;
  onName: (name: string) => void;
  maxPerPlayer: number;
  onMaxPerPlayer: (n: number) => void;
  prizes: Record<string, string>;
  onPrize: (key: string, note: string) => void;
}

/** Fun examples, one per slot; none of them are money. */
const PRIZE_IDEAS = ["Loser buys wings", "Winner picks the music", "Loser does the dishes", "Bragging rights till next season"];
const SLOT_LABEL: Record<string, string> = { q1: "After Q1", q2: "Halftime", q3: "After Q3", final: "Final score", "*": "Every score" };

export function DetailsSection({
  open,
  onToggle,
  format,
  name,
  autoName,
  onName,
  maxPerPlayer,
  onMaxPerPlayer,
  prizes,
  onPrize,
}: DetailsSectionProps) {
  const panelId = useId();
  const slots = prizeSlots(format);
  const prizeCount = Object.keys(cleanPrizes(format, prizes)).length;
  const summary = [
    maxPerPlayer > 0 ? `Max ${pluralize(maxPerPlayer, "square")} each` : "No square limit",
    prizeCount > 0 ? pluralize(prizeCount, "prize") : "No prizes yet",
  ].join(" · ");
  const total = format.boardSize;

  return (
    <div className="overflow-hidden rounded-card bg-surface-2 ring-1 ring-inset ring-line shadow-card">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => {
          void haptic("selection");
          onToggle();
        }}
        className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left transition-colors active:bg-white/4"
      >
        <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-surface-4 text-ink-muted">
          <SlidersIcon size={18} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-callout font-bold text-ink">{name || autoName || "Board details"}</span>
          <span className="mt-0.5 block truncate text-footnote text-ink-muted">{summary}</span>
        </span>
        <span className="shrink-0 text-footnote font-bold text-brand-400">{open ? "Done" : "Edit"}</span>
        <ChevronDownIcon size={18} className={cx("-mr-1 shrink-0 text-ink-subtle transition-transform duration-300", open && "rotate-180")} />
      </button>

      {open && (
        <div id={panelId} className="flex animate-fade-in flex-col gap-5 border-t border-line px-4 pb-5 pt-4">
          <TextField
            label="Board name"
            value={name}
            placeholder={autoName || "Sunday Squares"}
            maxLength={BOARD_NAME_MAX}
            counter
            autoComplete="off"
            enterKeyHint="done"
            onChange={(e) => onName(e.target.value)}
            hint={name ? undefined : "We'll use the matchup if you leave this blank."}
          />

          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-callout font-semibold text-ink">Squares per person</p>
              <p className="mt-0.5 text-footnote text-ink-muted">{maxPerPlayer > 0 ? "Keeps it fair when the board fills fast." : "Grab as many as you like."}</p>
            </div>
            <Stepper
              label="Squares per person"
              value={Math.min(maxPerPlayer, total)}
              min={0}
              max={total}
              onChange={onMaxPerPlayer}
              format={(v) => (v === 0 ? <span className="text-callout">No limit</span> : v)}
              valueText={(v) => (v === 0 ? "No limit" : String(v))}
            />
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 px-1">
              <GiftIcon size={16} className="text-gold-400" />
              <p className="text-subhead font-bold text-ink-muted">Prizes</p>
              <span className="text-footnote text-ink-subtle">· optional, just for fun</span>
            </div>
            {slots.map((slot, i) => {
              const note = prizes[slot.key] ?? "";
              const problem = note.trim() ? validatePrizeNote(note) : null;
              return (
                <TextField
                  key={slot.key}
                  id={`prize-${slot.key === "*" ? "all" : slot.key}`}
                  label={SLOT_LABEL[slot.key] ?? slot.label}
                  value={note}
                  placeholder={PRIZE_IDEAS[i % PRIZE_IDEAS.length]}
                  maxLength={PRIZE_MAX_LENGTH}
                  autoComplete="off"
                  enterKeyHint="next"
                  error={problem ?? undefined}
                  onChange={(e) => onPrize(slot.key, e.target.value)}
                  leading={<span className="text-[1.05rem] leading-none">{i === slots.length - 1 ? "🏆" : "🎁"}</span>}
                />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
