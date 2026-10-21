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
// The use-case scenes add a TV (TV mode on a 1280×720 screen, for the bar
// and watch-party Reels), basketball boards, a friend joining from the
// link on a fresh phone, and three phones on one board at once.
//
// Needs the local D1 migrated (npm run db:migrate:local). Starts a dev server
// on :5232 with VITE_PUBLIC_ORIGIN=https://jaxsquares.com if none is running.

import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { existsSync, linkSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { FRIENDS, makeApi, scoreEndingIn, seed } from "../../scripts/store/seed.mjs";
import { SIZES } from "../../scripts/store/capture.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = join(ROOT, "marketing/out/clips");
const BASE = process.env.BASE ?? "http://127.0.0.1:5232";
const FPS = 30;
const SPEC = SIZES["6.9"]; // 440×956 pt, Dynamic Island, @3x
const FRAME_WIDTH = 1080; // screencast frames are capped at this width (a 2× phone is 880)
const TV = { viewport: { width: 1280, height: 720 }, scale: 1, frameWidth: 1280 };
const TZ = "America/New_York";
const only = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const log = (...m) => console.log(...m);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- Guard: nothing here may show money talk, league marks or dev addresses.
// (Mirrors scripts/store/capture.mjs; the league tab is relabelled "Pro" there too.)
const BANNED = [
  /\bNFL\b/,
  /\bW?NBA\b/,
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
  const ev = (id, away, home, startsAt, league = "nfl") => ({
    eventId: `promo-${league}-${id}`,
    league,
    name: `${away.name} at ${home.name}`,
    shortName: `${away.abbr} @ ${home.abbr}`,
    startsAt,
    away,
    home,
    state: "pre",
  });
  const football = [
    ev(1, T.hawks, T.wolves, at(2, 13)),
    ev(2, T.comets, T.foxes, at(2, 13)),
    ev(3, T.otters, T.stags, at(2, 16, 25)),
    ev(4, T.bison, T.sharks, at(2, 20, 20)),
  ];
  // Basketball plays most nights: tonight's games, for the basketball Reel.
  const basketball = (league) => [
    ev(1, T.stags, T.hawks, at(0, 19, 30), league),
    ev(2, T.foxes, T.otters, at(0, 19, 30), league),
    ev(3, T.sharks, T.comets, at(0, 22), league),
    ev(4, T.wolves, T.bison, at(0, 22, 30), league),
  ];
  return (league) => {
    if (league === "nfl") return { events: football };
    if (["nba", "wnba", "ncaab", "ncaaw"].includes(league)) {
      const events = basketball(league);
      const day = new Date(events[0].startsAt).toISOString().slice(0, 10).replace(/-/g, "");
      return { events, dates: [day] };
    }
    return { events: [] };
  };
}

/** A phone (or, with `tv`, a 1280×720 screen) signed in as `device`. A device without a profile is a stranger's fresh phone. */
async function phone(browser, world, device, { tv = false } = {}) {
  const ctx = await browser.newContext({
    viewport: tv ? TV.viewport : SPEC.device,
    deviceScaleFactor: tv ? TV.scale : SPEC.scale,
    isMobile: !tv,
    hasTouch: !tv,
    locale: "en-US",
    timezoneId: TZ,
    colorScheme: "dark",
    reducedMotion: "no-preference",
  });
  await ctx.grantPermissions(["notifications"], { origin: new URL(BASE).origin });
  const games = schedule(world);
  await ctx.route("**/api/schedule**", (route) => route.fulfill({ json: games(new URL(route.request().url()).searchParams.get("league")) }));
  // League names are trademarks: like the store art, the picker's tabs read "Pro" (rewritten as they render).
  await ctx.addInitScript(() => {
    const swap = (t) => t.replace(/\bWNBA\b/g, "Women's pro").replace(/\b(NFL|NBA)\b/g, "Pro");
    const fix = (n) => {
      if (n.nodeType === 3) {
        const v = swap(n.nodeValue ?? "");
        if (v !== n.nodeValue) n.nodeValue = v;
      } else if (n.nodeType === 1) {
        const w = document.createTreeWalker(n, NodeFilter.SHOW_TEXT);
        for (let t = w.nextNode(); t; t = w.nextNode()) fix(t);
      }
    };
    new MutationObserver((list) => {
      for (const m of list) {
        if (m.type === "characterData") fix(m.target);
        else m.addedNodes.forEach(fix);
      }
    }).observe(document, { subtree: true, childList: true, characterData: true });
  });
  await ctx.addInitScript(
    ({ d }) => {
      if (!sessionStorage.getItem("promo.seeded")) {
        sessionStorage.setItem("promo.seeded", "1");
        localStorage.setItem("jaxsquares.clientId", d.client);
        if (d.profile) localStorage.setItem("jaxsquares.profile", JSON.stringify(d.profile));
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
  if (!tv) {
    const { top, bottom } = SPEC.insets;
    await cdp.send("Emulation.setSafeAreaInsetsOverride", {
      insets: { top, topMax: top, bottom, bottomMax: bottom, left: 0, leftMax: 0, right: 0, rightMax: 0 },
    });
  }
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
async function record(cdp, scene, width = FRAME_WIDTH) {
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
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 88, maxWidth: width, maxHeight: 4000, everyNthFrame: 1 });
  const startedAt = Date.now() / 1000;
  return {
    /** `info` (scores, names...) goes into clip.json for the studio's captions. */
    async stop(info = {}) {
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
      writeFileSync(join(dir, "clip.json"), JSON.stringify({ scene, frames: n, fps: FPS, width, sourceFrames: frames.length, ...info }, null, 2));
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

// ---- Use-case boards ------------------------------------------------------

/** Players on their own phones, in the seed's player colors. */
const people = (names) =>
  names.map((name, i) => ({ client: crypto.randomUUID(), profile: { name, color: FRIENDS[i % FRIENDS.length].color, emoji: FRIENDS[i % FRIENDS.length].emoji } }));

/** A stranger's phone: no name yet, no boards. */
const fresh = () => ({ client: crypto.randomUUID(), profile: null, games: [] });

/** The bar's regulars (the first one, behind the bar, hosts). */
const BAR_CROWD = ["Kev", "Rosa", "Big Mike", "Dee", "Coach", "Nina", "Tommy", "Jules", "Marco", "Kat"];
/** Nothing to buy: a Just for fun board's prizes are bragging rights. */
const BAR_PRIZES = { q1: "Name on the chalkboard", q2: "Picks the halftime playlist", q3: "Name on the chalkboard", final: "Bragging rights + the trophy cup" };
/** The bar's board: the same game in both TV scenes. */
const barBoard = (world) => ({ name: "Corner Pub Game Night", teamX: world.teams.hawks, teamY: world.teams.wolves, prizes: BAR_PRIZES });

/** Board cells in a stable, scattered order (as the seed fills its boards). */
function scatter(salt = 0) {
  const cells = [];
  for (let r = 0; r < 10; r++) for (let c = 0; c < 10; c++) cells.push({ row: r, col: c });
  const key = ({ row, col }) => (row * 37 + col * 11 + salt * 17) % 101;
  return cells.sort((a, b) => key(a) - key(b) || a.row - b.row || a.col - b.col);
}

/** A paid 10×10 board `host` runs; everyone joins and `counts[i]` squares go to `players[i]`. */
async function makeBoard(call, host, { name, sport = "football", teamX, teamY, prizes = {} }, players, counts, salt = 0) {
  const created = await call("POST", "/games", {
    device: host,
    body: {
      name,
      sport,
      league: "custom",
      teamX,
      teamY,
      format: { periods: "quarters", reverse: false, boardSize: 100, freshNumbers: false },
      prizes,
      maxPerPlayer: 0,
      linkedEvent: null,
      host: host.profile,
    },
  });
  const board = { id: created.game.id, admin: created.adminToken, host, name };
  await call("POST", `/games/${board.id}/pay/test`, { device: host, admin: board.admin });
  for (const p of players) await call("POST", `/games/${board.id}/join`, { device: p, body: p.profile });
  const cells = scatter(salt);
  let i = 0;
  for (let p = 0; p < players.length; p++) {
    const mine = cells.slice(i, i + counts[p]);
    i += counts[p];
    if (mine.length) await call("POST", `/games/${board.id}/claim`, { device: players[p], body: { cells: mine } });
  }
  board.lock = async () => (await call("POST", `/games/${board.id}/lock`, { device: host, admin: board.admin })).state;
  board.score = (periodKey, scoreX, scoreY) => call("POST", `/games/${board.id}/scores`, { device: host, admin: board.admin, body: { periodKey, scoreX, scoreY } });
  board.openCells = async () => {
    const st = await call("GET", `/games/${board.id}`);
    const taken = new Set(st.squares.map((q) => `${q.row},${q.col}`));
    return scatter(salt + 3).filter((c) => !taken.has(`${c.row},${c.col}`));
  };
  return board;
}

/** The lowest score at least `min` that ends in `digit` (basketball: any number will do). */
const endingIn = (digit, min) => min + ((digit - (min % 10) + 10) % 10);

/** Of `name`'s squares on a drawn board, the cheapest basketball score at least `min` on each side (never a tie). */
function hoopScore(st, name, min) {
  const pid = st.players.find((p) => p.name === name)?.id;
  const digits = (cell) => ({ x: st.game.numbers["*"].x[cell.col][0], y: st.game.numbers["*"].y[cell.row][0] });
  return st.squares
    .filter((s) => s.playerId === pid)
    .map((cell) => {
      const d = digits(cell);
      const x = endingIn(d.x, min.x);
      const y = endingIn(d.y, min.y);
      return { cell, x, y, cost: x + y + (x === y ? 50 : 0) };
    })
    .sort((a, b) => a.cost - b.cost)[0];
}

/** Of `name`'s squares on a drawn football board, a believable score at least `min` on each side. */
function footballScore(st, name, min) {
  return squareScore(st, name, min);
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

  // ---- Use cases ----

  /** TV mode at the bar, squares open: the big QR code, and the board filling as the room scans in. */
  async "tv-open"({ browserAt, world, call }) {
    const browser = await browserAt(1); // the TV fills a third of the Reel: 1280×720 is plenty
    const crowd = people(BAR_CROWD);
    const board = await makeBoard(call, crowd[0], barBoard(world), crowd, [4, 4, 3, 4, 3, 3, 4, 3, 3, 3], 2);
    const open = await board.openCells();
    const { ctx, page, cdp } = await phone(browser, world, fresh(), { tv: true });
    await page.goto(`${BASE}/g/${board.id}/tv`);
    await page.getByTestId("tv-qr").first().waitFor();
    await page.mouse.move(1270, 10);
    await settle(page, 4200); // the toolbar hides itself
    const rec = await record(cdp, "tv-open", TV.frameWidth);
    await sleep(1400);
    for (let i = 0; i < 34; i++) {
      await call("POST", `/games/${board.id}/claim`, { device: crowd[(i * 3) % crowd.length], body: { cells: [open[i]] } }).catch(() => {});
      await sleep(190);
    }
    await sleep(1600);
    await guard(page, "tv-open");
    await rec.stop({ board: board.name });
    await ctx.close();
  },

  /** TV mode at the bar, game on: the host draws (from their phone), then the first quarter lands and the TV celebrates. */
  async "tv-game"({ browserAt, world, call }) {
    const browser = await browserAt(1);
    const crowd = people(BAR_CROWD);
    const board = await makeBoard(call, crowd[0], barBoard(world), crowd, Array(10).fill(10), 4);
    const { ctx, page, cdp } = await phone(browser, world, fresh(), { tv: true });
    await page.goto(`${BASE}/g/${board.id}/tv`);
    await page.getByTestId("tv-board").first().waitFor();
    await page.mouse.move(1270, 10);
    await settle(page, 4200);
    const rec = await record(cdp, "tv-game", TV.frameWidth);
    await sleep(1500);
    const st = await board.lock();
    await sleep(4500);
    const q1 = footballScore(st, "Rosa", { x: 7, y: 3 });
    await board.score("q1", q1.x, q1.y);
    await page.getByTestId("tv-celebrate").first().waitFor({ timeout: 10000 }).catch(() => {});
    await sleep(9500);
    await guard(page, "tv-game");
    await rec.stop({ board: board.name, q1: { x: q1.x, y: q1.y, winner: "Rosa" } });
    await ctx.close();
  },

  /** Making a basketball board: the Basketball tab, tonight's games, five steps. */
  async "hoops-create"({ browser, world }) {
    const { ctx, page, cdp } = await phone(browser, world, deviceFor(world, world.me, [world.live, world.done, world.pick, world.draw]));
    await page.goto(`${BASE}/new`);
    await page.getByTestId("game-option").first().waitFor();
    await settle(page, 600);
    const rec = await record(cdp, "hoops-create");
    await sleep(900);
    await page.getByTestId("sport-basketball").first().click();
    await page.getByTestId("day-list").first().waitFor();
    await sleep(1200);
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
    await guard(page, "hoops-create (review)");
    await page.getByTestId("create-submit").first().click();
    await page.locator('[data-testid="cell"]').first().waitFor({ timeout: 15000 });
    await sleep(2200);
    await guard(page, "hoops-create");
    await rec.stop();
    await ctx.close();
  },

  /** A basketball board mid-game: the third quarter ends on my square. */
  async "hoops-live"({ browser, world, call }) {
    const [maya, dre, priya, luis, tess, omar, kim, sam, ava] = world.friends;
    const T = world.teams;
    const players = [maya, world.me, dre, priya, luis, tess, omar, kim, sam, ava];
    const board = await makeBoard(
      call,
      maya,
      {
        name: "Hoops Night",
        sport: "basketball",
        teamX: T.stags,
        teamY: T.hawks,
        prizes: { q1: "Loser buys the pizza", q2: "Winner picks the halftime snack", q3: "Winner skips dish duty", final: "Trophy mug + bragging rights" },
      },
      players,
      Array(10).fill(10),
      6,
    );
    const st = await board.lock();
    const q1 = hoopScore(st, "Priya", { x: 24, y: 21 });
    await board.score("q1", q1.x, q1.y);
    const q2 = hoopScore(st, "Dre", { x: q1.x + 24, y: q1.y + 24 });
    await board.score("q2", q2.x, q2.y);
    const q3 = hoopScore(st, world.me.profile.name, { x: q2.x + 24, y: q2.y + 22 });
    const dev = deviceFor(world, world.me, [world.live, world.pick]);
    dev.games = [board.id, ...dev.games];
    const { ctx, page, cdp } = await phone(browser, world, dev);
    await page.goto(`${BASE}/g/${board.id}`);
    await page.locator('[data-testid="cell"]').first().waitFor();
    await settle(page, 1200);
    const rec = await record(cdp, "hoops-live");
    await sleep(1800);
    await board.score("q3", q3.x, q3.y);
    await sleep(5200);
    await guard(page, "hoops-live");
    const at = (q) => ({ x: q.x, y: q.y });
    await rec.stop({ board: board.name, scores: { q1: at(q1), q2: at(q2), q3: at(q3) } });
    await ctx.close();
  },

  /** A friend opens the link on a phone that's never seen JaxSquares: two squares, a name, done. */
  async join({ browser, world, call }) {
    const [maya, dre, priya, luis, tess, omar] = world.friends;
    const T = world.teams;
    const players = [maya, dre, priya, luis, tess, omar];
    const board = await makeBoard(
      call,
      maya,
      { name: "Saturday Squares", teamX: T.comets, teamY: T.otters, prizes: { q1: "Loser buys wings", final: "Bragging rights till next season" } },
      players,
      [8, 7, 7, 6, 6, 6],
      7,
    );
    // Two open squares in the middle of the board, on screen without scrolling.
    const wanted = (await board.openCells())
      .filter((c) => c.row >= 2 && c.row <= 5 && c.col >= 1 && c.col <= 8)
      .slice(0, 2)
      .map((c) => [c.row, c.col]);
    const { ctx, page, cdp } = await phone(browser, world, fresh());
    await page.goto(`${BASE}/g/${board.id}`);
    await page.locator('[data-testid="cell"]').first().waitFor();
    await settle(page, 1200);
    const rec = await record(cdp, "join");
    const cell = ([row, col]) => page.locator(`[data-testid="cell"][data-row="${row}"][data-col="${col}"]`);
    await sleep(1500);
    // A newcomer's first square opens "What should we call you?" right away.
    await cell(wanted[0]).click();
    const name = page.locator('input[data-testid="join-name"], [data-testid="join-name"] input').first();
    await name.waitFor();
    await sleep(1000);
    await name.pressSequentially("Sam", { delay: 160 });
    await sleep(700);
    await page.getByTestId("join-submit").first().click();
    await sleep(2200);
    // Then one more, the way everyone on the board picks.
    await cell(wanted[1]).click();
    await sleep(800);
    await page.getByTestId("claim-submit").first().click({ timeout: 5000 });
    await sleep(2600);
    await guard(page, "join");
    await rec.stop({ board: board.name, cells: wanted });
    await ctx.close();
  },

  /** One board on three phones at once: the third quarter lands on Maya's square and every phone has it. */
  async sync({ browserAt, world, call }) {
    const browser = await browserAt(1.5); // three small phones at once
    const [maya, dre, priya, luis, tess, omar, kim, sam, ava] = world.friends;
    const T = world.teams;
    const players = [maya, world.me, dre, priya, luis, tess, omar, kim, sam, ava];
    const board = await makeBoard(
      call,
      dre,
      {
        name: "Group Chat Squares",
        teamX: T.bison,
        teamY: T.sharks,
        prizes: { q1: "Loser buys wings", q2: "Winner picks the playlist", q3: "Winner skips dish duty", final: "Trophy mug + bragging rights" },
      },
      players,
      Array(10).fill(10),
      8,
    );
    const st = await board.lock();
    const q1 = footballScore(st, "Priya", { x: 3, y: 0 });
    await board.score("q1", q1.x, q1.y);
    const q2 = footballScore(st, "Omar", { x: q1.x + 3, y: q1.y + 3 });
    await board.score("q2", q2.x, q2.y);
    const q3 = footballScore(st, "Maya", { x: q2.x + 3, y: q2.y });
    const phones = [];
    for (const [who, scene] of [[dre, "sync-left"], [maya, "sync-center"], [world.me, "sync-right"]]) {
      const dev = { client: who.client, profile: who.profile, admins: who === dre ? { [board.id]: board.admin } : {}, games: [board.id] };
      const p = await phone(browser, world, dev);
      await p.page.goto(`${BASE}/g/${board.id}`);
      await p.page.locator('[data-testid="cell"]').first().waitFor();
      phones.push({ ...p, scene });
    }
    await Promise.all(phones.map((p) => settle(p.page, 1500)));
    const recs = await Promise.all(phones.map((p) => record(p.cdp, p.scene)));
    await sleep(1800);
    await board.score("q3", q3.x, q3.y);
    await sleep(5600);
    for (const p of phones) await guard(p.page, p.scene);
    const info = { board: board.name, winner: "Maya", scores: { q1: { x: q1.x, y: q1.y }, q2: { x: q2.x, y: q2.y }, q3: { x: q3.x, y: q3.y } } };
    for (const r of recs) await r.stop(info);
    for (const p of phones) await p.ctx.close();
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
// Headless screencasts come at 1 px per CSS px unless the scale is forced. Sharper costs frames: one phone
// at 2× still gets ~26 fps here, but 3× drops to ~6, and three phones (or a TV) at 2× to ~12. So each scene
// picks its scale: a browser per scale, launched when first asked for.
const browsers = new Map();
function browserAt(scale) {
  if (!browsers.has(scale))
    browsers.set(
      scale,
      chromium.launch({
        args: [`--force-device-scale-factor=${scale}`],
        executablePath: process.env.CHROMIUM_PATH ?? (existsSync("/opt/pw-browsers/chromium-1194/chrome-linux/chrome") ? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" : undefined),
      }),
    );
  return browsers.get(scale);
}
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
    await SCENES[name]({ browser: await browserAt(2), browserAt, world, call });
  }
  writeManifest();
  // world.json describes the invite and live clips: rewrite it only with them (a new seed draws new numbers).
  if (todo.includes("invite") || todo.includes("live")) {
    writeFileSync(
      join(OUT, "world.json"),
      JSON.stringify({ invite: { board: world.open.name, id: world.open.id }, live: { name: world.live.name, prizes: world.live.prizes, scores: world.live.scores } }, null, 2),
    );
  }
} finally {
  for (const b of browsers.values()) await (await b).close();
  stopServer();
}
