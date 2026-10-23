// @vitest-environment node
// The Annual Pass + Venue end to end against real SQL (node:sqlite, every migration
// applied): buying it (the no-charge test pass, and the web's Stripe
// subscription behind a mocked fetch, with the webhook mapping its Price to
// the plan), what it covers (the draw, up to 10 co-hosts), the club's branding
// on the holder's boards and their link previews, the logo (validation,
// serving with an ETag), the players CSV, and the club TV's token. Nothing a
// client reads ever carries a clientId, the TV token's hash or the logo's
// owner. Only the GameRoom (sockets) and push delivery are faked.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CLUB_LOGO_MAX_BYTES, CLUB_NAME_MONEY_ERROR, CLUB_TV_TOKEN_HEADER } from "../shared/clubs";
import { CLUB_MAX_COHOSTS, MAX_COHOSTS } from "../shared/cohosts";
import { FREE_PLAYER_LIMIT } from "../shared/hostFee";
import { VENUE_LOCKED_ERROR } from "../shared/pricing";
import { derivePlayerIdSync } from "../shared/playerId";
import type {
  ClubSettings,
  ClubTvLink,
  ClubTvState,
  CohostInviteResponse,
  CreateGameResponse,
  GameState,
  HostPassIntent,
  HostPassState,
  MeResponse,
} from "../shared/types";
import { UPGRADE_PASS_CODE } from "../shared/types";
import { CLUB_BRAND_TTL_MS } from "./clubs/brand";
import { csvCell, playersCsv } from "./clubs/csv";
import { checkLogo } from "./clubs/logo";
import type { Env } from "./env";
import worker from "./index";
import { inviteMeta } from "./og";
import { signStripePayload } from "./payments/stripe";
import { createTestD1, type TestD1 } from "./payments/testD1";
import { RATE_LIMITS } from "./rateLimit";

vi.mock("./push", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./push")>()),
  notify: vi.fn(async () => {}),
}));

const HOST = "host-client-aaaa-0001";
const ANA = "ana-client-bbbb-0002";
const STRANGER = "stranger-client-cccc-03";
const SECRETS = [HOST, ANA, STRANGER];
const pid = derivePlayerIdSync;
const DAY = 24 * 60 * 60_000;
const WEBHOOK_SECRET = "whsec_test";
const INDEX_HTML = '<html><head><title>JaxSquares</title><meta name="description" content="x" /></head><body><div id="root"></div></body></html>';

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
  "migrations/0017_season.sql",
  "migrations/0019_prize_claims.sql",
  "migrations/0020_tv_display.sql",
  "migrations/0021_tv_pairings.sql",
];

let t: TestD1;
let env: Env;
let pending: Promise<unknown>[];
/** Every response body, to check none carries a secret. */
let seen: string[];

beforeEach(async () => {
  t = await createTestD1(MIGRATIONS);
  pending = [];
  seen = [];
  const stub = { fetch: async () => new Response(null, { status: 204 }) };
  env = {
    DB: t.d1,
    GAME_ROOM: { idFromName: (n: string) => n, get: () => stub } as unknown as DurableObjectNamespace,
    ASSETS: { fetch: async () => new Response(INDEX_HTML, { headers: { "content-type": "text/html" } }) } as unknown as Fetcher,
    APP_ORIGIN: "https://jaxsquares.com",
  } as Env;
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  for (const text of seen) {
    for (const secret of SECRETS) expect(text).not.toContain(secret);
    expect(text).not.toMatch(/\bclient_?id\b|\bowner|tv_?token_?hash/i);
  }
});

async function call<T = Record<string, unknown>>(
  method: string,
  path: string,
  opts: { client?: string | null; admin?: string; body?: unknown; raw?: Uint8Array | string; type?: string; headers?: Record<string, string> } = {},
): Promise<{ status: number; body: T; text: string; headers: Headers; bytes: Uint8Array }> {
  const headers: Record<string, string> = { ...opts.headers };
  if (opts.client !== null) headers["x-client-id"] = opts.client ?? HOST;
  if (opts.admin) headers["x-admin-token"] = opts.admin;
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  if (opts.raw !== undefined) headers["content-type"] = opts.type ?? "application/octet-stream";
  const res = await worker.fetch(
    new Request(`https://jaxsquares.test${path.startsWith("/g/") ? "" : "/api"}${path}`, {
      method,
      headers,
      body: opts.raw ?? (opts.body === undefined ? undefined : JSON.stringify(opts.body)),
    }),
    env,
    { waitUntil: (p: Promise<unknown>) => void pending.push(p), passThroughOnException: () => {} } as unknown as ExecutionContext,
  );
  const bytes = new Uint8Array(await res.arrayBuffer());
  const text = new TextDecoder("utf-8", { fatal: false, ignoreBOM: true }).decode(bytes);
  const json = (res.headers.get("content-type") ?? "").includes("json");
  if (!(res.headers.get("content-type") ?? "").startsWith("image/")) seen.push(text);
  return { status: res.status, body: (json && text ? JSON.parse(text) : {}) as T, text, headers: res.headers, bytes };
}

const profile = (name: string) => ({ name, color: "#38b6ff", emoji: "🐐" });

async function create(name = "Rusty Anchor Squares", client = HOST): Promise<{ id: string; admin: string }> {
  const created = await call<CreateGameResponse>("POST", "/games", {
    client,
    body: {
      name,
      sport: "football",
      league: "custom",
      teamX: { name: "Chiefs", abbr: "KC" },
      teamY: { name: "Eagles", abbr: "PHI" },
      format: { periods: "quarters", reverse: false, boardSize: 25, freshNumbers: false },
      maxPerPlayer: 0,
      host: profile("Jordan"),
    },
  });
  expect(created.status).toBe(201);
  return { id: created.body.game.id, admin: created.body.adminToken };
}

const stateOf = async (id: string) => (await call<GameState>("GET", `/games/${id}`, { client: null })).body;

