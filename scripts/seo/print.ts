// HTML for the printable templates (scripts/seo/printables.ts prints them to
// PDF with Chromium). Ink-light on purpose: white paper, grey rules, one touch
// of brand color. Every sheet has team lines, blank number boxes, lines for a
// square price and prizes, and a QR code to run the board live instead.

import { encodeQr, isDark } from "../../src/features/invite/qr.ts";
import { esc } from "./blocks.ts";
import { PRINT_QR_LABEL, PRINT_QR_URL } from "./site.ts";

export type SheetKind = "board-10x10-letter" | "board-10x10-a4" | "board-5x5" | "prize-sheet" | "basketball-10x10-letter";

export interface SheetAssets {
  /** data: URLs for the woff2 fonts. */
  fonts: { display: string; body: string };
  /** The app icon SVG (public/icons/icon.svg). */
  icon: string;
  /** Jax, sitting (static SVG from Jax.tsx). */
  jax: string;
}

interface Paper {
  /** Inches. */
  width: number;
  height: number;
}

const LETTER_LANDSCAPE: Paper = { width: 11, height: 8.5 };
const LETTER_PORTRAIT: Paper = { width: 8.5, height: 11 };
const A4_LANDSCAPE: Paper = { width: 11.69, height: 8.27 };
const MARGIN = 0.45;

export const SHEETS: Record<SheetKind, { paper: Paper; file: string; title: string }> = {
  "board-10x10-letter": { paper: LETTER_LANDSCAPE, file: "football-squares-10x10-letter", title: "Football squares board (10×10, Letter)" },
  "board-10x10-a4": { paper: A4_LANDSCAPE, file: "football-squares-10x10-a4", title: "Football squares board (10×10, A4)" },
  "board-5x5": { paper: LETTER_LANDSCAPE, file: "football-squares-5x5", title: "Football squares board (5×5)" },
  "prize-sheet": { paper: LETTER_PORTRAIT, file: "football-squares-prize-sheet", title: "Football squares quarters prize sheet" },
  "basketball-10x10-letter": { paper: LETTER_LANDSCAPE, file: "basketball-squares-10x10-letter", title: "Basketball squares board (10×10, Letter)" },
};

const INK = "#0f1a14";
const RULE = "#8c9890";
const SOFT = "#5b6b61";
const FILL = "#eef2ec";
const BRAND = "#4a6e00";

/** The QR code as crisp square modules (no rounding: it has to scan off a cheap printer). */
export function qrSvg(value: string, sizeIn: number): string {
  const qr = encodeQr(value);
  const quiet = 2;
  const span = qr.size + quiet * 2;
  let d = "";
  for (let y = 0; y < qr.size; y++) {
    let x = 0;
    while (x < qr.size) {
      if (!isDark(qr, x, y)) {
        x++;
        continue;
      }
      const start = x;
      while (x < qr.size && isDark(qr, x, y)) x++;
      d += `M${start + quiet} ${y + quiet}h${x - start}v1h${start - x}z`;
    }
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${span} ${span}" width="${sizeIn}in" height="${sizeIn}in" role="img" aria-label="QR code for ${esc(PRINT_QR_LABEL)}">` +
    `<rect width="${span}" height="${span}" fill="#fff"/><path d="${d}" fill="${INK}" shape-rendering="crispEdges"/></svg>`
  );
}

