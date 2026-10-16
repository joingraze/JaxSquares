import type { ReactNode } from "react";

export interface ListGroupProps {
  /** Small caps heading above the group. */
  title?: ReactNode;
  /** Muted helper text under the group. */
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
}

/** Inset grouped list (iOS settings style): rows separated by hairlines inside one card. */
export function ListGroup({ title, footer, children, className }: ListGroupProps) {
  return (
    <section className={className}>
      {title && <h2 className="eyebrow mb-2 px-1 text-ink-subtle">{title}</h2>}
      <div className="overflow-hidden rounded-card bg-surface-2 ring-1 ring-inset ring-line shadow-card [&>*+*]:border-t [&>*+*]:border-line">
        {children}
      </div>
      {footer && <p className="mt-2 px-1 text-footnote text-ink-subtle">{footer}</p>}
    </section>
  );
}