/** The no-charge test pass (test mode), the Annual Pass + Venue with `plan: "club"`. */
async function testPass(client = HOST, plan: "host" | "club" = "club"): Promise<HostPassState> {
  const res = await call<HostPassState>("POST", "/payments/pass/test", { client, body: plan === "club" ? { plan } : {} });
  expect(res.status).toBe(200);
  return res.body;
}

async function join(id: string, client: string, name: string, cell?: { row: number; col: number }) {
  expect((await call("POST", `/games/${id}/join`, { client, body: profile(name) })).status).toBe(200);
  if (cell) expect((await call<{ claimed: number }>("POST", `/games/${id}/claim`, { client, body: { cells: [cell] } })).body.claimed).toBe(1);
}

/** Pictures, as far as the server reads them: a valid header and padding. */
function png(width: number, height: number, size = 400): Uint8Array {
  const b = new Uint8Array(size);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  const v = new DataView(b.buffer);
  v.setUint32(8, 13);
  b.set([0x49, 0x48, 0x44, 0x52], 12); // IHDR
  v.setUint32(16, width);
  v.setUint32(20, height);
  b[24] = 8;
  b[25] = 6;
  return b;
}

function webp(width: number, height: number, size = 300): Uint8Array {
  const b = new Uint8Array(size);
  const v = new DataView(b.buffer);
  const ascii = (at: number, s: string) => b.set(Array.from(s, (ch) => ch.charCodeAt(0)), at);
  ascii(0, "RIFF");
  v.setUint32(4, size - 8, true);
  ascii(8, "WEBP");
  ascii(12, "VP8X");
  v.setUint32(16, 10, true);
  const w = width - 1;
  const h = height - 1;
  b.set([w & 0xff, (w >> 8) & 0xff, (w >> 16) & 0xff], 24);
  b.set([h & 0xff, (h >> 8) & 0xff, (h >> 16) & 0xff], 27);
  return b;
}

/** Just enough of HTMLRewriter (Workers runtime) to see the preview tags invitePage writes. */
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
  head(): string {
    let out = "";
    this.handlers.get("head")?.element({ append: (s: string) => void (out += s), setInnerContent: () => {}, setAttribute: () => {}, remove: () => {} });
    return out;
  }
}

// ---- Buying it ----

describe("buying the Annual Pass + Venue", () => {
  it("test mode: a no-charge Annual Pass + Venue, shown apart from the Annual Pass, on GET /payments/pass and /me", async () => {
    const before = await call<HostPassState>("GET", "/payments/pass");
    expect(before.body).toMatchObject({ pass: null, club: null, clubOffer: { priceCents: 9999, currency: "usd", web: true } });
    const state = await testPass();
    expect(state.pass).toBeNull();
    expect(state.club).toMatchObject({ active: true, status: "active", provider: "test", autoRenew: false });
    const me = await call<MeResponse>("GET", "/me");
    expect(me.body.clubPass).toMatchObject({ active: true, provider: "test" });
    expect(me.body.hostPass).toBeNull();
    expect(t.query("SELECT plan, provider, status FROM host_passes")).toEqual([{ plan: "club", provider: "test", status: "active" }]);
    // Asking again keeps the one pass; ending it ends the Annual Pass + Venue only.
    await testPass();
    await testPass(HOST, "host");
    expect(t.query("SELECT plan FROM host_passes ORDER BY plan")).toEqual([{ plan: "club" }]);
    const ended = await call<HostPassState>("POST", "/payments/pass/test/end", { body: { plan: "club" } });
    expect(ended.body.club).toMatchObject({ active: false, status: "ended" });
  });

  it("is sold to an Annual Pass holder (it adds the club features); an Annual Pass + Venue holder isn't sold an Annual Pass", async () => {
    await testPass(ANA, "host");
    const both = await testPass(ANA, "club");
    expect(both.pass?.active).toBe(true);
    expect(both.club?.active).toBe(true);
    expect(t.query("SELECT plan FROM host_passes WHERE client_id = ? ORDER BY plan", ANA)).toEqual([{ plan: "club" }, { plan: "host" }]);
  });

  it("GET /api/config says how it's sold: web only, $99.99 a year", async () => {
    const config = await call<{ payments: { clubPass: unknown } }>("GET", "/config");
    expect(config.body.payments.clubPass).toEqual({ priceCents: 9999, currency: "usd", web: true });
    env = { ...env, CLUB_PASS_PRICE_CENTS: "5900" };
    expect((await call<{ payments: { clubPass: { priceCents: number } } }>("GET", "/config")).body.payments.clubPass.priceCents).toBe(5900);
  });
});

