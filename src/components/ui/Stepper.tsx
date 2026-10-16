import { useEffect, useRef, type KeyboardEvent, type ReactNode } from "react";
import { haptic } from "../../lib/native";
import { MinusIcon, PlusIcon } from "../icons";
import { cx } from "./cx";

export interface StepperProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** Accessible name, e.g. "Squares per player". */
  label: string;
  /** Custom display for the value (e.g. 0 -> "No limit"). */
  format?: (value: number) => ReactNode;
  /** Spoken value when `format` returns something other than plain text. */
  valueText?: (value: number) => string;
  disabled?: boolean;
  className?: string;
}

const HOLD_DELAY_MS = 380;
const REPEAT_START_MS = 110;
const REPEAT_MIN_MS = 40;

/** − value + with press-and-hold acceleration. */
export function Stepper({
  value,
  onChange,
  min = 0,
  max = Number.POSITIVE_INFINITY,
  step = 1,
  label,
  format,
  valueText,
  disabled,
  className,
}: StepperProps) {
  const valueRef = useRef(value);
  valueRef.current = value;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  const bump = (dir: 1 | -1): boolean => {
    const next = clamp(valueRef.current + dir * step);
    if (next === valueRef.current) return false;
    valueRef.current = next;
    onChange(next);
    void haptic("selection");
    return true;
  };

  const stop = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => stop, []);

  const start = (dir: 1 | -1) => {
    stop();
    if (!bump(dir)) return;
    let interval = REPEAT_START_MS;
    const repeat = () => {
      if (!bump(dir)) return stop();
      interval = Math.max(REPEAT_MIN_MS, interval * 0.88);
      timer.current = setTimeout(repeat, interval);
    };
    timer.current = setTimeout(repeat, HOLD_DELAY_MS);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const map: Record<string, () => void> = {
      ArrowUp: () => bump(1),
      ArrowRight: () => bump(1),
      ArrowDown: () => bump(-1),
      ArrowLeft: () => bump(-1),
      Home: () => Number.isFinite(min) && onChange(min),
      End: () => Number.isFinite(max) && onChange(max),
    };
    const fn = map[e.key];
    if (fn && !disabled) {
      e.preventDefault();
      fn();
    }
  };

  const btn = (dir: 1 | -1) => {
    const atLimit = dir === 1 ? value >= max : value <= min;
    return (
      <button
        type="button"
        tabIndex={-1}
        aria-label={dir === 1 ? `Increase ${label}` : `Decrease ${label}`}
        disabled={disabled || atLimit}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          start(dir);
        }}
        onPointerUp={stop}
        onPointerCancel={stop}
        onLostPointerCapture={stop}
        onClick={(e) => {
          // Keyboard/AT activation (pointer presses were handled on pointerdown).
          if (e.detail === 0) bump(dir);
        }}
        onContextMenu={(e) => e.preventDefault()}
        className="pressable flex h-11 w-11 items-center justify-center rounded-xl bg-surface-4 text-ink ring-1 ring-inset ring-line hover:bg-pitch-600 disabled:opacity-35"
      >
        {dir === 1 ? <PlusIcon size={20} strokeWidth={2.5} /> : <MinusIcon size={20} strokeWidth={2.5} />}
      </button>
    );
  };

  const shown = format ? format(value) : value;
  return (
    <div className={cx("inline-flex items-center gap-1 rounded-2xl bg-surface-2 p-1 ring-1 ring-inset ring-line", disabled && "opacity-50", className)}>
      {btn(-1)}
      <div
        role="spinbutton"
        tabIndex={disabled ? -1 : 0}
        aria-label={label}
        aria-valuenow={value}
        aria-valuemin={Number.isFinite(min) ? min : undefined}
        aria-valuemax={Number.isFinite(max) ? max : undefined}
        aria-valuetext={valueText?.(value) ?? (typeof shown === "string" ? shown : undefined)}
        aria-disabled={disabled || undefined}
        onKeyDown={onKeyDown}
        className="relative flex h-11 min-w-20 items-center justify-center overflow-hidden rounded-lg px-2 outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
      >
        <span key={value} className="animate-tick font-display text-title-3 font-extrabold tabular-nums">
          {shown}
        </span>
      </div>
      {btn(1)}
    </div>
  );
}
