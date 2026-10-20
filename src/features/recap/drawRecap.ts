// Paints a recap layout (recapModel.ts) on a 1080×1350 canvas and hands back
// the PNG. Text is set in the brand fonts the page already loads (Bricolage
// Grotesque for the score and the headline, Figtree for the rest): each weight
// the card uses is asked for with document.fonts.load, then document.fonts.ready.
// Jax is his cheer pose from the UI kit, serialized to SVG with the kit's
// theme colors swapped for the card's fixed ones and drawn as an image.

import { createElement } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { Jax } from "../../components/ui/Jax";
import type { RecapFont, RecapLayout, RecapOp } from "./recapModel";

const FAMILY: Record<RecapFont["family"], string> = {
  display: '"Bricolage Grotesque Variable", "Figtree Variable", system-ui, sans-serif',
  sans: '"Figtree Variable", system-ui, -apple-system, sans-serif',
};

/** A canvas font shorthand: `800 44px "Bricolage Grotesque Variable", …`. */
export function fontOf(font: RecapFont, weight = font.weight): string {
  return `${weight} ${font.size}px ${FAMILY[font.family]}`;
}

/** The kit's theme colors in Jax's art, as the card shows them (its own dark design). */
const JAX_COLORS: Record<string, string> = {
  "brand-400": "#c6f91f",
  "gold-400": "#ffc233",
  "accent-400": "#ff66a6",
  "line-strong": "rgba(255, 255, 255, 0.18)",
  "ink-subtle": "#768d7f",
  "surface-3": "#16211b",
  "surface-4": "#1b281f",
};

/** Jax cheering as standalone SVG markup at `width` px, with fixed colors in place of the theme's. */
export function jaxSvgMarkup(width: number): string {
  const host = document.createElement("div");
  const root = createRoot(host);
  flushSync(() => root.render(createElement(Jax, { pose: "cheer", size: width })));
  const markup = host.innerHTML;
  root.unmount();
  return markup
    .replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"')
    .replace(/var\(--color-([a-z0-9-]+)\)/g, (_, name: string) => JAX_COLORS[name] ?? "#ffffff");
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Couldn't draw Jax"));
    img.src = src;
  });
}

/** Every font (family, weight, size) the card sets text in, loaded before drawing. */
async function loadFonts(layout: RecapLayout): Promise<void> {
  const fonts = typeof document === "undefined" ? undefined : document.fonts;
  if (!fonts) return;
  const specs = new Set<string>();
  for (const op of layout.ops) {
    if (op.kind === "text") specs.add(fontOf(op.font));
    if (op.kind === "runs") for (const run of op.runs) specs.add(fontOf(op.font, run.weight ?? op.font.weight));
  }
  await Promise.all([...specs].map((spec) => fonts.load(spec, "JaxSquares 0123456789").catch(() => [])));
  await fonts.ready;
}

/** "#c6f91f" at `alpha` as rgba(); anything else as it is. */
function withAlpha(color: string, alpha: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(color);
  if (!m) return color;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") {
    ctx.roundRect(x, y, w, h, r);
    return;
  }
  const rr = Math.min(r, w / 2, h / 2);
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** `text` cut with "…" to fit `maxWidth` in the context's current font. */
function fit(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  const chars = Array.from(text);
  let lo = 0;
  let hi = chars.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (ctx.measureText(`${chars.slice(0, mid).join("").trimEnd()}…`).width <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return `${chars.slice(0, lo).join("").trimEnd()}…`;
}

function setTracking(ctx: CanvasRenderingContext2D, px: number): void {
  // Letter spacing where the canvas has it (Chrome, Safari 18); plain text elsewhere.
  if ("letterSpacing" in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${px}px`;
}

function draw(ctx: CanvasRenderingContext2D, op: RecapOp, jax: HTMLImageElement | null): void {
  switch (op.kind) {
    case "rect":
      roundRect(ctx, op.x, op.y, op.w, op.h, op.r);
      ctx.fillStyle = op.fill;
      ctx.fill();
      if (op.stroke) {
        ctx.lineWidth = 2;
        ctx.strokeStyle = op.stroke;
        ctx.stroke();
      }
      return;
    case "circle":
      ctx.beginPath();
      ctx.arc(op.cx, op.cy, op.r, 0, Math.PI * 2);
      ctx.fillStyle = op.fill;
      ctx.fill();
      return;
    case "line":
      ctx.beginPath();
      ctx.moveTo(op.x1, op.y1);
      ctx.lineTo(op.x2, op.y2);
      ctx.lineWidth = op.width;
      ctx.strokeStyle = op.color;
      ctx.stroke();
      return;
    case "text": {
      ctx.font = fontOf(op.font);
      ctx.fillStyle = op.color;
      ctx.textAlign = op.align;
      setTracking(ctx, op.tracking ?? 0);
      ctx.fillText(op.maxWidth ? fit(ctx, op.text, op.maxWidth) : op.text, op.x, op.y);
      setTracking(ctx, 0);
      return;
    }
    case "runs": {
      const widths = op.runs.map((run) => {
        ctx.font = fontOf(op.font, run.weight ?? op.font.weight);
        return ctx.measureText(run.text).width;
      });
      const total = widths.reduce((a, b) => a + b, 0);
      let x = op.align === "left" ? op.x : op.align === "right" ? op.x - total : op.x - total / 2;
      ctx.textAlign = "left";
      op.runs.forEach((run, i) => {
        ctx.font = fontOf(op.font, run.weight ?? op.font.weight);
        ctx.fillStyle = run.color;
        ctx.fillText(run.text, x, op.y);
        x += widths[i];
      });
      return;
    }
    case "jax":
      if (jax) ctx.drawImage(jax, op.x, op.y, op.w, op.h);
      return;
  }
}

/** The card as a PNG. Throws when the browser can't make one (no canvas). */
export async function renderRecap(layout: RecapLayout): Promise<Blob> {
  await loadFonts(layout);
  const canvas = document.createElement("canvas");
  canvas.width = layout.width;
  canvas.height = layout.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser can't draw the recap.");

  // Night turf, each team's color as a floodlight in its corner.
  const { top, bottom, glowX, glowY } = layout.background;
  const turf = ctx.createLinearGradient(0, 0, 0, layout.height);
  turf.addColorStop(0, top);
  turf.addColorStop(1, bottom);
  ctx.fillStyle = turf;
  ctx.fillRect(0, 0, layout.width, layout.height);
  for (const [x, color] of [
    [-120, glowX],
    [layout.width + 120, glowY],
  ] as const) {
    const glow = ctx.createRadialGradient(x, -160, 0, x, -160, 820);
    glow.addColorStop(0, withAlpha(color, 0.42));
    glow.addColorStop(1, withAlpha(color, 0));
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, layout.width, layout.height);
  }

  const jaxOp = layout.ops.find((op): op is Extract<RecapOp, { kind: "jax" }> => op.kind === "jax");
  const jax = jaxOp
    ? await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(jaxSvgMarkup(jaxOp.w))}`).catch(() => null)
    : null;
  ctx.textBaseline = "alphabetic";
  for (const op of layout.ops) draw(ctx, op, jax);

  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("This browser can't save the recap."))), "image/png"),
  );
}
