// Two typed teams, stacked full width with the VS between them. Before anything
// is typed, popular teams sit underneath as one-tap chips (two taps make a
// board); while typing, NFL autocomplete takes their place. A team that matches
// a known NFL team gets that team's live colors everywhere (preview, chips,
// board); anything else gets the board's side color.

import { useRef, useState, type KeyboardEvent } from "react";
import { searchNflTeams, type NflTeam } from "../../../shared/teams";
import type { Team } from "../../../shared/types";
import { AlertIcon, PlusIcon, XIcon } from "../../components/icons";
import { cx, TeamMark } from "../../components/ui";
import { withAlpha } from "../../lib/format";
import { haptic } from "../../lib/native";
import { CUSTOM_X_COLOR, CUSTOM_Y_COLOR, matchNflTeam, POPULAR_TEAMS, resolveCustomTeam, TEAM_NAME_MAX, type TeamColors } from "./model";
import { VsBadge } from "./VsBadge";

// Re-exported for the checkout ticket and the rules mini board.
export { CUSTOM_X_COLOR, CUSTOM_Y_COLOR };

/** DOM ids of the two inputs (the create page focuses one on a blocked submit). */
export const TEAM_INPUT_ID = { x: "team-x", y: "team-y" } as const;

export interface CustomMatchupProps {
  x: string;
  y: string;
  onChange: (side: "x" | "y", value: string) => void;
  /** Highlight the empty field(s) after a Create tap with teams missing. */
  showErrors?: boolean;
  /** Muted line under the fields (e.g. why we're on custom). */
  note?: string;
  /** Live NFL team colors (teamColorsFrom). */
  colors?: TeamColors;
}

type Side = "x" | "y";
const PLACEHOLDER: Record<Side, string> = { x: "Away team", y: "Home team" };

