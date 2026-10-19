// @vitest-environment node
// Email notices end to end against real SQL (node:sqlite, the real
// migrations): signing up, the double opt-in, notices only to confirmed
// addresses, each notice once, unsubscribing (one board, every board, RFC
// 8058 one-click), retention, and the address never in anything public.
// Resend is a mocked fetch; only the GameRoom (sockets) is faked.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EMAIL_ERRORS } from "../../shared/email";
import type { AppConfig, CreateGameResponse, EmailNotices, GameState } from "../../shared/types";
import type { Env } from "../env";
import { housekeeping } from "../housekeeping";
import worker from "../index";
import { createTestD1, type TestD1 } from "../payments/testD1";
import { RATE_LIMITS } from "../rateLimit";
import { EMAIL_BOARD_OVER, EMAIL_JOIN_FIRST, EMAIL_JUST_SENT, EMAIL_SUPPRESSED, EMAIL_TAKEN, EMAIL_UNAVAILABLE, RESEND_GAP_MS } from "./routes";
import { CONFIRM_TTL_MS, KEEP_AFTER_FINAL_MS } from "./store";

const HOST = "host-client-aaaa-0001";
const ANA = "ana-client-bbbb-0002";
const BEN = "ben-client-cccc-0003";
const STRANGER = "stranger-client-dd-04";
const ANA_EMAIL = "ana.lopez@gmail.com";
const BEN_EMAIL = "ben@icloud.com";
const SECRET = "test-email-token-secret-0123456789";

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

/** A Resend request as the mock saw it: one message, or a batch. */
interface SentEmail {
  from: string;
  to: string[];
  subject: string;
  html: string;
  text: string;
  headers: Record<string, string>;
}

let t: TestD1;
let env: Env;
let pending: Promise<unknown>[];
let resend: { url: string; key: string | null; auth: string | null; body: SentEmail | SentEmail[] }[];
/** Every API response body, to check none carries an address. */
let seen: string[];

const EMAIL_ENV = { RESEND_API_KEY: "re_test_123", EMAIL_FROM: "notices@jaxsquares.com", EMAIL_TOKEN_SECRET: SECRET, APP_ORIGIN: "https://jaxsquares.com" };

beforeEach(async () => {
  t = await createTestD1(MIGRATIONS);
  pending = [];
  resend = [];
  seen = [];
  const stub = { fetch: async () => new Response(null, { status: 204 }) };
  env = {
    DB: t.d1,
    GAME_ROOM: { idFromName: (n: string) => n, get: () => stub } as unknown as DurableObjectNamespace,
    ASSETS: { fetch: async () => new Response("<html><head></head><body></body></html>", { headers: { "content-type": "text/html" } }) } as unknown as Fetcher,
    ...EMAIL_ENV,
  } as Env;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      if (!url.startsWith("https://api.resend.com/")) throw new Error(`unexpected fetch ${url}`);
      const headers = new Headers(init?.headers);
      resend.push({ url, key: headers.get("idempotency-key"), auth: headers.get("authorization"), body: JSON.parse(String(init?.body)) });
      return new Response(JSON.stringify(url.endsWith("/batch") ? { data: [] } : { id: "email-1" }), { status: 200 });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

/** Waits for everything the routes deferred (notices, confirmation emails). */
async function settle(): Promise<void> {
  while (pending.length > 0) await Promise.all(pending.splice(0));
}

const ctx = () => ({ waitUntil: (p: Promise<unknown>) => void pending.push(p), passThroughOnException: () => {} }) as unknown as ExecutionContext;

async function call<T = Record<string, unknown>>(
  method: string,
  path: string,
  opts: { client?: string | null; admin?: string; body?: unknown } = {},
): Promise<{ status: number; body: T; text: string }> {
  const headers: Record<string, string> = {};
  if (opts.client !== null) headers["x-client-id"] = opts.client ?? HOST;
  if (opts.admin) headers["x-admin-token"] = opts.admin;
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  const res = await worker.fetch(
    new Request(`https://jaxsquares.test/api${path}`, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) }),
    env,
    ctx(),
  );
  const text = await res.text();
  seen.push(text);
  return { status: res.status, body: (text ? JSON.parse(text) : {}) as T, text };
}

