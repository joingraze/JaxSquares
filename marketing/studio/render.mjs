#!/usr/bin/env node
// Renders studio compositions to MP4 (videos) or PNG sequences (carousels).
//
//   node marketing/studio/render.mjs                 # everything
//   node marketing/studio/render.mjs 01-how-it-works # one or more ids
//   node marketing/studio/render.mjs --frames 01-how-it-works:0,120,300   # spot-check stills
//   node marketing/studio/render.mjs --audio [ids]   # re-mix soundtracks into existing MP4s
//
// Each frame is set via window.__studio.setFrame(n) and screenshotted at 3×
// device scale, then piped into ffmpeg (H.264, yuv420p, faststart): the format
// Instagram expects. A composition with `audio` cues gets its soundtrack
// rendered in the page (studio/audio, Web Audio offline), normalized to
// -14 LUFS (Instagram's playback loudness) and muxed in as AAC. Needs ffmpeg
// on PATH and a Chromium (set CHROMIUM_PATH or let Playwright find one).

import { spawn } from "node:child_process";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createServer } from "vite";
import { chromium } from "@playwright/test";

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(here, "../out");
const TMP = path.join(OUT, ".tmp");
const SCALE = 3;
const CONCURRENCY = Number(process.env.RENDER_CONCURRENCY ?? 3);

const args = process.argv.slice(2);
const spot = args[0] === "--frames" ? args.slice(1) : null;
const audioOnly = args[0] === "--audio";
const only = spot ? spot.map((a) => a.split(":")[0]) : audioOnly ? args.slice(1) : args;

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

// Video frames go to ffmpeg as JPEG (q95): a PNG of 1080×1920 takes ~3× as long
// to encode, and H.264 at CRF 18 can't tell the difference. Stills stay PNG.
async function shot(page, frame, type = "png") {
  await page.evaluate((n) => window.__studio.setFrame(n), frame);
  return page.screenshot(
    type === "png" ? { type: "png", animations: "disabled" } : { type: "jpeg", quality: 95, animations: "disabled" },
  );
}

function ffmpeg(meta, file) {
  const proc = spawn(
    "ffmpeg",
    [
      "-y", "-loglevel", "error",
      "-f", "image2pipe", "-c:v", "mjpeg", "-framerate", String(meta.fps), "-i", "-",
      "-c:v", "libx264", "-preset", "medium", "-crf", "18",
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

function run(cmd, argv) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, argv, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    proc.stderr.on("data", (d) => (stderr += d));
    proc.on("close", (code) => (code === 0 ? resolve(stderr) : reject(new Error(`${cmd} exited ${code}: ${stderr.slice(-800)}`))));
  });
}

/** Renders the composition's soundtrack in the page; returns the WAV path, or null without one. */
async function soundtrack(page, meta) {
  if (!meta.audio) return null;
  const b64 = await page.evaluate((id) => window.__studio.renderAudio(id), meta.id);
  if (!b64) return null;
  const wav = path.join(TMP, `${meta.id}.wav`);
  await writeFile(wav, Buffer.from(b64, "base64"));
  return wav;
}

// Two-pass loudness normalization, so every Reel plays at the same level.
const LOUDNESS = "I=-14:TP=-1.5:LRA=11";

/** Copies the video stream of `video` and adds `wav` as normalized AAC, writing `out`. */
async function mux(video, wav, out) {
  const probe = await run("ffmpeg", ["-hide_banner", "-nostats", "-i", wav, "-af", `loudnorm=${LOUDNESS}:print_format=json`, "-f", "null", "-"]);
  const m = JSON.parse(probe.slice(probe.lastIndexOf("{"), probe.lastIndexOf("}") + 1));
  const norm =
    `loudnorm=${LOUDNESS}:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}` +
    `:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`;
  await run("ffmpeg", [
    "-y", "-loglevel", "error", "-i", video, "-i", wav,
    "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy",
    "-af", `${norm},aresample=48000`, "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2",
    "-shortest", "-movflags", "+faststart", out,
  ]);
}

/** Re-mixes the soundtrack of an already-rendered video. */
async function remixAudio(meta) {
  const file = path.join(OUT, `${meta.id}.mp4`);
  if (meta.kind !== "video" || !meta.audio) return;
  if (!existsSync(file)) throw new Error(`${file} is missing: render it first`);
  const page = await openComp(meta);
  const wav = await soundtrack(page, meta);
  await page.close();
  const tmp = path.join(TMP, `${meta.id}.mp4`);
  await mux(file, wav, tmp);
  await rename(tmp, file);
  await rm(wav);
  console.log(`♪ ${meta.id}`);
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
    const silent = path.join(TMP, `${meta.id}.video.mp4`);
    const enc = ffmpeg(meta, silent);
    for (let f = 0; f < meta.durationInFrames; f++) {
      const buf = await shot(page, f, "jpeg");
      if (!enc.stdin.write(buf)) await new Promise((r) => enc.stdin.once("drain", r));
    }
    enc.stdin.end();
    await enc.done;
    const wav = await soundtrack(page, meta);
    if (wav) {
      await mux(silent, wav, file);
      await rm(silent);
      await rm(wav);
    } else {
      await rename(silent, file);
    }
    if (meta.coverFrame !== undefined) {
      await writeFile(path.join(OUT, `${meta.id}-cover.png`), await shot(page, meta.coverFrame));
    }
  }
  await page.close();
  console.log(`✓ ${meta.id} (${meta.durationInFrames} frames, ${((Date.now() - t0) / 1000).toFixed(1)}s)`);
}

try {
  await mkdir(TMP, { recursive: true });
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
    const job = audioOnly ? remixAudio : render;
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
        while (queue.length) await job(queue.shift());
      }),
    );
  }
} finally {
  await browser.close();
  await server.close();
}
