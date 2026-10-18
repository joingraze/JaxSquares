// JaxSquares Worker: JSON API under /api/* (Hono), universal-link files, per-game
// invite previews, the cron that wakes live-score polling, and the SPA fallback.

import { Hono, type Context, type MiddlewareHandler } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import {
  MONEY_ERRORS,
  PrizeNoteError,
  everyScoreIndex,
  everyScorePeriod,
  fixedPeriods,
  foldNotes,
  formatError,
  hasScoreMoment,
  mentionsMoney,
  rulesOf,
  rulesShape,
  sanitizeFormat,
  sanitizePrizes,
  withRules,
} from "../shared/formats";
import { KICKOFF_ERRORS, kickoffProblem } from "../shared/kickoff";
import { isClientId, isPlayerId } from "../shared/playerId";
import { MAX_PLAYERS, drawNumbers, fixedPeriodsOf, isValidCell, liveLabel, primaryAward, resolveResults, resultNote, totalSquares } from "../shared/squares";
import { PAYMENT_REQUIRED_CODE } from "../shared/types";
import type {
  Activity,
  CreateGameResponse,
  Game,
  GameFormat,
  GameState,
  League,
  LinkedEvent,
  Period,
  Sport,
  Team,
} from "../shared/types";
import * as db from "./db";
import type { Env } from "./env";
import { housekeeping, isHousekeepingTick } from "./housekeeping";
import { inviteMeta, withInviteMeta } from "./og";
import { getPaymentConfig, paymentsRoutes } from "./payments";
import { playerIdOf } from "./playerIds";
import { pushRoutes, type NotifyEvent } from "./push";
import { RATE_LIMITS, addressSubject, checkRate, type RateRule } from "./rateLimit";
import { POLL_LEAD_MS } from "./room";
import { scheduleRoutes } from "./scores";
import { broadcast, closeRoom, loadState, newActivity, notifyAll, pushToRoom, roomStub, scoreEvents, tokenMatches } from "./service";

export { GameRoom } from "./room";
export { ScoreHub } from "./scores/hub";

/**
 * `clientId`: the device's secret (x-client-id), used only for D1 lookups.
 * `playerId`: its public id, used for everything a client can see (activity
 * actors, ownership checks against GameState, notify actors, rate-limit keys).
 */
type AppEnv = { Bindings: Env; Variables: { clientId: string; playerId: string } };
type Ctx = Context<AppEnv>;

const SPORTS: readonly Sport[] = ["football", "basketball", "baseball", "hockey", "soccer", "other"];
const LEAGUES: readonly League[] = ["nfl", "ncaaf", "custom"];
const ID_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"; // no easily-confused characters
const GAME_ID_RE = /^[a-z0-9]{4,16}$/;
/** Most boards a device may ask about with `GET /api/me/games?seen=` (it keeps about this many). */
const SEEN_MAX = 50;
const MAX_BODY_BYTES = 32 * 1024;
const MAX_SCORE = 999;
const DEFAULT_COLOR = "#38bdf8";
const DEFAULT_BUNDLE_ID = "com.jaxsquares.app";
const BOARD_FULL = "This board has all the players it can take. Ask the host to make room.";
/** POST /lock on a board whose host fee isn't paid yet (402, with PAYMENT_REQUIRED_CODE). */
const DRAW_NEEDS_PAYMENT = "Draw the numbers once the board's paid for.";
/** How long before a linked board's kickoff its host hears "draw the numbers" while the fee is unpaid. */
const DRAW_REMINDER_LEAD_MS = 60 * 60_000;
/** A board made this recently isn't reminded: its host is setting it up right now. */
const DRAW_REMINDER_MIN_AGE_MS = 15 * 60_000;

// ---- small validation helpers ----

function makeId(len = 6): string {
  let s = "";
  for (const b of crypto.getRandomValues(new Uint8Array(len))) s += ID_ALPHABET[b % ID_ALPHABET.length];
  return s;
}

function makeToken(): string {
  return crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
}

/** Single-line text: control chars stripped, whitespace collapsed, capped by code points. */
function cleanText(v: unknown, max: number): string {
  if (typeof v !== "string") return "";
  // Control and bidi-override characters; ZWJ is kept so emoji sequences survive.
  const s = v.replace(/[\p{Cc}‪-‮⁦-⁩]/gu, "").replace(/\s+/g, " ").trim();
  return Array.from(s).slice(0, max).join("").trim();
}

function cleanColor(v: unknown): string | null {
  return typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v) ? v.toLowerCase() : null;
}

const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

/** One emoji (a single grapheme that is pictographic or a flag), else "". */
function cleanEmoji(v: unknown): string {
  if (typeof v !== "string") return "";
  const first = segmenter.segment(v.trim())[Symbol.iterator]().next().value?.segment ?? "";
  return first.length <= 16 && /\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(first) ? first : "";
}

function cleanTeam(v: unknown): Team | null {
  if (!v || typeof v !== "object") return null;
  const t = v as Record<string, unknown>;
  const name = cleanText(t.name, 40);
  if (!name) return null;
  const team: Team = { name };
  const abbr = cleanText(t.abbr, 6).toUpperCase();
  if (/^[A-Z0-9&.]{1,6}$/.test(abbr)) team.abbr = abbr;
  const color = cleanColor(t.color);
  if (color) team.color = color;
  return team;
}

