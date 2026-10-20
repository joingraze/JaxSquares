import type { CSSProperties } from "react";
import { Easing, interpolate, spring } from "../lib/anim";
import { BRAND, COLORS } from "../brand";
import { Backdrop } from "./Backdrop";
import { Logo } from "../../../src/components/AppShell";

const FPS = 30;

/** The app's J² logo (src/components/AppShell.tsx) at poster size, with depth. */
export function BigLogo({ size = 64, style }: { size?: number; style?: CSSProperties }) {
  return (
    <span
      style={{
        display: "inline-block",
        width: size,
        height: size,
        borderRadius: size * 0.24,
        boxShadow: "0 18px 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.06) inset",
        ...style,
      }}
    >
      <Logo size={size} />
    </span>
  );
}

export function Wordmark({ size = 30 }: { size?: number }) {
  return (
    <span className="font-black-display" style={{ fontSize: size, letterSpacing: "-0.04em" }}>
      Jax<span style={{ color: COLORS.brandLight }}>Squares</span>
    </span>
  );
}

/** Closing card used by every video: logo, promise, CTA. */
export function EndCard({
  frame,
  start,
  line = "Run your squares pool|in 30 seconds.",
  tint = "brand",
}: {
  frame: number;
  start: number;
  line?: string;
  tint?: "brand" | "gold" | "accent" | "rose";
}) {
  const f = frame - start;
  if (f < 0) return null;
  const wipe = interpolate(f, [0, 10], [0, 1], { easing: Easing.out });
  const logo = spring(f - 4, FPS, { stiffness: 210, damping: 14 });
  const word = spring(f - 9, FPS, { stiffness: 200, damping: 20 });
  const sub = spring(f - 14, FPS, { stiffness: 200, damping: 22 });
  const chips = (i: number) => spring(f - 20 - i * 3, FPS, { stiffness: 260, damping: 18 });
  const cta = spring(f - 30, FPS, { stiffness: 220, damping: 15 });
  const pulse = 1 + 0.035 * Math.sin(Math.max(0, f - 40) / 4);
  const lines = line.split("|");
  return (
    <div className="absolute inset-0" style={{ opacity: wipe, zIndex: 80 }}>
      <Backdrop frame={frame} tint={tint} />
      <div className="absolute inset-x-0 flex flex-col items-center" style={{ top: 150 }}>
        <BigLogo size={78} style={{ transform: `scale(${logo}) rotate(${(1 - logo) * -25}deg)` }} />
        <div
          style={{ marginTop: 18, opacity: word, transform: `translateY(${(1 - word) * 16}px)` }}
        >
          <Wordmark size={40} />
        </div>
        <div
          className="font-black-display text-center"
          style={{
            marginTop: 14,
            fontSize: 21,
            lineHeight: 1.15,
            color: COLORS.text,
            opacity: sub,
            transform: `translateY(${(1 - sub) * 14}px)`,
          }}
        >
          {lines.map((l) => (
            <div key={l}>{l}</div>
          ))}
        </div>
        <div className="mt-5 flex gap-2">
          {BRAND.taglines.map((t, i) => (
            <span
              key={t}
              className="rounded-full px-3 py-1.5 text-[12px] font-bold"
              style={{
                background: "rgba(34,197,94,0.14)",
                color: COLORS.brandLight,
                border: "1px solid rgba(34,197,94,0.35)",
                transform: `scale(${chips(i)})`,
              }}
            >
              ✓ {t}
            </span>
          ))}
        </div>
        <div
          className="mt-7 rounded-2xl px-6 py-3.5 text-[17px] font-extrabold"
          style={{
            background: COLORS.brand,
            color: COLORS.pitch950,
            transform: `scale(${cta * pulse})`,
            boxShadow: "0 14px 36px rgba(34,197,94,0.35)",
          }}
        >
          {BRAND.cta} ↗
        </div>
        <div
          className="mt-4 text-[13px] font-semibold"
          style={{ color: COLORS.muted, opacity: cta }}
        >
          {BRAND.handle}
        </div>
      </div>
    </div>
  );
}

/** TV-style score bug. */
export function ScoreBug({
  awayName,
  homeName,
  away,
  home,
  period,
  awayColor = COLORS.gold,
  homeColor = COLORS.accent,
  flash = 0,
  style,
}: {
  awayName: string;
  homeName: string;
  away: number;
  home: number;
  period: string;
  awayColor?: string;
  homeColor?: string;
  /** 0 → 1 highlight when the score just changed. */
  flash?: number;
  style?: CSSProperties;
}) {
  const team = (name: string, score: number, color: string) => (
    <div className="flex items-center gap-2 px-3 py-2">
      <span style={{ width: 5, height: 22, borderRadius: 3, background: color }} />
      <span className="text-[13px] font-extrabold uppercase tracking-wide">{name}</span>
      <span
        className="ml-1 text-[22px] font-black tabular-nums"
        style={{ minWidth: 26, textAlign: "right" }}
      >
        {score}
      </span>
    </div>
  );
  return (
    <div
      className="inline-flex items-center overflow-hidden rounded-2xl"
      style={{
        background: "rgba(11,17,32,0.92)",
        border: "1px solid rgba(255,255,255,0.1)",
        boxShadow: `0 16px 34px rgba(0,0,0,0.5), 0 0 ${26 * flash}px rgba(251,191,36,${0.6 * flash})`,
        ...style,
      }}
    >
      {team(awayName, away, awayColor)}
      <div className="h-8 w-px bg-white/10" />
      {team(homeName, home, homeColor)}
      <div
        className="self-stretch px-3 text-[12px] font-extrabold uppercase"
        style={{
          display: "grid",
          placeItems: "center",
          background: flash > 0.05 ? COLORS.gold : "rgba(255,255,255,0.06)",
          color: flash > 0.05 ? COLORS.pitch950 : COLORS.text,
        }}
      >
        {period}
      </div>
    </div>
  );
}
