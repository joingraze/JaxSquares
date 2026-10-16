// Step 1: which game. This week's real games (NFL / College) as tappable
// matchup rows, or a custom matchup with two typed teams.

import { useEffect, useState } from "react";
import type { ScheduleEvent } from "../../../shared/types";
import { AlertIcon, CheckIcon, FootballIcon, PencilIcon, StarIcon } from "../../components/icons";
import { Chip, cx, LiveDot, Skeleton, TeamMark } from "../../components/ui";
import { countdown, kickoffLabel } from "../../lib/format";
import { haptic } from "../../lib/native";
import { CustomMatchup } from "./CustomMatchup";
import { kickoffParts, shortTeamName } from "./model";
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
}

const LEAGUE_LABEL: Record<ScheduleLeague, string> = { nfl: "NFL", ncaaf: "College" };
const FIRST_ROWS = 5;

export function GamePicker({ schedule, tab, onTab, selectedEventId, onPickEvent, custom, onCustomChange, showErrors }: GamePickerProps) {
  const noGamesAnywhere = !schedule.nfl.loading && !schedule.ncaaf.loading && !schedule.nfl.events.length && !schedule.ncaaf.events.length;

  return (
    <div className="flex flex-col gap-3.5">
      <div role="group" aria-label="Choose a league" className="-mx-4 flex gap-2 overflow-x-auto px-4 scrollbar-none">
        {(["nfl", "ncaaf"] as const).map((league) => (
          <Chip key={league} selected={tab === league} onClick={() => onTab(league)} icon={league === "nfl" ? <FootballIcon /> : <StarIcon />}>
            {LEAGUE_LABEL[league]}
            {!schedule[league].loading && schedule[league].events.length > 0 && (
              <span className={cx("tabular-nums", tab === league ? "text-ink-inverse/60" : "text-ink-subtle")}>{schedule[league].events.length}</span>
            )}
          </Chip>
        ))}
        <Chip data-testid="custom-matchup" selected={tab === "custom"} onClick={() => onTab("custom")} icon={<PencilIcon />}>
          Custom
        </Chip>
      </div>

      {tab === "custom" ? (
        <div key="custom" className="animate-fade-in">
          <CustomMatchup
            x={custom.x}
            y={custom.y}
            onChange={onCustomChange}
            showErrors={showErrors}
            note={
              noGamesAnywhere
                ? "No live games to link right now. Type any two teams and you'll punch in the score."
                : "Any two teams work. You'll punch in the score as the game goes."
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
  const [expanded, setExpanded] = useState(false);
  const selectedIndex = events.findIndex((e) => e.eventId === selectedEventId);
  useEffect(() => {
    if (selectedIndex >= FIRST_ROWS) setExpanded(true);
  }, [selectedIndex]);

  if (loading) {
    return (
      <div className="flex flex-col gap-2" aria-busy="true" aria-label="Loading games">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex h-17 items-center gap-3 rounded-card bg-surface-2 px-3.5 ring-1 ring-inset ring-line">
            <Skeleton className="h-10 w-10" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/3" />
            </div>
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
        <button type="button" onClick={onCustom} className="pressable shrink-0 rounded-full bg-surface-4 px-3.5 py-2 text-subhead font-bold text-ink ring-1 ring-inset ring-line-strong">
          Type teams
        </button>
      </div>
    );
  }

  const shown = expanded ? events : events.slice(0, FIRST_ROWS);
  return (
    <div className="flex flex-col gap-2">
      <p className="flex items-center gap-2 px-1 pb-0.5 text-footnote text-ink-muted">
        <LiveDot tone="brand" />
        <span>
          <span className="font-bold text-ink">Live scores built in.</span> Winners update on their own.
        </span>
      </p>
      {shown.map((e) => (
        <GameRow key={e.eventId} event={e} selected={e.eventId === selectedEventId} onPick={() => onPick(e)} />
      ))}
      {!expanded && events.length > FIRST_ROWS && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="pressable h-11 rounded-btn text-subhead font-bold text-ink-muted ring-1 ring-inset ring-line hover:text-ink"
        >
          Show {events.length - FIRST_ROWS} more games
        </button>
      )}
      {showErrors && !selectedEventId && (
        <p className="flex items-center gap-1.5 px-1 text-footnote font-semibold text-danger-400">
          <AlertIcon size={14} />
          Tap a game to put it on your board.
        </p>
      )}
    </div>
  );
}

function GameRow({ event, selected, onPick }: { event: ScheduleEvent; selected: boolean; onPick: () => void }) {
  const until = event.startsAt - Date.now();
  const soon = until > 0 && until < 6 * 3_600_000;
  const { day, time } = kickoffParts(event.startsAt);
  const line = (team: ScheduleEvent["home"]) => (
    <span className="flex min-w-0 items-center gap-2.5">
      <TeamMark team={team} size="sm" />
      <span className="truncate font-display text-headline font-extrabold text-ink">{shortTeamName(team, event.league)}</span>
    </span>
  );
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
        "pressable relative flex w-full items-center gap-3 overflow-hidden rounded-card py-2.5 pl-3.5 pr-3.5 text-left ring-inset transition-[background-color,box-shadow]",
        selected
          ? "bg-[linear-gradient(100deg,rgb(198_249_31/0.16),rgb(198_249_31/0.04)_70%)] bg-surface-2 ring-2 ring-brand-400 shadow-glow-brand"
          : "bg-surface-2 ring-1 ring-line hover:bg-surface-3",
      )}
    >
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        {line(event.away)}
        {line(event.home)}
      </span>
      <span className="flex shrink-0 flex-col items-end text-right">
        {soon ? (
          <>
            <span className="flex items-center gap-1.5 text-footnote font-extrabold text-live-400">
              <LiveDot />
              in {countdown(until)}
            </span>
            <span className="text-footnote tabular-nums text-ink-muted">{day} {time}</span>
          </>
        ) : (
          <>
            <span className="text-footnote font-bold text-ink">{day}</span>
            <span className="text-footnote tabular-nums text-ink-muted">{time}</span>
          </>
        )}
      </span>
      <span
        aria-hidden
        className={cx(
          "grid h-7 w-7 shrink-0 place-items-center rounded-full transition-all duration-300 ease-spring",
          selected ? "scale-100 bg-brand-400 text-ink-inverse" : "scale-90 ring-2 ring-inset ring-line-strong",
        )}
      >
        {selected && <CheckIcon size={16} strokeWidth={3} />}
      </span>
    </button>
  );
}
