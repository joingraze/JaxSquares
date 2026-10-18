import type { CSSProperties } from "react";
import { contrastText } from "../../lib/format";
import { cx } from "./cx";

export type AvatarSize = "xs" | "sm" | "md" | "lg" | "xl";

const PX: Record<AvatarSize, number> = { xs: 22, sm: 28, md: 36, lg: 48, xl: 76 };

export interface AvatarPerson {
  name: string;
  color: string;
  emoji?: string;
}

export interface AvatarProps extends AvatarPerson {
  size?: AvatarSize;
  /** Highlight ring: "you" (volt), a winner (gold), or the default cut-out ring for stacking. */
  ring?: "none" | "cutout" | "brand" | "gold";
  className?: string;
  /** Hide from assistive tech when the name is already written next to it. */
  decorative?: boolean;
}

/** One letter for a player with no emoji: the first character of their name ("Tess" -> "T"). */
export function avatarInitial(name: string): string {
  const first = [...name.trim()][0];
  return first ? first.toLocaleUpperCase() : "?";
}

/** A player as an emoji (or one initial) on their color: a glossy sticker. */
export function Avatar({ name, color, emoji, size = "md", ring = "none", className, decorative }: AvatarProps) {
  const px = PX[size];
  const style: CSSProperties = {
    width: px,
    height: px,
    backgroundColor: color,
    color: contrastText(color),
    fontSize: emoji ? px * 0.56 : px * 0.48,
  };
  return (
    <span
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : name}
      aria-hidden={decorative || undefined}
      style={style}
      className={cx(
        "relative inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full leading-none",
        "shadow-[inset_0_-3px_0_rgb(0_0_0/0.18),inset_0_2px_0_rgb(255_255_255/0.35)]",
        !emoji && "font-display font-extrabold tracking-tight",
        ring === "cutout" && "ring-2 ring-canvas",
        ring === "brand" && "ring-2 ring-brand-line ring-offset-2 ring-offset-canvas",
        ring === "gold" && "ring-2 ring-gold-line ring-offset-2 ring-offset-canvas",
        className,
      )}
    >
      <span aria-hidden className={emoji ? "translate-y-[0.04em]" : undefined}>
        {emoji || avatarInitial(name)}
      </span>
    </span>
  );
}

export interface AvatarGroupProps {
  people: (AvatarPerson & { id?: string })[];
  /** Avatars shown before collapsing into "+N". */
  max?: number;
  size?: AvatarSize;
  className?: string;
}

/** Overlapping stack of avatars with a "+N" chip. */
export function AvatarGroup({ people, max = 4, size = "sm", className }: AvatarGroupProps) {
  const shown = people.slice(0, max);
  const extra = people.length - shown.length;
  const px = PX[size];
  const label = people.map((p) => p.name).join(", ");
  return (
    <span role="img" aria-label={label} className={cx("inline-flex items-center", className)}>
      {shown.map((p, i) => (
        <Avatar
          key={p.id ?? `${p.name}-${i}`}
          {...p}
          size={size}
          ring="cutout"
          decorative
          className={i > 0 ? "-ml-[0.32em]" : undefined}
        />
      ))}
      {extra > 0 && (
        <span
          aria-hidden
          style={{ height: px, minWidth: px, fontSize: Math.max(10, px * 0.36) }}
          className="-ml-[0.32em] inline-flex items-center justify-center rounded-full bg-surface-4 px-1.5 font-extrabold tabular-nums text-ink-muted ring-2 ring-canvas"
        >
          +{extra}
        </span>
      )}
    </span>
  );
}
