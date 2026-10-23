// Small HTML building blocks for the landing pages' content (scripts/seo/content.ts).
// Each returns a string of static HTML; the page template (render.ts) styles them.

import { PRINTABLES, SHOT_SIZE, SHOTS, type Printable, type ShotKey } from "./site.ts";

/** Escape text for HTML element content and attribute values. */
export function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Internal link to another landing page (or app path, with a leading slash). */
export function link(to: string, text: string): string {
  const href = to.startsWith("/") ? to : `/${to}`;
  return `<a href="${href}">${text}</a>`;
}

/** Paragraphs from blank-line-separated text (already HTML). */
export function paras(html: string): string {
  return html
    .trim()
    .split(/\n\s*\n/)
    .map((p) => `<p>${p.trim().replace(/\s*\n\s*/g, " ")}</p>`)
    .join("\n");
}

/** A list with volt-square bullets. Items are HTML; "Title: rest" bolds the title. */
export function ticks(items: string[]): string {
  return `<ul class="ticks">${items.map((i) => `<li>${boldLead(i)}</li>`).join("")}</ul>`;
}

/** Numbered steps: [title, body] pairs. */
export function steps(items: [string, string][]): string {
  return `<ol class="steps">${items
    .map(([title, body], i) => `<li><span class="step-n" aria-hidden="true">${i + 1}</span><div><h3>${title}</h3><p>${body}</p></div></li>`)
    .join("")}</ol>`;
}

/** Feature cards: [title, body] pairs. */
export function features(items: [string, string][]): string {
  return `<div class="features">${items.map(([title, body]) => `<div class="card feature"><h3>${title}</h3><p>${body}</p></div>`).join("")}</div>`;
}

/** Definition-style rows: [term, description] pairs. */
export function terms(items: [string, string][]): string {
  return `<dl class="terms">${items.map(([t, d]) => `<div><dt>${t}</dt><dd>${d}</dd></div>`).join("")}</dl>`;
}

