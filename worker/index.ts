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
import { COHOST_INVITE_TTL_MS, COHOST_PARAM, cohostLimitOf, hasCohostRoom, isCohostOf, isCohostToken, type HostRole } from "../shared/cohosts";
import { FREE_PLAYER_LIMIT, isFreeDraw } from "../shared/hostFee";
import { SEASON_ERRORS, isSeasonBoard, isSeasonGame, seasonGameName, seasonNumbers } from "../shared/season";
import { KICKOFF_ERRORS, kickoffProblem } from "../shared/kickoff";
import { isClientId, isPlayerId } from "../shared/playerId";
import { siblingProblem } from "../shared/siblings";
import { boardSportFor, freshNumbersInfo, isLeague, isLinkedLeague, leagueSportProblem, rulesProblemFor } from "../shared/sports";
import { MAX_PLAYERS, drawNumbers, fixedPeriodsOf, isValidCell, liveLabel, primaryAward, resolveResults, resultNote, totalSquares } from "../shared/squares";
import { PAYMENT_REQUIRED_CODE } from "../shared/types";
import type {
  Activity,
  CohostInviteResponse,
  CreateGameResponse,
  Game,
  GameFormat,
  GameState,
  League,
  LinkedEvent,
  Period,
  Sport,
} from "../shared/types";
import { authConfig, authRoutes, canonicalClientId, SIGNED_IN_HEADER, signedInHint } from "./auth";
import { cleanColor, cleanTeam, cleanText } from "./clean";
import { clubRoutes, csvFilename, playersCsv } from "./clubs";
import * as db from "./db";
import { emailEnabled, emailRoutes } from "./email";
import type { Env } from "./env";
import { housekeeping, isHousekeepingTick } from "./housekeeping";
import { makeId } from "./ids";
import { boardPageOf, inviteMeta, withInviteMeta } from "./og";
import { activePass, getPaymentConfig, holdersOfActivePass, paymentsRoutes } from "./payments";
import { playerIdOf } from "./playerIds";
import { pushRoutes, type NotifyEvent } from "./push";
import { RATE_LIMITS, addressSubject, checkRate, type RateRule } from "./rateLimit";
import { POLL_LEAD_MS } from "./room";
import { scheduleRoutes } from "./scores";
import { hasGamesAhead, parseSeasonInput, seasonSchedule, syncSeasonGames, syncSeasons, type SeasonSchedule } from "./season";
import {
  broadcast,
  closeRoom,
  loadState,
  newActivity,
  notifyAll,
  pushToRoom,
  roomStub,
  scoreEvents,
  tokenMatches,
  touchSeason,
} from "./service";

export { GameRoom } from "./room";
export { ScoreHub } from "./scores/hub";

/**
 * `clientId`: the device's secret (x-client-id), used only for D1 lookups; for
 * a device signed in to an account, the account's canonical clientId
 * (worker/auth/canonical.ts), so every route works on the account.
 * `playerId`: its public id, used for everything a client can see (activity
 * actors, ownership checks against GameState, notify actors, rate-limit keys).
 */
type AppEnv = { Bindings: Env; Variables: { clientId: string; playerId: string } };
type Ctx = Context<AppEnv>;

const GAME_ID_RE = /^[a-z0-9]{4,16}$/;
/** Most boards a device may ask about with `GET /api/me/games?seen=` (it keeps about this many). */
const SEEN_MAX = 50;
const MAX_BODY_BYTES = 32 * 1024;
const MAX_SCORE = 999;
const DEFAULT_COLOR = "#38bdf8";
const DEFAULT_BUNDLE_ID = "com.jaxsquares.app";
const BOARD_FULL = "This board has all the players it can take. Ask the host to make room.";
/** POST /lock on a board whose host fee isn't paid yet (402, with PAYMENT_REQUIRED_CODE). */
const DRAW_NEEDS_PAYMENT = "Draw the numbers once the board's paid for.";/** How long before a linked board's kickoff its host hears "draw the numbers" while the fee is unpaid. */
const DRAW_REMINDER_LEAD_MS = 60 * 60_000;
/** A board made this recently isn't reminded: its host is setting it up right now. */
const DRAW_REMINDER_MIN_AGE_MS = 15 * 60_000;

