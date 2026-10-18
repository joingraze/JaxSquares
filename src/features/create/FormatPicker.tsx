// How squares win, opened from the settings card's "Change": four one-tap
// preset cards (each with a tiny game timeline showing when a square wins),
// an Advanced list of switches, and a live "how this board works" summary with
// a mini board. Card tags never change; the summary is the one place a
// modifier's effect shows ("8 winners" with reverse on). Rules fine-tuned in
// "Square price & prizes" (say, every score plus the quarters) show as a
// "Custom rules" card; tapping a preset goes back to it, keeping amounts.

import type { CSSProperties } from "react";
import { BOARD_SIZE_INFO, PERIOD_PRESETS, PRESET_INFO, rulesOf, rulesSummary, withRules, type FixedPreset } from "../../../shared/formats";
import type { GameFormat, MomentRule, Team } from "../../../shared/types";
import { cx, Switch } from "../../components/ui";
import { readableTeamColor } from "../../lib/format";
import { haptic } from "../../lib/native";
import { CUSTOM_X_COLOR, CUSTOM_Y_COLOR } from "./CustomMatchup";
import { allReverse, canUseFreshNumbers, presetOf, selectPreset, setReverseEverywhere } from "../rules/rulesModel";
import { boardHeadlineParts, describeBoard, winnersTag } from "./model";
import { useResolvedTheme } from "../../lib/theme";

export interface FormatPickerProps {
  format: GameFormat;
  onChange: (format: GameFormat) => void;
  /** Team colors for the mini board (falls back to the board defaults). */
  teamX?: Team | null;
  teamY?: Team | null;
}

/** Where each preset's winners land on a 0..1 game timeline. */
const MARKS: Record<FixedPreset, number[]> = {
  quarters: [0.25, 0.5, 0.75, 1],
  halves: [0.5, 1],
  final: [1],
  "every-score": [0.08, 0.2, 0.33, 0.46, 0.6, 0.71, 0.86, 0.95],
};

const ADVANCED = {
  reverse: { label: "Reverse winners", description: "Swap the digits and that square wins too." },
  small: { label: `${BOARD_SIZE_INFO[25].label} board`, description: "25 squares, two numbers per row and column." },
  fresh: { label: "New numbers each quarter", description: "A fresh draw before every quarter." },
};

export function FormatPicker({ format, onChange, teamX, teamY }: FormatPickerProps) {
  const rules = rulesOf(format);
  const current = presetOf(rules);
  // Canonical after every change: periods/reverse follow the rules, fresh numbers only where they apply.
  const set = (patch: Partial<GameFormat>) => onChange(withRules({ ...format, ...patch }));
  const setRules = (next: MomentRule[]) => set({ rules: next });

  return (
    <div className="flex flex-col gap-5">
      <div role="radiogroup" aria-label="When squares win" className="grid grid-cols-2 gap-2.5">
        {PERIOD_PRESETS.map((preset) => (
          <FormatCard
            key={preset}
            preset={preset}
            selected={current === preset}
            onSelect={() => {
              if (current !== preset) void haptic("selection");
              setRules(selectPreset(rules, preset));
            }}
          />
        ))}
        {current === null && (
          <div
            role="radio"
            aria-checked
            data-testid="format-custom"
            className="col-span-2 flex items-center gap-3 rounded-card bg-[linear-gradient(160deg,rgb(198_249_31/0.18),rgb(198_249_31/0.03)_65%)] bg-surface-3 p-3.5 ring-2 ring-inset ring-brand-line"
          >
            <FormatGlyph rules={rules} />
            <span className="min-w-0">
              <span className="block font-display text-headline font-extrabold leading-tight text-ink">{PRESET_INFO.custom.label}</span>
              <span className="mt-0.5 block text-footnote font-semibold text-ink-brand">{rulesSummary(rules)}</span>
            </span>
          </div>
        )}
      </div>

      <div>
        <p className="eyebrow px-1 text-ink-subtle">Advanced</p>
        <div className="mt-2 divide-y divide-line overflow-hidden rounded-2xl bg-surface-3 ring-1 ring-inset ring-line">
          <Switch
            className="min-h-15 px-3.5 py-2.5"
            label={ADVANCED.reverse.label}
            description={ADVANCED.reverse.description}
            checked={allReverse(rules)}
            onChange={(reverse) => setRules(setReverseEverywhere(rules, reverse))}
          />
          <Switch
            className="min-h-15 px-3.5 py-2.5"
            label={ADVANCED.small.label}
            description={ADVANCED.small.description}
            checked={format.boardSize === 25}
            onChange={(small) => set({ boardSize: small ? 25 : 100 })}
          />
          {canUseFreshNumbers(rules) && (
            <Switch
              className="min-h-15 px-3.5 py-2.5"
              label={ADVANCED.fresh.label}
              description={ADVANCED.fresh.description}
              checked={format.freshNumbers}
              onChange={(freshNumbers) => set({ freshNumbers })}
            />
          )}
        </div>
      </div>

      <HowItWorks format={format} teamX={teamX} teamY={teamY} />
    </div>
  );
}