/** A page an email's link opens (HTML), or a form POST to it. */
async function page(method: "GET" | "POST", url: string, form?: Record<string, string>) {
  const path = url.replace("https://jaxsquares.com", "https://jaxsquares.test");
  const body = form ? new URLSearchParams(form).toString() : undefined;
  const res = await worker.fetch(
    new Request(path, { method, body, headers: body ? { "content-type": "application/x-www-form-urlencoded" } : {} }),
    env,
    ctx(),
  );
  // Decoded the way a browser shows it.
  const text = (await res.text()).replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
  return { status: res.status, text, headers: res.headers };
}

const profile = (name: string) => ({ name, color: "#38b6ff", emoji: "🐐" });

/** Quarters on a 5x5 board, with amounts set (none may reach an email) and a note on Q1. */
const formatWithAmounts = {
  periods: "quarters",
  reverse: false,
  boardSize: 25,
  freshNumbers: false,
  unit: "$",
  squarePrice: 37,
  rules: [
    { moment: "q1", square: { amount: 1234, note: "Loser buys wings" }, reverse: null },
    { moment: "q2", square: { amount: 1234, note: "" }, reverse: null },
    { moment: "q3", square: { amount: 1234, note: "" }, reverse: null },
    { moment: "final", square: { amount: 4321, note: "" }, reverse: { amount: 777, note: "" } },
  ],
};

const everyScoreFormat = {
  periods: "every-score",
  reverse: false,
  boardSize: 25,
  freshNumbers: false,
  unit: "$",
  squarePrice: 37,
  rules: [
    { moment: "score", square: { amount: 1234, note: "" }, reverse: null },
    { moment: "final", square: { amount: 4321, note: "" }, reverse: null },
  ],
};

/** A paid board with Ana on (0,0) and (0,1) and Ben on (1,1). */
async function board(format: object = formatWithAmounts, name = "Sunday Squares"): Promise<{ id: string; admin: string }> {
  const created = await call<CreateGameResponse>("POST", "/games", {
    body: { name, sport: "football", league: "custom", teamX: { name: "Chiefs", abbr: "KC" }, teamY: { name: "Eagles", abbr: "PHI" }, format, prizes: {}, maxPerPlayer: 0, linkedEvent: null, host: profile("Jordan") },
  });
  expect(created.status).toBe(201);
  const { game, adminToken } = created.body;
  expect((await call("POST", `/games/${game.id}/pay/test`, { admin: adminToken })).status).toBe(200);
  for (const [client, who, cells] of [
    [ANA, "Ana", [{ row: 0, col: 0 }, { row: 0, col: 1 }]],
    [BEN, "Ben", [{ row: 1, col: 1 }]],
  ] as const) {
    expect((await call("POST", `/games/${game.id}/join`, { client, body: profile(who) })).status).toBe(200);
    expect((await call("POST", `/games/${game.id}/claim`, { client, body: { cells } })).status).toBe(200);
  }
  return { id: game.id, admin: adminToken };
}

const emails = (): SentEmail[] => resend.flatMap((r) => (Array.isArray(r.body) ? r.body : [r.body]));
const emailsTo = (address: string) => emails().filter((e) => e.to.includes(address));
const confirmUrlIn = (e: SentEmail) => /https:\/\/jaxsquares\.com\/api\/email\/confirm\?token=[A-Za-z0-9_-]{43}/.exec(e.text)?.[0] ?? "";
const unsubscribeUrlOf = (e: SentEmail) => /^<(.+)>$/.exec(e.headers["List-Unsubscribe"])?.[1] ?? "";

