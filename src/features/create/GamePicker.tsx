// Which game: real games (NFL / College) a week at a time — the current week's
// soonest three (plus "see all" and search), later weeks as rows that open to
// that week's schedule — or a custom matchup with two typed teams.

import { useRef, useState, type ReactNode } from "react";
import type { ScheduleEvent } from "../../../shared/types";
import {
  AlertIcon,
  CalendarIcon,
  CheckIcon,
  ChevronDownIcon,
  FootballIcon,
  LiveIcon,
  PencilIcon,
  SearchIcon,
  StarIcon,
  XIcon,
} from "../../components/icons";
import { cx, Jax, SegmentedControl, Skeleton, TeamMark } from "../../components/ui";
import { kickoffLabel, shortTeamName } from "../../lib/format";
import { haptic } from "../../lib/native";
import { CustomMatchup } from "./CustomMatchup";
import { kickoffParts, startsIn, withSideColors, type TeamColors } from "./model";
import { groupByDay, matchesQuery, siteLabel, weekRange, weekTag, zoneLabel } from "./scheduleView";
import { useWeekGames, type LeagueSchedule, type Schedule, type ScheduleLeague } from "./useSchedule";

export type PickerTab = ScheduleLeague | "custom";

export interface GamePickerProps {
  schedule: Schedule;
  tab: PickerTab;
  onTab: (tab: PickerTab) => void;
  selected: ScheduleEvent | null;
  onPickEvent: (event: ScheduleEvent) => void;
  custom: { x: string; y: string };
  onCustomChange: (side: "x" | "y", value: string) => void;
  showErrors?: boolean;
  /** Live NFL team colors, so typed teams match their real games. */
  colors?: TeamColors;
}

const LEAGUE_LABEL: Record<ScheduleLeague, string> = { nfl: "NFL", ncaaf: "College" };

export function GamePicker({ schedule, tab, onTab, selected, onPickEvent, custom, onCustomChange, showErrors, colors }: GamePickerProps) {
  const noGamesAnywhere = !schedule.nfl.loading && !schedule.ncaaf.loading && !schedule.nfl.events.length && !schedule.ncaaf.events.length;
  const count = (league: ScheduleLeague) =>
    !schedule[league].loading && schedule[league].events.length > 0 ? (
      <span className="tabular-nums text-ink-subtle">{schedule[league].events.length}</span>
    ) : null;

  return (
    <div className="flex flex-col gap-3">
      <SegmentedControl<PickerTab>
        aria-label="Choose the game"
        value={tab}
        onChange={onTab}
        options={[
          { value: "nfl", icon: <FootballIcon />, label: <>{LEAGUE_LABEL.nfl} {count("nfl")}</> },
          { value: "ncaaf", icon: <StarIcon />, label: <>{LEAGUE_LABEL.ncaaf} {count("ncaaf")}</> },
          { value: "custom", icon: <PencilIcon />, label: <span data-testid="custom-matchup">Custom</span> },
        ]}
      />

      {tab === "custom" ? (
        <div key="custom" className="animate-fade-in">
          <CustomMatchup
            x={custom.x}
            y={custom.y}
            onChange={onCustomChange}
            showErrors={showErrors}
            colors={colors}
            note={noGamesAnywhere ? undefined : "Any two teams work. You punch in the score as the game goes."}
          />
          {noGamesAnywhere && (
            <div className="mt-2 flex items-center gap-3 pr-1">
              <Jax pose="sleep" size={76} />
              <p className="min-w-0 flex-1 text-footnote text-ink-subtle">
                No games to link right now, so Jax is napping. Any two teams work; you punch in the score.
              </p>
            </div>
          )}
        </div>
      ) : (
        <div key={tab} className="animate-fade-in">
          <GameList
            league={tab}
            schedule={schedule[tab]}
            selected={selected}
            onPick={onPickEvent}
            onCustom={() => onTab("custom")}
            showErrors={showErrors}
          />
        </div>
      )}
    </div>
  );
}

const FIRST_ROWS = 3;
/** Later weeks shown before "Full schedule". */
const NEXT_WEEKS = 3;
const LEAD = "lead";

