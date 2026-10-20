#!/usr/bin/env node
// Records the real app in motion for the marketing videos.
//
//   node marketing/capture/record.mjs                  # every scene
//   node marketing/capture/record.mjs draw live        # just these
//
// Same world as the App Store screenshots (scripts/store/seed.mjs: fictional
// teams, people and prize notes, nothing about money), the same phone set-up
// (iPhone safe areas, dark mode, the fictional game picker), and the same
// banned-text guard. Each scene drives the app with Playwright while Chrome's
// screencast streams frames; the frames are resampled to a steady 30 fps JPEG
// sequence in marketing/out/clips/<scene>/ that the studio plays back frame
// by frame. Friends' claims and scores are posted through the API during a
// recording, so the board fills and winners land live, as they do on game day.
//
// Needs the local D1 migrated (npm run db:migrate:local). Starts a dev server
// on :5232 with VITE_PUBLIC_ORIGIN=https://jaxsquares.com if none is running.

import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { existsSync, linkSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { makeApi, scoreEndingIn, seed } from "../../scripts/store/seed.mjs";
import { SIZES } from "../../scripts/store/capture.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = join(ROOT, "marketing/out/clips");
const BASE = process.env.BASE ?? "http://127.0.0.1:5232";
const FPS = 30;
const SPEC = SIZES["6.9"]; // 440×956 pt, Dynamic Island, @3x
const FRAME_WIDTH = 1080; // screencast frames are scaled to this width
const TZ = "America/New_York";
const only = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const log = (...m) => console.log(...m);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- Guard: nothing here may show money talk, league marks or dev addresses.
// (Mirrors scripts/store/capture.mjs; the league tab is relabelled "Pro" there too.)
const BANNED = [
  /\bNFL\b/,
  /super ?bowl/i,
  /127\.0\.0\.1|localhost|:\d{4}\//,
  /test (mode|checkout)/i,
  /\$\s?\d/,
  /\b(bets?|betting|wagers?|gambl\w*|pots?|payouts?|odds|buy-ins?)\b/i,
];

// ---- Dev server -----------------------------------------------------------

async function healthy() {
  try {
    return (await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(3000) })).ok;
  } catch {
    return false;
  }
}

async function devServer() {
  if (await healthy()) return () => {};
  const { hostname, port } = new URL(BASE);
  log(`Starting a dev server on ${BASE} ...`);
  const child = spawn(process.execPath, [join(ROOT, "node_modules/vite/bin/vite.js"), "--port", port, "--host", hostname, "--strictPort"], {
    cwd: ROOT,
    env: { ...process.env, VITE_PUBLIC_ORIGIN: "https://jaxsquares.com" },
    detached: true,
    stdio: "ignore",
  });
  const stop = () => {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {
      /* gone */
    }
  };
  for (let i = 0; i < 120; i++) {
    if (await healthy()) return stop;
    await sleep(500);
  }
  stop();
  throw new Error("Dev server didn't come up");
}

// ---- Phone ----------------------------------------------------------------

/** Fictional games for the create flow's picker (same shape as /api/schedule). */
function schedule(world) {
  const at = (days, h, m = 0) => {
    const d = new Date(Date.now() + days * 86_400_000);
    d.setUTCHours(h + 4, m, 0, 0); // EDT-ish; only the day/time label matters
    return d.getTime();
  };
  const T = world.teams;
  const ev = (id, away, home, startsAt) => ({
    eventId: `promo-${id}`,
    league: "nfl",
    name: `${away.name} at ${home.name}`,
    shortName: `${away.abbr} @ ${home.abbr}`,
    startsAt,
    away,
    home,
    state: "pre",
  });
  return [
    ev(1, T.hawks, T.wolves, at(2, 13)),
    ev(2, T.comets, T.foxes, at(2, 13)),
    ev(3, T.otters, T.stags, at(2, 16, 25)),
    ev(4, T.bison, T.sharks, at(2, 20, 20)),
  ];
}

