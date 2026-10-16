// 1200x630 link-preview card served as /og-image.png. The worker swaps in the
// board's own title and description per invite, so the art stays generic: a
// friendly invitation plus a live-looking board.

import { ballSvg, iconSvg, palette as P } from "./art.ts";

const PLAYER_COLORS = ["#38bdf8", "#22c55e", "#f59e0b", "#f472b6", "#a78bfa", "#fb7185", "#2dd4bf", "#facc15"];
const INITIALS = ["JT", "MK", "AR", "SL", "DB", "CJ", "PW", "EM", "TN", "KO", "RH", "BG"];
const COLS = [7, 2, 9, 0, 4, 1, 8, 3, 6, 5];
const ROWS = [3, 8, 0, 5, 1, 9, 6, 2, 7, 4];
const WINNER = { row: 3, col: 6 };

/** Deterministic pseudo-random so re-rendering produces the same board. */
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

function boardRows(): string {
  const rand = rng(42);
  let html = "";
  for (let r = 0; r < 10; r++) {
    html += `<div class="hy">${ROWS[r]}</div>`;
    for (let c = 0; c < 10; c++) {
      const winner = r === WINNER.row && c === WINNER.col;
      const claimed = rand() < 0.72;
      const who = Math.floor(rand() * INITIALS.length);
      if (winner) {
        html += `<div class="cell win">JT</div>`;
      } else if (claimed) {
        html += `<div class="cell" style="--c:${PLAYER_COLORS[who % PLAYER_COLORS.length]}">${INITIALS[who]}</div>`;
      } else {
        html += `<div class="cell open"></div>`;
      }
    }
  }
  return html;
}

/** Design-system fonts as data URLs (the generator reads them from node_modules); Inter is the fallback. */
export interface OgFonts {
  display?: string;
  body?: string;
}

