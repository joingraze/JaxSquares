// App Store screenshots from the real app.
//
//   node scripts/store/generate.mjs                 # both sizes, every frame
//   node scripts/store/generate.mjs --size 6.9      # one size
//   node scripts/store/generate.mjs --only 05-whos-winning,07-get-pinged
//   BASE=http://127.0.0.1:5232 node scripts/store/generate.mjs   # use a running dev server
//
// 1. Seeds fictional boards through the API of a local dev server (it starts
//    one on port 5232 if nothing answers at BASE, and stops it afterwards).
// 2. Drives the app with Playwright to each moment and captures the phone
//    screen at @3x with iPhone safe areas (capture.mjs).
// 3. Composes each frame: caption + the real screen in a device-free frame on
//    the brand canvas (frames.mjs), at 1320x2868 (6.9") and 1242x2688 (6.5").
// 4. Writes docs/app-store/screenshots/{6.9,6.5}/NN-name.png and a contact sheet.
//
// Needs Node 22+, the repo's node_modules (Playwright, fonts) and a Chromium
// build: /opt/pw-browsers/... if present, else CHROMIUM_PATH, else Playwright's own.
// See docs/app-store/README.md.

import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { captureScreens, SIZES } from "./capture.mjs";
import { contactSheetHtml, FRAMES, frameHtml } from "./frames.mjs";
import { seed } from "./seed.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const at = (...p) => join(ROOT, ...p);
const rel = (f) => (f.startsWith(ROOT + "/") ? f.slice(ROOT.length + 1) : f);

const { values: args } = parseArgs({
  options: {
    size: { type: "string", default: "6.9,6.5" },
    only: { type: "string" },
    base: { type: "string", default: process.env.BASE ?? "http://127.0.0.1:5232" },
    out: { type: "string", default: at("docs/app-store/screenshots") },
    work: { type: "string", default: join(tmpdir(), "jaxsquares-store") },
    "no-contact-sheet": { type: "boolean", default: false },
  },
});

const sizes = args.size.split(",").map((s) => s.trim());
for (const s of sizes) if (!SIZES[s]) throw new Error(`Unknown size ${s}; use ${Object.keys(SIZES).join(", ")}`);
const onlyFrames = args.only ? new Set(args.only.split(",").map((s) => s.trim())) : null;
const frames = FRAMES.filter((f) => !onlyFrames || onlyFrames.has(f.id) || onlyFrames.has(f.screen));
if (frames.length === 0) throw new Error(`--only matched no frames; ids: ${FRAMES.map((f) => f.id).join(", ")}`);
const screensNeeded = new Set(frames.map((f) => f.screen));
const log = (...m) => console.log(...m);

// ---- Dev server ----

async function healthy(base) {
  try {
    const res = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Starts the dev server (`npm run dev`, i.e. Vite with the Cloudflare plugin, run
 * straight from node_modules) in its own process group, so stopping it stops
 * Vite and workerd too.
 */
async function startDevServer(base) {
  const { hostname, port } = new URL(base);
  log(`Starting a dev server on ${base} ...`);
  // Invite links show this origin instead of the dev server's address.
  const env = { ...process.env, VITE_PUBLIC_ORIGIN: process.env.VITE_PUBLIC_ORIGIN ?? "https://jaxsquares.com" };
  const vite = at("node_modules/vite/bin/vite.js");
  const child = spawn(process.execPath, [vite, "--port", port || "5232", "--host", hostname, "--strictPort"], {
    cwd: ROOT,
    env,
    detached: true,
    stdio: ["ignore", "ignore", "pipe"],
  });
  let stderr = "";
  child.stderr.on("data", (d) => (stderr = (stderr + d).slice(-4000)));
  const stop = () => {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {
      /* already gone */
    }
  };
  for (let i = 0; i < 120; i++) {
    if (await healthy(base)) return stop;
    if (child.exitCode !== null) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  stop();
  throw new Error(`Dev server didn't come up on ${base}.\n${stderr}`);
}

// ---- Assets ----

function dataUrl(file, type) {
  return `data:${type};base64,${readFileSync(file).toString("base64")}`;
}

function font(pkgPath) {
  const file = at("node_modules", pkgPath);
  if (!existsSync(file)) {
    console.warn(`  (font ${pkgPath} not installed; captions fall back to a system font)`);
    return undefined;
  }
  return dataUrl(file, "font/woff2");
}

const fonts = {
  display: font("@fontsource-variable/bricolage-grotesque/files/bricolage-grotesque-latin-opsz-normal.woff2"),
  body: font("@fontsource-variable/figtree/files/figtree-latin-wght-normal.woff2"),
};
const icon = dataUrl(at("public/apple-touch-icon.png"), "image/png");

function chromiumPath() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const sandbox = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
  return existsSync(sandbox) ? sandbox : undefined;
}

/** PNG width/height and whether it has an alpha channel (App Store Connect wants none). */
function pngInfo(file) {
  const b = readFileSync(file);
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20), alpha: b[25] === 4 || b[25] === 6 };
}