// ---- small validation helpers ----

function makeToken(): string {
  return crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
}


const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

/** One emoji (a single grapheme that is pictographic or a flag), else "". */
function cleanEmoji(v: unknown): string {
  if (typeof v !== "string") return "";
  const first = segmenter.segment(v.trim())[Symbol.iterator]().next().value?.segment ?? "";
  return first.length <= 16 && /\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(first) ? first : "";
}


function cleanLinkedEvent(v: unknown, now: number): LinkedEvent | null {
  if (!v || typeof v !== "object") return null;
  const e = v as Record<string, unknown>;
  if (e.provider !== "espn" || !isLinkedLeague(e.league)) return null;
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

function fail(status: 400 | 403 | 404 | 409 | 410, message: string): never {
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
    return `${freshNumbersInfo(game).label} locks once the numbers are drawn. You can still change amounts and notes.`;
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
  // A season's game board: its season board's schedule and standings follow it.
  if (state.game.seasonId) defer(c, touchSeason(c.env, state.game.seasonId));
}

/** 409 on a season's game board: its players, squares, rules and co-hosts belong to its season board. */
function notOnSeasonGame(game: Game, message: string): void {
  if (isSeasonGame(game)) fail(409, message);
}

async function stateOr404(c: Ctx, id: string): Promise<GameState> {
  const state = await loadState(c.env, id);
  if (!state) fail(404, "Game not found");
  return state;
}

/**
 * Loads state and checks x-admin-token in the same round trip. The caller
 * runs the board as its host (the admin token: the host's devices and host
 * links) or as a co-host: the request's canonical clientId (c.get("clientId"),
 * the account's when signed in) is one of the board's co-hosts. A co-host
 * never needs (or gets) the token. 403 for anyone else.
 */
async function hostAccess(c: Ctx, id: string): Promise<{ state: GameState; role: HostRole }> {
  const found = await db.getGameStateWithToken(c.env.DB, id, c.get("clientId"));
  if (!found) fail(404, "Game not found");
  const { state, adminToken, cohost } = found;
  if (tokenMatches(adminToken, c.req.header("x-admin-token") ?? "")) return { state, role: "host" };
  if (cohost) return { state, role: "cohost" };
  fail(403, "Only the host can do that");
}

/** A host action a co-host can do too (everything but the host-only ones below). */
async function hostState(c: Ctx, id: string): Promise<GameState> {
  return (await hostAccess(c, id)).state;
}

/** A host-only action: co-hosts get a 403 with `message`. */
async function hostOnlyState(c: Ctx, id: string, message: string): Promise<GameState> {
  const { state, role } = await hostAccess(c, id);
  if (role !== "host") fail(403, message);
  return state;
}

async function commitOr404(c: Ctx, id: string, writes: D1PreparedStatement[], now?: number) {
  const out = await db.commit(c.env.DB, id, writes, now);
  const { results, state } = out;
  if (!state) fail(404, "Game not found");
  return { results, state };
}

/**
 * "Add another board for this game": the board a new one is made from, once
 * the caller is shown to run it (its admin token, the identity that hosts it,
 * or one of its co-hosts by the request's canonical clientId) and its game can
 * still take a board (siblingProblem: not started, not over, its group not
 * full). The caller hosts the new board, and pays its host fee at its draw.
 */
async function groupSourceFor(c: Ctx, raw: unknown, now: number): Promise<db.GroupSource> {
  const id = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (!GAME_ID_RE.test(id)) fail(400, "That board can't be found");
  const source = await db.groupSourceOf(c.env.DB, id);
  if (!source) fail(404, "Game not found");
  const clientId = c.get("clientId");
  const runsIt =
    tokenMatches(source.adminToken, c.req.header("x-admin-token") ?? "") ||
    source.hostClientId === clientId ||
    (await db.isCohost(c.env.DB, id, clientId));
  if (!runsIt) fail(403, "Only the host can do that");
  const { game } = source;
  if (isSeasonBoard(game) || isSeasonGame(game)) fail(409, SEASON_ERRORS.sibling);
  const problem = siblingProblem(
    { status: game.status, linkedEvent: game.linkedEvent, scored: source.scored, live: source.live, groupSize: source.groupSize },
    now,
  );
  if (problem) fail(409, problem);
  return source;
}

/** A board joined a game's group: every other board in it lists the new one now (their open boards get the state). */
async function announceSibling(env: Env, sourceId: string, newId: string): Promise<void> {
  const state = await broadcast(env, sourceId);
  await Promise.all((state?.siblings ?? []).filter((s) => s.id !== newId).map((s) => broadcast(env, s.id)));
}

const requireClient: MiddlewareHandler<AppEnv> = async (c, next) => {
  const id = c.req.header("x-client-id") ?? "";
  if (!isClientId(id)) return c.json({ error: "Missing or invalid x-client-id" }, 401);
  // A signed-in device acts as its account's canonical clientId (one cached D1 read; docs/auth.md).
  const clientId = await canonicalClientId(c.env.DB, id, { signedIn: signedInHint(c.req.header(SIGNED_IN_HEADER)) });
  c.set("clientId", clientId);
  c.set("playerId", await playerIdOf(clientId));
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
  c.json(
    { payments: getPaymentConfig(c.env), vapidPublicKey: c.env.VAPID_PUBLIC_KEY ?? null, auth: authConfig(c.env), emailEnabled: emailEnabled(c.env) },
    200,
    { "cache-control": "no-store" },
  ),
);

// Routers owned by the scores, payments, push, auth, email and clubs modules.
api.route("/", scheduleRoutes);
api.route("/", paymentsRoutes);
api.route("/", pushRoutes);
api.route("/", authRoutes);
api.route("/", emailRoutes);
api.route("/", clubRoutes);

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
  // A season board (worker/season.ts): a team's season or picked games; each game gets its own board at the draw.
  const season = body.season == null ? null : parseSeasonInput(body.season, body.league, now);
  if (typeof season === "string") fail(400, season);
  if (season && body.fromGameId != null) fail(400, SEASON_ERRORS.sibling);
  // Another board for the game of one the caller hosts: the game (teams, link, kickoff) comes from that board.
  const source = body.fromGameId == null ? null : await groupSourceFor(c, body.fromGameId, now);
  const teamX = season ? season.teamX : source ? source.game.teamX : cleanTeam(body.teamX);
  const teamY = season ? season.teamY : source ? source.game.teamY : cleanTeam(body.teamY);
  if (!teamX || !teamY) fail(400, "Pick both teams");
  if ([teamX, teamY].some((t) => mentionsMoney(t.name) || mentionsMoney(t.abbr ?? ""))) fail(400, MONEY_ERRORS.team);
  // A season board has no game of its own: its games' boards are linked, one each.
  const linkedEvent = season ? null : source ? source.game.linkedEvent : body.linkedEvent == null ? null : cleanLinkedEvent(body.linkedEvent, now);
  if (!source && !season && body.linkedEvent != null && !linkedEvent) fail(400, "That game can't be linked");
  let league: League = season ? season.league : source ? source.game.league : isLeague(body.league) ? body.league : "custom";
  if (linkedEvent) league = linkedEvent.league;
  // A custom board's kickoff is the host's (optional); a linked board's is its event's; a season board's, its first game's.
  const startsAt = season ? season.firstKickoff : linkedEvent ? linkedEvent.startsAt : source ? (source.game.startsAt ?? null) : cleanKickoff(body.startsAt, now);
  // A league plays one sport (NBA: basketball); a custom board is football or basketball.
  const sportProblem = source ? null : leagueSportProblem(body.sport, league);
  if (sportProblem) fail(400, sportProblem);
  const sport: Sport = source ? source.game.sport : boardSportFor(body.sport, league);
  const maxPerPlayer = body.maxPerPlayer == null ? 0 : intIn(body.maxPerPlayer, 0, totalSquares(requested.boardSize));
  if (maxPerPlayer === null) fail(400, "Squares per player must be a whole number");
  const host = cleanProfile(body.host);
  if (!host.name) fail(400, "Add your name so friends know it's your board");
  // New boards keep every note inside their rules; an older client's notes are folded in.
  const legacy = cleanPrizes(requested, body.prizes);
  const format = requested.rules ? withRules({ ...requested, rules: foldNotes(requested.rules, legacy) }) : withRules(requested, legacy);
  // Every score isn't offered for basketball, and a game of halves has no Q1 or Q3.
  const unfit = rulesProblemFor(rulesOf(format), { sport, league });
  if (unfit) fail(400, unfit);
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
      ...(season ? { kind: "season" as const } : {}),
    };
    try {
      const created = newActivity("created", me, {}, now);
      const writes = db.insertGame(c.env.DB, game, clientId, adminToken, { ...host, joinedAt: now }, created);
      if (season) writes.push(db.markSeasonStatement(c.env.DB, game.id, season.stored));
      // In its source board's group (the source's own id when it had none). Unpaid like any new board.
      if (source) writes.push(...db.joinGroupStatements(c.env.DB, game.id, source.game.id, source.group ?? source.game.id, now));
      await c.env.DB.batch(writes);
    } catch (err) {
      if (String(err).includes("UNIQUE") && attempt < 3) continue; // id collision: roll again
      throw err;
    }
    if (source) defer(c, announceSibling(c.env, source.game.id, game.id));
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
  // A season's game board follows its season board: its name, rules and prizes are edited there.
  notOnSeasonGame(game, SEASON_ERRORS.childEdit);
  const season = isSeasonBoard(game);
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
    // Moments the board's game doesn't have: every score on basketball, a quarter-end in a game of halves.
    const unfit = rulesProblemFor(rulesOf(next), game);
    if (unfit) fail(400, unfit);
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
    // Display only, so it can change any time; a linked board's comes from its schedule (a season board's, its games').
    if (game.linkedEvent || season) fail(400, KICKOFF_ERRORS.linked);
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
  // A season board's games follow it: new rules and prizes reach each game board
  // with no score or host pick yet (who wins locks at the first score), and a new
  // name renames them all ("Office Season · JAX @ MIA").
  const now = Date.now();
  const renamed = season && !!fields.name && fields.name !== game.name;
  const children = season && (fields.format || renamed) ? await db.seasonChildren(c.env.DB, id) : [];
  if (season && fields.format && fields.periods) writes.push(db.seasonFormatStatement(c.env.DB, id, fields.format, fields.periods, now));
  if (renamed && fields.name) {
    for (const k of children) {
      writes.push(db.renameStatement(c.env.DB, k.id, seasonGameName(fields.name, k.teamX, k.teamY, k.linkedEvent?.xIsHome ?? false), now));
    }
  }
  const { state: next } = await commitOr404(c, id, writes, now);
  publish(c, next, rulesActivity ? [rulesActivity.id] : []);
  // Their open boards take the change: the games on now or this week (a later one reads it when opened).
  const soon = now + 7 * 24 * 3_600_000;
  for (const k of children) if (k.status === "locked" && (k.linkedEvent?.startsAt ?? 0) < soon) defer(c, broadcast(c.env, k.id));
  return c.json({ state: next });
});

