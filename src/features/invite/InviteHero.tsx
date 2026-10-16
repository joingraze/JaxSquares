// The first thing a friend sees after tapping an invite: who asked them, the
// matchup in team colors, who's already in, what's at stake, and exactly one
// thing to do ("Tap any open square to jump in"), with Join as the backup.
import type { GameState } from "../../../shared/types";
import { ClockIcon } from "../../components/icons";
import { Avatar, AvatarGroup, Button, cx, LiveDot, Meter, TeamMark } from "../../components/ui";
import { kickoffLabel, teamVars } from "../../lib/format";
import "./invite.css";
import { boardStats, headlinePrize, hostOf, isUrgent, matchupSize, peopleInOrder, playersInLabel, squaresLeftLabel, winnersLine } from "./inviteModel";
import { useNewArrival } from "./useNewArrival";

const MATCHUP_TEXT = { lg: "text-title-2", md: "text-title-3", sm: "text-headline" } as const;

export interface InviteHeroProps {
  state: GameState;
  onJoin: () => void;
  /** Devices on the board right now (useGame's `watching`), shown as live presence. */
  watching?: number;
  className?: string;
}

export function InviteHero({ state, onJoin, watching = 0, className }: InviteHeroProps) {
  const { game } = state;
  const host = hostOf(state);
  const people = peopleInOrder(state);
  const stats = boardStats(state);
  const prize = headlinePrize(game);
  const open = game.status === "open" || game.status === "draft";
  const full = open && stats.left === 0;
  const kickoff = game.linkedEvent && open && game.linkedEvent.startsAt > Date.now() ? kickoffLabel(game.linkedEvent.startsAt) : null;
  const others = Math.max(0, people.length - (host ? 1 : 0));
  const urgent = open && isUrgent(stats.left, stats.total);
  const arrival = useNewArrival(state.players, true);

  const instruction = !open
    ? game.status === "final"
      ? "Game over. Scroll down to see who won."
      : "Numbers are drawn. Join to follow every score."
    : full
      ? "Every square is taken. Join to follow along."
      : "Tap any open square to jump in";

  return (
    <section
      aria-label="You're invited"
      style={teamVars(game.teamX, game.teamY)}
      className={cx("invite-rise relative overflow-hidden rounded-card bg-surface-2 shadow-float ring-1 ring-inset ring-line-strong", className)}
    >
      {/* Team-color floodlights */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          background:
            "radial-gradient(70% 90% at -10% -20%, var(--team-x), transparent 62%), radial-gradient(70% 90% at 110% -20%, var(--team-y), transparent 62%)",
        }}
      />
      <div aria-hidden className="endzone-stripes pointer-events-none absolute inset-x-0 top-0 h-24 text-white opacity-30 [mask-image:linear-gradient(180deg,#000,transparent)]" />

      <div className="relative px-4 pb-3.5 pt-3.5">
        {/* Who invited you + presence */}
        <div className="flex items-center gap-2">
          {host && <Avatar name={host.name} color={host.color} emoji={host.emoji} size="sm" decorative className="animate-pop" />}
          <p className="min-w-0 flex-1 truncate text-subhead text-ink-muted">
            {host ? (
              <>
                <span className="font-bold text-ink">{host.name}</span> invited you
              </>
            ) : (
              "You're invited"
            )}
          </p>
          {watching >= 2 ? (
            <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-canvas/50 px-2 py-1 text-caption font-bold text-brand-300 ring-1 ring-inset ring-brand-400/25">
              <LiveDot tone="brand" />
              {watching} here now
            </span>
          ) : (
            kickoff && (
              <span className="flex shrink-0 items-center gap-1 text-caption font-bold text-ink-muted">
                <ClockIcon size={14} />
                {kickoff}
              </span>
            )
          )}
        </div>

        {/* Matchup */}
        <h2
          className={cx(
            "mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 font-display font-extrabold leading-tight text-ink",
            MATCHUP_TEXT[matchupSize(game)],
          )}
        >
          <span className="inline-flex min-w-0 items-center gap-2">
            <TeamMark team={game.teamX} size="sm" />
            <span className="min-w-0">{game.teamX.name}</span>
          </span>
          <span className="shrink-0 text-subhead font-bold text-ink-subtle">vs</span>
          <span className="inline-flex min-w-0 items-center gap-2">
            <TeamMark team={game.teamY} size="sm" />
            <span className="min-w-0">{game.teamY.name}</span>
          </span>
        </h2>
        <p className="mt-1 truncate text-footnote text-ink-muted">
          {winnersLine(game.format.periods)}
          {game.format.reverse && " · reverse squares win too"}
        </p>

        {prize && (
          <p className="mt-2.5 inline-flex max-w-full items-center gap-1.5 rounded-full bg-gold-400/12 py-1 pl-2 pr-2.5 text-footnote font-bold text-gold-200 ring-1 ring-inset ring-gold-400/30">
            <span aria-hidden>🏆</span>
            {prize.label && <span className="eyebrow text-gold-400">{prize.label}</span>}
            <span className="truncate">{prize.note}</span>
          </p>
        )}

        {/* Who's in + how full */}
        <div className="mt-3.5 flex items-center gap-2.5">
          {arrival ? (
            // Spotlight: the newcomer takes the stack's place for a few seconds.
            <p key={arrival.id} role="status" className="flex min-w-0 flex-1 animate-pop items-center gap-2.5 text-footnote font-extrabold text-brand-300">
              <Avatar name={arrival.name} color={arrival.color} emoji={arrival.emoji} size="sm" ring="brand" decorative />
              <span className="truncate">{arrival.name} just joined!</span>
            </p>
          ) : (
            <>
              {people.length > 0 && <AvatarGroup people={people} max={4} size="sm" className="invite-stagger" />}
              <p className="min-w-0 flex-1 truncate text-footnote font-semibold text-ink">
                {people.length === 0 ? "Be the first one in" : others > 0 ? playersInLabel(people.length) : "Just the host so far"}
              </p>
            </>
          )}
          {open && (
            <span className={cx("shrink-0 text-footnote tabular-nums", urgent ? "font-extrabold text-gold-300" : "font-bold text-ink")}>
              {urgent ? `Only ${stats.left} left!` : squaresLeftLabel(stats.left)}
            </span>
          )}
        </div>
        {open && (
          <Meter value={stats.claimed} max={stats.total} showCount={false} size="sm" tone={urgent ? "gold" : "brand"} className="mt-2" />
        )}
      </div>

      {/* The one thing to do */}
      <div className="relative flex items-center gap-3 border-t border-brand-400/20 bg-brand-400/[0.08] py-2.5 pl-4 pr-2.5">
        {open && !full && (
          <span aria-hidden className="invite-point text-title-3 leading-none">
            👇
          </span>
        )}
        <p className="min-w-0 flex-1 text-callout font-extrabold leading-snug text-brand-200">{instruction}</p>
        {game.status !== "final" && (
          <Button size="sm" variant={open && !full ? "secondary" : "primary"} onClick={onJoin} className="shrink-0">
            Join
          </Button>
        )}
      </div>
    </section>
  );
}
