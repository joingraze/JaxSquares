// Seeds realistic boards through the public API, then captures every screen a
// critic judges at iPhone size (390x844 @3x = 1170x2532, the same pixel size as
// an iPhone 13/14 screenshot).
//
//   BASE=http://127.0.0.1:5190 OUT=bar/ours node e2e/capture.mjs [screen ...]
//
// Screens: home-empty, home, create, create-format, checkout, invite, board-newcomer,
// join, board-open, board-locked, board-live, board-final, host, notify, profile.

import { chromium, devices } from "@playwright/test";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE ?? "http://127.0.0.1:5190";
const OUT = process.env.OUT ?? "bar/ours";
const EXECUTABLE = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const only = new Set(process.argv.slice(2));
const want = (name) => only.size === 0 || only.has(name);
mkdirSync(OUT, { recursive: true });

const iPhone = { ...devices["iPhone 13"], viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 };

// ---- API seeding ----

const uuid = () => crypto.randomUUID();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
/** Retries for a 5xx: dev servers running side by side share the local D1 file and can hit SQLITE_BUSY. */
const RETRIES = 3;

async function call(method, path, { client, admin, body } = {}) {
  const headers = { "content-type": "application/json" };
  if (client) headers["x-client-id"] = client;
  if (admin) headers["x-admin-token"] = admin;
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(BASE + "/api" + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const data = await res.json().catch(() => ({}));
    if (res.status >= 500 && attempt < RETRIES) {
      // A failed D1 batch commits nothing, so a retry can't double a claim or a score.
      await sleep(200 * 2 ** attempt);
      continue;
    }
    if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${JSON.stringify(data)}`);
    return data;
  }
}

const FRIENDS = [
  { name: "Maya", color: "#ff6b6b", emoji: "🦊" },
  { name: "Dre", color: "#4dabf7", emoji: "🐻" },
  { name: "Priya", color: "#ffd43b", emoji: "🌮" },
  { name: "Luis", color: "#69db7c", emoji: "🦖" },
  { name: "Tess", color: "#da77f2", emoji: "🎸" },
  { name: "Omar", color: "#ffa94d", emoji: "🚀" },
  { name: "Kim", color: "#63e6be", emoji: "🍩" },
];

async function createBoard(host, { name, teamX, teamY, format, prizes = {} }) {
  const created = await call("POST", "/games", {
    client: host.client,
    body: {
      name,
      sport: "football",
      league: "custom",
      teamX,
      teamY,
      format: { periods: "quarters", reverse: false, boardSize: 100, freshNumbers: false, ...format },
      prizes,
      maxPerPlayer: 0,
      linkedEvent: null,
      host: host.profile,
    },
  });
  const id = created.game.id;
  const admin = created.adminToken;
  await call("POST", `/games/${id}/pay/test`, { client: host.client, admin });
  return { id, admin };
}

/** Squares per claim request: a few requests per player instead of one per square. */
const CLAIM_BATCH = 8;

async function fill(id, players, count, size = 10) {
  const cells = [];
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) cells.push({ row: r, col: c });
  // Deterministic scatter so screenshots are stable.
  cells.sort((a, b) => ((a.row * 37 + a.col * 11) % 101) - ((b.row * 37 + b.col * 11) % 101));
  for (const p of players) await call("POST", `/games/${id}/join`, { client: p.client, body: p.profile });
  // Same owners as dealing one square at a time (square n goes to player n % players)...
  const dealt = players.map(() => []);
  for (let n = 0; n < Math.min(count, cells.length); n++) dealt[n % players.length].push(cells[n]);
  // ...claimed in batches, taking turns so the activity reads like people picking side by side.
  for (let from = 0; dealt.some((mine) => mine.length > from); from += CLAIM_BATCH) {
    for (const [k, p] of players.entries()) {
      const batch = dealt[k].slice(from, from + CLAIM_BATCH);
      if (batch.length) await call("POST", `/games/${id}/claim`, { client: p.client, body: { cells: batch } }).catch(() => {});
    }
  }
}

async function seed() {
  const me = { client: uuid(), profile: { name: "Jordan", color: "#c6f91f", emoji: "🏈" } };
  const friends = FRIENDS.map((profile) => ({ client: uuid(), profile }));
  const hostFriend = friends[1];

  // 1. A board I host that's filling up.
  const open = await createBoard(me, {
    name: "Sunday Night Squares",
    teamX: { name: "Chiefs", abbr: "KC", color: "#e31837" },
    teamY: { name: "Bills", abbr: "BUF", color: "#00338d" },
    prizes: { q1: "Loser buys wings", final: "Bragging rights till next season" },
  });
  await fill(open.id, [me, ...friends.slice(0, 5)], 58);

  // 2. A friend's board I'm in, numbers drawn, mid-game with winners.
  const live = await createBoard(hostFriend, {
    name: "Thanksgiving Showdown",
    teamX: { name: "Cowboys", abbr: "DAL", color: "#041e42" },
    teamY: { name: "Giants", abbr: "NYG", color: "#0b2265" },
    format: { reverse: true },
  });
  await fill(live.id, [me, hostFriend, ...friends.slice(2, 7)], 100);
  await call("POST", `/games/${live.id}/lock`, { client: hostFriend.client, admin: live.admin });
  await call("POST", `/games/${live.id}/scores`, { client: hostFriend.client, admin: live.admin, body: { periodKey: "q1", scoreX: 7, scoreY: 3 } });
  await call("POST", `/games/${live.id}/scores`, { client: hostFriend.client, admin: live.admin, body: { periodKey: "q2", scoreX: 14, scoreY: 10 } });

  // 3. A finished board.
  const done = await createBoard(me, {
    name: "Office Playoff Pool",
    teamX: { name: "Eagles", abbr: "PHI", color: "#004c54" },
    teamY: { name: "49ers", abbr: "SF", color: "#aa0000" },
    format: { periods: "halves" },
  });
  await fill(done.id, [me, ...friends], 100);
  await call("POST", `/games/${done.id}/lock`, { client: me.client, admin: done.admin });
  await call("POST", `/games/${done.id}/scores`, { client: me.client, admin: done.admin, body: { periodKey: "q2", scoreX: 17, scoreY: 13 } });
  await call("POST", `/games/${done.id}/scores`, { client: me.client, admin: done.admin, body: { periodKey: "final", scoreX: 27, scoreY: 24 } });

  return { me, friends, open, live, done };
}

// ---- Capture ----

async function contextFor(browser, device) {
  const ctx = await browser.newContext(iPhone);
  if (device) {
    await ctx.addInitScript((d) => {
      localStorage.setItem("jaxsquares.clientId", d.client);
      localStorage.setItem("jaxsquares.profile", JSON.stringify(d.profile));
      for (const [id, token] of Object.entries(d.admins ?? {})) localStorage.setItem(`jaxsquares.admin.${id}`, token);
      localStorage.setItem("jaxsquares.games", JSON.stringify(d.games ?? []));
    }, device);
  }
  await ctx.addInitScript(() => {
    navigator.share = async () => {};
  });
  return ctx;
}

async function snap(page, name) {
  await page.waitForTimeout(700); // let entrance animations settle
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log(`captured ${name}`);
}

const browser = await chromium.launch({ executablePath: EXECUTABLE });
try {
  const s = await seed();
  const meDevice = {
    client: s.me.client,
    profile: s.me.profile,
    admins: { [s.open.id]: s.open.admin, [s.done.id]: s.done.admin },
    games: [s.open.id, s.live.id, s.done.id],
  };

  if (want("home-empty")) {
    const ctx = await contextFor(browser, null);
    const page = await ctx.newPage();
    await page.goto(BASE + "/");
    await snap(page, "home-empty");
    await ctx.close();
  }

  const ctx = await contextFor(browser, meDevice);
  const page = await ctx.newPage();

  if (want("home")) {
    await page.goto(BASE + "/");
    await snap(page, "home");
  }
  if (want("create") || want("create-format") || want("checkout")) {
    await page.goto(BASE + "/new");
    await snap(page, "create");
    const custom = page.getByTestId("custom-matchup");
    if (await custom.count()) {
      await custom.first().tap();
      await page.getByTestId("team-x-input").first().fill("Packers");
      await page.getByTestId("team-y-input").first().fill("Bears");
    }
    await snap(page, "create-format");
    if (want("checkout")) {
      // Test mode creates the board in one tap (no checkout sheet); capture
      // whichever comes first: the checkout sheet or the new board's invite sheet.
      await page.getByTestId("create-submit").first().tap();
      await Promise.race([
        page.getByTestId("pay-confirm").first().waitFor({ timeout: 20000 }),
        page.getByTestId("invite-share").first().waitFor({ timeout: 20000 }),
      ]).catch(() => {});
      await snap(page, "checkout");
    }
  }
  if (want("invite")) {
    await page.goto(BASE + `/g/${s.open.id}?invite=1`);
    await page.getByTestId("invite-share").first().waitFor().catch(() => {});
    await snap(page, "invite");
  }
  if (want("board-open")) {
    await page.goto(BASE + `/g/${s.open.id}`);
    await snap(page, "board-open");
  }
  if (want("board-live")) {
    await page.goto(BASE + `/g/${s.live.id}`);
    await snap(page, "board-live");
  }
  if (want("board-final")) {
    await page.goto(BASE + `/g/${s.done.id}`);
    await snap(page, "board-final");
  }
  if (want("profile")) {
    await page.goto(BASE + "/me");
    await snap(page, "profile");
  }
  await ctx.close();

  if (want("board-newcomer") || want("join")) {
    const fresh = await contextFor(browser, null);
    const p = await fresh.newPage();
    await p.goto(BASE + `/g/${s.open.id}`);
    await snap(p, "board-newcomer");
    if (want("join")) {
      await p.locator('[data-testid="cell"][data-state="empty"]').first().tap();
      await p.getByTestId("join-name").first().waitFor().catch(() => {});
      await snap(p, "join");
    }
    await fresh.close();
  }
  console.log(JSON.stringify({ open: s.open.id, live: s.live.id, done: s.done.id }));
} finally {
  await browser.close();
}