async function phone(browser, world, device) {
  const ctx = await browser.newContext({
    viewport: SPEC.device,
    deviceScaleFactor: SPEC.scale,
    isMobile: true,
    hasTouch: true,
    locale: "en-US",
    timezoneId: TZ,
    colorScheme: "dark",
    reducedMotion: "no-preference",
  });
  await ctx.grantPermissions(["notifications"], { origin: new URL(BASE).origin });
  await ctx.route("**/api/schedule**", (route) => route.fulfill({ json: { events: schedule(world) } }));
  await ctx.addInitScript(
    ({ d }) => {
      if (!sessionStorage.getItem("promo.seeded")) {
        sessionStorage.setItem("promo.seeded", "1");
        localStorage.setItem("jaxsquares.clientId", d.client);
        localStorage.setItem("jaxsquares.profile", JSON.stringify(d.profile));
        for (const [id, token] of Object.entries(d.admins ?? {})) localStorage.setItem(`jaxsquares.admin.${id}`, token);
        localStorage.setItem("jaxsquares.games", JSON.stringify(d.games ?? []));
      }
      navigator.share = async () => {};
      navigator.canShare = () => true;
    },
    { d: device },
  );
  const page = await ctx.newPage();
  page.on("pageerror", (err) => log(`    page error: ${err.message}`));
  const cdp = await ctx.newCDPSession(page);
  const { top, bottom } = SPEC.insets;
  await cdp.send("Emulation.setSafeAreaInsetsOverride", {
    insets: { top, topMax: top, bottom, bottomMax: bottom, left: 0, leftMax: 0, right: 0, rightMax: 0 },
  });
  return { ctx, page, cdp };
}

async function settle(page, ms = 900) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(ms);
}

/** The league is a trademark: like the store art, the picker's tab reads "Pro". */
async function genericLeague(page) {
  await page.evaluate(() => {
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) if (n.nodeValue && /\bNFL\b/.test(n.nodeValue)) n.nodeValue = n.nodeValue.replace(/\bNFL\b/g, "Pro");
  });
}

async function guard(page, scene) {
  // The host-fee line under Create ("... $4.99 for bigger boards.") is the app's own
  // price disclosure, not money between players; every other amount still fails.
  const text = await page.evaluate(() => {
    const fee = [...document.querySelectorAll('[data-testid="create-fee"]')].map((el) => el.textContent ?? "");
    return fee.reduce((t, line) => t.replace(line, ""), document.body.innerText);
  });
  const hit = BANNED.map((re) => text.match(re)?.[0]).find(Boolean);
  if (hit) throw new Error(`"${scene}" shows "${hit}", which can't go in marketing. Change the seed data or the scene.`);
}

// ---- Recording ------------------------------------------------------------

/** Streams screencast frames until stop(); returns a 30 fps sequence on disk. */
async function record(cdp, scene) {
  const dir = join(OUT, scene);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(join(dir, "raw"), { recursive: true });
  const frames = [];
  const onFrame = async ({ data, metadata, sessionId }) => {
    const file = join(dir, "raw", `${String(frames.length).padStart(5, "0")}.jpg`);
    writeFileSync(file, Buffer.from(data, "base64"));
    frames.push({ file, t: metadata.timestamp });
    await cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
  };
  cdp.on("Page.screencastFrame", onFrame);
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 88, maxWidth: FRAME_WIDTH, maxHeight: 4000, everyNthFrame: 1 });
  const startedAt = Date.now() / 1000;
  return {
    async stop() {
      const endedAt = Date.now() / 1000;
      await cdp.send("Page.stopScreencast");
      cdp.off("Page.screencastFrame", onFrame);
      if (!frames.length) throw new Error(`${scene}: no frames`);
      // Hold each frame until the next one arrives (the screencast only sends on change).
      const t0 = Math.min(frames[0].t, startedAt);
      const n = Math.ceil((endedAt - t0) * FPS);
      let j = 0;
      for (let i = 0; i < n; i++) {
        const t = t0 + i / FPS;
        while (j + 1 < frames.length && frames[j + 1].t <= t) j++;
        linkSync(frames[j].file, join(dir, `${String(i + 1).padStart(5, "0")}.jpg`));
      }
      writeFileSync(join(dir, "clip.json"), JSON.stringify({ scene, frames: n, fps: FPS, width: FRAME_WIDTH, sourceFrames: frames.length }, null, 2));
      log(`    ${scene}: ${n} frames (${(n / FPS).toFixed(1)}s, ${frames.length} captured)`);
      return n;
    },
  };
}

