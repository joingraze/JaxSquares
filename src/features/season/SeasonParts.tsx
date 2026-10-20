// A season board's page parts (docs/ARCHITECTURE.md "Season boards"): the
// header (the season and its game on now or next), the tabs, the schedule
// (each game's board a tap away, past games with their winners) and the
// standings. On a season's game board: the bar that says which game of how
// many and moves between them. Semantic tokens only, so both themes work.

import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { featuredSeasonGame, seasonPositionLine } from "../../../shared/season";
import { unitOf } from "../../../shared/formats";
import type { GameState, Player, SeasonGame, SeasonPosition, SeasonStanding, SeasonState } from "../../../shared/types";
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon, GridIcon, TrophyIcon } from "../../components/icons";
import { Avatar, Button, cx, LiveDot, SegmentedControl, TeamMark } from "../../components/ui";
import { kickoffLabel } from "../../lib/format";
import { prefetchGame, useGame } from "../../lib/live";
import { haptic } from "../../lib/native";
import {
  gameTag,
  gamesLine,
  myPlaceLine,
  ordinal,
  playedLine,
  podium,
  scheduleSections,
  seasonFactsLine,
  seasonMatchup,
  standingAmount,
  winnersLine,
  winsLine,
  wonGame,
  type SeasonTab,
} from "./seasonView";

// ---- Header ----

export interface SeasonHeaderProps {
  state: GameState;
  season: SeasonState;
  me: string;
  now: number;
  /** A newcomer on an open season board: "Join the season" (the join sheet). */
  onJoin?: () => void;
}

