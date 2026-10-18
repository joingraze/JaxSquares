import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "./cx";

export type CardTone = "default" | "raised" | "brand" | "gold" | "outline";

const TONE: Record<CardTone, string> = {
  default: "bg-surface-2 ring-1 ring-inset ring-line shadow-card",
  raised: "bg-surface-3 ring-1 ring-inset ring-line-strong shadow-float",
  brand: "bg-[linear-gradient(160deg,rgb(198_249_31/0.16),rgb(198_249_31/0.04)_55%)] bg-surface-2 ring-1 ring-inset ring-brand-line/30 shadow-card",
  gold: "bg-[linear-gradient(160deg,rgb(255_194_51/0.2),rgb(255_171_15/0.05)_60%)] bg-surface-2 ring-1 ring-inset ring-gold-line/40 shadow-glow-gold",
  outline: "ring-1 ring-inset ring-line-strong",
};

const PAD = { none: "", sm: "p-3", md: "p-4", lg: "p-5" } as const;

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  tone?: CardTone;
  padding?: keyof typeof PAD;
  /** Adds press feedback; use with onClick or wrap a link. */
  interactive?: boolean;
  children?: ReactNode;
}

export function Card({ tone = "default", padding = "md", interactive, className, children, ...rest }: CardProps) {
  return (
    <div
      className={cx("relative overflow-hidden rounded-card", TONE[tone], PAD[padding], interactive && "pressable cursor-pointer", className)}
      {...rest}
    >
      {children}
    </div>
  );
}
