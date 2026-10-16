// Drives the real app (a running dev server) to each App Store moment and
// screenshots the phone screen. One browser context per device, so each shot
// is what that person would see: the phone's owner ("Jordan"), or a friend
// opening an invite for the first time.
//
// Screens are captured at the device's full point size at @3x, with the
// iPhone's safe areas emulated (env(safe-area-inset-*)), so the app lays out
// exactly as it does under the status bar and home indicator. The composer
// draws a clean status bar and home indicator into those insets.

import { generateKeyPairSync } from "node:crypto";
import { readFileSync } from "node:fs";
import { TEAMS } from "./seed.mjs";

/** iPhone sizes App Store Connect asks for. Insets are the safe areas in points. */
export const SIZES = {
  // iPhone 17 Pro Max class (Dynamic Island).
  "6.9": { label: "6.9-inch", device: { width: 440, height: 956 }, insets: { top: 62, bottom: 34 }, island: true, scale: 3, out: { width: 1320, height: 2868 } },
  // iPhone 11 Pro Max / XS Max class (notch).
  "6.5": { label: "6.5-inch", device: { width: 414, height: 896 }, insets: { top: 44, bottom: 34 }, island: false, scale: 3, out: { width: 1242, height: 2688 } },
};

const TZ = "America/New_York";

/** Pro-league nicknames from the custom-matchup autocomplete (shared/teams.ts): none may appear in store art. */
const LEAGUE_NICKNAMES = [...readFileSync(new URL("../../shared/teams.ts", import.meta.url), "utf8").matchAll(/nickname: "([^"]+)"/g)].map((m) => m[1]);

/** Text that must never show in a store screenshot: marks, dev addresses, test labels, money talk. */
const BANNED = [
  /\bNFL\b/,
  /super ?bowl/i,
  /127\.0\.0\.1|localhost|:\d{4}\//,
  /test (mode|checkout)/i,
  /\$\s?\d/,
  /\b(bets?|betting|wagers?|gambl\w*|pots?|payouts?|odds|buy-ins?)\b/i,
  ...LEAGUE_NICKNAMES.map((n) => new RegExp(`\\b${n}\\b`)),
];

/** Epoch ms for a wall-clock time in New York, `days` from today. */
function nyTime(days, hour, minute = 0) {
  const d = new Date(Date.now() + days * 86_400_000);
  const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);
  const offset = new Intl.DateTimeFormat("en-US", { timeZone: TZ, timeZoneName: "shortOffset" })
    .formatToParts(d)
    .find((p) => p.type === "timeZoneName")
    .value.replace("GMT", "");
  const sign = offset.startsWith("-") ? "-" : "+";
  const hours = String(Math.abs(parseInt(offset, 10) || 0)).padStart(2, "0");
  return Date.parse(`${ymd}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00${sign}${hours}:00`);
}

/** A believable week of fictional games for the create screen's game picker. */
function fictionalSchedule(league) {
  const t = (name) => ({ ...TEAMS[name] });
  const ev = (id, away, home, startsAt) => ({
    eventId: `store-${league}-${id}`,
    league,
    name: `${TEAMS[away].name} at ${TEAMS[home].name}`,
    shortName: `${TEAMS[away].abbr} @ ${TEAMS[home].abbr}`,
    startsAt,
    away: t(away),
    home: t(home),
    state: "pre",
  });
  if (league === "nfl") {
    return [
      ev(1, "hawks", "wolves", nyTime(2, 13)),
      ev(2, "comets", "foxes", nyTime(2, 13)),
      ev(3, "otters", "stags", nyTime(2, 16, 25)),
      ev(4, "bison", "sharks", nyTime(2, 20, 20)),
      ev(5, "wolves", "comets", nyTime(3, 20, 15)),
    ];
  }
  return [ev(1, "stags", "bison", nyTime(1, 12)), ev(2, "sharks", "otters", nyTime(1, 15, 30)), ev(3, "foxes", "hawks", nyTime(1, 19))];
}