/** The season's name and facts, then its game on now (live) or next; a tap opens that game's board. */
export function SeasonHeader({ state, season, me, now, onJoin }: SeasonHeaderProps) {
  const team = season.team;
  const featured = featuredSeasonGame(season.games, now);
  const picking = state.game.status === "open" || state.game.status === "draft";
  const left = Math.max(0, (state.game.format.boardSize === 25 ? 25 : 100) - state.squares.length);
  const place = picking ? null : myPlaceLine(season.standings, me);
  const played = playedLine(season.games);
  return (
    <section data-testid="season-header" aria-label="The season" className="relative overflow-hidden rounded-card bg-surface-2 p-4 shadow-card ring-1 ring-inset ring-line">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-30"
        style={{ background: "radial-gradient(90% 120% at 0% 0%, var(--team-x), transparent 60%)" }}
      />
      <div className="relative flex items-center gap-3.5">
        {team ? (
          <TeamMark team={team} size="lg" />
        ) : (
          <span aria-hidden className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-surface-4 text-ink-brand">
            <CalendarIcon size={26} />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="eyebrow text-ink-subtle">Season board</p>
          <h2 data-testid="season-label" className="truncate font-display text-title-3 font-extrabold leading-tight text-ink">
            {season.label}
          </h2>
          <p className="mt-0.5 line-clamp-2 text-footnote text-ink-muted">{[seasonFactsLine(season), played].filter(Boolean).join(" · ")}</p>
        </div>
      </div>
      {featured && <FeaturedGame game={featured} picking={picking} now={now} />}
      {place && (
        <p data-testid="season-my-place" className="relative mt-3 flex items-center gap-1.5 text-footnote font-semibold text-ink">
          <TrophyIcon size={14} className="shrink-0 text-ink-gold" filled />
          {place}
        </p>
      )}
      {picking && onJoin && (
        <div className="relative mt-3.5 flex flex-col gap-1.5">
          <Button data-testid="season-join" size="lg" block onClick={onJoin}>
            Join the season
          </Button>
          <p className="text-center text-footnote text-ink-muted">
            Pick squares once: they're yours for every game. {left} {left === 1 ? "square" : "squares"} left.
          </p>
        </div>
      )}
      {picking && !onJoin && (
        <p className="relative mt-3 text-footnote text-ink-subtle">Squares are picked once, here, for every game. Each game gets its own board at the draw.</p>
      )}
    </section>
  );
}

/** The game on now or next: its live score while it's on (from its own board), else when it starts. */
function FeaturedGame({ game, picking, now }: { game: SeasonGame; picking: boolean; now: number }) {
  const live = useGame(game.id && game.live === "in" ? game.id : undefined, { passive: true }).state?.live ?? null;
  const on = game.live === "in";
  const score = on && live ? { scoreX: live.scoreX, scoreY: live.scoreY, label: live.detail || game.score?.label || "Live" } : game.score;
  const body = (
    <>
      <span className="flex shrink-0 gap-1" aria-hidden>
        <TeamMark team={game.teamX} size="sm" />
        <TeamMark team={game.teamY} size="sm" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-caption font-bold uppercase tracking-wide text-ink-subtle">
          {on && <LiveDot size="sm" label="Live" />}
          {on ? "On now" : game.status === "final" ? "Last game" : picking ? "First game" : "Next game"} · {gameTag(game)}
        </span>
        <span className="block truncate font-display text-headline font-extrabold text-ink">{seasonMatchup(game)}</span>
        <span className="block truncate text-footnote tabular-nums text-ink-muted">
          {score && (on || game.status === "final") ? `${score.scoreX}–${score.scoreY} · ${score.label}` : kickoffLabel(game.startsAt, now)}
        </span>
      </span>
      {game.id && <ChevronRightIcon size={16} strokeWidth={2.6} className="shrink-0 text-ink-subtle" />}
    </>
  );
  const cls = "relative mt-3.5 flex min-h-14 items-center gap-3 rounded-2xl bg-surface-3/80 px-3 py-2 ring-1 ring-inset ring-line";
  return game.id ? (
    <Link
      to={`/g/${encodeURIComponent(game.id)}`}
      data-testid="season-featured"
      onPointerDown={() => void prefetchGame(game.id!)}
      onClick={() => void haptic("selection")}
      className={cx("pressable", cls, on && "ring-live-500/40")}
    >
      {body}
    </Link>
  ) : (
    <div data-testid="season-featured" className={cls}>
      {body}
    </div>
  );
}

// ---- Tabs ----

export function SeasonTabs({ tab, onTab }: { tab: SeasonTab; onTab: (tab: SeasonTab) => void }) {
  return (
    <SegmentedControl<SeasonTab>
      aria-label="Season board"
      data-testid="season-tabs"
      size="sm"
      value={tab}
      onChange={onTab}
      options={[
        { value: "squares", label: "Squares", testId: "season-tab-squares" },
        { value: "schedule", label: "Schedule", testId: "season-tab-schedule" },
        { value: "standings", label: "Standings", testId: "season-tab-standings" },
      ]}
    />
  );
}

// ---- Schedule ----

export function SeasonSchedule({ season, players, me, now }: { season: SeasonState; players: Player[]; me: string; now: number }) {
  const { current, upcoming, played } = scheduleSections(season.games, now);
  if (season.games.length === 0) {
    return <p className="rounded-card bg-surface-2 px-4 py-6 text-center text-footnote text-ink-muted ring-1 ring-inset ring-line">No games on the schedule yet.</p>;
  }
  const planned = season.games.every((g) => g.id === null);
  return (
    <section data-testid="season-schedule" aria-label="Schedule" className="flex flex-col gap-4">
      {planned && (
        <p className="px-1 text-footnote text-ink-muted">
          Each game gets its own board when the numbers are drawn.{season.scope === "team" ? " Playoff games join as they're scheduled." : ""}
        </p>
      )}
      {current && (
        <ScheduleGroup title={current.live === "in" ? "On now" : planned ? "First up" : "Next up"}>
          <GameRow game={current} players={players} me={me} now={now} featured />
        </ScheduleGroup>
      )}
      {upcoming.length > 0 && (
        <ScheduleGroup title="Coming up">
          {upcoming.map((g) => (
            <GameRow key={g.eventId} game={g} players={players} me={me} now={now} />
          ))}
        </ScheduleGroup>
      )}
      {played.length > 0 && (
        <ScheduleGroup title="Played">
          {played.map((g) => (
            <GameRow key={g.eventId} game={g} players={players} me={me} now={now} />
          ))}
        </ScheduleGroup>
      )}
    </section>
  );
}

function ScheduleGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="eyebrow px-1 text-ink-subtle">{title}</p>
      <ul className="flex flex-col gap-2">{children}</ul>
    </div>
  );
}

