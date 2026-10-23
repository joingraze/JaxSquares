// Frame-based animation helpers. Every visual in the studio is a pure function
// of the current frame number, so a render is deterministic and can be captured
// one frame at a time (no CSS transitions or wall-clock timers).

export type EasingFn = (t: number) => number;

export const Easing = {
  linear: (t: number) => t,
  in: (t: number) => t * t * t,
  out: (t: number) => 1 - Math.pow(1 - t, 3),
  inOut: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  expoOut: (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  backOut: (t: number) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
} satisfies Record<string, EasingFn>;

/** Map `x` from an input range to an output range (piecewise, clamped by default). */
export function interpolate(
  x: number,
  input: readonly number[],
  output: readonly number[],
  opts: { easing?: EasingFn; clamp?: boolean } = {},
): number {
  const { easing = Easing.linear, clamp = true } = opts;
  if (input.length !== output.length || input.length < 2) {
    throw new Error("interpolate: input/output ranges must match and have 2+ points");
  }
  let i = 1;
  while (i < input.length - 1 && x > input[i]) i++;
  const [a, b] = [input[i - 1], input[i]];
  const [c, d] = [output[i - 1], output[i]];
  let t = b === a ? 1 : (x - a) / (b - a);
  if (clamp) t = Math.min(1, Math.max(0, t));
  return c + (d - c) * easing(t);
}

/**
 * Damped spring from 0 → 1 that starts at `frame` 0. Simulated with a small
 * fixed timestep so it is identical on every run.
 */
export function spring(
  frame: number,
  fps: number,
  {
    stiffness = 170,
    damping = 18,
    mass = 1,
  }: { stiffness?: number; damping?: number; mass?: number } = {},
): number {
  if (frame <= 0) return 0;
  // A spring this stiff has settled long before 2.5s; skip the simulation.
  if (frame > fps * 2.5) return 1;
  const steps = 4;
  const dt = 1 / (fps * steps);
  let x = 0;
  let v = 0;
  for (let i = 0; i < frame * steps; i++) {
    const a = (-stiffness * (x - 1) - damping * v) / mass;
    v += a * dt;
    x += v * dt;
  }
  return x;
}

/** 0 → 1 → 0 envelope: fades in over `fadeIn` frames, out over `fadeOut`, between start and end. */
export function envelope(
  frame: number,
  start: number,
  end: number,
  fadeIn = 8,
  fadeOut = 8,
): number {
  if (frame < start || frame > end) return 0;
  return Math.min(
    interpolate(frame, [start, start + fadeIn], [0, 1]),
    interpolate(frame, [end - fadeOut, end], [1, 0]),
  );
}

/** Deterministic PRNG (mulberry32) so mock data is identical on every render. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Characters of `text` revealed by `frame`, typing at `cps` chars/second. */
export function typed(text: string, frame: number, fps: number, cps = 16): string {
  const n = Math.max(0, Math.floor((frame / fps) * cps));
  return text.slice(0, n);
}
