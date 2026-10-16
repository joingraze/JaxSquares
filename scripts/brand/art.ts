// JaxSquares brand art, authored as SVG. The mark is a gold football landing on
// a 3x3 squares board: the two ideas the app is about, readable at 60px.
// Everything is drawn on a 1024 canvas and scaled by the caller.

/** Hues from src/index.css (pitch, brand, accent, gold scales). */
export const palette = {
  pitch950: "#060a16",
  pitch900: "#0b1120",
  pitch800: "#131c30",
  pitch700: "#1e2a44",
  pitch600: "#2c3a5a",
  brand400: "#4ade80",
  brand500: "#22c55e",
  brand600: "#16a34a",
  accent400: "#38bdf8",
  accent500: "#0ea5e9",
  gold400: "#fbbf24",
  gold500: "#f59e0b",
  ink: "#e6edf6",
} as const;

const P = palette;
const CANVAS = 1024;
const CENTER = CANVAS / 2;
/** iOS-style corner radius for icons we round ourselves (PWA "any", favicon). */
export const ICON_RADIUS = 0.2237;

const n = (v: number) => Number(v.toFixed(2));

/**
 * Football silhouette: y = h * (1 - (x/a)^2)^q, sampled by angle so the tips
 * stay smooth. q < 0.5 is a lemon, 0.5 an ellipse; ~0.68 reads as a football.
 */
function ballPath(a: number, h: number, q = 0.68, steps = 96): string {
  const pts: string[] = [];
  for (let i = 0; i < steps; i++) {
    const t = (2 * Math.PI * i) / steps;
    const x = a * Math.cos(t);
    const y = -h * Math.sign(Math.sin(t)) * Math.pow(Math.abs(Math.sin(t)), 2 * q);
    pts.push(`${n(x)} ${n(y)}`);
  }
  return `M ${pts.join(" L ")} Z`;
}

interface BallOpts {
  cx: number;
  cy: number;
  length: number;
  rotate: number;
  /** Outline width; the dark sticker edge that separates the ball from the board. */
  outline: number;
  /** Small sizes drop the gloss and use fewer, fatter stitches. */
  simple?: boolean;
  id: string;
}

export function football(o: BallOpts): string {
  const L = o.length;
  const h = L * 0.3;
  const body = ballPath(L / 2, h);
  const lace = L * (o.simple ? 0.06 : 0.042);
  const laceLen = L * (o.simple ? 0.26 : 0.3);
  const stitchCount = o.simple ? 3 : 4;
  const stitches = Array.from({ length: stitchCount }, (_, i) => {
    const x = n(((i - (stitchCount - 1) / 2) * laceLen) / stitchCount);
    return `<line x1="${x}" y1="${n(-h * 0.3)}" x2="${x}" y2="${n(h * 0.3)}"/>`;
  }).join("");
  const sx = L * 0.29;
  const stripe = (s: 1 | -1) =>
    `<path d="M ${n(s * sx)} ${n(-h * 1.2)} Q ${n(s * (sx + L * 0.05))} 0 ${n(s * sx)} ${n(h * 1.2)}"/>`;
  const gloss = o.simple
    ? ""
    : `<ellipse cx="${n(-L * 0.06)}" cy="${n(-h * 0.5)}" rx="${n(L * 0.3)}" ry="${n(h * 0.22)}" fill="#fff" opacity="0.16" clip-path="url(#${o.id})"/>`;
  return `<g transform="translate(${n(o.cx)} ${n(o.cy)}) rotate(${o.rotate})">
    <clipPath id="${o.id}"><path d="${body}"/></clipPath>
    <path d="${body}" fill="url(#jx-ball)"/>
    ${gloss}
    <g stroke="#fff" fill="none" stroke-width="${n(L * 0.05)}" clip-path="url(#${o.id})">${stripe(-1)}${stripe(1)}</g>
    <path d="${body}" fill="none" stroke="${P.pitch950}" stroke-width="${o.outline}" stroke-linejoin="round"/>
    <g stroke="#fff" stroke-linecap="round" fill="none">
      <line x1="${n(-laceLen / 2)}" y1="0" x2="${n(laceLen / 2)}" y2="0" stroke-width="${n(lace)}"/>
      <g stroke-width="${n(lace * 0.9)}">${stitches}</g>
    </g>
  </g>`;
}

const defs = `
  <linearGradient id="jx-bg" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="${P.pitch800}"/><stop offset="1" stop-color="${P.pitch950}"/>
  </linearGradient>
  <radialGradient id="jx-glow" cx="0.2" cy="0.05" r="0.9">
    <stop offset="0" stop-color="${P.brand500}" stop-opacity="0.35"/><stop offset="1" stop-color="${P.brand500}" stop-opacity="0"/>
  </radialGradient>
  <linearGradient id="jx-ball" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="${P.gold400}"/><stop offset="1" stop-color="${P.gold500}"/>
  </linearGradient>
  <linearGradient id="jx-tile-hi" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#fff" stop-opacity="0.16"/><stop offset="0.5" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.08"/>
  </linearGradient>
  <filter id="jx-shadow" x="-30%" y="-30%" width="160%" height="160%">
    <feDropShadow dx="0" dy="18" stdDeviation="22" flood-color="#000" flood-opacity="0.45"/>
  </filter>`;

const TILE = 214;
const GAP = 24;
const GRID = TILE * 3 + GAP * 2; // 690
const GRID_X = (CANVAS - GRID) / 2;

interface BoardGeometry {
  tile: number;
  gap: number;
  x0: number;
  radius: number;
}

const FULL_BOARD: BoardGeometry = { tile: TILE, gap: GAP, x0: GRID_X, radius: 44 };
/** Favicon board: at 16px, 4px tiles with 1px gaps on whole pixels (64 canvas units per pixel), so the gaps survive. */
const TINY_BOARD: BoardGeometry = { tile: 256, gap: 64, x0: 64, radius: 48 };

