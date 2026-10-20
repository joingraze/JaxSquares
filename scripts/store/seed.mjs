// Seeds the fictional boards the App Store screenshots are taken from, through
// the same public API the app uses. Every team, person and prize note here is
// made up: no league marks, no real teams, and never anything about money.
//
// Each board gets its own host device, so a rerun never trips the per-player
// "new boards per hour" rate limit, and claims go in batches (the squares
// limit is per request burst, not per square).

const uuid = () => crypto.randomUUID();

/** Fictional teams with made-up colors. Nicknames avoid every pro-league nickname. */
export const TEAMS = {
  hawks: { name: "Harbor Hawks", abbr: "HAR", color: "#3ab7ff" },
  wolves: { name: "Ridge Wolves", abbr: "RDG", color: "#ff66a6" },
  comets: { name: "Bay Comets", abbr: "BAY", color: "#9b6bff" },
  foxes: { name: "Mesa Foxes", abbr: "MSA", color: "#ff8a3d" },
  otters: { name: "Lakeside Otters", abbr: "LAK", color: "#1fd1c1" },
  stags: { name: "Summit Stags", abbr: "SUM", color: "#ff4757" },
  bison: { name: "Prairie Bison", abbr: "PRA", color: "#ffd23f" },
  sharks: { name: "Coastal Sharks", abbr: "CST", color: "#5b74ff" },
};

/** The phone the screenshots are taken on. */
export const ME = { name: "Jordan", color: "#ff6b35", emoji: "🏈" };

/** Friends, one per player color (src/lib/identity.ts PLAYER_COLORS). */
export const FRIENDS = [
  { name: "Maya", color: "#ff4f9a", emoji: "🦄" },
  { name: "Dre", color: "#38b6ff", emoji: "🐻" },
  { name: "Priya", color: "#ffd23f", emoji: "🌮" },
  { name: "Luis", color: "#34d07b", emoji: "🦖" },
  { name: "Tess", color: "#9b6bff", emoji: "🥳" },
  { name: "Omar", color: "#ffa26b", emoji: "🚀" },
  { name: "Kim", color: "#1fd1c1", emoji: "🍕" },
  { name: "Sam", color: "#5b74ff", emoji: "🦈" },
  { name: "Ava", color: "#ff4757", emoji: "👑" },
  { name: "Ben", color: "#e6ede8", emoji: "🐐" },
];

/** A plausible football score ending in each digit, low to high. */
const SCORES_BY_DIGIT = {
  0: [0, 10, 20, 30],
  1: [21, 31, 11],
  2: [12, 22, 32],
  3: [3, 13, 23, 33],
  4: [14, 24, 34],
  5: [15, 25, 35],
  6: [6, 16, 26, 36],
  7: [7, 17, 27, 37],
  8: [28, 18, 38],
  9: [9, 19, 29, 39],
};

/** Totals that come up all the time in football; anything else costs a little in bestSquare. */
const COMMON_SCORES = new Set([0, 3, 6, 7, 10, 13, 14, 16, 17, 20, 21, 23, 24, 27, 28, 30, 31, 34, 35, 38]);

/** The lowest plausible score ending in `digit` that is at least `min`. */
export function scoreEndingIn(digit, min = 0) {
  const options = SCORES_BY_DIGIT[digit].filter((s) => s >= min).sort((a, b) => a - b);
  return options[0] ?? min + ((digit - (min % 10) + 10) % 10);
}