async function subscribe(id: string, client: string, email: string) {
  const res = await call<EmailNotices>("POST", `/games/${id}/email`, { client, body: { email } });
  await settle();
  return res;
}

/** Signs `client` up and opens the confirmation link (GET asks, POST confirms). */
async function subscribeConfirmed(id: string, client: string, email: string) {
  expect((await subscribe(id, client, email)).status).toBe(200);
  const url = confirmUrlIn(emailsTo(email).at(-1)!);
  expect((await page("POST", url)).status).toBe(200);
}

const statusOf = async (id: string, client: string) => (await call<EmailNotices>("GET", `/games/${id}/email`, { client })).body;
const stateOf = async (id: string) => (await call<GameState>("GET", `/games/${id}`, { client: null })).body;

/**
 * Known numbers once the board is drawn, so the tests know who wins:
 * column / row i holds digits 2i and 2i+1. Ana's (0,0) wins 10-0 and 21-20
 * (and its reverse), Ben's (1,1) wins 13-13.
 */
function fixNumbers(id: string): void {
  const axis = [0, 1, 2, 3, 4].map((i) => [2 * i, 2 * i + 1]);
  t.query("UPDATE games SET numbers = ? WHERE id = ?", JSON.stringify({ "*": { x: axis, y: axis } }), id);
}