api.delete("/games/:id", requireClient, async (c) => {
  const id = gameIdParam(c);
  // Host only: a co-host can do everything else.
  const state = await hostOnlyState(c, id, "Only the host can delete the board");
  // A season's game board goes with its season board, never on its own.
  notOnSeasonGame(state.game, SEASON_ERRORS.childDelete);
  const children = isSeasonBoard(state.game) ? await db.seasonChildIds(c.env.DB, id) : [];
  await db.deleteGame(c.env.DB, id);
  // Open boards get { type: "deleted" } and a 4404 close (a season board's games' too).
  defer(c, closeRoom(c.env, id));
  for (const kid of children) defer(c, closeRoom(c.env, kid));
  // The other boards for its game stop listing it.
  for (const s of state.siblings ?? []) defer(c, broadcast(c.env, s.id));
  return c.json({ ok: true });
});

api.post("/games/:id/join", requireClient, async (c) => {
  const id = gameIdParam(c);
  const clientId = c.get("clientId");
  const me = c.get("playerId");
  const state = await stateOr404(c, id);
  // A season's game board takes its players from its season board.
  notOnSeasonGame(state.game, SEASON_ERRORS.childJoin);
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
  const { state, role } = await hostAccess(c, id);
  if (state.game.status !== "draft" && state.game.status !== "open") fail(409, "Squares are locked");
  const playerId = c.req.param("playerId");
  if (playerId === state.game.hostPlayerId) {
    if (role === "cohost") fail(403, "Co-hosts can't remove the host");
    fail(400, "You can't remove yourself from your own board");
  }
  // Removing a co-host from the board ends their co-hosting too: only the host can do that to another co-host.
  if (role === "cohost" && playerId !== c.get("playerId") && isCohostOf(state.game, playerId)) {
    fail(403, "Only the host can remove a co-host");
  }
  const writes = state.players.some((p) => p.id === playerId) ? await db.removePlayer(c.env.DB, id, playerId) : null;
  if (!writes) fail(404, "That player isn't on this board");
  const { state: next } = await commitOr404(c, id, writes);
  publish(c, next);
  return c.json({ state: next });
});

