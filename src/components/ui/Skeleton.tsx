import type { CSSProperties } from "react";
import { cx } from "./cx";

export interface SkeletonProps {
  className?: string;
  style?: CSSProperties;
  circle?: boolean;
}

/** Shimmering placeholder block. Size it with classes (h-*, w-*). */
export function Skeleton({ className, style, circle }: SkeletonProps) {
  return <span aria-hidden style={style} className={cx("shimmer block", circle ? "rounded-full" : "rounded-xl", className)} />;
}

/** A few lines of placeholder text; the last line is shorter. */
export function SkeletonText({ lines = 2, className }: { lines?: number; className?: string }) {
  return (
    <span aria-hidden className={cx("flex flex-col gap-2", className)}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={cx("h-3.5", i === lines - 1 && lines > 1 ? "w-3/5" : "w-full")} />
      ))}
    </span>
  );
}
