import type { CSSProperties, ReactNode } from "react";
import { COLORS } from "../brand";
import { clipFrame, type Scene } from "../lib/clips";

/** The recorded phone: 440×956 pt (6.9-inch iPhone), the clips' viewport. */
export const SCREEN_W = 440;
export const SCREEN_H = 956;
const STATUS_H = 62; // Dynamic Island safe area, left empty by the app

export interface PhonePose {
  cx: number;
  top: number;
  scale: number;
}

/**
 * A device-free rounded screen, as in the App Store art: the real app's frame
 * with a drawn 9:41 status bar in the top safe area. `cx`/`top` place it in
 * stage CSS px; `overlay` draws above the screen in screen points.
 */
export function Phone({
  children,
  overlay,
  cx = 180,
  top = 120,
  scale = 0.62,
  rotate = 0,
  style,
}: {
  children?: ReactNode;
  overlay?: ReactNode;
  cx?: number;
  top?: number;
  scale?: number;
  rotate?: number;
  style?: CSSProperties;
}) {
  return (
    <div
      className="absolute"
      style={{
        left: cx - (SCREEN_W * scale) / 2,
        top,
        width: SCREEN_W,
        height: SCREEN_H,
        transform: `scale(${scale}) rotate(${rotate}deg)`,
        transformOrigin: "top left",
        ...style,
      }}
    >
      <div
        className="relative overflow-hidden"
        style={{
          width: SCREEN_W,
          height: SCREEN_H,
          borderRadius: 55,
          background: COLORS.canvas,
          boxShadow:
            "0 0 0 2px rgba(255,255,255,0.10), 0 40px 90px rgba(0,0,0,0.65), 0 0 80px rgba(198,249,31,0.08)",
        }}
      >
        {children}
        <StatusBar />
        {overlay}
      </div>
    </div>
  );
}

/** One frame of a recorded clip, filling the screen. */
export function Clip({ scene, at }: { scene: Scene; at: number }) {
  return (
    <img
      src={clipFrame(scene, at)}
      alt=""
      draggable={false}
      style={{ display: "block", width: SCREEN_W, height: SCREEN_H, objectFit: "cover" }}
    />
  );
}

/** One shot of a phone edit: from composition frame `at`, play `scene` from clip frame `from`. */
export interface Cut {
  at: number;
  scene: Scene;
  from?: number;
  /** Clip frames per composition frame (1.5 = 50% faster). */
  speed?: number;
}

/** Clip frame a cut shows at composition frame `frame`. */
export function cutFrame(cut: Cut, frame: number): number {
  return (cut.from ?? 0) + Math.max(0, frame - cut.at) * (cut.speed ?? 1);
}

/** Plays a list of cuts on the phone screen, cross-dissolving into each new one. */
export function Cuts({ frame, cuts, fade = 5 }: { frame: number; cuts: Cut[]; fade?: number }) {
  let i = 0;
  while (i + 1 < cuts.length && frame >= cuts[i + 1].at) i++;
  const cur = cuts[i];
  const prev = i > 0 ? cuts[i - 1] : null;
  const t = prev ? Math.min(1, (frame - cur.at) / fade) : 1;
  return (
    <>
      {prev && t < 1 && (
        <div className="absolute inset-0">
          <Clip scene={prev.scene} at={cutFrame(prev, frame)} />
        </div>
      )}
      <div className="absolute inset-0" style={{ opacity: t }}>
        <Clip scene={cur.scene} at={cutFrame(cur, frame)} />
      </div>
    </>
  );
}

/** Screen rows `y0`..`y1` (pts) of a clip frame as a rounded card `width` CSS px wide. */
export function ClipCrop({
  scene,
  at,
  y0,
  y1,
  width,
  style,
}: {
  scene: Scene;
  at: number;
  y0: number;
  y1: number;
  width: number;
  style?: CSSProperties;
}) {
  const scale = width / SCREEN_W;
  return (
    <div
      className="relative overflow-hidden"
      style={{
        width,
        height: (y1 - y0) * scale,
        borderRadius: 18,
        background: COLORS.canvas,
        boxShadow: `0 0 0 1px ${COLORS.lineStrong}, 0 24px 50px rgba(0,0,0,0.55)`,
        ...style,
      }}
    >
      <img
        src={clipFrame(scene, at)}
        alt=""
        draggable={false}
        style={{ position: "absolute", left: 0, top: -y0 * scale, width, height: SCREEN_H * scale }}
      />
    </div>
  );
}

function StatusBar() {
  return (
    <div
      className="absolute inset-x-0 top-0 flex items-center justify-between"
      style={{ height: STATUS_H, padding: "14px 34px 0 46px", color: "#fff", zIndex: 5 }}
    >
      <span style={{ fontWeight: 700, fontSize: 17, letterSpacing: "-0.01em" }}>9:41</span>
      <span
        className="absolute left-1/2 rounded-full bg-black"
        style={{ top: 14, width: 124, height: 36, transform: "translateX(-50%)" }}
      />
      <span className="flex items-center" style={{ gap: 6 }}>
        <span className="flex items-end" style={{ gap: 2 }}>
          {[5, 7, 9.5, 12].map((h) => (
            <span key={h} style={{ width: 3.6, height: h, borderRadius: 1, background: "#fff" }} />
          ))}
        </span>
        <span
          style={{
            width: 25,
            height: 12,
            borderRadius: 3.5,
            border: "1px solid rgba(255,255,255,0.45)",
            padding: 1.5,
            marginLeft: 4,
          }}
        >
          <span style={{ display: "block", height: "100%", borderRadius: 2, background: "#fff" }} />
        </span>
      </span>
    </div>
  );
}
