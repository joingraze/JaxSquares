// Dashboard card for a board that hasn't kicked off: matchup, name, role,
// status, and (when there is one) the one thing to do next. The fill meter
// runs along the card's bottom edge.

import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import type { GameSummary } from "../../../shared/types";
import { Avatar, Button, cx } from "../../components/ui";
import { relativeTime } from "../../lib/format";
import { prefetchGame } from "../../lib/live";
import { haptic } from "../../lib/native";
import { Matchup, RoleBadge } from "./BoardBits";
import type { Buzz } from "./sections";

export interface CardAction {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  /** The single most important action on the screen gets the filled button. */
  primary: boolean;
  /** Filled color when primary. */
  tone?: "brand" | "gold";
}

export interface BoardCardProps {
  game: GameSummary;
  /** Status line under the name. */
  status: ReactNode;
  statusTone?: "muted" | "brand" | "gold";
  /** Short trailing detail on the status line, e.g. "10 yours". */
  meta?: ReactNode;
  action?: CardAction;
  /** Emphasize the card (e.g. a full board waiting on the host). */
  highlight?: "gold" | "brand";
  /** A friend's latest move on this board, if it's fresh. */
  buzz?: Buzz | null;
  now?: number;
}

export function BoardCard({ game, status, statusTone = "muted", meta, action, highlight, buzz, now = Date.now() }: BoardCardProps) {
  return (
    <article
      className={cx(
        "relative overflow-hidden rounded-card bg-surface-2 py-3.5 pl-3.5 pr-4 shadow-card ring-1 ring-inset transition-transform duration-200 ease-spring",
        "has-[>a:active]:scale-[0.98] has-[>a:active]:duration-75",
        highlight === "gold" ? "ring-gold-400/45" : "ring-line",
      )}
    >
      {highlight === "gold" && (
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,rgb(255_194_51/0.13),transparent_60%)]" />
      )}
      {/* The whole card opens the board; the action button sits above this layer. */}
      <Link
        to={`/g/${game.id}`}
        onPointerDown={() => void prefetchGame(game.id)}
        onClick={() => void haptic("selection")}
        aria-label={`Open ${game.name}`}
        className="absolute inset-0 z-0 rounded-card"
      />
      <div className="pointer-events-none relative flex items-center gap-3">
        <Matchup teamX={game.teamX} teamY={game.teamY} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="min-w-0 truncate font-display text-headline font-extrabold text-ink">{game.name}</p>
            <RoleBadge isHost={game.isHost} />
          </div>
          <div className={cx("flex items-center gap-3", action ? "mt-1.5" : "mt-0.5")}>
            <p className="min-w-0 flex-1 truncate text-footnote">
              <span
                className={cx(
                  "font-semibold",
                  statusTone === "gold" ? "text-gold-300" : statusTone === "brand" ? "text-brand-300" : "text-ink-muted",
                )}
              >
                {status}
              </span>
              {meta && <span className="text-ink-subtle"> · {meta}</span>}
            </p>
            {action && (
              <div className="pointer-events-auto relative z-10 -my-0.5 shrink-0">
                <Button
                  size="sm"
                  variant={action.primary ? (action.tone === "gold" ? "gold" : "primary") : "secondary"}
                  haptic={action.primary ? "medium" : "light"}
                  leading={action.icon}
                  onClick={action.onClick}
                >
                  {action.label}
                </Button>
              </div>
            )}
          </div>
          {buzz && (
            <p className="mt-1.5 flex min-w-0 items-center gap-1.5 text-caption">
              <Avatar name={buzz.player.name} color={buzz.player.color} emoji={buzz.player.emoji} size="xs" decorative className="!h-4.5 !w-4.5 !text-[0.6rem]" />
              <span className="truncate font-semibold text-accent-300">{buzz.text}</span>
              <span className="shrink-0 text-ink-subtle">· {relativeTime(buzz.at, now)}</span>
            </p>
          )}
        </div>
      </div>
      <EdgeMeter value={game.claimed} max={game.totalSquares} />
    </article>
  );
}

/** Fill meter along the bottom edge of a card. Full boards go gold. */
function EdgeMeter({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  const full = pct >= 100;
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-label={`${value} of ${max} squares claimed`}
      className="pointer-events-none absolute inset-x-0 bottom-0 h-[3px] bg-white/6"
    >
      <div
        className={cx(
          "h-full rounded-r-full transition-[width] duration-700 ease-out-quint",
          full ? "bg-gold-400 shadow-[0_0_10px_rgb(255_194_51/0.6)]" : "bg-brand-400 shadow-[0_0_10px_rgb(198_249_31/0.5)]",
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
