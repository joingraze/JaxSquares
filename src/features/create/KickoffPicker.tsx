// A custom board's kickoff: one card that says when it is ("Sun, Oct 25 ·
// 1:00 PM PDT · in 7 days"), one-tap days (Today, Tomorrow, the week's days
// by name) and common times, the full date and time input for anything else,
// and a clear "No set time". Always the device's own time zone, labeled.
// Used by the create flow and the host's Edit board.

import { useLayoutEffect, useRef } from "react";
import { CalendarIcon, ClockIcon } from "../../components/icons";
import { cx } from "../../components/ui";
import { haptic } from "../../lib/native";
import {
  dayKey,
  defaultKickoff,
  fromLocalInput,
  KICKOFF_TIMES,
  kickoffDays,
  kickoffReadout,
  timeKey,
  timeLabel,
  toLocalInput,
  withDay,
  withTime,
  type KickoffDay,
} from "./kickoff";

export interface KickoffPickerProps {
  /** Epoch ms, or null for no set time. */
  value: number | null;
  onChange: (value: number | null) => void;
  now: number;
  /** Why this time can't be used (shown under the card). */
  error?: string | null;
  className?: string;
}

/** DOM id of the full date & time input (focused when the kickoff blocks Next). */
export const KICKOFF_INPUT_ID = "kickoff-input";