describe("the Annual Pass + Venue on the web (Stripe Billing)", () => {
  const PERIOD_END = Math.floor((Date.now() + 365 * DAY) / 1000);
  let fetchMock: ReturnType<typeof vi.fn>;

  function subscription(over: Record<string, unknown> = {}, price = "price_club") {
    return {
      id: "sub_club",
      object: "subscription",
      status: "incomplete",
      customer: "cus_1",
      current_period_end: PERIOD_END,
      cancel_at_period_end: false,
      livemode: false,
      metadata: { product: "host_pass", pass_id: "hp_x", plan: "club" },
      items: { object: "list", data: [{ id: "si_1", price: { id: price } }] },
      latest_invoice: {
        id: "in_1",
        object: "invoice",
        subscription: "sub_club",
        amount_due: 4900,
        currency: "usd",
        status: "open",
        livemode: false,
        payment_intent: {
          id: "pi_club",
          object: "payment_intent",
          amount: 4900,
          amount_received: 0,
          currency: "usd",
          status: "requires_payment_method",
          client_secret: "pi_club_secret_abc",
          livemode: false,
          metadata: {},
        },
      },
      ...over,
    };
  }

  function stripeAnswers(state: { sub: Record<string, unknown> }) {
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "https://api.stripe.com/v1/customers") return Response.json({ id: "cus_1", object: "customer", livemode: false });
      if (url === "https://api.stripe.com/v1/subscriptions" && init?.method === "POST") return Response.json(state.sub);
      if (url.startsWith(`https://api.stripe.com/v1/subscriptions/${String(state.sub.id)}`)) return Response.json(state.sub);
      throw new Error(`unexpected fetch ${url}`);
    });
  }

  function signedIn(client: string): void {
    const now = Date.now();
    t.query(`INSERT INTO accounts (id, canonical_client_id, created_at, updated_at) VALUES ('acct-1', ?, ?, ?)`, client, now, now);
    t.query(`INSERT INTO client_links (client_id, account_id, created_at) VALUES (?, 'acct-1', ?)`, client, now);
  }

  async function deliver(type: string, object: Record<string, unknown>) {
    const created = Math.floor(Date.now() / 1000);
    const payload = JSON.stringify({ id: `evt_${Math.random()}`, object: "event", type, created, livemode: false, data: { object } });
    return call("POST", "/stripe/webhook", { client: null, raw: payload, type: "application/json", headers: { "stripe-signature": await signStripePayload(payload, WEBHOOK_SECRET, created) } });
  }

  beforeEach(() => {
    env = {
      ...env,
      STRIPE_SECRET_KEY: "sk_test_1",
      STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET,
      STRIPE_HOST_PASS_PRICE_ID: "price_pass",
      STRIPE_CLUB_PASS_PRICE_ID: "price_club",
    } as Env;
    fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      throw new Error(`unexpected fetch ${String(input)}`);
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  it("needs a signed-in account (409 account_required), and 503 until its Stripe Price is set", async () => {
    const res = await call<{ code: string; error: string }>("POST", "/payments/pass/stripe", { body: { plan: "club" } });
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ code: "account_required", error: expect.stringMatching(/Annual Pass/) });
    signedIn(HOST);
    env = { ...env, STRIPE_CLUB_PASS_PRICE_ID: "" };
    const off = await call<{ error: string }>("POST", "/payments/pass/stripe", { body: { plan: "club" } });
    expect(off.status).toBe(503);
    expect(off.body.error).toMatch(/Annual Pass \+ Venue/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("subscribes at the club Price, and turns active only from Stripe's own data", async () => {
    signedIn(HOST);
    const state = { sub: subscription() };
    stripeAnswers(state);
    const res = await call<HostPassIntent>("POST", "/payments/pass/stripe", { body: { plan: "club" } });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ clientSecret: "pi_club_secret_abc", amountCents: 4900, currency: "usd" });
    const [, init] = fetchMock.mock.calls.find(([u, i]) => String(u) === "https://api.stripe.com/v1/subscriptions" && (i as RequestInit).method === "POST")! as [string, RequestInit];
    expect(Object.fromEntries(new URLSearchParams(init.body as string))).toMatchObject({
      "items[0][price]": "price_club",
      "metadata[product]": "host_pass",
      "metadata[plan]": "club",
      description: "JaxSquares Annual Pass + Venue (yearly)",
    });
    expect((init.headers as Record<string, string>)["idempotency-key"]).toBe("clubpass-cus_1-price_club-0");
    expect(t.query("SELECT plan, status FROM host_passes")).toEqual([{ plan: "club", status: "pending" }]);

    state.sub = subscription({ status: "active" });
    const confirmed = await call<HostPassState>("POST", "/payments/pass/stripe/confirm", { body: { plan: "club" } });
    expect(confirmed.body.club).toMatchObject({ active: true, provider: "stripe", renewsAt: PERIOD_END * 1000 });
    expect(confirmed.body.pass).toBeNull();
    // A second one isn't sold.
    const again = await call<{ error: string }>("POST", "/payments/pass/stripe", { body: { plan: "club" } });
    expect(again.status).toBe(409);
    expect(again.body.error).toBe("Your pass already has the Venue add-on.");
  });

  it("the webhook maps the subscription's Price to the plan: an Annual Pass moved to the club Price becomes an Annual Pass + Venue", async () => {
    signedIn(HOST);
    // An Annual Pass, bought on the web.
    const state = { sub: subscription({ id: "sub_host", status: "active", metadata: { product: "host_pass", pass_id: "hp_y" } }, "price_pass") };
    stripeAnswers(state);
    expect((await call("POST", "/payments/pass/stripe")).status).toBe(409); // active straight away
    expect(t.query("SELECT plan, status FROM host_passes")).toEqual([{ plan: "host", status: "active" }]);

    // The holder switches plans in the Customer Portal: the subscription now bills the club Price.
    state.sub = subscription({ id: "sub_host", status: "active", metadata: { product: "host_pass", pass_id: "hp_y" } }, "price_club");
    expect((await deliver("customer.subscription.updated", { ...state.sub, latest_invoice: "in_1" })).status).toBe(200);
    expect(t.query("SELECT plan FROM host_passes")).toEqual([{ plan: "club" }]);
    const now = await call<HostPassState>("GET", "/payments/pass");
    expect(now.body.club?.active).toBe(true);
    expect(now.body.pass).toBeNull();

    // A Price this deployment no longer names (kept by older subscriptions after a price change) leaves the plan as it is.
    state.sub = subscription({ id: "sub_host", status: "active" }, "price_club_2025");
    await deliver("invoice.paid", { id: "in_2", object: "invoice", subscription: "sub_host", amount_due: 4900, currency: "usd", livemode: false });
    expect(t.query("SELECT plan, status FROM host_passes")).toEqual([{ plan: "club", status: "active" }]);
  });

  /** A web Annual Pass for HOST, active (bought straight away), at the Annual Pass Price. */
  async function webAnnualPass(): Promise<{ sub: Record<string, unknown> }> {
    signedIn(HOST);
    const state = { sub: subscription({ id: "sub_host", status: "active", metadata: { product: "host_pass", pass_id: "hp_y" } }, "price_pass") };
    stripeAnswers(state);
    expect((await call("POST", "/payments/pass/stripe")).status).toBe(409); // active straight away
    expect(t.query("SELECT plan, status FROM host_passes")).toEqual([{ plan: "host", status: "active" }]);
    return state;
  }

  it("adds the Venue add-on to a running web Annual Pass, prorated and charged now, instead of selling a second pass", async () => {
    const state = await webAnnualPass();
    // Buying the Annual Pass + Venue on top: no second subscription, the app adds it instead.
    const creates = () => fetchMock.mock.calls.filter(([u, i]) => String(u) === "https://api.stripe.com/v1/subscriptions" && (i as RequestInit).method === "POST").length;
    const before = creates();
    const buy = await call<{ code: string }>("POST", "/payments/pass/stripe", { body: { plan: "club" } });
    expect(buy.status).toBe(409);
    expect(buy.body.code).toBe(UPGRADE_PASS_CODE);
    expect(creates()).toBe(before);

    let update: Record<string, string> | null = null;
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "https://api.stripe.com/v1/subscriptions/sub_host" && init?.method === "POST") {
        update = Object.fromEntries(new URLSearchParams(init.body as string));
        state.sub = subscription({ id: "sub_host", status: "active", metadata: { product: "host_pass", pass_id: "hp_y", plan: "club" } }, "price_club");
        return Response.json(state.sub);
      }
      if (url.startsWith("https://api.stripe.com/v1/subscriptions/sub_host")) return Response.json(state.sub);
      throw new Error(`unexpected fetch ${url}`);
    });
    const res = await call<HostPassState>("POST", "/payments/pass/stripe/venue");
    expect(res.status).toBe(200);
    // The same subscription's one item moves to the venue Price; what's left of the year is invoiced and charged now.
    expect(update).toMatchObject({
      "items[0][id]": "si_1",
      "items[0][price]": "price_club",
      proration_behavior: "always_invoice",
      payment_behavior: "error_if_incomplete",
      "metadata[plan]": "club",
      description: "JaxSquares Annual Pass + Venue (yearly)",
    });
    expect(res.body.club).toMatchObject({ active: true, provider: "stripe" });
    expect(t.query("SELECT plan, status FROM host_passes")).toEqual([{ plan: "club", status: "active" }]);
    // Asking again changes nothing.
    expect((await call("POST", "/payments/pass/stripe/venue")).status).toBe(200);
  });

  it("changes nothing when the card is refused, and has nothing to add it to without a web Annual Pass", async () => {
    expect((await call("POST", "/payments/pass/stripe/venue")).status).toBe(404);
    const state = await webAnnualPass();
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "https://api.stripe.com/v1/subscriptions/sub_host" && init?.method === "POST") {
        return Response.json({ error: { type: "card_error", code: "card_declined", message: "Your card was declined." } }, { status: 402 });
      }
      if (url.startsWith("https://api.stripe.com/v1/subscriptions/sub_host")) return Response.json(state.sub);
      throw new Error(`unexpected fetch ${url}`);
    });
    const res = await call<{ error: string }>("POST", "/payments/pass/stripe/venue");
    expect(res.status).toBe(402);
    expect(res.body.error).toMatch(/Your card was declined/);
    expect(t.query("SELECT plan, status FROM host_passes")).toEqual([{ plan: "host", status: "active" }]);
  });
});

