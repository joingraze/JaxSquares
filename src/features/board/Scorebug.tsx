// Broadcast-style scoreboard at the top of a board: both teams in their colors,
// the score (live or last recorded), where the game is, and who's here.

import type { GameState } from "../../../shared/types";
import { WifiOffIcon } from "../../components/icons";
import { AvatarGroup, Badge, LiveDot, ProgressRing, TeamMark, cx } from "../../components/ui";
import { countdown, kickoffLabel } from "../../lib/format";
import type { ConnectionState } from "../../lib/live";
import { boardPhase, claimedCount, headlineScore, type BoardPhase } from "./boardModel";

export interface ScorebugProps {
  state: GameState;
  watching: number;
  connection: ConnectionState;
  /** Label of the next period to be decided (e.g. "Q1"), for locked boards. */
  nextLabel: string | null;
  now: number;
}

export function Scorebug({ state, watching, connection, nextLabel, now }: ScorebugProps) {
  const { game } = state;
  const phase = boardPhase(state);
  const score = headlineScore(state);
  const leader = score ? Math.sign(score.scoreX - score.scoreY) : 0;

  return (
    <section
      aria-label="Scoreboard"
      className="relative overflow-hidden rounded-card bg-surface-2 shadow-card ring-1 ring-inset ring-line"
    >
      {/* Team color washes from each side. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "linear-gradient(90deg, color-mix(in srgb, var(--team-x) 30%, transparent), transparent 38%, transparent 62%, color-mix(in srgb, var(--team-y) 30%, transparent))",
        }}
      />
      <div aria-hidden className="absolute inset-y-0 left-0 w-1 bg-team-x" />
      <div aria-hidden className="absolute inset-y-0 right-0 w-1 bg-team-y" />

      <div className="relative grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 px-4 pb-3 pt-3.5">
        <TeamSide side="x" name={game.teamX.name} team={game.teamX} score={score?.scoreX ?? null} dim={leader < 0} />
        <Center phase={phase} state={state} detail={score?.detail ?? null} nextLabel={nextLabel} now={now} />
        <TeamSide side="y" name={game.teamY.name} team={game.teamY} score={score?.scoreY ?? null} dim={leader > 0} />
      </div>

      <div className="relative flex min-h-11 items-center gap-2.5 border-t border-line bg-black/15 px-4 py-2">
        {state.players.length > 0 && (
          <AvatarGroup
            size="xs"
            max={4}
            people={state.players.map((p) => ({ id: p.id, name: p.name, color: p.color, emoji: p.emoji }))}
          />
        )}
        <p className="min-w-0 flex-1 truncate text-footnote text-ink-muted">
          <span className="font-bold text-ink">{state.players.length}</span> {state.players.length === 1 ? "player" : "players"}
        </p>
        <ConnectionPill connection={connection} watching={watching} />
      </div>
    </section>
  );
}

function TeamSide({
  side,
  name,
  team,
  score,
  dim,
}: {
  side: "x" | "y";
  name: string;
  team: GameState["game"]["teamX"];
  score: number | null;
  dim: boolean;
}) {
  const mark = <TeamMark team={team} size="md" />;
  const right = side === "y";
  if (score === null) {
    return (
      <div className={cx("flex min-w-0 flex-col gap-1.5", right ? "items-end text-right" : "items-start")}>
        {mark}
        <span className="line-clamp-2 font-display text-headline font-extrabold leading-tight text-ink">{name}</span>
      </div>
    );
  }
  return (
    <div className={cx("flex min-w-0 flex-col gap-1", right ? "items-end" : "items-start")}>
      <div className={cx("flex items-center gap-2.5", right && "flex-row-reverse")}>
        {mark}
        <span
          key={score}
          className={cx(
            "jx-roll font-display text-[2.75rem] font-extrabold leading-none tracking-[-0.04em] tabular-nums",
            dim ? "text-ink-muted" : "text-ink",
          )}
        >
          {score}
        </span>
      </div>
      <span className={cx("max-w-full truncate text-footnote font-semibold text-ink-muted", right && "text-right")}>{name}</span>
    </div>
  );
}

function Center({
  phase,
  state,
  detail,
  nextLabel,
  now,
}: {
  phase: BoardPhase;
  state: GameState;
  detail: string | null;
  nextLabel: string | null;
  now: number;
}) {
  const { claimed, total } = claimedCount(state);
  if (phase === "open" || phase === "draft") {
    const left = total - claimed;
    return (
      <div className="flex flex-col items-center gap-1 px-1">
        <ProgressRing value={claimed / total} size={52} stroke={5} label={`${claimed} of ${total} squares claimed`}>
          <span className="text-callout">{claimed}</span>
        </ProgressRing>
        <span className="eyebrow whitespace-nowrap text-ink-muted">
          {phase === "draft" ? "Not open yet" : left === 0 ? "Board full" : `${left} left`}
        </span>
      </div>
    );
  }
  if (phase === "live") {
    return (
      <div className="flex flex-col items-center gap-1.5 px-1">
        <span className="eyebrow inline-flex h-6 items-center gap-1.5 rounded-md bg-live-500 px-2 text-white shadow-[0_0_18px_-4px_var(--color-live-500)]">
          <span aria-hidden className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
          Live
        </span>
        <span className="whitespace-nowrap text-footnote font-bold tabular-nums text-ink">{detail}</span>
      </div>
    );
  }
  if (phase === "final") {
    return (
      <div className="flex flex-col items-center gap-1.5 px-1">
        <Badge tone="gold">Final</Badge>
        {detail && detail !== "Final" && <span className="text-caption text-ink-muted">{detail}</span>}
      </div>
    );
  }
  // Locked: numbers drawn, waiting on kickoff or the next result.
  const kickoff = state.game.linkedEvent?.startsAt ?? null;
  const pre = kickoff !== null && kickoff > now && !detail;
  if (detail) {
    // A recorded score is on the board: keep the middle quiet so the numbers lead.
    return (
      <div className="flex flex-col items-center gap-1 px-0.5 text-center">
        <span className="eyebrow whitespace-nowrap text-ink">{detail}</span>
        {nextLabel && <span className="whitespace-nowrap text-caption font-semibold text-ink-subtle">{nextLabel} next</span>}
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center gap-1.5 px-1 text-center">
      <Badge tone="brand">Numbers drawn</Badge>
      <span className="whitespace-nowrap text-caption font-semibold text-ink-muted">
        {pre ? `Kickoff in ${countdown(kickoff - now)}` : nextLabel ? `${nextLabel} up next` : "Game on"}
      </span>
      {pre && <span className="sr-only">{kickoffLabel(kickoff, now)}</span>}
    </div>
  );
}

function ConnectionPill({ connection, watching }: { connection: ConnectionState; watching: number }) {
  if (connection === "live") {
    // Alone on the board ("1 watching" is just you): say nothing.
    if (watching < 2) return null;
    return (
      <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-brand-400/10 py-0.5 pl-2 pr-2.5 text-footnote text-ink-muted ring-1 ring-inset ring-brand-400/20">
        <LiveDot tone="brand" />
        <b className="font-bold tabular-nums text-ink">{watching}</b> watching
      </span>
    );
  }
  if (connection === "offline") {
    return (
      <span className="flex shrink-0 items-center gap-1 rounded-full bg-danger-500/15 px-2 py-0.5 text-caption font-bold text-danger-300">
        <WifiOffIcon size={13} />
        Offline
      </span>
    );
  }
  return (
    <span className="flex shrink-0 items-center gap-1.5 text-caption font-semibold text-ink-subtle">
      <LiveDot tone="gold" pulse={false} />
      {connection === "polling" ? "Reconnecting" : "Connecting"}
    </span>
  );
}
