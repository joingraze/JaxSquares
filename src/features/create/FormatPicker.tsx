// Step 2: how winners are picked. Four one-tap preset cards (each with a tiny
// game timeline showing when a square wins), three toggles, and a live
// "how this board works" card with a mini board that follows the choices.

import type { CSSProperties } from "react";
import { BOARD_SIZE_INFO, FRESH_NUMBERS_INFO, PERIOD_PRESETS, PRESET_INFO, REVERSE_INFO } from "../../../shared/formats";
import type { GameFormat, PeriodsPreset, Team } from "../../../shared/types";
import { GridIcon, RefreshIcon, ShuffleIcon } from "../../components/icons";
import { Chip, cx } from "../../components/ui";
import { readableTeamColor } from "../../lib/format";
import { haptic } from "../../lib/native";
import { boardHeadline, describeBoard, winnersTag } from "./model";

export interface FormatPickerProps {
  format: GameFormat;
  onChange: (format: GameFormat) => void;
  /** Team colors for the mini board (falls back to the board defaults). */
  teamX?: Team | null;
  teamY?: Team | null;
}

/** Where each preset's winners land on a 0..1 game timeline. */
const MARKS: Record<PeriodsPreset, number[]> = {
  quarters: [0.25, 0.5, 0.75, 1],
  halves: [0.5, 1],
  final: [1],
  "every-score": [0.08, 0.2, 0.33, 0.46, 0.6, 0.71, 0.86, 0.95],
};

export function FormatPicker({ format, onChange, teamX, teamY }: FormatPickerProps) {
  const set = (patch: Partial<GameFormat>) => {
    const next = { ...format, ...patch };
    if (next.periods !== "quarters") next.freshNumbers = false;
    onChange(next);
  };

  return (
    <div className="flex flex-col gap-3.5">
      <div role="radiogroup" aria-label="When squares win" className="grid grid-cols-2 gap-2.5">
        {PERIOD_PRESETS.map((preset) => (
          <FormatCard
            key={preset}
            preset={preset}
            reverse={format.reverse}
            selected={format.periods === preset}
            onSelect={() => {
              if (format.periods !== preset) void haptic("selection");
              set({ periods: preset });
            }}
          />
        ))}
      </div>

      <div role="group" aria-label="Extras" className="flex flex-wrap gap-2">
        <Chip selected={format.reverse} onClick={() => set({ reverse: !format.reverse })} icon={<ShuffleIcon />} title={REVERSE_INFO.description}>
          {REVERSE_INFO.label}
        </Chip>
        <Chip
          selected={format.boardSize === 25}
          onClick={() => set({ boardSize: format.boardSize === 25 ? 100 : 25 })}
          icon={<GridIcon />}
          title={BOARD_SIZE_INFO[25].description}
        >
          {BOARD_SIZE_INFO[25].label}
        </Chip>
        {format.periods === "quarters" && (
          <Chip selected={format.freshNumbers} onClick={() => set({ freshNumbers: !format.freshNumbers })} icon={<RefreshIcon />} title={FRESH_NUMBERS_INFO.description}>
            {FRESH_NUMBERS_INFO.label}
          </Chip>
        )}
      </div>

      <HowItWorks format={format} teamX={teamX} teamY={teamY} />
    </div>
  );
}

function FormatCard({ preset, reverse, selected, onSelect }: { preset: PeriodsPreset; reverse: boolean; selected: boolean; onSelect: () => void }) {
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
        "pressable relative flex min-h-26 flex-col items-start justify-between gap-3 overflow-hidden rounded-card p-3.5 text-left ring-inset transition-[background-color,box-shadow]",
        selected
          ? "bg-[linear-gradient(160deg,rgb(198_249_31/0.18),rgb(198_249_31/0.03)_65%)] bg-surface-2 ring-2 ring-brand-400 shadow-glow-brand"
          : "bg-surface-2 ring-1 ring-line hover:bg-surface-3",
      )}
    >
      {/* The game as four quarters; dots are the moments a square wins. */}
      <span aria-hidden className="relative block h-3 w-full">
        <span className="absolute inset-x-0 top-1/2 flex -translate-y-1/2 gap-0.75">
          {[0, 1, 2, 3].map((q) => (
            <span key={q} className={cx("h-1.5 flex-1 rounded-full transition-colors", selected ? "bg-brand-400/35" : "bg-white/10")} />
          ))}
        </span>
        {marks.map((at, i) => (
          <span
            key={i}
            className={cx(
              "absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-surface-2 transition-transform duration-300 ease-spring",
              many ? "h-2 w-2" : "h-3 w-3",
              selected ? "scale-110 bg-gold-400 shadow-[0_0_10px_rgb(255_194_51/0.75)]" : "bg-pitch-400",
            )}
            style={{ left: `calc(${at * 100}% - ${at === 1 ? 6 : 0}px)`, transitionDelay: selected ? `${i * 40}ms` : "0ms" }}
          />
        ))}
      </span>
      <span className="block">
        <span className="block font-display text-headline font-extrabold leading-tight text-ink">{info.label}</span>
        <span key={`${preset}-${reverse}`} className={cx("mt-0.5 block animate-tick text-footnote font-semibold", selected ? "text-brand-300" : "text-ink-subtle")}>
          {winnersTag(preset, reverse)}
        </span>
      </span>
    </button>
  );
}

/** Mini board + plain-language rules; both follow every choice. */
function HowItWorks({ format, teamX, teamY }: { format: GameFormat; teamX?: Team | null; teamY?: Team | null }) {
  const headline = boardHeadline(format);
  const [winners, size] = headline.split(" · ");
  const text = describeBoard(format);
  return (
    <div className="flex items-center gap-4 rounded-card bg-surface-2 p-4 ring-1 ring-inset ring-line shadow-card">
      <MiniBoard format={format} teamX={teamX} teamY={teamY} />
      <div className="min-w-0 flex-1" aria-live="polite">
        <p className="eyebrow text-brand-400">How this board works</p>
        <p key={headline} className="mt-1 animate-tick font-display text-headline font-extrabold leading-snug text-ink">
          {winners}
          {size && <span className="whitespace-nowrap text-ink-muted"> · {size}</span>}
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
  const x = readableTeamColor(teamX?.color, "#3ab7ff");
  const y = readableTeamColor(teamY?.color, "#ff66a6");
  const style = { "--mx": x, "--my": y } as CSSProperties;
  return (
    <div aria-hidden style={style} className="relative h-26 w-26 shrink-0">
      <span className="absolute left-3 right-0 top-0 h-2 rounded-full bg-(--mx) opacity-90" />
      <span className="absolute bottom-0 left-0 top-3 w-2 rounded-full bg-(--my) opacity-90" />
      <div
        key={n}
        className="absolute bottom-0 left-3 right-0 top-3 grid animate-pop gap-[1.5px] rounded-md bg-surface-3 p-[2px]"
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
                isWin ? "z-10 scale-125 bg-gold-400 shadow-[0_0_10px_rgb(255_194_51/0.95)]" : isRev ? "z-10 scale-110 bg-gold-300 shadow-[0_0_8px_rgb(255_194_51/0.7)]" : !friend && "bg-white/5",
              )}
              style={friend && !isWin && !isRev ? { backgroundColor: friend, opacity: 0.55 } : undefined}
            />
          );
        })}
      </div>
    </div>
  );
}
