// /api/push/* and /api/games/:id/mute. Mounted by worker/index.ts under /api,
// which also applies CORS. Errors are { error } like the rest of the API.

import { Hono, type Context } from "hono";
import { isClientId } from "../../shared/playerId";
import { canonicalClientId, SIGNED_IN_HEADER, signedInHint } from "../auth/canonical";
import { getGame } from "../db";
import type { Env } from "../env";
import { channelsFrom, deliver, jobsFor } from "./notify";
import { deleteSubscription, isMuted, setMuted, subscriptionsForClient, upsertSubscription } from "./store";
import type { PushContent } from "./types";
import { isFcmToken, isPushServiceEndpoint, parseRegistration } from "./validate";

type Ctx = Context<{ Bindings: Env }>;

const GAME_ID_RE = /^[a-z0-9]{4,16}$/;
const MAX_BODY_BYTES = 8 * 1024;

export const pushRoutes = new Hono<{ Bindings: Env }>();

const error = (c: Ctx, status: 400 | 401 | 404 | 413, message: string) => c.json({ error: message }, status);

/**
 * The clientId this device registers and mutes as: its account's canonical one
 * when it's signed in (worker/auth/canonical.ts), so the account's pushes reach
 * every device signed in to it.
 */
async function clientIdOf(c: Ctx): Promise<string | null> {
  const id = c.req.header("x-client-id") ?? "";
  if (!isClientId(id)) return null;
  return canonicalClientId(c.env.DB, id, { signedIn: signedInHint(c.req.header(SIGNED_IN_HEADER)) });
}

/** The JSON object body, or an error response. */
async function readBody(c: Ctx): Promise<Record<string, unknown> | Response> {
  const text = await c.req.text().catch(() => "");
  if (text.length > MAX_BODY_BYTES) return error(c, 413, "Request too large");
  try {
    const body: unknown = JSON.parse(text);
    if (body && typeof body === "object" && !Array.isArray(body)) return body as Record<string, unknown>;
  } catch {
    // fall through
  }
  return error(c, 400, "Invalid JSON body");
}

pushRoutes.post("/push/register", async (c) => {
  const clientId = await clientIdOf(c);
  if (!clientId) return error(c, 401, "Missing or invalid x-client-id");
  const body = await readBody(c);
  if (body instanceof Response) return body;
  const parsed = parseRegistration(body);
  if (!parsed.ok) return error(c, 400, parsed.error);
  await upsertSubscription(c.env.DB, clientId, parsed.value, Date.now());
  return c.json({ ok: true });
});

pushRoutes.post("/push/unregister", async (c) => {
  const clientId = await clientIdOf(c);
  if (!clientId) return error(c, 401, "Missing or invalid x-client-id");
  const body = await readBody(c);
  if (body instanceof Response) return body;
  const key =
    typeof body.endpoint === "string" && isPushServiceEndpoint(body.endpoint)
      ? body.endpoint
      : isFcmToken(body.token)
        ? body.token
        : null;
  if (!key) return error(c, 400, "Send the endpoint or token to remove");
  await deleteSubscription(c.env.DB, clientId, key);
  return c.json({ ok: true });
});

/** Sends "you're all set" to this device's registrations, so a host can check setup end to end. */
pushRoutes.post("/push/test", async (c) => {
  const clientId = await clientIdOf(c);
  if (!clientId) return error(c, 401, "Missing or invalid x-client-id");
  const channels = channelsFrom(c.env);
  const subs = await subscriptionsForClient(c.env.DB, clientId);
  const content: PushContent = {
    title: "JaxSquares",
    body: "🔔 You're all set. We'll ping you when your squares hit.",
    url: "/",
    gameId: "",
    kind: "test",
    tag: "test",
    renotify: true,
    quiet: false,
    urgency: "high",
    ttlSeconds: 300,
  };
  const jobs = jobsFor([{ clientId, content }], subs, channels);
  const t = await deliver(c.env.DB, channels, jobs);
  return c.json({ ok: true, devices: subs.length, sent: t.ok, failed: t.error + t.gone });
});

async function gameFor(c: Ctx): Promise<{ id: string; clientId: string } | Response> {
  const clientId = await clientIdOf(c);
  if (!clientId) return error(c, 401, "Missing or invalid x-client-id");
  const id = c.req.param("id") ?? "";
  if (!GAME_ID_RE.test(id) || !(await getGame(c.env.DB, id))) return error(c, 404, "Game not found");
  return { id, clientId };
}

pushRoutes.get("/games/:id/mute", async (c) => {
  const g = await gameFor(c);
  if (g instanceof Response) return g;
  return c.json({ muted: await isMuted(c.env.DB, g.id, g.clientId) });
});

pushRoutes.post("/games/:id/mute", async (c) => {
  const g = await gameFor(c);
  if (g instanceof Response) return g;
  const body = await readBody(c);
  if (body instanceof Response) return body;
  if (typeof body.muted !== "boolean") return error(c, 400, "muted must be true or false");
  await setMuted(c.env.DB, g.id, g.clientId, body.muted, Date.now());
  return c.json({ ok: true });
});