export function ogHtml(fonts: OgFonts = {}): string {
  const face = (family: string, url: string | undefined, extra: string) =>
    url ? `@font-face { font-family: "${family}"; src: url(${url}) format("woff2"); ${extra} }` : "";
  const digits = (list: number[], cls: string) => list.map((d) => `<div class="${cls}">${d}</div>`).join("");
  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
  ${face("JX Display", fonts.display, "font-weight: 200 800; font-stretch: 75% 100%;")}
  ${face("JX Body", fonts.body, "font-weight: 300 900;")}
  * { box-sizing: border-box; margin: 0; }
  html, body { width: 1200px; height: 630px; overflow: hidden; }
  body {
    font-family: "JX Display", "Inter Display", "Inter", system-ui, sans-serif;
    color: ${P.ink};
    background:
      radial-gradient(700px 420px at 8% -10%, rgba(34,197,94,.28), transparent 65%),
      radial-gradient(640px 520px at 100% 30%, rgba(56,189,248,.16), transparent 60%),
      linear-gradient(180deg, ${P.pitch900}, ${P.pitch950});
    position: relative;
  }
  .left { position: absolute; left: 72px; top: 64px; width: 560px; }
  .lockup { display: flex; align-items: center; gap: 16px; }
  .lockup svg { width: 64px; height: 64px; filter: drop-shadow(0 6px 14px rgba(0,0,0,.45)); }
  .word { font-weight: 800; font-size: 38px; letter-spacing: -0.025em; }
  .word b { color: ${P.brand400}; font-weight: 800; }
  h1 { margin-top: 48px; font-weight: 800; font-size: 78px; line-height: 0.96; letter-spacing: -0.035em; }
  h1 em { font-style: normal; color: ${P.gold400}; }
  p { margin-top: 26px; font-family: "JX Body", "Inter", system-ui, sans-serif; font-weight: 500; font-size: 26px; line-height: 1.35; color: #a9b8cf; }
  .cta { margin-top: 36px; display: inline-flex; align-items: center; gap: 12px; padding: 16px 28px; border-radius: 999px;
    background: ${P.brand500}; color: ${P.pitch950}; font-weight: 800; font-size: 26px; letter-spacing: -0.01em;
    box-shadow: 0 10px 30px rgba(34,197,94,.35), inset 0 1px 0 rgba(255,255,255,.35); }
  .cta small { font-family: "JX Body", "Inter", sans-serif; font-weight: 600; font-size: 20px; opacity: .7; }

  .stage { position: absolute; right: 56px; top: 58px; width: 500px; height: 520px; perspective: 1600px; }
  .card { position: absolute; inset: 0; border-radius: 28px; padding: 18px;
    background: linear-gradient(180deg, ${P.pitch800}, ${P.pitch900});
    border: 1px solid rgba(255,255,255,.08);
    box-shadow: 0 40px 80px rgba(0,0,0,.55), 0 0 0 1px rgba(0,0,0,.4);
    transform: rotateY(-16deg) rotateX(7deg) rotateZ(2deg); transform-origin: 60% 50%; }
  .team { font-weight: 800; font-size: 15px; letter-spacing: .14em; text-transform: uppercase; display: flex; align-items: center; gap: 8px; }
  .team i { width: 10px; height: 10px; border-radius: 3px; display: inline-block; }
  .top { margin-left: 52px; height: 22px; color: ${P.accent400}; }
  .top i { background: ${P.accent400}; }
  .side { position: absolute; left: 14px; top: 300px; transform: rotate(-90deg); transform-origin: left top; color: ${P.gold400}; }
  .side i { background: ${P.gold400}; }
  .grid { display: grid; grid-template-columns: 22px repeat(10, 1fr); grid-template-rows: 22px repeat(10, 1fr); gap: 4px;
    margin-left: 26px; height: 452px; margin-top: 6px; }
  .hx, .hy { display: grid; place-items: center; font-weight: 800; font-size: 15px; color: #8ea0bb; }
  .hx { color: ${P.accent400}; }
  .hy { color: ${P.gold400}; }
  .cell { border-radius: 7px; display: grid; place-items: center; font-family: "JX Body", "Inter", sans-serif; font-weight: 800; font-size: 11.5px;
    background: color-mix(in srgb, var(--c) 26%, ${P.pitch800}); color: color-mix(in srgb, var(--c) 70%, white);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--c) 45%, transparent); }
  .cell.open { background: rgba(255,255,255,.035); box-shadow: inset 0 0 0 1px rgba(255,255,255,.06); }
  .cell.win { background: linear-gradient(180deg, ${P.gold400}, ${P.gold500}); color: ${P.pitch950}; font-size: 13px;
    box-shadow: 0 0 0 3px rgba(251,191,36,.35), 0 0 34px rgba(251,191,36,.75); position: relative; z-index: 1; transform: scale(1.18); }
  .chip { position: absolute; display: flex; align-items: center; gap: 12px; padding: 12px 18px 12px 12px; border-radius: 20px;
    background: rgba(19,28,48,.92); border: 1px solid rgba(255,255,255,.1); box-shadow: 0 18px 40px rgba(0,0,0,.5);
    font-family: "JX Body", "Inter", sans-serif; }
  .chip .av { width: 44px; height: 44px; border-radius: 14px; display: grid; place-items: center; font-weight: 900; font-size: 17px;
    background: linear-gradient(180deg, ${P.gold400}, ${P.gold500}); color: ${P.pitch950}; }
  .chip .t1 { font-weight: 800; font-size: 19px; color: #fff; }
  .chip .t2 { font-weight: 600; font-size: 15px; color: #94a3b8; margin-top: 2px; display: flex; align-items: center; gap: 6px; }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: ${P.brand400}; box-shadow: 0 0 10px ${P.brand400}; }
  .win-chip { left: 650px; top: 470px; }
  .ball { position: absolute; right: 16px; top: -2px; width: 116px; height: 116px; transform: rotate(10deg);
    filter: drop-shadow(0 16px 24px rgba(0,0,0,.5)); }
</style></head>
<body>
  <div class="left">
    <div class="lockup">${iconSvg("rounded", 64)}<div class="word">Jax<b>Squares</b></div></div>
    <h1>You’re invited to play <em>squares</em></h1>
    <p>Grab your squares, watch the numbers drop, and follow every score live with your crew.</p>
    <div class="cta">Tap to join <small>no download needed</small></div>
  </div>
  <div class="stage">
    <div class="card">
      <div class="team top"><i></i>Away</div>
      <div class="team side"><i></i>Home</div>
      <div class="grid">
        <div></div>${digits(COLS, "hx")}
        ${boardRows()}
      </div>
    </div>
  </div>
  <div class="chip win-chip"><div class="av">JT</div><div><div class="t1">Jess T. wins Q1</div><div class="t2"><span class="dot"></span>Live · Q2 8:41</div></div></div>
  <div class="ball">${ballSvg(116)}</div>
</body></html>`;
}