const FIXED_AT: Record<string, number> = { q1: 0.25, q2: 0.5, q3: 0.75, final: 1 };

/** The rules' timeline as a small glyph (dots where squares win), for the settings card's summary row. */
export function FormatGlyph({ rules }: { rules: readonly MomentRule[] }) {
  const many = rules.some((r) => r.moment === "score");
  const fixed = rules.filter((r) => r.moment !== "score").map((r) => FIXED_AT[r.moment]);
  return (
    <svg aria-hidden viewBox="0 0 28 12" className="h-3 w-7 shrink-0 overflow-visible">
      {[0, 1, 2, 3].map((q) => (
        <rect key={q} x={q * 7 + 0.5} y={5} width={6} height={2} rx={1} className="fill-ink/20" />
      ))}
      {many && MARKS["every-score"].map((at, i) => <circle key={`s${i}`} cx={Math.max(2, Math.min(26, at * 28))} cy={6} r={1.6} className="fill-gold-400" />)}
      {fixed.map((at, i) => (
        <circle key={i} cx={Math.max(2, Math.min(26, at * 28))} cy={6} r={many ? 2.2 : 2.6} className={many ? "fill-brand-300" : "fill-gold-400"} />
      ))}
    </svg>
  );
}

function FormatCard({ preset, selected, onSelect }: { preset: FixedPreset; selected: boolean; onSelect: () => void }) {
  const info = PRESET_INFO[preset];
  const marks = MARKS[preset];
  const many = preset === "every-score";
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      data-testid="format-option"
      data-format={preset}
      onClick={onSelect}
      className={cx(
        "pressable relative flex min-h-24 flex-col items-start justify-between gap-3 overflow-hidden rounded-card p-3.5 text-left ring-inset transition-[background-color,box-shadow]",
        selected
          ? "bg-[linear-gradient(160deg,rgb(198_249_31/0.18),rgb(198_249_31/0.03)_65%)] bg-surface-3 ring-2 ring-brand-line"
          : "bg-surface-3 ring-1 ring-line hover:bg-surface-4",
      )}
    >
      {/* The game as four quarters; dots are the moments a square wins. */}
      <span aria-hidden className="relative block h-3 w-full">
        <span className="absolute inset-x-0 top-1/2 flex -translate-y-1/2 gap-0.75">
          {[0, 1, 2, 3].map((q) => (
            <span key={q} className={cx("h-1.5 flex-1 rounded-full transition-colors", selected ? "bg-brand-400/35" : "bg-ink/10")} />
          ))}
        </span>
        {marks.map((at, i) => (
          <span
            key={i}
            className={cx(
              "absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-surface-3 transition-transform duration-300 ease-spring",
              many ? "h-2 w-2" : "h-3 w-3",
              selected ? "scale-110 bg-gold-400 shadow-[0_0_10px_rgb(255_194_51/0.75)]" : "bg-pitch-400",
            )}
            style={{ left: `calc(${at * 100}% - ${at === 1 ? 6 : 0}px)`, transitionDelay: selected ? `${i * 40}ms` : "0ms" }}
          />
        ))}
      </span>
      <span className="block">
        <span className="block font-display text-headline font-extrabold leading-tight text-ink">{info.label}</span>
        <span className={cx("mt-0.5 block text-footnote font-semibold", selected ? "text-ink-brand" : "text-ink-subtle")}>{winnersTag(preset)}</span>
      </span>
    </button>
  );
}

