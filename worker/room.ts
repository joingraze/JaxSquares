// GameRoom: one Durable Object per game (idFromName(gameId)). Holds the game's
// hibernatable WebSockets, fans out state pushed by the Worker, tracks who is
// watching, and polls live scores with an alarm while a linked game is on.

import type { Activity, GameState, LiveMessage } from "../shared/types";
import type { Env } from "./env";
import { fetchLiveForEvent } from "./scores";
import { applyLiveUpdate, loadState } from "./service";

const POLL_LIVE_MS = 15_000;
const POLL_PRE_MS = 30_000;
/** Start polling this long before kickoff (matches the cron's wake window). */
export const POLL_LEAD_MS = 15 * 60_000;
/** Give up on a game the provider never marked final. */
const POLL_GIVE_UP_MS = 12 * 60 * 60_000;
const SOCKET_OPEN = 1;

interface Attachment {
  clientId: string | null;
  connectedAt: number;
}

export type PollPlan = { kind: "stop" } | { kind: "now" } | { kind: "at"; at: number };

/** When (if ever) the room should next poll live scores for this state. */
export function pollPlan(state: GameState | null, now: number): PollPlan {
  const ev = state?.game.linkedEvent;
  if (!state || !ev) return { kind: "stop" };
  if (state.game.status === "draft" || state.game.status === "final") return { kind: "stop" };
  if (state.live?.state === "post") return { kind: "stop" };
  if (now > ev.startsAt + POLL_GIVE_UP_MS) return { kind: "stop" };
  if (now < ev.startsAt - POLL_LEAD_MS) return { kind: "at", at: ev.startsAt - POLL_LEAD_MS };
  return { kind: "now" };
}

// Classic Durable Object class (no `cloudflare:workers` import) so the module
// also loads under Vitest; the WebSocket Hibernation API is the same.
export class GameRoom implements DurableObject {
  private gameId: string | null = null;
  /** Highest state version sent; stale pushes arriving out of order are dropped. */
  private lastVersion = 0;

  constructor(
    private readonly ctx: DurableObjectState,
    private readonly env: Env,
  ) {
    // Keepalive pings are answered without waking the object from hibernation.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const gameId = request.headers.get("x-game-id");
    if (!gameId) return new Response("missing game id", { status: 400 });
    // The game id is only persisted (for the alarm) once the game is known to exist.

    if (request.headers.get("Upgrade")?.toLowerCase() === "websocket") return this.openSocket(gameId, url);

    if (request.method === "POST" && url.pathname === "/broadcast") {
      const body = (await request.json()) as { state: GameState; activity?: Activity; activities?: Activity[] };
      const activities = body.activities ?? (body.activity ? [body.activity] : []);
      await this.deliver(body.state, activities);
      await this.rememberGameId(gameId);
      await this.schedulePolling(body.state);
      return new Response(null, { status: 204 });
    }

    if (request.method === "POST" && url.pathname === "/wake") {
      const state = await loadState(this.env, gameId);
      if (state) {
        await this.rememberGameId(gameId);
        await this.schedulePolling(state);
      }
      return new Response(null, { status: 204 });
    }

    if (request.method === "POST" && url.pathname === "/close") {
      // The game was deleted: tell clients (4404) and stop polling.
      for (const ws of this.ctx.getWebSockets()) {
        try {
          ws.close(4404, "Game not found");
        } catch {
          // already closing
        }
      }
      await this.ctx.storage.deleteAlarm();
      await this.ctx.storage.deleteAll();
      this.gameId = null;
      return new Response(null, { status: 204 });
    }

    return new Response("not found", { status: 404 });
  }