function GameRow({ game, players, me, now, featured = false }: { game: SeasonGame; players: Player[]; me: string; now: number; featured?: boolean }) {
  const on = game.live === "in";
  const over = game.status === "final" || game.live === "post";
  const winners = winnersLine(game, players, me);
  const mine = wonGame(game, me);
  const right = over || on ? (game.score ? `${game.score.scoreX}–${game.score.scoreY}` : on ? "Live" : "Final") : kickoffLabel(game.startsAt, now);
  const body = (
    <>
      <span className="w-7 shrink-0 text-center font-display text-callout font-extrabold tabular-nums text-ink-subtle">{game.index}</span>
      <span className="flex shrink-0 gap-1" aria-hidden>
        <TeamMark team={game.teamX} size="sm" />
        <TeamMark team={game.teamY} size="sm" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-subhead font-extrabold text-ink">{seasonMatchup(game)}</span>
          {game.playoff && <span className="shrink-0 rounded-md bg-gold-400/15 px-1.5 py-px text-caption font-extrabold text-ink-gold">Playoffs</span>}
        </span>
        <span className="line-clamp-2 text-footnote text-ink-muted">
          {[game.label, winners].filter(Boolean).join(" · ") || (game.id ? "Board ready" : "Board made at the draw")}
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-0.5">
        <span className={cx("text-footnote font-bold tabular-nums", on ? "text-ink-live" : over ? "text-ink" : "text-ink-muted")}>
          {on && <LiveDot size="sm" className="mr-1 align-middle" />}
          {right}
        </span>
        {(over || on) && game.score && <span className="text-caption font-semibold text-ink-subtle">{on ? game.score.label : "Final"}</span>}
        {mine && (
          <span data-testid="season-game-won" className="flex items-center gap-0.5 text-caption font-extrabold text-ink-gold">
            <TrophyIcon size={11} filled />
            You won
          </span>
        )}
      </span>
      {game.id && <ChevronRightIcon size={15} strokeWidth={2.6} className="-mr-1 shrink-0 text-ink-subtle" />}
    </>
  );
  const cls = cx(
    "flex min-h-16 items-center gap-2.5 rounded-2xl py-2 pl-1.5 pr-3 ring-1 ring-inset",
    featured ? "bg-surface-3 ring-line-strong" : "bg-surface-2 ring-line",
    mine && "ring-gold-line/50",
  );
  return (
    <li>
      {game.id ? (
        <Link
          to={`/g/${encodeURIComponent(game.id)}`}
          data-testid="season-game"
          data-status={game.status}
          onPointerDown={() => void prefetchGame(game.id!)}
          onClick={() => void haptic("selection")}
          className={cx("pressable hover:bg-surface-3", cls)}
        >
          {body}
        </Link>
      ) : (
        <div data-testid="season-game" data-status="planned" className={cls}>
          {body}
        </div>
      )}
    </li>
  );
}

// ---- Standings ----

