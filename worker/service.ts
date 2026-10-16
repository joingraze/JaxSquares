// STUB — owned by the core builder. See docs/ARCHITECTURE.md "Cross-module function contracts".
import type { Activity, GameState, LiveUpdate } from "../shared/types";
import type { Env } from "./env";

export async function loadState(_env: Env, _gameId: string): Promise<GameState | null> {
  throw new Error("not implemented");
}
export async function broadcast(_env: Env, _gameId: string, _activity?: Activity): Promise<GameState | null> {
  throw new Error("not implemented");
}
export async function activateGame(
  _env: Env,
  _gameId: string,
  _purchase: { provider: "test" | "stripe" | "iap"; reference: string; amountCents: number },
): Promise<GameState | null> {
  throw new Error("not implemented");
}
export async function isHost(_env: Env, _gameId: string, _adminToken: string): Promise<boolean> {
  throw new Error("not implemented");
}
export async function applyLiveUpdate(_env: Env, _gameId: string, _update: LiveUpdate): Promise<void> {
  throw new Error("not implemented");
}