export function CustomMatchup({ x, y, onChange, showErrors, note, colors = {} }: CustomMatchupProps) {
  const [active, setActive] = useState<Side | null>(null);
  const refs = { x: useRef<HTMLInputElement>(null), y: useRef<HTMLInputElement>(null) };

  const values = { x, y };
  const activeValue = active ? values[active] : "";
  const typing = Boolean(active && activeValue.trim() && !matchNflTeam(activeValue));
  const suggestions = typing ? searchNflTeams(activeValue, 3) : [];
  const taken = new Set([matchNflTeam(x)?.abbr, matchNflTeam(y)?.abbr]);
  const popular = POPULAR_TEAMS.filter((t) => !taken.has(t.abbr));
  const showPopular = !typing && (!x.trim() || !y.trim());

  const sideColor = (side: Side) => (side === "x" ? CUSTOM_X_COLOR : CUSTOM_Y_COLOR);
  // A chip shows exactly the tile it will become: the live color, else the color of the side it fills.
  const chipTeam = (t: NflTeam, side: Side): Team => ({ name: t.nickname, abbr: t.abbr, color: colors[t.abbr] ?? sideColor(side) });

  const fill = (side: Side, team: NflTeam) => {
    void haptic("selection");
    onChange(side, team.nickname);
    const other: Side = side === "x" ? "y" : "x";
    // Keyboard already up: carry on to the other empty field. Otherwise don't pop it open.
    if (active && !values[other].trim()) refs[other].current?.focus();
    else if (active) {
      refs[side].current?.blur();
      setActive(null);
    }
  };

  /** A popular chip fills the focused empty field, else the first empty one. */
  const nextSide: Side = active && !values[active].trim() ? active : !x.trim() ? "x" : "y";

  const onKeyDown = (side: Side) => (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (suggestions.length === 1) return fill(side, suggestions[0]);
    if (side === "x") refs.y.current?.focus();
    else e.currentTarget.blur();
  };

  const field = (side: Side) => {
    const value = values[side];
    const resolved = resolveCustomTeam(value, colors);
    // Mid-word ("Pack") isn't a team yet: keep the slot empty-looking until it resolves or you move on.
    const settled = resolved && (resolved.nfl || active !== side || !typing);
    const preview: Team | null = settled ? { ...resolved.team, color: resolved.team.color ?? sideColor(side) } : null;
    const missing = showErrors && !value.trim();
    const id = TEAM_INPUT_ID[side];
    return (
      <div className="flex items-center gap-3">
        <label htmlFor={id} className="grid h-11 w-11 shrink-0 cursor-text place-items-center">
          {preview ? (
            <TeamMark key={preview.abbr ?? preview.name} team={preview} className="animate-pop" />
          ) : (
            <span
              aria-hidden
              className={cx(
                "grid h-10 w-10 place-items-center rounded-xl border-2 border-dashed text-ink-subtle transition-colors",
                missing ? "border-danger-500/70 text-ink-danger" : "border-ink/18",
              )}
            >
              <PlusIcon size={18} strokeWidth={2.6} />
            </span>
          )}
        </label>
        <div
          className={cx(
            "flex h-12 min-w-0 flex-1 items-center gap-2 rounded-btn bg-surface-3 pl-3.5 pr-1.5 ring-1 ring-inset transition-shadow focus-within:ring-2",
            missing ? "animate-shake ring-danger-500" : "ring-line-strong focus-within:ring-brand-line focus-within:shadow-[0_0_0_4px_color-mix(in_srgb,var(--color-brand-line)_14%,transparent)]",
          )}
        >
          <input
            ref={refs[side]}
            id={id}
            data-testid={side === "x" ? "team-x-input" : "team-y-input"}
            aria-label={PLACEHOLDER[side]}
            aria-invalid={missing || undefined}
            value={value}
            maxLength={TEAM_NAME_MAX}
            placeholder={PLACEHOLDER[side]}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="words"
            spellCheck={false}
            enterKeyHint={side === "x" ? "next" : "done"}
            onFocus={() => setActive(side)}
            onBlur={() => setActive((cur) => (cur === side ? null : cur))}
            onKeyDown={onKeyDown(side)}
            onChange={(e) => onChange(side, e.target.value)}
            className="h-full w-full min-w-0 bg-transparent font-display text-headline font-bold text-ink outline-none placeholder:font-sans placeholder:text-callout placeholder:font-medium placeholder:text-ink-subtle"
          />
          {resolved?.nfl && (
            <span className="shrink-0 truncate text-footnote font-semibold text-ink-subtle">{resolved.nfl.location}</span>
          )}
          {value && (
            <button
              type="button"
              aria-label={`Clear ${PLACEHOLDER[side].toLowerCase()}`}
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange(side, "");
                refs[side].current?.focus();
              }}
              className="tap-target grid h-8 w-8 shrink-0 place-items-center rounded-full text-ink-subtle hover:text-ink"
            >
              <XIcon size={16} />
            </button>
          )}
        </div>
      </div>
    );
  };

  const chip = (t: NflTeam, side: Side, onPick: () => void, label: string) => (
    <button
      key={t.abbr}
      type="button"
      role="option"
      aria-selected={false}
      // Keep the input focused so the tap lands on the chip.
      onPointerDown={(e) => e.preventDefault()}
      onClick={onPick}
      className="pressable inline-flex h-11 shrink-0 items-center gap-2 rounded-full bg-surface-3 pl-1.5 pr-4 text-subhead font-bold text-ink ring-1 ring-inset ring-line-strong"
    >
      <TeamMark team={chipTeam(t, side)} size="sm" className="rounded-full" />
      {label}
    </button>
  );

  const filled = Boolean(x.trim()) && Boolean(y.trim());
  const glow = filled ? 0.22 : 0.1;
  const xColor = resolveCustomTeam(x, colors)?.team.color ?? CUSTOM_X_COLOR;
  const yColor = resolveCustomTeam(y, colors)?.team.color ?? CUSTOM_Y_COLOR;
  return (
    <div className="flex flex-col gap-3">
      <div
        className="rounded-card bg-surface-2 p-3 ring-1 ring-inset ring-line shadow-card transition-[background-image]"
        style={{
          backgroundImage: `radial-gradient(60% 80% at 0% 0%, ${withAlpha(xColor, glow)}, transparent 70%), radial-gradient(60% 80% at 0% 100%, ${withAlpha(yColor, glow)}, transparent 70%)`,
        }}
      >
        {field("x")}
        <div aria-hidden className="flex items-center gap-3 py-1">
          <span className="flex w-11 shrink-0 justify-center">
            <VsBadge size="sm" />
          </span>
          <span className="h-px flex-1 bg-line" />
        </div>
        {field("y")}
      </div>

      {typing && suggestions.length > 0 && active ? (
        <div role="listbox" aria-label="Suggested teams" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-0.5 scrollbar-none animate-fade-in">
          {suggestions.map((t) => chip(t, active, () => fill(active, t), `${t.location} ${t.nickname}`))}
        </div>
      ) : showPopular ? (
        <div className="animate-fade-in">
          <p className="mb-2 px-1 text-footnote font-semibold text-ink-subtle">Popular teams · tap to add</p>
          <div role="listbox" aria-label="Popular teams" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-0.5 scrollbar-none">
            {popular.map((t) => chip(t, nextSide, () => fill(nextSide, t), t.nickname))}
          </div>
        </div>
      ) : null}

      {showErrors && (!x.trim() || !y.trim()) ? (
        <p role="alert" className="flex items-center gap-1.5 px-1 text-footnote font-semibold text-ink-danger">
          <AlertIcon size={14} />
          {!x.trim() && !y.trim() ? "Add both teams to make the board." : "Add the other team to make the board."}
        </p>
      ) : (
        note && <p className="px-1 text-footnote text-ink-subtle">{note}</p>
      )}
    </div>
  );
}
