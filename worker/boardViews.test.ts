// @vitest-environment node
// The board's TV view and printable board read the public board only: a
// fresh device that never joined (no x-client-id, no membership, no admin
// token) can GET the state, and it carries no clientId. /g/:id/tv and
// /g/:id/print are served like the invite link (index.html + the board's
// state) with a preview of their own that never shows an amount.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { derivePlayerIdSync } from "../shared/playerId";
import type { CreateGameResponse, GameState } from "../shared/types";
import type { Env } from "./env";
import worker from "./index";
import { boardPageOf, inviteMeta } from "./og";
import { createTestD1, type TestD1 } from "./payments/testD1";

vi.mock("./push", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./push")>()),
  notify: vi.fn(async () => {}),
}));

const HOST = "host-client-aaaa-0001";
const ANA = "ana-client-bbbb-0002";
const MIGRATIONS = [
  "migrations/0001_init.sql",
  "migrations/0002_core_model.sql",
  "migrations/0003_purchases.sql",
  "migrations/0004_push.sql",
  "migrations/0005_housekeeping.sql",
  "migrations/0006_purchases_unused.sql",
  "migrations/0007_board_full_announced.sql",
  "migrations/0008_custom_kickoff.sql",
  "migrations/0009_pay_at_draw.sql",
  "migrations/0010_accounts.sql",
  "migrations/0011_host_pass.sql",
  "migrations/0012_board_groups.sql",
  "migrations/0013_email.sql",
  "migrations/0014_cohosts.sql",
  "migrations/0016_club.sql",
];
const INDEX_HTML = "<html><head><title>JaxSquares</title></head><body><div id=\"root\"></div></body></html>";

let t: TestD1;
let env: Env;

