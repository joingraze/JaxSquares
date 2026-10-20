import { forwardRef, type ButtonHTMLAttributes, type MouseEvent, type ReactNode } from "react";
import { haptic, type HapticKind } from "../../lib/native";
import { cx } from "./cx";

export type IconButtonVariant = "ghost" | "solid" | "glass" | "brand";
export type IconButtonSize = "sm" | "md" | "lg";

const VARIANT: Record<IconButtonVariant, string> = {
  ghost: "text-ink hover:bg-ink/6 active:bg-ink/10",
  solid: "bg-surface-3 text-ink ring-1 ring-inset ring-line hover:bg-surface-4",
  glass: "glass text-ink ring-1 ring-inset ring-line",
  brand: "bg-brand-400 text-ink-inverse hover:bg-brand-300",
};

const SIZE: Record<IconButtonSize, string> = {
  sm: "tap-target h-9 w-9",
  md: "h-11 w-11",
  lg: "h-13 w-13",
};

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  /** Accessible name (required: there is no visible text). */
  label: string;
  icon: ReactNode;
  variant?: IconButtonVariant;
  size?: IconButtonSize;
  /** A dot (true) or count shown on the corner. */
  badge?: boolean | number;
  haptic?: HapticKind | false;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, icon, variant = "ghost", size = "md", badge, haptic: hapticKind = false, className, type = "button", onClick, ...rest },
  ref,
) {
  const handleClick = (e: MouseEvent<HTMLButtonElement>) => {
    if (hapticKind) void haptic(hapticKind);
    onClick?.(e);
  };
  const showBadge = badge === true || (typeof badge === "number" && badge > 0);
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      onClick={handleClick}
      className={cx(
        "pressable relative inline-flex shrink-0 items-center justify-center rounded-full disabled:opacity-40",
        VARIANT[variant],
        SIZE[size],
        className,
      )}
      {...rest}
    >
      {icon}
      {showBadge && (
        <span
          className={cx(
            "absolute right-0.5 top-0.5 flex items-center justify-center rounded-full bg-accent-500 font-extrabold text-white ring-2 ring-canvas",
            typeof badge === "number" ? "h-4.5 min-w-4.5 px-1 text-[0.625rem] tabular-nums leading-none" : "h-2.5 w-2.5",
          )}
        >
          {typeof badge === "number" ? (badge > 99 ? "99+" : badge) : null}
        </span>
      )}
    </button>
  );
});
