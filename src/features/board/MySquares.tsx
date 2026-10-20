// "Your squares": a one-line summary under the grid (how many, and the one
// closest to hitting) that opens into every number pair, labeled by team.

import { useState } from "react";
import type { Team } from "../../../shared/types";
import { cellKey } from "../../../shared/squares";
import { ChevronDownIcon, ChevronUpIcon, TrophyIcon } from "../../components/icons";
import { cx } from "../../components/ui";
import type { NowView } from "./boardModel";

export interface MyNumber {
  row: number;
  col: number;
  x: string;
  y: string;
}

export interface MySquaresProps {
  numbers: MyNumber[];
  now: NowView | null;
  teamX: Team;
  teamY: Team;
  /** Keys of my squares that have won. */
  wonKeys: ReadonlySet<string>;
  spotKey: string | null;
  onSpot: (key: string | null) => void;
}

const abbrOf = (t: Team) => t.abbr || t.name.slice(0, 3).toUpperCase();

export function MySquares({ numbers, now, teamX, teamY, wonKeys, spotKey, onSpot }: MySquaresProps) {
  const [open, setOpen] = useState(false);
  if (numbers.length === 0) return null;
  const x = abbrOf(teamX);
  const y = abbrOf(teamY);

  // The one to watch: leading now, else the closest by common scores.
  let best: { nb: MyNumber; note: string } | null = null;
  const nowKey = now ? cellKey(now.cell.row, now.cell.col) : null;
  const pathKey = now?.path ? cellKey(now.path.cell.row, now.path.cell.col) : null;
  for (const nb of numbers) {
    const k = cellKey(nb.row, nb.col);
    if (now?.mine && k === nowKey) best = { nb, note: "Leading now" };
    else if (!best && k === pathKey) best = { nb, note: now?.path?.plays.length === 1 ? "1 score away" : "2 scores away" };
  }

  const pair = (nb: MyNumber) => (
    <>
      <span className="text-ink-subtle">{x}</span> <b className="font-extrabold text-ink">{nb.x}</b>
      <span aria-hidden className="mx-1 text-ink-subtle">·</span>
      <span className="text-ink-subtle">{y}</span> <b className="font-extrabold text-ink">{nb.y}</b>
    </>
  );

  return (
    <div className="rounded-2xl bg-surface-2 ring-1 ring-inset ring-line">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="pressable flex w-full items-center gap-3 px-3.5 py-2.5 text-left"
      >
        <span className="flex shrink-0 flex-col leading-none">
          <span className="font-display text-title-3 font-extrabold tabular-nums text-ink-brand">{numbers.length}</span>
          <span className="mt-0.5 text-[0.625rem] font-bold uppercase tracking-wider text-ink-subtle">{numbers.length === 1 ? "square" : "squares"}</span>
        </span>
        <span className="min-w-0 flex-1">
          {best ? (
            <>
              <span className="block text-caption font-bold text-ink-muted">{best.note === "Leading now" ? "Leading now" : `Closest: ${best.note}`}</span>
              <span className="block truncate text-subhead tabular-nums">{pair(best.nb)}</span>
            </>
          ) : (
            <>
              <span className="block text-caption font-bold text-ink-muted">Your numbers</span>
              <span className="block truncate text-subhead tabular-nums">{pair(numbers[0])}{numbers.length > 1 ? <span className="text-ink-subtle"> and more</span> : null}</span>
            </>
          )}
        </span>
        <span className="flex shrink-0 items-center gap-1 rounded-full bg-surface-3 px-2.5 py-1 text-caption font-extrabold text-ink ring-1 ring-inset ring-line-strong">
          {open ? "Hide" : numbers.length > 1 ? `All ${numbers.length}` : "Show"}
          {open ? <ChevronUpIcon size={13} /> : <ChevronDownIcon size={13} />}
        </span>
      </button>
      {open && (
        <ul className="grid grid-cols-2 gap-1.5 border-t border-line p-2.5 animate-fade-in">
          {numbers.map((nb) => {
            const k = cellKey(nb.row, nb.col);
            const on = spotKey === k;
            const won = wonKeys.has(k);
            return (
              <li key={k}>
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => onSpot(on ? null : k)}
                  className={cx(
                    "pressable flex h-9 w-full items-center justify-center gap-1 rounded-xl px-2 text-footnote tabular-nums ring-1 ring-inset",
                    on ? "bg-brand-400/20 ring-brand-line" : won ? "bg-gold-400/10 ring-gold-line/50" : "bg-surface-3 ring-line",
                  )}
                >
                  {won && <TrophyIcon size={12} filled className="mr-0.5 shrink-0 text-ink-gold" />}
                  {pair(nb)}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