export function makeApi(base) {
  async function call(method, path, { device, admin, body } = {}) {
    const headers = { "content-type": "application/json" };
    if (device) headers["x-client-id"] = device.client;
    if (admin) headers["x-admin-token"] = admin;
    // Local D1 is one SQLite file shared by every dev server on this checkout, so a
    // write can hit "database is locked" (500). Those writes rolled back: retry them.
    for (let attempt = 1; ; attempt++) {
      const res = await fetch(base + "/api" + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
      const data = await res.json().catch(() => ({}));
      if (res.ok) return data;
      if (res.status >= 500 && attempt < 6) {
        await new Promise((r) => setTimeout(r, 250 * attempt));
        continue;
      }
      throw new Error(`${method} ${path} -> ${res.status} ${JSON.stringify(data)}`);
    }
  }
  return call;
}

const device = (profile) => ({ client: uuid(), profile });

/** Board cells in a stable, scattered order so boards look hand-picked and screenshots are repeatable. */
function scatter(size, salt = 0) {
  const cells = [];
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) cells.push({ row: r, col: c });
  const key = ({ row, col }) => (row * 37 + col * 11 + salt * 17) % 101;
  return cells.sort((a, b) => key(a) - key(b) || a.row - b.row || a.col - b.col);
}

export async function seed(base, log = () => {}) {
  const call = makeApi(base);
  const me = device(ME);
  const friends = FRIENDS.map(device);
  const [maya, dre, priya, luis, tess, omar, kim, sam, ava, ben] = friends;

  async function createBoard(host, { name, teamX, teamY, format = {}, prizes = {}, maxPerPlayer = 0 }) {
    const created = await call("POST", "/games", {
      device: host,
      body: {
        name,
        sport: "football",
        league: "custom",
        teamX,
        teamY,
        format: { periods: "quarters", reverse: false, boardSize: 100, freshNumbers: false, ...format },
        prizes,
        maxPerPlayer,
        linkedEvent: null,
        host: host.profile,
      },
    });
    const board = { id: created.game.id, admin: created.adminToken, host, name, prizes, size: format.boardSize === 25 ? 5 : 10 };
    await call("POST", `/games/${board.id}/pay/test`, { device: host, admin: board.admin });
    log(`  board ${name} (${board.id})`);
    return board;
  }

  /** Joins everyone, then hands out `counts[i]` squares to `players[i]` in scattered order. */
  async function fill(board, players, counts, salt = 0, skip = new Set()) {
    for (const p of players) await call("POST", `/games/${board.id}/join`, { device: p, body: p.profile });
    const cells = scatter(board.size, salt).filter((c) => !skip.has(`${c.row},${c.col}`));
    let i = 0;
    for (let p = 0; p < players.length; p++) {
      const mine = cells.slice(i, i + counts[p]);
      i += counts[p];
      if (mine.length) await call("POST", `/games/${board.id}/claim`, { device: players[p], body: { cells: mine } });
    }
  }

  const state = (board) => call("GET", `/games/${board.id}`);
  const lock = async (board) => (await call("POST", `/games/${board.id}/lock`, { device: board.host, admin: board.admin })).state;
  const score = (board, periodKey, scoreX, scoreY) =>
    call("POST", `/games/${board.id}/scores`, { device: board.host, admin: board.admin, body: { periodKey, scoreX, scoreY } });

  /** Digits for a cell on a locked 10x10 board (single draw). */
  const digitsAt = (st, { row, col }) => ({ x: st.game.numbers["*"].x[col][0], y: st.game.numbers["*"].y[row][0] });
  const squaresOf = (st, dev) => {
    const pid = st.players.find((p) => p.name === dev.profile.name)?.id;
    return st.squares.filter((s) => s.playerId === pid);
  };

  /** Of `dev`'s squares, the one whose digits make the most believable score near `target`, above `min`. */
  function bestSquare(st, dev, min, target) {
    return squaresOf(st, dev)
      .map((cell) => {
        const d = digitsAt(st, cell);
        const x = scoreEndingIn(d.x, min.x);
        const y = scoreEndingIn(d.y, min.y);
        const rare = (n) => (COMMON_SCORES.has(n) ? 0 : 6);
        // A tied game reads oddly on a scoreboard (and a Final can't end tied).
        const tie = x === y ? 50 : 0;
        return { cell, x, y, cost: Math.abs(x - target.x) + Math.abs(y - target.y) + rare(x) + rare(y) + tie };
      })
      .sort((a, b) => a.cost - b.cost)[0];
  }

  // Seeded oldest first: the activity inbox lists the newest on top, so the
  // live board (where my square just hit) goes last.

  // A host board, full and ready to draw: the number-reveal moment.
  const draw = await createBoard(me, {
    name: "Rivalry Night",
    teamX: TEAMS.hawks,
    teamY: TEAMS.wolves,
    prizes: { q1: "Loser buys wings", final: "Trophy mug + bragging rights" },
  });
  await fill(draw, [me, maya, dre, priya, luis, tess, omar, kim, sam, ava], [10, 10, 10, 10, 10, 10, 10, 10, 10, 10], 1);

  // The claim moment: a friend's board, about half full; I've joined but not picked.
  const pick = await createBoard(luis, {
    name: "Tailgate Squares",
    teamX: TEAMS.hawks,
    teamY: TEAMS.foxes,
    prizes: { q1: "Loser carries the cooler", q2: "Winner picks the tailgate tunes", final: "Bragging rights till next season" },
  });
  await fill(pick, [luis, me, maya, priya, omar, kim, ava], [8, 0, 7, 8, 6, 7, 6], 5);
  {
    const st = await state(pick);
    const taken = new Set(st.squares.map((q) => `${q.row},${q.col}`));
    const wanted = [[3, 7], [4, 2], [6, 5], [2, 4], [5, 8], [7, 3], [1, 6]];
    pick.cells = wanted.filter(([r, c]) => !taken.has(`${r},${c}`)).slice(0, 3).map(([row, col]) => ({ row, col }));
  }

  // A board Jordan hosts from another phone, for the invite sheet. Kept off this
  // phone's dashboard so Home fits Live now, Needs you and Final on one screen.
  const inviter = device(ME);
  const open = await createBoard(inviter, {
    name: "Office Game Day",
    teamX: TEAMS.comets,
    teamY: TEAMS.foxes,
    prizes: { q1: "Winner picks Friday lunch", q2: "Loser brings donuts", final: "Corner desk for a week" },
    maxPerPlayer: 10,
  });
  await fill(open, [inviter, dre, priya, luis, tess, omar, kim, ben], [4, 9, 8, 7, 6, 8, 7, 5], 2);

  // A finished board I won at the final whistle.
  const done = await createBoard(ava, {
    name: "Thanksgiving Showdown",
    teamX: TEAMS.otters,
    teamY: TEAMS.stags,
    format: { periods: "halves" },
    prizes: { q2: "First pick of the pie", final: "Skip dishes, plus bragging rights" },
  });
  await fill(done, [ava, me, ben, sam, kim, maya, dre, omar, tess, luis], [10, 10, 10, 10, 10, 10, 10, 10, 10, 10], 3);
  {
    const st = await lock(done);
    const half = bestSquare(st, sam, { x: 3, y: 3 }, { x: 13, y: 10 });
    await score(done, "q2", half.x, half.y);
    const fin = bestSquare(st, me, { x: half.x + 3, y: half.y + 3 }, { x: 27, y: 24 });
    await score(done, "final", fin.x, fin.y);
  }

  // The live one, last: a friend's board mid-game. Q1 went to Priya; my square
  // holds the halftime score, so it's mine "right now" too.
  const live = await createBoard(maya, {
    name: "Sunday Squares",
    teamX: TEAMS.hawks,
    teamY: TEAMS.wolves,
    prizes: {
      q1: "Loser buys wings",
      q2: "Winner picks the halftime playlist",
      q3: "Winner skips dish duty",
      final: "Trophy mug + bragging rights",
    },
  });
  await fill(live, [maya, me, dre, priya, luis, tess, omar, kim, sam, ava], [11, 10, 10, 10, 10, 10, 10, 10, 10, 9], 1);
  {
    const st = await lock(live);
    const q1 = bestSquare(st, priya, { x: 0, y: 0 }, { x: 7, y: 3 });
    await score(live, "q1", q1.x, q1.y);
    const q2 = bestSquare(st, me, { x: q1.x + 3, y: q1.y + 3 }, { x: 17, y: 13 });
    await score(live, "q2", q2.x, q2.y);
    live.scores = { q1, q2 };
  }

  return { me, inviter, friends, live, open, done, pick, draw, state };
}