// ---- Venue boards, per board (shared/pricing.ts) ----

describe("a venue board, without the Venue add-on on a pass", () => {
  async function venueBoard(client = HOST): Promise<{ id: string; admin: string }> {
    const created = await call<CreateGameResponse>("POST", "/games", {
      client,
      body: {
        name: "Rusty Anchor · Chiefs vs Eagles",
        sport: "football",
        league: "custom",
        teamX: { name: "Chiefs", abbr: "KC" },
        teamY: { name: "Eagles", abbr: "PHI" },
        format: { periods: "quarters", reverse: false, boardSize: 25, freshNumbers: false, venue: true },
        maxPerPlayer: 1,
        host: profile("Rusty Anchor"),
      },
    });
    expect(created.status).toBe(201);
    return { id: created.body.game.id, admin: created.body.adminToken };
  }

  async function crowd(id: string) {
    for (let i = 0; i <= FREE_PLAYER_LIMIT; i++) await join(id, `crowd-player-${i}-of-${id}`, `Guest ${i}`, { row: Math.floor(i / 5), col: i % 5 });
  }

  it("pays its Venue add-on at the draw: an Annual Pass covers the host fee only, the pass with the Venue add-on all of it", async () => {
    const { id, admin } = await venueBoard();
    await crowd(id);
    const due = await call<{ code: string }>("POST", `/games/${id}/lock`, { admin });
    expect(due.status).toBe(402);
    expect(due.body.code).toBe("payment_required");
    // The Annual Pass covers the host fee; the Venue add-on for this board is still due.
    await testPass(HOST, "host");
    expect((await call("POST", `/games/${id}/lock`, { admin })).status).toBe(402);
    expect((await call("POST", `/games/${id}/pay/test`, { admin })).status).toBe(200);
    expect((await call("POST", `/games/${id}/lock`, { admin })).status).toBe(200);

    // With the Venue add-on on the pass, another venue board draws through it.
    await testPass(HOST, "club");
    const next = await venueBoard();
    await crowd(next.id);
    expect((await call("POST", `/games/${next.id}/lock`, { admin: next.admin })).status).toBe(200);
    expect(t.query("SELECT payment_provider FROM games WHERE id = ?", next.id)).toEqual([{ payment_provider: "pass" }]);
  });

  it("keeps venue mode as it was once the board is paid for", async () => {
    const { id, admin } = await venueBoard();
    const format = (await stateOf(id)).game.format;
    // While nothing's paid, it can still change.
    expect((await call("PATCH", `/games/${id}`, { admin, body: { format: { ...format, venue: false } } })).status).toBe(200);
    expect((await call("PATCH", `/games/${id}`, { admin, body: { format: { ...format, venue: true } } })).status).toBe(200);
    await crowd(id);
    expect((await call("POST", `/games/${id}/pay/test`, { admin })).status).toBe(200);
    const locked = await call<{ error: string }>("PATCH", `/games/${id}`, { admin, body: { format: { ...format, venue: false } } });
    expect(locked.status).toBe(409);
    expect(locked.body.error).toBe(VENUE_LOCKED_ERROR);
  });

  it(`takes up to ${CLUB_MAX_COHOSTS} co-hosts and gives its host the players list`, async () => {
    const { id, admin } = await venueBoard(ANA);
    expect((await stateOf(id)).game.club ?? null).toBeNull();
    for (let i = 0; i < CLUB_MAX_COHOSTS; i++) {
      const client = `staff-${i}-of-${id}`;
      await join(id, client, `Staff ${i}`);
      const invite = await call<CohostInviteResponse>("POST", `/games/${id}/cohost-invites`, { client: ANA, admin });
      expect(invite.status).toBe(201);
      seen.pop();
      expect((await call("POST", `/games/${id}/cohosts/accept`, { client, body: { token: new URL(invite.body.url).searchParams.get("cohost") } })).status).toBe(200);
    }
    expect((await call("POST", `/games/${id}/cohost-invites`, { client: ANA, admin })).status).toBe(409);
    expect((await call("GET", `/games/${id}/export.csv`, { client: ANA, admin })).status).toBe(200);
  });
});

