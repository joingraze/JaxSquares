// Which game: this week's real games (NFL / College) as dense one-line rows
// (soonest three, plus search), or a custom matchup with two typed teams.

import { useRef, useState } from "react";
import type { ScheduleEvent } from "../../../shared/types";
import { AlertIcon, CheckIcon, FootballIcon, LiveIcon, PencilIcon, SearchIcon, StarIcon, XIcon } from "../../components/icons";
import { cx, SegmentedControl, Skeleton, TeamMark } from "../../components/ui";
import { kickoffLabel, shortTeamName } from "../../lib/format";
import { haptic } from "../../lib/native";
import { CustomMatchup } from "./CustomMatchup";
import { kickoffParts, startsIn, withSideColors, type TeamColors } from "./model";
import type { Schedule, ScheduleLeague } from "./useSchedule";

export type PickerTab = ScheduleLeague | "custom";

export interface GamePickerProps {
  schedule: Schedule;
  tab: PickerTab;
  onTab: (tab: PickerTab) => void;
  selectedEventId: string | null;
  onPickEvent: (event: ScheduleEvent) => void;
  custom: { x: string; y: string };
  onCustomChange: (side: "x" | "y", value: string) => void;
  showErrors?: boolean;
  /** Live NFL team colors, so typed teams match their real games. */
  colors?: TeamColors;
}

const LEAGUE_LABEL: Record<ScheduleLeague, string> = { nfl: "NFL", ncaaf: "College" };
const FIRST_ROWS = 3;

export function GamePicker({ schedule, tab, onTab, selectedEventId, onPickEvent, custom, onCustomChange, showErrors, colors }: GamePickerProps) {
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
            note={
              noGamesAnywhere
                ? "No games to link right now. Any two teams work; you punch in the score."
                : "Any two teams work. You punch in the score as the game goes."
            }
          />
        </div>
      ) : (
        <div key={tab} className="animate-fade-in">
          <GameList
            league={tab}
            loading={schedule[tab].loading}
            events={schedule[tab].events}
            selectedEventId={selectedEventId}
            onPick={onPickEvent}
            onCustom={() => onTab("custom")}
            showErrors={showErrors}
          />
        </div>
      )}
    </div>
  );
}

function matches(e: ScheduleEvent, q: string): boolean {
  const hay = [e.away.name, e.home.name, e.away.abbr, e.home.abbr, e.shortName].join(" ").toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((w) => hay.includes(w));
}