/** Text an email shows, links and their tokens left out (a random token could hold any digits). */
const visible = (s: string) => s.replace(/https?:\/\/[^\s"<>]+/g, "");

describe("when email isn't set up", () => {
  it("hides the opt-in and answers 503, but anyone can still take their address back", async () => {
    const { id } = await board();
    env = { ...env, RESEND_API_KEY: "" };
    expect((await call<AppConfig>("GET", "/config", { client: null })).body.emailEnabled).toBe(false);
    for (const [method, body] of [
      ["GET", undefined],
      ["POST", { email: ANA_EMAIL }],
    ] as const) {
      const res = await call(method, `/games/${id}/email`, { client: ANA, body });
      expect(res.status).toBe(503);
      expect(res.body).toEqual({ error: EMAIL_UNAVAILABLE });
    }
    expect((await page("GET", `https://jaxsquares.com/api/email/confirm?token=${"a".repeat(43)}`)).status).toBe(503);
    expect((await call("DELETE", `/games/${id}/email`, { client: ANA })).status).toBe(200);
    // A short secret counts as unset too.
    env = { ...env, ...EMAIL_ENV, EMAIL_TOKEN_SECRET: "short" };
    expect((await call<AppConfig>("GET", "/config", { client: null })).body.emailEnabled).toBe(false);
    env = { ...env, EMAIL_TOKEN_SECRET: SECRET, EMAIL_FROM: "" };
    expect((await call<AppConfig>("GET", "/config", { client: null })).body.emailEnabled).toBe(false);
    expect(resend).toEqual([]);
  });

  it("shows it once all three settings are there", async () => {
    expect((await call<AppConfig>("GET", "/config", { client: null })).body.emailEnabled).toBe(true);
  });
});

describe("signing up (double opt-in)", () => {
  it("sends one confirmation email, and nothing else until it's confirmed", async () => {
    const { id, admin } = await board();
    const res = await subscribe(id, ANA, "  Ana.Lopez@GMAIL.com ");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "pending", email: "a•••@gmail.com" });
    expect(t.query("SELECT email, status FROM email_subscriptions")).toEqual([{ email: ANA_EMAIL, status: "pending" }]);

    expect(resend).toHaveLength(1);
    expect(resend[0].url).toBe("https://api.resend.com/emails");
    expect(resend[0].auth).toBe("Bearer re_test_123");
    expect(resend[0].key).toBeTruthy();
    const [confirm] = emails();
    expect(confirm.from).toBe("JaxSquares <notices@jaxsquares.com>");
    expect(confirm.to).toEqual([ANA_EMAIL]);
    expect(confirm.subject).toBe("Confirm your email for Sunday Squares");
    expect(confirmUrlIn(confirm)).not.toBe("");
    expect(confirm.text).toContain("You're getting this because you asked for JaxSquares email for Sunday Squares.");
    expect(confirm.headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    expect(unsubscribeUrlOf(confirm)).toMatch(/^https:\/\/jaxsquares\.com\/api\/email\/unsubscribe\?token=/);

    // Unconfirmed: the draw emails nobody.
    expect((await call("POST", `/games/${id}/lock`, { admin })).status).toBe(200);
    await settle();
    expect(resend).toHaveLength(1);
  });

  it("confirms only from the page's button: opening the link (or a scanner opening it) changes nothing", async () => {
    const { id, admin } = await board();
    await subscribe(id, ANA, ANA_EMAIL);
    const url = confirmUrlIn(emails()[0]);
    const asked = await page("GET", url);
    expect(asked.status).toBe(200);
    expect(asked.headers.get("content-type")).toContain("text/html");
    expect(asked.headers.get("referrer-policy")).toBe("no-referrer");
    expect(asked.text).toContain("Confirm your email");
    expect(asked.text).toContain("<b>Sunday Squares</b>");
    expect(asked.text).toContain('method="post"');
    expect((await statusOf(id, ANA)).status).toBe("pending");

    const done = await page("POST", url);
    expect(done.status).toBe(200);
    expect(done.text).toContain("You're all set");
    expect(await statusOf(id, ANA)).toEqual({ status: "confirmed", email: "a•••@gmail.com" });
    // The link works once.
    expect((await page("POST", url)).status).toBe(400);
    expect((await page("GET", url)).text).toContain("This link has expired");

    // Confirmed: the draw emails Ana her squares and numbers; Ben (no email) and the host get nothing.
    expect((await call("POST", `/games/${id}/lock`, { admin })).status).toBe(200);
    await settle();
    const [numbers, ...rest] = emails().slice(1);
    expect(rest).toEqual([]);
    expect(numbers.to).toEqual([ANA_EMAIL]);
    expect(numbers.subject).toBe("Numbers are in for Sunday Squares");
    const draw = (await stateOf(id)).game.numbers!["*"];
    expect(numbers.text).toContain(`- KC ${draw.x[0].join("·")} · PHI ${draw.y[0].join("·")}`);
    expect(numbers.text).toContain(`- KC ${draw.x[1].join("·")} · PHI ${draw.y[0].join("·")}`);
    expect(numbers.text).toContain("https://jaxsquares.com/g/" + id);
    expect(numbers.html).toContain("Here are your 2 squares on Sunday Squares.");
  });

  it("refuses a stranger, a bad address and a finished board", async () => {
    const { id, admin } = await board();
    const stranger = await call("POST", `/games/${id}/email`, { client: STRANGER, body: { email: ANA_EMAIL } });
    expect(stranger).toMatchObject({ status: 403, body: { error: EMAIL_JOIN_FIRST } });
    const bad = await call("POST", `/games/${id}/email`, { client: ANA, body: { email: "ana@gmail" } });
    expect(bad).toMatchObject({ status: 400, body: { error: EMAIL_ERRORS.invalid } });
    expect((await call("POST", `/games/${id}/email`, { client: ANA, body: {} })).status).toBe(400);
    expect((await call("POST", "/games/nope99/email", { client: ANA, body: { email: ANA_EMAIL } })).status).toBe(404);
    expect((await call("POST", `/games/${id}/lock`, { admin })).status).toBe(200);
    expect((await call("POST", `/games/${id}/final`, { admin })).status).toBe(200);
    expect(await call("POST", `/games/${id}/email`, { client: ANA, body: { email: ANA_EMAIL } })).toMatchObject({ status: 409, body: { error: EMAIL_BOARD_OVER } });
    await settle();
    expect(resend).toEqual([]);
  });

  it("keeps one address per board: another player can't take it", async () => {
    const { id } = await board();
    await subscribe(id, ANA, ANA_EMAIL);
    expect(await call("POST", `/games/${id}/email`, { client: BEN, body: { email: ANA_EMAIL } })).toMatchObject({ status: 409, body: { error: EMAIL_TAKEN } });
    expect(resend).toHaveLength(1);
  });

  it("resends the link at most once a minute (the old one stops working), and a handful an hour per address", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.UTC(2026, 9, 18, 17, 0, 1));
    const { id } = await board();
    await subscribe(id, ANA, ANA_EMAIL);
    const first = confirmUrlIn(emails()[0]);
    const again = await call("POST", `/games/${id}/email`, { client: ANA, body: { resend: true } });
    expect(again).toMatchObject({ status: 429, body: { error: EMAIL_JUST_SENT } });
    vi.setSystemTime(Date.now() + RESEND_GAP_MS + 1);
    expect((await call("POST", `/games/${id}/email`, { client: ANA, body: { resend: true } })).status).toBe(200);
    await settle();
    expect(resend).toHaveLength(2);
    const second = confirmUrlIn(emails()[1]);
    expect(second).not.toBe(first);
    expect((await page("GET", first)).status).toBe(400);
    expect((await page("GET", second)).status).toBe(200);

    for (let i = 2; i < RATE_LIMITS.emailSend.limit; i++) {
      vi.setSystemTime(Date.now() + RESEND_GAP_MS + 1);
      expect((await call("POST", `/games/${id}/email`, { client: ANA, body: { email: ANA_EMAIL } })).status).toBe(200);
    }
    vi.setSystemTime(Date.now() + RESEND_GAP_MS + 1);
    const flood = await call("POST", `/games/${id}/email`, { client: ANA, body: { email: ANA_EMAIL } });
    expect(flood).toMatchObject({ status: 429, body: { error: RATE_LIMITS.emailSend.message } });
    await settle();
    expect(resend).toHaveLength(RATE_LIMITS.emailSend.limit);
  });

  it("expires an unconfirmed link after 7 days", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const { id } = await board();
    await subscribe(id, ANA, ANA_EMAIL);
    vi.setSystemTime(Date.now() + CONFIRM_TTL_MS + 1000);
    expect((await page("POST", confirmUrlIn(emails()[0]))).status).toBe(400);
    expect((await statusOf(id, ANA)).status).toBe("pending");
  });

  it("lets the owner turn it off from the app: the address is deleted", async () => {
    const { id } = await board();
    await subscribeConfirmed(id, ANA, ANA_EMAIL);
    expect((await call("DELETE", `/games/${id}/email`, { client: ANA })).body).toEqual({ status: "none", email: null });
    expect(t.query("SELECT * FROM email_subscriptions")).toEqual([]);
  });
});

