import type { MouseEventHandler, PointerEventHandler, ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChevronRightIcon } from "../icons";
import { cx } from "./cx";

export interface ListRowProps {
  title: ReactNode;
  subtitle?: ReactNode;
  leading?: ReactNode;
  /** Right-aligned muted value, e.g. "3 squares". */
  detail?: ReactNode;
  /** Right-aligned control (Switch, Badge...). */
  trailing?: ReactNode;
  /** Show a chevron (defaults to true when the row navigates). */
  chevron?: boolean;
  to?: string;
  onClick?: MouseEventHandler<HTMLElement>;
  onPointerDown?: PointerEventHandler<HTMLElement>;
  destructive?: boolean;
  disabled?: boolean;
  className?: string;
}

/** A 56px+ row. Renders a Link with `to`, a button with `onClick`, otherwise a plain row. */
export function ListRow({
  title,
  subtitle,
  leading,
  detail,
  trailing,
  chevron,
  to,
  onClick,
  onPointerDown,
  destructive,
  disabled,
  className,
}: ListRowProps) {
  const interactive = Boolean(to || onClick) && !disabled;
  const showChevron = chevron ?? Boolean(to);
  const classes = cx(
    "flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left",
    interactive && "transition-colors hover:bg-ink/3 active:bg-ink/6",
    disabled && "opacity-45",
    className,
  );
  const body = (
    <>
      {leading && <span className="flex shrink-0 items-center">{leading}</span>}
      <span className="min-w-0 flex-1">
        <span className={cx("block truncate text-callout font-semibold", destructive ? "text-ink-danger" : "text-ink")}>{title}</span>
        {subtitle && <span className="mt-0.5 block truncate text-footnote text-ink-muted">{subtitle}</span>}
      </span>
      {detail && <span className="shrink-0 text-subhead tabular-nums text-ink-muted">{detail}</span>}
      {trailing && <span className="flex shrink-0 items-center">{trailing}</span>}
      {showChevron && <ChevronRightIcon size={18} className="-mr-1 shrink-0 text-ink-subtle" />}
    </>
  );
  if (to && !disabled) {
    return (
      <Link to={to} onClick={onClick} onPointerDown={onPointerDown} className={classes}>
        {body}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} onPointerDown={onPointerDown} disabled={disabled} className={classes}>
        {body}
      </button>
    );
  }
  return <div className={classes}>{body}</div>;
}
