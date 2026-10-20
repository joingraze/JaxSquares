// 1200x630 link-preview card served as /og-image.png. The worker swaps in the
// board's own title and description per invite, so the art stays generic: a
// friendly invitation plus a live-looking board in the app's own colors.

import { iconSvg, palette as P } from "./art.ts";

/** A spread of PLAYER_COLORS (src/lib/identity.ts) minus the warm ones, so only the winning square reads gold. */
const PLAYER_COLORS = ["#34d07b", "#1fd1c1", "#38b6ff", "#5b74ff", "#9b6bff", "#ff4f9a", "#ff8fd0", "#ff4757", "#e6ede8"];
/** One player per color, as on a real board. "JT" is the winner and only owns the lit square. */
const INITIALS = ["MK", "AR", "SL", "DB", "CJ", "PW", "EM", "TN", "KO"];
/** Column digits (away) and row digits (home). The lit square is Away 7, Home 3: a believable Q1. */
const COLS = [4, 2, 9, 0, 8, 1, 7, 3, 6, 5];
const ROWS = [5, 8, 0, 3, 1, 9, 6, 2, 7, 4];
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
  const rand = rng(7);
  let html = "";
  for (let r = 0; r < 10; r++) {
    html += `<div class="hy">${ROWS[r]}</div>`;
    for (let c = 0; c < 10; c++) {
      const claimed = rand() < 0.74;
      const who = Math.floor(rand() * INITIALS.length);
      if (r === WINNER.row && c === WINNER.col) {
        html += `<div class="cell win">JT</div>`;
      } else if (claimed) {
        html += `<div class="cell" style="--c:${PLAYER_COLORS[who]}">${INITIALS[who]}</div>`;
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
  ${face("JX Display", fonts.display, "font-weight: 200 800;")}
  ${face("JX Body", fonts.body, "font-weight: 300 900;")}
  * { box-sizing: border-box; margin: 0; }
  html, body { width: 1200px; height: 630px; overflow: hidden; }
  body {
    font-family: "JX Display", "Inter Display", "Inter", system-ui, sans-serif;
    /* Bricolage's display cut, as in the app (.font-display). */
    font-variation-settings: "opsz" 96;
    color: ${P.ink};
    background:
      radial-gradient(620px 420px at 4% -14%, rgba(214,255,120,.17), transparent 70%),
      radial-gradient(620px 420px at 96% -14%, rgba(214,255,120,.11), transparent 70%),
      radial-gradient(520px 360px at 82% 72%, rgba(255,171,15,.10), transparent 70%),
      ${P.canvas};
    position: relative;
  }
  /* Faint yard lines that fade out down the card, like the app's backdrop. */
  body::before { content: ""; position: absolute; inset: 0;
    background: repeating-linear-gradient(180deg, transparent 0 89px, rgba(255,255,255,.035) 89px 90px);
    -webkit-mask-image: linear-gradient(180deg, #000, transparent 70%); }
  .left { position: absolute; left: 72px; top: 62px; width: 580px; }
  .lockup { display: flex; align-items: center; gap: 16px; }
  .lockup svg { width: 60px; height: 60px; filter: drop-shadow(0 8px 18px rgba(0,0,0,.55)); }
  .word { font-weight: 800; font-size: 38px; letter-spacing: -0.03em; }
  .word b { color: ${P.volt}; font-weight: 800; }
  h1 { margin-top: 46px; font-weight: 800; font-size: 82px; line-height: 0.94; letter-spacing: -0.04em; }
  h1 em { font-style: normal; color: ${P.volt}; }
  p { margin-top: 26px; font-family: "JX Body", "Inter", system-ui, sans-serif; font-variation-settings: normal;
    font-weight: 500; font-size: 26px; line-height: 1.36; color: ${P.inkMuted}; max-width: 540px; }
  .cta { margin-top: 36px; display: inline-flex; align-items: center; gap: 14px; height: 68px; padding: 0 30px; border-radius: 20px;
    background: ${P.volt}; color: ${P.canvas}; font-weight: 800; font-size: 28px; letter-spacing: -0.015em;
    box-shadow: inset 0 1.5px 0 rgba(255,255,255,.45), 0 6px 0 ${P.volt600}, 0 18px 40px -8px rgba(198,249,31,.45); }
  .cta small { font-family: "JX Body", "Inter", sans-serif; font-weight: 700; font-size: 19px; opacity: .62; letter-spacing: 0; }

  .stage { position: absolute; right: 54px; top: 54px; width: 500px; height: 524px; perspective: 1600px; }
  .card { position: absolute; inset: 0; border-radius: 30px; padding: 18px;
    background: linear-gradient(180deg, ${P.pitch800}, ${P.pitch900});
    box-shadow: inset 0 1px 0 rgba(255,255,255,.07), 0 0 0 1px rgba(255,255,255,.08), 0 44px 90px -10px rgba(0,0,0,.8);
    transform: rotateY(-16deg) rotateX(7deg) rotateZ(2deg); transform-origin: 60% 50%; }
  .team { font-family: "JX Body", "Inter", sans-serif; font-weight: 800; font-size: 14px; letter-spacing: .14em; text-transform: uppercase;
    display: flex; align-items: center; gap: 8px; }
  .team i { width: 10px; height: 10px; border-radius: 3px; display: inline-block; }
  .top { margin-left: 52px; height: 22px; color: ${P.teamX}; }
  .top i { background: ${P.teamX}; }
  .side { position: absolute; left: 14px; top: 304px; transform: rotate(-90deg); transform-origin: left top; color: ${P.teamY}; }
  .side i { background: ${P.teamY}; }
  .grid { display: grid; grid-template-columns: 22px repeat(10, 1fr); grid-template-rows: 22px repeat(10, 1fr); gap: 4px;
    margin-left: 26px; height: 454px; margin-top: 6px; }
  .hx, .hy { display: grid; place-items: center; font-weight: 800; font-size: 16px; }
  .hx { color: ${P.teamX}; }
  .hy { color: ${P.teamY}; }
  .cell { border-radius: 7px; display: grid; place-items: center; font-family: "JX Body", "Inter", sans-serif; font-weight: 800; font-size: 11.5px;
    background: color-mix(in srgb, var(--c) 24%, ${P.pitch800}); color: color-mix(in srgb, var(--c) 72%, white);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--c) 42%, transparent); }
  .cell.open { background: rgba(255,255,255,.03); box-shadow: inset 0 0 0 1px rgba(255,255,255,.06); }
  .cell.win { background: linear-gradient(180deg, ${P.gold300}, ${P.gold} 55%, ${P.gold500}); color: ${P.canvas}; font-size: 13px;
    box-shadow: inset 0 1px 0 rgba(255,255,255,.5), 0 0 0 3px rgba(255,194,51,.35), 0 0 36px rgba(255,171,15,.8);
    position: relative; z-index: 1; transform: scale(1.2); }
  .chip { position: absolute; display: flex; align-items: center; gap: 14px; padding: 12px 22px 12px 12px; border-radius: 22px;
    background: rgba(17,26,21,.94); box-shadow: inset 0 1px 0 rgba(255,255,255,.07), 0 0 0 1px rgba(255,194,51,.4), 0 22px 44px -6px rgba(0,0,0,.7), 0 10px 34px -10px rgba(255,171,15,.5);
    font-family: "JX Body", "Inter", sans-serif; }
  .chip .av { width: 46px; height: 46px; border-radius: 15px; display: grid; place-items: center; font-weight: 900; font-size: 17px;
    background: linear-gradient(180deg, ${P.gold300}, ${P.gold500}); color: ${P.canvas}; box-shadow: inset 0 1px 0 rgba(255,255,255,.5); }
  .chip .t1 { font-weight: 800; font-size: 20px; color: #fff; letter-spacing: -0.01em; }
  .chip .t1 b { color: ${P.gold}; font-weight: 800; }
  .chip .t2 { font-weight: 700; font-size: 15px; color: ${P.inkMuted}; margin-top: 3px; display: flex; align-items: center; gap: 7px; }
  .live { display: inline-flex; align-items: center; gap: 6px; color: #fff; font-weight: 800; font-size: 12px; letter-spacing: .1em;
    background: ${P.live}; border-radius: 6px; padding: 3px 7px 3px 6px; }
  .live i { width: 7px; height: 7px; border-radius: 50%; background: #fff; }
  .win-chip { left: 640px; top: 474px; }
</style></head>
<body>
  <div class="left">
    <div class="lockup">${iconSvg("rounded", 60)}<div class="word">Jax<b>Squares</b></div></div>
    <h1>You’re invited to play <em>squares</em></h1>
    <p>Claim your squares, watch the numbers drop, and follow every score live with your crew.</p>
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
  <div class="chip win-chip"><div class="av">JT</div><div><div class="t1">Jess T. wins <b>Q1</b></div><div class="t2"><span class="live"><i></i>LIVE</span>Q2 8:41</div></div></div>
</body></html>`;
}
