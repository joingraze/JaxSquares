// Typed client for every Worker endpoint (docs/ARCHITECTURE.md). Every request
// carries `x-client-id`; host-only calls add `x-admin-token`, defaulting to the
// token this device saved for that game. Non-2xx responses throw ApiError.

import type {
  AppConfig,
  CellsInput,
  CreateGameInput,
  CreateGameResponse,
  GameState,
  GameSummary,
  JoinInput,
  League,
  ManualWinnerInput,
  PushRegistration,
  ScheduleResponse,
  ScoreInput,
  UpdateGameInput,
} from "../../shared/types";
import { forgetGame, getAdminToken, getClientId, rememberGame, saveAdminToken } from "./identity";

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

export async function request<T>(method: Method, path: string, opts: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { "x-client-id": getClientId() };
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
    throw new ApiError(msg, res.status, data);
  }
  return data as T;
}

const g = (id: string, rest = "") => `/games/${encodeURIComponent(id)}${rest}`;
const host = (id: string, token: string | null | undefined) => token ?? getAdminToken(id);

type StateResponse = { state: GameState };
export type ClaimResponse = { claimed: number; skipped: number; state: GameState };

export const api = {
  // ---- App ----
  health: () => request<{ ok: true }>("GET", "/health"),
  config: () => request<AppConfig>("GET", "/config"),
  schedule: (league: Exclude<League, "custom">, signal?: AbortSignal) =>
    request<ScheduleResponse>("GET", `/schedule?league=${league}`, { signal }),

  // ---- Boards ----
  /** Creates a board and saves its admin token on this device. */
  async createGame(input: CreateGameInput): Promise<CreateGameResponse> {
    const res = await request<CreateGameResponse>("POST", "/games", { body: input });
    saveAdminToken(res.game.id, res.adminToken);
    return res;
  },
  getGame: (id: string, signal?: AbortSignal) => request<GameState>("GET", g(id), { signal }),
  updateGame: (id: string, input: UpdateGameInput, adminToken?: string | null) =>
    request<StateResponse>("PATCH", g(id), { body: input, adminToken: host(id, adminToken) }),
  /** Deletes the board and forgets it on this device. */
  async deleteGame(id: string, adminToken?: string | null): Promise<{ ok: true }> {
    const res = await request<{ ok: true }>("DELETE", g(id), { adminToken: host(id, adminToken) });
    forgetGame(id);
    return res;
  },
  myGames: (signal?: AbortSignal) => request<{ games: GameSummary[] }>("GET", "/me/games", { signal }),

  // ---- Players ----
  /** Join (or rename) on a board; remembers the board on this device. */
  async join(id: string, input: JoinInput): Promise<StateResponse> {
    const res = await request<StateResponse>("POST", g(id, "/join"), { body: input });
    rememberGame(id);
    return res;
  },
  claim: (id: string, cells: CellsInput["cells"]) =>
    request<ClaimResponse>("POST", g(id, "/claim"), { body: { cells } satisfies CellsInput }),
  release: (id: string, cells: CellsInput["cells"]) =>
    request<StateResponse>("POST", g(id, "/release"), { body: { cells } satisfies CellsInput }),

  // ---- Host ----
  lock: (id: string, adminToken?: string | null) =>
    request<StateResponse>("POST", g(id, "/lock"), { adminToken: host(id, adminToken) }),
  setScore: (id: string, input: ScoreInput, adminToken?: string | null) =>
    request<StateResponse>("POST", g(id, "/scores"), { body: input, adminToken: host(id, adminToken) }),
  deleteScore: (id: string, periodKey: string, adminToken?: string | null) =>
    request<StateResponse>("DELETE", g(id, `/scores/${encodeURIComponent(periodKey)}`), {
      adminToken: host(id, adminToken),
    }),
  setWinner: (id: string, input: ManualWinnerInput, adminToken?: string | null) =>
    request<StateResponse>("POST", g(id, "/winners"), { body: input, adminToken: host(id, adminToken) }),
  deleteWinner: (id: string, periodKey: string, adminToken?: string | null) =>
    request<StateResponse>("DELETE", g(id, `/winners/${encodeURIComponent(periodKey)}`), {
      adminToken: host(id, adminToken),
    }),
  /** Host ends the game (POST /final). */
  finish: (id: string, adminToken?: string | null) =>
    request<StateResponse>("POST", g(id, "/final"), { adminToken: host(id, adminToken) }),

  // ---- Creating a board (the only payment in the product) ----
  payTest: (id: string, adminToken?: string | null) =>
    request<StateResponse>("POST", g(id, "/pay/test"), { adminToken: host(id, adminToken) }),
  payStripe: (id: string, adminToken?: string | null) =>
    request<{ clientSecret: string }>("POST", g(id, "/pay/stripe"), { adminToken: host(id, adminToken) }),
  payIap: (id: string, transactionId: string, adminToken?: string | null) =>
    request<StateResponse>("POST", g(id, "/pay/iap"), { body: { transactionId }, adminToken: host(id, adminToken) }),

  // ---- Notifications ----
  registerPush: (registration: PushRegistration) => request<{ ok: true }>("POST", "/push/register", { body: registration }),
  unregisterPush: (target: { endpoint?: string; token?: string }) =>
    request<{ ok: true }>("POST", "/push/unregister", { body: target }),
  getMuted: (id: string) => request<{ muted: boolean }>("GET", g(id, "/mute")),
  setMuted: (id: string, muted: boolean) => request<{ ok: true }>("POST", g(id, "/mute"), { body: { muted } }),
};

/** A friendly message for any thrown value (for toasts). */
export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error && err.message) return err.message;
  return "Something went wrong. Try again.";
}
