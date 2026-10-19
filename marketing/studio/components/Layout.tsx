import type { CSSProperties, ReactNode } from "react";
import { COLORS } from "../brand";
import { interpolate, spring } from "../lib/anim";
import { SCREEN_W } from "./Phone";

const FPS = 30;
const BEZEL = 11;

export interface PhonePose {
  cx: number;
  top: number;
  scale: number;
}

/** Full device in view, below a headline. */
export const POSE_FULL: PhonePose = { cx: 180, top: 178, scale: 0.74 };
/** Pushed in on the grid: pills land just under the top caption band. */
export const POSE_GRID: PhonePose = { cx: 180, top: 1, scale: 0.88 };

/** Blend two poses with a spring that starts at `start`. */
export function poseAt(frame: number, start: number, from: PhonePose, to: PhonePose): PhonePose {
  const t = spring(frame - start, FPS, { stiffness: 120, damping: 20 });
  return {
    cx: from.cx + (to.cx - from.cx) * t,
    top: from.top + (to.top - from.top) * t,
    scale: from.scale + (to.scale - from.scale) * t,
  };
}

/** Convert a point in phone screen pts to stage CSS px for a given pose. */
export function toStage(pose: PhonePose, x: number, y: number): { x: number; y: number } {
  const outerW = SCREEN_W + BEZEL * 2;
  const left = pose.cx - (outerW * pose.scale) / 2;
  return { x: left + pose.scale * (BEZEL + x), y: pose.top + pose.scale * (BEZEL + y) };
}

/*
 * Grid geometry inside GameScreen (screen pts). The card sits at x=16..359
 * with a 1px border and p-3 padding; the grid has a 1.4rem label column, ten
 * equal columns and 2px gaps.
 */
const GRID_LEFT = 16 + 1 + 12;
const GRID_INNER_W = 343 - 2 - 24;
const LABEL_COL = 22.4;
const GAP = 2;
const CELL = (GRID_INNER_W - LABEL_COL - GAP * 10) / 10;
const GRID_TOP = 219 + 1 + 12 + 16 + 4;

/** Center of grid cell (row, col) in screen pts. */
export function cellCenter(row: number, col: number): { x: number; y: number } {
  return {
    x: GRID_LEFT + LABEL_COL + GAP + col * (CELL + GAP) + CELL / 2,
    y: GRID_TOP + (CELL + GAP) + row * (CELL + GAP) + CELL / 2,
  };
}

/** Dark fade over the top band so captions read cleanly over a pushed-in phone. */
export function TopFade({ opacity = 1, height = 132 }: { opacity?: number; height?: number }) {
  return (
    <div
      className="absolute inset-x-0 top-0"
      style={{
        height: height + 30,
        opacity,
        zIndex: 25,
        background: `linear-gradient(to bottom, ${COLORS.pitch950} 0%, ${COLORS.pitch950} ${height - 10}px, rgba(6,10,22,0) ${height + 30}px)`,
      }}
    />
  );
}

/** Native-Reels-style caption sticker with an optional step number. */
export function Sticker({
  frame,
  start,
  end,
  step,
  children,
  top = 92,
  tone = "light",
}: {
  frame: number;
  start: number;
  end?: number;
  step?: number;
  children: ReactNode;
  top?: number;
  tone?: "light" | "brand" | "gold";
}) {
  if (frame < start || (end !== undefined && frame > end + 8)) return null;
  const s = spring(frame - start, FPS, { stiffness: 260, damping: 17 });
  const out = end === undefined ? 0 : interpolate(frame, [end, end + 8], [0, 1]);
  const bg = tone === "brand" ? COLORS.brand : tone === "gold" ? COLORS.gold : "#f8fafc";
  const style: CSSProperties = {
    top,
    zIndex: 30,
    transform: `scale(${s * (1 - out * 0.15)}) rotate(${(1 - s) * -4}deg)`,
    opacity: 1 - out,
  };
  return (
    <div className="absolute inset-x-0 flex justify-center px-[26px]" style={style}>
      <div
        className="font-black-display flex items-center gap-2.5 rounded-2xl px-4 py-2.5"
        style={{
          background: bg,
          color: COLORS.pitch950,
          fontSize: 21,
          lineHeight: 1.08,
          boxShadow: "0 12px 30px rgba(0,0,0,0.45)",
        }}
      >
        {step !== undefined && (
          <span
            className="grid shrink-0 place-items-center rounded-full"
            style={{ width: 26, height: 26, fontSize: 15, background: COLORS.pitch950, color: bg }}
          >
            {step}
          </span>
        )}
        <span>{children}</span>
      </div>
    </div>
  );
}
