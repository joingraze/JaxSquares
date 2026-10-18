// "Right now": pinned above the grid while numbers are drawn and the game
// isn't over. Answers the two questions a fan has mid-game: who has the
// period if it ended now, and how close am I (in plain football terms).
// Every-score boards ask a different question, "where does the next score
// land?", so they get the four likeliest scores and whose square each hits.
//
// Kept to two short rows so the whole grid still fits on the first screen.

import type { ReactNode } from "react";
import { formatAmount, periodPhrase } from "../../../shared/formats";
import type { Player, Team } from "../../../shared/types";
import { FootballIcon, TrophyIcon } from "../../components/icons";
import { Avatar, cx } from "../../components/ui";
import { nowSentence, playName, type NowView, type ScoringPlay } from "./boardModel";

export interface RightNowProps {
  now: NowView;
  players: Player[];
  me: string;
  teamX: Team;
  teamY: Team;
  /** Tap: spotlight the square on the board. */
  onShow: () => void;
}

type TeamOf = (side: ScoringPlay["team"]) => Team;

const abbrOf = (t: Team) => t.abbr || t.name.slice(0, 3).toUpperCase();

export function RightNow({ now, players, me, teamX, teamY, onShow }: RightNowProps) {
  const byId = new Map(players.map((p) => [p.id, p]));
  const owner = now.ownerId ? (byId.get(now.ownerId) ?? null) : null;
  const teamOf: TeamOf = (side) => (side === "x" ? teamX : teamY);
  const score = `${now.scoreX}–${now.scoreY}`;
  const period = periodPhrase(now.periodKey ?? "", now.label);

  return (
    <section
      aria-label="Right now"
      data-live={now.live}
      className={cx(
        "jx-now-card relative overflow-hidden rounded-card ring-1 ring-inset",
        now.mine && !now.everyScore
          ? "bg-[linear-gradient(135deg,rgb(198_249_31/0.2),rgb(198_249_31/0.04)_60%)] bg-surface-2 ring-brand-line/60"
          : now.live
            ? "bg-[linear-gradient(135deg,rgb(255_64_64/0.2),rgb(255_64_64/0.03)_60%)] bg-surface-2 ring-live-500/50"
            : "bg-surface-2 ring-line-strong",
      )}
    >
      {now.everyScore ? (
        <NextScore now={now} byId={byId} me={me} teamOf={teamOf} score={score} onShow={onShow} />
      ) : (
        <button type="button" onClick={onShow} className="pressable flex w-full items-center gap-3 px-3 py-2.5 text-left">
          {owner || now.mine ? (
            <Avatar
              name={owner?.name ?? "You"}
              color={owner?.color ?? "#c6f91f"}
              emoji={owner?.emoji}
              size="md"
              ring={now.mine ? "brand" : "none"}
              decorative
              className={now.live && !now.mine ? "ring-2 ring-live-500 ring-offset-2 ring-offset-surface-2" : undefined}
            />
          ) : (
            <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-full border-2 border-dashed border-line-strong text-headline text-ink-subtle">
              ?
            </span>
          )}
          <span className="min-w-0 flex-1">
            <span className="flex min-w-0 items-center gap-2">
              {now.live ? (
                <span className="eyebrow inline-flex h-5 shrink-0 items-center gap-1 rounded-md bg-live-500 px-1.5 text-white">
                  <span aria-hidden className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
                  Live
                </span>
              ) : (
                <span className="eyebrow inline-flex h-5 shrink-0 items-center rounded-md bg-surface-4 px-1.5 text-ink-muted ring-1 ring-inset ring-line-strong">
                  {period.short}
                </span>
              )}
              <span className={cx("min-w-0 truncate font-display text-headline font-extrabold leading-tight", now.mine ? "text-ink-brand" : "text-ink")}>
                {now.mine ? "You!" : owner ? owner.name : "Empty square"}
              </span>
              {/* The square's numbers, labeled by team (never by color alone). */}
              <span aria-label={`${teamX.name} ${now.digits.x}, ${teamY.name} ${now.digits.y}`} className="ml-auto flex shrink-0 items-center gap-1">
                <DigitTag abbr={abbrOf(teamX)} digit={now.digits.x} side="x" hot={now.live} />
                <DigitTag abbr={abbrOf(teamY)} digit={now.digits.y} side="y" hot={now.live} />
              </span>
            </span>
            <span className="mt-0.5 block text-footnote font-semibold leading-snug text-ink-muted">
              {nowSentence(now)}
              {now.amount ? <b className="font-extrabold tabular-nums text-ink-gold"> · {formatAmount(now.amount, now.unit)}</b> : null}
            </span>
          </span>
        </button>
      )}
      <PathLine now={now} byId={byId} me={me} teamOf={teamOf} />
    </section>
  );
}