export function KickoffPicker({ value, onChange, now, error, className }: KickoffPickerProps) {
  // The last time picked, so "No set time" and back keeps it.
  const last = useRef<number | null>(value);
  if (value !== null) last.current = value;
  const dayRow = useRef<HTMLDivElement>(null);

  const days = kickoffDays(now);
  const selectedDay = value === null ? null : dayKey(value);
  const selectedTime = value === null ? null : timeKey(value);
  // A day or time picked from the full input still shows as a selected chip.
  const shownDays: KickoffDay[] =
    value !== null && !days.some((d) => d.key === selectedDay)
      ? [
          ...days,
          {
            key: selectedDay!,
            label: new Date(value).toLocaleDateString("en-US", { weekday: "short" }),
            date: new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
            start: new Date(value).setHours(0, 0, 0, 0),
          },
        ]
      : days;
  const shownTimes = selectedTime && !KICKOFF_TIMES.includes(selectedTime) ? [...KICKOFF_TIMES, selectedTime].sort() : KICKOFF_TIMES;

  // Keep the picked day in view (next Sunday can be past the right edge).
  useLayoutEffect(() => {
    const row = dayRow.current;
    const chip = row?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!row || !chip) return;
    const left = chip.offsetLeft - row.offsetLeft;
    if (left + chip.offsetWidth > row.scrollLeft + row.clientWidth - 16) row.scrollLeft = left - row.clientWidth + chip.offsetWidth + 32;
    else if (left < row.scrollLeft) row.scrollLeft = Math.max(0, left - 16);
  }, [selectedDay]);

  const set = (next: number | null) => {
    void haptic("selection");
    onChange(next);
  };
  const readout = value === null ? null : kickoffReadout(value, now);

  return (
    <section
      data-testid="custom-kickoff"
      aria-label="Kickoff"
      className={cx("overflow-hidden rounded-card bg-surface-2 shadow-card ring-1 ring-inset", error ? "ring-danger-500/70" : "ring-line", className)}
    >
      <div className="flex items-center gap-3 px-3.5 pt-3.5">
        <span aria-hidden className={cx("grid h-11 w-11 shrink-0 place-items-center rounded-xl", value === null ? "bg-surface-4 text-ink-muted" : "bg-brand-400/12 text-ink-brand")}>
          <ClockIcon size={22} />
        </span>
        <div className="min-w-0 flex-1" aria-live="polite">
          <p className="eyebrow text-ink-subtle">Kickoff</p>
          {readout ? (
            <>
              <p className="truncate font-display text-headline font-extrabold leading-tight text-ink">
                {readout.day} · {readout.time}
                {readout.zone && <span className="ml-1.5 font-sans text-footnote font-bold text-ink-subtle">{readout.zone}</span>}
              </p>
              <p className="truncate text-footnote text-ink-muted">
                <span className="font-semibold text-ink-brand">{readout.relative}</span> · Friends see a countdown
              </p>
            </>
          ) : (
            <>
              <p className="font-display text-headline font-extrabold leading-tight text-ink">No set time</p>
              <p className="truncate text-footnote text-ink-muted">Add one now or any time from Edit board.</p>
            </>
          )}
        </div>
      </div>

      {value !== null && (
        <div className="flex flex-col gap-2 pt-3">
          <div ref={dayRow} role="group" aria-label="Kickoff day" className="flex gap-2 overflow-x-auto px-3.5 pb-0.5 scrollbar-none">
            {shownDays.map((d) => {
              const on = d.key === selectedDay;
              return (
                <button
                  key={d.key}
                  type="button"
                  data-testid="kickoff-day"
                  data-day={d.key}
                  aria-pressed={on}
                  aria-label={`${d.label}, ${d.date}`}
                  onClick={() => set(withDay(value, d.start))}
                  className={cx(
                    "pressable flex h-13 min-w-15 shrink-0 flex-col items-center justify-center rounded-xl px-3 leading-tight transition-colors",
                    on ? "bg-brand-400 text-ink-inverse shadow-[inset_0_1px_0_rgb(255_255_255/0.35)]" : "bg-surface-3 text-ink ring-1 ring-inset ring-line hover:bg-surface-4",
                  )}
                >
                  <span className="text-subhead font-extrabold">{d.label}</span>
                  <span className={cx("text-caption font-semibold tabular-nums", on ? "text-ink-inverse/75" : "text-ink-subtle")}>{d.date}</span>
                </button>
              );
            })}
          </div>
          <div role="group" aria-label="Kickoff time" className="flex gap-2 overflow-x-auto px-3.5 pb-0.5 scrollbar-none">
            {shownTimes.map((t) => {
              const on = t === selectedTime;
              return (
                <button
                  key={t}
                  type="button"
                  data-testid="kickoff-time"
                  data-time={t}
                  aria-pressed={on}
                  onClick={() => set(withTime(value, t, now))}
                  className={cx(
                    "pressable h-10 shrink-0 whitespace-nowrap rounded-full px-3.5 text-subhead font-bold tabular-nums transition-colors",
                    on ? "bg-brand-400 text-ink-inverse shadow-[inset_0_1px_0_rgb(255_255_255/0.35)]" : "bg-surface-3 text-ink ring-1 ring-inset ring-line hover:bg-surface-4",
                  )}
                >
                  {timeLabel(t)}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="mt-3 flex border-t border-line">
        {/* The full input sits over its button, so a tap opens the phone's own date & time wheel. */}
        <label className="relative flex h-12 min-w-0 flex-1 cursor-pointer items-center justify-center gap-1.5 text-subhead font-bold text-ink-brand transition-colors active:bg-ink/4">
          <CalendarIcon size={16} className="shrink-0" />
          <span className="truncate">{value === null ? "Pick date & time" : "Other date & time"}</span>
          <input
            id={KICKOFF_INPUT_ID}
            type="datetime-local"
            data-testid="kickoff-input"
            aria-label="Kickoff date and time"
            value={value === null ? "" : toLocalInput(value)}
            min={toLocalInput(now - 60 * 60_000)}
            onClick={(e) => {
              try {
                e.currentTarget.showPicker?.();
              } catch {
                // Not allowed here (or not supported): the tap focuses the input instead.
              }
            }}
            onChange={(e) => {
              const next = fromLocalInput(e.target.value);
              if (next !== null) onChange(next);
            }}
            className="absolute inset-0 h-full w-full cursor-pointer text-body opacity-0"
          />
        </label>
        <span aria-hidden className="my-2.5 w-px bg-line" />
        <button
          type="button"
          data-testid="kickoff-none"
          aria-pressed={value === null}
          onClick={() => set(value === null ? (last.current ?? defaultKickoff(now)) : null)}
          className="flex h-12 min-w-0 flex-1 items-center justify-center gap-1.5 text-subhead font-bold text-ink-muted transition-colors hover:text-ink active:bg-ink/4"
        >
          <span className="truncate">{value === null ? "Set a kickoff" : "No set time"}</span>
        </button>
      </div>

      {error && (
        <p role="alert" className="border-t border-line px-3.5 py-2.5 text-footnote font-semibold text-ink-danger">
          {error}
        </p>
      )}
    </section>
  );
}
