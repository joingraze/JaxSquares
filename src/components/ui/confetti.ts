// Celebration bursts (canvas-confetti, loaded on first use). Every burst is
// skipped when the user prefers reduced motion.

import type { Options } from "canvas-confetti";

export type CelebrateKind =
  /** Small pop from a point, e.g. claiming squares. */
  | "pop"
  /** A winning square: center burst plus a gold shower. */
  | "win"
  /** Stadium cannons from both bottom corners, e.g. the final whistle. */
  | "cannons";

export interface CelebrateOptions {
  /** Team or player colors; defaults to the brand mix. */
  colors?: string[];
  /** 0..1 viewport coordinates for "pop". */
  origin?: { x: number; y: number };
}

export const CELEBRATION_COLORS = ["#c6f91f", "#ffc233", "#ffffff", "#ff66a6", "#38b6ff"];

export function prefersReducedMotion(): boolean {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

const importConfetti = () => import("canvas-confetti");
let lib: ReturnType<typeof importConfetti> | null = null;
const load = () => (lib ??= importConfetti());

export async function celebrate(kind: CelebrateKind = "win", opts: CelebrateOptions = {}): Promise<void> {
  if (prefersReducedMotion()) return;
  const { default: confetti } = await load();
  const colors = opts.colors?.length ? opts.colors : CELEBRATION_COLORS;
  const base: Options = { colors, disableForReducedMotion: true, zIndex: 80 };

  if (kind === "pop") {
    void confetti({ ...base, particleCount: 36, spread: 70, startVelocity: 28, scalar: 0.85, ticks: 140, origin: opts.origin ?? { x: 0.5, y: 0.6 } });
    return;
  }

  if (kind === "win") {
    void confetti({ ...base, particleCount: 110, spread: 100, startVelocity: 48, origin: { x: 0.5, y: 0.55 }, ticks: 260 });
    setTimeout(() => {
      void confetti({
        ...base,
        colors: ["#ffd56b", "#ffc233", "#ffab0f", "#fff3d1"],
        particleCount: 60,
        spread: 160,
        startVelocity: 22,
        gravity: 0.7,
        scalar: 1.1,
        shapes: ["circle"],
        origin: { x: 0.5, y: 0.25 },
        ticks: 320,
      });
    }, 220);
    return;
  }

  const end = Date.now() + 1100;
  const frame = () => {
    void confetti({ ...base, particleCount: 4, angle: 60, spread: 58, startVelocity: 62, origin: { x: 0, y: 0.95 } });
    void confetti({ ...base, particleCount: 4, angle: 120, spread: 58, startVelocity: 62, origin: { x: 1, y: 0.95 } });
    if (Date.now() < end) requestAnimationFrame(frame);
  };
  frame();
}