// ---- What it covers ----

describe("what the Annual Pass + Venue covers", () => {
  it("covers the host fee at the draw, like the Annual Pass", async () => {
    const { id, admin } = await create();
    for (let i = 0; i <= FREE_PLAYER_LIMIT; i++) await join(id, `crowd-player-${i}-of-${id}`, `Friend ${i}`, { row: Math.floor(i / 5), col: i % 5 });
    expect((await call("POST", `/games/${id}/lock`, { admin })).status).toBe(402);
    await testPass();
    const res = await call<{ state: GameState }>("POST", `/games/${id}/lock`, { admin });
    expect(res.status).toBe(200);
    expect(res.body.state.game).toMatchObject({ status: "locked", paid: true });
    expect(t.query("SELECT payment_provider, payment_amount_cents FROM games WHERE id = ?", id)).toEqual([{ payment_provider: "pass", payment_amount_cents: 0 }]);
  });

  async function cohostsUpTo(id: string, admin: string, n: number): Promise<{ status: number; error?: string }> {
    for (let i = 0; i < n; i++) {
      const client = `cohost-player-${i}-of-${id}`;
      await join(id, client, `Helper ${i}`);
      const invite = await call<CohostInviteResponse & { error?: string }>("POST", `/games/${id}/cohost-invites`, { admin });
      if (invite.status !== 201) return { status: invite.status, error: invite.body.error };
      seen.pop();
      const token = new URL(invite.body.url).searchParams.get("cohost");
      expect((await call("POST", `/games/${id}/cohosts/accept`, { client, body: { token } })).status).toBe(200);
    }
    return { status: 201 };
  }

  it(`takes up to ${CLUB_MAX_COHOSTS} co-hosts on an Annual Pass + Venue holder's board, ${MAX_COHOSTS} on any other`, async () => {
    const plain = await create("Plain Squares", ANA);
    expect(await cohostsUpTo(plain.id, plain.admin, MAX_COHOSTS)).toEqual({ status: 201 });
    expect(await cohostsUpTo(plain.id, plain.admin, 1)).toEqual({ status: 409, error: `A board can have up to ${MAX_COHOSTS} co-hosts. Remove one to invite someone new.` });

    await testPass();
    const club = await create();
    expect((await stateOf(club.id)).game.club).toMatchObject({ name: "" });
    expect(await cohostsUpTo(club.id, club.admin, CLUB_MAX_COHOSTS)).toEqual({ status: 201 });
    expect((await stateOf(club.id)).game.cohostIds).toHaveLength(CLUB_MAX_COHOSTS);
    expect(await cohostsUpTo(club.id, club.admin, 1)).toEqual({ status: 409, error: `A board can have up to ${CLUB_MAX_COHOSTS} co-hosts. Remove one to invite someone new.` });
  });
});

// ---- Branding ----

