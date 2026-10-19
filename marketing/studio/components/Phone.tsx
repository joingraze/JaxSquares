import type { CSSProperties, ReactNode } from "react";
import { Logo } from "../../../src/components/AppShell";

export const SCREEN_W = 375;
export const SCREEN_H = 812;
const BEZEL = 11;

/** The app's page background (mirrors body in src/index.css). */
export const APP_BG = [
  "radial-gradient(1200px 600px at 50% -10%, rgba(34,197,94,0.12), transparent 60%)",
  "radial-gradient(900px 500px at 100% 10%, rgba(56,189,248,0.1), transparent 55%)",
  "#060a16",
].join(", ");

/**
 * An iPhone-sized device rendering app UI at its real 375pt width, scaled to fit
 * the stage. `cx`/`top` place it in stage CSS px. `overlay` draws above the app
 * content in screen coordinates (share sheets, taps, toasts).
 */
export function Phone({
  children,
  overlay,
  cx = 180,
  top = 170,
  scale = 0.72,
  rotate = 0,
  header = true,
  style,
}: {
  children?: ReactNode;
  overlay?: ReactNode;
  cx?: number;
  top?: number;
  scale?: number;
  rotate?: number;
  header?: boolean;
  style?: CSSProperties;
}) {
  const outerW = SCREEN_W + BEZEL * 2;
  const outerH = SCREEN_H + BEZEL * 2;
  return (
    <div
      className="absolute"
      style={{
        left: cx - (outerW * scale) / 2,
        top,
        width: outerW,
        height: outerH,
        transform: `scale(${scale}) rotate(${rotate}deg)`,
        transformOrigin: "top left",
        ...style,
      }}
    >
      <div
        style={{
          width: outerW,
          height: outerH,
          borderRadius: 58,
          padding: BEZEL,
          background: "linear-gradient(145deg, #323c52, #0d1220 38%, #1c2435)",
          boxShadow:
            "0 50px 90px rgba(0,0,0,0.6), 0 0 0 1.5px rgba(255,255,255,0.10) inset, 0 0 60px rgba(34,197,94,0.10)",
        }}
      >
        <div
          className="relative overflow-hidden text-[#e6edf6]"
          style={{ width: SCREEN_W, height: SCREEN_H, borderRadius: 47, background: APP_BG }}
        >
          <StatusBar />
          {header && <AppHeader />}
          <div className="px-4 pt-4">{children}</div>
          {overlay}
        </div>
      </div>
    </div>
  );
}

function StatusBar() {
  return (
    <div className="relative flex h-[50px] items-center justify-between px-8 pt-1 text-[15px] font-semibold">
      <span>9:41</span>
      <span
        className="absolute left-1/2 top-[11px] h-[32px] w-[118px] -translate-x-1/2 rounded-full bg-black"
        aria-hidden
      />
      <span className="flex items-center gap-1.5">
        <span className="flex items-end gap-[2px]">
          {[5, 7, 9, 11].map((h) => (
            <span key={h} className="w-[3px] rounded-sm bg-white" style={{ height: h }} />
          ))}
        </span>
        <span className="ml-1 h-[11px] w-[22px] rounded-[3px] border border-white/60 p-[1.5px]">
          <span className="block h-full w-[78%] rounded-[1.5px] bg-white" />
        </span>
      </span>
    </div>
  );
}

/** Mirrors the sticky header in src/components/AppShell.tsx. */
function AppHeader() {
  return (
    <header className="border-b border-white/5 bg-pitch-950/80 px-4 pb-3 pt-1">
      <div className="flex items-center gap-2">
        <Logo />
        <span className="text-lg font-extrabold tracking-tight">
          Jax<span className="text-brand-400">Squares</span>
        </span>
      </div>
    </header>
  );
}