function GameList({
  league,
  loading,
  events,
  selectedEventId,
  onPick,
  onCustom,
  showErrors,
}: {
  league: ScheduleLeague;
  loading: boolean;
  events: ScheduleEvent[];
  selectedEventId: string | null;
  onPick: (e: ScheduleEvent) => void;
  onCustom: () => void;
  showErrors?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

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

  if (!events.length) {
    return (
      <div className="flex items-center gap-3.5 rounded-card bg-surface-2 p-4 ring-1 ring-inset ring-line">
        <span aria-hidden className="text-[1.75rem] leading-none">📡</span>
        <div className="min-w-0 flex-1">
          <p className="text-callout font-bold text-ink">No {LEAGUE_LABEL[league]} games to link right now</p>
          <p className="text-footnote text-ink-muted">Type your teams and run the score yourself.</p>
        </div>
        <button type="button" onClick={onCustom} className="pressable h-11 shrink-0 rounded-full bg-surface-4 px-4 text-subhead font-bold text-ink ring-1 ring-inset ring-line-strong">
          Type teams
        </button>
      </div>
    );
  }

  const q = query.trim();
  let shown: ScheduleEvent[];
  if (q) shown = events.filter((e) => matches(e, q));
  else if (expanded) shown = events;
  else {
    shown = events.slice(0, FIRST_ROWS);
    const picked = events.find((e) => e.eventId === selectedEventId);
    if (picked && !shown.includes(picked)) shown = [...shown, picked];
  }
  const searchable = events.length > FIRST_ROWS;

  const pick = (e: ScheduleEvent) => {
    onPick(e);
    // Picked from a search or the full list: fold back to the short list (the pick stays in it).
    if (q || expanded) {
      setQuery("");
      setExpanded(false);
      searchRef.current?.blur();
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <p className="flex items-center gap-2 px-1 text-footnote text-ink-muted">
        <LiveIcon size={16} className="shrink-0 text-ink-subtle" />
        <span>
          <span className="font-bold text-ink">Live scores built in.</span> Winners update on their own.
        </span>
      </p>
      {shown.map((e) => (
        <GameRow key={e.eventId} event={e} selected={e.eventId === selectedEventId} onPick={() => pick(e)} />
      ))}
      {q && shown.length === 0 && (
        <div className="flex items-center gap-3 rounded-2xl bg-surface-2 px-4 py-3 ring-1 ring-inset ring-line">
          <p className="min-w-0 flex-1 text-footnote text-ink-muted">No {LEAGUE_LABEL[league]} game with “{q}” this week.</p>
          <button type="button" onClick={onCustom} className="pressable h-11 shrink-0 rounded-full bg-surface-4 px-4 text-subhead font-bold text-ink ring-1 ring-inset ring-line-strong">
            Type teams
          </button>
        </div>
      )}
      {searchable && (
        <div className="flex h-12 items-center gap-2 rounded-2xl bg-surface-2 pl-3.5 pr-1.5 ring-1 ring-inset ring-line transition-shadow focus-within:ring-2 focus-within:ring-brand-400">
          <SearchIcon size={18} className="shrink-0 text-ink-subtle" />
          <input
            ref={searchRef}
            type="search"
            aria-label={`Search ${LEAGUE_LABEL[league]} games`}
            value={query}
            placeholder={`Find a team · ${events.length} games`}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="search"
            onChange={(e) => setQuery(e.target.value)}
            className="h-full min-w-0 flex-1 bg-transparent text-callout font-medium text-ink outline-none placeholder:text-ink-subtle [&::-webkit-search-cancel-button]:hidden"
          />
          {q ? (
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
          ) : (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="tap-target h-10 shrink-0 rounded-xl px-3 text-subhead font-bold text-brand-400 hover:bg-white/5"
            >
              {expanded ? "Fewer" : "See all"}
            </button>
          )}
        </div>
      )}
      {showErrors && !selectedEventId && (
        <p role="alert" className="flex items-center gap-1.5 px-1 text-footnote font-semibold text-danger-400">
          <AlertIcon size={14} />
          Tap a game to put it on your board.
        </p>
      )}
    </div>
  );
}

function GameRow({ event, selected, onPick }: { event: ScheduleEvent; selected: boolean; onPick: () => void }) {
  const soon = startsIn(event.startsAt);
  const { day, time } = kickoffParts(event.startsAt);
  // The colors the board will use (away across the top), so the pick looks the same after Create.
  const { teamX: away, teamY: home } = withSideColors(event.away, event.home);
  const awayName = shortTeamName(event.away, event.league);
  const homeName = shortTeamName(event.home, event.league);
  // Long college names wrap between the teams instead of cutting one off.
  const long = awayName.length + homeName.length > 16;
  return (
    <button
      type="button"
      data-testid="game-option"
      aria-pressed={selected}
      aria-label={`${event.away.name} at ${event.home.name}, ${kickoffLabel(event.startsAt)}`}
      onClick={() => {
        void haptic("selection");
        onPick();
      }}
      className={cx(
        "pressable flex h-14 w-full items-center gap-3 rounded-2xl pl-2.5 pr-3 text-left ring-inset transition-[background-color,box-shadow]",
        selected
          ? "bg-[linear-gradient(100deg,rgb(198_249_31/0.16),rgb(198_249_31/0.04)_70%)] bg-surface-2 ring-2 ring-brand-400"
          : "bg-surface-2 ring-1 ring-line hover:bg-surface-3",
      )}
    >
      <span aria-hidden className="flex shrink-0 gap-1">
        <TeamMark team={away} size="sm" />
        <TeamMark team={home} size="sm" />
      </span>
      <span
        className={cx(
          "min-w-0 flex-1 font-display font-extrabold text-ink",
          long ? "line-clamp-2 text-callout leading-[1.15]" : "truncate text-headline",
        )}
      >
        <span className="whitespace-nowrap">{awayName}</span>
        <span className="font-sans text-subhead font-semibold text-ink-subtle">{"\u00a0@ "}</span>
        <span className="whitespace-nowrap">{homeName}</span>
      </span>
      <span className="flex shrink-0 flex-col items-end leading-tight">
        <span className={cx("text-caption font-bold", soon ? "text-brand-300" : "text-ink-muted")}>{soon ?? day}</span>
        <span className="text-footnote font-semibold tabular-nums text-ink">{time}</span>
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