function cleanLinkedEvent(v: unknown, now: number): LinkedEvent | null {
  if (!v || typeof v !== "object") return null;
  const e = v as Record<string, unknown>;
  if (e.provider !== "espn" || (e.league !== "nfl" && e.league !== "ncaaf")) return null;
  if (typeof e.eventId !== "string" || !/^[A-Za-z0-9_-]{1,32}$/.test(e.eventId)) return null;
  const startsAt = Number(e.startsAt);
  const day = 24 * 60 * 60 * 1000;
  if (!Number.isFinite(startsAt) || startsAt < now - day || startsAt > now + 400 * day) return null;
  if (typeof e.xIsHome !== "boolean") return null;
  return { provider: "espn", league: e.league, eventId: e.eventId, startsAt: Math.trunc(startsAt), xIsHome: e.xIsHome };
}

/** A custom board's kickoff from a request: null when absent (no set time), a 400 when out of range. */
function cleanKickoff(v: unknown, now: number): number | null {
  if (v === undefined || v === null) return null;
  const problem = kickoffProblem(v, now);
  if (problem) fail(400, problem);
  return Math.trunc(v as number);
}

function cleanProfile(v: unknown): { name: string; color: string; emoji: string } {
  const p = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  return { name: cleanText(p.name, 24), color: cleanColor(p.color) ?? DEFAULT_COLOR, emoji: cleanEmoji(p.emoji) };
}

function intIn(v: unknown, min: number, max: number): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
}