function DigitTag({ abbr, digit, side, hot }: { abbr: string; digit: string; side: "x" | "y"; hot: boolean }) {
  return (
    <span aria-hidden className="flex h-6 items-center gap-1 rounded-lg bg-canvas/60 py-0.5 pl-1.5 pr-0.5 ring-1 ring-inset ring-line-strong">
      <span className="flex items-center gap-1 text-[0.625rem] font-extrabold tracking-wide text-ink-muted">
        <span className={cx("h-1.5 w-1.5 rounded-full", side === "x" ? "bg-team-x" : "bg-team-y")} />
        {abbr}
      </span>
      <span
        className={cx(
          "grid h-5 min-w-5 place-items-center rounded-md px-1 font-display text-footnote font-extrabold tabular-nums",
          hot ? "bg-live-500 text-white" : "bg-ink text-canvas",
        )}
      >
        {digit}
      </span>
    </span>
  );
}

function TeamChip({ side, team, points }: { side: ScoringPlay["team"]; team: Team; points: number[] }) {
  return (
    <span
      className={cx(
        "inline-flex h-5 shrink-0 items-center rounded-md px-1.5 text-[0.6875rem] font-extrabold tabular-nums",
        side === "x" ? "bg-team-x text-team-x-ink" : "bg-team-y text-team-y-ink",
      )}
    >
      {abbrOf(team)} {points.map((p) => `+${p}`).join(" ")}
    </span>
  );
}