function css(paper: Paper, a: SheetAssets): string {
  return `
@font-face{font-family:"Bricolage";src:url(${a.fonts.display}) format("woff2");font-weight:200 800}
@font-face{font-family:"Figtree";src:url(${a.fonts.body}) format("woff2");font-weight:300 900}
@page{size:${paper.width}in ${paper.height}in;margin:0}
:root{--color-line-strong:#d5ddd5}
*{box-sizing:border-box}
html,body{margin:0;background:#fff;color:${INK};-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{font:400 10pt/1.35 Figtree,system-ui,sans-serif}
.sheet{width:${paper.width}in;height:${paper.height}in;padding:${MARGIN}in;display:flex;flex-direction:column;overflow:hidden}
.head{display:flex;align-items:flex-end;justify-content:space-between;gap:.3in;padding-bottom:.12in;border-bottom:1.5pt solid ${INK};margin-bottom:.2in}
h1{font:800 25pt/1 Bricolage,Figtree,sans-serif;font-variation-settings:"opsz" 96;letter-spacing:-.02em;margin:0}
h1 span{color:${BRAND}}
.brand{display:flex;align-items:center;gap:.08in;font:800 13pt/1 Bricolage,Figtree,sans-serif;font-variation-settings:"opsz" 96;letter-spacing:-.02em;white-space:nowrap}
.brand svg{width:.36in;height:.36in;border-radius:.08in}
.brand b span{color:${BRAND}}
.label{font-size:7.5pt;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:${SOFT}}
.line{display:flex;align-items:flex-end;gap:.08in;min-height:.3in}
.line .label{flex:none;padding-bottom:1pt}
.line i{flex:1;border-bottom:.75pt solid ${RULE};height:.3in}
.body{flex:1;display:flex;gap:.3in;min-height:0}
.panel{display:flex;flex-direction:column;gap:.12in;min-width:0}
.pair-lines{display:grid;grid-template-columns:1.3fr 1fr;gap:0 .18in}
.box{border:.75pt solid ${RULE};border-radius:.08in;padding:.08in .12in .1in}
.box h2{font:800 9pt/1.2 Figtree,sans-serif;letter-spacing:.06em;text-transform:uppercase;margin:0 0 .02in}
.qr{display:flex;align-items:center;gap:.14in;margin-top:auto}
.qr svg{flex:none}
.qr p{margin:0;font-size:9pt;line-height:1.3}
.qr strong{display:block;font:800 11pt/1.2 Figtree,sans-serif;margin-bottom:2pt}
.fine{font-size:7pt;color:${SOFT};margin:.06in 0 0;line-height:1.35}
table.grid{border-collapse:collapse;table-layout:fixed}
table.grid td{border:.75pt solid ${RULE};padding:0}
table.grid td.n{background:${FILL};border-color:${INK};border-width:1pt}
table.grid td.c0{background:#fff;border:0}
table.grid .pair{display:flex;height:100%}
table.grid .pair span{flex:1}
table.grid .pair span+span{border-left:.75pt dashed ${RULE}}
.team{font-size:7.5pt;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:${SOFT};white-space:nowrap}
.team-line{display:flex;align-items:flex-end;gap:.08in}
.team-line i{flex:1;border-bottom:.75pt solid ${RULE};height:.26in}
.side{position:relative}
.side .team-line{position:absolute;left:0;transform:rotate(-90deg);transform-origin:top left}
.winners{border-collapse:collapse;width:100%;font-size:8.5pt}
.winners th{text-align:left;font-size:7pt;letter-spacing:.06em;text-transform:uppercase;color:${SOFT};font-weight:800;padding:0 0 2pt}
.winners td{border-bottom:.75pt solid ${RULE};height:.27in;padding:0 .04in 0 0;font-weight:800;vertical-align:bottom}
.steps{margin:0;padding-left:1.1em;font-size:8.5pt;line-height:1.3}
.steps li+li{margin-top:2pt}
.jax{width:.62in;height:auto;flex:none}`
    .replace(/\n/g, "");
}

const head = (title: string, a: SheetAssets) =>
  `<div class="head"><h1>${title}</h1><div class="brand">${a.icon}<b>Jax<span>Squares</span></b></div></div>`;

const line = (label: string) => `<div class="line"><span class="label">${label}</span><i></i></div>`;

/** Lines for the square price and each period's prize. */
function amounts(): string {
  return (
    `<div class="box">${line("Square price")}` +
    `<h2 style="margin-top:.08in">Prizes</h2>${["Q1", "Half", "Q3", "Final"].map((p) => line(p)).join("")}</div>`
  );
}

function qrBlock(a: SheetAssets, sizeIn = 0.9, wide = false): string {
  const more = wide ? `<br>Everyone picks on their own phone and every score shows the winner.` : "";
  return (
    `<div class="qr">${qrSvg(PRINT_QR_URL, sizeIn)}<p><strong>Run this board live</strong>${esc(PRINT_QR_LABEL)}${more}</p>` +
    `${a.jax.replace(/class="[^"]*"/, 'class="jax"')}</div>` +
    `<p class="fine">Free to print and share. JaxSquares never collects or sends money; any square price or prizes are for your group to settle among yourselves.</p>`
  );
}

