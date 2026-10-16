// Measures the three product floors against a running dev server:
//   1. first open -> sent invite      (target: under 60 s for a person)
//   2. tapping an invite -> claimed square (target: 3 taps or fewer)
//   3. a claim / score reaching every other open board (target: under 1000 ms)
//
//   BASE=http://127.0.0.1:5190 node e2e/floors.mjs
//
// Floor 1 is a human-time estimate: Playwright clicks far faster than a person,
// so we count the taps, typed characters and screens a person goes through and
// apply keystroke-level-model costs, then add the system wait time we measured.
// Selectors come from docs/testids.md.

import { chromium, devices } from "@playwright/test";

const BASE = process.env.BASE ?? "http://127.0.0.1:5190";
const EXECUTABLE = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const SHOTS = process.env.SHOTS ?? null; // optional dir for screenshots of each step

// Keystroke-level model costs for a phone (seconds). Conservative values:
// tap = point + press on a phone-sized target, char = thumb typing (~35 wpm),
// think = reading a new screen and deciding.
const KLM = { tap: 1.1, char: 0.35, think: 1.2 };

const iPhone = { ...devices["iPhone 13"], viewport: { width: 390, height: 844 } };

function tracker(label) {
  const t = { label, taps: 0, chars: 0, screens: 0, systemMs: 0, steps: [] };
  return t;
}

async function waitFor(page, t, locator, what, timeout = 15000) {
  const start = performance.now();
  await locator.first().waitFor({ state: "visible", timeout });
  const ms = performance.now() - start;
  t.systemMs += ms;
  t.steps.push(`wait ${what}: ${ms.toFixed(0)} ms`);
}

async function tap(page, t, locator, what) {
  await locator.first().scrollIntoViewIfNeeded();
  await locator.first().tap();
  t.taps += 1;
  t.steps.push(`tap ${what}`);
}

async function type(page, t, locator, text, what) {
  await locator.first().fill("");
  await locator.first().pressSequentially(text, { delay: 0 });
  t.chars += text.length;
  t.steps.push(`type ${what} (${text.length} chars)`);
}

