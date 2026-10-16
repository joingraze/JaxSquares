import { useId, type ReactNode } from "react";
import { haptic } from "../../lib/native";
import { cx } from "./cx";

export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Visible label; omit and pass aria-label when the switch sits in a ListRow. */
  label?: ReactNode;
  description?: ReactNode;
  "aria-label"?: string;
  disabled?: boolean;
  className?: string;
}

export function Switch({ checked, onChange, label, description, disabled, className, ...aria }: SwitchProps) {
  const id = useId();
  const control = (
    <button
      type="button"
      role="switch"
      id={id}
      aria-checked={checked}
      aria-label={aria["aria-label"]}
      aria-describedby={description ? `${id}-desc` : undefined}
      disabled={disabled}
      onClick={() => {
        void haptic("selection");
        onChange(!checked);
      }}
      className={cx(
        "tap-target relative inline-flex h-7.5 w-12.5 shrink-0 items-center rounded-full p-0.5 transition-colors duration-200",
        checked ? "bg-brand-400" : "bg-pitch-600",
        "disabled:opacity-40",
      )}
    >
      <span
        aria-hidden
        className={cx(
          "h-6.5 w-6.5 rounded-full bg-white shadow-[0_2px_6px_rgb(0_0_0/0.35)] transition-transform duration-300 ease-spring",
          checked ? "translate-x-5" : "translate-x-0",
        )}
      />
    </button>
  );
  if (!label) return <span className={className}>{control}</span>;
  return (
    <div className={cx("flex items-center gap-3", className)}>
      <div className="min-w-0 flex-1">
        <label htmlFor={id} className="block text-callout font-semibold text-ink">
          {label}
        </label>
        {description && (
          <p id={`${id}-desc`} className="mt-0.5 text-footnote text-ink-muted">
            {description}
          </p>
        )}
      </div>
      {control}
    </div>
  );
}