describe("notices", () => {
  it("emails a win with the period, the score and the host's note, and never an amount", async () => {
    const { id, admin } = await board();
    await subscribeConfirmed(id, ANA, ANA_EMAIL);
    await subscribeConfirmed(id, BEN, BEN_EMAIL);
    expect((await call("POST", `/games/${id}/lock`, { admin })).status).toBe(200);
    await settle();
    fixNumbers(id);
    resend = [];

    const q1 = { periodKey: "q1", scoreX: 10, scoreY: 0 };
    expect((await call("POST", `/games/${id}/scores`, { admin, body: q1 })).status).toBe(200);
    await settle();
    expect(emails()).toHaveLength(1);
    const [win] = emails();
    expect(win.to).toEqual([ANA_EMAIL]);
    expect(win.subject).toBe("You won Q1! 🎉 Sunday Squares");
    expect(win.text).toContain("You won Q1!");
    expect(win.text).toContain("Your square hit at the end of Q1 on Sunday Squares.");
    expect(win.text).toContain("Q1 score: Chiefs 10, Eagles 0");
    expect(win.text).toContain("🏆 Loser buys wings");

    // Saving the same score again (or a second host phone) doesn't email again.
    expect((await call("POST", `/games/${id}/scores`, { admin, body: q1 })).status).toBe(200);
    await settle();
    expect(emails()).toHaveLength(1);

    // The half goes to Ben; the final: one results email each, winners by name, no amounts.
    expect((await call("POST", `/games/${id}/scores`, { admin, body: { periodKey: "q2", scoreX: 13, scoreY: 13 } })).status).toBe(200);
    expect((await call("POST", `/games/${id}/scores`, { admin, body: { periodKey: "final", scoreX: 21, scoreY: 20 } })).status).toBe(200);
    await settle();
    const after = emails().slice(1);
    expect(after.map((e) => [e.to[0], e.subject]).sort()).toEqual(
      [
        [ANA_EMAIL, "You won Q1 and the final! 🎉 Sunday Squares final results"],
        [BEN_EMAIL, "You won the half! 🎉 Sunday Squares"],
        [BEN_EMAIL, "You won the half! 🎉 Sunday Squares final results"],
      ].sort(),
    );
    const results = after.find((e) => e.to[0] === BEN_EMAIL && e.subject.endsWith("final results"))!;
    expect(results.text).toContain("Final: Chiefs 21, Eagles 20");
    expect(results.text).toContain("- Q1: Ana");
    expect(results.text).toContain("- Half: Ben (you)");
    expect(results.text).toContain("- Final: Ana · reverse: Ana");
    for (const e of emails()) {
      for (const part of [e.subject, e.text, e.html]) expect(visible(part)).not.toMatch(/\$|1,?234|4,?321|\b777\b|\b37\b/);
    }
    // Ending the game again sends nothing new.
    expect((await call("POST", `/games/${id}/final`, { admin })).status).toBe(200);
    await settle();
    expect(emails()).toHaveLength(4);
  });

  it("sends an every-score board one summary at the end instead of an email per score", async () => {
    const { id, admin } = await board(everyScoreFormat, "Score Party");
    await subscribeConfirmed(id, ANA, ANA_EMAIL);
    expect((await call("POST", `/games/${id}/lock`, { admin })).status).toBe(200);
    await settle();
    fixNumbers(id);
    resend = [];
    for (const [x, y] of [
      [10, 0],
      [20, 0],
      [20, 10],
    ]) {
      expect((await call("POST", `/games/${id}/scores`, { admin, body: { periodKey: "next", scoreX: x, scoreY: y } })).status).toBe(200);
    }
    await settle();
    expect(emails()).toEqual([]);
    expect((await call("POST", `/games/${id}/scores`, { admin, body: { periodKey: "final", scoreX: 20, scoreY: 10 } })).status).toBe(200);
    await settle();
    expect(emails()).toHaveLength(1);
    const [summary] = emails();
    expect(summary.subject).toBe("You won 3 scores and the final! 🎉 Score Party final results");
    expect(summary.text).toContain("Your squares won 3 scores on Score Party.");
    expect(summary.text).toContain("- Ana: 3 scores (you)");
    expect(visible(summary.text)).not.toMatch(/\$|1,?234|4,?321/);
  });

  it("sends a board's notices to many players in one batch request", async () => {
    const { id, admin } = await board();
    await subscribeConfirmed(id, ANA, ANA_EMAIL);
    await subscribeConfirmed(id, BEN, BEN_EMAIL);
    resend = [];
    expect((await call("POST", `/games/${id}/lock`, { admin })).status).toBe(200);
    await settle();
    expect(resend.map((r) => r.url)).toEqual(["https://api.resend.com/emails/batch"]);
    expect((resend[0].body as SentEmail[]).map((e) => e.to[0]).sort()).toEqual([ANA_EMAIL, BEN_EMAIL].sort());
  });

  it("logs a failed send without failing the request", async () => {
    const { id, admin } = await board();
    await subscribeConfirmed(id, ANA, ANA_EMAIL);
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ message: "domain not verified" }), { status: 403 })));
    expect((await call("POST", `/games/${id}/lock`, { admin })).status).toBe(200);
    await settle();
    expect(errors.mock.calls.some((c) => String(c[0]).includes("Resend /emails (1) failed: 403"))).toBe(true);
    errors.mockRestore();
  });
});

