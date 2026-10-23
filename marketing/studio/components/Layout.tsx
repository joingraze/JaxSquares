import type { CSSProperties, ReactNode } from "react";
import { COLORS } from "../brand";
import { interpolate, spring } from "../lib/anim";
import { SCREEN_H, SCREEN_W, type PhonePose } from "./Phone";

const FPS = 30;

/** Full phone under a caption band; the bottom runs under the Reels caption. */
export const POSE_FULL: PhonePose = { cx: 180, top: 150, scale: 0.6 };
/** Off the bottom edge, for the rise-in. */
export const POSE_LOW: PhonePose = { cx: 180, top: 660, scale: 0.6 };

/**
 * A pose that fits screen rows `y0`..`y1` (screen pts) into the stage band
 * `top`..`bottom` (CSS px), capped at `max` scale so frames stay sharp.
 */
export function focus(y0: number, y1: number, top = 150, bottom = 600, max = 0.9): PhonePose {
  const scale = Math.min(max, (bottom - top) / (y1 - y0));
  return { cx: 180, top: top - y0 * scale, scale };
}

/** Blend two poses with a spring that starts at `start`. */
export function poseAt(
  frame: number,
  start: number,
  from: PhonePose,
  to: PhonePose,
  stiffness = 120,
): PhonePose {
  const t = spring(frame - start, FPS, { stiffness, damping: 20 });
  return {
    cx: from.cx + (to.cx - from.cx) * t,
    top: from.top + (to.top - from.top) * t,
    scale: from.scale + (to.scale - from.scale) * t,
  };
}

/** Walk a list of [startFrame, pose] keys: each move springs from the previous pose. */
export function poseTrack(frame: number, keys: [number, PhonePose][]): PhonePose {
  let pose = keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    if (frame < keys[i][0]) break;
    pose = poseAt(frame, keys[i][0], keys[i - 1][1], keys[i][1]);
  }
  return pose;
}

/** A point in phone screen pts, in stage CSS px for a pose. */
export function toStage(pose: PhonePose, x: number, y: number): { x: number; y: number } {
  const left = pose.cx - (SCREEN_W * pose.scale) / 2;
  return { x: left + pose.scale * x, y: pose.top + pose.scale * y };
}

/** Stage-px height of the phone in a pose (for fitting things below it). */
export function phoneBottom(pose: PhonePose): number {
  return pose.top + SCREEN_H * pose.scale;
}

/** Dark fade over the top band so captions read over a pushed-in phone. */
export function TopFade({ opacity = 1, height = 140 }: { opacity?: number; height?: number }) {
  return (
    <div
      className="absolute inset-x-0 top-0"
      style={{
        height: height + 40,
        opacity,
        zIndex: 25,
        background: `linear-gradient(to bottom, ${COLORS.canvas} 0%, ${COLORS.canvas} ${height - 20}px, rgba(6,12,9,0) ${height + 40}px)`,
      }}
    />
  );
}

const TONES = {
  volt: { bg: COLORS.volt, ink: COLORS.canvas },
  light: { bg: COLORS.ink, ink: COLORS.canvas },
  gold: { bg: COLORS.gold, ink: COLORS.canvas },
  dark: { bg: "rgba(17,26,21,0.94)", ink: COLORS.ink },
} as const;

export type StickerTone = keyof typeof TONES;

/** Native-Reels-style caption sticker with an optional step number. */
export function Sticker({
  frame,
  start,
  end,
  step,
  children,
  top = 96,
  tone = "light",
  size = 20,
}: {
  frame: number;
  start: number;
  end?: number;
  step?: number;
  children: ReactNode;
  top?: number;
  tone?: StickerTone;
  size?: number;
}) {
  if (frame < start || (end !== undefined && frame > end + 8)) return null;
  const s = spring(frame - start, FPS, { stiffness: 260, damping: 17 });
  const out = end === undefined ? 0 : interpolate(frame, [end, end + 8], [0, 1]);
  const { bg, ink } = TONES[tone];
  const style: CSSProperties = {
    top,
    zIndex: 30,
    transform: `scale(${s * (1 - out * 0.15)}) rotate(${(1 - s) * -4}deg)`,
    opacity: 1 - out,
  };
  return (
    <div className="absolute inset-x-0 flex justify-center" style={{ ...style, padding: "0 26px" }}>
      <div
        className="display flex items-center"
        style={{
          gap: 10,
          padding: "9px 15px",
          borderRadius: 16,
          background: bg,
          color: ink,
          fontSize: size,
          lineHeight: 1.08,
          letterSpacing: "-0.03em",
          boxShadow: "0 12px 30px rgba(0,0,0,0.5)",
          border: tone === "dark" ? `1px solid ${COLORS.lineStrong}` : undefined,
        }}
      >
        {step !== undefined && (
          <span
            className="grid shrink-0 place-items-center rounded-full"
            style={{ width: 26, height: 26, fontSize: 15, background: ink, color: bg, letterSpacing: 0 }}
          >
            {step}
          </span>
        )}
        <span>{children}</span>
      </div>
    </div>
  );
}

/** A dark glass card for notes and stats on top of the backdrop. */
export function Panel({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div
      style={{
        borderRadius: 20,
        background: "rgba(12,20,16,0.92)",
        border: `1px solid ${COLORS.line}`,
        boxShadow: "0 18px 40px rgba(0,0,0,0.45)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}
