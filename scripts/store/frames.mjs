// The App Store frames: a bold caption over the real app screen, set in a
// clean device-free frame on the brand's night-turf canvas. Each frame is an
// HTML page rendered at the exact App Store pixel size by Playwright.
//
// Copy rules (docs/app-store/listing.md): plain, fun, never money. No league
// or team marks. One accent phrase per caption, in volt; trophy gold only
// when the frame is about winning.

export const PALETTE = {
  canvas: "#060c09",
  pitch900: "#0c1410",
  volt: "#c6f91f",
  gold: "#ffc233",
  ink: "#f3f7f1",
  inkMuted: "#a3b8ab",
};

/**
 * The story, in order. `screen` names a capture from capture.mjs. `title` is
 * HTML: <em> is the accent phrase. Keep each title line under ~15 characters
 * and `sub` to one line so both read at thumbnail size.
 */
export const FRAMES = [
  {
    id: "01-make-a-board",
    screen: "create",
    title: "Make a board<br>in <em>seconds</em>.",
    sub: "Pick the game, tap Create. You’re live.",
  },
  {
    id: "02-text-the-link",
    screen: "invite",
    title: "Text the link.<br><em>No download.</em>",
    sub: "Friends join from the group chat in a tap.",
  },
  {
    id: "03-tap-a-square",
    screen: "claim",
    title: "Tap a square.<br><em>You’re in.</em>",
    sub: "Your color, your emoji, your squares.",
  },
  {
    id: "04-numbers-drawn-live",
    screen: "reveal",
    title: "Numbers drawn<br><em>live</em>.",
    sub: "Lock the board and watch every digit land.",
  },
  {
    id: "05-whos-winning",
    screen: "live",
    title: "Know who’s<br>winning <em>now</em>.",
    sub: "Every score lights up the square that’s ahead.",
    accent: "gold",
  },
  {
    id: "06-every-board",
    screen: "home",
    title: "Every board,<br><em>one screen</em>.",
    sub: "Live scores, to-dos and finals, always fresh.",
  },
  {
    id: "07-get-pinged",
    screen: "inbox",
    title: "Get pinged when<br>you <em>hit</em>.",
    sub: "Alerts for numbers, kickoff and every win.",
    accent: "gold",
    notification: true,
  },
];

const statusIcons = (h) => {
  // Cellular, Wi-Fi and battery, drawn at the status bar's scale (h = icon height in px).
  const bars = [0.35, 0.55, 0.78, 1]
    .map((f, i) => `<rect x="${i * 6.4}" y="${12 * (1 - f)}" width="4.6" height="${12 * f}" rx="1.2" fill="#fff"/>`)
    .join("");
  const cell = `<svg viewBox="0 0 24 12" height="${h}" aria-hidden="true">${bars}</svg>`;
  const wifi = `<svg viewBox="0 0 17 12.5" height="${h}" aria-hidden="true"><path fill="#fff" d="M8.5 2.3c2.4 0 4.6.9 6.3 2.5l1.3-1.3A10.9 10.9 0 0 0 8.5.4 10.9 10.9 0 0 0 .9 3.5l1.3 1.3a9 9 0 0 1 6.3-2.5Zm0 3.6c1.4 0 2.7.5 3.7 1.4l1.3-1.3a7.2 7.2 0 0 0-10 0l1.3 1.3c1-.9 2.3-1.4 3.7-1.4Zm0 3.6c.5 0 1 .2 1.3.5L8.5 11.3 7.2 10c.3-.3.8-.5 1.3-.5Z"/></svg>`;
  const battery = `<svg viewBox="0 0 27.5 13" height="${h}" aria-hidden="true"><rect x=".5" y=".5" width="24" height="12" rx="3.6" fill="none" stroke="#fff" stroke-opacity=".4"/><rect x="2.2" y="2.2" width="20.6" height="8.6" rx="2.2" fill="#fff"/><path d="M26 4.4v4.2c.8-.3 1.4-1.1 1.4-2.1S26.8 4.7 26 4.4Z" fill="#fff" fill-opacity=".45"/></svg>`;
  return `${cell}${wifi}${battery}`;
};

/**
 * One frame as an HTML page. `screen` is the capture's data URL (device
 * points x 3), `size` is SIZES[...] from capture.mjs.
 */
