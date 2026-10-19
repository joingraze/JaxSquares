// Which game: first the sport (Football | Basketball), then its leagues as
// chips (NFL, College; NBA, WNBA, Men's college, Women's college) and Custom.
// Football goes a week at a time — the current week's soonest three (plus "see
// all" and search), later weeks as rows that open to that week's schedule.
// Basketball has no weeks: the next 7 days, a row per day (today first, the
// first day with games open), and any other date from a date picker. Custom is
// two typed teams the host scores by hand, as football or basketball.

import { useRef, useState, type ReactNode, type RefObject } from "react";
import { LEAGUE_INFO, SPORT_LEAGUES, type BoardSport } from "../../../shared/sports";
import type { ScheduleEvent } from "../../../shared/types";
import {
  AlertIcon,
  BasketballIcon,
  CalendarIcon,
  CheckIcon,
  ChevronDownIcon,
  FootballIcon,
  LiveIcon,
  PencilIcon,
  SearchIcon,
  XIcon,
} from "../../components/icons";
import { cx, Jax, SegmentedControl, Skeleton, TeamMark } from "../../components/ui";
import { kickoffLabel, shortTeamName } from "../../lib/format";
import { haptic } from "../../lib/native";
import { CustomMatchup } from "./CustomMatchup";
import { kickoffParts, startsIn, withSideColors, type TeamColors } from "./model";
import { dateInputValue, dayIdOf, groupByDay, matchesQuery, pickedDayLabel, siteLabel, weekRange, weekTag, zoneLabel } from "./scheduleView";
import { useDayGames, useWeekGames, type LeagueSchedule, type Schedule, type ScheduleLeague } from "./useSchedule";

export type PickerTab = ScheduleLeague | "custom";

export interface GamePickerProps {
  schedule: Schedule;
  /** The sport whose leagues show (football by default). */
  sport?: BoardSport;
  onSport?: (sport: BoardSport) => void;
  tab: PickerTab;
  onTab: (tab: PickerTab) => void;
  selected: ScheduleEvent | null;
  onPickEvent: (event: ScheduleEvent) => void;
  custom: { x: string; y: string };
  onCustomChange: (side: "x" | "y", value: string) => void;
  showErrors?: boolean;
  /** Live team colors for the sport (NFL or NBA), so typed teams match their real games. */
  colors?: TeamColors;
  /** Under the typed teams on the Custom tab (the create flow's kickoff picker). */
  customFooter?: ReactNode;
}

const leagueLabel = (league: ScheduleLeague) => LEAGUE_INFO[league].label;

export function GamePicker({
  schedule,
  sport = "football",
  onSport,
  tab,
  onTab,
  selected,
  onPickEvent,
  custom,
  onCustomChange,
  showErrors,
  colors,
  customFooter,
}: GamePickerProps) {
  const leagues = SPORT_LEAGUES[sport];
  const noGamesAnywhere = leagues.every((l) => !schedule[l].loading && !schedule[l].events.length);
  const count = (league: ScheduleLeague) =>
    !schedule[league].loading && schedule[league].events.length > 0 ? schedule[league].events.length : null;

  return (
    <div className="flex flex-col gap-3">
      <SegmentedControl<BoardSport>
        aria-label="Sport"
        data-testid="sport-picker"
        value={sport}
        onChange={(next) => onSport?.(next)}
        options={[
          { value: "football", icon: <FootballIcon />, label: "Football", testId: "sport-football" },
          { value: "basketball", icon: <BasketballIcon />, label: "Basketball", testId: "sport-basketball" },
        ]}
      />

      <div
        role="radiogroup"
        aria-label="League"
        data-testid="league-picker"
        className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-0.5 scrollbar-none"
      >
        {leagues.map((league) => (
          <LeagueChip key={league} on={tab === league} onClick={() => onTab(league)} league={league} count={count(league)}>
            {leagueLabel(league)}
          </LeagueChip>
        ))}
        <LeagueChip on={tab === "custom"} onClick={() => onTab("custom")} league="custom" testId="custom-matchup" icon={<PencilIcon size={16} />}>
          Custom
        </LeagueChip>
      </div>

      {tab === "custom" ? (
        <div key={`custom-${sport}`} className="animate-fade-in">
          <CustomMatchup
            x={custom.x}
            y={custom.y}
            onChange={onCustomChange}
            showErrors={showErrors}
            colors={colors}
            sport={sport}
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
          {customFooter && <div className="mt-4">{customFooter}</div>}
        </div>
      ) : (
        <div key={tab} className="animate-fade-in">
          {LEAGUE_INFO[tab].schedule === "day" ? (
            <DayList
              league={tab}
              schedule={schedule[tab]}
              selected={selected}
              onPick={onPickEvent}
              onCustom={() => onTab("custom")}
              showErrors={showErrors}
            />
          ) : (
            <GameList
              league={tab}
              schedule={schedule[tab]}
              selected={selected}
              onPick={onPickEvent}
              onCustom={() => onTab("custom")}
              showErrors={showErrors}
            />
          )}
        </div>
      )}
    </div>
  );
}

