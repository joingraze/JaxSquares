// Broadcast-style scoreboard at the top of a board: both teams in their colors,
// the score (live or last recorded), where the game is, when it kicks off
// (a linked game's time, or a custom board's host-set one), and who's here.
//
// It's kept short on purpose so the whole grid fits on the first screen:
// once numbers are drawn it's one strip (marks, scores, clock); while squares
// are being picked it adds one row of who's in.

import { gameKickoff } from "../../../shared/kickoff";
import type { GameState } from "../../../shared/types";
import { ClockIcon, WifiOffIcon } from "../../components/icons";
import { AvatarGroup, Badge, LiveDot, ProgressRing, TeamMark, cx } from "../../components/ui";
import { countdown, kicksOffLabel, shortTeam } from "../../lib/format";
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
  const picking = phase === "open" || phase === "draft";
  const { claimed, total } = claimedCount(state);
  const left = total - claimed;
  const kickoff = gameKickoff(game);

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

      <div className="relative grid min-h-16 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 px-3.5 py-2.5">
        <TeamSide side="x" name={shortTeam(game.teamX, game.league)} team={game.teamX} score={score?.scoreX ?? null} dim={leader < 0} stacked={!picking} />
        <Center phase={phase} state={state} detail={score?.detail ?? null} nextLabel={nextLabel} now={now} watching={picking ? 0 : watching} connection={connection} />
        <TeamSide side="y" name={shortTeam(game.teamY, game.league)} team={game.teamY} score={score?.scoreY ?? null} dim={leader > 0} stacked={!picking} />
        {picking && kickoff !== null && kickoff > now && (
          <p data-testid="board-kickoff" className="col-span-3 -mt-1 flex items-center justify-center gap-1.5 text-caption font-semibold text-ink-muted">
            <ClockIcon size={13} className="shrink-0 text-ink-subtle" />
            {kicksOffLabel(kickoff, now)}
          </p>
        )}
      </div>

      {picking && (
        <div className="relative flex min-h-10 items-center gap-2.5 border-t border-line bg-canvas/30 px-3.5 py-1.5">
          {state.players.length > 0 && (
            <AvatarGroup
              size="xs"
              max={4}
              people={state.players.map((p) => ({ id: p.id, name: p.name, color: p.color, emoji: p.emoji }))}
            />
          )}
          <p className="min-w-0 flex-1 truncate text-footnote text-ink-muted">
            <span className="font-bold text-ink">{state.players.length}</span> {state.players.length === 1 ? "player" : "players"}
            <span aria-hidden className="mx-1.5 text-ink-subtle">·</span>
            {phase === "draft" ? (
              "not open yet"
            ) : left === 0 ? (
              <b className="font-bold text-ink-brand">board full</b>
            ) : (
              <>
                <span className="font-bold text-ink">{left}</span> left
              </>
            )}
          </p>
          <ConnectionPill connection={connection} watching={watching} />
        </div>
      )}
    </section>
  );
}

function TeamSide({
  side,
  name,
  team,
  score,
  dim,
  stacked,
}: {
  side: "x" | "y";
  name: string;
  team: GameState["game"]["teamX"];
  score: number | null;
  dim: boolean;
  /** No score yet but the middle is busy (numbers drawn): name under the mark. */
  stacked: boolean;
}) {
  const right = side === "y";
  if (score === null) {
    return (
      <div className={cx("flex min-w-0", stacked ? "flex-col gap-1" : "items-center gap-2", right && (stacked ? "items-end text-right" : "flex-row-reverse text-right"))}>
        <TeamMark team={team} size={stacked ? "sm" : "md"} className={stacked ? "!h-8 !w-8" : undefined} />
        <span className={cx("min-w-0 max-w-full truncate font-display font-extrabold leading-tight text-ink", stacked ? "text-footnote" : "text-subhead")}>{name}</span>
      </div>
    );
  }
  return (
    <div className={cx("flex min-w-0 flex-col gap-0.5", right ? "items-end" : "items-start")}>
      <div className={cx("flex items-center gap-2", right && "flex-row-reverse")}>
        <TeamMark team={team} size="sm" className="!h-8 !w-8" />
        <span
          key={score}
          className={cx(
            "jx-roll font-display text-[2.25rem] font-extrabold leading-none tracking-[-0.04em] tabular-nums",
            dim ? "text-ink-muted" : "text-ink",
          )}
        >
          {score}
        </span>
      </div>
      <span className={cx("max-w-full truncate text-caption font-semibold text-ink-muted", right && "text-right")}>{name}</span>
    </div>
  );
}