function requireOpen(state: GameState): void {
  // A season's game board never takes claims: its squares are the season board's.
  notOnSeasonGame(state.game, SEASON_ERRORS.childClaim);
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
  let state = await hostState(c, id);
  // A season board (worker/season.ts) draws once for the whole season: its
  // games come from the team's schedule as ESPN has it now (or the games the
  // host picked), and a season with no game left to play isn't drawn (or paid
  // for through a pass).
  let schedule: SeasonSchedule | null = null;
  let seasonMode: "same" | "fresh" = "same";
  if (isSeasonBoard(state.game) && (state.game.status === "open" || state.game.status === "draft")) {
    const row = await db.getGameRow(c.env.DB, id);
    const stored = row ? db.storedSeasonOf(row) : null;
    if (!stored) fail(404, "Game not found");
    seasonMode = stored.numbers;
    schedule = await seasonSchedule(c.env, stored);
    if (!hasGamesAhead(schedule, [], Date.now())) fail(409, SEASON_ERRORS.noGames);
  }
  // At most twice: a free draw that a 6th player's claim beat (see below) is
  // decided once more with that player counted.
  for (let attempt = 0; ; attempt++) {
    const { game } = state;
    if (game.status !== "open" && game.status !== "draft") fail(409, "Numbers are already drawn");
    const now = Date.now();
    const writes: D1PreparedStatement[] = [];
    // The host fee is due at the draw (a legacy draft hasn't paid either;
    // paying opens it). A board held by FREE_PLAYER_LIMIT or fewer players
    // draws for free: marked paid (provider "free") in the same batch as the
    // draw, the holders counted again inside it. Otherwise a Host Pass may
    // cover it: the one of whoever's drawing (this request's canonical
    // clientId: the host's identity holding the admin token, or a co-host's)
    // or the board's host's; then the board is marked paid through the pass
    // in the same write as the draw. Otherwise 402.
    const free = !game.paid && isFreeDraw(state);
    if (free) {
      writes.push(db.markFreeDraw(c.env.DB, id, FREE_PLAYER_LIMIT, now));
    } else if (!game.paid) {
      const host = await db.hostClientIdOf(c.env.DB, id);
      const pass = await activePass(c.env.DB, [c.get("clientId"), host ?? ""], now);
      if (!pass) return c.json({ error: DRAW_NEEDS_PAYMENT, code: PAYMENT_REQUIRED_CODE }, 402);
      writes.push(db.markPaid(c.env.DB, id, { provider: "pass", reference: pass.id, amountCents: 0 }, now));
    }
    const me = c.get("playerId");
    const locked = newActivity("locked", me, {}, now);
    // A season board's numbers: the one draw every game uses, or none when each game draws its own.
    const numbers = schedule ? seasonNumbers(game.format, seasonMode) : drawNumbers(game.format);
    writes.push(db.lockGame(c.env.DB, id, numbers, now), db.insertActivityIfChanged(c.env.DB, id, locked));
    // A linked game that ended before its host paid and drew: the room stopped
    // polling at the final whistle, so the board goes final with the draw.
    const over = !!game.linkedEvent && state.live?.state === "post" && liveLabel(state.live, game.status) === "Final";
    const final = over ? newActivity("final", null, {}, now) : null;
    if (final) writes.push(db.setFinal(c.env.DB, id), db.insertActivityIfChanged(c.env.DB, id, final));
    let { state: next } = await commitOr404(c, id, writes, now);
    const recorded = next.activity.some((a) => a.id === locked.id);
    // A claim committed between the read above and this batch and made the
    // board a 6th player's: the free mark counted them and changed nothing, so
    // the lock (which needs paid_at) didn't happen either. Decide again with
    // the board as this batch read it, after the free mark: more than
    // FREE_PLAYER_LIMIT hold squares there, so it's the pass or the 402.
    if (free && !recorded && attempt === 0 && (next.game.status === "open" || next.game.status === "draft") && !next.game.paid) {
      state = next;
      continue;
    }
    const ended = !!final && next.activity.some((a) => a.id === final.id);
    // A season board's draw gives every game still to come a board of its own,
    // made quietly: the season board's one "numbers drawn" below covers them all.
    if (schedule && recorded) next = (await syncSeasonGames(c.env, id, now, schedule)).state ?? next;
    // The host who drew the numbers isn't pushed about it; a game already over gets the wrap-up instead.
    const notifications: NotifyEvent[] = ended ? [{ kind: "final", actor: me }] : recorded ? [{ kind: "numbers-drawn", actor: me }] : [];
    publish(c, next, final ? [locked.id, final.id] : [locked.id], notifications);
    return c.json({ state: next });
  }
});