export function frameHtml({ frame, size, screen, anchor, fonts, icon, notification }) {
  const { width: W, height: H } = size.out;
  const u = W / 1320;
  const px = (n) => `${(n * u).toFixed(2)}px`;
  const S = size.scale;
  const nativeW = size.device.width * S;
  const nativeH = size.device.height * S;
  // The phone fills ~78% of the height, sitting just above the bottom edge.
  const phoneH = Math.round(H * 0.775);
  const k = phoneH / nativeH;
  const phoneW = Math.round(nativeW * k);
  const phoneTop = H - Math.round(H * 0.032) - phoneH;
  const radius = 55 * S; // iPhone display corner, in points x scale
  const statusH = size.insets.top * S;
  // Status bar layout per device class: Dynamic Island phones sit the time lower and further in.
  const timeX = (size.island ? 78 : 54) * S;
  const iconsX = (size.island ? 78 : 50) * S;
  const barMid = (size.island ? 32 : 24) * S;
  const accent = frame.accent === "gold" ? PALETTE.gold : PALETTE.volt;
  const glow = frame.accent === "gold" ? "255,194,51" : "198,249,31";
  const face = (family, url, extra) => (url ? `@font-face { font-family: "${family}"; src: url(${url}) format("woff2"); ${extra} }` : "");
  // The banner's bottom edge: just above `anchor` (a box in screen points), else under the status bar.
  const noteBottom = anchor ? phoneTop + (anchor.y * S - 8 * S) * k : phoneTop + statusH * k + 200 * u;

  const banner = notification
    ? `<div class="note">
        <img class="note-icon" src="${icon}" alt="">
        <div class="note-text">
          <div class="note-head"><b>${notification.title}</b><span>now</span></div>
          <div class="note-body">${notification.body}</div>
        </div>
      </div>`
    : "";

  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
  ${face("JX Display", fonts.display, "font-weight: 200 800;")}
  ${face("JX Body", fonts.body, "font-weight: 300 900;")}
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { width: ${W}px; height: ${H}px; overflow: hidden; }
  body {
    position: relative;
    background:
      radial-gradient(${px(980)} ${px(760)} at -4% -6%, rgba(214,255,120,.17), transparent 70%),
      radial-gradient(${px(980)} ${px(760)} at 104% -6%, rgba(214,255,120,.10), transparent 70%),
      radial-gradient(${px(1300)} ${px(1100)} at 50% ${phoneTop / H * 100 + 18}%, rgba(${glow},.13), transparent 68%),
      ${PALETTE.canvas};
    color: ${PALETTE.ink};
    font-family: "JX Body", "Figtree", system-ui, sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  .cap { position: absolute; left: ${px(70)}; right: ${px(70)}; top: 0; height: ${phoneTop}px;
    display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding-bottom: ${px(14)}; }
  h1 { font-family: "JX Display", "Inter", system-ui, sans-serif; font-variation-settings: "opsz" 96;
    font-weight: 800; font-size: ${px(128)}; line-height: .97; letter-spacing: -0.04em; color: ${PALETTE.ink};
    text-shadow: 0 ${px(6)} ${px(30)} rgba(0,0,0,.45); }
  h1 em { font-style: normal; color: ${accent}; }
  .sub { margin-top: ${px(30)}; font-weight: 600; font-size: ${px(44)}; line-height: 1.25; color: ${PALETTE.inkMuted}; letter-spacing: -0.005em; }

  .phone-wrap { position: absolute; left: ${(W - phoneW) / 2}px; top: ${phoneTop}px; width: ${phoneW}px; height: ${phoneH}px;
    border-radius: ${radius * k}px;
    box-shadow:
      0 0 0 ${Math.max(2, 3 * u)}px rgba(255,255,255,.10),
      0 0 0 ${px(14)} rgba(12,20,16,.92),
      0 0 0 ${px(16)} rgba(255,255,255,.07),
      0 ${px(70)} ${px(140)} rgba(0,0,0,.7),
      0 0 ${px(220)} rgba(${glow},.16); }
  .phone { position: absolute; left: 0; top: 0; width: ${nativeW}px; height: ${nativeH}px; transform: scale(${k}); transform-origin: 0 0;
    border-radius: ${radius}px; overflow: hidden; background: ${PALETTE.canvas}; }
  .phone > img { display: block; width: ${nativeW}px; height: ${nativeH}px; }
  .status { position: absolute; left: 0; right: 0; top: 0; height: ${statusH}px; pointer-events: none; }
  .time { position: absolute; left: ${timeX}px; top: ${barMid}px; transform: translate(-50%, -50%);
    font-family: "JX Body", system-ui, sans-serif; font-weight: 700; font-size: ${17 * S}px; letter-spacing: -0.01em; color: #fff; }
  .icons { position: absolute; right: ${iconsX}px; top: ${barMid}px; transform: translate(50%, -50%); display: flex; align-items: center; gap: ${6 * S}px; }

  /* An iOS banner, drawn a touch larger than life over the status bar. */
  .note { position: absolute; left: ${(W - phoneW) / 2 - 34 * u}px; width: ${phoneW + 68 * u}px; bottom: ${H - noteBottom}px;
    display: flex; align-items: center; gap: ${px(30)}; padding: ${px(30)} ${px(34)} ${px(32)} ${px(30)};
    border-radius: ${px(64)};
    background: linear-gradient(180deg, #3b4540, #2a322e);
    box-shadow: inset 0 ${px(2)} 0 rgba(255,255,255,.12), 0 0 0 ${px(2)} rgba(255,194,51,.35), 0 ${px(50)} ${px(110)} rgba(0,0,0,.75), 0 0 ${px(120)} rgba(255,194,51,.25); }
  .note-icon { width: ${px(118)}; height: ${px(118)}; border-radius: ${px(28)}; flex: none; box-shadow: 0 0 0 ${px(2)} rgba(255,255,255,.08); }
  .note-text { min-width: 0; flex: 1; }
  .note-head { display: flex; align-items: baseline; justify-content: space-between; gap: ${px(20)}; }
  .note-head b { font-weight: 800; font-size: ${px(44)}; color: #fff; letter-spacing: -0.01em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .note-head span { font-weight: 600; font-size: ${px(36)}; color: rgba(255,255,255,.55); flex: none; }
  .note-body { margin-top: ${px(6)}; font-weight: 600; font-size: ${px(42)}; line-height: 1.24; color: rgba(255,255,255,.92); }
</style></head>
<body>
  <div class="cap">
    <h1>${frame.title}</h1>
    ${frame.sub ? `<p class="sub">${frame.sub}</p>` : ""}
  </div>
  <div class="phone-wrap">
    <div class="phone">
      <img src="${screen}" alt="">
      <div class="status"><div class="time">9:41</div><div class="icons">${statusIcons(13 * S)}</div></div>
    </div>
  </div>
  ${banner}
</body></html>`;
}

/** A dark sheet of every frame at roughly App Store search-result size, labelled, for a quick read check. */
export function contactSheetHtml({ rows, fonts, thumbWidth = 300 }) {
  const face = (family, url, extra) => (url ? `@font-face { font-family: "${family}"; src: url(${url}) format("woff2"); ${extra} }` : "");
  const section = ({ label, items }) => `
    <section>
      <h2>${label}</h2>
      <div class="row">${items
        .map(
          ({ id, src, w, h }) => `<figure><img src="${src}" style="width:${thumbWidth}px;height:${Math.round((thumbWidth * h) / w)}px" alt=""><figcaption>${id}</figcaption></figure>`,
        )
        .join("")}</div>
    </section>`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    ${face("JX Display", fonts.display, "font-weight: 200 800;")}
    ${face("JX Body", fonts.body, "font-weight: 300 900;")}
    * { box-sizing: border-box; margin: 0; }
    body { background: #0c1410; color: ${PALETTE.ink}; font-family: "JX Body", system-ui, sans-serif; padding: 48px; display: inline-block; }
    h1 { font-family: "JX Display", system-ui, sans-serif; font-variation-settings: "opsz" 96; font-weight: 800; font-size: 44px; letter-spacing: -0.03em; }
    h1 b { color: ${PALETTE.volt}; }
    p.lede { margin-top: 8px; color: ${PALETTE.inkMuted}; font-size: 20px; font-weight: 600; }
    section { margin-top: 40px; }
    h2 { font-size: 18px; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; color: ${PALETTE.inkMuted}; margin-bottom: 16px; }
    .row { display: flex; gap: 24px; }
    figure { display: flex; flex-direction: column; gap: 10px; }
    img { display: block; border-radius: 18px; box-shadow: 0 0 0 1px rgba(255,255,255,.08), 0 18px 40px rgba(0,0,0,.5); }
    figcaption { font-size: 16px; font-weight: 700; color: ${PALETTE.inkMuted}; }
  </style></head><body>
    <h1>Jax<b>Squares</b> App Store screenshots</h1>
    <p class="lede">Shown at about search-result size. Every caption should read from here.</p>
    ${rows.map(section).join("")}
  </body></html>`;
}
