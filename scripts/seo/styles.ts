// The landing pages' one stylesheet, inlined into every page (no CSS request).
// Tokens mirror src/index.css: the dark "Under the lights" theme by default, the
// light "day game" values when the phone prefers light (or the app's saved
// Appearance says so: <html data-theme>, set by the page's one-line boot script).

import { FONTS } from "./site.ts";

/** Semantic tokens that differ between the themes (src/index.css :root[data-theme="light"]). */
const DARK = `
  --color-canvas:#060c09;--color-surface:#0c1410;--color-surface-2:#111a15;--color-surface-3:#16211b;--color-surface-4:#223029;
  --color-surface-5:#2f3f35;--color-edge:#0a120e;--color-ink:#f3f7f1;--color-ink-muted:#a3b8ab;--color-ink-subtle:#768d7f;
  --color-ink-brand:#d5ff52;--color-ink-gold:#ffd56b;--color-brand-line:#c6f91f;--color-gold-line:#ffc233;
  --color-line:rgb(255 255 255/.08);--color-line-strong:rgb(255 255 255/.15);
  --elevation-card:inset 0 1px 0 0 rgb(255 255 255/.05),0 16px 32px -20px rgb(0 0 0/.8);
  --floodlight-left:rgb(214 255 120/.1);--floodlight-right:rgb(214 255 120/.08);--yard-line:rgb(255 255 255/.03);
  --brand-wash:rgb(198 249 31/.06);--team-x-ink:#3ab7ff;--team-y-ink:#ff66a6;color-scheme:dark`;
const LIGHT = `
  --color-canvas:#eef2ec;--color-surface:#f6f8f4;--color-surface-2:#fff;--color-surface-3:#f2f5f0;--color-surface-4:#e3e9e2;
  --color-surface-5:#d5ddd5;--color-edge:#bfcbc1;--color-ink:#0f1a14;--color-ink-muted:#46594d;--color-ink-subtle:#586b5f;
  --color-ink-brand:#4a6e00;--color-ink-gold:#8f5a00;--color-brand-line:#6d9400;--color-gold-line:#c27a00;
  --color-line:rgb(16 42 26/.1);--color-line-strong:rgb(16 42 26/.18);
  --elevation-card:inset 0 1px 0 0 rgb(255 255 255/.8),0 1px 2px rgb(20 44 28/.06),0 12px 28px -18px rgb(20 44 28/.28);
  --floodlight-left:rgb(198 249 31/.22);--floodlight-right:rgb(255 213 107/.18);--yard-line:rgb(16 42 26/.035);
  --brand-wash:rgb(150 200 0/.1);--team-x-ink:#0a6fae;--team-y-ink:#c0135a;color-scheme:light`;

const fontFaces = FONTS.map(
  (f) =>
    `@font-face{font-family:"${f.family}";font-style:normal;font-display:swap;font-weight:${f.weight};` +
    `src:url(${f.href}) format("woff2-variations"),url(${f.href}) format("woff2")}`,
).join("");

