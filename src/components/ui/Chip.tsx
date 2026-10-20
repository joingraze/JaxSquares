import type { ButtonHTMLAttributes, ReactNode } from "react";
import { haptic } from "../../lib/native";
import { cx } from "./cx";

export interface ChipProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  children: ReactNode;
  /** Toggle state; when set the chip announces itself as a toggle (aria-pressed). */
  selected?: boolean;
  icon?: ReactNode;
  size?: "sm" | "md";
}

/** Filter / choice chip. Selected chips go volt. */
export function Chip({ children, selected, icon, size = "md", className, onClick, type = "button", ...rest }: ChipProps) {
  return (
    <button
      type={type}
      aria-pressed={selected}
      onClick={(e) => {
        void haptic("selection");
        onClick?.(e);
      }}
      className={cx(
        "pressable tap-target inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full font-bold",
        size === "sm" ? "h-8 px-3 text-footnote" : "h-9 px-3.5 text-subhead",
        selected
          ? "bg-brand-400 text-ink-inverse shadow-[inset_0_1px_0_rgb(255_255_255/0.35)]"
          : "bg-surface-3 text-ink-muted ring-1 ring-inset ring-line hover:text-ink",
        "disabled:opacity-40",
        className,
      )}
      {...rest}
    >
      {icon && <span className="-ml-0.5 inline-flex [&>svg]:h-4 [&>svg]:w-4">{icon}</span>}
      {children}
    </button>
  );
}
