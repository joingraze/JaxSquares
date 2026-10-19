import type { CSSProperties } from "react";
import { Easing, interpolate, seeded, spring } from "../lib/anim";
import { COLORS } from "../brand";

const FPS = 30;

/** A finger-tap ripple at (x, y), starting at `start`. */
export function Tap({
  frame,
  start,
  x,
  y,
}: {
  frame: number;
  start: number;
  x: number;
  y: number;
}) {
  const t = frame - start;
  if (t < 0 || t > 18) return null;
  const s = interpolate(t, [0, 18], [0.5, 1.6], { easing: Easing.out });
  const o = interpolate(t, [0, 4, 18], [0, 0.55, 0]);
  return (
    <div
      className="pointer-events-none absolute rounded-full"
      style={{
        left: x - 28,
        top: y - 28,
        width: 56,
        height: 56,
        background: "rgba(255,255,255,0.9)",
        opacity: o,
        transform: `scale(${s})`,
        zIndex: 50,
      }}
    />
  );
}

/** iOS-style notification banner sliding down from the top of a phone screen. */
export function Toast({
  frame,
  start,
  end,
  title,
  body,
  icon = "🏈",
  top = 56,
}: {
  frame: number;
  start: number;
  end: number;
  title: string;
  body: string;
  icon?: string;
  top?: number;
}) {
  if (frame < start || frame > end + 10) return null;
  const inS = spring(frame - start, FPS, { stiffness: 200, damping: 20 });
  const out = interpolate(frame, [end, end + 10], [0, 1], { easing: Easing.in });
  const y = (1 - inS) * -90 - out * 90;
  return (
    <div
      className="absolute left-3 right-3 flex items-center gap-3 rounded-[22px] px-3.5 py-3"
      style={{
        top,
        zIndex: 40,
        background: "rgba(30,42,68,0.92)",
        border: "1px solid rgba(255,255,255,0.08)",
        boxShadow: "0 18px 40px rgba(0,0,0,0.5)",
        transform: `translateY(${y}px)`,
        opacity: 1 - out,
      }}
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-pitch-800 text-xl">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-[13px] font-bold">{title}</span>
        <span className="block truncate text-[13px] text-slate-300">{body}</span>
      </span>
    </div>
  );
}

const CONFETTI_COLORS = [
  COLORS.brand,
  COLORS.gold,
  COLORS.accent,
  COLORS.rose,
  "#a78bfa",
  "#ffffff",
];

/** Deterministic confetti burst from (x, y) starting at `start`. */
export function Confetti({
  frame,
  start,
  x,
  y,
  count = 90,
  seed = 7,
  power = 1,
}: {
  frame: number;
  start: number;
  x: number;
  y: number;
  count?: number;
  seed?: number;
  power?: number;
}) {
  const t = (frame - start) / FPS;
  if (t < 0 || t > 3) return null;
  const rnd = seeded(seed);
  return (
    <div className="pointer-events-none absolute inset-0" style={{ zIndex: 60 }}>
      {Array.from({ length: count }, (_, i) => {
        const angle = -Math.PI / 2 + (rnd() - 0.5) * Math.PI * 1.3;
        const speed = (160 + rnd() * 260) * power;
        const vx = Math.cos(angle) * speed;
        const vy = Math.sin(angle) * speed;
        const g = 420;
        const px = x + vx * t;
        const py = y + vy * t + 0.5 * g * t * t;
        const spin = (rnd() - 0.5) * 900 * t;
        const w = 4 + rnd() * 5;
        const color = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
        const style: CSSProperties = {
          position: "absolute",
          left: px,
          top: py,
          width: w,
          height: w * (0.4 + rnd() * 0.6),
          background: color,
          borderRadius: rnd() > 0.7 ? 999 : 1.5,
          transform: `rotate(${spin}deg)`,
          opacity: interpolate(t, [2.2, 3], [1, 0]),
        };
        return <span key={i} style={style} />;
      })}
    </div>
  );
}

/** Cycling digit that slot-machines through 0–9 and lands on `value` at `land`. */
export function RollingDigit({
  frame,
  start,
  land,
  value,
  seed = 0,
}: {
  frame: number;
  start: number;
  land: number;
  value: number;
  seed?: number;
}) {
  if (frame < start) return <>?</>;
  if (frame < land) {
    const d = (Math.floor(frame * 0.9) + seed * 3) % 10;
    return <span style={{ opacity: 0.55, filter: "blur(0.4px)" }}>{d}</span>;
  }
  const s = spring(frame - land, FPS, { stiffness: 320, damping: 14 });
  return (
    <span style={{ display: "inline-block", transform: `scale(${0.4 + 0.6 * s})` }}>{value}</span>
  );
}

/** A pill callout with an arrow, e.g. "Maya: 0–7 ✅". */
export function Callout({
  frame,
  start,
  end,
  x,
  y,
  text,
  color = COLORS.gold,
  dark = true,
}: {
  frame: number;
  start: number;
  end?: number;
  x: number;
  y: number;
  text: string;
  color?: string;
  dark?: boolean;
}) {
  if (frame < start) return null;
  const s = spring(frame - start, FPS, { stiffness: 260, damping: 16 });
  const out = end === undefined ? 1 : interpolate(frame, [end, end + 8], [1, 0]);
  return (
    <div
      className="absolute whitespace-nowrap rounded-full px-3 py-1.5 text-[13px] font-extrabold"
      style={{
        left: x,
        top: y,
        background: color,
        color: dark ? "#0b1120" : "#fff",
        transform: `translate(-50%, -50%) scale(${s})`,
        opacity: out,
        boxShadow: `0 10px 26px rgba(0,0,0,0.45), 0 0 18px ${color}66`,
        zIndex: 30,
      }}
    >
      {text}
    </div>
  );
}
