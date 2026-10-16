// Who's in. Before lock it's about squares (how much of the board each has);
// once the numbers are drawn it's about wins and who's leading right now.
// Tapping a player lights up their squares on the board.
//
// The host also gets a remove button on everyone else's row while squares are
// being picked (`onRemove`); the confirm step lives in the host sheet.

import { useState } from "react";
import { TrophyIcon, XIcon } from "../../components/icons";
import { Avatar, Badge, cx, LiveDot } from "../../components/ui";
import type { PlayerRow } from "./boardModel";

const COLLAPSED = 5;

export interface PlayersListProps {
  rows: PlayerRow[];
  total: number;
  hostId: string;
  /** "picking": squares still being claimed; "game": numbers are drawn. */
  stage: "picking" | "game";
  /** Public id of whoever the score points at right now, and the period label. */
  leading?: { playerId: string; label: string } | null;
  selectedId?: string | null;
  onSelect?: (playerId: string) => void;
  /** Host only, while squares are being picked: ask to remove this player (never offered on the host's or your own row). */
  onRemove?: (playerId: string) => void;
  /** Rows shown before "Show all" (default 5). */
  collapseAfter?: number;
}

export function PlayersList({
  rows,
  total,
  hostId,
  stage,
  leading = null,
  selectedId = null,
  onSelect,
  onRemove,
  collapseAfter = COLLAPSED,
}: PlayersListProps) {
  const [all, setAll] = useState(false);
  if (rows.length === 0) return null;
  const shown = all ? rows : rows.slice(0, collapseAfter);
  const maxSquares = Math.max(1, ...rows.map((r) => r.squares));
  return (
    <div className="overflow-hidden rounded-card bg-surface-2 shadow-card ring-1 ring-inset ring-line">
      <ul className="[&>li+li]:border-t [&>li+li]:border-line">
        {shown.map(({ player, squares, wins, winLabels, isMe }) => {
          const leads = stage === "game" && leading?.playerId === player.id;
          const selected = selectedId === player.id;
          const removable = !!onRemove && player.id !== hostId && !isMe;
          return (
            <li key={player.id} className={cx("flex items-center", selected && "bg-white/6")}>
              <button
                type="button"
                disabled={!onSelect || squares === 0}
                aria-pressed={onSelect && squares > 0 ? selected : undefined}
                onClick={() => onSelect?.(player.id)}
                className={cx(
                  "flex min-h-13 min-w-0 flex-1 items-center gap-3 py-2 pl-4 text-left disabled:cursor-default",
                  onRemove ? "pr-1" : "pr-4",
                  onSelect && squares > 0 && "active:bg-white/5",
                )}
              >
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
                    <span className={cx("truncate text-callout font-bold", isMe ? "text-brand-300" : "text-ink")}>{isMe ? "You" : player.name}</span>
                    {player.id === hostId && <Badge tone="outline">Host</Badge>}
                  </div>
                  {stage === "picking" ? (
                    // Share of the board, as a slim bar.
                    <div className="mt-1 h-1 w-full max-w-[9rem] overflow-hidden rounded-full bg-white/6">
                      <div
                        className="h-full rounded-full transition-[width] duration-700 ease-out-quint"
                        style={{ width: `${(squares / maxSquares) * 100}%`, backgroundColor: player.color }}
                      />
                    </div>
                  ) : (
                    <p className="mt-0.5 flex items-center gap-1.5 text-caption text-ink-subtle">
                      <span className="tabular-nums">{squares === 1 ? "1 square" : `${squares} squares`}</span>
                      {leads && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-live-500/15 px-1.5 py-px text-[0.6875rem] font-extrabold text-live-300">
                          <LiveDot />
                          Leading {leading?.label}
                        </span>
                      )}
                    </p>
                  )}
                </div>
                {stage === "picking" ? (
                  <span className="flex w-14 flex-col items-end leading-none">
                    <b className="font-display text-title-3 font-extrabold tabular-nums text-ink">{squares}</b>
                    <span className="mt-0.5 text-[0.625rem] font-bold uppercase tracking-wider text-ink-subtle">
                      {squares === 1 ? "square" : "squares"}
                    </span>
                  </span>
                ) : wins > 0 ? (
                  <span className="flex max-w-[45%] shrink-0 items-center gap-1 rounded-full bg-gold-400/15 px-2 py-0.5 text-footnote font-extrabold text-gold-300">
                    <TrophyIcon size={13} filled className="shrink-0" />
                    <span className="truncate">{winLabels.join(" · ")}</span>
                  </span>
                ) : (
                  <span className="shrink-0 text-caption font-semibold text-ink-subtle">No wins yet</span>
                )}
              </button>
              {/* Rows without one keep the same right edge, so the counts line up. */}
              {onRemove && !removable && <span aria-hidden className="mr-2 w-11 shrink-0" />}
              {removable && (
                <button
                  type="button"
                  data-testid="player-remove"
                  aria-label={`Remove ${player.name}`}
                  title={`Remove ${player.name}`}
                  onClick={() => onRemove(player.id)}
                  className="pressable mr-2 grid h-11 w-11 shrink-0 place-items-center rounded-full text-ink-subtle active:bg-danger-500/15 active:text-danger-300"
                >
                  <span className="grid h-7 w-7 place-items-center rounded-full bg-surface-4 ring-1 ring-inset ring-line">
                    <XIcon size={14} strokeWidth={2.6} />
                  </span>
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {rows.length > collapseAfter && (
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