function GameList({
  league,
  schedule,
  selected,
  onPick,
  onCustom,
  showErrors,
}: {
  league: ScheduleLeague;
  schedule: LeagueSchedule;
  selected: ScheduleEvent | null;
  onPick: (e: ScheduleEvent) => void;
  onCustom: () => void;
  showErrors?: boolean;
}) {
  const { loading, events, week, weeks } = schedule;
  const leadId = week?.id ?? LEAD;
  const [query, setQuery] = useState("");
  // Which week is open; until someone toggles one, the lead week (or the first
  // later week when the lead has nothing), decided once the schedule is in.
  const [openState, setOpen] = useState<string | null | undefined>(undefined);
  const open = openState === undefined ? (events.length ? leadId : (weeks[0]?.id ?? null)) : openState;
  const [leadAll, setLeadAll] = useState(false);
  const [allWeeks, setAllWeeks] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);
  const laterOpen = open && open !== leadId ? open : null;
  const later = useWeekGames(league, laterOpen, attempt);

  if (loading) {
    return (
      <div className="flex flex-col gap-2" aria-busy="true" aria-label="Loading games">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex h-14 items-center gap-3 rounded-2xl bg-surface-2 px-3 ring-1 ring-inset ring-line">
            <Skeleton className="h-7 w-15" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-4 w-16" />
          </div>
        ))}
      </div>
    );
  }

  if (!events.length && !weeks.length) {
    return (
      <div className="flex flex-col gap-3 rounded-card bg-surface-2 p-4 ring-1 ring-inset ring-line">
        <div className="flex items-center gap-3">
          <Jax pose="sleep" size={92} className="-ml-1" />
          <div className="min-w-0 flex-1">
            <p className="text-callout font-bold text-ink">No {LEAGUE_LABEL[league]} games to link right now</p>
            <p className="text-footnote text-ink-muted">Jax is napping. Type your teams and run the score yourself.</p>
          </div>
        </div>
        <button type="button" onClick={onCustom} className="pressable h-11 rounded-full bg-surface-4 px-4 text-subhead font-bold text-ink ring-1 ring-inset ring-line-strong">
          Type teams
        </button>
      </div>
    );
  }

  const q = query.trim();
  const openWeek = laterOpen ? weeks.find((w) => w.id === laterOpen) : null;
  const laterEvents = later?.status === "ready" ? later.events : [];
  const searchPool = [...events, ...laterEvents.filter((e) => !events.some((x) => x.eventId === e.eventId))];
  const results = q ? searchPool.filter((e) => matchesQuery(e, q)) : [];

  let leadRows: ScheduleEvent[] = [];
  if (open === leadId && !leadAll) {
    leadRows = events.slice(0, FIRST_ROWS);
    if (selected && events.some((e) => e.eventId === selected.eventId) && !leadRows.some((e) => e.eventId === selected.eventId)) {
      leadRows = [...leadRows, selected];
    }
  }
  const visible = new Set(
    (q ? results : open === leadId ? (leadAll ? events : leadRows) : laterEvents).map((e) => e.eventId),
  );
  const pinned = selected && !visible.has(selected.eventId) ? selected : null;
  const shownWeeks = allWeeks ? weeks : weeks.slice(0, NEXT_WEEKS);
  const hiddenWeeks = weeks.length - shownWeeks.length;

  const toggle = (id: string) => {
    void haptic("selection");
    setOpen(open === id ? null : id);
  };

  const pick = (e: ScheduleEvent) => {
    onPick(e);
    // Picked from a search: fold the search away (the pick stays on screen).
    if (q) {
      setQuery("");
      searchRef.current?.blur();
    }
  };

  const row = (e: ScheduleEvent, grouped = false) => (
    <GameRow key={e.eventId} event={e} grouped={grouped} selected={e.eventId === selected?.eventId} onPick={() => pick(e)} />
  );

  return (
    <div className="flex flex-col gap-2">
      <p className="flex items-center gap-2 px-1 text-footnote text-ink-muted">
        <LiveIcon size={16} className="shrink-0 text-ink-subtle" />
        <span>
          <span className="font-bold text-ink">Live scores built in.</span> Winners update on their own.
        </span>
      </p>

      {searchPool.length > FIRST_ROWS && (
        <div className="flex h-12 items-center gap-2 rounded-2xl bg-surface-2 pl-3.5 pr-1.5 ring-1 ring-inset ring-line transition-shadow focus-within:ring-2 focus-within:ring-brand-line">
          <SearchIcon size={18} className="shrink-0 text-ink-subtle" />
          <input
            ref={searchRef}
            type="search"
            data-testid="game-search"
            aria-label={`Search ${LEAGUE_LABEL[league]} games`}
            value={query}
            placeholder={`Find a team · ${searchPool.length} games`}
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
              onClick={() => {
                setQuery("");
                searchRef.current?.focus();
              }}
              className="tap-target grid h-10 w-10 shrink-0 place-items-center rounded-full text-ink-subtle hover:text-ink"
            >
              <XIcon size={16} />
            </button>
          )}
        </div>
      )}

      {pinned && !q && row(pinned)}

      {q ? (
        results.length ? (
          results.map((e) => row(e))
        ) : (
          <div className="flex items-center gap-3 rounded-2xl bg-surface-2 px-4 py-3 ring-1 ring-inset ring-line">
            <p className="min-w-0 flex-1 text-footnote text-ink-muted">
              No {LEAGUE_LABEL[league]} game with “{q}” in {openWeek ? `${week?.label ?? "this week"} or ${openWeek.label}` : (week?.label ?? "this week")}.
            </p>
            <button type="button" onClick={onCustom} className="pressable h-11 shrink-0 rounded-full bg-surface-4 px-4 text-subhead font-bold text-ink ring-1 ring-inset ring-line-strong">
              Type teams
            </button>
          </div>
        )
      ) : (
        <>
          {events.length > 0 && (
            <WeekHeader
              id={leadId}
              label={week?.label ?? "This week"}
              tag={week ? weekTag(week) : "This week"}
              range={week ? weekRange(week) : null}
              open={open === leadId}
              onToggle={() => toggle(leadId)}
            />
          )}
          {open === leadId && events.length > 0 && (
            <div id={`week-${leadId}`} className="flex flex-col gap-2">
              {leadAll ? <DayGroups events={events} row={row} /> : leadRows.map((e) => row(e))}
              {events.length > FIRST_ROWS && (
                <button
                  type="button"
                  data-testid="week-see-all"
                  onClick={() => setLeadAll((v) => !v)}
                  className="tap-target h-10 self-start rounded-xl px-2 text-subhead font-bold text-ink-brand hover:bg-ink/5"
                >
                  {leadAll ? "Show fewer" : `See all ${events.length} games`}
                </button>
              )}
            </div>
          )}

          {shownWeeks.map((w) => (
            <div key={w.id} className="flex flex-col gap-2">
              <WeekHeader id={w.id} label={w.label} range={weekRange(w)} open={open === w.id} onToggle={() => toggle(w.id)} />
              {open === w.id && (
                <div id={`week-${w.id}`} className="flex flex-col gap-2">
                  {!later || later.status === "loading" ? (
                    <div aria-busy="true" aria-label={`Loading ${w.label}`} className="flex flex-col gap-2">
                      {[0, 1].map((i) => (
                        <Skeleton key={i} className="h-14 w-full rounded-2xl" />
                      ))}
                    </div>
                  ) : later.status === "error" ? (
                    <div className="flex items-center gap-3 rounded-2xl bg-surface-2 px-4 py-3 ring-1 ring-inset ring-line">
                      <p className="min-w-0 flex-1 text-footnote text-ink-muted">Couldn’t load {w.label}.</p>
                      <button
                        type="button"
                        onClick={() => setAttempt((n) => n + 1)}
                        className="pressable h-11 shrink-0 rounded-full bg-surface-4 px-4 text-subhead font-bold text-ink ring-1 ring-inset ring-line-strong"
                      >
                        Try again
                      </button>
                    </div>
                  ) : later.events.length ? (
                    <DayGroups events={later.events} row={row} />
                  ) : (
                    <p className="rounded-2xl bg-surface-2 px-4 py-3 text-footnote text-ink-muted ring-1 ring-inset ring-line">
                      No matchups set for {w.label} yet. Check back once the teams are known.
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}

          {hiddenWeeks > 0 && (
            <button
              type="button"
              data-testid="week-more"
              onClick={() => {
                void haptic("selection");
                setAllWeeks(true);
              }}
              className="pressable flex h-12 items-center justify-center gap-1.5 rounded-2xl text-subhead font-bold text-ink-brand ring-1 ring-inset ring-line hover:bg-ink/5"
            >
              <CalendarIcon size={16} />
              Full schedule · {hiddenWeeks} more {hiddenWeeks === 1 ? "week" : "weeks"}
            </button>
          )}
        </>
      )}

      <p className="px-1 text-caption text-ink-subtle">Times in {zoneLabel()}</p>

      {showErrors && !selected && (
        <p role="alert" className="flex items-center gap-1.5 px-1 text-footnote font-semibold text-ink-danger">
          <AlertIcon size={14} />
          Tap a game to put it on your board.
        </p>
      )}
    </div>
  );
}

function WeekHeader({ id, label, tag, range, open, onToggle }: { id: string; label: string; tag?: string; range: string | null; open: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      data-testid="week-toggle"
      data-week={id}
      aria-expanded={open}
      aria-controls={`week-${id}`}
      onClick={onToggle}
      className={cx(
        "pressable flex min-h-12 w-full items-center gap-2 rounded-2xl px-3.5 text-left transition-colors",
        open ? "bg-transparent px-1" : "bg-surface-2 ring-1 ring-inset ring-line hover:bg-surface-3",
      )}
    >
      <span className="min-w-0 truncate font-display text-headline font-extrabold text-ink">{label}</span>
      {tag && <span className="shrink-0 rounded-full bg-brand-400/15 px-2 py-0.5 text-caption font-bold text-ink-brand">{tag}</span>}
      <span className="ml-auto shrink-0 whitespace-nowrap text-footnote font-semibold tabular-nums text-ink-muted">{range}</span>
      <ChevronDownIcon size={18} className={cx("shrink-0 text-ink-subtle transition-transform duration-200", open && "rotate-180")} />
    </button>
  );
}

function DayGroups({ events, row }: { events: ScheduleEvent[]; row: (e: ScheduleEvent, grouped?: boolean) => ReactNode }) {
  return (
    <>
      {groupByDay(events).map((g) => (
        <div key={g.day} className="flex flex-col gap-2">
          <p className="px-1 pt-1 text-caption font-bold uppercase tracking-wider text-ink-subtle">{g.day}</p>
          {g.events.map((e) => row(e, true))}
        </div>
      ))}
    </>
  );
}

function GameRow({ event, selected, grouped, onPick }: { event: ScheduleEvent; selected: boolean; grouped?: boolean; onPick: () => void }) {
  const soon = startsIn(event.startsAt);
  const { day, time } = kickoffParts(event.startsAt);
  const site = siteLabel(event);
  // The colors the board will use (away across the top), so the pick looks the same after Create.
  const { teamX: away, teamY: home } = withSideColors(event.away, event.home);
  const awayName = shortTeamName(event.away, event.league);
  const homeName = shortTeamName(event.home, event.league);
  // Longer matchups (most college ones, with their ranks) get the smaller type and
  // wrap between the teams instead of cutting a name off.
  const rankChars = (n?: number) => (n ? String(n).length + 1 : 0);
  const long = awayName.length + homeName.length + rankChars(event.ranks?.away) + rankChars(event.ranks?.home) > 12;
  const rank = (n?: number) =>
    n ? <span className="mr-0.5 align-[0.12em] font-sans text-caption font-bold text-ink-subtle">{n}</span> : null;
  return (
    <button
      type="button"
      data-testid="game-option"
      aria-pressed={selected}
      aria-label={`${event.away.name} at ${event.home.name}, ${kickoffLabel(event.startsAt)}${site ? `, ${site}` : ""}`}
      onClick={() => {
        void haptic("selection");
        onPick();
      }}
      className={cx(
        "pressable flex min-h-14 w-full items-center gap-3 rounded-2xl py-2 pl-2.5 pr-3 text-left ring-inset transition-[background-color,box-shadow]",
        selected
          ? "bg-[linear-gradient(100deg,rgb(198_249_31/0.16),rgb(198_249_31/0.04)_70%)] bg-surface-2 ring-2 ring-brand-line"
          : "bg-surface-2 ring-1 ring-line hover:bg-surface-3",
      )}
    >
      <span aria-hidden className="flex shrink-0 gap-1">
        <TeamMark team={away} size="sm" />
        <TeamMark team={home} size="sm" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span
          className={cx(
            "font-display font-extrabold text-ink",
            long ? "line-clamp-2 text-callout leading-[1.15]" : "truncate text-headline",
          )}
        >
          <span className="whitespace-nowrap">
            {rank(event.ranks?.away)}
            {awayName}
          </span>
          <span className="font-sans text-subhead font-semibold text-ink-subtle">{"\u00a0@ "}</span>
          <span className="whitespace-nowrap">
            {rank(event.ranks?.home)}
            {homeName}
          </span>
        </span>
        {site && <span className="truncate text-caption font-semibold text-ink-muted">{site}</span>}
      </span>
      <span className="flex shrink-0 flex-col items-end leading-tight">
        {grouped ? (
          <>
            <span className="text-footnote font-semibold tabular-nums text-ink">{time}</span>
            {soon && <span className="text-caption font-bold text-ink-brand">{soon}</span>}
          </>
        ) : (
          <>
            <span className={cx("text-caption font-bold", soon ? "text-ink-brand" : "text-ink-muted")}>{soon ?? day}</span>
            <span className="text-footnote font-semibold tabular-nums text-ink">{time}</span>
          </>
        )}
      </span>
      <span
        aria-hidden
        className={cx(
          "grid h-6 w-6 shrink-0 place-items-center rounded-full transition-all duration-300 ease-spring",
          selected ? "scale-100 bg-brand-400 text-ink-inverse" : "scale-90 ring-2 ring-inset ring-line-strong",
        )}
      >
        {selected && <CheckIcon size={14} strokeWidth={3.2} />}
      </span>
    </button>
  );
}