export function SeasonStandings({ state, season, me }: { state: GameState; season: SeasonState; me: string }) {
  const unit = unitOf(state.game.format);
  const anyWins = season.standings.some((r) => r.wins > 0);
  // The season's over: its top 3 up top (the recap).
  const top = state.game.status === "final" ? podium(season.standings) : [];
  if (season.standings.length === 0) {
    return <p className="rounded-card bg-surface-2 px-4 py-6 text-center text-footnote text-ink-muted ring-1 ring-inset ring-line">Standings start once squares are picked.</p>;
  }
  return (
    <section data-testid="season-standings" aria-label="Standings" className="flex flex-col gap-2">
      {!anyWins && <p className="px-1 text-footnote text-ink-muted">No winners yet. The standings fill in as the games are played.</p>}
      {top.length > 0 && <Podium rows={top} players={state.players} me={me} />}
      <ol className="flex flex-col gap-1.5">
        {season.standings.map((row) => {
          const player = state.players.find((p) => p.id === row.playerId);
          const name = player?.name || "Former player";
          const you = row.playerId === me;
          const amount = standingAmount(row, unit);
          const podium = row.wins > 0 && row.rank <= 3;
          return (
            <li
              key={row.playerId}
              data-testid="season-standing"
              data-rank={row.rank}
              className={cx(
                "flex min-h-14 items-center gap-3 rounded-2xl px-3 py-2 ring-1 ring-inset",
                you ? "bg-brand-400/10 ring-brand-line/60" : "bg-surface-2 ring-line",
              )}
            >
              <span
                className={cx(
                  "grid h-7 w-7 shrink-0 place-items-center rounded-full font-display text-footnote font-extrabold tabular-nums",
                  podium && row.rank === 1 ? "bg-gold-400 text-ink-inverse" : podium ? "bg-surface-4 text-ink" : "text-ink-subtle",
                )}
              >
                {row.rank}
              </span>
              <Avatar name={name} color={player?.color ?? "#64748b"} emoji={player?.emoji} size="sm" decorative />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-subhead font-extrabold text-ink">
                  {name}
                  {you && <span className="ml-1.5 text-caption font-bold text-ink-brand">You</span>}
                </span>
                <span className="block truncate text-footnote text-ink-muted">{[winsLine(row.wins), gamesLine(row.games)].filter(Boolean).join(" ")}</span>
              </span>
              {amount && row.wins > 0 && <span className="shrink-0 text-subhead font-extrabold tabular-nums text-ink-gold">{amount}</span>}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** The season's top 3 once it's over: who won the most. */
function Podium({ rows, players, me }: { rows: SeasonStanding[]; players: Player[]; me: string }) {
  return (
    <div data-testid="season-podium" className="relative overflow-hidden rounded-card bg-surface-2 p-4 shadow-card ring-1 ring-inset ring-gold-line/40">
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(80%_100%_at_50%_0%,rgb(255_194_51/0.18),transparent_70%)]" />
      <p className="eyebrow relative flex items-center justify-center gap-1.5 text-ink-gold">
        <TrophyIcon size={13} filled />
        Season's top {rows.length}
      </p>
      <ol className="relative mt-3 grid grid-cols-3 items-end gap-2">
        {rows.map((row) => {
          const player = players.find((p) => p.id === row.playerId);
          const name = row.playerId === me ? "You" : player?.name.split(" ")[0] || "Former player";
          return (
            <li key={row.playerId} data-testid="season-podium-place" data-rank={row.rank} className="flex min-w-0 flex-col items-center gap-1 text-center">
              <Avatar name={player?.name || name} color={player?.color ?? "#64748b"} emoji={player?.emoji} size={row.rank === 1 ? "lg" : "md"} decorative />
              <span className="w-full truncate text-subhead font-extrabold text-ink">{name}</span>
              <span className="text-caption font-bold text-ink-muted">
                {ordinal(row.rank)} · {winsLine(row.wins)}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

// ---- A season's game ----

/** On a season's game board: "Game 3 of 17 · Office Season", a way back, and the games either side. */
export function SeasonNav({ position }: { position: SeasonPosition }) {
  const step = (id: string | null, dir: "prev" | "next") => {
    const icon = dir === "prev" ? <ChevronLeftIcon size={20} strokeWidth={2.6} /> : <ChevronRightIcon size={20} strokeWidth={2.6} />;
    const label = dir === "prev" ? "Previous game" : "Next game";
    const cls = "grid h-11 w-11 shrink-0 place-items-center rounded-xl";
    return id ? (
      <Link
        to={`/g/${encodeURIComponent(id)}`}
        replace
        aria-label={label}
        data-testid={`season-nav-${dir}`}
        onPointerDown={() => void prefetchGame(id)}
        onClick={() => void haptic("selection")}
        className={cx("pressable bg-surface-3 text-ink ring-1 ring-inset ring-line", cls)}
      >
        {icon}
      </Link>
    ) : (
      <span aria-hidden data-testid={`season-nav-${dir}`} data-disabled className={cx("text-ink-subtle opacity-40", cls)}>
        {icon}
      </span>
    );
  };
  return (
    <nav data-testid="season-nav" aria-label="Season" className="flex items-center gap-2 rounded-card bg-surface-2 p-1.5 ring-1 ring-inset ring-line">
      {step(position.prevId, "prev")}
      <Link
        to={`/g/${encodeURIComponent(position.id)}`}
        data-testid="season-nav-season"
        onPointerDown={() => void prefetchGame(position.id)}
        onClick={() => void haptic("selection")}
        className="pressable flex min-h-11 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-xl px-2 text-center"
      >
        <GridIcon size={14} className="shrink-0 text-ink-brand" />
        <span className="min-w-0 truncate text-subhead">
          <b className="font-extrabold text-ink">{seasonPositionLine(position)}</b>
          <span className="text-ink-muted"> · {position.name}</span>
        </span>
      </Link>
      {step(position.nextId, "next")}
    </nav>
  );
}