describe("the club's branding", () => {
  it("shows on the holder's boards as public branding only, and goes when the pass ends", async () => {
    const { id } = await create();
    expect((await stateOf(id)).game.club).toBeNull();
    await testPass();
    const mine = await call<ClubSettings>("GET", "/clubs/mine");
    expect(mine.status).toBe(200);
    expect(mine.body.club).toEqual({ id: expect.stringMatching(/^[0-9a-f]{16}$/), name: "", hasLogo: false, logoVersion: null });
    expect(mine.body.tvKey).toBeNull();
    expect(mine.body.boards.map((b) => b.id)).toEqual([id]);

    const named = await call<ClubSettings>("PATCH", "/clubs/mine", { body: { name: "  The Rusty   Anchor " } });
    expect(named.status).toBe(200);
    expect(named.body.club.name).toBe("The Rusty Anchor");
    const state = await call<GameState>("GET", `/games/${id}`, { client: null });
    expect(state.body.game.club).toEqual({ id: mine.body.club.id, name: "The Rusty Anchor", hasLogo: false, logoVersion: null });
    // The public board names the club by its own id, never by who owns it.
    expect(Object.keys(state.body.game.club ?? {})).toEqual(["id", "name", "hasLogo", "logoVersion"]);
    // Its open screens got the new name.
    expect(pending.length).toBeGreaterThan(0);

    await call("POST", "/payments/pass/test/end", { body: { plan: "club" } });
    expect((await stateOf(id)).game.club).toBeNull();
    expect((await call("GET", "/clubs/mine")).status).toBe(404);
  });

  it("checks the name like a board name: no money talk, 40 characters at most", async () => {
    await testPass();
    const money = await call<{ error: string }>("PATCH", "/clubs/mine", { body: { name: "Cash Squares $20" } });
    expect(money.status).toBe(400);
    expect(money.body.error).toBe(CLUB_NAME_MONEY_ERROR);
    expect((await call("PATCH", "/clubs/mine", { body: { name: "x".repeat(41) } })).status).toBe(400);
    expect((await call("PATCH", "/clubs/mine", { body: {} })).status).toBe(400);
    // Nobody else's club: no pass, no club.
    expect((await call("PATCH", "/clubs/mine", { client: STRANGER, body: { name: "Mine Now" } })).status).toBe(404);
  });

  it("reaches other isolates' boards within the cache's TTL", async () => {
    vi.useFakeTimers({ now: Date.now(), toFake: ["Date"] });
    const { id } = await create();
    // Read (and cached) before the pass.
    expect((await stateOf(id)).game.club).toBeNull();
    t.query(
      `INSERT INTO host_passes (id, client_id, provider, plan, external_id, status, current_period_end, auto_renew, livemode, event_at, created_at, updated_at)
       VALUES ('hp_elsewhere', ?, 'stripe', 'club', 'sub_elsewhere', 'active', ?, 1, 0, 0, 0, 0)`,
      HOST,
      Date.now() + 365 * DAY,
    );
    expect((await stateOf(id)).game.club).toBeNull();
    vi.setSystemTime(Date.now() + CLUB_BRAND_TTL_MS + 1);
    expect((await stateOf(id)).game.club).toMatchObject({ name: "" });
  });

  it("link previews say who hosts it, never an amount", async () => {
    vi.stubGlobal("HTMLRewriter", FakeRewriter);
    await testPass();
    await call("PATCH", "/clubs/mine", { body: { name: "The Rusty Anchor" } });
    const { id, admin } = await create();
    const priced = await call<{ state: GameState }>("PATCH", `/games/${id}`, {
      admin,
      body: { format: { periods: "quarters", reverse: false, boardSize: 25, freshNumbers: false, unit: "$", squarePrice: 10, rules: [{ moment: "final", square: { amount: 250, note: "" }, reverse: null }] } },
    });
    expect(priced.body.state.game.format.squarePrice).toBe(10);
    expect((await call("GET", `/g/${id}`, { client: null })).status).toBe(200);
    const head = FakeRewriter.last!.head();
    expect(head).toContain('<meta property="og:description" content="Hosted by The Rusty Anchor · Chiefs vs Eagles');
    expect(head).not.toContain("$");
    const meta = inviteMeta(await stateOf(id), "https://jaxsquares.com", "tv");
    expect(meta.description).toMatch(/^Hosted by The Rusty Anchor · /);
  });
});

// ---- The logo ----

describe("the club logo", () => {
  it("accepts a PNG or WebP of at most 256x256 under 60 KB, checking the type, the magic bytes and the size", async () => {
    await testPass();
    const put = (bytes: Uint8Array | string, type: string) => call<ClubSettings & { error?: string }>("PUT", "/clubs/mine/logo", { raw: bytes, type });
    expect((await put(png(64, 64), "image/gif")).status).toBe(415);
    expect((await put("<svg xmlns='http://www.w3.org/2000/svg'></svg>", "image/png")).status).toBe(415);
    expect((await put(webp(64, 64), "image/png")).body.error).toBe("That file isn't the picture it says it is.");
    expect((await put(png(512, 512), "image/png")).status).toBe(400);
    expect((await put(png(64, 64, CLUB_LOGO_MAX_BYTES + 1), "image/png")).status).toBe(413);
    expect((await put(new Uint8Array(0), "image/png")).status).toBe(400);
    const broken = png(64, 64);
    broken[12] = 0;
    expect((await put(broken, "image/png")).status).toBe(400);
    expect(t.query("SELECT logo FROM clubs")).toEqual([{ logo: null }]);

    const ok = await put(webp(256, 200), "image/webp");
    expect(ok.status).toBe(200);
    expect(ok.body.club).toMatchObject({ hasLogo: true, logoVersion: expect.stringMatching(/^[0-9a-f]{16}$/) });
    const again = await put(png(128, 128), "image/png");
    expect(again.body.club.logoVersion).not.toBe(ok.body.club.logoVersion);
    expect(t.query("SELECT logo_type FROM clubs")).toEqual([{ logo_type: "image/png" }]);
    // Nobody without an Annual Pass + Venue uploads one.
    expect((await call("PUT", "/clubs/mine/logo", { client: STRANGER, raw: png(64, 64), type: "image/png" })).status).toBe(404);
  });

  it("checks WebP headers of every kind (VP8X, lossless, lossy)", () => {
    expect(checkLogo(webp(256, 256), "image/webp")).toMatchObject({ ok: true, width: 256, height: 256 });
    const lossless = webp(10, 10);
    lossless.set(Array.from("VP8L", (ch) => ch.charCodeAt(0)), 12);
    lossless[20] = 0x2f;
    new DataView(lossless.buffer).setUint32(21, (99 & 0x3fff) | ((49 & 0x3fff) << 14), true);
    expect(checkLogo(lossless, "image/webp")).toMatchObject({ ok: true, width: 100, height: 50 });
    const lossy = webp(10, 10);
    lossy.set(Array.from("VP8 ", (ch) => ch.charCodeAt(0)), 12);
    lossy.set([0x9d, 0x01, 0x2a], 23);
    new DataView(lossy.buffer).setUint16(26, 300, true);
    new DataView(lossy.buffer).setUint16(28, 120, true);
    expect(checkLogo(lossy, "image/webp")).toMatchObject({ ok: false, status: 400 });
    expect(checkLogo(webp(257, 10), "image/webp")).toMatchObject({ ok: false, status: 400 });
  });

  it("is served with long cache headers and an ETag, and 304 when it's unchanged", async () => {
    await testPass();
    const bytes = png(96, 96);
    const up = await call<ClubSettings>("PUT", "/clubs/mine/logo", { raw: bytes, type: "image/png" });
    const { id, logoVersion } = up.body.club;
    const res = await call("GET", `/clubs/${id}/logo`, { client: null });
    expect(res.status).toBe(200);
    expect(res.bytes).toEqual(bytes);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("etag")).toBe(`"${logoVersion}"`);
    expect(res.headers.get("cache-control")).toBe("public, max-age=86400");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    const versioned = await call("GET", `/clubs/${id}/logo?v=${logoVersion}`, { client: null });
    expect(versioned.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    const cached = await call("GET", `/clubs/${id}/logo`, { client: null, headers: { "if-none-match": `"${logoVersion}"` } });
    expect(cached.status).toBe(304);
    expect(cached.bytes).toHaveLength(0);
    expect((await call("GET", `/clubs/${id}/logo`, { client: null, headers: { "if-none-match": '"stale"' } })).status).toBe(200);

    expect((await call("GET", "/clubs/0123456789abcdef/logo", { client: null })).status).toBe(404);
    expect((await call("GET", "/clubs/not-a-club/logo", { client: null })).status).toBe(404);
    expect((await call<ClubSettings>("DELETE", "/clubs/mine/logo")).body.club).toMatchObject({ hasLogo: false, logoVersion: null });
    expect((await call("GET", `/clubs/${id}/logo`, { client: null })).status).toBe(404);
  });

  it("rate-limits uploads", async () => {
    await testPass();
    for (let i = 0; i < RATE_LIMITS.clubBrand.limit; i++) expect((await call("PUT", "/clubs/mine/logo", { raw: png(32, 32), type: "image/png" })).status).toBe(200);
    expect((await call("PUT", "/clubs/mine/logo", { raw: png(32, 32), type: "image/png" })).status).toBe(429);
  });
});