export const CSS = `${fontFaces}
:root{
  --font-sans:"Figtree Variable",ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
  --font-display:"Bricolage Grotesque Variable","Figtree Variable",ui-sans-serif,system-ui,sans-serif;
  --color-brand-300:#d5ff52;--color-brand-400:#c6f91f;--color-brand-700:#658500;--color-gold-400:#ffc233;
  --color-accent-400:#ff66a6;--color-ink-inverse:#060c09;--gutter:max(16px,env(safe-area-inset-left));${DARK}}
@media (prefers-color-scheme:light){:root:not([data-theme=dark]){${LIGHT}}}
:root[data-theme=light]{${LIGHT}}
*,*::before,*::after{box-sizing:border-box}
html{background:var(--color-canvas);-webkit-text-size-adjust:100%;text-size-adjust:100%}
body{margin:0;min-height:100vh;color:var(--color-ink);font:400 1.0625rem/1.65 var(--font-sans);-webkit-font-smoothing:antialiased;
  background:radial-gradient(70% 460px at 8% -80px,var(--floodlight-left),transparent 70%) no-repeat,
  radial-gradient(70% 460px at 92% -80px,var(--floodlight-right),transparent 70%) no-repeat,var(--color-canvas)}
img,svg{display:block;max-width:100%}
img{height:auto}
a{color:var(--color-ink-brand);text-underline-offset:3px;text-decoration-thickness:1px}
a:hover{text-decoration-thickness:2px}
:focus-visible{outline:2px solid var(--color-brand-line);outline-offset:3px;border-radius:6px}
strong{font-weight:800;color:var(--color-ink)}
h1,h2,.display{font-family:var(--font-display);font-variation-settings:"opsz" 96;font-weight:800;color:var(--color-ink);text-wrap:balance}
h1{font-size:clamp(2.375rem,1.4rem + 4.6vw,4rem);line-height:1.02;letter-spacing:-.035em;margin:.25rem 0 0}
h1 .hl,h2 .hl{color:var(--color-ink-brand)}
h2{font-size:clamp(1.625rem,1.2rem + 1.8vw,2.25rem);line-height:1.1;letter-spacing:-.025em;margin:0 0 .75rem}
h3{font-size:1.0625rem;line-height:1.35;font-weight:800;margin:0;color:var(--color-ink)}
p{margin:0 0 1rem}
.wrap{max-width:70rem;margin:0 auto;padding:0 var(--gutter)}
.skip{position:absolute;left:-999px;top:8px;z-index:10;background:var(--color-brand-400);color:var(--color-ink-inverse);padding:8px 14px;border-radius:10px;font-weight:800}
.skip:focus{left:var(--gutter)}
.eyebrow{font-size:.75rem;line-height:1.2;font-weight:800;letter-spacing:.09em;text-transform:uppercase;color:var(--color-ink-subtle);margin:0}
.muted{color:var(--color-ink-muted)}
/* Header */
.top{border-bottom:1px solid var(--color-line)}
.top .wrap{display:flex;align-items:center;gap:12px;height:64px}
.brand{display:inline-flex;align-items:center;gap:10px;color:var(--color-ink);text-decoration:none;font:800 1.25rem/1 var(--font-display);font-variation-settings:"opsz" 96;letter-spacing:-.03em;margin-right:auto;min-height:44px}
.brand img{width:34px;height:34px;border-radius:9px}
.brand span span{color:var(--color-ink-brand)}
.top nav{display:none;gap:4px}
.top nav a{color:var(--color-ink-muted);text-decoration:none;font-weight:700;font-size:.9375rem;padding:10px 12px;border-radius:12px}
.top nav a:hover,.top nav a[aria-current]{color:var(--color-ink);background:var(--color-surface-3)}
@media (min-width:880px){.top nav{display:flex}}
/* Buttons: the app's volt keycap */
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:56px;padding:0 24px;border-radius:18px;
  background:var(--color-brand-400);color:var(--color-ink-inverse);font:800 1.0625rem/1.2 var(--font-sans);letter-spacing:-.01em;text-decoration:none;text-align:center;
  box-shadow:inset 0 1px 0 rgb(255 255 255/.28),0 4px 0 var(--color-brand-700);transition:transform .2s,box-shadow .2s,background-color .15s}
.btn:hover{background:var(--color-brand-300);text-decoration:none}
.btn:active{transform:translateY(3px);box-shadow:inset 0 1px 0 rgb(255 255 255/.2),0 1px 0 var(--color-brand-700)}
.btn-2{background:var(--color-surface-4);color:var(--color-ink);box-shadow:inset 0 0 0 1px var(--color-line),0 4px 0 var(--color-edge)}
.btn-2:hover{background:var(--color-surface-5)}
.btn-2:active{box-shadow:inset 0 0 0 1px var(--color-line),0 1px 0 var(--color-edge)}
.btn-sm{min-height:44px;padding:0 16px;border-radius:14px;font-size:.9375rem;box-shadow:inset 0 1px 0 rgb(255 255 255/.28),0 3px 0 var(--color-brand-700)}
.btn-2.btn-sm{box-shadow:inset 0 0 0 1px var(--color-line),0 3px 0 var(--color-edge)}
.ctas{display:flex;flex-wrap:wrap;gap:12px;margin:1.5rem 0 .75rem}
.ctas .btn{flex:1 1 220px}
/* Hero */
.hero{padding:28px 0 8px}
.crumbs{font-size:.875rem;color:var(--color-ink-subtle);margin:0 0 14px}
.crumbs a{display:inline-block;padding:4px 0;color:var(--color-ink-muted);text-decoration:none;font-weight:700}
.crumbs a:hover{color:var(--color-ink)}
.lede{font-size:1.1875rem;line-height:1.55;color:var(--color-ink-muted);margin:1rem 0 0;max-width:38rem}
.fine{font-size:.875rem;color:var(--color-ink-subtle);margin:0}
.hero-art{position:relative;margin:32px auto 0;max-width:420px}
.hero-art .bd{width:100%;height:auto}
.hero-art .jax{position:absolute;right:-6px;bottom:-14px;width:30%;height:auto;filter:drop-shadow(0 10px 18px rgb(0 0 0/.35))}
@media (min-width:900px){
  .hero{padding:56px 0 24px}
  .hero .wrap{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,.9fr);gap:56px;align-items:center}
  .hero-art{margin:0;max-width:none}
}
/* Content */
main{display:block}
.content{max-width:44rem;margin:0 auto}
.section{padding:40px 0 8px}
.section+.section{border-top:1px solid var(--color-line)}
.section>p,.section li{color:var(--color-ink-muted)}
.section p strong,.section li strong{color:var(--color-ink)}
.ticks{list-style:none;padding:0;margin:0 0 1rem}
.ticks li{position:relative;padding-left:28px;margin:0 0 .75rem}
.ticks li::before{content:"";position:absolute;left:2px;top:.5em;width:12px;height:12px;border-radius:3px;background:var(--color-brand-400);box-shadow:0 0 0 3px var(--brand-wash)}
.steps{list-style:none;padding:0;margin:.5rem 0 1rem;display:grid;gap:18px}
.steps li{display:flex;gap:14px;align-items:flex-start}
.steps p{margin:.25rem 0 0;color:var(--color-ink-muted)}
.step-n{flex:none;display:grid;place-items:center;width:40px;height:40px;border-radius:12px;background:var(--color-surface-3);box-shadow:inset 0 0 0 1px var(--color-line-strong);
  font:800 1.125rem/1 var(--font-display);color:var(--color-ink)}
.steps li:last-child .step-n{background:var(--color-gold-400);color:var(--color-ink-inverse);box-shadow:none}
.card{background:var(--color-surface-2);border-radius:22px;box-shadow:var(--elevation-card),inset 0 0 0 1px var(--color-line)}
.features{display:grid;gap:12px;margin:.5rem 0 1rem}
.feature{padding:18px 18px 16px}
.feature p{margin:.375rem 0 0;color:var(--color-ink-muted);font-size:1rem}
@media (min-width:640px){.features{grid-template-columns:repeat(2,minmax(0,1fr))}}
.terms{margin:.5rem 0 1rem;display:grid;gap:10px}
.terms div{padding:14px 16px;border-radius:16px;background:var(--color-surface-2);box-shadow:inset 0 0 0 1px var(--color-line)}
.terms dt{font-weight:800;color:var(--color-ink)}
.terms dd{margin:.25rem 0 0;color:var(--color-ink-muted);font-size:1rem}
.table-wrap{margin:.5rem 0 1.25rem;border-radius:16px;box-shadow:inset 0 0 0 1px var(--color-line);overflow:hidden}
table{width:100%;border-collapse:collapse;font-size:.9375rem}
caption{text-align:left;padding:12px 14px 0;font-weight:800;color:var(--color-ink)}
th,td{text-align:left;padding:10px 14px;border-bottom:1px solid var(--color-line);vertical-align:top}
thead th{color:var(--color-ink-subtle);font-size:.75rem;letter-spacing:.08em;text-transform:uppercase}
tbody th{color:var(--color-ink);font-weight:800}
td{color:var(--color-ink-muted)}
tbody tr:last-child th,tbody tr:last-child td{border-bottom:0}
.callout{margin:.5rem 0 1.25rem;padding:16px 18px;border-radius:16px;background:var(--brand-wash);box-shadow:inset 0 0 0 1px var(--color-line-strong);color:var(--color-ink-muted)}
.callout p:last-child{margin:0}
figure{margin:0}
.diagram{margin:1rem auto 1.5rem;max-width:420px}
.diagram figcaption{font-size:.9375rem;color:var(--color-ink-muted);margin-top:10px;text-align:center}
.diagram .bd{width:100%;height:auto}
/* The board diagram (blocks.ts boardDiagram) */
.bd text{font-family:var(--font-sans)}
.bd-team{font-size:11px;font-weight:800;letter-spacing:.12em}
.bd-tx{fill:var(--team-x-ink)}
.bd-ty{fill:var(--team-y-ink)}
.bd-num{font-size:14px;font-weight:800;fill:#060c09}
.bd-corner{fill:var(--color-surface-4)}
.bd-cell{fill:var(--color-surface-3);stroke:var(--color-line);stroke-width:1}
.bd-win{fill:var(--color-gold-400)}
.bd-winner{stroke:#fff;stroke-width:2}
.bd-guide{fill:var(--color-gold-400);fill-opacity:.14;stroke:var(--color-gold-line);stroke-opacity:.55;stroke-width:1.5}
.bd-ring{stroke:var(--color-gold-line);stroke-width:3}
/* Screenshots */
.shots{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin:1rem 0 1.5rem}
.shot img{width:100%;border-radius:20px;background:var(--color-surface-3);box-shadow:var(--elevation-card),0 0 0 1px var(--color-line)}
.shot figcaption{font-size:.875rem;font-weight:700;color:var(--color-ink-muted);margin-top:8px;text-align:center;line-height:1.35}
@media (min-width:720px){.shots-3{grid-template-columns:repeat(3,minmax(0,1fr))}.shots-4{grid-template-columns:repeat(4,minmax(0,1fr))}}
/* Printables */
.printables{display:grid;gap:14px;margin:.5rem 0 1.25rem}
@media (min-width:640px){.printables{grid-template-columns:repeat(2,minmax(0,1fr))}}
.printable{display:flex;flex-direction:column;overflow:hidden}
.printable .thumb{display:flex;align-items:center;justify-content:center;height:232px;background:var(--color-surface-4);padding:16px}
.printable .thumb img{height:200px;width:auto;max-width:100%;object-fit:contain;border-radius:4px;box-shadow:0 8px 20px -10px rgb(0 0 0/.5)}
.printable-body{padding:16px 18px 18px;display:flex;flex-direction:column;flex:1}
.printable-body p{margin:.375rem 0 0;color:var(--color-ink-muted);font-size:1rem}
.printable-body .meta{font-size:.8125rem;font-weight:700;color:var(--color-ink-subtle);margin-top:2px}
.printable-body .btn{margin-top:auto;align-self:stretch}
.printable-body p+.btn{margin-top:14px}
/* FAQ */
.faq details{border-bottom:1px solid var(--color-line)}
.faq details:first-of-type{border-top:1px solid var(--color-line)}
.faq summary{display:flex;align-items:center;justify-content:space-between;gap:16px;min-height:56px;padding:12px 0;cursor:pointer;list-style:none;font-weight:800;color:var(--color-ink);line-height:1.35}
.faq summary::-webkit-details-marker{display:none}
.faq summary::after{content:"";flex:none;width:12px;height:12px;border-right:2.5px solid var(--color-ink-subtle);border-bottom:2.5px solid var(--color-ink-subtle);transform:translateY(-3px) rotate(45deg);transition:transform .2s}
.faq details[open] summary::after{transform:translateY(3px) rotate(-135deg)}
.faq details p{color:var(--color-ink-muted);margin:0 0 1rem}
/* Call to action */
.cta{position:relative;margin:48px 0 8px;padding:28px 20px 24px;text-align:center;overflow:hidden;
  background:radial-gradient(80% 120% at 50% 0%,var(--brand-wash),transparent 70%),var(--color-surface-2)}
.cta .jax{margin:0 auto 6px;width:132px;height:auto}
.cta h2{margin-bottom:.5rem}
.cta p{color:var(--color-ink-muted);max-width:30rem;margin:0 auto}
.cta .ctas{max-width:30rem;margin:1.25rem auto .5rem}
/* Related pages */
.related{display:grid;gap:12px;margin:.75rem 0 0}
@media (min-width:640px){.related{grid-template-columns:repeat(2,minmax(0,1fr))}}
.related a{display:block;padding:16px 18px;text-decoration:none;color:var(--color-ink-muted);font-size:.9375rem;line-height:1.45}
.related a strong{display:block;font-size:1.0625rem;margin-bottom:4px}
.related a:hover{box-shadow:var(--elevation-card),inset 0 0 0 1px var(--color-brand-line)}
/* Footer */
.foot{margin-top:56px;padding:32px 0 calc(32px + env(safe-area-inset-bottom));border-top:1px solid var(--color-line);font-size:.9375rem;color:var(--color-ink-subtle)}
.foot-grid{display:grid;gap:24px;grid-template-columns:repeat(2,minmax(0,1fr))}
.foot h2{font:800 .75rem/1.2 var(--font-sans);letter-spacing:.09em;text-transform:uppercase;color:var(--color-ink-subtle);margin:0 0 10px}
.foot ul{list-style:none;padding:0;margin:0}
.foot li a{display:inline-block;padding:6px 0;color:var(--color-ink-muted);text-decoration:none}
.foot li a:hover{color:var(--color-ink);text-decoration:underline}
.foot-note{margin:24px 0 0;font-size:.875rem;line-height:1.5}
.foot-note+.foot-note{margin-top:6px}
@media (min-width:720px){.foot-grid{grid-template-columns:2fr 1fr 1fr}}
@media (prefers-reduced-motion:reduce){*{transition:none!important}}
`
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\n\s*/g, "")
  .replace(/\s*([{};,>])\s*/g, "$1")
  .replace(/;}/g, "}");
