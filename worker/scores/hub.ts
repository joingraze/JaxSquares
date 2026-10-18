// ScoreHub: one Durable Object per league (idFromName("espn:nfl")) that every
// ESPN request goes through: the game picker's schedule and every linked
// board's live-score poll. A Durable Object is a single context, so concurrent
// callers can safely wait on one in-flight fetch, and its memory is one cache
// for the whole app: ESPN sees about one request per scoreboard per TTL no
// matter how many boards are live. Nothing is persisted.
//
// Classic Durable Object class (no `cloudflare:workers` import), like GameRoom,
// so it loads in plain Vitest.

import type { LinkedEvent } from "../../shared/types";
import type { Env } from "../env";
import { parseWeekId } from "./espn";
import { fetchLiveForEvent, getSchedule, isLinkedLeague } from "./index";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function isLinkedEvent(v: unknown): v is LinkedEvent {
  const e = v as Partial<LinkedEvent> | null;
  return (
    !!e &&
    e.provider === "espn" &&
    typeof e.league === "string" &&
    isLinkedLeague(e.league) &&
    typeof e.eventId === "string" &&
    e.eventId.length > 0 &&
    typeof e.startsAt === "number" &&
    typeof e.xIsHome === "boolean"
  );
}

export class ScoreHub implements DurableObject {
  private readonly inflight = new Map<string, Promise<unknown>>();

  constructor(
    readonly ctx: DurableObjectState,
    readonly env: Env,
  ) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/live" && request.method === "POST") {
      const event: unknown = await request.json().catch(() => null);
      if (!isLinkedEvent(event)) return json({ error: "bad event" }, 400);
      return json(await fetchLiveForEvent(event, { inflight: this.inflight }));
    }
    if (url.pathname === "/schedule" && request.method === "GET") {
      const league = url.searchParams.get("league") ?? "";
      const week = url.searchParams.get("week") ?? undefined;
      if (!isLinkedLeague(league) || (week !== undefined && !parseWeekId(week))) return json({ error: "bad query" }, 400);
      return json(await getSchedule(league, week, { inflight: this.inflight }));
    }
    return json({ error: "not found" }, 404);
  }
}