function requireLocked(state: GameState): void {
  if (state.game.status !== "locked" && state.game.status !== "final") fail(409, "Lock the board to draw numbers first");
}

api.post("/games/:id/scores", requireClient, async (c) => {
  const id = gameIdParam(c);
  const state = await hostState(c, id);
  if (isSeasonBoard(state.game)) fail(409, SEASON_ERRORS.seasonScores);
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
  if (isSeasonBoard(state.game)) fail(409, SEASON_ERRORS.seasonScores);
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
  // The host who ended the game isn't pushed about it. Ending a season board
  // early isn't pushed at all: each game's board says its own final.
  publish(c, next, [final.id], recorded && !isSeasonBoard(state.game) ? [{ kind: "final", actor: me }] : []);
  return c.json({ state: next });
});

// ---- Co-hosts (shared/cohosts.ts; docs/ARCHITECTURE.md "Co-hosts") ----
// The host invites up to MAX_COHOSTS players (CLUB_MAX_COHOSTS on a Club Pass
// holder's board: cohostLimitOf) with single-use links; a co-host
// runs the board with them (every route behind hostState) by their canonical
// clientId, never the admin token. Host only: inviting co-hosts, removing one,
// deleting the board; nobody removes the host.

const COHOST_LINK = {
  broken: "That co-host link isn't complete. Ask the host to send it again.",
  unknown: "This co-host link doesn't work anymore. Ask the host for a new one.",
  used: "This co-host link was already used. Ask the host for a new one.",
  expired: "This co-host link expired. Ask the host for a new one.",
  join: "Join the board first, then accept the co-host invite.",
} as const;

