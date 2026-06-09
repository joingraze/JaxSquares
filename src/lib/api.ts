// Typed client for the Worker API. Throws ApiError on non-2xx so callers can
// surface a friendly message.

import type {
  ClaimInput,
  CreateGameInput,
  CreateGameResponse,
  GameState,
  ReleaseInput,
  ScoreInput,
} from "../../shared/types";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit & { adminToken?: string }): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body) headers.set("content-type", "application/json");
  if (init?.adminToken) headers.set("x-admin-token", init.adminToken);

  const res = await fetch(`/api${path}`, { ...init, headers });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new ApiError((data.error as string) ?? `Request failed (${res.status})`, res.status);
  }
  return data as T;
}

export const api = {
  createGame: (input: CreateGameInput) =>
    request<CreateGameResponse>("/games", { method: "POST", body: JSON.stringify(input) }),

  getGame: (id: string) => request<GameState>(`/games/${id}`),

  claim: (id: string, input: ClaimInput) =>
    request<{ claimed: number; skipped: number; state: GameState }>(`/games/${id}/claim`, {
      method: "POST",
      body: JSON.stringify(input),
    }),

  release: (id: string, input: ReleaseInput) =>
    request<{ state: GameState }>(`/games/${id}/release`, {
      method: "POST",
      body: JSON.stringify(input),
    }),

  lock: (id: string, adminToken: string) =>
    request<{ state: GameState }>(`/games/${id}/lock`, { method: "POST", adminToken }),

  setScore: (id: string, adminToken: string, input: ScoreInput) =>
    request<{ state: GameState }>(`/games/${id}/scores`, {
      method: "POST",
      adminToken,
      body: JSON.stringify(input),
    }),

  deleteScore: (id: string, adminToken: string, periodKey: string) =>
    request<{ state: GameState }>(`/games/${id}/scores/${periodKey}`, {
      method: "DELETE",
      adminToken,
    }),
};