/** Every-score boards: the next TD or field goal by either team, and whose square it lands on. */
function NextScore({
  now,
  byId,
  me,
  teamOf,
  score,
  onShow,
}: {
  now: NowView;
  byId: Map<string, Player>;
  me: string;
  teamOf: TeamOf;
  score: string;
  onShow: () => void;
}) {
  return (
    <div className="px-3 pb-2.5 pt-2">
      <button type="button" onClick={onShow} className="flex min-h-7 w-full items-center justify-between gap-2 text-left">
        <span className="flex min-w-0 items-center gap-2">
          {now.live && (
            <span className="eyebrow inline-flex h-5 shrink-0 items-center gap-1 rounded-md bg-live-500 px-1.5 text-white">
              <span aria-hidden className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
              Live
            </span>
          )}
          <span className={cx("eyebrow truncate", now.live ? "text-ink-live" : "text-ink-muted")}>
            {now.live && now.detail ? `Next score wins · ${now.detail}` : "Next score wins"}
          </span>
        </span>
        <span className="shrink-0 text-caption font-bold tabular-nums text-ink-muted">Now {score}</span>
      </button>
      <ul className="mt-1.5 grid grid-cols-2 gap-1.5">
        {now.outcomes.map((o) => {
          const p = o.ownerId ? byId.get(o.ownerId) : undefined;
          const mine = o.ownerId !== null && o.ownerId === me;
          return (
            <li
              key={`${o.play.team}${o.play.points}`}
              className={cx(
                "flex h-8 min-w-0 items-center gap-1.5 rounded-xl pl-1.5 pr-2 ring-1 ring-inset",
                mine ? "bg-brand-400/15 ring-brand-line/70" : "bg-canvas/40 ring-line",
              )}
            >
              <TeamChip side={o.play.team} team={teamOf(o.play.team)} points={[o.play.points]} />
              {p ? (
                <Avatar name={p.name} color={p.color} emoji={p.emoji} size="xs" decorative />
              ) : (
                <span aria-hidden className="h-[22px] w-[22px] shrink-0 rounded-full border border-dashed border-line-strong" />
              )}
              <span className={cx("min-w-0 truncate text-footnote font-bold", mine ? "text-ink-brand" : p ? "text-ink" : "text-ink-subtle")}>
                {mine ? "You!" : p ? p.name : "Empty"}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** "a Cowboys touchdown and a Giants field goal", "two Cowboys touchdowns", "a Cowboys touchdown and field goal". */
function playsPhrase(plays: ScoringPlay[], teamOf: TeamOf): string {
  const [a, b] = plays;
  const name = (p: ScoringPlay) => teamOf(p.team).name;
  if (!b) return `a ${name(a)} ${playName(a.points)}`;
  if (a.team === b.team && a.points === b.points) return `two ${name(a)} ${playName(a.points)}s`;
  if (a.team === b.team) return `a ${name(a)} ${playName(a.points)} and ${playName(b.points)}`;
  return `a ${name(a)} ${playName(a.points)} and a ${name(b)} ${playName(b.points)}`;
}

function PathLine({ now, byId, me, teamOf }: { now: NowView; byId: Map<string, Player>; me: string; teamOf: TeamOf }) {
  const nameOf = (id: string | null) => (id === me ? "you" : (byId.get(id ?? "")?.name ?? (id ? "someone" : "an empty square")));
  const leading = now.mine && !now.everyScore;

  let icon = <FootballIcon size={13} />;
  let text: ReactNode;
  let chips: ScoringPlay[] = [];
  if (leading) {
    icon = <TrophyIcon size={13} filled />;
    text = now.threat ? (
      <>
        <b className="font-extrabold text-ink-brand">Hold on!</b> {cap(playsPhrase([now.threat.play], teamOf))} would hand it to {nameOf(now.threat.ownerId)}.
      </>
    ) : (
      <b className="font-extrabold text-ink-brand">Hold on! It's yours if nobody scores.</b>
    );
  } else if (now.path && now.path.plays.length > 0) {
    chips = now.path.plays;
    text = (
      <>
        <b className="font-extrabold text-ink">{now.path.plays.length === 1 ? "1 score away:" : "2 scores away:"}</b> {playsPhrase(now.path.plays, teamOf)}{" "}
        {now.path.plays.length === 1 ? (now.everyScore ? "lands on your square" : "puts you in front") : now.everyScore ? "get you there" : "put you in front"}
      </>
    );
  } else if (now.mineCount > 0) {
    text = now.everyScore ? <>None of the likely next scores hit your squares. Hang in there.</> : <>Your squares need a few more scores. Plenty of game left.</>;
  } else {
    return null;
  }

  // One chip per team: "DAL +7 +3".
  const perTeam = (["x", "y"] as const)
    .map((side) => ({ side, points: chips.filter((c) => c.team === side).map((c) => c.points) }))
    .filter((t) => t.points.length > 0);

  return (
    <div className="jx-now-path flex items-center gap-2 border-t border-line bg-canvas/40 px-3 py-1.5">
      <span
        aria-hidden
        className={cx("grid h-6 w-6 shrink-0 place-items-center rounded-full", leading ? "bg-brand-400 text-ink-inverse" : "bg-surface-4 text-ink")}
      >
        {icon}
      </span>
      <p className="min-w-0 flex-1 text-caption leading-snug text-ink-muted">{text}</p>
      {perTeam.length > 0 && (
        <span className="flex shrink-0 flex-col items-end gap-0.5">
          {perTeam.map((t) => (
            <TeamChip key={t.side} side={t.side} team={teamOf(t.side)} points={t.points} />
          ))}
        </span>
      )}
    </div>
  );
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