/** A real P-256 key, so the app sees web push as configured and shows "alerts are on" like the iPhone app does. */
function vapidKey() {
  const { publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const jwk = publicKey.export({ format: "jwk" });
  const raw = Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x, "base64url"), Buffer.from(jwk.y, "base64url")]);
  return raw.toString("base64url");
}

export async function captureScreens({ browser, base, size, world, only, out, log = () => {} }) {
  const spec = SIZES[size];
  const viewport = { ...spec.device };
  const want = (name) => !only || only.has(name);
  const shots = {};
  const vapid = vapidKey();
  const origin = new URL(base).origin;

  const myDevice = {
    client: world.me.client,
    profile: world.me.profile,
    admins: { [world.draw.id]: world.draw.admin },
    games: ["live", "done", "pick", "draw"].map((k) => world[k].id),
  };
  const inviterDevice = {
    client: world.inviter.client,
    profile: world.inviter.profile,
    admins: { [world.open.id]: world.open.admin },
    games: [world.open.id],
  };

  async function phone(device, { motion = false } = {}) {
    const ctx = await browser.newContext({
      viewport,
      deviceScaleFactor: spec.scale,
      isMobile: true,
      hasTouch: true,
      locale: "en-US",
      timezoneId: TZ,
      colorScheme: "dark",
      reducedMotion: motion ? "no-preference" : "reduce",
    });
    // The screenshot phone has notifications allowed, like the iPhone app after its first ask.
    await ctx.grantPermissions(["notifications"], { origin });
    await ctx.route("**/api/config", async (route) => {
      const res = await route.fetch();
      const json = await res.json();
      await route.fulfill({ response: res, json: { ...json, vapidPublicKey: json.vapidPublicKey ?? vapid } });
    });
    await ctx.route("**/api/schedule**", (route) => {
      const league = new URL(route.request().url()).searchParams.get("league") ?? "nfl";
      return route.fulfill({ json: { events: fictionalSchedule(league) } });
    });
    await ctx.addInitScript(
      ({ d }) => {
        // Seed this device once per context (later navigations keep what the app wrote).
        if (d && !sessionStorage.getItem("store.seeded")) {
          sessionStorage.setItem("store.seeded", "1");
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
    const { top, bottom } = spec.insets;
    await cdp.send("Emulation.setSafeAreaInsetsOverride", {
      insets: { top, topMax: top, bottom, bottomMax: bottom, left: 0, leftMax: 0, right: 0, rightMax: 0 },
    });
    return { ctx, page };
  }

  /** Waits for the app to paint (fonts, images, entrance animations). */
  async function settle(page, ms = 900) {
    await page.evaluate(() => document.fonts.ready);
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(ms);
  }

  async function shoot(page, name, extra = {}) {
    const text = await page.evaluate(() => document.body.innerText);
    const hit = BANNED.map((re) => text.match(re)?.[0]).find(Boolean);
    if (hit) {
      const fix = /127\.0\.0\.1|localhost|:\d{4}\//.test(hit)
        ? "Start the dev server with VITE_PUBLIC_ORIGIN=https://jaxsquares.com, or let generate.mjs start one."
        : "Change the seed data or the capture.";
      throw new Error(`"${name}" shows "${hit}", which can't go in store art. ${fix}`);
    }
    const file = `${out}/${name}.png`;
    await page.screenshot({ path: file, animations: extra.animations ?? "allow" });
    shots[name] = { file, ...extra.meta };
    log(`    ${name}`);
  }

  /** Box of a locator in screen points, for the composer's call-outs. */
  async function box(locator) {
    const b = await locator.first().boundingBox().catch(() => null);
    return b ? { x: b.x, y: b.y, width: b.width, height: b.height } : null;
  }

  /** League names are trademarks: the store art calls the pro tab "Pro". The games in it are fictional. */
  async function genericLeagueLabels(page) {
    await page.evaluate(() => {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if (n.nodeValue && /\bNFL\b/.test(n.nodeValue)) n.nodeValue = n.nodeValue.replace(/\bNFL\b/g, "Pro");
      }
    });
  }

  // ---- 01 Create: the soonest game is already picked; one tap opens the board.
  if (want("create")) {
    const { ctx, page } = await phone(myDevice);
    await page.goto(`${base}/new`);
    await page.getByTestId("game-option").first().waitFor();
    await settle(page, 500);
    // Open the formats so the screen shows how the board can play.
    await page.getByText("Change", { exact: true }).first().click();
    await page.evaluate(() => window.scrollTo(0, 0));
    await settle(page);
    await genericLeagueLabels(page);
    await shoot(page, "create");
    await ctx.close();
  }

  // ---- 02 Invite: the text-first share sheet on a board I host.
  if (want("invite")) {
    const { ctx, page } = await phone(inviterDevice);
    await page.goto(`${base}/g/${world.open.id}?invite=1`);
    await page.getByTestId("invite-share").first().waitFor();
    await settle(page, 1400);
    await shoot(page, "invite");
    await ctx.close();
  }

  // ---- 03 Claim: a friend's board, three open squares tapped, the claim bar up.
  if (want("claim")) {
    const { ctx, page } = await phone(myDevice);
    await page.goto(`${base}/g/${world.pick.id}`);
    await page.locator('[data-testid="cell"]').first().waitFor();
    await settle(page);
    const empty = page.locator('[data-testid="cell"][data-state="empty"]');
    const picks = world.pick.cells ?? [];
    for (const { row, col } of picks) await page.locator(`[data-testid="cell"][data-row="${row}"][data-col="${col}"]`).click();
    if (picks.length === 0) for (let i = 0; i < 3; i++) await empty.nth(i * 7).click();
    await settle(page, 700);
    await shoot(page, "claim");
    await ctx.close();
  }

  // ---- 05 Live: a friend's board mid-game; my square holds the latest score.
  if (want("live")) {
    const { ctx, page } = await phone(myDevice);
    await page.goto(`${base}/g/${world.live.id}`);
    await page.locator('[data-testid="cell"]').first().waitFor();
    await settle(page, 1200);
    await shoot(page, "live");
    await ctx.close();
  }

  // ---- 06 Home: every board, grouped by what it needs.
  if (want("home") || want("inbox")) {
    const { ctx, page } = await phone(myDevice);
    await page.goto(`${base}/`);
    await page.getByText("Live now", { exact: false }).first().waitFor();
    await settle(page, 1200);
    if (want("home")) await shoot(page, "home");
    // ---- 07 Inbox: wins, numbers and friends across every board.
    if (want("inbox")) {
      await page.getByRole("button", { name: /Activity/ }).first().click();
      await settle(page, 1000);
      // The composer hangs the push banner just above the sheet's title.
      const title = await box(page.getByRole("dialog").getByText("Activity", { exact: true }));
      await shoot(page, "inbox", { meta: { anchor: title } });
    }
    await ctx.close();
  }

  // ---- 04 Reveal: the host locks a full board and the numbers land live.
  if (want("reveal")) {
    const { ctx, page } = await phone(myDevice, { motion: true });
    await page.goto(`${base}/g/${world.draw.id}`);
    await page.getByTestId("host-bar-action").first().waitFor();
    await settle(page);
    await page.getByTestId("host-bar-action").first().click();
    await page.getByTestId("host-lock-confirm").first().waitFor();
    await page.waitForTimeout(500);
    await page.getByTestId("host-lock-confirm").first().click();
    // Every reel has landed; catch the confetti mid-air with the buttons faded in.
    await page.getByText("The numbers are in!").first().waitFor({ timeout: 15000 });
    await page.waitForTimeout(1600);
    await shoot(page, "reveal");
    await ctx.close();
  }

  return shots;
}
