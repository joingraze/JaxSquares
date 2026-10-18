// A display-only amount field (square price, prize amounts, amounts by score
// type): "$" before it or "pts" after it, a decimal keypad, "" for none.
// The app never collects or sends what's typed here.

import { useEffect, useState } from "react";
import { CheckIcon } from "../../components/icons";
import { cx } from "../../components/ui";
import { amountText } from "./rulesModel";

/**
 * Keeps what's typed while it's being typed; a value that isn't a number (or
 * is too big) shows why under it and isn't used. The input is 16px so iOS
 * never zooms into it.
 */
export function AmountField({
  value,
  onChange,
  unit,
  label,
  caption,
  parse,
  testId,
  data,
  placeholder = "Amount",
  className,
}: {
  value: number | null;
  onChange: (value: number | null) => void;
  unit: "$" | "pts";
  /** Accessible name. */
  label: string;
  /** Small label above the field ("Square", "Reverse", "Touchdown"). */
  caption?: string;
  parse: (text: string) => { value: number | null; error: string | null };
  testId: string;
  data?: Record<string, string>;
  /** Shown while empty: "Amount", or the amount an empty field falls back to. */
  placeholder?: string;
  className?: string;
}) {
  const [text, setText] = useState(() => amountText(value));
  const parsed = parse(text);
  // Follow outside changes (a preset, "same for every quarter", a split) without fighting the typing.
  useEffect(() => {
    if (parse(text).value !== value) setText(amountText(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the value changes from outside
  }, [value]);
  return (
    <label className={cx("block min-w-0", className)}>
      {caption && <span className="mb-1 block truncate px-1 text-caption font-bold text-ink-muted">{caption}</span>}
      <span
        className={cx(
          "flex h-11 items-center gap-1 rounded-xl bg-surface-2 px-3 ring-1 ring-inset transition-shadow focus-within:ring-2",
          parsed.error ? "ring-danger-500 focus-within:ring-danger-500" : "ring-line-strong focus-within:ring-brand-line",
        )}
      >
        {unit === "$" && <span className="font-display text-body font-extrabold text-ink-muted">$</span>}
        <input
          data-testid={testId}
          {...data}
          aria-label={label}
          aria-invalid={parsed.error ? true : undefined}
          inputMode="decimal"
          enterKeyHint="done"
          autoComplete="off"
          placeholder={placeholder}
          value={text}
          onChange={(e) => {
            const next = e.target.value;
            setText(next);
            const p = parse(next);
            if (!p.error) onChange(p.value);
          }}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          className="h-full min-w-0 flex-1 bg-transparent font-display text-body font-extrabold tabular-nums text-ink outline-none placeholder:font-sans placeholder:font-medium placeholder:text-ink-subtle"
        />
        {unit === "pts" && <span className="text-footnote font-bold text-ink-muted">pts</span>}
        {!parsed.error && parsed.value !== null && <CheckIcon size={14} strokeWidth={3} className="shrink-0 text-ink-brand" />}
      </span>
      {parsed.error && <span className="mt-1 block px-1 text-caption font-semibold text-ink-danger">{parsed.error}</span>}
    </label>
  );
}
