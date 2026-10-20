#!/usr/bin/env node
// Renders studio compositions to MP4 (videos) or PNG sequences (carousels).
//
//   node marketing/studio/render.mjs                 # everything
//   node marketing/studio/render.mjs 01-how-it-works # one or more ids
//   node marketing/studio/render.mjs --frames 01-how-it-works:0,120,300   # spot-check stills
//
// Each frame is set via window.__studio.setFrame(n) and screenshotted at 3×
// device scale, then piped into ffmpeg (H.264, yuv420p, faststart) — the format
// Instagram expects. Needs ffmpeg on PATH and a Chromium (set CHROMIUM_PATH or
// let Playwright find one).

import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createServer } from "vite";
import { chromium } from "@playwright/test";

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(here, "../out");
const SCALE = 3;
const CONCURRENCY = Number(process.env.RENDER_CONCURRENCY ?? 3);

const args = process.argv.slice(2);
const spot = args[0] === "--frames" ? args.slice(1) : null;
const only = spot ? spot.map((a) => a.split(":")[0]) : args;

function chromiumPath() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const sandbox = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
  return existsSync(sandbox) ? sandbox : undefined;
}

// No HMR or file watching: an edit mid-render must not reload pages between frames.
const server = await createServer({
  configFile: path.join(here, "vite.config.ts"),
  server: { hmr: false, watch: null },
});
await server.listen();
const base = server.resolvedUrls.local[0];
const browser = await chromium.launch({ executablePath: chromiumPath() });

async function openComp(meta) {
  const page = await browser.newPage({
    viewport: { width: meta.width / SCALE, height: meta.height / SCALE },
    deviceScaleFactor: SCALE,
  });
  await page.goto(`${base}?comp=${encodeURIComponent(meta.id)}`);
  await page.waitForFunction(() => window.__studio !== undefined);
  await page.evaluate(() => document.fonts.ready);
  return page;
}

async function shot(page, frame) {
  await page.evaluate((n) => window.__studio.setFrame(n), frame);
  return page.screenshot({ type: "png", animations: "disabled" });
}

function ffmpeg(meta, file) {
  const proc = spawn(
    "ffmpeg",
    [
      "-y", "-loglevel", "error",
      "-f", "image2pipe", "-framerate", String(meta.fps), "-i", "-",
      "-c:v", "libx264", "-preset", "slow", "-crf", "18",
      "-pix_fmt", "yuv420p", "-profile:v", "high", "-level", "4.1",
      "-movflags", "+faststart",
      file,
    ],
    { stdio: ["pipe", "inherit", "inherit"] },
  );
  const done = new Promise((resolve, reject) =>
    proc.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`)))),
  );
  return { stdin: proc.stdin, done };
}

async function render(meta) {
  const page = await openComp(meta);
  const t0 = Date.now();
  if (meta.kind === "stills") {
    const dir = path.join(OUT, meta.id);
    await mkdir(dir, { recursive: true });
    for (let f = 0; f < meta.durationInFrames; f++) {
      await writeFile(path.join(dir, `${String(f + 1).padStart(2, "0")}.png`), await shot(page, f));
    }
  } else {
    const file = path.join(OUT, `${meta.id}.mp4`);
    const enc = ffmpeg(meta, file);
    for (let f = 0; f < meta.durationInFrames; f++) {
      const buf = await shot(page, f);
      if (!enc.stdin.write(buf)) await new Promise((r) => enc.stdin.once("drain", r));
    }
    enc.stdin.end();
    await enc.done;
    if (meta.coverFrame !== undefined) {
      await writeFile(path.join(OUT, `${meta.id}-cover.png`), await shot(page, meta.coverFrame));
    }
  }
  await page.close();
  console.log(`✓ ${meta.id} (${meta.durationInFrames} frames, ${((Date.now() - t0) / 1000).toFixed(1)}s)`);
}

try {
  await mkdir(OUT, { recursive: true });
  const probe = await browser.newPage();
  await probe.goto(base);
  await probe.waitForFunction(() => window.__studio !== undefined);
  const comps = await probe.evaluate(() => window.__studio.comps);
  await probe.close();

  const todo = only.length ? comps.filter((c) => only.includes(c.id)) : comps;
  if (only.length && todo.length !== only.length) {
    throw new Error(`Unknown composition id(s). Known: ${comps.map((c) => c.id).join(", ")}`);
  }

  if (spot) {
    const dir = path.join(OUT, "_spot");
    await mkdir(dir, { recursive: true });
    for (const arg of spot) {
      const [id, list] = arg.split(":");
      const meta = comps.find((c) => c.id === id);
      const page = await openComp(meta);
      for (const f of (list ?? "0").split(",").map(Number)) {
        await writeFile(path.join(dir, `${id}-${f}.png`), await shot(page, f));
      }
      await page.close();
    }
    console.log(`spot frames → ${dir}`);
  } else {
    const queue = [...todo];
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
        while (queue.length) await render(queue.shift());
      }),
    );
  }
} finally {
  await browser.close();
  await server.close();
}
