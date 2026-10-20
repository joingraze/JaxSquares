// Typed client for every Worker endpoint (docs/ARCHITECTURE.md). Every request
// carries `x-client-id`; host-only calls add `x-admin-token`, defaulting to the
// token this device saved for that game. A co-host holds no token: the same
// calls go without one and the server authorizes them by the clientId.
// Non-2xx responses throw ApiError.

import type {
  AppConfig,
  AuthProvider,
  CellsInput,
  CohostAcceptInput,
  CohostInviteResponse,
  CreateGameInput,
  CreateGameResponse,
  EmailNotices,
  EmailNoticesInput,
  GameState,
  GameSummary,
  JoinInput,
  League,
  ManualWinnerInput,
  MeResponse,
  PushRegistration,
  ScheduleResponse,
  ScoreInput,
  SeasonTeamsResponse,
  TeamScheduleResponse,
  SignInInput,
  SignOutInput,
  UpdateGameInput,
} from "../../shared/types";
import { PAYMENT_REQUIRED_CODE } from "../../shared/types";
import {
  forgetGame,
  forgetSeen,
  getAdminToken,
  getClientId,
  isSignedIn,
  linkAdminToken,
  rememberCohost,
  rememberGame,
  saveAdminToken,
  settleLinkAdminToken,
} from "./identity";

/** "" on the web (same origin); "https://jaxsquares.com" in the native app. */
export const API_BASE: string = String(import.meta.env.VITE_API_BASE ?? "").replace(/\/+$/, "");

/** Origin used in links people share (invites, host links). */
export const PUBLIC_ORIGIN: string = String(
  import.meta.env.VITE_PUBLIC_ORIGIN ?? (API_BASE || (typeof location !== "undefined" ? location.origin : "https://jaxsquares.com")),
).replace(/\/+$/, "");

export function inviteUrl(gameId: string): string {
  return `${PUBLIC_ORIGIN}/g/${encodeURIComponent(gameId)}`;
}

const DEFAULT_TIMEOUT_MS = 15_000;

export class ApiError extends Error {
  constructor(
    message: string,
    /** HTTP status; 0 when the server was never reached (offline, timeout). */
    public readonly status: number,
    public readonly body?: unknown,
    /** Seconds to wait before retrying, from Retry-After on a 429. */
    public readonly retryAfter?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }

  get isNetwork(): boolean {
    return this.status === 0;
  }

  get isNotFound(): boolean {
    return this.status === 404;
  }
}

export interface RequestOptions {
  body?: unknown;
  adminToken?: string | null;
  signal?: AbortSignal;
  timeoutMs?: number;
}

type Method = "GET" | "POST" | "PATCH" | "DELETE";

function fallbackMessage(status: number): string {
  if (status === 401 || status === 403) return "Only the host can do that.";
  if (status === 404) return "We couldn't find that board.";
  if (status === 409) return "Someone beat you to it. Try again.";
  if (status === 429) return "Slow down a sec and try again.";
  if (status >= 500) return "Our server fumbled. Try again in a moment.";
  return `Request failed (${status})`;
}

/**
 * Every request's identity headers: the device's clientId, plus `x-signed-in`
 * while it's signed in, so the server never answers from a cached "not signed
 * in" right after a sign-in (worker/auth/canonical.ts). The hint only asks for
 * a fresh lookup; it proves nothing.
 */
export function identityHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "x-client-id": getClientId() };
  if (isSignedIn()) headers["x-signed-in"] = "1";
  return headers;
}

