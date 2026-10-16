// "Live now" hero card: scoreboard, clock, and who holds the square that's
// winning right now (gold when it's you). It carries the specifics of a win
// ("Your square hit · Halftime · Loser buys wings"); the page headline only
// summarizes the day.

import { Link } from "react-router-dom";
import type { GameState, GameSummary } from "../../../shared/types";
import { ChevronRightIcon, TrophyIcon } from "../../components/icons";
import { Avatar, Badge, cx, Skeleton, TeamMark } from "../../components/ui";
import { pluralize, teamVars } from "../../lib/format";
import { useProfile } from "../../lib/identity";
import { prefetchGame } from "../../lib/live";
import { haptic } from "../../lib/native";
import { RoleLabel, TickNumber } from "./BoardBits";
import { capitalize, liveSnapshot, phraseOf, withTeamColors, type LiveSnapshot } from "./sections";

export interface LiveCardProps {
  game: GameSummary;
  state: GameState | undefined;
  me: string;
  /** Narrower card inside the live carousel. */
  compact?: boolean;
}

export function LiveCard({ game, state, me, compact = false }: LiveCardProps) {
  const snap = state ? liveSnapshot(state, me) : null;
  const fallback = !snap && game.live ? game.live : null;
  const inProgress = snap?.inProgress ?? fallback?.state === "in";
  // Hosts enter scores on custom boards: once one is in, the game is on.
  const onAir = inProgress || (snap?.hasScore ?? !!game.latestScore);
  const [teamX, teamY] = withTeamColors(game.teamX, game.teamY);
  const wins = new Set(game.myWins.map((w) => w.periodKey));
  // The banner already says it when your square hit the latest period; the footer counts the rest.
  const bannerIsMyWin = !!snap?.meWinning && snap.leader?.kind === "last";
  const firstWin = game.myWins[0];

  return (
    <Link
      to={`/g/${game.id}`}
      onPointerDown={() => void prefetchGame(game.id)}
      onClick={() => void haptic("selection")}
      aria-label={`${game.name}, ${game.teamX.name} vs ${game.teamY.name}`}
      className="pressable block h-full rounded-card"
    >
      <article
        style={teamVars(game.teamX, game.teamY)}
        className={cx(
          "relative h-full overflow-hidden rounded-card bg-surface-2 p-4 shadow-card ring-1 ring-inset",
          snap?.meWinning ? "ring-gold-400/60" : "ring-line-strong",
        )}
      >
        {/* Team-color floodlights from each side. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(70%_90%_at_0%_30%,color-mix(in_srgb,var(--color-team-x)_26%,transparent),transparent_70%),radial-gradient(70%_90%_at_100%_30%,color-mix(in_srgb,var(--color-team-y)_26%,transparent),transparent_70%)]"
        />
        <div className="relative">
          <div className="flex items-center gap-2">
            {onAir ? (
              <Badge tone="live" icon={<span className="block h-1.5 w-1.5 animate-pulse rounded-full bg-white" />}>
                Live
              </Badge>
            ) : (
              <Badge tone="neutral">Numbers in</Badge>
            )}
            <p className="min-w-0 flex-1 truncate text-subhead font-bold text-ink">{game.name}</p>
            <RoleLabel isHost={game.isHost} />
          </div>

          <Scoreboard game={game} teams={[teamX, teamY]} snap={snap} fallback={fallback} compact={compact} />

          {snap ? (
            <LeaderStrip snap={snap} />
          ) : game.leaderPlayerId === me && game.latestScore ? (
            <MyWinBanner title="Your square's up!" sub="" digits={null} />
          ) : (
            <Skeleton className="mt-3 h-14 w-full rounded-2xl" />
          )}

          <div className="mt-2.5 flex items-center gap-2 text-footnote text-ink-muted">
            <span className="font-semibold">{game.mySquares > 0 ? `${pluralize(game.mySquares, "square")} yours` : "Watching"}</span>
            {wins.size > 0 && !(bannerIsMyWin && wins.size === 1) && (
              <span className="inline-flex min-w-0 items-center gap-1 font-bold text-gold-300">
                <TrophyIcon size={13} strokeWidth={2.4} className="shrink-0" />
                <span className="truncate">
                  {wins.size === 1 && firstWin ? `Hit ${phraseOf(firstWin.periodKey, firstWin.label).moment}` : `${wins.size} hits`}
                </span>
              </span>
            )}
            <ChevronRightIcon size={16} className="ml-auto shrink-0 text-ink-subtle" />
          </div>
        </div>
      </article>
    </Link>
  );
}

function Scoreboard({
  game,
  teams,
  snap,
  fallback,
  compact,
}: {
  game: GameSummary;
  teams: [GameSummary["teamX"], GameSummary["teamY"]];
  snap: LiveSnapshot | null;
  fallback: GameSummary["live"];
  compact: boolean;
}) {
  const summaryScore = !snap ? (game.latestScore ?? null) : null;
  const scoreX = snap?.hasScore ? snap.scoreX : fallback ? fallback.scoreX : (summaryScore?.scoreX ?? null);
  const scoreY = snap?.hasScore ? snap.scoreY : fallback ? fallback.scoreY : (summaryScore?.scoreY ?? null);
  const clock = snap?.clock ?? fallback?.detail ?? summaryScore?.label ?? "Numbers drawn";
  const lead = scoreX !== null && scoreY !== null ? Math.sign(scoreX - scoreY) : 0;
  return (
    <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
      <TeamSide team={teams[0]} score={scoreX} dim={lead < 0} compact={compact} />
      <div className={cx("flex flex-col items-center text-center", compact ? "min-w-[4.5rem]" : "min-w-[5.5rem]")}>
        <span className="eyebrow text-ink">{clock}</span>
        {snap?.nextLabel && !snap.inProgress && <span className="mt-1 text-caption font-semibold text-ink-subtle">{snap.nextLabel} up next</span>}
      </div>
      <TeamSide team={teams[1]} score={scoreY} dim={lead > 0} compact={compact} reverse />
    </div>
  );
}

function TeamSide({
  team,
  score,
  dim,
  reverse,
  compact,
}: {
  team: GameSummary["teamX"];
  score: number | null;
  dim: boolean;
  reverse?: boolean;
  compact: boolean;
}) {
  return (
    <div className={cx("flex items-center", compact ? "gap-2" : "gap-2.5", reverse && "flex-row-reverse")}>
      <TeamMark team={team} size={compact ? "sm" : "md"} />
      <span
        className={cx(
          "font-display font-extrabold leading-none tracking-[-0.04em] tabular-nums",
          compact ? "text-[2.25rem]" : "text-[2.75rem]",
          dim ? "text-ink-muted" : "text-ink",
        )}
      >
        {score === null ? <span className="text-ink-subtle">–</span> : <TickNumber value={score} />}
      </span>
    </div>
  );
}

function LeaderStrip({ snap }: { snap: LiveSnapshot }) {
  const leader = snap.leader;

  if (!leader) {
    return (
      <div className="mt-3 flex items-center gap-3 rounded-2xl bg-black/25 px-3 py-2.5 ring-1 ring-inset ring-line">
        <span aria-hidden className="grid h-9 w-9 place-items-center rounded-full bg-surface-4 text-lg">
          🎲
        </span>
        <p className="text-subhead font-semibold text-ink-muted">
          Numbers are in. {snap.nextMoment ? `First winner ${snap.nextMoment}.` : "First score wins."}
        </p>
      </div>
    );
  }

  const digits = leader.digits ? `${leader.digits[0]}·${leader.digits[1]}` : null;
  // "at halftime", "at the end of Q3", "on score 4": the one period vocabulary.
  const moment = leader.periodKey ? phraseOf(leader.periodKey, leader.periodLabel).moment : "";
  if (snap.meWinning) {
    const sub =
      leader.kind === "now"
        ? moment
          ? `Yours ${moment} if the score holds`
          : "Yours if the score holds"
        : [capitalize(moment), leader.prize].filter(Boolean).join(" · ");
    return <MyWinBanner title={leader.kind === "now" ? "You're winning right now!" : "Your square hit!"} sub={sub} digits={digits} />;
  }

  const name = leader.player?.name ?? (leader.playerId ? "Someone" : "Nobody");
  const verb =
    leader.kind === "now"
      ? leader.playerId
        ? moment
          ? `wins ${moment} if it holds`
          : "has the square right now"
        : "has this square"
      : leader.playerId
        ? `hit ${moment}`.trim()
        : `had the square ${moment}`.trim();
  return (
    <div className="mt-3 flex items-center gap-3 rounded-2xl bg-black/25 px-3 py-2.5 ring-1 ring-inset ring-line">
      {leader.player ? (
        <Avatar name={leader.player.name} color={leader.player.color} emoji={leader.player.emoji} size="md" decorative />
      ) : (
        <span aria-hidden className="grid h-9 w-9 place-items-center rounded-full bg-surface-4 text-ink-subtle">
          ?
        </span>
      )}
      <p className="min-w-0 flex-1 truncate text-subhead text-ink-muted">
        <span className="font-extrabold text-ink">{name}</span> {verb}
      </p>
      {digits && <DigitsChip digits={digits} />}
    </div>
  );
}

function MyWinBanner({ title, sub, digits }: { title: string; sub: string; digits: string | null }) {
  const profile = useProfile();
  return (
    <div className="mt-3 flex animate-win-glow items-center gap-3 rounded-2xl bg-[linear-gradient(100deg,rgb(255_194_51/0.28),rgb(255_171_15/0.1))] px-3 py-2.5 ring-1 ring-inset ring-gold-400/60">
      <Avatar name={profile.name || "You"} color={profile.color} emoji={profile.emoji} size="md" ring="gold" decorative />
      <div className="min-w-0 flex-1">
        <p className="truncate font-display text-headline font-extrabold text-foil">{title}</p>
        {sub && <p className="truncate text-caption font-semibold text-gold-200/80">{sub}</p>}
      </div>
      {digits && <DigitsChip digits={digits} tone="gold" />}
    </div>
  );
}

function DigitsChip({ digits, tone = "neutral" }: { digits: string; tone?: "neutral" | "gold" }) {
  return (
    <span
      aria-label={`Square ${digits.replace("·", " and ")}`}
      className={cx(
        "grid h-9 min-w-11 shrink-0 place-items-center rounded-xl px-2 font-display text-callout font-extrabold tabular-nums",
        tone === "gold" ? "bg-gold-400 text-ink-inverse" : "bg-surface-4 text-ink ring-1 ring-inset ring-line-strong",
      )}
    >
      {digits}
    </span>
  );
}