/** The board already has every co-host its host's plan allows. */
const cohostsFull = (game: Game) => `This board already has ${cohostLimitOf(game)} co-hosts. Ask the host to make room.`;

/** A new co-host invite token: 32 random bytes, base64url (43 characters; isCohostToken). */
function newCohostToken(): string {
  let bin = "";
  for (const b of crypto.getRandomValues(new Uint8Array(32))) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** What D1 keeps of a co-host invite token: a SHA-256 (hex), so the table can't be turned back into links. */
async function cohostTokenHash(token: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`jaxsquares:cohost:${token}`)));
  return Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Host only: a single-use co-host invite link for this board, good for COHOST_INVITE_TTL_MS. */
api.post("/games/:id/cohost-invites", requireClient, async (c) => {
  const id = gameIdParam(c);
  const state = await hostOnlyState(c, id, "Only the host can invite co-hosts");
  notOnSeasonGame(state.game, SEASON_ERRORS.childCohost);
  if (!hasCohostRoom(state.game)) fail(409, `A board can have up to ${cohostLimitOf(state.game)} co-hosts. Remove one to invite someone new.`);
  const limited = await deviceLimited(c, RATE_LIMITS.cohostInvite, RATE_LIMITS.cohostInviteIp);
  if (limited) return limited;
  const token = newCohostToken();
  const expiresAt = Date.now() + COHOST_INVITE_TTL_MS;
  await db.insertCohostInvite(c.env.DB, id, await cohostTokenHash(token), expiresAt).run();
  // The origin the app asked (the web app's own, or jaxsquares.com from the native app), like an invite link.
  const url = `${new URL(c.req.url).origin}/g/${id}?${COHOST_PARAM}=${token}`;
  const res: CohostInviteResponse = { url, expiresAt };
  return c.json(res, 201, { "cache-control": "no-store" });
});