// ---- World helpers ----------------------------------------------------------

function deviceFor(world, who, boards) {
  return {
    client: who.client,
    profile: who.profile,
    admins: Object.fromEntries(boards.filter((b) => b.host === who).map((b) => [b.id, b.admin])),
    games: boards.map((b) => b.id),
  };
}

/** Of `player`'s squares, the one whose digits make a believable score at least `min` on each side. */
function squareScore(st, playerName, min) {
  const pid = st.players.find((p) => p.name === playerName)?.id;
  const mine = st.squares.filter((s) => s.playerId === pid);
  const digits = (cell) => ({ x: st.game.numbers["*"].x[cell.col][0], y: st.game.numbers["*"].y[cell.row][0] });
  const options = mine.map((cell) => {
    const d = digits(cell);
    const x = scoreEndingIn(d.x, min.x);
    const y = scoreEndingIn(d.y, min.y);
    return { cell, x, y, cost: x + y + (x === y ? 50 : 0) };
  });
  return options.sort((a, b) => a.cost - b.cost)[0];
}

// ---- Scenes ---------------------------------------------------------------

const SCENES = {
  /** Five guided steps from a picked game to an open board. */
  async create({ browser, world, call }) {
    const { ctx, page, cdp } = await phone(browser, world, deviceFor(world, world.me, [world.live, world.done, world.pick, world.draw]));
    await page.goto(`${BASE}/new`);
    await page.getByTestId("game-option").first().waitFor();
    await settle(page, 600);
    await genericLeague(page);
    const rec = await record(cdp, "create");
    await sleep(900);
    await page.getByTestId("game-option").first().click();
    await sleep(1100);
    await page.getByTestId("wizard-next").first().click(); // how squares win
    await sleep(1000);
    const fun = page.locator('[data-testid="rules-choice-option"][data-choice="fun"]');
    if (await fun.count()) {
      await fun.first().click();
      await sleep(900);
    }
    await page.getByTestId("wizard-next").first().click(); // prizes
    await sleep(1000);
    await page.getByTestId("wizard-next").first().click(); // details
    await sleep(1100);
    await guard(page, "create (review)");
    await page.getByTestId("create-submit").first().click();
    await page.locator('[data-testid="cell"]').first().waitFor({ timeout: 15000 });
    await sleep(2200);
    await guard(page, "create");
    await rec.stop();
    await ctx.close();
    void call;
  },

  /** The invite sheet on a board I host: the text-first share, then the room code. */
  async invite({ browser, world }) {
    const { ctx, page, cdp } = await phone(browser, world, deviceFor(world, world.inviter, [world.open]));
    await page.goto(`${BASE}/g/${world.open.id}`);
    await page.locator('[data-testid="cell"]').first().waitFor();
    await settle(page, 900);
    const rec = await record(cdp, "invite");
    await sleep(900);
    // The host bar's next action on an open board is "Invite (N left)".
    await page.getByTestId("host-bar-action").first().click();
    await page.getByTestId("invite-share").first().waitFor();
    await sleep(2400);
    await guard(page, "invite");
    await page.getByTestId("invite-share").first().click();
    await sleep(900);
    const code = page.getByTestId("invite-code-toggle").first();
    if (await code.count()) {
      await code.click();
      await sleep(1800);
    }
    await rec.stop();
    await ctx.close();
  },

  /** A friend's board filling live: friends' squares stream in while I pick three and claim. */
  async claim({ browser, world, call }) {
    const { ctx, page, cdp } = await phone(browser, world, deviceFor(world, world.me, [world.live, world.done, world.pick, world.draw]));
    const board = world.pick;
    await page.goto(`${BASE}/g/${board.id}`);
    await page.locator('[data-testid="cell"]').first().waitFor();
    await settle(page, 900);
    const st = await call("GET", `/games/${board.id}`);
    const taken = new Set(st.squares.map((q) => `${q.row},${q.col}`));
    const mine = new Set((board.cells ?? []).map((c) => `${c.row},${c.col}`));
    const open = [];
    for (let r = 0; r < 10; r++) for (let c = 0; c < 10; c++) if (!taken.has(`${r},${c}`) && !mine.has(`${r},${c}`)) open.push({ row: r, col: c });
    open.sort((a, b) => ((a.row * 7 + a.col * 3) % 11) - ((b.row * 7 + b.col * 3) % 11));
    const pickers = world.friends.filter((f) => ["Maya", "Priya", "Omar", "Kim", "Ava"].includes(f.profile.name));
    const rec = await record(cdp, "claim");
    // Friends claim one square every ~230 ms, live over the socket.
    let stopFriends = false;
    const friends = (async () => {
      for (let i = 0; i < 22 && !stopFriends; i++) {
        const who = pickers[i % pickers.length];
        await call("POST", `/games/${board.id}/claim`, { device: who, body: { cells: [open[i]] } }).catch(() => {});
        await sleep(230);
      }
    })();
    await sleep(1500);
    for (const { row, col } of board.cells ?? []) {
      await page.locator(`[data-testid="cell"][data-row="${row}"][data-col="${col}"]`).click();
      await sleep(420);
    }
    await sleep(700);
    await page.getByTestId("claim-submit").first().click();
    await sleep(2600);
    stopFriends = true;
    await friends;
    await guard(page, "claim");
    await rec.stop();
    await ctx.close();
  },

  /** "Let Jax pick": Jax claims squares for me. */
  async jax({ browser, world, call }) {
    // A fresh friend's board where I've joined but picked nothing.
    const [maya, dre, priya] = world.friends;
    const created = await call("POST", "/games", {
      device: maya,
      body: {
        name: "Game Day Squares",
        sport: "football",
        league: "custom",
        teamX: world.teams.comets,
        teamY: world.teams.otters,
        format: { periods: "quarters", reverse: false, boardSize: 100, freshNumbers: false },
        prizes: { q1: "Loser buys wings", final: "Bragging rights till next season" },
        maxPerPlayer: 10,
        linkedEvent: null,
        host: maya.profile,
      },
    });
    const id = created.game.id;
    for (const p of [maya, dre, priya, world.me]) await call("POST", `/games/${id}/join`, { device: p, body: p.profile });
    const cells = (seedNum) => Array.from({ length: 12 }, (_, i) => ({ row: (i * 3 + seedNum) % 10, col: (i * 7 + seedNum * 2) % 10 }));
    await call("POST", `/games/${id}/claim`, { device: maya, body: { cells: cells(1) } }).catch(() => {});
    await call("POST", `/games/${id}/claim`, { device: dre, body: { cells: cells(4) } }).catch(() => {});
    const dev = deviceFor(world, world.me, [world.live, world.pick, world.draw]);
    dev.games = [id, ...dev.games];
    const { ctx, page, cdp } = await phone(browser, world, dev);
    await page.goto(`${BASE}/g/${id}`);
    await page.getByTestId("jax-pick").first().waitFor();
    await settle(page, 900);
    const rec = await record(cdp, "jax");
    await sleep(1000);
    await page.getByTestId("jax-pick").first().click();
    await page.getByTestId("jax-count-sheet").first().waitFor();
    await sleep(1000);
    const chip = page.locator('[data-testid="jax-count-chip"][data-count="5"]');
    if (await chip.count()) await chip.first().click();
    await sleep(800);
    await page.getByTestId("jax-count-confirm").first().click();
    await sleep(3200);
    await guard(page, "jax");
    await rec.stop();
    await ctx.close();
  },

  /** The host draws: the reels spin, the numbers land, confetti. */
  async draw({ browser, world }) {
    const { ctx, page, cdp } = await phone(browser, world, deviceFor(world, world.me, [world.live, world.done, world.pick, world.draw]));
    await page.goto(`${BASE}/g/${world.draw.id}`);
    await page.getByTestId("host-bar-action").first().waitFor();
    await settle(page, 1200);
    const rec = await record(cdp, "draw");
    await sleep(1000);
    await page.getByTestId("host-bar-action").first().click();
    await page.getByTestId("host-lock-confirm").first().waitFor();
    await sleep(1300);
    await page.getByTestId("host-lock-confirm").first().click();
    await page.getByText("numbers are in", { exact: false }).first().waitFor({ timeout: 30000 });
    await sleep(2600);
    await guard(page, "draw");
    await page.getByTestId("reveal-done").first().click().catch(() => {});
    await sleep(1800);
    await rec.stop();
    await ctx.close();
  },

  /** A friend's board mid-game: Q3 lands on my square, live, and Jax cheers. */
  async live({ browser, world, call }) {
    const board = world.live;
    const { ctx, page, cdp } = await phone(browser, world, deviceFor(world, world.me, [world.live, world.done, world.pick, world.draw]));
    await page.goto(`${BASE}/g/${board.id}`);
    await page.locator('[data-testid="cell"]').first().waitFor();
    await settle(page, 1200);
    const st = await call("GET", `/games/${board.id}`);
    const q2 = board.scores.q2;
    const q3 = squareScore(st, world.me.profile.name, { x: q2.x + 3, y: q2.y });
    const rec = await record(cdp, "live");
    await sleep(1800);
    await call("POST", `/games/${board.id}/scores`, { device: board.host, admin: board.admin, body: { periodKey: "q3", scoreX: q3.x, scoreY: q3.y } });
    await sleep(5200);
    await guard(page, "live");
    await rec.stop();
    await ctx.close();
    world.live.scores.q3 = q3;
  },

  /** Home: every board grouped by what it needs, then the activity inbox. */
  async home({ browser, world }) {
    const { ctx, page, cdp } = await phone(browser, world, deviceFor(world, world.me, [world.live, world.done, world.pick, world.draw]));
    await page.goto(`${BASE}/`);
    await page.getByText("Live now", { exact: false }).first().waitFor();
    await settle(page, 1200);
    const rec = await record(cdp, "home");
    await sleep(2600);
    await page.mouse.wheel(0, 380);
    await sleep(1600);
    await page.mouse.wheel(0, -380);
    await sleep(900);
    await page.getByRole("button", { name: /Activity/ }).first().click();
    await sleep(2600);
    await guard(page, "home");
    await rec.stop();
    await ctx.close();
  },
};

