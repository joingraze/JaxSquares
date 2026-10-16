import { cx } from "./cx";

export type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "danger" | "gold";
export type ButtonSize = "sm" | "md" | "lg";

/** Surface, edge and hover per variant. The text color lives in VARIANT_TEXT so a className color can replace it. */
const VARIANT: Record<ButtonVariant, string> = {
  primary: "keycap bg-brand-400 [--keycap-edge:var(--color-brand-700)] hover:bg-brand-300",
  secondary: "keycap bg-surface-4 [--keycap-edge:#0a120e] ring-1 ring-inset ring-line hover:bg-pitch-600",
  outline: "pressable bg-transparent ring-1 ring-inset ring-line-strong hover:bg-white/6 active:bg-white/10",
  ghost: "pressable bg-transparent hover:bg-white/6 active:bg-white/10",
  danger: "keycap bg-danger-500 [--keycap-edge:var(--color-danger-700)] hover:bg-danger-400",
  gold: "keycap bg-gold-400 [--keycap-edge:var(--color-gold-700)] hover:bg-gold-300",
};

const VARIANT_TEXT: Record<ButtonVariant, string> = {
  primary: "text-ink-inverse",
  secondary: "text-ink",
  outline: "text-ink",
  ghost: "text-ink",
  danger: "text-white",
  gold: "text-ink-inverse",
};

/** Every size is at least 44pt tall; `sm` just has compact padding and type. */
const SIZE: Record<ButtonSize, string> = {
  sm: "h-11 gap-1.5 rounded-xl px-3.5 text-subhead [--keycap-depth:3px]",
  md: "h-12 gap-2 rounded-btn px-5 text-callout",
  lg: "h-14 gap-2.5 rounded-[1.125rem] px-6 text-headline",
};

/**
 * A base (unprefixed) text *color* utility in a className: `text-brand-400`,
 * `!text-gold-200`, `text-white`, `text-[#fff]`. Sizes (`text-subhead`),
 * alignment and variant-prefixed ones (`hover:text-ink`) don't count.
 */
const TEXT_COLOR =
  /(?:^|\s)!?text-(?:ink|brand|gold|accent|live|danger|pitch|team|canvas|surface|white|black|current|inherit|transparent|\[(?:#|rgb|hsl|oklch|color:|var\(--color)|\(--color)[^\s]*/;

export function hasTextColor(className: string | undefined): boolean {
  return !!className && TEXT_COLOR.test(className);
}

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
    // A text color passed in className wins over the variant's.
    !hasTextColor(className) && VARIANT_TEXT[variant],
    SIZE[size],
    block && "w-full",
    className,
  );
}