/**
 * A player accepts a co-host invite: the link's token, used once, within its
 * week, while the board has room. Already a co-host: the state, and the link
 * stays unused.
 */
api.post("/games/:id/cohosts/accept", requireClient, async (c) => {
  const id = gameIdParam(c);
  const me = c.get("playerId");
  const { token } = await readJson(c);
  if (!isCohostToken(token)) fail(400, COHOST_LINK.broken);
  // Counted before the token is looked up, so links can't be guessed at speed.
  const limited = await deviceLimited(c, RATE_LIMITS.cohostAccept, RATE_LIMITS.cohostAcceptIp);
  if (limited) return limited;
  const state = await stateOr404(c, id);
  if (state.game.hostPlayerId === me) fail(409, "You already host this board.");
  if (isCohostOf(state.game, me)) return c.json({ state });
  const player = state.players.find((p) => p.id === me);
  if (!player) fail(403, COHOST_LINK.join);
  const tokenHash = await cohostTokenHash(token);
  const now = Date.now();
  // Why it can't be used, said plainly (the accept below re-checks all of it in SQL).
  const refusal = (invite: Awaited<ReturnType<typeof db.cohostInvite>>, board: GameState) => {
    if (!invite) fail(404, COHOST_LINK.unknown);
    if (invite.usedAt !== null) fail(410, COHOST_LINK.used);
    if (invite.expiresAt <= now) fail(410, COHOST_LINK.expired);
    if (!hasCohostRoom(board.game)) fail(409, cohostsFull(board.game));
  };
  refusal(await db.cohostInvite(c.env.DB, id, tokenHash), state);
  const added = newActivity("cohost", me, { name: player.name }, now);
  const { state: next } = await commitOr404(
    c,
    id,
    [
      ...db.acceptCohostInvite(c.env.DB, { gameId: id, tokenHash, clientId: c.get("clientId"), now, max: cohostLimitOf(state.game) }),
      db.insertActivityIfChanged(c.env.DB, id, added),
    ],
    now,
  );
  if (!isCohostOf(next.game, me)) {
    // A racing accept used the link or took the last spot, or the host removed this player meanwhile.
    refusal(await db.cohostInvite(c.env.DB, id, tokenHash), next);
    fail(409, next.players.some((p) => p.id === me) ? "Couldn't make you a co-host. Try again." : COHOST_LINK.join);
  }
  // The host hears about it (the new co-host is the actor, so not them).
  publish(c, next, [added.id], [{ kind: "cohost-accepted", name: player.name, actor: me }]);
  return c.json({ state: next });
});