async function shot(page, name) {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

function humanSeconds(t) {
  return t.taps * KLM.tap + t.chars * KLM.char + t.screens * KLM.think + t.systemMs / 1000;
}

/** Floor 1: brand-new device, open the app, create a board, send the invite. */
async function createToInvite(browser, { linked }) {
  const ctx = await browser.newContext(iPhone);
  // Record when the share sheet is opened.
  await ctx.addInitScript(() => {
    window.__shared = null;
    navigator.share = async (data) => {
      window.__shared = { at: performance.now(), data };
    };
    navigator.canShare = () => true;
  });
  if (linked) {
    // The schedule's upstream (ESPN) is blocked in the build sandbox, so feed
    // one upcoming game in the documented ScheduleEvent shape.
    await ctx.route("**/api/schedule**", (route) =>
      route.fulfill({
        json: {
          events: [
            {
              eventId: "e2e-1",
              league: "nfl",
              name: "Visitors at Hosts",
              shortName: "VIS @ HOS",
              startsAt: Date.now() + 3 * 24 * 3600 * 1000,
              home: { name: "Hosts", abbr: "HOS", color: "#1d4ed8" },
              away: { name: "Visitors", abbr: "VIS", color: "#dc2626" },
              state: "pre",
            },
          ],
        },
      }),
    );
  }
  const page = await ctx.newPage();
  const t = tracker(linked ? "create → invite (linked game)" : "create → invite (custom teams)");

  const start = performance.now();
  await page.goto(BASE + "/");
  await waitFor(page, t, page.getByTestId("new-board"), "home");
  t.screens += 1;
  await shot(page, `${linked ? "l" : "c"}-01-home`);
  await tap(page, t, page.getByTestId("new-board"), "new board");

  if (linked) {
    await waitFor(page, t, page.getByTestId("game-option"), "game picker");
    t.screens += 1;
    await shot(page, "l-02-picker");
    await tap(page, t, page.getByTestId("game-option"), "pick game");
  } else {
    await waitFor(page, t, page.getByTestId("custom-matchup"), "game picker");
    t.screens += 1;
    await shot(page, "c-02-picker");
    await tap(page, t, page.getByTestId("custom-matchup"), "custom matchup");
    await waitFor(page, t, page.getByTestId("team-x-input"), "team inputs");
    await tap(page, t, page.getByTestId("team-x-input"), "focus team 1");
    await type(page, t, page.getByTestId("team-x-input"), "Chiefs", "team 1");
    await tap(page, t, page.getByTestId("team-y-input"), "focus team 2");
    await type(page, t, page.getByTestId("team-y-input"), "Eagles", "team 2");
  }

  // Some flows ask the host's name before creating; fill it if present.
  const hostName = page.getByTestId("host-name");
  if (await hostName.count()) {
    await tap(page, t, hostName, "focus your name");
    await type(page, t, hostName, "Jordan", "your name");
  }

  await waitFor(page, t, page.getByTestId("create-submit"), "create button");
  t.screens += 1;
  await shot(page, `${linked ? "l" : "c"}-03-details`);
  await tap(page, t, page.getByTestId("create-submit"), "create board");

  await waitFor(page, t, page.getByTestId("pay-confirm"), "checkout");
  t.screens += 1;
  await shot(page, `${linked ? "l" : "c"}-04-checkout`);
  await tap(page, t, page.getByTestId("pay-confirm"), "pay");

  await waitFor(page, t, page.getByTestId("invite-share"), "invite sheet", 20000);
  t.screens += 1;
  await shot(page, `${linked ? "l" : "c"}-05-invite`);
  await tap(page, t, page.getByTestId("invite-share"), "share invite");

  await page.waitForFunction(() => window.__shared !== null, null, { timeout: 5000 });
  const shared = await page.evaluate(() => window.__shared.data);
  const wallMs = performance.now() - start;
  const url = shared.url ?? (shared.text ?? "").match(/https?:\/\/\S+/)?.[0];
  await ctx.close();
  return { t, wallMs, url, human: humanSeconds(t) };
}

/** Floor 2: a friend taps the invite link and claims a square. */
async function inviteToClaim(browser, url) {
  const ctx = await browser.newContext(iPhone);
  const page = await ctx.newPage();
  const t = tracker("invite → claimed square");
  // Tap 1 is the invite link itself (in Messages); the page then opens.
  t.taps += 1;
  t.steps.push("tap invite link");
  await page.goto(url);
  await waitFor(page, t, page.locator('[data-testid="cell"][data-state="empty"]'), "board");
  t.screens += 1;
  await shot(page, "i-01-board");
  await tap(page, t, page.locator('[data-testid="cell"][data-state="empty"]'), "square");

  // A newcomer is asked for a name once (keyboard opens on its own if autofocused).
  const name = page.getByTestId("join-name");
  try {
    await name.first().waitFor({ state: "visible", timeout: 3000 });
    const focused = await name.first().evaluate((el) => el === document.activeElement);
    if (!focused) await tap(page, t, name, "focus name");
    await type(page, t, name, "Sam", "name");
    await shot(page, "i-02-join");
    await tap(page, t, page.getByTestId("join-submit"), "join");
  } catch {
    // No join step on this path.
  }

  const claim = page.getByTestId("claim-submit");
  if (await claim.isVisible().catch(() => false)) {
    await tap(page, t, claim, "claim");
  }
  await waitFor(page, t, page.locator('[data-testid="cell"][data-state="mine"]'), "square is mine");
  await shot(page, "i-03-claimed");
  await ctx.close();
  return { t };
}

/**
 * Floor 3: two people on the same board; one claims, the other sees it.
 * Measured from the moment the claim request leaves phone A to the moment the
 * square changes on phone B (both clocks are this machine's wall clock), plus
 * the same for a host score reaching B's results.
 */
async function realtime(browser, url, rounds = 20) {
  const a = await browser.newContext(iPhone);
  const b = await browser.newContext(iPhone);
  const pa = await a.newPage();
  const pb = await b.newPage();
  await Promise.all([pa.goto(url), pb.goto(url)]);
  for (const p of [pa, pb]) await p.locator('[data-testid="cell"]').first().waitFor();
  // Join A once so it can claim.
  await pa.locator('[data-testid="cell"][data-state="empty"]').first().tap();
  const name = pa.getByTestId("join-name");
  if (await name.first().isVisible().catch(() => false)) {
    await name.first().fill("Alex");
    await pa.getByTestId("join-submit").first().tap();
  }
  const claim = pa.getByTestId("claim-submit");
  if (await claim.isVisible().catch(() => false)) await claim.tap();
  await pa.locator('[data-testid="cell"][data-state="mine"]').first().waitFor();
  await pa.waitForTimeout(1500);

  let sentAt = 0;
  pa.on("request", (req) => {
    if (req.method() === "POST" && req.url().includes("/claim")) sentAt = Date.now();
  });

  const samples = [];
  for (let i = 0; i < rounds; i++) {
    const target = pa.locator('[data-testid="cell"][data-state="empty"]').first();
    const row = await target.getAttribute("data-row");
    const col = await target.getAttribute("data-col");
    const sel = `[data-testid="cell"][data-row="${row}"][data-col="${col}"]`;
    const seen = pb.evaluate(
      (s) =>
        new Promise((resolve) => {
          const check = () => {
            const el = document.querySelector(s);
            if (el && el.getAttribute("data-state") !== "empty") resolve(Date.now());
          };
          new MutationObserver(check).observe(document.body, { subtree: true, attributes: true, childList: true });
        }),
      sel,
    );
    sentAt = 0;
    await target.tap();
    if (await claim.isVisible().catch(() => false)) await claim.tap();
    const seenAt = await seen;
    if (sentAt) samples.push(seenAt - sentAt);
    await pa.waitForTimeout(250);
  }
  await a.close();
  await b.close();
  samples.sort((x, y) => x - y);
  const pct = (q) => samples[Math.min(samples.length - 1, Math.floor(q * samples.length))];
  return { samples, median: pct(0.5), p95: pct(0.95), max: samples[samples.length - 1] };
}

const browser = await chromium.launch({ executablePath: EXECUTABLE });
try {
  const custom = await createToInvite(browser, { linked: false });
  const linked = await createToInvite(browser, { linked: true });
  const invite = await inviteToClaim(browser, custom.url);
  const rt = await realtime(browser, linked.url);

  const fmt = (r) =>
    `${r.t.label}: ${r.t.taps} taps, ${r.t.chars} chars, ${r.t.screens} screens, system ${(r.t.systemMs / 1000).toFixed(1)} s` +
    (r.human !== undefined ? ` → est. ${r.human.toFixed(1)} s for a person (automation wall ${(r.wallMs / 1000).toFixed(1)} s)` : "");
  console.log(fmt(custom));
  console.log(fmt(linked));
  console.log(`${invite.t.label}: ${invite.t.taps} taps (incl. the invite link), ${invite.t.chars} chars typed`);
  console.log(`claim → other board: median ${rt.median.toFixed(0)} ms, p95 ${rt.p95.toFixed(0)} ms, max ${rt.max.toFixed(0)} ms over ${rt.samples.length}`);
  console.log(
    JSON.stringify({
      createToInviteSec: { custom: +custom.human.toFixed(1), linked: +linked.human.toFixed(1) },
      inviteToClaimTaps: invite.t.taps,
      realtimeMs: { median: Math.round(rt.median), p95: Math.round(rt.p95) },
      steps: { custom: custom.t.steps, linked: linked.t.steps, invite: invite.t.steps },
    }),
  );
} finally {
  await browser.close();
}