/** The squares grid: a header row and column of blank number boxes (two per box on 5x5) and the playing squares. */
function grid(n: 5 | 10, boardIn: number): string {
  const band = 0.34;
  const gridIn = boardIn - band;
  const cell = gridIn / (n + 1);
  const numberBox = n === 5 ? `<div class="pair"><span></span><span></span></div>` : "";
  let rows = `<tr><td class="c0" style="width:${cell}in;height:${cell}in"></td>`;
  for (let c = 0; c < n; c++) rows += `<td class="n" style="width:${cell}in">${numberBox}</td>`;
  rows += `</tr>`;
  for (let r = 0; r < n; r++) {
    rows += `<tr><td class="n" style="height:${cell}in">${n === 5 ? `<div class="pair" style="flex-direction:column"><span></span><span style="border-left:0;border-top:.75pt dashed ${RULE}"></span></div>` : ""}</td>`;
    for (let c = 0; c < n; c++) rows += `<td style="height:${cell}in"></td>`;
    rows += `</tr>`;
  }
  return (
    `<div style="display:grid;grid-template-columns:${band}in ${gridIn}in;grid-template-rows:${band}in ${gridIn}in;width:${boardIn}in;height:${boardIn}in;flex:none">` +
    `<div></div><div class="team-line" style="padding:0 0 .07in ${cell}in"><span class="team">Team across the top</span><i></i></div>` +
    `<div class="side"><div class="team-line" style="top:${gridIn}in;width:${gridIn}in;height:${band}in;padding:0 ${cell}in .07in 0"><span class="team">Team down the side</span><i></i></div></div>` +
    `<table class="grid">${rows}</table></div>`
  );
}

function boardSheet(kind: SheetKind, a: SheetAssets): string {
  const { paper } = SHEETS[kind];
  const n = kind === "board-5x5" ? 5 : 10;
  const hoops = kind === "basketball-10x10-letter";
  const headIn = 0.62;
  const contentW = paper.width - MARGIN * 2;
  const boardIn = Math.min(paper.height - MARGIN * 2 - headIn, contentW - 2.75 - 0.3);
  const winners =
    `<div class="box"><h2>Winners</h2><table class="winners"><tr><th style="width:.5in"></th><th style="width:.75in">Score</th><th>Name</th></tr>` +
    ["Q1", "Half", "Q3", "Final"].map((p) => `<tr><td>${p}</td><td></td><td></td></tr>`).join("") +
    `</table></div>`;
  const how =
    `<div class="box"><h2>How to play</h2><ol class="steps">` +
    `<li>Write your name in the squares you want.</li>` +
    `<li>When the board is full, draw 0–9 at random for the boxes across the top, then again down the side${n === 5 ? " (two digits per box)" : ""}.</li>` +
    `<li>At the end of each quarter, the square matching the last digit of each team's score wins.</li></ol></div>`;
  // Men's college games are two halves: say which lines they use.
  const halves = `<p class="fine" style="margin:0">Playing two halves (men's college)? Use the Half and Final lines. Overtime counts toward the final.</p>`;
  return (
    `<div class="sheet">${head(n === 5 ? `Football squares <span>5×5</span>` : hoops ? `Basketball <span>squares</span>` : `Football <span>squares</span>`, a)}` +
    `<div class="body">${grid(n, boardIn)}<div class="panel" style="flex:1">` +
    `<div class="pair-lines">${line("Game")}${line("Date")}</div>${amounts()}${winners}${n === 5 ? how : ""}${hoops ? halves : ""}${qrBlock(a)}</div></div></div>`
  );
}

function prizeSheet(a: SheetAssets): string {
  const periods = [
    ["Q1", "End of the 1st quarter"],
    ["Half", "Halftime"],
    ["Q3", "End of the 3rd quarter"],
    ["Final", "Final score (overtime counts)"],
  ];
  const rows = periods
    .map(
      ([short, long]) =>
        `<div class="box" style="padding:.1in .14in .12in"><div style="display:flex;align-items:baseline;gap:.1in"><h2 style="font-size:12pt;letter-spacing:0;text-transform:none">${short}</h2><span class="label">${long}</span></div>` +
        `<div style="display:grid;grid-template-columns:1fr 1fr;gap:0 .25in">${line("Prize")}${line("Score")}${line("Winning numbers")}${line("Winner")}</div></div>`,
    )
    .join("");
  const notes = Array.from({ length: 6 }, () => `<div class="line"><i></i></div>`).join("");
  return (
    `<div class="sheet">${head(`Quarters <span>prize sheet</span>`, a)}` +
    `<div style="display:grid;grid-template-columns:1fr 1fr;gap:0 .25in">${line("Game")}${line("Date")}${line("Team across the top")}${line("Team down the side")}</div>` +
    `<div class="box" style="margin-top:.14in">${line("Square price")}${line("Prizes")}</div>` +
    `<div style="display:flex;flex-direction:column;gap:.1in;margin-top:.14in">${rows}</div>` +
    `<div class="box" style="margin-top:.14in"><h2>Notes</h2>${notes}</div>` +
    `<div style="margin-top:auto;padding-top:.14in">${qrBlock(a, 0.85, true)}</div></div>`
  );
}

export function sheetHtml(kind: SheetKind, a: SheetAssets): string {
  const { paper, title } = SHEETS[kind];
  const body = kind === "prize-sheet" ? prizeSheet(a) : boardSheet(kind, a);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${css(paper, a)}</style></head><body>${body}</body></html>`;
}
