// Winners by period for the host: who has each one, the score that decided
// it, and the escape hatches (pick a square by hand, undo a pick). Every-score
// rows can be tapped to fix that entry.

import type { GameState, Player } from "../../../shared/types";
import { ChevronRightIcon, TrophyIcon } from "../../components/icons";
import { Avatar, Badge, cx } from "../../components/ui";
import type { WinnerRow } from "./hostModel";

export interface WinnersListProps {
  state: GameState;
  rows: WinnerRow[];
  me: string;
  busy: boolean;
  onPick: (key: string, label: string) => void;
  onUndoPick: (key: string, label: string) => void;
  /** Every-score boards: edit this entry's score. */
  onEdit?: (key: string) => void;
}

export function WinnersList({ state, rows, me, busy, onPick, onUndoPick, onEdit }: WinnersListProps) {
  const { game } = state;
  const player = (id: string | null): Player | null => (id ? (state.players.find((p) => p.id === id) ?? null) : null);
  if (rows.length === 0) {
    return (
      <p className="rounded-card bg-surface-3/60 px-4 py-3.5 text-subhead text-ink-muted ring-1 ring-inset ring-line">
        Winners show up here as scores come in.
      </p>
    );
  }
  return (
    <ul className="overflow-hidden rounded-card bg-surface-3/60 ring-1 ring-inset ring-line [&>li+li]:border-t [&>li+li]:border-line">
      {rows.map((row) => {
        const r = row.result;
        const winner = player(r?.winnerPlayerId ?? null);
        const reverse = r?.reverseCell && r.reverseWinnerPlayerId !== r.winnerPlayerId ? player(r.reverseWinnerPlayerId) : null;
        const decided = !!r;
        const mine = winner?.id === me;
        const scoreText = row.score ? `${game.teamX.abbr || game.teamX.name} ${row.score.scoreX} – ${row.score.scoreY} ${game.teamY.abbr || game.teamY.name}` : "No score yet";
        const body = (
          <>
            <span
              className={cx(
                "grid h-10 min-w-10 shrink-0 place-items-center rounded-xl px-1.5 font-display text-footnote font-extrabold",
                decided ? "bg-gold-400 text-ink-inverse shadow-[inset_0_1px_0_rgb(255_255_255/0.35)]" : "bg-surface-4 text-ink-muted",
              )}
            >
              {shortLabel(row.label)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5">
                {winner && <Avatar name={winner.name} color={winner.color} emoji={winner.emoji} size="xs" decorative />}
                <span className={cx("truncate text-callout font-bold", decided ? "text-ink" : "text-ink-muted")}>
                  {!decided ? (game.status === "final" ? "No winner" : "Up next") : winner ? (mine ? "You" : winner.name) : "Empty square"}
                </span>
                {row.manual && <Badge tone="gold">Your pick</Badge>}
              </span>
              <span className="mt-0.5 block truncate text-footnote tabular-nums text-ink-subtle">
                {scoreText}
                {reverse ? ` · Reverse: ${reverse.id === me ? "You" : reverse.name}` : ""}
              </span>
            </span>
          </>
        );
        return (
          <li key={row.key} className="flex min-h-16 items-center gap-2 pr-2">
            {onEdit && row.score ? (
              <button
                type="button"
                onClick={() => onEdit(row.key)}
                aria-label={`Fix ${row.label} score`}
                className="flex min-w-0 flex-1 items-center gap-3 py-2.5 pl-3.5 text-left transition-colors active:bg-white/5"
              >
                {body}
                <ChevronRightIcon size={16} className="shrink-0 text-ink-subtle" />
              </button>
            ) : (
              <div className="flex min-w-0 flex-1 items-center gap-3 py-2.5 pl-3.5">{body}</div>
            )}
            {row.manual ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => onUndoPick(row.key, row.label)}
                className="pressable tap-target h-9 shrink-0 rounded-xl px-3 text-footnote font-extrabold text-ink-muted ring-1 ring-inset ring-line-strong disabled:opacity-40"
              >
                Undo pick
              </button>
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={() => onPick(row.key, row.label)}
                aria-label={decided ? `Change the ${row.label} winner by hand` : `Pick the ${row.label} winner by hand`}
                className={cx(
                  "pressable tap-target flex h-9 shrink-0 items-center gap-1 rounded-xl px-3 text-footnote font-extrabold disabled:opacity-40",
                  decided ? "text-ink-muted ring-1 ring-inset ring-line-strong" : "bg-surface-4 text-ink ring-1 ring-inset ring-line",
                )}
              >
                {!decided && <TrophyIcon size={14} className="text-gold-400" />}
                {decided ? "Change" : "Pick"}
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** "Score 12" -> "#12"; period labels are already short. */
function shortLabel(label: string): string {
  const m = /^Score (\d+)$/.exec(label);
  return m ? `#${m[1]}` : label;
}
