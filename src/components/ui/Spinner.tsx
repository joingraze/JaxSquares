import { cx } from "./cx";

export interface SpinnerProps {
  size?: number;
  className?: string;
  /** Screen-reader text; omit when the parent already says it's busy. */
  label?: string;
}

export function Spinner({ size = 18, className, label }: SpinnerProps) {
  return (
    <span role={label ? "status" : undefined} className={cx("inline-flex shrink-0", className)}>
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden className="animate-spin-fast">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
        <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      </svg>
      {label && <span className="sr-only">{label}</span>}
    </span>
  );
}
