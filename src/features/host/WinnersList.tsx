// Winners by period for the host: who has each one, the score that decided
// it, and one labelled button per thing the host can do about it ("Edit
// score", "Pick winner", "Undo pick"). A score that lands on an empty square
// says so in a plain sentence with the fix one tap away. Amounts (display-only)
// ride along: "KC 7 – 3 BUF · $200", "Reverse · $50: Maya". Where only the
// reverse square wins a moment, the row is about the reverse square.

import type { ReactNode } from "react";
import { formatAmount, scorePlayLabel, unitOf } from "../../../shared/formats";
import { primaryAward } from "../../../shared/squares";
import type { GameState, Player } from "../../../shared/types";
import { PencilIcon, TrophyIcon } from "../../components/icons";
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
  /** The next undecided period can be crowned by hand (only once the game is under way). */
  canPickOpen: boolean;
}

interface RowAction {
  key: string;
  label: string;
  aria: string;
  icon?: ReactNode;
  tone: "quiet" | "gold";
  onClick: () => void;
}

export function WinnersList({ state, rows, me, busy, onPick, onUndoPick, onEdit, canPickOpen }: WinnersListProps) {
  const { game } = state;
  const player = (id: string | null): Player | null => (id ? (state.players.find((p) => p.id === id) ?? null) : null);
  const abbrX = game.teamX.abbr || game.teamX.name;
  const abbrY = game.teamY.abbr || game.teamY.name;
  const unit = unitOf(game.format);
  const money = (n: number | null) => (n ? formatAmount(n, unit) : null);
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
        const award = r ? primaryAward(r) : null;
        const winner = player(award?.playerId ?? null);
        const reverse =
          r && !award?.reverse && r.reverseCell && r.reverseWinnerPlayerId !== r.winnerPlayerId ? player(r.reverseWinnerPlayerId) : null;
        const decided = !!r;
        const empty = decided && !winner && !row.manual;
        const mine = winner?.id === me;
        const amount = money(award?.amount ?? null);
        // Every-score entries say what kind of score it was ("Touchdown", "Extra point").
        const kind = r?.scoreKind ? scorePlayLabel(r.scoreKind, r.scorePoints, true) : null;
        const scoreLine = row.score
          ? `${abbrX} ${row.score.scoreX} – ${row.score.scoreY} ${abbrY}${kind ? ` · ${kind}` : ""}${amount ? ` · ${amount}` : ""}${award?.reverse ? " · reverse" : ""}`
          : null;

        const actions: RowAction[] = [];
        if (onEdit && row.score) {
          actions.push({
            key: "edit",
            label: "Edit score",
            aria: `Edit the ${row.label} score`,
            icon: <PencilIcon size={14} />,
            tone: "quiet",
            onClick: () => onEdit(row.key),
          });
        }
        if (row.manual) {
          actions.push({ key: "undo", label: "Undo pick", aria: `Undo your ${row.label} pick`, tone: "quiet", onClick: () => onUndoPick(row.key, row.label) });
        } else if (empty) {
          actions.push({
            key: "give",
            label: "Give it to a player",
            aria: `Pick the ${row.label} winner by hand`,
            icon: <TrophyIcon size={14} filled />,
            tone: "gold",
            onClick: () => onPick(row.key, row.label),
          });
        } else if (decided) {
          actions.push({ key: "pick", label: "Pick winner", aria: `Change the ${row.label} winner by hand`, tone: "quiet", onClick: () => onPick(row.key, row.label) });
        } else if (canPickOpen && game.status !== "final") {
          actions.push({
            key: "pick",
            label: "Pick winner",
            aria: `Pick the ${row.label} winner by hand`,
            icon: <TrophyIcon size={14} className="text-ink-gold" />,
            tone: "quiet",
            onClick: () => onPick(row.key, row.label),
          });
        }
        // One action sits at the end of the row; two, or an empty-square fix, get their own line.
        const ownLine = actions.length > 1 || empty;

        const headline = !decided
          ? game.status === "final"
            ? "No winner"
            : "Up next"
          : winner
            ? mine
              ? "You"
              : winner.name
            : row.manual
              ? "Empty square (your pick)"
              : `Nobody had ${row.score ? `${row.score.scoreX % 10}–${row.score.scoreY % 10}` : "it"}`;

        return (
          <li key={row.key} className="py-2.5 pl-3.5 pr-2.5">
            <div className="flex min-h-11 items-center gap-3">
              <span
                className={cx(
                  "grid h-10 min-w-10 shrink-0 place-items-center rounded-xl px-1.5 font-display text-footnote font-extrabold",
                  empty
                    ? "bg-gold-400/12 text-ink-gold ring-1 ring-inset ring-gold-line/45"
                    : decided
                      ? "bg-gold-400 text-ink-inverse shadow-[inset_0_1px_0_rgb(255_255_255/0.35)]"
                      : "bg-surface-4 text-ink-muted",
                )}
              >
                {shortLabel(row.label)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  {winner && <Avatar name={winner.name} color={winner.color} emoji={winner.emoji} size="xs" decorative />}
                  <span className={cx("truncate text-callout font-bold", decided ? "text-ink" : "text-ink-muted")}>{headline}</span>
                  {row.manual && <Badge tone="gold">Your pick</Badge>}
                </span>
                <span className="mt-0.5 block truncate text-footnote tabular-nums text-ink-subtle">{scoreLine ?? "No score yet"}</span>
                {reverse && (
                  <span className="block truncate text-footnote text-ink-subtle">
                    Reverse{money(r?.reverseAmount ?? null) ? ` · ${money(r?.reverseAmount ?? null)}` : ""}: {reverse.id === me ? "You" : reverse.name}
                  </span>
                )}
              </span>
              {!ownLine && actions[0] && <ActionButton action={actions[0]} busy={busy} />}
            </div>
            {empty && (
              <p className="mt-1.5 pl-[3.25rem] text-footnote leading-snug text-ink-muted">
                That square is empty, so {/^Score \d+$/.test(row.label) ? "this score has" : `${row.label} has`} no winner unless you give it to someone.
              </p>
            )}
            {ownLine && actions.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2 pl-[3.25rem]">
                {actions.map((a) => (
                  <ActionButton key={a.key} action={a} busy={busy} />
                ))}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function ActionButton({ action, busy }: { action: RowAction; busy: boolean }) {
  return (
    <button
      type="button"
      disabled={busy}
      onClick={action.onClick}
      aria-label={action.aria}
      className={cx(
        "pressable tap-target flex h-10 shrink-0 items-center gap-1.5 rounded-xl px-3 text-footnote font-extrabold disabled:opacity-40",
        action.tone === "gold"
          ? "bg-gold-400 text-ink-inverse shadow-[inset_0_-2px_0_rgb(0_0_0/0.15)]"
          : "bg-surface-4 text-ink ring-1 ring-inset ring-line",
      )}
    >
      {action.icon}
      {action.label}
    </button>
  );
}

/** "Score 12" -> "#12"; period labels are already short. */
function shortLabel(label: string): string {
  const m = /^Score (\d+)$/.exec(label);
  return m ? `#${m[1]}` : label;
}
