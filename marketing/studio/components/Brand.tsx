import type { CSSProperties } from "react";
import { Easing, interpolate, spring } from "../lib/anim";
import { BRAND, COLORS } from "../brand";
import { Backdrop, type Tint } from "./Backdrop";
import { Jax, LogoMark, TeamMark } from "../../../src/components/ui";
import type { Team } from "../lib/world";

const FPS = 30;

/** The app's lockup: the 3×3 mark and "Jax" + volt "Squares". */
export function Lockup({ size = 22, style }: { size?: number; style?: CSSProperties }) {
  return (
    <span className="inline-flex items-center" style={{ gap: size * 0.36, ...style }}>
      <LogoMark size={size * 1.3} />
      <span className="display" style={{ fontSize: size, letterSpacing: "-0.03em", color: COLORS.ink }}>
        Jax<span style={{ color: COLORS.volt }}>Squares</span>
      </span>
    </span>
  );
}

/** Closing card used by every video: Jax, the lockup, the promise, the URL. */
export function EndCard({
  frame,
  start,
  line = "Squares for any game.|Set up in 30 seconds.",
  tint = "volt",
}: {
  frame: number;
  start: number;
  line?: string;
  tint?: Tint;
}) {
  const f = frame - start;
  if (f < 0) return null;
  // Everything, the URL included, is in within half a second: Reels loop fast, so the card has to read at once.
  const wipe = interpolate(f, [0, 6], [0, 1], { easing: Easing.out });
  const jax = spring(f + 2, FPS, { stiffness: 220, damping: 14 });
  const word = spring(f - 2, FPS, { stiffness: 240, damping: 20 });
  const sub = spring(f - 5, FPS, { stiffness: 240, damping: 22 });
  const chips = (i: number) => spring(f - 8 - i * 2, FPS, { stiffness: 280, damping: 18 });
  const cta = spring(f - 6, FPS, { stiffness: 260, damping: 16 });
  const pulse = 1 + 0.03 * Math.sin(Math.max(0, f - 20) / 4);
  return (
    <div className="absolute inset-0" style={{ opacity: wipe, zIndex: 80 }}>
      <Backdrop frame={frame} tint={tint} glowY={40} />
      <div className="absolute inset-x-0 flex flex-col items-center" style={{ top: 118 }}>
        <div style={{ transform: `translateY(${(1 - jax) * 40}px) scale(${0.6 + 0.4 * jax})`, opacity: Math.min(1, jax * 1.5) }}>
          <Jax pose="sit" size={118} />
        </div>
        <div style={{ marginTop: 10, opacity: word, transform: `translateY(${(1 - word) * 16}px)` }}>
          <Lockup size={34} />
        </div>
        <div
          className="display text-center"
          style={{
            marginTop: 14,
            fontSize: 22,
            lineHeight: 1.12,
            color: COLORS.ink,
            opacity: sub,
            transform: `translateY(${(1 - sub) * 14}px)`,
          }}
        >
          {line.split("|").map((l) => (
            <div key={l}>{l}</div>
          ))}
        </div>
        <div className="flex" style={{ marginTop: 18, gap: 6 }}>
          {BRAND.taglines.map((t, i) => (
            <span
              key={t}
              className="rounded-full"
              style={{
                padding: "5px 10px",
                fontSize: 11.5,
                fontWeight: 700,
                background: "rgba(198,249,31,0.10)",
                color: COLORS.voltLight,
                border: "1px solid rgba(198,249,31,0.30)",
                transform: `scale(${chips(i)})`,
              }}
            >
              ✓ {t}
            </span>
          ))}
        </div>
        <div
          className="display"
          style={{
            marginTop: 24,
            padding: "13px 26px",
            borderRadius: 18,
            fontSize: 20,
            letterSpacing: "-0.02em",
            background: COLORS.volt,
            color: COLORS.canvas,
            transform: `scale(${cta * pulse})`,
            boxShadow: "0 14px 36px rgba(198,249,31,0.28)",
          }}
        >
          {BRAND.url}
        </div>
        <div style={{ marginTop: 12, fontSize: 13, fontWeight: 600, color: COLORS.muted, opacity: cta }}>
          {BRAND.cta} · {BRAND.handle}
        </div>
      </div>
    </div>
  );
}

/**
 * The board's scoreboard strip (src/features/board/Scorebug.tsx), drawn from
 * plain props: team marks, big scores, and the moment in the middle.
 */
export function ScoreBug({
  teamX,
  teamY,
  x,
  y,
  period,
  sub,
  flash = 0,
  width = 300,
  style,
}: {
  teamX: Team;
  teamY: Team;
  x: number;
  y: number;
  period: string;
  sub?: string;
  /** 0 → 1 gold glow when the score just changed. */
  flash?: number;
  width?: number;
  style?: CSSProperties;
}) {
  const side = (team: Team, score: number, right: boolean, dim: boolean) => (
    <div className="flex min-w-0 flex-col" style={{ gap: 2, alignItems: right ? "flex-end" : "flex-start" }}>
      <div className="flex items-center" style={{ gap: 8, flexDirection: right ? "row-reverse" : "row" }}>
        <TeamMark team={team} size="sm" className="!h-8 !w-8" />
        <span
          className="display tabular-nums"
          style={{ fontSize: 34, lineHeight: 1, color: dim ? COLORS.muted : COLORS.ink }}
        >
          {score}
        </span>
      </div>
      <span className="max-w-full truncate" style={{ fontSize: 11, fontWeight: 600, color: COLORS.muted }}>
        {team.name}
      </span>
    </div>
  );
  return (
    <div
      className="relative overflow-hidden"
      style={{
        width,
        borderRadius: 20,
        background: COLORS.surface2,
        boxShadow: `0 16px 34px rgba(0,0,0,0.5), inset 0 0 0 1px ${COLORS.line}, 0 0 ${28 * flash}px rgba(255,194,51,${0.65 * flash})`,
        ...style,
      }}
    >
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(90deg, ${team30(teamX.color)}, transparent 38%, transparent 62%, ${team30(teamY.color)})`,
        }}
      />
      <div className="absolute inset-y-0 left-0" style={{ width: 4, background: teamX.color }} />
      <div className="absolute inset-y-0 right-0" style={{ width: 4, background: teamY.color }} />
      <div className="relative grid items-center" style={{ gridTemplateColumns: "1fr auto 1fr", gap: 8, padding: "10px 14px" }}>
        {side(teamX, x, false, x < y)}
        <div className="flex flex-col items-center" style={{ gap: 2 }}>
          <span
            className="rounded-full"
            style={{
              padding: "3px 8px",
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              background: flash > 0.05 ? COLORS.gold : "rgba(255,255,255,0.06)",
              color: flash > 0.05 ? COLORS.canvas : COLORS.ink,
            }}
          >
            {period}
          </span>
          {sub && <span style={{ fontSize: 10, fontWeight: 600, color: COLORS.subtle }}>{sub}</span>}
        </div>
        {side(teamY, y, true, y < x)}
      </div>
    </div>
  );
}

function team30(hex: string): string {
  return `color-mix(in srgb, ${hex} 30%, transparent)`;
}
