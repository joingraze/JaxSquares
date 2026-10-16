// Two team fields with a VS divider and NFL autocomplete. Each side previews
// the badge it will get on the board as you type.

import { useRef, useState, type KeyboardEvent } from "react";
import { searchNflTeams, type NflTeam } from "../../../shared/teams";
import type { Team } from "../../../shared/types";
import { AlertIcon } from "../../components/icons";
import { cx, TeamMark } from "../../components/ui";
import { withAlpha } from "../../lib/format";
import { haptic } from "../../lib/native";
import { matchNflTeam, resolveCustomTeam, TEAM_NAME_MAX } from "./model";

/** Board fallback colors (teamVars): custom boards show these, so the preview does too. */
export const CUSTOM_X_COLOR = "#3ab7ff";
export const CUSTOM_Y_COLOR = "#ff66a6";

export interface CustomMatchupProps {
  x: string;
  y: string;
  onChange: (side: "x" | "y", value: string) => void;
  /** Highlight the empty field(s) after a Create tap with teams missing. */
  showErrors?: boolean;
  /** Muted line under the fields (e.g. why we're on custom). */
  note?: string;
}

type Side = "x" | "y";

export function CustomMatchup({ x, y, onChange, showErrors, note }: CustomMatchupProps) {
  const [active, setActive] = useState<Side | null>(null);
  const refs = { x: useRef<HTMLInputElement>(null), y: useRef<HTMLInputElement>(null) };

  const values = { x, y };
  const activeValue = active ? values[active] : "";
  const suggestions = active && activeValue.trim() && !matchNflTeam(activeValue) ? searchNflTeams(activeValue, 3) : [];

  const choose = (side: Side, team: NflTeam) => {
    void haptic("selection");
    onChange(side, team.nickname);
    if (side === "x" && !values.y.trim()) {
      refs.y.current?.focus();
    } else {
      refs[side].current?.blur();
      setActive(null);
    }
  };

  const onKeyDown = (side: Side) => (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (suggestions.length === 1) return choose(side, suggestions[0]);
    if (side === "x") refs.y.current?.focus();
    else e.currentTarget.blur();
  };

  const field = (side: Side) => {
    const value = values[side];
    const resolved = resolveCustomTeam(value);
    const color = side === "x" ? CUSTOM_X_COLOR : CUSTOM_Y_COLOR;
    const preview: Team | null = resolved ? { ...resolved.team, color } : null;
    const missing = showErrors && !value.trim();
    return (
      <div className="flex min-w-0 flex-col items-center gap-2.5">
        <span className="relative grid h-15 w-15 place-items-center">
          {preview ? (
            <TeamMark key={preview.abbr ?? preview.name} team={preview} size="lg" className={cx("h-15 w-15 animate-pop", side === "x" ? "-rotate-3" : "rotate-3")} />
          ) : (
            <span
              aria-hidden
              className="grid h-15 w-15 place-items-center rounded-2xl border-2 border-dashed font-display text-title-3 font-extrabold"
              style={{ borderColor: `${color}66`, color: `${color}b3` }}
            >
              {side === "x" ? "1" : "2"}
            </span>
          )}
        </span>
        <div
          className={cx(
            "flex h-12 w-full items-center rounded-btn bg-surface-3 px-3 ring-1 ring-inset transition-shadow focus-within:ring-2",
            missing ? "animate-shake ring-danger-500" : "ring-line-strong focus-within:ring-brand-400 focus-within:shadow-[0_0_0_4px_rgb(198_249_31/0.14)]",
          )}
        >
          <input
            ref={refs[side]}
            data-testid={side === "x" ? "team-x-input" : "team-y-input"}
            aria-label={side === "x" ? "Team 1" : "Team 2"}
            aria-invalid={missing || undefined}
            value={value}
            maxLength={TEAM_NAME_MAX}
            placeholder={side === "x" ? "Packers" : "Bears"}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="words"
            spellCheck={false}
            enterKeyHint={side === "x" ? "next" : "done"}
            onFocus={() => setActive(side)}
            onKeyDown={onKeyDown(side)}
            onChange={(e) => onChange(side, e.target.value)}
            className="h-full w-full min-w-0 bg-transparent text-center font-display text-headline font-bold text-ink outline-none placeholder:font-sans placeholder:font-normal"
          />
        </div>
        <span className="h-4 max-w-full truncate text-caption font-semibold text-ink-subtle">
          {resolved?.nfl ? `${resolved.nfl.location} ${resolved.nfl.nickname}` : side === "x" ? "Team 1" : "Team 2"}
        </span>
      </div>
    );
  };

  const suggestionRow = (side: Side) =>
    active === side &&
    suggestions.length > 0 && (
      <div role="listbox" aria-label="Suggested teams" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-0.5 scrollbar-none animate-fade-in">
        {suggestions.map((t) => (
          <button
            key={t.abbr}
            type="button"
            role="option"
            aria-selected={false}
            // Keep the input focused so the tap lands on the chip.
            onPointerDown={(e) => e.preventDefault()}
            onClick={() => choose(side, t)}
            className="pressable inline-flex h-9 shrink-0 items-center gap-2 rounded-full bg-surface-4 pl-1 pr-3.5 text-subhead font-bold text-ink ring-1 ring-inset ring-line-strong"
          >
            <TeamMark team={{ name: t.nickname, abbr: t.abbr, color: side === "x" ? CUSTOM_X_COLOR : CUSTOM_Y_COLOR }} size="sm" className="rounded-full" />
            {t.location} {t.nickname}
          </button>
        ))}
      </div>
    );

  const filled = Boolean(x.trim()) && Boolean(y.trim());
  const glow = filled ? 0.3 : 0.14;
  return (
    <div className="flex flex-col gap-2.5">
      <div
        className="relative rounded-card bg-surface-2 px-4 pb-3 pt-4 ring-1 ring-inset ring-line shadow-card transition-[background-image]"
        style={{
          backgroundImage: `radial-gradient(70% 90% at 0% 0%, ${withAlpha(CUSTOM_X_COLOR, glow)}, transparent 70%), radial-gradient(70% 90% at 100% 0%, ${withAlpha(CUSTOM_Y_COLOR, glow)}, transparent 70%)`,
        }}
      >
        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-3">
          {field("x")}
          <span
            aria-hidden
            className={cx(
              "mt-4 grid h-8 w-8 place-items-center rounded-full font-display text-caption font-extrabold tracking-wider transition-colors duration-300",
              filled ? "bg-brand-400 text-ink-inverse" : "bg-surface-4 text-ink-subtle ring-1 ring-inset ring-line-strong",
            )}
          >
            VS
          </span>
          {field("y")}
        </div>
      </div>
      {suggestionRow("x")}
      {suggestionRow("y")}
      {showErrors && (!x.trim() || !y.trim()) ? (
        <p className="flex items-center gap-1.5 px-1 text-footnote font-semibold text-danger-400">
          <AlertIcon size={14} />
          Add both teams to make the board.
        </p>
      ) : (
        note && <p className="px-1 text-footnote text-ink-subtle">{note}</p>
      )}
    </div>
  );
}
