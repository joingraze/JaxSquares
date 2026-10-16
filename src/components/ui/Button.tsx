import { forwardRef, type ButtonHTMLAttributes, type MouseEvent, type ReactNode } from "react";
import { haptic, type HapticKind } from "../../lib/native";
import { buttonStyles, type ButtonSize, type ButtonStyleOptions, type ButtonVariant } from "./buttonStyles";
import { Spinner } from "./Spinner";

export type { ButtonSize, ButtonVariant };

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, ButtonStyleOptions {
  loading?: boolean;
  leading?: ReactNode;
  trailing?: ReactNode;
  /** Native haptic on press. Defaults to a light tap for primary/danger/gold. */
  haptic?: HapticKind | false;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "primary",
    size = "md",
    block,
    loading = false,
    leading,
    trailing,
    haptic: hapticKind,
    className,
    children,
    disabled,
    type = "button",
    onClick,
    ...rest
  },
  ref,
) {
  const feel = hapticKind ?? (variant === "secondary" || variant === "ghost" ? false : "light");
  const handleClick = (e: MouseEvent<HTMLButtonElement>) => {
    if (feel) void haptic(feel);
    onClick?.(e);
  };
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      onClick={handleClick}
      className={buttonStyles({ variant, size, block, className })}
      {...rest}
    >
      {loading ? <Spinner size={size === "sm" ? 14 : 18} /> : leading}
      {children}
      {!loading && trailing}
    </button>
  );
});