export async function request<T>(method: Method, path: string, opts: RequestOptions = {}): Promise<T> {
  const headers = identityHeaders();
  if (opts.adminToken) headers["x-admin-token"] = opts.adminToken;
  if (opts.body !== undefined) headers["content-type"] = "application/json";

  // Our own timeout, chained to the caller's signal.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const onAbort = () => controller.abort();
  opts.signal?.addEventListener("abort", onAbort);

  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api${path}`, {
      method,
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: controller.signal,
    });
  } catch (err) {
    if (opts.signal?.aborted) throw err;
    const timedOut = controller.signal.aborted;
    throw new ApiError(
      timedOut ? "That took too long. Check your connection and try again." : "You're offline. Check your connection and try again.",
      0,
    );
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener("abort", onAbort);
  }

  const data = (await res.json().catch(() => ({}))) as unknown;
  if (!res.ok) {
    const msg = data && typeof data === "object" && typeof (data as { error?: unknown }).error === "string"
      ? (data as { error: string }).error
      : fallbackMessage(res.status);
    const retryAfter = Number(res.headers.get("retry-after")) || undefined;
    throw new ApiError(msg, res.status, data, retryAfter);
  }
  return data as T;
}

const g = (id: string, rest = "") => `/games/${encodeURIComponent(id)}${rest}`;

/** The 402 POST /lock answers while the board's host fee isn't paid: pay (the checkout sheet), then draw. */
export function isPaymentRequired(err: unknown): boolean {
  return err instanceof ApiError && err.status === 402 && (err.body as { code?: unknown } | undefined)?.code === PAYMENT_REQUIRED_CODE;
}

/**
 * Whether `token` is `gameId`'s host token (a host link's token, before a device
 * trusts it): true or false once the server has answered, null when it couldn't
 * be reached. A board that's gone counts as refused.
 */
export async function checkHostToken(gameId: string, token: string): Promise<boolean | null> {
  try {
    await request<{ ok: true }>("GET", g(gameId, "/host-check"), { adminToken: token });
    return true;
  } catch (err) {
    return err instanceof ApiError && (err.status === 403 || err.status === 404) ? false : null;
  }
}

/**
 * A host-only call: an explicit token, else the one this device holds. If the server refuses the held
 * one and a host link opened here offered a different token (captureHostLink never overwrites), that
 * one is tried once and adopted only if it works.
 */
async function asHost<T>(method: Method, id: string, rest: string, adminToken: string | null | undefined, body?: unknown): Promise<T> {
  const path = g(id, rest);
  if (adminToken != null) return request<T>(method, path, { body, adminToken });
  try {
    return await request<T>(method, path, { body, adminToken: getAdminToken(id) });
  } catch (err) {
    const linked = linkAdminToken(id);
    if (!linked || !(err instanceof ApiError && err.status === 403)) throw err;
    try {
      const res = await request<T>(method, path, { body, adminToken: linked });
      settleLinkAdminToken(id, true);
      return res;
    } catch (retryErr) {
      if (retryErr instanceof ApiError && retryErr.status === 403) settleLinkAdminToken(id, false);
      throw retryErr;
    }
  }
}

type StateResponse = { state: GameState };
export type ClaimResponse = { claimed: number; skipped: number; state: GameState };

export const api = {
  // ---- App ----
  health: () => request<{ ok: true }>("GET", "/health"),
  config: () => request<AppConfig>("GET", "/config"),
  /**
   * Football: the first week with games to link plus the weeks after it, or
   * one week's games with `week` ("2-8"). Basketball: the next 7 days' games,
   * or one day's with `date` ("20260320").
   */
  schedule: (league: Exclude<League, "custom">, signal?: AbortSignal, week?: string, date?: string) =>
    request<ScheduleResponse>(
      "GET",
      `/schedule?league=${league}${week ? `&week=${encodeURIComponent(week)}` : ""}${date ? `&date=${encodeURIComponent(date)}` : ""}`,
      { signal },
    ),

  /** A season board's team picker: the league's teams (logos and colors). */
  seasonTeams: (league: Exclude<League, "custom">, signal?: AbortSignal) =>
    request<SeasonTeamsResponse>("GET", `/season/teams?league=${league}`, { signal }),
  /** One team's season: every game, regular season and playoffs, finished ones with their result. */
  teamSchedule: (league: Exclude<League, "custom">, teamId: string, signal?: AbortSignal) =>
    request<TeamScheduleResponse>("GET", `/season/schedule?league=${league}&team=${encodeURIComponent(teamId)}`, { signal }),

  // ---- Boards ----
  /**
   * Creates a board and saves its admin token on this device. Another board for
   * a game (`fromGameId`) proves it's that board's host with its admin token.
   */
  async createGame(input: CreateGameInput): Promise<CreateGameResponse> {
    const adminToken = input.fromGameId ? getAdminToken(input.fromGameId) : null;
    const res = await request<CreateGameResponse>("POST", "/games", { body: input, adminToken });
    saveAdminToken(res.game.id, res.adminToken);
    return res;
  },
  getGame: (id: string, signal?: AbortSignal) => request<GameState>("GET", g(id), { signal }),
  updateGame: (id: string, input: UpdateGameInput, adminToken?: string | null) =>
    asHost<StateResponse>("PATCH", id, "", adminToken, input),
  /** Deletes the board and forgets it on this device. */
  async deleteGame(id: string, adminToken?: string | null): Promise<{ ok: true }> {
    const res = await asHost<{ ok: true }>("DELETE", id, "", adminToken);
    forgetGame(id);
    return res;
  },
  /**
   * Boards this device hosts or has joined, plus summaries of the `seen` ones
   * (opened from an invite, not joined; public board ids, never the clientId).
   */
  myGames: (signal?: AbortSignal, seen: readonly string[] = []) =>
    request<{ games: GameSummary[] }>("GET", seen.length > 0 ? `/me/games?seen=${seen.map(encodeURIComponent).join(",")}` : "/me/games", { signal }),

  // ---- Players ----
  /** Join (or rename) on a board; remembers the board on this device (it's no longer just "seen"). */
  async join(id: string, input: JoinInput): Promise<StateResponse> {
    const res = await request<StateResponse>("POST", g(id, "/join"), { body: input });
    rememberGame(id);
    forgetSeen(id);
    return res;
  },
  claim: (id: string, cells: CellsInput["cells"]) =>
    request<ClaimResponse>("POST", g(id, "/claim"), { body: { cells } satisfies CellsInput }),
  release: (id: string, cells: CellsInput["cells"]) =>
    request<StateResponse>("POST", g(id, "/release"), { body: { cells } satisfies CellsInput }),

  // ---- Host ----
  /** Draws the numbers. 402 (isPaymentRequired) while the host fee isn't paid. */
  lock: (id: string, adminToken?: string | null) => asHost<StateResponse>("POST", id, "/lock", adminToken),
  setScore: (id: string, input: ScoreInput, adminToken?: string | null) =>
    asHost<StateResponse>("POST", id, "/scores", adminToken, input),
  deleteScore: (id: string, periodKey: string, adminToken?: string | null) =>
    asHost<StateResponse>("DELETE", id, `/scores/${encodeURIComponent(periodKey)}`, adminToken),
  setWinner: (id: string, input: ManualWinnerInput, adminToken?: string | null) =>
    asHost<StateResponse>("POST", id, "/winners", adminToken, input),
  deleteWinner: (id: string, periodKey: string, adminToken?: string | null) =>
    asHost<StateResponse>("DELETE", id, `/winners/${encodeURIComponent(periodKey)}`, adminToken),
  /** Host removes a player (public id) and frees their squares, while squares are still being picked. */
  removePlayer: (id: string, playerId: string, adminToken?: string | null) =>
    asHost<StateResponse>("DELETE", id, `/players/${encodeURIComponent(playerId)}`, adminToken),
  /** Host ends the game (POST /final). */
  finish: (id: string, adminToken?: string | null) => asHost<StateResponse>("POST", id, "/final", adminToken),

  // ---- Co-hosts (shared/cohosts.ts) ----
  /** Host only: a single-use co-host invite link (`/g/<id>?cohost=<token>`, good for 7 days). */
  createCohostInvite: (id: string, adminToken?: string | null) => asHost<CohostInviteResponse>("POST", id, "/cohost-invites", adminToken),
  /** Accepts a co-host invite (the caller must be on the board); remembers the board as co-hosted here. */
  async acceptCohost(id: string, token: string): Promise<StateResponse> {
    const res = await request<StateResponse>("POST", g(id, "/cohosts/accept"), { body: { token } satisfies CohostAcceptInput });
    rememberCohost(id, true);
    return res;
  },
  /** The host removes a co-host (public id), or a co-host steps down (their own id; no token needed). */
  removeCohost: (id: string, playerId: string, adminToken?: string | null) =>
    asHost<StateResponse>("DELETE", id, `/cohosts/${encodeURIComponent(playerId)}`, adminToken),

  // ---- Creating a board (the only payment in the product) ----
  payTest: (id: string, adminToken?: string | null) => asHost<StateResponse>("POST", id, "/pay/test", adminToken),
  payStripe: (id: string, adminToken?: string | null) => asHost<{ clientSecret: string }>("POST", id, "/pay/stripe", adminToken),
  payIap: (id: string, transactionId: string, adminToken?: string | null) =>
    asHost<StateResponse>("POST", id, "/pay/iap", adminToken, { transactionId }),

  // ---- Notifications ----
  registerPush: (registration: PushRegistration) => request<{ ok: true }>("POST", "/push/register", { body: registration }),
  unregisterPush: (target: { endpoint?: string; token?: string }) =>
    request<{ ok: true }>("POST", "/push/unregister", { body: target }),
  getMuted: (id: string) => request<{ muted: boolean }>("GET", g(id, "/mute")),
  setMuted: (id: string, muted: boolean) => request<{ ok: true }>("POST", g(id, "/mute"), { body: { muted } }),
  /** This device's (account's) email notices for a board; the address comes back masked (docs/email.md). */
  emailNotices: (id: string) => request<EmailNotices>("GET", g(id, "/email")),
  /** Sends the confirmation email ("pending"); nothing else goes out until its link is opened. */
  addEmail: (id: string, email: string) => request<EmailNotices>("POST", g(id, "/email"), { body: { email } satisfies EmailNoticesInput }),
  /** The pending address's confirmation link again (at most once a minute). */
  resendEmail: (id: string) => request<EmailNotices>("POST", g(id, "/email"), { body: { resend: true } satisfies EmailNoticesInput }),
  /** Stops email for the board and deletes the address. */
  removeEmail: (id: string) => request<EmailNotices>("DELETE", g(id, "/email")),

  // ---- Optional sign-in (docs/auth.md); src/lib/auth.ts runs the flows ----
  /** Who this device is: its public id, its account and its boards' admin tokens. */
  me: () => request<MeResponse>("GET", "/me"),
  signIn: (provider: AuthProvider, input: SignInInput) => request<MeResponse>("POST", `/auth/${provider}`, { body: input, timeoutMs: 30_000 }),
  signOut: (input: SignOutInput) => request<{ ok: true }>("POST", "/auth/sign-out", { body: input }),
  deleteAccount: () => request<{ ok: true }>("DELETE", "/account"),
};

/** A friendly message for any thrown value (for toasts). */
export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error && err.message) return err.message;
  return "Something went wrong. Try again.";
}