// ---- The players CSV ----

describe("GET /api/games/:id/export.csv", () => {
  async function clubBoard() {
    await testPass();
    const board = await create();
    await join(board.id, ANA, "Ana", { row: 0, col: 1 });
    expect((await call("POST", `/games/${board.id}/claim`, { client: ANA, body: { cells: [{ row: 2, col: 3 }] } })).status).toBe(200);
    await join(board.id, STRANGER, "=HYPERLINK(\"http://x\")");
    return board;
  }

  const lines = (text: string) => text.replace(/^\uFEFF/, "").trimEnd().split("\r\n");

  it("lists every player: name, how many squares, which ones, when they joined; never a payment column, an email or a clientId", async () => {
    const { id, admin } = await clubBoard();
    const res = await call("GET", `/games/${id}/export.csv`, { admin });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="rusty-anchor-squares-players.csv"');
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.text.startsWith("\uFEFF")).toBe(true);
    const [header, ...rows] = lines(res.text);
    expect(header).toBe("Player,Squares,Square list,Joined (UTC)");
    expect(header).not.toMatch(/paid|payment|owe|amount|price|email|client|venmo/i);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatch(/^Jordan,0,,\d{4}-\d\d-\d\d \d\d:\d\d$/);
    expect(rows[1]).toMatch(/^Ana,2,1-2; 3-4,/);
    // A name a spreadsheet would run as a formula stays text.
    expect(rows[2]).toMatch(/^"'=HYPERLINK\(""http:\/\/x""\)",0,,/);
  });

  it("adds each square's numbers once they're drawn, and the joined time in the asked time zone", async () => {
    const { id, admin } = await clubBoard();
    const locked = await call<{ state: GameState }>("POST", `/games/${id}/lock`, { admin });
    expect(locked.status).toBe(200);
    const draw = locked.body.state.game.numbers!["*"];
    const res = await call("GET", `/games/${id}/export.csv?tz=America/New_York`, { admin });
    const [header, , ana] = lines(res.text);
    expect(header).toBe("Player,Squares,Square list,Numbers (KC-PHI),Joined (America/New_York)");
    const pair = (row: number, col: number) => `${draw.x[col].join("/")}-${draw.y[row].join("/")}`;
    expect(ana.split(",").slice(0, 4)).toEqual(["Ana", "2", "1-2; 3-4", `${pair(0, 1)}; ${pair(2, 3)}`]);
    expect(lines((await call("GET", `/games/${id}/export.csv?tz=Not/AZone`, { admin })).text)[0]).toMatch(/Joined \(UTC\)$/);
  });

  it("is for the board's host and co-hosts only, on an Annual Pass + Venue holder's board", async () => {
    const { id, admin } = await clubBoard();
    expect((await call("GET", `/games/${id}/export.csv`, { client: ANA })).status).toBe(403);
    expect((await call("GET", `/games/${id}/export.csv`, { client: null, admin })).status).toBe(401);
    // A co-host gets it with no admin token.
    const invite = await call<CohostInviteResponse>("POST", `/games/${id}/cohost-invites`, { admin });
    seen.pop();
    await call("POST", `/games/${id}/cohosts/accept`, { client: ANA, body: { token: new URL(invite.body.url).searchParams.get("cohost") } });
    expect((await call("GET", `/games/${id}/export.csv`, { client: ANA })).status).toBe(200);
    // Any other board: not a venue's, so not there.
    const plain = await create("Plain Squares", STRANGER);
    const refused = await call<{ error: string }>("GET", `/games/${plain.id}/export.csv`, { client: STRANGER, admin: plain.admin });
    expect(refused.status).toBe(403);
    expect(refused.body.error).toMatch(/Venue add-on/);
  });

  it("is rate limited", async () => {
    const { id, admin } = await clubBoard();
    for (let i = 0; i < RATE_LIMITS.clubExport.limit; i++) expect((await call("GET", `/games/${id}/export.csv`, { admin })).status).toBe(200);
    expect((await call("GET", `/games/${id}/export.csv`, { admin })).status).toBe(429);
  });

  it("builds cells that spreadsheets read as text (pure)", () => {
    expect(csvCell("Ana")).toBe("Ana");
    expect(csvCell('Al "The Pick" Jones')).toBe('"Al ""The Pick"" Jones"');
    expect(csvCell("Smith, Jo")).toBe('"Smith, Jo"');
    expect(csvCell("+1 555")).toBe("'+1 555");
    expect(csvCell("@sum")).toBe("'@sum");
    expect(csvCell("-2")).toBe("'-2");
    expect(csvCell(3)).toBe("3");
  });

  it("puts a board with new numbers each quarter's draws in their own columns", async () => {
    const state = {
      game: {
        id: "abc234",
        name: "Q",
        teamX: { name: "Chiefs", abbr: "KC" },
        teamY: { name: "Eagles", abbr: "PHI" },
        format: { periods: "quarters", reverse: false, boardSize: 100, freshNumbers: true },
        periods: [
          { key: "q1", label: "Q1" },
          { key: "q2", label: "Half" },
        ],
        numbers: {
          q1: { x: [[1], [2]], y: [[3], [4]] },
          q2: { x: [[5], [6]], y: [[7], [8]] },
        },
      },
      players: [{ id: pid(ANA), name: "Ana", color: "#000000", emoji: "", joinedAt: Date.UTC(2026, 9, 19, 17, 5), isHost: false }],
      squares: [{ row: 1, col: 0, playerId: pid(ANA), claimedAt: 0 }],
    } as unknown as GameState;
    const [header, row] = lines(playersCsv(state));
    expect(header).toBe("Player,Squares,Square list,Numbers Q1 (KC-PHI),Numbers Half (KC-PHI),Joined (UTC)");
    expect(row).toBe("Ana,1,2-1,1-4,5-8,2026-10-19 17:05");
  });
});