/** A simple table; the first column is a row header. */
export function table(caption: string, head: string[], rows: string[][]): string {
  const th = head.map((h) => `<th scope="col">${h}</th>`).join("");
  const tr = rows.map(([first, ...rest]) => `<tr><th scope="row">${first}</th>${rest.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("");
  return `<div class="table-wrap"><table><caption>${caption}</caption><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table></div>`;
}

export function callout(html: string): string {
  return `<div class="callout">${html}</div>`;
}

/** App screenshots in a grid, lazy-loaded with their intrinsic size set. */
export function shots(keys: ShotKey[]): string {
  const figs = keys
    .map((k) => {
      const s = SHOTS[k];
      return (
        `<figure class="shot"><img src="${s.src}" width="${SHOT_SIZE.width}" height="${SHOT_SIZE.height}" loading="lazy" decoding="async" alt="${esc(s.alt)}">` +
        `<figcaption>${esc(s.caption)}</figcaption></figure>`
      );
    })
    .join("");
  return `<div class="shots shots-${keys.length}">${figs}</div>`;
}

/** The two calls to action, as on every page. */
export function ctas(primary = "Make a board"): string {
  return (
    `<div class="ctas"><a class="btn" href="/new">${primary}</a>` +
    `<a class="btn btn-2" href="/">Join with a code</a></div>`
  );
}

/** The printable templates for one game as download cards. `sizes`: PDF size label per id ("62 KB"), when known. */
export function printableCards(sizes: Record<string, string> = {}, sport: Printable["sport"] = "football"): string {
  return `<div class="printables">${PRINTABLES.filter((p) => p.sport === sport).map((p) => {
    const size = sizes[p.id] ? ` · ${sizes[p.id]}` : "";
    return (
      `<div class="card printable"><a class="thumb" href="${p.href}" aria-hidden="true" tabindex="-1">` +
      `<img src="${p.thumb}" width="${p.thumbSize.width}" height="${p.thumbSize.height}" loading="lazy" decoding="async" alt=""></a>` +
      `<div class="printable-body"><h3>${esc(p.name)}</h3><p class="meta">${esc(p.paper)} · PDF${size}</p><p>${esc(p.blurb)}</p>` +
      `<a class="btn btn-2 btn-sm" href="${p.href}" download aria-label="Download the ${esc(p.name)}, ${esc(p.paper)} (PDF)">Download PDF</a></div></div>`
    );
  }).join("")}</div>`;
}

/** "Title: rest" -> "<strong>Title:</strong> rest" when the text starts with a short lead-in. */
function boldLead(html: string): string {
  const m = /^([^:<]{2,48}):\s/.exec(html);
  return m ? `<strong>${m[1]}:</strong> ${html.slice(m[0].length)}` : html;
}

// ---- The board diagram ----

/** Player colors (the app's seed friends) for claimed squares. */
const PLAYER_COLORS = ["#ff6b6b", "#4dabf7", "#ffd43b", "#69db7c", "#da77f2", "#ffa94d", "#63e6be", "#ff66a6"];
const TEAM_X = { name: "Hawks", color: "#3ab7ff" };
const TEAM_Y = { name: "Wolves", color: "#ff66a6" };
/** A fixed "draw", so the diagram and its caption always agree. */
const DRAW_X = [3, 8, 0, 6, 1, 9, 4, 7, 2, 5];
const DRAW_Y = [5, 2, 9, 4, 0, 7, 1, 8, 3, 6];

export interface BoardDiagramOptions {
  /** Unique within the page (ids for the title). */
  id: string;
  /** Last digit of the team across the top / down the side that wins. */
  win: { x: number; y: number };
  /** Tint the winning row and column and ring their numbers. */
  guide?: boolean;
  /** What the top and side stand for, when not the teams (a soccer board's minute ones and tens). */
  bands?: { x: string; y: string };
  title: string;
}

/** Deterministic 0..1 noise per cell, so the diagram is identical on every build. */
function noise(r: number, c: number): number {
  const v = Math.sin(r * 127.1 + c * 311.7) * 43758.5453;
  return v - Math.floor(v);
}

/**
 * A 10x10 squares board as inline SVG: Hawks across the top, Wolves down the
 * side, digits drawn, most squares claimed (a friend's color in each) and the
 * winning square lit gold. Colors come from the page's theme tokens.
 */
export function boardDiagram({ id, win, guide = false, bands, title }: BoardDiagramOptions): string {
  const n = 10;
  const cell = 26;
  const gap = 3;
  const band = 20;
  const span = (n + 1) * cell + n * gap;
  const size = band + span;
  const at = (i: number) => band + i * (cell + gap);
  const winCol = DRAW_X.indexOf(win.x) + 1;
  const winRow = DRAW_Y.indexOf(win.y) + 1;
  const parts: string[] = [];

  // Team names (or the bands' names): across the top and down the side.
  const mid = band + cell + gap + (span - cell - gap) / 2;
  const [top, side] = bands ? [bands.x, bands.y] : [TEAM_X.name, TEAM_Y.name];
  parts.push(`<text class="bd-team bd-tx" x="${mid}" y="14" text-anchor="middle">${esc(top.toUpperCase())}</text>`);
  parts.push(
    `<text class="bd-team bd-ty" x="0" y="0" text-anchor="middle" transform="translate(14 ${mid}) rotate(-90)">${esc(side.toUpperCase())}</text>`,
  );

  parts.push(`<rect class="bd-corner" x="${at(0)}" y="${at(0)}" width="${cell}" height="${cell}" rx="6"/>`);
  for (let i = 1; i <= n; i++) {
    const ring = guide && i === winCol ? ` class="bd-ring"` : "";
    parts.push(`<rect x="${at(i)}" y="${at(0)}" width="${cell}" height="${cell}" rx="6" fill="${TEAM_X.color}"${ring}/>`);
    parts.push(`<text class="bd-num" x="${at(i) + cell / 2}" y="${at(0) + 18}" text-anchor="middle">${DRAW_X[i - 1]}</text>`);
    const ringY = guide && i === winRow ? ` class="bd-ring"` : "";
    parts.push(`<rect x="${at(0)}" y="${at(i)}" width="${cell}" height="${cell}" rx="6" fill="${TEAM_Y.color}"${ringY}/>`);
    parts.push(`<text class="bd-num" x="${at(0) + cell / 2}" y="${at(i) + 18}" text-anchor="middle">${DRAW_Y[i - 1]}</text>`);
  }

  // The playing squares: one rect filled with a tile pattern, then a dot in a friend's color per claimed square.
  const pitch = cell + gap;
  parts.push(
    `<defs><pattern id="${id}-sq" x="${at(1)}" y="${at(1)}" width="${pitch}" height="${pitch}" patternUnits="userSpaceOnUse">` +
      `<rect class="bd-cell" x=".5" y=".5" width="${cell - 1}" height="${cell - 1}" rx="6"/></pattern></defs>` +
      `<rect x="${at(1)}" y="${at(1)}" width="${n * pitch}" height="${n * pitch}" fill="url(#${id}-sq)"/>`,
  );
  parts.push(`<rect class="bd-win" x="${at(winCol)}" y="${at(winRow)}" width="${cell}" height="${cell}" rx="6"/>`);
  for (let r = 1; r <= n; r++) {
    for (let c = 1; c <= n; c++) {
      const isWin = r === winRow && c === winCol;
      if (!isWin && noise(r, c) >= 0.74) continue;
      const color = PLAYER_COLORS[Math.floor(noise(c, r) * PLAYER_COLORS.length)];
      parts.push(`<circle cx="${at(c) + cell / 2}" cy="${at(r) + cell / 2}" r="${isWin ? 8 : 7}" fill="${color}"${isWin ? ' class="bd-winner"' : ""}/>`);
    }
  }

  if (guide) {
    // The row and column the score points along, meeting at the winner.
    parts.push(`<rect class="bd-guide" x="${at(1)}" y="${at(winRow) - 1}" width="${at(winCol) - at(1) + cell}" height="${cell + 2}" rx="7"/>`);
    parts.push(`<rect class="bd-guide" x="${at(winCol) - 1}" y="${at(1)}" width="${cell + 2}" height="${at(winRow) - at(1) + cell}" rx="7"/>`);
  }

  return (
    `<svg class="bd" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-labelledby="${id}-t">` +
    `<title id="${id}-t">${esc(title)}</title>${parts.join("")}</svg>`
  );
}
