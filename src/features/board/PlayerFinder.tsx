// "Who's who": one chip per player under the grid. Tap one to light up that
// player's squares on the board (tap again to clear).

import { useState } from "react";
import type { Player } from "../../../shared/types";
import { Avatar, cx } from "../../components/ui";

export interface PlayerFinderProps {
  players: Player[];
  /** Squares per player (public id). */
  counts: ReadonlyMap<string, number>;
  me: string;
  selected: string | null;
  onSelect: (playerId: string | null) => void;
}

const COLLAPSED = 8;

export function PlayerFinder({ players, counts, me, selected, onSelect }: PlayerFinderProps) {
  const [all, setAll] = useState(false);
  const withSquares = players
    .filter((p) => (counts.get(p.id) ?? 0) > 0)
    .sort((a, b) => Number(b.id === me) - Number(a.id === me) || (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0) || a.joinedAt - b.joinedAt);
  if (withSquares.length < 2) return null;
  const shown = all ? withSquares : withSquares.slice(0, COLLAPSED);
  const hidden = withSquares.length - shown.length;

  return (
    <div role="group" aria-label="Find a player's squares" className="flex flex-wrap items-center gap-1.5">
      <span className="eyebrow mr-1 text-ink-subtle">Find</span>
      {shown.map((p) => {
        const on = selected === p.id;
        const mine = p.id === me;
        return (
          <button
            key={p.id}
            type="button"
            aria-pressed={on}
            onClick={() => onSelect(on ? null : p.id)}
            className={cx(
              "pressable flex h-7 items-center gap-1 rounded-full py-0.5 pl-0.5 pr-2 text-caption font-bold ring-1 ring-inset",
              on ? "bg-ink text-ink-inverse ring-ink" : "bg-surface-2 text-ink ring-line-strong",
            )}
          >
            <Avatar name={p.name} color={p.color} emoji={p.emoji} size="xs" decorative />
            <span className={cx("max-w-[5rem] truncate", !on && mine && "text-brand-300")}>{mine ? "You" : p.name}</span>
            <span className={cx("tabular-nums font-semibold", on ? "text-ink-inverse/60" : "text-ink-subtle")}>{counts.get(p.id) ?? 0}</span>
          </button>
        );
      })}
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setAll(true)}
          className="pressable h-7 rounded-full bg-surface-2 px-2.5 text-caption font-bold text-ink-muted ring-1 ring-inset ring-line"
        >
          +{hidden} more
        </button>
      )}
    </div>
  );
}
