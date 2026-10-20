import type { ReactNode } from "react";
import { cx } from "./cx";

export interface EmptyStateProps {
  /** A big emoji ("🏈") or an icon element, shown on a floating tile. */
  art?: ReactNode;
  /** A full illustration (e.g. <Jax pose="peek" />), shown as is in place of the tile. */
  illustration?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  /** Usually a Button or two. */
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ art = "🏈", illustration, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cx("flex flex-col items-center px-6 py-10 text-center", className)}>
      {illustration ? (
        <div className="relative mb-4">
          <div aria-hidden className="absolute -inset-10 bg-[radial-gradient(closest-side,rgb(255_194_51/0.12),transparent)]" />
          <div className="relative">{illustration}</div>
        </div>
      ) : (
        <div className="relative mb-5">
          <div aria-hidden className="absolute -inset-12 bg-[radial-gradient(closest-side,rgb(198_249_31/0.14),transparent)]" />
          <div
            aria-hidden
            className="relative grid h-20 w-20 animate-float place-items-center rounded-[1.6rem] bg-surface-3 text-[2.6rem] leading-none text-ink-brand shadow-float ring-1 ring-inset ring-line-strong [&>svg]:h-9 [&>svg]:w-9"
          >
            {art}
          </div>
        </div>
      )}
      <h2 className="font-display text-title-3 font-extrabold text-ink">{title}</h2>
      {description && <p className="mt-2 max-w-[19rem] text-callout text-ink-muted">{description}</p>}
      {action && <div className="mt-6 flex w-full max-w-xs flex-col gap-3">{action}</div>}
    </div>
  );
}
