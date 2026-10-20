// Who's in. Before lock it's about squares (how much of the board each has);
// once the numbers are drawn it's about wins and who's leading right now.
// Tapping a player lights up their squares on the board.
//
// The host (and a co-host) also gets a remove button on everyone else's row
// while squares are being picked (`onRemove`, `canRemove`); the confirm step
// lives in the host sheet. Co-hosts wear a "Co-host" tag (`cohostIds`).
//
// With a square price, each row says what their squares come to ("4 squares ·
// $40"); with prize amounts, a winner's pill leads with their total. Both are
// display-only (the app never collects or sends money).

import { useState } from "react";
import { formatAmount } from "../../../shared/formats";
import type { AmountUnit } from "../../../shared/types";
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
  /** Which rows get the remove button (a co-host can't remove another co-host); default: everyone but the host and you. */
  canRemove?: (playerId: string) => boolean;
  /** Public ids of the board's co-hosts: "Co-host" next to their name. */
  cohostIds?: readonly string[];
  /** Rows shown before "Show all" (default 5). */
  collapseAfter?: number;
  /** The board's unit for square prices and prize totals (default "$"). */
  unit?: AmountUnit;
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
  canRemove,
  cohostIds = [],
  collapseAfter = COLLAPSED,
  unit = "$",
}: PlayersListProps) {
  const [all, setAll] = useState(false);
  if (rows.length === 0) return null;
  const shown = all ? rows : rows.slice(0, collapseAfter);
  const maxSquares = Math.max(1, ...rows.map((r) => r.squares));
  return (
    <div className="overflow-hidden rounded-card bg-surface-2 shadow-card ring-1 ring-inset ring-line">
      <ul className="[&>li+li]:border-t [&>li+li]:border-line">
        {shown.map(({ player, squares, squaresValue, prizeTotal, wins, winLabels, isMe }) => {
          const value = squaresValue && squares > 0 ? formatAmount(squaresValue, unit) : null;
          const leads = stage === "game" && leading?.playerId === player.id;
          const selected = selectedId === player.id;
          const removable = !!onRemove && player.id !== hostId && !isMe && (canRemove?.(player.id) ?? true);
          return (
            <li key={player.id} className={cx("flex items-center", selected && "bg-ink/6")}>
              <button
                type="button"
                disabled={!onSelect || squares === 0}
                aria-pressed={onSelect && squares > 0 ? selected : undefined}
                onClick={() => onSelect?.(player.id)}
                className={cx(
                  "flex min-h-13 min-w-0 flex-1 items-center gap-3 py-2 pl-4 text-left disabled:cursor-default",
                  onRemove ? "pr-1" : "pr-4",
                  onSelect && squares > 0 && "active:bg-ink/5",
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
                    <span className={cx("truncate text-callout font-bold", isMe ? "text-ink-brand" : "text-ink")}>{isMe ? "You" : player.name}</span>
                    {player.id === hostId && <Badge tone="outline">Host</Badge>}
                    {player.id !== hostId && cohostIds.includes(player.id) && (
                      <span data-testid="player-cohost" className="flex shrink-0">
                        <Badge tone="outline">Co-host</Badge>
                      </span>
                    )}
                  </div>
                  {stage === "picking" ? (
                    // Share of the board, as a slim bar (and what their squares come to at the square price).
                    <div className="mt-1 flex items-center gap-2">
                      <div className="h-1 w-full max-w-[9rem] overflow-hidden rounded-full bg-ink/6">
                        <div
                          className="h-full rounded-full transition-[width] duration-700 ease-out-quint"
                          style={{ width: `${(squares / maxSquares) * 100}%`, backgroundColor: player.color }}
                        />
                      </div>
                      {value && <span data-testid="player-squares-value" className="shrink-0 text-caption font-bold tabular-nums text-ink-gold">{value}</span>}
                    </div>
                  ) : (
                    // Wraps rather than running under the wins pill (squares, their value at the price, and "Leading").
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-caption text-ink-subtle">
                      <span className="whitespace-nowrap tabular-nums">
                        {squares === 1 ? "1 square" : `${squares} squares`}
                        {value ? ` · ${value}` : ""}
                      </span>
                      {leads && (
                        <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-live-500/15 px-1.5 py-px text-[0.6875rem] font-extrabold text-ink-live">
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
                  <span className="flex max-w-[45%] shrink-0 items-center gap-1 rounded-full bg-gold-400/15 px-2 py-0.5 text-footnote font-extrabold text-ink-gold">
                    <TrophyIcon size={13} filled className="shrink-0" />
                    <span className="truncate">
                      {prizeTotal ? <span className="tabular-nums text-ink-gold">{formatAmount(prizeTotal, unit)} · </span> : null}
                      {winLabels.join(" · ")}
                    </span>
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
                  className="pressable mr-2 grid h-11 w-11 shrink-0 place-items-center rounded-full text-ink-subtle active:bg-danger-500/15 active:text-ink-danger"
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
          className="w-full border-t border-line py-3 text-subhead font-bold text-ink-brand active:bg-ink/5"
        >
          {all ? "Show less" : `Show all ${total}`}
        </button>
      )}
    </div>
  );
}
