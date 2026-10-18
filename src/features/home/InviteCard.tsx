// Home's card for an invite: a friend's board that's open, with squares left,
// where I have none yet (I only opened the link, or joined without picking).
// It reads as an invitation, not as one of my boards: who asked me in, the
// matchup with its team colors, kickoff, how many squares are left, what the
// host shows for a square (price or "Just for fun", in-app only), then "Pick
// squares" and, for a board I only opened, a quiet "Not for me". The whole card
// opens the board; the buttons sit above that layer.

import { Fragment } from "react";
import { Link } from "react-router-dom";
import type { GameSummary } from "../../../shared/types";
import { MailIcon, TrophyIcon } from "../../components/icons";
import { Avatar, Button, cx } from "../../components/ui";
import { teamVars } from "../../lib/format";
import { prefetchGame } from "../../lib/live";
import { haptic } from "../../lib/native";
import { useResolvedTheme } from "../../lib/theme";
import { CountUp, FillMeter, Matchup } from "./BoardBits";
import type { InviteModel } from "./sections";

export interface InviteCardProps {
  game: GameSummary;
  model: InviteModel;
  /** The page's single most urgent action gets the filled button; the rest are outlined. */
  primary: boolean;
  onPick: () => void;
  /** Hides a board I only opened (shown only when the model allows it). */
  onHide?: () => void;
}

export function InviteCard({ game, model, primary, onPick, onHide }: InviteCardProps) {
  const theme = useResolvedTheme();
  const { inviter, lineup } = model;
  return (
    <article
      data-testid="invite-card"
      data-game={game.id}
      style={teamVars(game.teamX, game.teamY, theme)}
      className={cx(
        "relative overflow-hidden rounded-card bg-surface-2 shadow-card ring-1 ring-inset ring-accent-500/35 transition-transform duration-200 ease-spring",
        "has-[>a:active]:scale-[0.98] has-[>a:active]:duration-75",
      )}
    >
      {/* The matchup's colors, faintly, from the top corners (fully faded before the wash ends). */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-44 bg-[radial-gradient(75%_110%_at_0%_0%,color-mix(in_srgb,var(--team-x)_18%,transparent),transparent_70%),radial-gradient(75%_110%_at_100%_0%,color-mix(in_srgb,var(--team-y)_18%,transparent),transparent_70%)]"
      />
      <Link
        to={`/g/${game.id}`}
        onPointerDown={() => void prefetchGame(game.id)}
        onClick={() => void haptic("selection")}
        aria-label={`Open ${game.name}`}
        className="absolute inset-0 z-0 rounded-card"
      />

      <div className="pointer-events-none relative">
        {/* Who asked me in. */}
        <div className="flex items-center gap-2 border-b border-accent-500/15 bg-accent-500/8 py-2 pl-3 pr-2.5">
          {inviter ? (
            <Avatar name={inviter.name || "Host"} color={inviter.color || "#ff66a6"} emoji={inviter.emoji} size="xs" decorative />
          ) : (
            <span aria-hidden className="grid h-5.5 w-5.5 place-items-center rounded-full bg-accent-500/20 text-ink-accent">
              <MailIcon size={13} strokeWidth={2.4} />
            </span>
          )}
          <p className="min-w-0 flex-1 truncate text-footnote text-ink-muted">
            {inviter?.name.trim() ? (
              <>
                <span className="font-bold text-ink">{inviter.name.trim()}</span> invited you
              </>
            ) : (
              <span className="font-bold text-ink">{model.from}</span>
            )}
          </p>
          <MailIcon size={16} strokeWidth={2.2} className="mr-0.5 shrink-0 text-ink-accent" />
        </div>

        <div className="px-3 pb-3 pt-3">
          <div className="flex items-center gap-3">
            <Matchup teamX={game.teamX} teamY={game.teamY} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-headline font-extrabold text-ink">{game.name}</p>
              <p className="truncate text-footnote text-ink-muted">
                {model.matchup}
                {model.kickoff && <span className="text-ink-subtle"> · {model.kickoff}</span>}
              </p>
            </div>
          </div>

          <div className="mt-3">
            <p className="flex items-baseline gap-2 text-footnote">
              <span className="font-semibold text-ink-brand">
                <CountUp value={model.left} /> {model.left === 1 ? "square" : "squares"} left
              </span>
              <span className="ml-auto text-caption text-ink-subtle">
                {game.playerCount} {game.playerCount === 1 ? "player" : "players"} in
              </span>
            </p>
            <FillMeter value={game.claimed} max={game.totalSquares} className="mt-1.5" />
          </div>

          {lineup && (
            <p className="mt-2.5 flex min-w-0 items-start gap-1.5 text-footnote">
              {lineup.fun ? (
                <span className="inline-flex h-5 items-center rounded-md bg-accent-500/20 px-1.5 text-caption font-extrabold text-ink-accent">Just for fun</span>
              ) : (
                <>
                  <TrophyIcon size={14} filled className="mt-0.5 shrink-0 text-ink-gold" />
                  <span className="line-clamp-2 min-w-0 font-bold tabular-nums text-ink">
                    {/* Each part stays whole ("Q3 $100"); the line breaks only between parts. */}
                    {lineup.parts.map((p, i) => (
                      <Fragment key={p}>
                        {i > 0 && " "}
                        <span className="whitespace-nowrap">
                          {i > 0 && <span aria-hidden className="mr-1 font-normal text-ink-subtle">·</span>}
                          <span className={i === 0 ? "text-ink-gold" : undefined}>{p}</span>
                        </span>
                      </Fragment>
                    ))}
                  </span>
                </>
              )}
            </p>
          )}

          <div className="pointer-events-auto relative z-10 mt-3 flex items-center gap-2">
            <Button
              data-testid="invite-pick"
              size="sm"
              variant={primary ? "primary" : "secondary"}
              haptic={primary ? "medium" : "light"}
              onClick={onPick}
              className="flex-1"
            >
              Pick squares
            </Button>
            {model.canHide && onHide && (
              <Button data-testid="invite-hide" size="sm" variant="ghost" haptic="light" onClick={onHide} className="text-ink-muted">
                Not for me
              </Button>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