// ---- Run ----

let stopServer = null;
if (!(await healthy(args.base))) stopServer = await startDevServer(args.base);
else log(`Using the dev server at ${args.base}`);

const browser = await chromium.launch({ executablePath: chromiumPath() });
const written = {};
try {
  for (const size of sizes) {
    const spec = SIZES[size];
    log(`\n${spec.label} (${spec.out.width}x${spec.out.height})`);
    log("  seeding boards");
    const world = await seed(args.base, (m) => log(`  ${m.trim()}`));

    const work = join(args.work, size);
    rmSync(work, { recursive: true, force: true });
    mkdirSync(work, { recursive: true });
    log("  capturing screens");
    const shots = await captureScreens({ browser, base: args.base, size, world, only: screensNeeded, out: work, log });

    const outDir = join(args.out, size);
    mkdirSync(outDir, { recursive: true });
    const page = await browser.newPage({ viewport: spec.out, deviceScaleFactor: 1 });
    log("  composing frames");
    for (const frame of frames) {
      const shot = shots[frame.screen];
      if (!shot) throw new Error(`No capture for ${frame.screen}`);
      // The push the phone got when its square hit at halftime, worded exactly as
      // worker/push/copy.ts words it ("winner", your own square): board name as the title.
      const notification = frame.notification
        ? { title: world.live.name, body: `🎉 Your square hit at Half! 🏆 ${world.live.prizes.q2}` }
        : null;
      await page.setContent(frameHtml({ frame, size: spec, screen: dataUrl(shot.file, "image/png"), anchor: shot.anchor, fonts, icon, notification }));
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(100);
      const file = join(outDir, `${frame.id}.png`);
      await page.screenshot({ path: file, clip: { x: 0, y: 0, ...spec.out } });
      const info = pngInfo(file);
      if (info.width !== spec.out.width || info.height !== spec.out.height || info.alpha) {
        throw new Error(`${file} is ${info.width}x${info.height}${info.alpha ? " with alpha" : ""}; expected ${spec.out.width}x${spec.out.height} RGB`);
      }
      (written[size] ??= []).push({ id: frame.id, file, ...info });
      log(`    ${rel(file)}`);
    }
    await page.close();
  }

  if (!args["no-contact-sheet"] && !onlyFrames) {
    const rows = Object.entries(written).map(([size, items]) => ({
      label: `${SIZES[size].label} · ${items[0].width}×${items[0].height}`,
      items: items.map(({ id, file, width, height }) => ({ id, src: dataUrl(file, "image/png"), w: width, h: height })),
    }));
    const page = await browser.newPage({ viewport: { width: 2600, height: 1000 }, deviceScaleFactor: 1 });
    await page.setContent(contactSheetHtml({ rows, fonts }));
    await page.evaluate(() => document.fonts.ready);
    const file = join(args.out, "contact-sheet.png");
    await page.locator("body").screenshot({ path: file });
    await page.close();
    log(`\n  ${rel(file)}`);
  }
  writeFileSync(join(args.work, "last-run.json"), JSON.stringify(written, null, 2));
} finally {
  await browser.close();
  if (stopServer) {
    stopServer();
    log("Stopped the dev server.");
  }
}
