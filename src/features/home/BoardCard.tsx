// Dashboard card for a board that hasn't kicked off, kept dense so a host
// with a handful of boards sees most of them at once: matchup, name, a quiet
// role label, then one count ("42 left") with a slim fill meter under it and
// the one thing to do next beside them, and what a friend just did. The whole
// card opens the board; the action button sits above that layer.

import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import type { GameSummary } from "../../../shared/types";
import { Avatar, Button, cx } from "../../components/ui";
import { relativeTime } from "../../lib/format";
import { prefetchGame } from "../../lib/live";
import { haptic } from "../../lib/native";
import { CountUp, FillMeter, Matchup, RoleLabel } from "./BoardBits";
import type { Buzz, CardModel } from "./sections";

export interface CardAction {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  /** The single most urgent action on the page gets the filled button; every other one is outlined. */
  primary: boolean;
}

export interface BoardCardProps {
  game: GameSummary;
  model: CardModel;
  action?: CardAction;
  /** A friend's latest moves on this board, if they're recent. */
  buzz?: Buzz | null;
  /** The buzz happened while Home was open: give it the "new" treatment. */
  buzzIsNew?: boolean;
  now?: number;
}

const STATUS_TONE: Record<CardModel["statusTone"], string> = {
  brand: "text-brand-300",
  gold: "text-gold-300",
  muted: "text-ink-muted",
};

export function BoardCard({ game, model, action, buzz, buzzIsNew = false, now = Date.now() }: BoardCardProps) {
  const left = Math.max(0, game.totalSquares - game.claimed);
  const gold = model.statusTone === "gold";
  return (
    <article
      className={cx(
        "relative overflow-hidden rounded-card bg-surface-2 py-3 pl-3 pr-3 shadow-card ring-1 ring-inset transition-transform duration-200 ease-spring",
        "has-[>a:active]:scale-[0.98] has-[>a:active]:duration-75",
        gold ? "ring-gold-400/40" : "ring-line",
      )}
    >
      {gold && <div aria-hidden className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,rgb(255_194_51/0.1),transparent_60%)]" />}
      <Link
        to={`/g/${game.id}`}
        onPointerDown={() => void prefetchGame(game.id)}
        onClick={() => void haptic("selection")}
        aria-label={`Open ${game.name}`}
        className="absolute inset-0 z-0 rounded-card"
      />
      <div className="pointer-events-none relative flex gap-3">
        <Matchup teamX={game.teamX} teamY={game.teamY} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <p className="min-w-0 flex-1 truncate font-display text-headline font-extrabold text-ink">{game.name}</p>
            <RoleLabel isHost={game.isHost} />
          </div>
          {/* One count ("42 left") with the fill meter right under it, and the action beside them. */}
          <div className="flex min-h-7 items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-footnote">
                <span className={cx("font-semibold", STATUS_TONE[model.statusTone])}>
                  {model.statusIsLeft ? (
                    <>
                      <CountUp value={left} /> left
                    </>
                  ) : (
                    model.status
                  )}
                </span>
                {model.meta && <span className="text-ink-subtle"> · {model.meta}</span>}
              </p>
              {model.meter && <FillMeter value={game.claimed} max={game.totalSquares} gold={gold} className="mt-1.5" />}
            </div>
            {action && (
              <div className="pointer-events-auto relative z-10 shrink-0">
                <Button
                  size="sm"
                  variant={action.primary ? "primary" : "ghost"}
                  haptic={action.primary ? "medium" : "light"}
                  leading={action.icon}
                  onClick={action.onClick}
                  // 36pt to keep the card compact; tap-target keeps the hit area 44pt.
                  className={cx("tap-target !h-9 !rounded-xl !px-3.5", !action.primary && "ring-1 ring-inset ring-line-strong")}
                >
                  {action.label}
                </Button>
              </div>
            )}
          </div>
          {buzz && <BuzzLine buzz={buzz} isNew={buzzIsNew} now={now} />}
        </div>
      </div>
    </article>
  );
}

/** "🦊 Maya grabbed 5 squares · just now": neutral text, the avatar carries the color; fresh news gets ink and a dot. */
function BuzzLine({ buzz, isNew, now }: { buzz: Buzz; isNew: boolean; now: number }) {
  return (
    <p key={`${buzz.text}|${buzz.at}`} className={cx("mt-2 flex min-w-0 items-center gap-1.5 text-caption", isNew && "home-buzz-new")}>
      <Avatar name={buzz.player.name} color={buzz.player.color} emoji={buzz.player.emoji} size="xs" decorative className="!h-4.5 !w-4.5 !text-[0.6rem]" />
      <span className={cx("truncate", isNew ? "font-semibold text-ink" : "text-ink-muted")}>
        {buzz.text}
        {buzz.others > 0 && <span className="text-ink-subtle"> +{buzz.others} more</span>}
      </span>
      <span className="shrink-0 text-ink-subtle">· {relativeTime(buzz.at, now)}</span>
      {isNew && <span aria-hidden className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-brand-400" />}
    </p>
  );
}