describe("unsubscribing", () => {
  it("stops one board from the email's one-click header (RFC 8058) and blanks the address", async () => {
    const { id, admin } = await board();
    await subscribeConfirmed(id, ANA, ANA_EMAIL);
    expect((await call("POST", `/games/${id}/lock`, { admin })).status).toBe(200);
    await settle();
    const url = unsubscribeUrlOf(emails().at(-1)!);

    // Opening the link only asks.
    const asked = await page("GET", url);
    expect(asked.status).toBe(200);
    expect(asked.text).toContain("Unsubscribe from this board");
    expect(asked.text).toContain("Unsubscribe from all JaxSquares email");
    expect((await statusOf(id, ANA)).status).toBe("confirmed");

    // The mail app's one-click POST.
    const res = await page("POST", url, { "List-Unsubscribe": "One-Click" });
    expect(res.status).toBe(200);
    expect(res.text).toContain("You're unsubscribed");
    expect(await statusOf(id, ANA)).toEqual({ status: "unsubscribed", email: null });
    expect(t.query("SELECT email, status FROM email_subscriptions")).toEqual([{ email: "", status: "unsubscribed" }]);

    resend = [];
    fixNumbers(id);
    expect((await call("POST", `/games/${id}/scores`, { admin, body: { periodKey: "q1", scoreX: 10, scoreY: 0 } })).status).toBe(200);
    await settle();
    expect(resend).toEqual([]);
    // Another player can't sign the address up on this board again.
    expect((await call("POST", `/games/${id}/email`, { client: BEN, body: { email: ANA_EMAIL } })).status).toBe(409);
    // Ana herself can, with a new confirmation.
    expect((await subscribe(id, ANA, ANA_EMAIL)).body).toEqual({ status: "pending", email: "a•••@gmail.com" });
  });

  it("stops every board for the address, and it can't be signed up again", async () => {
    const one = await board(formatWithAmounts, "Board One");
    const two = await board(formatWithAmounts, "Board Two");
    const three = await board(formatWithAmounts, "Board Three");
    await subscribeConfirmed(one.id, ANA, ANA_EMAIL);
    await subscribeConfirmed(two.id, ANA, ANA_EMAIL);
    const url = unsubscribeUrlOf(emailsTo(ANA_EMAIL)[0]);
    const res = await page("POST", url, { scope: "all" });
    expect(res.status).toBe(200);
    expect(res.text).toContain("You won't get any more email");
    expect((await statusOf(one.id, ANA)).status).toBe("unsubscribed");
    expect((await statusOf(two.id, ANA)).status).toBe("unsubscribed");
    expect(t.query<{ n: number }>("SELECT COUNT(*) AS n FROM email_suppressions")[0].n).toBe(1);
    // The table keeps only the keyed hash, never the address.
    expect(JSON.stringify(t.query("SELECT * FROM email_suppressions"))).not.toContain("ana");

    resend = [];
    const again = await call("POST", `/games/${three.id}/email`, { client: ANA, body: { email: ANA_EMAIL } });
    expect(again).toMatchObject({ status: 409, body: { error: EMAIL_SUPPRESSED } });
    await settle();
    expect(resend).toEqual([]);
  });

  it("refuses a link that isn't ours", async () => {
    const { id } = await board();
    await subscribe(id, ANA, ANA_EMAIL);
    const url = unsubscribeUrlOf(emails()[0]);
    // A full character of the signature (the last one carries only 4 bits).
    const forged = url.slice(0, -10) + (url.at(-10) === "A" ? "B" : "A") + url.slice(-9);
    expect((await page("POST", forged, { scope: "all" })).status).toBe(400);
    expect((await page("GET", "https://jaxsquares.com/api/email/unsubscribe?token=nope")).text).toContain("This link doesn't work");
    expect(t.query("SELECT * FROM email_suppressions")).toEqual([]);
  });
});