/** Valid, de-duplicated cells for this board; null if any cell is malformed. */
function parseCells(v: unknown, game: Game): { row: number; col: number }[] | null {
  const total = totalSquares(game.format.boardSize);
  if (!Array.isArray(v) || v.length === 0 || v.length > total) return null;
  const seen = new Set<string>();
  const out: { row: number; col: number }[] = [];
  for (const cell of v) {
    if (!cell || typeof cell !== "object") return null;
    const { row, col } = cell as { row: unknown; col: unknown };
    if (typeof row !== "number" || typeof col !== "number" || !isValidCell(game.format.boardSize, row, col)) return null;
    const key = `${row},${col}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ row, col });
  }
  return out;
}

async function readJson(c: Ctx): Promise<Record<string, unknown>> {
  const length = Number(c.req.header("content-length") ?? 0);
  if (length > MAX_BODY_BYTES) throw new HTTPException(413, { message: "Request too large" });
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new HTTPException(400, { message: "Invalid JSON body" });
  return body as Record<string, unknown>;
}

function fail(status: 400 | 403 | 404 | 409, message: string): never {
  throw new HTTPException(status, { message });
}

/** Prize notes for this format; a note that mentions money is a 400 with a message the UI shows as-is. */
function cleanPrizes(format: GameFormat, input: unknown): Record<string, string> {
  try {
    return sanitizePrizes(format, input);
  } catch (err) {
    if (err instanceof PrizeNoteError) fail(400, err.message);
    throw err;
  }
}

/**
 * An older client's prize notes for a board that has rules: period key ->
 * note ("" clears it), checked like any note (400 on money). Only the keys
 * the rules have (and "*").
 */
function legacyNotes(format: GameFormat, input: unknown): Record<string, string> {
  const notes: Record<string, string> = {};
  if (!input || typeof input !== "object" || Array.isArray(input)) return notes;
  const kept = cleanPrizes(format, input);
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (typeof value !== "string") continue;
    if (key in kept) notes[key] = kept[key];
    else if (!value.trim() && (key === "*" || fixedPeriods(rulesOf(format)).some((p) => p.key === key))) notes[key] = "";
  }
  return notes;
}

/** Fixed periods a format's rules award (what games.periods holds). */
function periodsOf(format: GameFormat): Period[] {
  return fixedPeriods(rulesOf(format));
}

/**
 * Lock rules for a host's rules edit: amounts, notes, the unit and the square
 * price change any time (even after the final, for corrections); who wins
 * when only until the first score or host pick; fresh numbers only until the
 * numbers are drawn; the board size never.
 */
function rulesEditProblem(state: GameState, next: GameFormat): string | null {
  const { game } = state;
  if (next.boardSize !== game.format.boardSize) return "The board size can't change once the board is made.";
  const scoring = rulesShape(rulesOf(next)) !== rulesShape(rulesOf(game.format));
  if (scoring && (state.scores.length > 0 || state.manualWinners.length > 0)) {
    return "Scoring rules lock once the first score is in. You can still change amounts and notes.";
  }
  if (next.freshNumbers !== game.format.freshNumbers && game.numbers) {
    return "New numbers each quarter locks once the numbers are drawn. You can still change amounts and notes.";
  }
  return null;
}

/** 429 with a friendly message once this player (or `subject`, e.g. a game id) is over `rule`; null to carry on. */
async function rateLimited(c: Ctx, rule: RateRule, subject: string = c.get("playerId")): Promise<Response | null> {
  const { ok, retryAfter } = await checkRate(c.env.DB, rule, subject);
  return ok ? null : c.json({ error: rule.message }, 429, { "retry-after": String(retryAfter) });
}

/**
 * `rule` for this device, and `perAddress` for the caller's network address
 * (CF-Connecting-IP, which Cloudflare sets; absent outside it): a clientId is
 * free to mint, so the device count alone can't stop one source rotating
 * made-up ids.
 */
async function deviceLimited(c: Ctx, rule: RateRule, perAddress: RateRule): Promise<Response | null> {
  const ip = c.req.header("cf-connecting-ip")?.trim();
  const [device, address] = await Promise.all([
    rateLimited(c, rule),
    ip ? addressSubject(ip).then((subject) => rateLimited(c, perAddress, subject)) : null,
  ]);
  return device ?? address;
}

function gameIdParam(c: Ctx): string {
  const id = c.req.param("id") ?? "";
  if (!GAME_ID_RE.test(id)) fail(404, "Game not found");
  return id;
}

/** Run work after the response (falls back to fire-and-forget outside a Worker). */
function defer(c: Ctx, p: Promise<unknown>): void {
  const guarded = p.catch((err) => console.error("background task failed", err));
  try {
    c.executionCtx.waitUntil(guarded);
  } catch {
    // no execution context (tests)
  }
}

/** Push the committed state, plus the activities it recorded, to the room. */
function publish(c: Ctx, state: GameState, activityIds: string[] = [], notifications: NotifyEvent[] = []): void {
  const activities = activityIds
    .map((id) => state.activity.find((a) => a.id === id))
    .filter((a): a is Activity => !!a);
  defer(c, pushToRoom(c.env, state.game.id, state, activities));
  if (notifications.length > 0) defer(c, notifyAll(c.env, state.game.id, notifications));
}

async function stateOr404(c: Ctx, id: string): Promise<GameState> {
  const state = await loadState(c.env, id);
  if (!state) fail(404, "Game not found");
  return state;
}

/** Loads state and checks x-admin-token in the same round trip. */
async function hostState(c: Ctx, id: string): Promise<GameState> {
  const found = await db.getGameStateWithToken(c.env.DB, id);
  if (!found) fail(404, "Game not found");
  const { state, adminToken } = found;
  if (!tokenMatches(adminToken, c.req.header("x-admin-token") ?? "")) fail(403, "Only the host can do that");
  return state;
}

async function commitOr404(c: Ctx, id: string, writes: D1PreparedStatement[], now?: number) {
  const out = await db.commit(c.env.DB, id, writes, now);
  const { results, state } = out;
  if (!state) fail(404, "Game not found");
  return { results, state };
}

const requireClient: MiddlewareHandler<AppEnv> = async (c, next) => {
  const id = c.req.header("x-client-id") ?? "";
  if (!isClientId(id)) return c.json({ error: "Missing or invalid x-client-id" }, 401);
  c.set("clientId", id);
  c.set("playerId", await playerIdOf(id));
  await next();
};

/**
 * Period key a host may score / pick a winner for: one of the board's fixed
 * periods, or (when every score wins) a score entry, "next" for a new one.
 */
function resolvePeriodKey(state: GameState, raw: unknown, allowNext: boolean): { key: string; label: string } {
  const { game } = state;
  const key = typeof raw === "string" ? raw.trim() : "";
  const fixed = fixedPeriodsOf(game).find((x) => x.key === key);
  if (fixed) return fixed;
  if (!hasScoreMoment(rulesOf(game.format))) fail(400, "Unknown period for this board");
  const max = state.scores.reduce((m, s) => Math.max(m, everyScoreIndex(s.periodKey) ?? 0), 0);
  const n = allowNext && (key === "" || key === "next") ? max + 1 : everyScoreIndex(key);
  if (n === null || n > max + 1) fail(400, "Unknown score entry");
  const existing = state.scores.find((s) => s.periodKey === `s${n}`);
  return { key: `s${n}`, label: existing?.label || everyScorePeriod(n).label };
}

// ---- API ----

const api = new Hono<AppEnv>();
api.use("*", cors({ origin: "*", maxAge: 86400 }));

api.get("/health", (c) => c.json({ ok: true }));

// Not cached: a switch to live checkout (or a new price) has to reach every
// client at once, or old pages would keep using test checkout or the old price.
api.get("/config", (c) =>
  c.json({ payments: getPaymentConfig(c.env), vapidPublicKey: c.env.VAPID_PUBLIC_KEY ?? null }, 200, {
    "cache-control": "no-store",
  }),
);

// Routers owned by the scores, payments and push modules.
api.route("/", scheduleRoutes);
api.route("/", paymentsRoutes);
api.route("/", pushRoutes);

api.post("/games", requireClient, async (c) => {
  const clientId = c.get("clientId");
  const me = c.get("playerId");
  const body = await readJson(c);
  const now = Date.now();

  const name = cleanText(body.name, 60);
  if (!name) fail(400, "Give your board a name");
  // Every player sees the name, and it's the title of every push for the board.
  if (mentionsMoney(name)) fail(400, MONEY_ERRORS.name);
  const formatProblem = formatError(body.format);
  if (formatProblem) fail(400, formatProblem);
  const requested = sanitizeFormat(body.format);
  const teamX = cleanTeam(body.teamX);
  const teamY = cleanTeam(body.teamY);
  if (!teamX || !teamY) fail(400, "Pick both teams");
  if ([teamX, teamY].some((t) => mentionsMoney(t.name) || mentionsMoney(t.abbr ?? ""))) fail(400, MONEY_ERRORS.team);
  const linkedEvent = body.linkedEvent == null ? null : cleanLinkedEvent(body.linkedEvent, now);
  if (body.linkedEvent != null && !linkedEvent) fail(400, "That game can't be linked");
  let league: League = LEAGUES.includes(body.league as League) ? (body.league as League) : "custom";
  if (linkedEvent) league = linkedEvent.league;
  // A custom board's kickoff is the host's (optional); a linked board's is its event's.
  const startsAt = linkedEvent ? linkedEvent.startsAt : cleanKickoff(body.startsAt, now);
  const sport: Sport = SPORTS.includes(body.sport as Sport) ? (body.sport as Sport) : "football";
  const maxPerPlayer = body.maxPerPlayer == null ? 0 : intIn(body.maxPerPlayer, 0, totalSquares(requested.boardSize));
  if (maxPerPlayer === null) fail(400, "Squares per player must be a whole number");
  const host = cleanProfile(body.host);
  if (!host.name) fail(400, "Add your name so friends know it's your board");
  // New boards keep every note inside their rules; an older client's notes are folded in.
  const legacy = cleanPrizes(requested, body.prizes);
  const format = requested.rules ? withRules({ ...requested, rules: foldNotes(requested.rules, legacy) }) : withRules(requested, legacy);
  // Counted only once the request is valid, so fixing a typo doesn't use up a try.
  const limited = await deviceLimited(c, RATE_LIMITS.createGame, RATE_LIMITS.createGameIp);
  if (limited) return limited;

  const adminToken = makeToken();
  for (let attempt = 0; attempt < 4; attempt++) {
    const game: Game = {
      id: makeId(),
      name,
      sport,
      league,
      teamX,
      teamY,
      format,
      periods: periodsOf(format),
      prizes: {},
      maxPerPlayer,
      numbers: null,
      // Open right away: setting up, inviting and picking squares are free; the host fee is due at the draw.
      status: "open",
      linkedEvent,
      startsAt,
      hostPlayerId: me,
      createdAt: now,
      lockedAt: null,
      paid: false,
    };
    try {
      const created = newActivity("created", me, {}, now);
      await c.env.DB.batch(db.insertGame(c.env.DB, game, clientId, adminToken, { ...host, joinedAt: now }, created));
    } catch (err) {
      if (String(err).includes("UNIQUE") && attempt < 3) continue; // id collision: roll again
      throw err;
    }
    const res: CreateGameResponse = { game, adminToken, paymentRequired: false };
    return c.json(res, 201);
  }
  throw new Error("unreachable");
});

api.get("/games/:id", async (c) => {
  const state = await stateOr404(c, gameIdParam(c));
  return c.json(state, 200, { "cache-control": "no-store" });
});

/**
 * 200 when x-admin-token is this board's host token. A device checks a host
 * link's token here before trusting it (anyone with the invite can craft one).
 */
api.get("/games/:id/host-check", requireClient, async (c) => {
  const adminToken = await db.getAdminToken(c.env.DB, gameIdParam(c));
  if (adminToken === null) fail(404, "Game not found");
  if (!tokenMatches(adminToken, c.req.header("x-admin-token") ?? "")) fail(403, "Only the host can do that");
  return c.json({ ok: true }, 200, { "cache-control": "no-store" });
});

api.patch("/games/:id", requireClient, async (c) => {
  const id = gameIdParam(c);
  const state = await hostState(c, id);
  const body = await readJson(c);
  const { game } = state;
  const fields: db.GameFieldUpdate = {};
  if (body.name !== undefined) {
    fields.name = cleanText(body.name, 60);
    if (!fields.name) fail(400, "Board name can't be empty");
    if (mentionsMoney(fields.name)) fail(400, MONEY_ERRORS.name);
  }
  let rulesActivity: Activity | null = null;
  if (body.format !== undefined) {
    // The whole rules + prizes, as the host's editor has them (see rulesEditProblem for what's locked when).
    const problem = formatError(body.format);
    if (problem) fail(400, problem);
    const next = withRules(sanitizeFormat(body.format));
    const locked = rulesEditProblem(state, next);
    if (locked) fail(409, locked);
    const scoring = rulesShape(rulesOf(next)) !== rulesShape(rulesOf(game.format)) || next.freshNumbers !== game.format.freshNumbers;
    fields.format = next;
    fields.periods = periodsOf(next);
    // Notes now live in the rules (an older board's are in the editor's rules already).
    fields.prizes = {};
    rulesActivity = newActivity("rules", c.get("playerId"), { scoring });
  } else if (body.prizes !== undefined) {
    if (game.format.rules?.length) {
      // An older client editing notes on a board that has rules: they land in the rules.
      const notes = legacyNotes(game.format, body.prizes);
      fields.format = { ...game.format, rules: foldNotes(game.format.rules, notes) };
    } else {
      fields.prizes = cleanPrizes(game.format, body.prizes);
    }
  }
  if (body.startsAt !== undefined) {
    // Display only, so it can change any time; a linked board's comes from its schedule.
    if (game.linkedEvent) fail(400, KICKOFF_ERRORS.linked);
    fields.startsAt = cleanKickoff(body.startsAt, Date.now());
  }
  if (body.maxPerPlayer !== undefined) {
    if (game.status !== "draft" && game.status !== "open") fail(409, "Squares are already locked");
    const max = intIn(body.maxPerPlayer, 0, totalSquares(game.format.boardSize));
    if (max === null) fail(400, "Squares per player must be a whole number");
    fields.maxPerPlayer = max;
  }
  const stmt = db.updateGameFields(c.env.DB, id, fields);
  if (!stmt) fail(400, "Nothing to update");
  const writes = [stmt];
  // Shows in the feed; never pushed.
  if (rulesActivity) writes.push(db.insertActivity(c.env.DB, id, rulesActivity));
  const { state: next } = await commitOr404(c, id, writes);
  publish(c, next, rulesActivity ? [rulesActivity.id] : []);
  return c.json({ state: next });
});

api.delete("/games/:id", requireClient, async (c) => {
  const id = gameIdParam(c);
  await hostState(c, id);
  await db.deleteGame(c.env.DB, id);
  // Open boards get { type: "deleted" } and a 4404 close.
  defer(c, closeRoom(c.env, id));
  return c.json({ ok: true });
});

api.post("/games/:id/join", requireClient, async (c) => {
  const id = gameIdParam(c);
  const clientId = c.get("clientId");
  const me = c.get("playerId");
  const state = await stateOr404(c, id);
  const isHostDevice = me === state.game.hostPlayerId;
  if (state.game.status === "draft" && !isHostDevice) fail(409, "This board isn't open yet");
  const profile = cleanProfile(await readJson(c));
  if (!profile.name) fail(400, "Pick a name");
  const isNew = !state.players.some((p) => p.id === me);
  if (isNew && state.players.length >= MAX_PLAYERS) fail(409, BOARD_FULL);
  // Counted once the request is valid. A clientId is free to mint, so new
  // players are also counted per board.
  const [limited, boardLimited] = await Promise.all([
    deviceLimited(c, RATE_LIMITS.join, RATE_LIMITS.joinIp),
    isNew ? rateLimited(c, RATE_LIMITS.joinBoard, id) : null,
  ]);
  const blocked = limited ?? boardLimited;
  if (blocked) return blocked;
  const now = Date.now();
  const writes = [db.upsertPlayer(c.env.DB, id, { clientId, ...profile, joinedAt: now }, MAX_PLAYERS)];
  const joined = isNew ? newActivity("joined", me, { name: profile.name }, now) : null;
  // Recorded only if the player went in (a racing join may have taken the last spot).
  if (joined) writes.push(db.insertActivityIfChanged(c.env.DB, id, joined));
  const { state: next } = await commitOr404(c, id, writes, now);
  if (!next.players.some((p) => p.id === me)) fail(409, BOARD_FULL);
  const notify: NotifyEvent[] = isNew && !isHostDevice ? [{ kind: "player-joined", name: profile.name, actor: me }] : [];
  publish(c, next, joined ? [joined.id] : [], notify);
  return c.json({ state: next });
});

/**
 * Host removes a player while squares are still being picked, freeing every
 * square they hold (e.g. someone who grabbed the whole board, or names nobody
 * knows). They can join again; the cap and the join limits bound a flood.
 */
api.delete("/games/:id/players/:playerId", requireClient, async (c) => {
  const id = gameIdParam(c);
  const state = await hostState(c, id);
  if (state.game.status !== "draft" && state.game.status !== "open") fail(409, "Squares are locked");
  const playerId = c.req.param("playerId");
  if (playerId === state.game.hostPlayerId) fail(400, "You can't remove yourself from your own board");
  const writes = state.players.some((p) => p.id === playerId) ? await db.removePlayer(c.env.DB, id, playerId) : null;
  if (!writes) fail(404, "That player isn't on this board");
  const { state: next } = await commitOr404(c, id, writes);
  publish(c, next);
  return c.json({ state: next });
});

function requireOpen(state: GameState): void {
  if (state.game.status === "draft") fail(409, "This board isn't open yet");
  if (state.game.status !== "open") fail(409, "Squares are locked");
}

api.post("/games/:id/claim", requireClient, async (c) => {
  const id = gameIdParam(c);
  const clientId = c.get("clientId");
  const me = c.get("playerId");
  const [limited, state] = await Promise.all([deviceLimited(c, RATE_LIMITS.squares, RATE_LIMITS.squaresIp), stateOr404(c, id)]);
  if (limited) return limited;
  const { game } = state;
  requireOpen(state);
  if (!state.players.some((p) => p.id === me)) fail(403, "Join the board first");
  const cells = parseCells((await readJson(c)).cells, game);
  if (!cells) fail(400, "Pick squares on this board");

  const taken = new Set(state.squares.map((s) => `${s.row},${s.col}`));
  let wanted = cells.filter((x) => !taken.has(`${x.row},${x.col}`));
  if (game.maxPerPlayer > 0) {
    const mine = state.squares.filter((s) => s.playerId === me).length;
    const room = game.maxPerPlayer - mine;
    if (room <= 0) fail(409, `You can have up to ${game.maxPerPlayer} squares on this board`);
    wanted = wanted.slice(0, room);
  }
  const requested = cells.length;
  if (wanted.length === 0) return c.json({ claimed: 0, skipped: requested, state });

  const now = Date.now();
  const activityId = db.newActivityId();
  const { results, state: next } = await commitOr404(
    c,
    id,
    [
      ...db.claimSquares(c.env.DB, id, clientId, wanted, now),
      db.claimActivity(c.env.DB, id, activityId, { clientId, playerId: me }, now),
      // Only the claim that first fills the board stamps it (once per board).
      db.markBoardFull(c.env.DB, id, totalSquares(game.format.boardSize), now),
    ],
    now,
  );
  const claimed = results.slice(0, wanted.length).reduce((n, r) => n + (r.meta.changes ?? 0), 0);
  if (claimed > 0) {
    const firstFull = (results[wanted.length + 1].meta.changes ?? 0) > 0;
    // The host hears about it once, unless the host just claimed the last square.
    publish(c, next, [activityId], firstFull ? [{ kind: "board-full", actor: me }] : []);
  }
  return c.json({ claimed, skipped: requested - claimed, state: next });
});

api.post("/games/:id/release", requireClient, async (c) => {
  const id = gameIdParam(c);
  const clientId = c.get("clientId");
  const me = c.get("playerId");
  const [limited, state] = await Promise.all([deviceLimited(c, RATE_LIMITS.squares, RATE_LIMITS.squaresIp), stateOr404(c, id)]);
  if (limited) return limited;
  requireOpen(state);
  const cells = parseCells((await readJson(c)).cells, state.game);
  if (!cells) fail(400, "Pick squares on this board");
  const mine = new Set(state.squares.filter((s) => s.playerId === me).map((s) => `${s.row},${s.col}`));
  const own = cells.filter((x) => mine.has(`${x.row},${x.col}`));
  if (own.length === 0) return c.json({ state });
  const now = Date.now();
  const released = newActivity("released", me, { count: own.length, cells: own }, now);
  const { state: next } = await commitOr404(
    c,
    id,
    [...db.releaseSquares(c.env.DB, id, clientId, own), db.insertActivity(c.env.DB, id, released)],
    now,
  );
  publish(c, next, [released.id]);
  return c.json({ state: next });
});

api.post("/games/:id/lock", requireClient, async (c) => {
  const id = gameIdParam(c);
  const state = await hostState(c, id);
  const { game } = state;
  if (game.status !== "open" && game.status !== "draft") fail(409, "Numbers are already drawn");
  // The host fee is due at the draw (a legacy draft hasn't paid either; paying opens it).
  if (!game.paid) return c.json({ error: DRAW_NEEDS_PAYMENT, code: PAYMENT_REQUIRED_CODE }, 402);
  const now = Date.now();
  const me = c.get("playerId");
  const locked = newActivity("locked", me, {}, now);
  const writes = [db.lockGame(c.env.DB, id, drawNumbers(game.format), now), db.insertActivityIfChanged(c.env.DB, id, locked)];
  // A linked game that ended before its host paid and drew: the room stopped
  // polling at the final whistle, so the board goes final with the draw.
  const over = !!game.linkedEvent && state.live?.state === "post" && liveLabel(state.live, game.status) === "Final";
  const final = over ? newActivity("final", null, {}, now) : null;
  if (final) writes.push(db.setFinal(c.env.DB, id), db.insertActivityIfChanged(c.env.DB, id, final));
  const { state: next } = await commitOr404(c, id, writes, now);
  const recorded = next.activity.some((a) => a.id === locked.id);
  const ended = !!final && next.activity.some((a) => a.id === final.id);
  // The host who drew the numbers isn't pushed about it; a game already over gets the wrap-up instead.
  const notifications: NotifyEvent[] = ended ? [{ kind: "final", actor: me }] : recorded ? [{ kind: "numbers-drawn", actor: me }] : [];
  publish(c, next, final ? [locked.id, final.id] : [locked.id], notifications);
  return c.json({ state: next });
});

function requireLocked(state: GameState): void {
  if (state.game.status !== "locked" && state.game.status !== "final") fail(409, "Lock the board to draw numbers first");
}

api.post("/games/:id/scores", requireClient, async (c) => {
  const id = gameIdParam(c);
  const state = await hostState(c, id);
  const { game } = state;
  requireLocked(state);
  const body = await readJson(c);
  const scoreX = intIn(body.scoreX, 0, MAX_SCORE);
  const scoreY = intIn(body.scoreY, 0, MAX_SCORE);
  if (scoreX === null || scoreY === null) fail(400, `Scores are whole numbers from 0 to ${MAX_SCORE}`);
  const period = resolvePeriodKey(state, body.periodKey, true);
  const everyScore = everyScoreIndex(period.key) !== null;
  const label = everyScore ? cleanText(body.label, 24) || period.label : period.label;
  // Shown on the board and in the winner push.
  if (mentionsMoney(label)) fail(400, MONEY_ERRORS.label);
  const now = Date.now();
  const actor = c.get("playerId");
  const changed = { periodKey: period.key, label, scoreX, scoreY };
  // Re-saving the recorded score (a double tap, a retry, a second host phone,
  // a label-only edit) isn't news: it's written, but not announced again.
  const existing = state.scores.find((s) => s.periodKey === period.key);
  const same = existing?.scoreX === scoreX && existing?.scoreY === scoreY;

  const projectedScores = [
    ...state.scores.filter((s) => s.periodKey !== period.key),
    { ...changed, source: "host" as const, updatedAt: now, ...(everyScore ? { label } : {}) },
  ];
  const { activities, notifications } = same
    ? { activities: [] as Activity[], notifications: [] as NotifyEvent[] }
    : scoreEvents({ ...state, scores: projectedScores }, [changed], "host", actor, now);
  const writes = [
    db.upsertHostScore(c.env.DB, id, { ...changed, label: everyScore ? label : null }, now),
    ...activities.map((a) => db.insertActivity(c.env.DB, id, a)),
  ];
  // Typed-in boards end when the host records the Final score.
  const final = period.key === "final" && game.status === "locked" && !game.linkedEvent ? newActivity("final", actor, {}, now) : null;
  if (final) writes.push(db.setFinal(c.env.DB, id), db.insertActivityIfChanged(c.env.DB, id, final));

  const { state: next } = await commitOr404(c, id, writes, now);
  const ids = activities.map((a) => a.id);
  if (final && next.activity.some((a) => a.id === final.id)) {
    ids.push(final.id);
    notifications.push({ kind: "final", actor });
  }
  publish(c, next, ids, notifications);
  return c.json({ state: next });
});

api.delete("/games/:id/scores/:periodKey", requireClient, async (c) => {
  const id = gameIdParam(c);
  const state = await hostState(c, id);
  const periodKey = c.req.param("periodKey");
  if (!state.scores.some((s) => s.periodKey === periodKey)) fail(404, "No score for that period");
  const writes = [db.deleteScore(c.env.DB, id, periodKey)];
  // An every-score entry goes with its host pick: the next entry reuses the
  // index, and it must be decided by its own score, not the removed one's pick.
  if (everyScoreIndex(periodKey) !== null) writes.push(db.deleteManualWinner(c.env.DB, id, periodKey));
  // Removing the Final score of a typed-in board reopens scoring.
  if (periodKey === "final" && state.game.status === "final" && !state.game.linkedEvent) {
    writes.push(db.reopenFinal(c.env.DB, id));
  }
  const { state: next } = await commitOr404(c, id, writes);
  publish(c, next);
  return c.json({ state: next });
});

api.post("/games/:id/winners", requireClient, async (c) => {
  const id = gameIdParam(c);
  const state = await hostState(c, id);
  requireLocked(state);
  const body = await readJson(c);
  const period = resolvePeriodKey(state, body.periodKey, false);
  const row = typeof body.row === "number" ? body.row : NaN;
  const col = typeof body.col === "number" ? body.col : NaN;
  if (!isValidCell(state.game.format.boardSize, row, col)) fail(400, "Pick a square on this board");
  const now = Date.now();
  const manualWinners = [
    ...state.manualWinners.filter((m) => m.periodKey !== period.key),
    { periodKey: period.key, row, col, updatedAt: now },
  ];
  const result = resolveResults({ ...state, manualWinners }).find((r) => r.periodKey === period.key);
  // The pick replaces the square, or the reverse square on a moment where only the reverse wins.
  const picked = result ? primaryAward(result).playerId : null;
  const playerIds = picked ? [picked] : [];
  const winner = newActivity(
    "winner",
    c.get("playerId"),
    { periodKey: period.key, label: period.label, playerIds, cell: { row, col }, manual: true, prize: result ? resultNote(result) : null },
    now,
  );
  const { state: next } = await commitOr404(
    c,
    id,
    [db.upsertManualWinner(c.env.DB, id, { periodKey: period.key, row, col }, now), db.insertActivity(c.env.DB, id, winner)],
    now,
  );
  publish(
    c,
    next,
    [winner.id],
    playerIds.length > 0 ? [{ kind: "winner", periodKey: period.key, label: period.label, playerIds }] : [],
  );
  return c.json({ state: next });
});

api.delete("/games/:id/winners/:periodKey", requireClient, async (c) => {
  const id = gameIdParam(c);
  const state = await hostState(c, id);
  const periodKey = c.req.param("periodKey");
  if (!state.manualWinners.some((m) => m.periodKey === periodKey)) fail(404, "No host pick for that period");
  const { state: next } = await commitOr404(c, id, [db.deleteManualWinner(c.env.DB, id, periodKey)]);
  publish(c, next);
  return c.json({ state: next });
});

api.post("/games/:id/final", requireClient, async (c) => {
  const id = gameIdParam(c);
  const state = await hostState(c, id);
  if (state.game.status === "final") return c.json({ state });
  requireLocked(state);
  const now = Date.now();
  const me = c.get("playerId");
  const final = newActivity("final", me, {}, now);
  const { state: next } = await commitOr404(
    c,
    id,
    [db.setFinal(c.env.DB, id), db.insertActivityIfChanged(c.env.DB, id, final)],
    now,
  );
  const recorded = next.activity.some((a) => a.id === final.id);
  // The host who ended the game isn't pushed about it.
  publish(c, next, [final.id], recorded ? [{ kind: "final", actor: me }] : []);
  return c.json({ state: next });
});

api.get("/games/:id/live", async (c) => {
  const id = gameIdParam(c);
  if (c.req.header("upgrade")?.toLowerCase() !== "websocket") {
    return c.json({ error: "Expected a WebSocket upgrade" }, 426);
  }
  // ?player=<public player id> only de-duplicates the watcher count; ?watch=0
  // makes the socket passive (gets everything, isn't counted as watching).
  // Nothing else from the query is forwarded (a stray ?clientId= is ignored).
  const query = new URL(c.req.url).searchParams;
  const player = query.get("player");
  const target = new URL("https://room/live");
  if (isPlayerId(player)) target.searchParams.set("player", player);
  if (query.get("watch") === "0") target.searchParams.set("watch", "0");
  const headers = new Headers(c.req.raw.headers);
  headers.set("x-game-id", id);
  return roomStub(c.env, id).fetch(target.toString(), { headers });
});

/**
 * `?seen=<id>,<id>`: boards this device opened without joining (most recent
 * first). Anything that isn't a board id is ignored, duplicates count once,
 * and only the first SEEN_MAX are kept.
 */
function parseSeen(raw: string | undefined): string[] {
  if (!raw) return [];
  const ids = new Set<string>();
  for (const part of raw.split(",", SEEN_MAX * 4)) {
    const id = part.trim().toLowerCase();
    if (GAME_ID_RE.test(id)) ids.add(id);
    if (ids.size >= SEEN_MAX) break;
  }
  return [...ids];
}

api.get("/me/games", requireClient, async (c) => {
  const games = await db.listGamesForClient(c.env.DB, c.get("clientId"), parseSeen(c.req.query("seen")));
  return c.json({ games }, 200, { "cache-control": "no-store" });
});

// Unknown API routes 404 as JSON rather than falling through to the SPA.
api.all("*", (c) => c.json({ error: "Not found" }, 404));

// ---- App ----

const app = new Hono<AppEnv>();

app.onError((err, c) => {
  if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
  console.error(err);
  return c.json({ error: "Something went wrong" }, 500);
});

app.route("/api", api);

app.get("/.well-known/apple-app-site-association", (c) => {
  const env = c.env;
  const appId = `${env.APPLE_TEAM_ID ?? "TEAMID"}.${env.APPLE_BUNDLE_ID ?? DEFAULT_BUNDLE_ID}`;
  return c.json(
    {
      applinks: {
        apps: [],
        details: [
          {
            // `appIDs` + `components` for iOS 13+; `appID` + `paths` for older devices.
            appIDs: [appId],
            components: [{ "/": "/g/*", comment: "Board invite links" }],
            appID: appId,
            paths: ["/g/*"],
          },
        ],
      },
    },
    200,
    { "cache-control": "public, max-age=3600" },
  );
});

app.get("/.well-known/assetlinks.json", (c) => {
  const env = c.env;
  const fingerprints = (env.ANDROID_SHA256_CERT_FINGERPRINTS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return c.json(
    [
      {
        relation: ["delegate_permission/common.handle_all_urls"],
        target: {
          namespace: "android_app",
          package_name: env.ANDROID_PACKAGE ?? DEFAULT_BUNDLE_ID,
          sha256_cert_fingerprints: fingerprints,
        },
      },
    ],
    200,
    { "cache-control": "public, max-age=3600" },
  );
});

async function invitePage(c: Ctx): Promise<Response> {
  const id = c.req.param("id") ?? "";
  // Board codes are lowercase; someone typing the code in capitals still lands on the board.
  const lower = id.toLowerCase();
  if (lower !== id && GAME_ID_RE.test(lower)) {
    const url = new URL(c.req.url);
    url.pathname = url.pathname.replace(`/g/${id}`, `/g/${lower}`);
    return c.redirect(url.toString(), 301);
  }
  const indexReq = new Request(new URL("/", c.req.url), { headers: { accept: "text/html" } });
  const [html, state] = await Promise.all([
    c.env.ASSETS.fetch(indexReq),
    GAME_ID_RE.test(id) ? loadState(c.env, id).catch(() => null) : Promise.resolve(null),
  ]);
  if (!state || !html.ok) return html;
  // The board's public state rides along, so the page renders it without a second round trip.
  return withInviteMeta(html, inviteMeta(state, new URL(c.req.url).origin), state);
}

app.get("/g/:id", invitePage);
app.get("/g/:id/*", invitePage);

// Everything else is the React SPA; `not_found_handling: single-page-application`
// serves index.html for deep links so client-side routing works on refresh.
app.all("*", (c) => c.env.ASSETS.fetch(c.req.raw));

// ---- Cron (every minute) ----
// Wakes the GameRoom of linked games about to kick off or in progress so live
// polling starts on time, and reminds hosts of linked boards kicking off
// within the hour whose host fee is unpaid (they don't draw on their own);
// once an hour also runs housekeeping (old activity, expired rate-limit
// windows, boards left from the pay-to-open flow; see worker/housekeeping.ts).

async function wakeLinkedGames(env: Env, now: number): Promise<void> {
  const ids = await db.gamesToWake(env.DB, now, POLL_LEAD_MS);
  const results = await Promise.allSettled(
    ids.map((id) => roomStub(env, id).fetch("https://room/wake", { method: "POST", headers: { "x-game-id": id } })),
  );
  for (const r of results) if (r.status === "rejected") console.error("wake failed", r.reason);
}

/**
 * "Kickoff soon, draw the numbers" to the host of each linked board kicking
 * off within the hour with its host fee unpaid. Once per board (claimed in SQL).
 */
async function remindUnpaidHosts(env: Env, now: number): Promise<void> {
  const ids = await db.claimDrawReminders(env.DB, now, DRAW_REMINDER_LEAD_MS, DRAW_REMINDER_MIN_AGE_MS);
  await Promise.all(ids.map((id) => notifyAll(env, id, [{ kind: "draw-reminder" }])));
}

/** Hourly cleanup; a leftover draft it opens gets its new state pushed like any change. */
async function housekeep(env: Env, now: number): Promise<void> {
  const { opened } = await housekeeping(env, now);
  await Promise.all(opened.map((id) => broadcast(env, id)));
}

async function scheduled(controller: ScheduledController, env: Env): Promise<void> {
  const now = Date.now();
  const jobs = [wakeLinkedGames(env, now), remindUnpaidHosts(env, now)];
  if (isHousekeepingTick(controller.scheduledTime || now)) jobs.push(housekeep(env, now));
  const results = await Promise.allSettled(jobs);
  for (const r of results) if (r.status === "rejected") console.error("cron job failed", r.reason);
}

export default { fetch: app.fetch, scheduled } satisfies ExportedHandler<Env>;