/** One league chip: its name and how many games it has to link. */
function LeagueChip({
  on,
  onClick,
  league,
  count = null,
  icon,
  testId = "league-option",
  children,
}: {
  on: boolean;
  onClick: () => void;
  league: ScheduleLeague | "custom";
  count?: number | null;
  icon?: ReactNode;
  testId?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      data-testid={testId}
      data-league={league}
      onClick={() => {
        if (on) return;
        void haptic("selection");
        onClick();
      }}
      className={cx(
        "pressable tap-target inline-flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-subhead font-bold transition-colors",
        on
          ? "bg-brand-400 text-ink-inverse shadow-[inset_0_1px_0_rgb(255_255_255/0.35)]"
          : "bg-surface-3 text-ink-muted ring-1 ring-inset ring-line hover:text-ink",
      )}
    >
      {icon}
      {children}
      {count !== null && <span className={cx("tabular-nums", on ? "text-ink-inverse/70" : "text-ink-subtle")}>{count}</span>}
    </button>
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

  if (loading) return <ListSkeleton />;

  if (!events.length && !weeks.length) return <NoGames league={league} onCustom={onCustom} />;

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

      {searchPool.length > FIRST_ROWS && <SearchBox inputRef={searchRef} league={league} count={searchPool.length} query={query} onQuery={setQuery} />}

      {pinned && !q && row(pinned)}

      {q ? (
        results.length ? (
          results.map((e) => row(e))
        ) : (
          <NoMatch onCustom={onCustom}>
            No {leagueLabel(league)} game with “{q}” in {openWeek ? `${week?.label ?? "this week"} or ${openWeek.label}` : (week?.label ?? "this week")}.
          </NoMatch>
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

function ListSkeleton() {
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

function NoGames({ league, onCustom, when = "right now", children }: { league: ScheduleLeague; onCustom: () => void; when?: string; children?: ReactNode }) {
  return (
    <div data-testid="no-games" className="flex flex-col gap-3 rounded-card bg-surface-2 p-4 ring-1 ring-inset ring-line">
      <div className="flex items-center gap-3">
        <Jax pose="sleep" size={92} className="-ml-1" />
        <div className="min-w-0 flex-1">
          <p className="text-callout font-bold text-ink">
            No {leagueLabel(league)} games to link {when}
          </p>
          <p className="text-footnote text-ink-muted">Jax is napping. Type your teams and run the score yourself.</p>
        </div>
      </div>
      {children}
      <button type="button" onClick={onCustom} className="pressable h-11 rounded-full bg-surface-4 px-4 text-subhead font-bold text-ink ring-1 ring-inset ring-line-strong">
        Type teams
      </button>
    </div>
  );
}

function NoMatch({ onCustom, children }: { onCustom: () => void; children: ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-surface-2 px-4 py-3 ring-1 ring-inset ring-line">
      <p className="min-w-0 flex-1 text-footnote text-ink-muted">{children}</p>
      <button type="button" onClick={onCustom} className="pressable h-11 shrink-0 rounded-full bg-surface-4 px-4 text-subhead font-bold text-ink ring-1 ring-inset ring-line-strong">
        Type teams
      </button>
    </div>
  );
}

function SearchBox({
  inputRef,
  league,
  count,
  query,
  onQuery,
}: {
  inputRef: RefObject<HTMLInputElement>;
  league: ScheduleLeague;
  count: number;
  query: string;
  onQuery: (q: string) => void;
}) {
  return (
    <div className="flex h-12 items-center gap-2 rounded-2xl bg-surface-2 pl-3.5 pr-1.5 ring-1 ring-inset ring-line transition-shadow focus-within:ring-2 focus-within:ring-brand-line">
      <SearchIcon size={18} className="shrink-0 text-ink-subtle" />
      <input
        ref={inputRef}
        type="search"
        data-testid="game-search"
        aria-label={`Search ${leagueLabel(league)} games`}
        value={query}
        placeholder={`Find a team · ${count} games`}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="search"
        onChange={(e) => onQuery(e.target.value)}
        className="h-full min-w-0 flex-1 bg-transparent text-body font-medium text-ink outline-none placeholder:text-ink-subtle [&::-webkit-search-cancel-button]:hidden"
      />
      {query.trim() && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => {
            onQuery("");
            inputRef.current?.focus();
          }}
          className="tap-target grid h-10 w-10 shrink-0 place-items-center rounded-full text-ink-subtle hover:text-ink"
        >
          <XIcon size={16} />
        </button>
      )}
    </div>
  );
}

/** Rows an open basketball day shows before "See all". */
const DAY_ROWS = 6;

/** A day heading as an element id: "Wednesday, Oct 21" -> "wednesday-oct-21". */
const daySlug = (day: string) => day.toLowerCase().replace(/[^a-z0-9]+/g, "-");

/**
 * Basketball's games, a day at a time: the next 7 days as rows (each local
 * day with games, today first; the first one open), a search across them, and
 * another date from the phone's date picker (that day loads when picked).
 */
function DayList({
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
  const { loading, events } = schedule;
  const [query, setQuery] = useState("");
  const [openState, setOpen] = useState<string | null | undefined>(undefined);
  const [all, setAll] = useState<string | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);
  const picked = useDayGames(league, date, attempt);

  if (loading) return <ListSkeleton />;

  const days = groupByDay(events);
  // Until someone toggles a day, the first one with games is open.
  const open = openState === undefined ? (days[0]?.day ?? null) : openState;
  const q = query.trim();
  const pickedEvents = picked?.status === "ready" ? picked.events : [];
  const searchPool = [...events, ...pickedEvents.filter((e) => !events.some((x) => x.eventId === e.eventId))];
  const results = q ? searchPool.filter((e) => matchesQuery(e, q)) : [];
  const openDay = days.find((d) => d.day === open) ?? null;
  let openRows: ScheduleEvent[] = [];
  if (openDay) {
    openRows = all === openDay.day ? openDay.events : openDay.events.slice(0, DAY_ROWS);
    if (selected && openDay.events.some((e) => e.eventId === selected.eventId) && !openRows.some((e) => e.eventId === selected.eventId)) {
      openRows = [...openRows, selected];
    }
  }
  const visible = new Set((q ? results : [...openRows, ...pickedEvents]).map((e) => e.eventId));
  const pinned = selected && selected.league === league && !visible.has(selected.eventId) ? selected : null;

  const toggle = (day: string) => {
    void haptic("selection");
    setOpen(open === day ? null : day);
  };
  const pick = (e: ScheduleEvent) => {
    onPick(e);
    if (q) {
      setQuery("");
      searchRef.current?.blur();
    }
  };
  const row = (e: ScheduleEvent, grouped = false) => (
    <GameRow key={e.eventId} event={e} grouped={grouped} selected={e.eventId === selected?.eventId} onPick={() => pick(e)} />
  );
  const datePicker = <DatePickerRow date={date} onDate={setDate} />;

  return (
    <div data-testid="day-list" className="flex flex-col gap-2">
      <p className="flex items-center gap-2 px-1 text-footnote text-ink-muted">
        <LiveIcon size={16} className="shrink-0 text-ink-subtle" />
        <span>
          <span className="font-bold text-ink">Live scores built in.</span> Winners update on their own.
        </span>
      </p>

      {searchPool.length > FIRST_ROWS && <SearchBox inputRef={searchRef} league={league} count={searchPool.length} query={query} onQuery={setQuery} />}

      {pinned && !q && row(pinned)}

      {q ? (
        results.length ? (
          results.map((e) => row(e))
        ) : (
          <NoMatch onCustom={onCustom}>
            No {leagueLabel(league)} game with “{q}” in the next 7 days{date ? " or that date" : ""}.
          </NoMatch>
        )
      ) : (
        <>
          {days.length === 0 && !date && (
            <NoGames league={league} onCustom={onCustom} when="in the next 7 days">
              <p className="text-footnote text-ink-muted">Or pick a date further out below.</p>
            </NoGames>
          )}
          {days.map((d) => (
            <div key={d.day} className="flex flex-col gap-2">
              <WeekHeader
                id={daySlug(d.day)}
                testId="day-toggle"
                label={d.day}
                range={`${d.events.length} ${d.events.length === 1 ? "game" : "games"}`}
                open={open === d.day}
                onToggle={() => toggle(d.day)}
              />
              {open === d.day && (
                <div id={`week-${daySlug(d.day)}`} className="flex flex-col gap-2">
                  {openRows.map((e) => row(e, true))}
                  {d.events.length > DAY_ROWS && (
                    <button
                      type="button"
                      data-testid="day-see-all"
                      onClick={() => setAll((cur) => (cur === d.day ? null : d.day))}
                      className="tap-target h-10 self-start rounded-xl px-2 text-subhead font-bold text-ink-brand hover:bg-ink/5"
                    >
                      {all === d.day ? "Show fewer" : `See all ${d.events.length} games`}
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}

          {datePicker}
          {date && (
            <div className="flex flex-col gap-2">
              {!picked || picked.status === "loading" ? (
                <div aria-busy="true" aria-label={`Loading ${pickedDayLabel(date)}`} className="flex flex-col gap-2">
                  {[0, 1].map((i) => (
                    <Skeleton key={i} className="h-14 w-full rounded-2xl" />
                  ))}
                </div>
              ) : picked.status === "error" ? (
                <div className="flex items-center gap-3 rounded-2xl bg-surface-2 px-4 py-3 ring-1 ring-inset ring-line">
                  <p className="min-w-0 flex-1 text-footnote text-ink-muted">Couldn’t load {pickedDayLabel(date)}.</p>
                  <button
                    type="button"
                    onClick={() => setAttempt((n) => n + 1)}
                    className="pressable h-11 shrink-0 rounded-full bg-surface-4 px-4 text-subhead font-bold text-ink ring-1 ring-inset ring-line-strong"
                  >
                    Try again
                  </button>
                </div>
              ) : picked.events.length ? (
                <DayGroups events={picked.events} row={row} />
              ) : (
                <p className="rounded-2xl bg-surface-2 px-4 py-3 text-footnote text-ink-muted ring-1 ring-inset ring-line">
                  No {leagueLabel(league)} games on {pickedDayLabel(date)} yet.
                </p>
              )}
            </div>
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

/** "Another date": the phone's own date picker over the row; a date loads that day's games. */
function DatePickerRow({ date, onDate }: { date: string | null; onDate: (date: string | null) => void }) {
  const now = Date.now();
  return (
    <div className="flex min-h-12 items-center gap-2 rounded-2xl bg-surface-2 pr-1.5 ring-1 ring-inset ring-line">
      <label className="relative flex min-h-12 min-w-0 flex-1 cursor-pointer items-center gap-2 px-3.5 text-subhead font-bold text-ink-brand">
        <CalendarIcon size={16} className="shrink-0" />
        <span className="truncate">{date ? pickedDayLabel(date) : "Another date"}</span>
        <input
          type="date"
          data-testid="day-picker"
          aria-label="Pick another date"
          value={date ? dateInputValue(date) : ""}
          min={dateInputValue(dayIdOf(now))}
          max={dateInputValue(dayIdOf(now + 365 * 86_400_000))}
          onClick={(e) => {
            try {
              e.currentTarget.showPicker?.();
            } catch {
              // Not allowed here (or not supported): the tap focuses the input instead.
            }
          }}
          onChange={(e) => onDate(e.target.value ? e.target.value.replace(/-/g, "") : null)}
          className="absolute inset-0 h-full w-full cursor-pointer text-body opacity-0"
        />
      </label>
      {date && (
        <button
          type="button"
          aria-label="Clear the date"
          onClick={() => onDate(null)}
          className="tap-target grid h-10 w-10 shrink-0 place-items-center rounded-full text-ink-subtle hover:text-ink"
        >
          <XIcon size={16} />
        </button>
      )}
    </div>
  );
}

function WeekHeader({
  id,
  label,
  tag,
  range,
  open,
  onToggle,
  testId = "week-toggle",
}: {
  id: string;
  label: string;
  tag?: string;
  range: string | null;
  open: boolean;
  onToggle: () => void;
  testId?: string;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
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
