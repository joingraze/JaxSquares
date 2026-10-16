import { cx } from "./cx";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "gold";
export type ButtonSize = "sm" | "md" | "lg";

const VARIANT: Record<ButtonVariant, string> = {
  primary: "keycap bg-brand-400 text-ink-inverse [--keycap-edge:var(--color-brand-700)] hover:bg-brand-300",
  secondary:
    "keycap bg-surface-4 text-ink [--keycap-edge:#0a120e] ring-1 ring-inset ring-line hover:bg-pitch-600",
  ghost: "pressable bg-transparent text-ink hover:bg-white/6 active:bg-white/10",
  danger: "keycap bg-danger-500 text-white [--keycap-edge:var(--color-danger-700)] hover:bg-danger-400",
  gold: "keycap bg-gold-400 text-ink-inverse [--keycap-edge:var(--color-gold-700)] hover:bg-gold-300",
};

const SIZE: Record<ButtonSize, string> = {
  sm: "tap-target h-9 gap-1.5 rounded-xl px-3.5 text-subhead [--keycap-depth:3px]",
  md: "h-12 gap-2 rounded-btn px-5 text-callout",
  lg: "h-14 gap-2.5 rounded-[1.125rem] px-6 text-headline",
};

export interface ButtonStyleOptions {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  className?: string;
}

/** Button classes, for links that should look like buttons (`<Link className={buttonStyles(...)}>`). */
export function buttonStyles({ variant = "primary", size = "md", block, className }: ButtonStyleOptions = {}): string {
  return cx(
    "relative inline-flex select-none items-center justify-center whitespace-nowrap font-extrabold tracking-[-0.01em]",
    "disabled:opacity-45 aria-disabled:opacity-45",
    VARIANT[variant],
    SIZE[size],
    block && "w-full",
    className,
  );
}