function board(simple: boolean, g: BoardGeometry = FULL_BOARD): string {
  let s = "";
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const x = g.x0 + c * (g.tile + g.gap);
      const y = g.x0 + r * (g.tile + g.gap);
      const fill = (r + c) % 2 ? P.brand600 : P.brand500;
      const rect = `x="${x}" y="${y}" width="${g.tile}" height="${g.tile}" rx="${g.radius}"`;
      s += `<rect ${rect} fill="${fill}"/>`;
      if (!simple) s += `<rect ${rect} fill="url(#jx-tile-hi)"/>`;
    }
  }
  return s;
}

/** The mark (board + ball) on a transparent 1024 canvas, scaled about the center. */
function mark(scale: number, simple = false): string {
  const ball = football({
    cx: CENTER,
    cy: CENTER,
    length: 620,
    rotate: -35,
    outline: simple ? 30 : 24,
    simple,
    id: "jx-ball-clip",
  });
  const shadowed = simple ? ball : `<g filter="url(#jx-shadow)">${ball}</g>`;
  return `<g transform="translate(${n(CENTER * (1 - scale))} ${n(CENTER * (1 - scale))}) scale(${scale})">${board(simple)}${shadowed}</g>`;
}

function svg(size: number, body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CANVAS} ${CANVAS}" width="${size}" height="${size}"><defs>${defs}</defs>${body}</svg>`;
}

const background = (radius: number) =>
  `<rect width="${CANVAS}" height="${CANVAS}" rx="${radius}" fill="url(#jx-bg)"/><rect width="${CANVAS}" height="${CANVAS}" rx="${radius}" fill="url(#jx-glow)"/>`;

export type IconShape =
  /** Full-bleed square. iOS, Android adaptive and apple-touch-icon apply their own mask. */
  | "square"
  /** Pre-rounded with transparent corners, for browsers and desktop installs. */
  | "rounded"
  /** Full-bleed with the mark inside the 80% safe zone of a PWA maskable icon. */
  | "maskable";

export function iconSvg(shape: IconShape, size = CANVAS): string {
  const radius = shape === "rounded" ? CANVAS * ICON_RADIUS : 0;
  return svg(size, background(radius) + mark(shape === "maskable" ? 0.8 : 1));
}

/** Tab-sized icon: same composition, no gloss or soft shadow, fatter strokes, board snapped to whole pixels at 16/32px. */
export function faviconSvg(size = 32): string {
  if (size > 32) return svg(size, background(CANVAS * ICON_RADIUS) + mark(1.08, true));
  const ball = football({ cx: CENTER, cy: CENTER, length: 700, rotate: -35, outline: 72, simple: true, id: "jx-ball-tiny" });
  return svg(size, background(CANVAS * 0.19) + board(true, TINY_BOARD) + ball);
}

/** The mark alone on transparent, for in-app headers and the splash screen. */
export function markSvg(size = CANVAS): string {
  return svg(size, mark(1));
}

/** Just the football, on transparent. */
export function ballSvg(size = CANVAS): string {
  return svg(size, `<g filter="url(#jx-shadow)">${football({ cx: CENTER, cy: CENTER, length: 860, rotate: -35, outline: 30, id: "jx-ball-only" })}</g>`);
}

/** Monochrome notification badge (Android status bar): white football on transparent. */
export function badgeSvg(size = 96): string {
  const L = 860;
  const h = L * 0.3;
  const body = ballPath(L / 2, h);
  const laceLen = L * 0.28;
  const lace = L * 0.07;
  const stitches = [-1, 0, 1]
    .map((i) => `<line x1="${n((i * laceLen) / 3)}" y1="${n(-h * 0.32)}" x2="${n((i * laceLen) / 3)}" y2="${n(h * 0.32)}"/>`)
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CANVAS} ${CANVAS}" width="${size}" height="${size}">
  <mask id="m"><rect width="${CANVAS}" height="${CANVAS}" fill="#fff"/>
    <g transform="translate(${CENTER} ${CENTER}) rotate(-35)" stroke="#000" stroke-linecap="round" fill="none">
      <line x1="${n(-laceLen / 2)}" y1="0" x2="${n(laceLen / 2)}" y2="0" stroke-width="${n(lace)}"/>
      <g stroke-width="${n(lace * 0.9)}">${stitches}</g>
    </g>
  </mask>
  <g mask="url(#m)"><path transform="translate(${CENTER} ${CENTER}) rotate(-35)" d="${body}" fill="#fff"/></g>
</svg>`;
}

/** Launch image: the mark centered on the app's own background so the hand-off to the web view is seamless. */
export function splashSvg(size = 2732): string {
  const S = 2732;
  const markSize = 600;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}" width="${size}" height="${size}">
  <defs>
    <radialGradient id="s-green" cx="0.5" cy="0.3" r="0.45"><stop offset="0" stop-color="${P.brand500}" stop-opacity="0.16"/><stop offset="1" stop-color="${P.brand500}" stop-opacity="0"/></radialGradient>
    <radialGradient id="s-sky" cx="0.9" cy="0.4" r="0.4"><stop offset="0" stop-color="${P.accent400}" stop-opacity="0.08"/><stop offset="1" stop-color="${P.accent400}" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="${S}" height="${S}" fill="${P.pitch950}"/>
  <rect width="${S}" height="${S}" fill="url(#s-green)"/>
  <rect width="${S}" height="${S}" fill="url(#s-sky)"/>
  <g transform="translate(${(S - markSize) / 2} ${(S - markSize) / 2})">${markSvg(markSize)}</g>
</svg>`;
}