// ---- The club TV ----

describe("the club TV", () => {
  async function tv(clubId: string, token: string | null) {
    return call<ClubTvState & { error?: string }>("GET", `/clubs/${clubId}/tv`, { client: null, headers: token ? { [CLUB_TV_TOKEN_HEADER]: token } : {} });
  }

  async function newLink(client = HOST): Promise<{ clubId: string; token: string; res: ClubTvLink }> {
    const res = await call<ClubTvLink>("POST", "/clubs/mine/tv", { client });
    expect(res.status).toBe(201);
    seen.pop(); // only the holder sees the link
    const url = new URL(res.body.tvUrl);
    const token = new URLSearchParams(url.hash.slice(1)).get("k") ?? "";
    return { clubId: url.pathname.split("/")[2], token, res: res.body };
  }

  it("shows the club's open and live boards (public state only) to whoever has the link", async () => {
    await testPass();
    await call("PATCH", "/clubs/mine", { body: { name: "The Rusty Anchor" } });
    const open = await create("Open Board");
    const drawn = await create("Drawn Board");
    expect((await call("POST", `/games/${drawn.id}/lock`, { admin: drawn.admin })).status).toBe(200);
    const done = await create("Done Board");
    await call("POST", `/games/${done.id}/lock`, { admin: done.admin });
    expect((await call("POST", `/games/${done.id}/final`, { admin: done.admin })).status).toBe(200);
    const theirs = await create("Not The Club's", ANA);

    const { clubId, token, res } = await newLink();
    expect(res.tvUrl).toMatch(new RegExp(`^https://jaxsquares\\.test/club/${clubId}/tv#k=[A-Za-z0-9_-]{43}$`));
    expect(res.tvKey).toMatch(/^[0-9a-f]{8}$/);
    const shown = await tv(clubId, token);
    expect(shown.status).toBe(200);
    expect(shown.headers.get("cache-control")).toBe("no-store");
    expect(shown.body.active).toBe(true);
    expect(shown.body.club).toMatchObject({ id: clubId, name: "The Rusty Anchor" });
    expect(shown.body.boards.map((b) => b.game.name).sort()).toEqual(["Drawn Board", "Open Board"]);
    expect(shown.body.boards.map((b) => b.game.id)).not.toContain(theirs.id);
    expect(shown.body.boards.map((b) => b.game.id)).not.toContain(done.id);
    expect(shown.body.boards.every((b) => b.game.club?.id === clubId)).toBe(true);
    expect(shown.text).not.toContain(open.admin);
  });

  it("is a 404 for a wrong, missing or old token; a new link cuts off the old one", async () => {
    await testPass();
    const club = (await call<ClubSettings>("GET", "/clubs/mine")).body.club;
    // No link made yet.
    expect((await tv(club.id, "A".repeat(43))).status).toBe(404);
    const first = await newLink();
    expect((await tv(first.clubId, first.token)).status).toBe(200);
    expect((await tv(first.clubId, null)).status).toBe(404);
    expect((await tv(first.clubId, `${first.token.slice(0, -1)}${first.token.endsWith("A") ? "B" : "A"}`)).status).toBe(404);
    expect((await tv(first.clubId, "short")).status).toBe(404);
    expect((await tv("0123456789abcdef", first.token)).status).toBe(404);

    const second = await newLink();
    expect(second.token).not.toBe(first.token);
    expect(second.res.tvKey).not.toBe(first.res.tvKey);
    expect((await tv(first.clubId, first.token)).status).toBe(404);
    expect((await tv(second.clubId, second.token)).status).toBe(200);
    // Only the hash is kept.
    expect(JSON.stringify(t.query("SELECT * FROM clubs"))).not.toContain(second.token);
    // Someone else's link opens their own club only.
    await testPass(ANA);
    const theirs = await newLink(ANA);
    expect((await tv(first.clubId, theirs.token)).status).toBe(404);
  });

  it("shows no boards once the pass has ended; strangers can't make a link; rotations are rate limited", async () => {
    await testPass();
    await create();
    const { clubId, token } = await newLink();
    await call("POST", "/payments/pass/test/end", { body: { plan: "club" } });
    expect((await tv(clubId, token)).body).toMatchObject({ active: false, boards: [] });
    expect((await call("POST", "/clubs/mine/tv", { client: STRANGER })).status).toBe(404);

    await testPass(ANA);
    for (let i = 0; i < RATE_LIMITS.clubTv.limit; i++) await newLink(ANA);
    expect((await call("POST", "/clubs/mine/tv", { client: ANA })).status).toBe(429);
  });
});
