// The create flow's season picker (GamePicker's `seasonPanel` once "A whole
// season" is on): what the season covers, then how numbers work.
//   A team's season  the league's teams (names and colors) as a grid with a
//                    search; once one is picked, its season at a glance (games
//                    left, the next one, playoffs joining as they're set).
//   Pick games       the league's own week or day lists, each row a check.
//   Numbers          the same numbers for every game, or new numbers each game.
// Loading and errors stay in the panel with a retry; a team's season that
// can't load also offers picking games instead.

import { useMemo, useState } from "react";
import { MAX_SEASON_GAMES, SEASON_NUMBERS_INFO, seasonReviewLine, teamShortName } from "../../../shared/season";
import { LEAGUE_INFO } from "../../../shared/sports";
import type { ScheduleEvent, SeasonNumbers, SeasonScope, SeasonTeam, TeamScheduleResponse } from "../../../shared/types";
import { CalendarIcon, CheckIcon, ChevronRightIcon, GridIcon, SearchIcon, ShuffleIcon, TrophyIcon, XIcon } from "../../components/icons";
import { cx, SegmentedControl, Skeleton, TeamMark } from "../../components/ui";
import { haptic } from "../../lib/native";
import { LeagueGames, type MultiPick } from "./GamePicker";
import { kickoffParts, seasonEventMatchup, seasonGamesAhead, type SeasonMatchup } from "./model";
import type { Loadable } from "./useSeason";
import type { LeagueSchedule, ScheduleLeague } from "./useSchedule";

/** Without a search, a long list of teams (college) shows this many; a search finds the rest. */
const TEAM_GRID_MAX = 36;
/** A team's next games shown under its season. */
const NEXT_GAMES = 3;

export interface SeasonPickerProps {
  league: ScheduleLeague;
  /** The season as it stands (its team, year and games). */
  matchup: SeasonMatchup;
  onScope: (scope: SeasonScope) => void;
  onNumbers: (numbers: SeasonNumbers) => void;
  /** A team's season: the league's teams, and the pick. */
  teams: Loadable<SeasonTeam[]>;
  onTeam: (team: SeasonTeam | null) => void;
  onRetryTeams: () => void;
  /** A team's season: its schedule. */
  season: Loadable<TeamScheduleResponse>;
  onRetrySeason: () => void;
  /** Pick games: the league's schedule, and a tap to add or drop a game. */
  schedule: LeagueSchedule;
  onToggleGame: (e: ScheduleEvent) => void;
  showErrors?: boolean;
  now: number;
}

export function SeasonPicker(props: SeasonPickerProps) {
  const { league, matchup, onScope, onNumbers, schedule, onToggleGame, showErrors } = props;
  const picks = matchup.scope === "games" ? matchup.events : [];
  const multi: MultiPick = {
    has: (e) => picks.some((p) => p.eventId === e.eventId),
    onToggle: onToggleGame,
    count: picks.length,
  };
  return (
    <div data-testid="season-picker" className="flex flex-col gap-4">
      <p className="px-1 text-footnote text-ink-muted">
        <span className="font-bold text-ink">One board for every game.</span> Friends pick squares once. At the draw each game gets its own board, scored live.
      </p>

      <SegmentedControl<SeasonScope>
        aria-label="What the season covers"
        data-testid="season-scope"
        size="sm"
        value={matchup.scope}
        onChange={(next) => onScope(next)}
        options={[
          {
            value: "team",
            icon: <TrophyIcon />,
            label: "A team's season",
            testId: "season-scope-team",
          },
          {
            value: "games",
            icon: <CalendarIcon />,
            label: "Pick games",
            testId: "season-scope-games",
          },
        ]}
      />

      {matchup.scope === "team" ? (
        <TeamSeason {...props} />
      ) : (
        <div className="flex flex-col gap-2">
          <PicksLine count={picks.length} league={league} />
          <LeagueGames league={league} schedule={schedule} selected={null} onPick={onToggleGame} showErrors={showErrors} multi={multi} />
        </div>
      )}

      <NumbersChoice value={matchup.numbers} onChange={onNumbers} />
      {matchup.scope === "games" && picks.length > 0 && (
        <p className="px-1 text-caption text-ink-subtle">Games already started when you create the board are left off. Up to {MAX_SEASON_GAMES} games.</p>
      )}
    </div>
  );
}