describe("retention (hourly housekeeping)", () => {
  it("deletes a board's addresses a week after its final, and unconfirmed ones once their link expires", async () => {
    const now = Date.now();
    const done = await board(formatWithAmounts, "Finished");
    const recent = await board(formatWithAmounts, "Just finished");
    const live = await board(formatWithAmounts, "Still on");
    for (const b of [done, recent, live]) await subscribeConfirmed(b.id, ANA, ANA_EMAIL);
    await subscribe(live.id, BEN, BEN_EMAIL);
    for (const b of [done, recent]) {
      expect((await call("POST", `/games/${b.id}/lock`, { admin: b.admin })).status).toBe(200);
      expect((await call("POST", `/games/${b.id}/final`, { admin: b.admin })).status).toBe(200);
    }
    await settle();
    t.query("UPDATE games SET updated_at = ? WHERE id = ?", now - KEEP_AFTER_FINAL_MS - 60_000, done.id);
    t.query("UPDATE games SET updated_at = ? WHERE id = ?", now - KEEP_AFTER_FINAL_MS + 60 * 60_000, recent.id);
    t.query("UPDATE email_subscriptions SET confirm_sent_at = ? WHERE client_id = ?", now - CONFIRM_TTL_MS - 1000, BEN);

    const out = await housekeeping(env, now);
    expect(out.emails).toBe(2);
    const left = t.query<{ game_id: string; client_id: string }>("SELECT game_id, client_id FROM email_subscriptions ORDER BY game_id");
    expect(left).toEqual([recent.id, live.id].sort().map((game_id) => ({ game_id, client_id: ANA })));
  });

  it("deletes a board's addresses with the board", async () => {
    const { id, admin } = await board();
    await subscribeConfirmed(id, ANA, ANA_EMAIL);
    expect((await call("DELETE", `/games/${id}`, { admin })).status).toBe(200);
    expect(t.query("SELECT * FROM email_subscriptions")).toEqual([]);
  });
});