function Center({
  phase,
  state,
  detail,
  nextLabel,
  now,
  watching,
  connection,
}: {
  phase: BoardPhase;
  state: GameState;
  detail: string | null;
  nextLabel: string | null;
  now: number;
  /** Shown under the clock once the game is on (0 = say nothing). */
  watching: number;
  connection: ConnectionState;
}) {
  const crowd = <Crowd watching={watching} connection={connection} />;
  if (phase === "open" || phase === "draft") {
    // How full the board is; the row below says how many are left.
    const { claimed, total } = claimedCount(state);
    return (
      <div className="flex items-center px-1">
        <ProgressRing value={claimed / total} size={46} stroke={4.5} label={`${claimed} of ${total} squares claimed`}>
          <span className="text-footnote">{claimed}</span>
        </ProgressRing>
      </div>
    );
  }
  if (phase === "live") {
    return (
      <div className="flex flex-col items-center gap-0.5 px-1">
        <span className="eyebrow inline-flex h-5 items-center gap-1.5 rounded-md bg-live-500 px-1.5 text-white shadow-[0_0_18px_-4px_var(--color-live-500)]">
          <span aria-hidden className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
          Live
        </span>
        <span className="whitespace-nowrap text-footnote font-bold tabular-nums text-ink">{detail}</span>
        {crowd}
      </div>
    );
  }
  if (phase === "final") {
    return (
      <div className="flex flex-col items-center gap-1 px-1">
        <Badge tone="gold">Final</Badge>
        {detail && detail !== "Final" && <span className="text-caption text-ink-muted">{detail}</span>}
      </div>
    );
  }
  // Locked: numbers drawn, waiting on kickoff or the next result.
  const kickoff = gameKickoff(state.game);
  const pre = kickoff !== null && kickoff > now && !detail;
  if (detail) {
    // A recorded score is on the board: keep the middle quiet so the numbers lead.
    return (
      <div className="flex flex-col items-center gap-0.5 px-0.5 text-center">
        <span className="eyebrow whitespace-nowrap text-ink">{detail}</span>
        {nextLabel && <span className="whitespace-nowrap text-caption font-semibold text-ink-subtle">{nextLabel} next</span>}
        {crowd}
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center gap-1 px-1 text-center">
      <Badge tone="brand">Numbers drawn</Badge>
      <span className="whitespace-nowrap text-caption font-semibold text-ink-muted">
        {pre ? `Kickoff in ${countdown(kickoff - now)}` : nextLabel ? `${nextLabel} up next` : "Game on"}
      </span>
      {pre && <span className="sr-only">{kicksOffLabel(kickoff, now)}</span>}
    </div>
  );
}

/** "6 watching" (or the connection trouble) in a single caption line under the clock. */
function Crowd({ watching, connection }: { watching: number; connection: ConnectionState }) {
  if (connection === "offline") {
    return (
      <span className="flex items-center gap-1 text-caption font-bold text-ink-danger">
        <WifiOffIcon size={12} />
        Offline
      </span>
    );
  }
  if (connection !== "live") {
    return (
      <span className="flex items-center gap-1 whitespace-nowrap text-caption font-semibold text-ink-subtle">
        <LiveDot tone="gold" pulse={false} />
        {connection === "polling" ? "Reconnecting" : "Connecting"}
      </span>
    );
  }
  if (watching < 2) return null;
  return (
    <span className="flex items-center gap-1 whitespace-nowrap text-caption text-ink-muted">
      <LiveDot />
      <b className="font-bold tabular-nums text-ink">{watching}</b> watching
    </span>
  );
}

function ConnectionPill({ connection, watching }: { connection: ConnectionState; watching: number }) {
  if (connection === "live") {
    // Alone on the board ("1 watching" is just you): say nothing.
    if (watching < 2) return null;
    return (
      <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-surface-3 py-0.5 pl-2 pr-2.5 text-footnote text-ink-muted ring-1 ring-inset ring-line">
        <LiveDot />
        <b className="font-bold tabular-nums text-ink">{watching}</b> watching
      </span>
    );
  }
  if (connection === "offline") {
    return (
      <span className="flex shrink-0 items-center gap-1 rounded-full bg-danger-500/15 px-2 py-0.5 text-caption font-bold text-ink-danger">
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