/** "3 games picked" over the picks list. */
function PicksLine({ count, league }: { count: number; league: ScheduleLeague }) {
  return (
    <p data-testid="season-picks" data-count={count} className="flex items-center gap-2 px-1 text-footnote text-ink-muted">
      <CalendarIcon size={16} className="shrink-0 text-ink-subtle" />
      {count ? (
        <span>
          <span className="font-bold tabular-nums text-ink">
            {count} {count === 1 ? "game" : "games"}
          </span>{" "}
          picked. Tap more to add them.
        </span>
      ) : (
        <span>Tap every {LEAGUE_INFO[league].label} game the season covers.</span>
      )}
    </p>
  );
}

// ---- A team's season ----

function TeamSeason({ league, matchup, teams, onTeam, onRetryTeams, season, onRetrySeason, onScope, showErrors, now }: SeasonPickerProps) {
  const team = matchup.team;
  const [choosing, setChoosing] = useState(false);
  if (team && !choosing) {
    return (
      <TeamSeasonCard
        matchup={matchup}
        season={season}
        onRetry={onRetrySeason}
        onChange={() => {
          void haptic("selection");
          setChoosing(true);
        }}
        onPickGames={() => onScope("games")}
        now={now}
      />
    );
  }
  return (
    <TeamGrid
      league={league}
      teams={teams}
      selected={team}
      onRetry={onRetryTeams}
      onPickGames={() => onScope("games")}
      showErrors={showErrors && !team}
      onPick={(t) => {
        setChoosing(false);
        onTeam(t);
      }}
      onCancel={team ? () => setChoosing(false) : undefined}
    />
  );
}

function teamMatches(t: SeasonTeam, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return [t.name, t.shortName, t.abbr].some((v) => v?.toLowerCase().includes(needle));
}

function TeamGrid({
  league,
  teams,
  selected,
  onPick,
  onRetry,
  onPickGames,
  onCancel,
  showErrors,
}: {
  league: ScheduleLeague;
  teams: Loadable<SeasonTeam[]>;
  selected: SeasonTeam | null;
  onPick: (t: SeasonTeam) => void;
  onRetry: () => void;
  onPickGames: () => void;
  onCancel?: () => void;
  showErrors?: boolean;
}) {
  const [query, setQuery] = useState("");
  const all = useMemo(() => [...(teams.value ?? [])].sort((a, b) => teamShortName(a).localeCompare(teamShortName(b))), [teams.value]);

  if (teams.status === "error") {
    return (
      <Problem
        title={`Couldn't load the ${LEAGUE_INFO[league].label} teams`}
        detail="Check your connection and try again, or pick the games yourself."
        onRetry={onRetry}
        onPickGames={onPickGames}
      />
    );
  }
  if (teams.status !== "ready") {
    return (
      <div aria-busy="true" aria-label="Loading teams" className="grid grid-cols-3 gap-2">
        {Array.from({ length: 9 }, (_, i) => (
          <Skeleton key={i} className="h-24 rounded-2xl" />
        ))}
      </div>
    );
  }

  const q = query.trim();
  const found = all.filter((t) => teamMatches(t, q));
  const shown = q ? found : all.slice(0, TEAM_GRID_MAX);
  const more = q ? 0 : all.length - shown.length;
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2">
        <div className="flex h-12 min-w-0 flex-1 items-center gap-2 rounded-2xl bg-surface-2 pl-3.5 pr-1.5 ring-1 ring-inset ring-line transition-shadow focus-within:ring-2 focus-within:ring-brand-line">
          <SearchIcon size={18} className="shrink-0 text-ink-subtle" />
          <input
            type="search"
            data-testid="season-team-search"
            aria-label={`Search ${LEAGUE_INFO[league].label} teams`}
            value={query}
            placeholder={`Find a team · ${all.length} teams`}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="search"
            onChange={(e) => setQuery(e.target.value)}
            className="h-full min-w-0 flex-1 bg-transparent text-body font-medium text-ink outline-none placeholder:text-ink-subtle [&::-webkit-search-cancel-button]:hidden"
          />
          {q && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setQuery("")}
              className="tap-target grid h-10 w-10 shrink-0 place-items-center rounded-full text-ink-subtle hover:text-ink"
            >
              <XIcon size={16} />
            </button>
          )}
        </div>
        {onCancel && (
          <button type="button" onClick={onCancel} className="tap-target h-11 shrink-0 rounded-xl px-2 text-subhead font-bold text-ink-brand hover:bg-ink/5">
            Cancel
          </button>
        )}
      </div>

      {shown.length ? (
        <div role="radiogroup" aria-label="Team" data-testid="season-teams" className="grid grid-cols-3 gap-2">
          {shown.map((t) => (
            <TeamTile key={t.id} team={t} selected={t.id === selected?.id} onPick={() => onPick(t)} />
          ))}
        </div>
      ) : (
        <p className="rounded-2xl bg-surface-2 px-4 py-3 text-footnote text-ink-muted ring-1 ring-inset ring-line">No team with “{q}”.</p>
      )}
      {more > 0 && <p className="px-1 text-caption text-ink-subtle">Search to find the other {more} teams.</p>}

      {showErrors && (
        <p role="alert" className="px-1 text-footnote font-semibold text-ink-danger">
          Tap a team to follow its season.
        </p>
      )}
    </div>
  );
}