  private async openSocket(gameId: string, url: URL): Promise<Response> {
    const state = await loadState(this.env, gameId);
    if (!state) return new Response("Game not found", { status: 404 });
    await this.rememberGameId(gameId);

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    this.ctx.acceptWebSocket(server);
    const clientId = (url.searchParams.get("clientId") ?? "").slice(0, 64) || null;
    server.serializeAttachment({ clientId, connectedAt: Date.now() } satisfies Attachment);

    // Current state first so the board renders instantly, then who's here.
    server.send(message({ type: "state", state }));
    this.lastVersion = Math.max(this.lastVersion, state.version);
    this.sendPresence();
    await this.schedulePolling(state);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, data: string | ArrayBuffer): Promise<void> {
    if (typeof data !== "string" || data.length > 512) return;
    let msg: { type?: unknown } | null = null;
    try {
      msg = JSON.parse(data) as { type?: unknown };
    } catch {
      return;
    }
    if (msg?.type === "ping") ws.send(JSON.stringify({ type: "pong" }));
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    try {
      // 1005/1006 are reserved and can't be sent back.
      ws.close(code === 1005 || code === 1006 ? 1000 : code, reason);
    } catch {
      // already closed
    }
    this.sendPresence(ws);
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    this.sendPresence(ws);
  }

  async alarm(): Promise<void> {
    const gameId = await this.getGameId();
    if (!gameId) return;
    const state = await loadState(this.env, gameId);
    const plan = pollPlan(state, Date.now());
    if (plan.kind === "stop" || !state?.game.linkedEvent) return;
    if (plan.kind === "at") {
      await this.ctx.storage.setAlarm(plan.at);
      return;
    }

    let next = POLL_PRE_MS;
    try {
      const update = await fetchLiveForEvent(state.game.linkedEvent);
      if (update) {
        await applyLiveUpdate(this.env, gameId, update, (s, activities) => this.deliver(s, activities));
        if (update.isFinal) return;
        if (update.live.state === "in") next = POLL_LIVE_MS;
        if (update.live.state === "post") return;
      }
    } catch (err) {
      console.error(`live poll ${gameId} failed`, err);
    }
    await this.ctx.storage.setAlarm(Date.now() + next);
  }

  // ---- helpers ----

  private async deliver(state: GameState, activities: Activity[]): Promise<void> {
    const out: string[] = [];
    if (state.version >= this.lastVersion) {
      this.lastVersion = state.version;
      out.push(message({ type: "state", state }));
    }
    for (const activity of activities) out.push(message({ type: "event", activity }));
    if (out.length === 0) return;
    for (const ws of this.ctx.getWebSockets()) {
      for (const m of out) {
        try {
          ws.send(m);
        } catch {
          // Socket is closing; its close handler updates presence.
        }
      }
    }
  }

  /** Distinct devices watching (sockets without a clientId count individually). */
  private sendPresence(exclude?: WebSocket): void {
    const sockets = this.ctx.getWebSockets().filter((ws) => ws !== exclude && ws.readyState === SOCKET_OPEN);
    const devices = new Set<string>();
    let anonymous = 0;
    for (const ws of sockets) {
      const a = ws.deserializeAttachment() as Attachment | null;
      if (a?.clientId) devices.add(a.clientId);
      else anonymous++;
    }
    const m = message({ type: "presence", watching: devices.size + anonymous });
    for (const ws of sockets) {
      try {
        ws.send(m);
      } catch {
        // closing
      }
    }
  }

  private async schedulePolling(state: GameState | null): Promise<void> {
    const plan = pollPlan(state, Date.now());
    if (plan.kind === "stop") return;
    const current = await this.ctx.storage.getAlarm();
    // While polling, an alarm is always pending; don't pull it forward on every broadcast.
    if (plan.kind === "now") {
      if (current === null) await this.ctx.storage.setAlarm(Date.now() + 500);
    } else if (current === null || current > plan.at) {
      await this.ctx.storage.setAlarm(plan.at);
    }
  }

  private async rememberGameId(gameId: string): Promise<void> {
    if (this.gameId === gameId) return;
    this.gameId = gameId;
    await this.ctx.storage.put("gameId", gameId);
  }

  private async getGameId(): Promise<string | null> {
    if (!this.gameId) this.gameId = (await this.ctx.storage.get<string>("gameId")) ?? null;
    return this.gameId;
  }
}

function message(m: LiveMessage): string {
  return JSON.stringify(m);
}
