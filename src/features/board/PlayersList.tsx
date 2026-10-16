// Who's in: everyone on the board with their squares and wins.

import { useState } from "react";
import { TrophyIcon } from "../../components/icons";
import { Avatar, Badge, cx } from "../../components/ui";
import type { PlayerRow } from "./boardModel";

const COLLAPSED = 5;

export function PlayersList({ rows, total, hostId }: { rows: PlayerRow[]; total: number; hostId: string }) {
  const [all, setAll] = useState(false);
  if (rows.length === 0) return null;
  const shown = all ? rows : rows.slice(0, COLLAPSED);
  const maxSquares = Math.max(1, ...rows.map((r) => r.squares));
  return (
    <div className="overflow-hidden rounded-card bg-surface-2 shadow-card ring-1 ring-inset ring-line">
      <ul className="[&>li+li]:border-t [&>li+li]:border-line">
        {shown.map(({ player, squares, wins, isMe }) => (
          <li key={player.id} className="flex min-h-13 items-center gap-3 px-4 py-2">
            <Avatar
              name={player.name}
              color={player.color}
              emoji={player.emoji}
              size="sm"
              ring={isMe ? "brand" : wins > 0 ? "gold" : "none"}
              decorative
            />
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-1.5">
                <span className={cx("truncate text-callout font-bold", isMe ? "text-brand-300" : "text-ink")}>
                  {isMe ? "You" : player.name}
                </span>
                {player.id === hostId && <Badge tone="outline">Host</Badge>}
              </div>
              {/* Share of the board, as a slim bar. */}
              <div className="mt-1 h-1 w-full max-w-[9rem] overflow-hidden rounded-full bg-white/6">
                <div
                  className="h-full rounded-full transition-[width] duration-700 ease-out-quint"
                  style={{ width: `${(squares / maxSquares) * 100}%`, backgroundColor: player.color }}
                />
              </div>
            </div>
            {wins > 0 && (
              <span className="flex items-center gap-1 rounded-full bg-gold-400/15 px-2 py-0.5 text-footnote font-extrabold text-gold-300">
                <TrophyIcon size={13} filled />
                {wins}
              </span>
            )}
            <span className="flex w-14 flex-col items-end leading-none">
              <b className="font-display text-title-3 font-extrabold tabular-nums text-ink">{squares}</b>
              <span className="mt-0.5 text-[0.625rem] font-bold uppercase tracking-wider text-ink-subtle">
                {squares === 1 ? "square" : "squares"}
              </span>
            </span>
          </li>
        ))}
      </ul>
      {rows.length > COLLAPSED && (
        <button
          type="button"
          onClick={() => setAll((v) => !v)}
          className="w-full border-t border-line py-3 text-subhead font-bold text-brand-300 active:bg-white/5"
        >
          {all ? "Show less" : `Show all ${total}`}
        </button>
      )}
    </div>
  );
}
