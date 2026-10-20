import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from "react";
import { AlertIcon } from "../icons";
import { cx } from "./cx";

export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size" | "prefix"> {
  label: ReactNode;
  /** Visually hide the label (still read by screen readers). */
  hideLabel?: boolean;
  hint?: ReactNode;
  error?: ReactNode;
  leading?: ReactNode;
  trailing?: ReactNode;
  /** Show "12/24" when maxLength is set. */
  counter?: boolean;
  inputClassName?: string;
}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, hideLabel, hint, error, leading, trailing, counter, className, inputClassName, id, maxLength, value, ...rest },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;
  const length = typeof value === "string" ? [...value].length : 0;
  const describedBy = error ? errorId : hint ? hintId : undefined;

  return (
    <div className={className}>
      <div className={cx("mb-1.5 flex items-baseline justify-between gap-2 px-1", hideLabel && "sr-only")}>
        <label htmlFor={inputId} className="text-subhead font-bold text-ink-muted">
          {label}
        </label>
        {counter && maxLength !== undefined && (
          <span aria-hidden className={cx("text-caption tabular-nums", length >= maxLength ? "text-ink-gold" : "text-ink-subtle")}>
            {length}/{maxLength}
          </span>
        )}
      </div>
      <div
        className={cx(
          "flex h-13 items-center gap-2 rounded-btn bg-surface-3 px-3.5 ring-1 ring-inset transition-shadow",
          "focus-within:ring-2",
          error
            ? "animate-shake ring-danger-500 focus-within:ring-danger-500"
            : "ring-line-strong focus-within:ring-brand-line focus-within:shadow-[0_0_0_4px_color-mix(in_srgb,var(--color-brand-line)_14%,transparent)]",
        )}
      >
        {leading && <span className="flex shrink-0 text-ink-subtle [&>svg]:h-5 [&>svg]:w-5">{leading}</span>}
        <input
          ref={ref}
          id={inputId}
          value={value}
          maxLength={maxLength}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cx(
            "h-full min-w-0 flex-1 bg-transparent text-body font-medium text-ink outline-none placeholder:font-normal",
            inputClassName,
          )}
          {...rest}
        />
        {trailing && <span className="flex shrink-0 items-center text-ink-subtle">{trailing}</span>}
      </div>
      {error ? (
        <p id={errorId} className="mt-1.5 flex items-center gap-1.5 px-1 text-footnote font-semibold text-ink-danger">
          <AlertIcon size={14} />
          {error}
        </p>
      ) : (
        hint && (
          <p id={hintId} className="mt-1.5 px-1 text-footnote text-ink-subtle">
            {hint}
          </p>
        )
      )}
    </div>
  );
});
