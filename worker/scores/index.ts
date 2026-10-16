// STUB — owned by the scores builder. Replace with the ESPN provider.
import { Hono } from "hono";
import type { LinkedEvent, LiveUpdate } from "../../shared/types";
import type { Env } from "../env";

export const scheduleRoutes = new Hono<{ Bindings: Env }>();
scheduleRoutes.get("/schedule", (c) => c.json({ events: [] }));

export async function fetchLiveForEvent(_event: LinkedEvent): Promise<LiveUpdate | null> {
  return null;
}
