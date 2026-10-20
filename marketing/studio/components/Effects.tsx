import type { CSSProperties } from "react";
import { Easing, interpolate, seeded, spring } from "../lib/anim";
import { COLORS } from "../brand";
import { ASSETS } from "../lib/assets";

const FPS = 30;

/** A finger-tap ripple at (x, y), starting at `start`. */
export function Tap({ frame, start, x, y }: { frame: number; start: number; x: number; y: number }) {
  const t = frame - start;
  if (t < 0 || t > 18) return null;
  const s = interpolate(t, [0, 18], [0.5, 1.6], { easing: Easing.out });
  const o = interpolate(t, [0, 4, 18], [0, 0.6, 0]);
  return (
    <div
      className="pointer-events-none absolute rounded-full"
      style={{
        left: x - 26,
        top: y - 26,
        width: 52,
        height: 52,
        background: "rgba(243,247,241,0.85)",
        boxShadow: `0 0 0 3px ${COLORS.volt}`,
        opacity: o,
        transform: `scale(${s})`,
        zIndex: 50,
      }}
    />
  );
}

/**
 * iOS lock-screen-style push, as JaxSquares sends it: the board name is the
 * title (worker/push/copy.ts). Sized in phone screen pts; place it in a Phone
 * overlay, or pass `width` to float it on the stage.
 */
export function PushBanner({
  frame,
  start,
  end,
  title,
  body,
  top = 62,
  width,
  style,
}: {
  frame: number;
  start: number;
  end: number;
  title: string;
  body: string;
  top?: number;
  width?: number;
  style?: CSSProperties;
}) {
  if (frame < start || frame > end + 10) return null;
  const inS = spring(frame - start, FPS, { stiffness: 210, damping: 20 });
  const out = interpolate(frame, [end, end + 10], [0, 1], { easing: Easing.in });
  const y = (1 - inS) * -110 - out * 110;
  return (
    <div
      className="absolute flex items-start"
      style={{
        top,
        left: width === undefined ? 12 : `calc(50% - ${width / 2}px)`,
        right: width === undefined ? 12 : undefined,
        width,
        gap: 12,
        padding: "13px 15px",
        borderRadius: 26,
        zIndex: 40,
        background: "rgba(38,46,42,0.86)",
        backdropFilter: "blur(20px)",
        border: "1px solid rgba(255,255,255,0.08)",
        boxShadow: "0 18px 40px rgba(0,0,0,0.5)",
        transform: `translateY(${y}px)`,
        opacity: 1 - out,
        color: "#fff",
        ...style,
      }}
    >
      <img src={ASSETS.icon} alt="" style={{ width: 40, height: 40, borderRadius: 10, flexShrink: 0 }} />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between" style={{ gap: 8 }}>
          <span style={{ fontSize: 15, fontWeight: 700 }}>{title}</span>
          <span style={{ fontSize: 13, color: "rgba(255,255,255,0.55)" }}>now</span>
        </span>
        <span className="block" style={{ fontSize: 15, lineHeight: 1.3, color: "rgba(255,255,255,0.92)" }}>
          {body}
        </span>
      </span>
    </div>
  );
}

const CONFETTI_COLORS = [COLORS.volt, COLORS.gold, COLORS.flare, COLORS.sky, "#ffffff", COLORS.voltLight];

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
        const style: CSSProperties = {
          position: "absolute",
          left: px,
          top: py,
          width: w,
          height: w * (0.4 + rnd() * 0.6),
          background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
          borderRadius: rnd() > 0.7 ? 999 : 1.5,
          transform: `rotate(${spin}deg)`,
          opacity: interpolate(t, [2.2, 3], [1, 0]),
        };
        return <span key={i} style={style} />;
      })}
    </div>
  );
}

/** A digit as a string that slot-machines through 0–9 and lands on `value` at `land`; "" before `start`. */
export function rollingDigit(frame: number, start: number, land: number, value: number, seed = 0): string {
  if (frame < start) return "";
  if (frame < land) return String((Math.floor(frame * 0.9) + seed * 3) % 10);
  return String(value);
}

/** A pill callout, e.g. "Maya: 0–7 🔥". (x, y) is its center. */
export function Callout({
  frame,
  start,
  end,
  x,
  y,
  text,
  color = COLORS.gold,
}: {
  frame: number;
  start: number;
  end?: number;
  x: number;
  y: number;
  text: string;
  color?: string;
}) {
  if (frame < start) return null;
  const s = spring(frame - start, FPS, { stiffness: 260, damping: 16 });
  const out = end === undefined ? 1 : interpolate(frame, [end, end + 8], [1, 0]);
  return (
    <div
      className="absolute whitespace-nowrap rounded-full"
      style={{
        left: x,
        top: y,
        padding: "6px 12px",
        fontSize: 13,
        fontWeight: 800,
        background: color,
        color: COLORS.canvas,
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

/** A quick white flash for a beat change. */
export function Flash({ frame, at, strength = 0.22 }: { frame: number; at: number; strength?: number }) {
  if (frame < at - 4 || frame > at + 8) return null;
  return (
    <div
      className="pointer-events-none absolute inset-0"
      style={{
        background: "#fff",
        zIndex: 70,
        opacity: interpolate(frame, [at - 4, at, at + 8], [0, strength, 0], { easing: Easing.out }),
      }}
    />
  );
}