/** The host removes a co-host, or a co-host steps down (their own public id). They stay on the board as a player. */
api.delete("/games/:id/cohosts/:playerId", requireClient, async (c) => {
  const id = gameIdParam(c);
  const { state, role } = await hostAccess(c, id);
  const playerId = c.req.param("playerId");
  if (role !== "host" && playerId !== c.get("playerId")) fail(403, "Only the host can remove a co-host");
  const stmt = isCohostOf(state.game, playerId) ? await db.removeCohost(c.env.DB, id, playerId) : null;
  if (!stmt) fail(404, "They're not a co-host on this board");
  const { state: next } = await commitOr404(c, id, [stmt]);
  publish(c, next);
  return c.json({ state: next });
});

/**
 * A Club Pass board's players as a CSV (worker/clubs/csv.ts), for its host
 * and co-hosts: name, how many squares, which ones, their numbers once drawn,
 * when they joined. Never a payment column, an email or a clientId. `?tz=`
 * (an IANA zone) sets the joined time's zone (UTC otherwise).
 */
api.get("/games/:id/export.csv", requireClient, async (c) => {
  const id = gameIdParam(c);
  const state = await hostState(c, id);
  if (!state.game.club) fail(403, "Downloading the players list comes with the Club Pass.");
  const limited = await deviceLimited(c, RATE_LIMITS.clubExport, RATE_LIMITS.clubExportIp);
  if (limited) return limited;
  return new Response(playersCsv(state, { timeZone: c.req.query("tz") }), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${csvFilename(state.game.name)}"`,
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
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
  // Its TV view (/g/:id/tv) and printable board (/g/:id/print) get the same, with their own preview.
  const url = new URL(c.req.url);
  return withInviteMeta(html, inviteMeta(state, url.origin, boardPageOf(url.pathname)), state);
}

app.get("/g/:id", invitePage);
app.get("/g/:id/*", invitePage);

// The big game's landing page moved from its trademarked name (scripts/seo/site.ts
// TRADEMARKED_EVENT); old links and search results land on the new page.
const OLD_BIG_GAME_PAGE = "/super-bowl-squares";
function toBigGamePage(c: Ctx): Response {
  const url = new URL(c.req.url);
  url.pathname = "/big-game-squares";
  return c.redirect(url.toString(), 301);
}
app.get(OLD_BIG_GAME_PAGE, toBigGamePage);
app.get(`${OLD_BIG_GAME_PAGE}/`, toBigGamePage);

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
 * off within the hour with its host fee unpaid. Once per board (claimed in
 * SQL). Neither a free board (FREE_PLAYER_LIMIT or fewer players hold
 * squares; left out in SQL) nor a host whose Host Pass covers the board is
 * reminded: Jax draws those at kickoff.
 */
async function remindUnpaidHosts(env: Env, now: number): Promise<void> {
  const due = await db.claimDrawReminders(env.DB, now, DRAW_REMINDER_LEAD_MS, DRAW_REMINDER_MIN_AGE_MS, FREE_PLAYER_LIMIT);
  if (due.length === 0) return;
  const covered = await holdersOfActivePass(env.DB, due.map((d) => d.hostClientId), now);
  await Promise.all(due.filter((d) => !covered.has(d.hostClientId)).map((d) => notifyAll(env, d.id, [{ kind: "draw-reminder" }])));
}

/** Hourly cleanup; a leftover draft it opens gets its new state pushed like any change. */
async function housekeep(env: Env, now: number): Promise<void> {
  const { opened } = await housekeeping(env, now);
  await Promise.all(opened.map((id) => broadcast(env, id)));
}

async function scheduled(controller: ScheduledController, env: Env): Promise<void> {
  const now = Date.now();
  // Season boards: new games (playoffs) as they're scheduled, about twice a day each (worker/season.ts).
  const jobs = [wakeLinkedGames(env, now), remindUnpaidHosts(env, now), syncSeasons(env, now)];
  if (isHousekeepingTick(controller.scheduledTime || now)) jobs.push(housekeep(env, now));
  const results = await Promise.allSettled(jobs);
  for (const r of results) if (r.status === "rejected") console.error("cron job failed", r.reason);
}

export default { fetch: app.fetch, scheduled } satisfies ExportedHandler<Env>;