function TeamTile({ team, selected, onPick }: { team: SeasonTeam; selected: boolean; onPick: () => void }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={team.name}
      data-testid="season-team"
      data-team-id={team.id}
      onClick={() => {
        void haptic("selection");
        onPick();
      }}
      className={cx(
        "pressable relative flex min-h-24 flex-col items-center justify-center gap-1.5 rounded-2xl px-1.5 py-2.5 text-center ring-inset transition-[background-color,box-shadow]",
        selected ? "bg-surface-3 ring-2 ring-brand-line" : "bg-surface-2 ring-1 ring-line hover:bg-surface-3",
      )}
    >
      <TeamMark team={team} size="md" />
      <span className="line-clamp-2 w-full text-footnote font-bold leading-tight text-ink">{teamShortName(team)}</span>
      {selected && (
        <span aria-hidden className="absolute right-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full bg-brand-400 text-ink-inverse">
          <CheckIcon size={12} strokeWidth={3.2} />
        </span>
      )}
    </button>
  );
}

/** The picked team's season: how many games, the next ones, playoffs joining later. */
function TeamSeasonCard({
  matchup,
  season,
  onRetry,
  onChange,
  onPickGames,
  now,
}: {
  matchup: SeasonMatchup;
  season: Loadable<TeamScheduleResponse>;
  onRetry: () => void;
  onChange: () => void;
  onPickGames: () => void;
  now: number;
}) {
  const team = matchup.team!;
  const ahead = seasonGamesAhead(matchup, now);
  const played = matchup.events.filter((e) => e.state === "post" || e.startsAt <= now).length;
  const loading = season.status === "loading" || season.status === "idle";
  const playoffsKnown = ahead.some((e) => e.playoff);
  return (
    <section
      data-testid="season-team-card"
      data-team-id={team.id}
      aria-label={`${teamShortName(team)} season`}
      className="flex flex-col gap-3 rounded-card bg-surface-2 p-3.5 shadow-card ring-1 ring-inset ring-line"
    >
      <div className="flex items-center gap-3">
        <TeamMark team={team} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 font-display text-headline font-extrabold leading-tight text-ink">{team.name}</p>
          <p data-testid="season-team-line" className="mt-0.5 text-footnote text-ink-muted">
            {loading
              ? "Loading the season…"
              : season.status === "error"
                ? "Couldn't load the season"
                : ahead.length
                  ? `${seasonReviewLine({ scope: "team", league: matchup.league, team, year: matchup.year }, ahead.length)}`
                  : "No games left this season"}
          </p>
        </div>
        <button
          type="button"
          data-testid="season-team-change"
          onClick={onChange}
          className="tap-target h-11 shrink-0 rounded-xl px-2 text-subhead font-bold text-ink-brand hover:bg-ink/5"
        >
          Change
        </button>
      </div>

      {loading ? (
        <div aria-busy="true" aria-label="Loading the season" className="flex flex-col gap-1.5">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-10 w-full rounded-xl" />
          ))}
        </div>
      ) : season.status === "error" ? (
        <Problem title="The schedule didn't load" detail="Try again, or pick the games yourself." onRetry={onRetry} onPickGames={onPickGames} inset />
      ) : ahead.length === 0 ? (
        <p className="rounded-xl bg-surface-3 px-3 py-2.5 text-footnote text-ink-muted">
          {played
            ? "Every game of this season has started. Pick another team, or wait for next season's schedule."
            : "No games on the schedule yet. Check back once it's out."}
        </p>
      ) : (
        <>
          <ul aria-label="Next games" className="flex flex-col divide-y divide-line overflow-hidden rounded-xl bg-surface-3">
            {ahead.slice(0, NEXT_GAMES).map((e, i) => {
              const { day, time } = kickoffParts(e.startsAt, now);
              return (
                <li key={e.eventId} data-testid="season-next-game" className="flex min-h-11 items-center gap-2.5 px-3 py-2">
                  <span className={cx("w-11 shrink-0 text-caption font-extrabold uppercase tracking-wide", i === 0 ? "text-ink-brand" : "text-ink-subtle")}>
                    {i === 0 ? "Next" : `G${i + 1}`}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-subhead font-bold text-ink">{seasonEventMatchup(e, team)}</span>
                  <span className="shrink-0 text-footnote tabular-nums text-ink-muted">
                    {day} · {time}
                  </span>
                </li>
              );
            })}
            {ahead.length > NEXT_GAMES && (
              <li className="flex min-h-10 items-center gap-1 px-3 py-2 text-footnote font-semibold text-ink-muted">
                and {ahead.length - NEXT_GAMES} more
                <ChevronRightIcon size={14} className="text-ink-subtle" />
              </li>
            )}
          </ul>
          <p data-testid="season-playoffs-note" className="flex items-start gap-2 px-0.5 text-footnote text-ink-muted">
            <TrophyIcon size={15} className="mt-0.5 shrink-0 text-ink-gold" />
            <span>{playoffsKnown ? "Playoff games are on the schedule. More join as they're set." : "Playoff games join the season as they're set."}</span>
          </p>
        </>
      )}
    </section>
  );
}

