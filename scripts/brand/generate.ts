/// <reference lib="dom" />
// Renders every brand asset from the SVG/HTML sources in this folder with
// headless Chromium, so the icon, favicon, PWA icons, iOS app icon + launch
// image and the link-preview card always come from one design.
//
//   node --experimental-strip-types scripts/brand/generate.ts
//
// Needs the Playwright Chromium build (`npx playwright install chromium`) or
// CHROMIUM_PATH pointing at a Chrome binary. The link-preview card embeds the
// design-system fonts from node_modules (falls back to Inter). Writes into
// public/, ios/ and, once `npx cap add android` has run, android/.

import { chromium, type Page } from "@playwright/test";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { badgeSvg, faviconSvg, iconSvg, markSvg, palette, splashSvg, type IconShape } from "./art.ts";
import { ogHtml } from "./og.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const at = (...p: string[]) => join(ROOT, ...p);

function write(path: string, data: string | Buffer) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, data);
  console.log(`  ${path.slice(ROOT.length + 1)}`);
}

async function render(page: Page, html: string, width: number, height = width, transparent = false): Promise<Buffer> {
  await page.setViewportSize({ width, height });
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:transparent}svg{display:block}</style></head><body>${html}</body></html>`);
  await page.evaluate(() => document.fonts.ready);
  return page.screenshot({ omitBackground: transparent, clip: { x: 0, y: 0, width, height } });
}

const icon = (page: Page, shape: IconShape, size: number) => render(page, iconSvg(shape, size), size, size, shape === "rounded");

/** ICO container holding PNG frames (supported by every current browser). */
function ico(frames: { size: number; png: Buffer }[]): Buffer {
  const header = Buffer.alloc(6 + frames.length * 16);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(frames.length, 4);
  let offset = header.length;
  frames.forEach(({ size, png }, i) => {
    const e = 6 + i * 16;
    header.writeUInt8(size >= 256 ? 0 : size, e);
    header.writeUInt8(size >= 256 ? 0 : size, e + 1);
    header.writeUInt16LE(1, e + 4);
    header.writeUInt16LE(32, e + 6);
    header.writeUInt32LE(png.length, e + 8);
    header.writeUInt32LE(offset, e + 12);
    offset += png.length;
  });
  return Buffer.concat([header, ...frames.map((f) => f.png)]);
}

function fontDataUrl(pkgPath: string): string | undefined {
  const file = at("node_modules", pkgPath);
  if (!existsSync(file)) {
    console.warn(`  (font ${pkgPath} not installed; falling back to Inter)`);
    return undefined;
  }
  return `data:font/woff2;base64,${readFileSync(file).toString("base64")}`;
}

/** Width/height from a PNG's IHDR chunk. */
function pngSize(path: string): { width: number; height: number } {
  const b = readFileSync(path);
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
}

function findFiles(dir: string, name: RegExp): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((entry) => {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) return findFiles(p, name);
    return name.test(entry) ? [p] : [];
  });
}

async function web(page: Page) {
  console.log("web");
  write(at("public/favicon.svg"), faviconSvg(32) + "\n");
  write(at("public/icons/icon.svg"), iconSvg("rounded", 512) + "\n");
  write(at("public/icons/mark.svg"), markSvg(512) + "\n");
  const frames = [];
  for (const size of [16, 32, 48]) frames.push({ size, png: await render(page, faviconSvg(size), size, size, true) });
  write(at("public/favicon.ico"), ico(frames));
  write(at("public/apple-touch-icon.png"), await icon(page, "square", 180));
  for (const size of [192, 512]) {
    write(at(`public/icons/icon-${size}.png`), await icon(page, "rounded", size));
    write(at(`public/icons/maskable-${size}.png`), await icon(page, "maskable", size));
  }
  write(at("public/icons/badge-96.png"), await render(page, badgeSvg(96), 96, 96, true));
  const fonts = {
    display: fontDataUrl("@fontsource-variable/bricolage-grotesque/files/bricolage-grotesque-latin-opsz-normal.woff2"),
    body: fontDataUrl("@fontsource-variable/figtree/files/figtree-latin-wght-normal.woff2"),
  };
  write(at("public/og-image.png"), await render(page, ogHtml(fonts), 1200, 630));
}

async function ios(page: Page) {
  const assets = at("ios/App/App/Assets.xcassets");
  if (!existsSync(assets)) return console.log("ios: skipped (run `npx cap add ios` first)");
  console.log("ios");
  // App Store icons must be opaque; a default (non-omitBackground) screenshot has no alpha channel.
  write(join(assets, "AppIcon.appiconset/AppIcon-512@2x.png"), await icon(page, "square", 1024));
  // 2732px at @3x is the template's launch image; @1x/@2x keep the same point size at a fraction of the weight.
  const splashSet = join(assets, "Splash.imageset");
  const scales = [
    { scale: "1x", file: "splash.png", size: 911 },
    { scale: "2x", file: "splash@2x.png", size: 1822 },
    { scale: "3x", file: "splash@3x.png", size: 2732 },
  ];
  for (const { file, size } of scales) write(join(splashSet, file), await render(page, splashSvg(size), size));
  for (const stale of readdirSync(splashSet).filter((f) => f.startsWith("splash-2732x2732"))) rmSync(join(splashSet, stale));
  const images = scales.map(({ scale, file }) => ({ idiom: "universal", filename: file, scale }));
  write(join(splashSet, "Contents.json"), JSON.stringify({ images, info: { version: 1, author: "xcode" } }, null, 2) + "\n");
  // The launch storyboard paints the canvas color behind the (aspect-filled) splash image.
  const storyboard = at("ios/App/App/Base.lproj/LaunchScreen.storyboard");
  if (existsSync(storyboard)) {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(palette.canvas.slice(i, i + 2), 16) / 255);
    const color = `<color key="backgroundColor" red="${r}" green="${g}" blue="${b}" alpha="1" colorSpace="custom" customColorSpace="sRGB"/>`;
    write(storyboard, readFileSync(storyboard, "utf8").replace(/<color key="backgroundColor"[^>]*\/>/, color));
  }
}

/** Re-renders the launcher icons and splash images the Capacitor Android template ships, at their existing sizes. */
async function android(page: Page) {
  const res = at("android/app/src/main/res");
  if (!existsSync(res)) return console.log("android: skipped (no android/ project yet)");
  console.log("android");
  for (const file of findFiles(res, /^ic_launcher(_round)?\.png$/)) {
    const { width } = pngSize(file);
    const round = file.endsWith("_round.png");
    const html = round
      ? `<div style="width:${width}px;height:${width}px;border-radius:50%;overflow:hidden">${iconSvg("maskable", width)}</div>`
      : iconSvg("rounded", width);
    write(file, await render(page, html, width, width, true));
  }
  // Adaptive icon foreground: 108dp canvas, only the inner 66dp circle is guaranteed visible.
  for (const file of findFiles(res, /^ic_launcher_foreground\.png$/)) {
    const { width } = pngSize(file);
    const html = `<div style="width:${width}px;height:${width}px;display:grid;place-items:center">${markSvg(Math.round(width * 0.62))}</div>`;
    write(file, await render(page, html, width, width, true));
  }
  write(
    join(res, "values/ic_launcher_background.xml"),
    `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${palette.canvas.toUpperCase()}</color>\n</resources>\n`,
  );
  for (const file of findFiles(res, /^splash\.png$/)) {
    const { width, height } = pngSize(file);
    const side = Math.max(width, height);
    const html = `<div style="width:${width}px;height:${height}px;overflow:hidden"><div style="width:${side}px;margin:${(height - side) / 2}px 0 0 ${(width - side) / 2}px">${splashSvg(side)}</div></div>`;
    write(file, await render(page, html, width, height));
  }
}

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  await web(page);
  await ios(page);
  await android(page);
} finally {
  await browser.close();
}
