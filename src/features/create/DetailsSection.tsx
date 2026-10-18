// Optional details, opened from the settings card's "Edit": board name
// (auto-filled until edited), squares per person and fun prize notes.

import { useEffect } from "react";
import { PRIZE_MAX_LENGTH, validatePrizeNote } from "../../../shared/formats";
import type { GameFormat } from "../../../shared/types";
import { GiftIcon } from "../../components/icons";
import { Stepper, TextField } from "../../components/ui";
import { BOARD_NAME_MAX, prizeInputId, prizeSlots } from "./model";

export interface DetailsPanelProps {
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

export function DetailsPanel({ format, name, autoName, onName, maxPerPlayer, onMaxPerPlayer, prizes, onPrize }: DetailsPanelProps) {
  const slots = prizeSlots(format);
  const total = format.boardSize;
  const problemKey = slots.find((s) => (prizes[s.key] ?? "").trim() && validatePrizeNote(prizes[s.key] ?? ""))?.key ?? null;

  // A money note's message appears under its field as you type: keep it in view, clear of the Create bar.
  useEffect(() => {
    if (!problemKey) return;
    document.getElementById(`${prizeInputId(problemKey)}-error`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [problemKey]);

  return (
    <div className="flex flex-col gap-5">
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
          <p className="text-callout font-semibold text-ink">Squares each</p>
          <p className="mt-0.5 text-footnote text-ink-muted">{maxPerPlayer > 0 ? "Keeps it fair when it fills fast." : "Grab as many as you like."}</p>
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
          <GiftIcon size={16} className="text-ink-gold" />
          <p className="text-subhead font-bold text-ink-muted">Prizes</p>
          <span className="text-footnote text-ink-subtle">· optional, just for fun</span>
        </div>
        {slots.map((slot, i) => {
          const note = prizes[slot.key] ?? "";
          const problem = note.trim() ? validatePrizeNote(note) : null;
          return (
            <TextField
              key={slot.key}
              id={prizeInputId(slot.key)}
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
  );
}