function Problem({
  title,
  detail,
  onRetry,
  onPickGames,
  inset = false,
}: {
  title: string;
  detail: string;
  onRetry: () => void;
  onPickGames: () => void;
  inset?: boolean;
}) {
  return (
    <div role="alert" className={cx("flex flex-col gap-3 rounded-2xl p-4", inset ? "bg-surface-3" : "bg-surface-2 ring-1 ring-inset ring-line")}>
      <div>
        <p className="text-callout font-bold text-ink">{title}</p>
        <p className="text-footnote text-ink-muted">{detail}</p>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          data-testid="season-retry"
          onClick={onRetry}
          className="pressable h-11 flex-1 rounded-full bg-surface-4 px-4 text-subhead font-bold text-ink ring-1 ring-inset ring-line-strong"
        >
          Try again
        </button>
        <button
          type="button"
          onClick={onPickGames}
          className="pressable h-11 flex-1 rounded-full px-4 text-subhead font-bold text-ink-brand ring-1 ring-inset ring-line"
        >
          Pick games
        </button>
      </div>
    </div>
  );
}

// ---- Numbers ----

const NUMBERS_ICON: Record<SeasonNumbers, typeof GridIcon> = {
  same: GridIcon,
  fresh: ShuffleIcon,
};

function NumbersChoice({ value, onChange }: { value: SeasonNumbers; onChange: (v: SeasonNumbers) => void }) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="eyebrow mb-2 px-1 text-ink-subtle">Numbers</legend>
      <div role="radiogroup" aria-label="Numbers" data-testid="season-numbers" className="flex flex-col gap-2">
        {(["same", "fresh"] as const).map((mode) => {
          const on = value === mode;
          const Icon = NUMBERS_ICON[mode];
          return (
            <button
              key={mode}
              type="button"
              role="radio"
              aria-checked={on}
              data-testid={`season-numbers-${mode}`}
              onClick={() => {
                if (on) return;
                void haptic("selection");
                onChange(mode);
              }}
              className={cx(
                "pressable flex w-full items-center gap-3 rounded-2xl p-3 text-left ring-inset transition-[background-color,box-shadow]",
                on ? "bg-surface-3 ring-2 ring-brand-line" : "bg-surface-2 ring-1 ring-line hover:bg-surface-3",
              )}
            >
              <span
                aria-hidden
                className={cx("grid h-10 w-10 shrink-0 place-items-center rounded-xl", on ? "bg-brand-400 text-ink-inverse" : "bg-surface-4 text-ink-muted")}
              >
                <Icon size={18} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-callout font-bold text-ink">{SEASON_NUMBERS_INFO[mode].label}</span>
                <span className="block text-footnote text-ink-muted">{SEASON_NUMBERS_INFO[mode].description}</span>
              </span>
              <span
                aria-hidden
                className={cx(
                  "grid h-6 w-6 shrink-0 place-items-center rounded-full transition-all duration-300 ease-spring",
                  on ? "scale-100 bg-brand-400 text-ink-inverse" : "scale-90 ring-2 ring-inset ring-line-strong",
                )}
              >
                {on && <CheckIcon size={14} strokeWidth={3.2} />}
              </span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