describe("privacy", () => {
  it("never puts an address (or its key) in anything public, and shows each owner only their own", async () => {
    const { id, admin } = await board();
    await subscribeConfirmed(id, ANA, ANA_EMAIL);
    expect(await statusOf(id, BEN)).toEqual({ status: "none", email: null });
    expect((await call("POST", `/games/${id}/lock`, { admin })).status).toBe(200);
    await settle();
    const key = t.query<{ email_key: string }>("SELECT email_key FROM email_subscriptions")[0].email_key;
    // (An invite page's boot state is exactly GET /api/games/:id's GameState.)
    const publicTexts = [
      (await call("GET", `/games/${id}`, { client: null })).text,
      (await call("GET", "/me/games", { client: ANA })).text,
      (await call("GET", "/me/games", { client: HOST })).text,
      (await call("GET", "/config", { client: null })).text,
    ];
    for (const text of publicTexts) {
      expect(text).not.toContain("ana.lopez");
      expect(text).not.toContain("a•••");
      expect(text).not.toContain(key);
    }
    // The full address never comes back at all; masked, only to its owner.
    expect(seen.join("")).not.toContain(ANA_EMAIL);
    const masked = seen.filter((s) => s.includes("a•••@gmail.com"));
    expect(masked.length).toBeGreaterThan(0);
    for (const s of masked) expect(Object.keys(JSON.parse(s)).sort()).toEqual(["email", "status"]);
    expect((await statusOf(id, ANA)).email).toBe("a•••@gmail.com");
  });
});