// ---- Run ------------------------------------------------------------------

/**
 * Every seeded board comes from 127.0.0.1, so a few runs in an hour trip the
 * per-address "new boards" limit. Clear the counters in the LOCAL dev database
 * only (never --remote).
 */
function resetLocalRateLimits() {
  const wrangler = join(ROOT, "node_modules/.bin/wrangler");
  return new Promise((done) => {
    const p = spawn(wrangler, ["d1", "execute", "jaxsquares", "--local", "--command", "DELETE FROM rate_limits"], { cwd: ROOT, stdio: "ignore" });
    p.on("close", done);
  });
}

/** clips/manifest.json: every recorded scene's length, read by the studio before it renders. */
function writeManifest() {
  const manifest = {};
  for (const dir of readdirSync(OUT, { withFileTypes: true })) {
    const info = join(OUT, dir.name, "clip.json");
    if (dir.isDirectory() && existsSync(info)) manifest[dir.name] = JSON.parse(readFileSync(info, "utf8"));
  }
  writeFileSync(join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2));
}

if (process.argv.includes("--manifest")) {
  writeManifest();
  process.exit(0);
}

await resetLocalRateLimits();
const stopServer = await devServer();
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? (existsSync("/opt/pw-browsers/chromium-1194/chrome-linux/chrome") ? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" : undefined),
});
try {
  log("Seeding the fictional world ...");
  const world = await seed(BASE, () => {});
  world.teams = (await import("../../scripts/store/seed.mjs")).TEAMS;
  const call = makeApi(BASE);
  mkdirSync(OUT, { recursive: true });
  const todo = only.length ? only : Object.keys(SCENES);
  for (const name of todo) {
    if (!SCENES[name]) throw new Error(`Unknown scene ${name}; scenes: ${Object.keys(SCENES).join(", ")}`);
    log(`  recording ${name}`);
    // `draw` needs the full board before `claim` changes nothing on it; order is free otherwise.
    await SCENES[name]({ browser, world, call });
  }
  writeManifest();
  writeFileSync(
    join(OUT, "world.json"),
    JSON.stringify({ invite: { board: world.open.name, id: world.open.id }, live: { name: world.live.name, prizes: world.live.prizes, scores: world.live.scores } }, null, 2),
  );
} finally {
  await browser.close();
  stopServer();
}