beforeEach(async () => {
  t = await createTestD1(MIGRATIONS);
  const stub = { fetch: async () => new Response(null, { status: 204 }) };
  env = {
    DB: t.d1,
    GAME_ROOM: { idFromName: (n: string) => n, get: () => stub } as unknown as DurableObjectNamespace,
    ASSETS: { fetch: async () => new Response(INDEX_HTML, { headers: { "content-type": "text/html" } }) } as unknown as Fetcher,
  } as Env;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function fetchWorker(path: string, init: RequestInit = {}): Promise<Response> {
  return worker.fetch(new Request(`https://jaxsquares.test${path}`, init), env, {
    waitUntil: () => {},
    passThroughOnException: () => {},
  } as unknown as ExecutionContext);
}

async function createBoard(): Promise<{ id: string; admin: string }> {
  const res = await fetchWorker("/api/games", {
    method: "POST",
    headers: { "x-client-id": HOST, "content-type": "application/json" },
    body: JSON.stringify({
      name: "Office Pool",
      sport: "football",
      league: "custom",
      teamX: { name: "Chiefs", abbr: "KC" },
      teamY: { name: "Eagles", abbr: "PHI" },
      format: {
        periods: "quarters",
        reverse: false,
        boardSize: 100,
        freshNumbers: false,
        unit: "$",
        squarePrice: 10,
        rules: [{ moment: "final", square: { amount: 500, note: "Loser buys wings" }, reverse: null }],
      },
      prizes: {},
      maxPerPlayer: 0,
      linkedEvent: null,
      host: { name: "Jordan", color: "#ff6b35", emoji: "🦊" },
    }),
  });
  expect(res.status).toBe(201);
  const body = (await res.json()) as CreateGameResponse;
  const join = await fetchWorker(`/api/games/${body.game.id}/join`, {
    method: "POST",
    headers: { "x-client-id": ANA, "content-type": "application/json" },
    body: JSON.stringify({ name: "Ana", color: "#38b6ff", emoji: "🐐" }),
  });
  expect(join.status).toBe(200);
  return { id: body.game.id, admin: body.adminToken };
}

describe("a TV or a printer that never joined", () => {
  it("reads the public board with no x-client-id, no membership and no admin token", async () => {
    const { id, admin } = await createBoard();
    const res = await fetchWorker(`/api/games/${id}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const text = await res.text();
    const state = JSON.parse(text) as GameState;
    expect(state.game.id).toBe(id);
    expect(state.players.map((p) => p.name).sort()).toEqual(["Ana", "Jordan"]);
    expect(state.game.hostPlayerId).toBe(derivePlayerIdSync(HOST));
    // Public ids only: no clientId and no admin token anywhere in it.
    for (const secret of [HOST, ANA, admin]) expect(text).not.toContain(secret);
  });
});

/** Just enough of HTMLRewriter (Workers runtime) to see what invitePage writes into the page. */
class FakeRewriter {
  static last: FakeRewriter | null = null;
  handlers = new Map<string, { element: (el: unknown) => void }>();
  constructor() {
    FakeRewriter.last = this;
  }
  on(selector: string, handler: { element: (el: unknown) => void }) {
    this.handlers.set(selector, handler);
    return this;
  }
  transform(res: Response) {
    return res;
  }
  /** What the page ends up with: the title, and what's appended to <head> and <body>. */
  render() {
    const out = { title: "", head: "", body: "" };
    const el = (into: "title" | "head" | "body") => ({
      setInnerContent: (s: string) => void (out[into] = s),
      append: (s: string) => void (out[into] += s),
      setAttribute: () => {},
      remove: () => {},
    });
    this.handlers.get("title")?.element(el("title"));
    this.handlers.get("head")?.element(el("head"));
    this.handlers.get("body")?.element(el("body"));
    return out;
  }
}

describe("/g/:id/tv and /g/:id/print link previews", () => {
  it("serves the app with the board's state and a preview of its own", async () => {
    vi.stubGlobal("HTMLRewriter", FakeRewriter);
    const { id } = await createBoard();
    for (const [path, title, url] of [
      [`/g/${id}/tv`, "Office Pool on TV · JaxSquares", `https://jaxsquares.test/g/${id}/tv`],
      [`/g/${id}/print`, "Print Office Pool · JaxSquares", `https://jaxsquares.test/g/${id}/print`],
      [`/g/${id}`, "Join Office Pool on JaxSquares", `https://jaxsquares.test/g/${id}`],
    ]) {
      FakeRewriter.last = null;
      const res = await fetchWorker(path, { headers: { accept: "text/html" } });
      expect(res.status, path).toBe(200);
      const page = FakeRewriter.last!.render();
      expect(page.title, path).toBe(title);
      expect(page.head, path).toContain(`<meta property="og:url" content="${url}" />`);
      // The board's public state rides along, so the SPA (TV or print) renders it at once.
      expect(page.body, path).toContain('id="jx-boot"');
      expect(page.body, path).toContain(`"id":"${id}"`);
      // Never an amount in a preview.
      expect(page.head, path).not.toContain("$");
    }
  });

  it("sends a code typed in capitals to the lowercase view", async () => {
    vi.stubGlobal("HTMLRewriter", FakeRewriter);
    const { id } = await createBoard();
    const res = await fetchWorker(`/g/${id.toUpperCase()}/tv`);
    expect(res.status).toBe(301);
    expect(res.headers.get("location")).toBe(`https://jaxsquares.test/g/${id}/tv`);
  });

  it("knows which page of a board a path is", () => {
    expect(boardPageOf("/g/abc123")).toBe("board");
    expect(boardPageOf("/g/abc123/tv")).toBe("tv");
    expect(boardPageOf("/g/abc123/TV/")).toBe("tv");
    expect(boardPageOf("/g/abc123/print")).toBe("print");
    expect(boardPageOf("/g/abc123/whatever")).toBe("board");
  });

  it("describes the views without amounts", () => {
    const state = {
      game: {
        id: "abc123",
        name: "Office Pool",
        teamX: { name: "Chiefs", abbr: "KC" },
        teamY: { name: "Eagles", abbr: "PHI" },
        format: { periods: "quarters", reverse: false, boardSize: 100, freshNumbers: false, squarePrice: 25 },
        status: "locked",
      },
      players: [],
      squares: [],
      scores: [],
      live: null,
    } as unknown as GameState;
    const tv = inviteMeta(state, "https://jaxsquares.com", "tv");
    expect(tv).toMatchObject({ title: "Office Pool on TV · JaxSquares", url: "https://jaxsquares.com/g/abc123/tv" });
    expect(tv.description).toBe("Chiefs vs Eagles · Live on the big screen · Numbers are drawn. Follow along live");
    const print = inviteMeta(state, "https://jaxsquares.com", "print");
    expect(print).toMatchObject({ title: "Print Office Pool · JaxSquares", url: "https://jaxsquares.com/g/abc123/print" });
    for (const m of [tv, print]) expect(`${m.title} ${m.description}`).not.toContain("$");
  });
});
