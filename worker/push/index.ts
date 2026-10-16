// STUB — owned by the push builder. Replace with web push (VAPID) + FCM.
import { Hono } from "hono";
import type { Env } from "../env";

export const pushRoutes = new Hono<{ Bindings: Env }>();

export type NotifyEvent =
  | { kind: "numbers-drawn" }
  | { kind: "winner"; periodKey: string; label: string; clientIds: string[] }
  | { kind: "game-starting" }
  | { kind: "board-full" }
  | { kind: "player-joined"; name: string }
  | { kind: "final" };

export async function notify(_env: Env, _gameId: string, _event: NotifyEvent): Promise<void> {}