/** Mini board + plain-language rules; both follow every choice. */
function HowItWorks({ format, teamX, teamY }: { format: GameFormat; teamX?: Team | null; teamY?: Team | null }) {
  const { winners, size } = boardHeadlineParts(format);
  const text = describeBoard(format);
  return (
    <div className="flex items-center gap-4 rounded-2xl bg-surface-3 p-3.5 ring-1 ring-inset ring-line">
      <MiniBoard format={format} teamX={teamX} teamY={teamY} />
      <div className="min-w-0 flex-1" aria-live="polite">
        <p className="eyebrow text-ink-brand">How this board works</p>
        {/* Two whole phrases on their own lines, so neither can split. */}
        <p key={winners} className="mt-1 animate-tick font-display text-headline font-extrabold leading-snug text-ink">
          {winners}
        </p>
        <p key={size} className="animate-tick text-subhead font-bold text-ink-muted">
          {size}
        </p>
        <p key={text} className="mt-1 animate-fade-in text-footnote text-ink-muted">
          {text}
        </p>
      </div>
    </div>
  );
}

const FRIEND_COLORS = ["#ff6b35", "#38b6ff", "#9b6bff", "#34d07b", "#ff4f9a", "#1fd1c1"];

function MiniBoard({ format, teamX, teamY }: { format: GameFormat; teamX?: Team | null; teamY?: Team | null }) {
  const n = format.boardSize === 25 ? 5 : 10;
  // A winning square (and its reverse) in board coordinates.
  const win = format.boardSize === 25 ? { r: 1, c: 3 } : { r: 2, c: 7 };
  const rev = { r: win.c, c: win.r };
  const theme = useResolvedTheme();
  const x = readableTeamColor(teamX?.color, CUSTOM_X_COLOR, theme);
  const y = readableTeamColor(teamY?.color, CUSTOM_Y_COLOR, theme);
  const style = { "--mx": x, "--my": y } as CSSProperties;
  return (
    <div aria-hidden style={style} className="relative h-24 w-24 shrink-0">
      <span className="absolute left-3 right-0 top-0 h-2 rounded-full bg-(--mx) opacity-90" />
      <span className="absolute bottom-0 left-0 top-3 w-2 rounded-full bg-(--my) opacity-90" />
      <div
        key={n}
        className="absolute bottom-0 left-3 right-0 top-3 grid animate-pop gap-[1.5px] rounded-md bg-surface-2 p-[2px]"
        style={{ gridTemplateColumns: `repeat(${n}, 1fr)` }}
      >
        {Array.from({ length: n * n }, (_, i) => {
          const r = Math.floor(i / n);
          const c = i % n;
          const isWin = r === win.r && c === win.c;
          const isRev = format.reverse && r === rev.r && c === rev.c;
          // A board mid-fill: about half the squares taken by friends.
          const owner = (r * 7 + c * 13 + r * c) % 11;
          const friend = owner < 6 ? FRIEND_COLORS[owner % FRIEND_COLORS.length] : null;
          return (
            <span
              key={i}
              className={cx(
                "rounded-[2px] transition-colors duration-300",
                isWin ? "z-10 scale-125 bg-gold-400 shadow-[0_0_10px_rgb(255_194_51/0.95)]" : isRev ? "z-10 scale-110 bg-gold-300 shadow-[0_0_8px_rgb(255_194_51/0.7)]" : !friend && "bg-ink/5",
              )}
              style={friend && !isWin && !isRev ? { backgroundColor: friend, opacity: 0.55 } : undefined}
            />
          );
        })}
      </div>
    </div>
  );
}
