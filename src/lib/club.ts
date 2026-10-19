// The Club Pass's club on this device (docs/payments.md "Club Pass"): the
// holder's club settings (name, logo, TV link, boards), the club TV's read,
// the players CSV, and the TV link this device made. The pass itself (buying
// it, whether it's active) lives with the Host Pass (src/lib/useHostPass.ts).
//
// The TV link's token is only ever in the link (its fragment) and in this
// device's storage: the server keeps a hash. The link comes back once, when
// it's made; a device shows it again while the server's fingerprint (tvKey)
// still matches, and another device makes a new one.

import { CLUB_TV_TOKEN_HEADER } from "../../shared/clubs";
import type { ClubSettings, ClubTvLink, ClubTvState } from "../../shared/types";
import { API_BASE, ApiError, identityHeaders, request } from "./api";
import { STORAGE_KEYS, getAdminToken } from "./identity";

const TIMEOUT_MS = 20_000;

/** A fetch that throws ApiError like api.ts's request (for the calls that aren't JSON both ways). */
async function rawFetch(path: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api${path}`, { ...init, signal: init.signal ?? controller.signal });
  } catch (err) {
    if (init.signal?.aborted) throw err;
    throw new ApiError(controller.signal.aborted ? "That took too long. Check your connection and try again." : "You're offline. Check your connection and try again.", 0);
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: unknown };
    throw new ApiError(typeof data.error === "string" ? data.error : `Request failed (${res.status})`, res.status, data, Number(res.headers.get("retry-after")) || undefined);
  }
  return res;
}

export const clubApi = {
  /** The holder's club; 404 (ApiError) without an active Club Pass. */
  mine: () => request<ClubSettings>("GET", "/clubs/mine"),
  /** "" takes the branding off the boards. 400 for a name that talks money (CLUB_NAME_MONEY_ERROR). */
  rename: (name: string) => request<ClubSettings>("PATCH", "/clubs/mine", { body: { name } }),
  /** A logo prepared by prepareLogo (src/lib/clubLogo.ts): WebP or PNG, at most 256x256, under 60 KB. */
  async uploadLogo(logo: Blob): Promise<ClubSettings> {
    const res = await rawFetch("/clubs/mine/logo", { method: "PUT", headers: { ...identityHeaders(), "content-type": logo.type }, body: logo });
    return (await res.json()) as ClubSettings;
  },
  removeLogo: () => request<ClubSettings>("DELETE", "/clubs/mine/logo"),
  /** A new TV link (the old one stops working); kept on this device. */
  async newTvLink(): Promise<ClubTvLink> {
    const link = await request<ClubTvLink>("POST", "/clubs/mine/tv");
    rememberTvLink(link);
    return link;
  },
  /** What a club TV shows (no identity: the TV is nobody's player). 404 (ApiError) for a wrong or old link. */
  async tv(clubId: string, token: string, signal?: AbortSignal): Promise<ClubTvState> {
    const res = await rawFetch(`/clubs/${encodeURIComponent(clubId)}/tv`, { headers: { [CLUB_TV_TOKEN_HEADER]: token }, signal });
    return (await res.json()) as ClubTvState;
  },
};

// ---- The TV link this device made ----

type TvLinks = Record<string, { key: string; url: string }>;

function readTvLinks(): TvLinks {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.clubTv);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as TvLinks) : {};
  } catch {
    return {};
  }
}

function rememberTvLink(link: ClubTvLink): void {
  if (!link.tvKey) return;
  try {
    localStorage.setItem(STORAGE_KEYS.clubTv, JSON.stringify({ ...readTvLinks(), [link.club.id]: { key: link.tvKey, url: link.tvUrl } }));
  } catch {
    // Private mode: the link shows until the page closes (the caller holds it).
  }
}

/** The club's current TV link when this device made it (null when there's none, or another device made a newer one). */
export function knownTvLink(settings: Pick<ClubSettings, "club" | "tvKey">): string | null {
  if (!settings.tvKey) return null;
  const known = readTvLinks()[settings.club.id];
  return known && known.key === settings.tvKey ? known.url : null;
}

/** The club TV link's parts from the page's URL: `/club/<id>/tv#k=<token>`. */
export function tvTokenFromHash(hash: string): string | null {
  const token = new URLSearchParams(hash.replace(/^#/, "")).get("k");
  return token && /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null;
}

// ---- The players CSV ----

export interface PlayersCsv {
  blob: Blob;
  fileName: string;
}

/**
 * GET /api/games/:id/export.csv for the board's host (its admin token) or a
 * co-host (by clientId): the players with their squares, numbers and when
 * they joined, in this device's time zone. Never a payment column.
 */
export async function downloadPlayersCsv(gameId: string): Promise<PlayersCsv> {
  const headers: Record<string, string> = identityHeaders();
  const adminToken = getAdminToken(gameId);
  if (adminToken) headers["x-admin-token"] = adminToken;
  let tz = "";
  try {
    tz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
  } catch {
    tz = "";
  }
  const res = await rawFetch(`/games/${encodeURIComponent(gameId)}/export.csv${tz ? `?tz=${encodeURIComponent(tz)}` : ""}`, { headers });
  const name = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? `${gameId}-players.csv`;
  // Keep the byte-order mark (spreadsheet apps read the names as UTF-8 by it).
  return { blob: new Blob([await res.arrayBuffer()], { type: "text/csv" }), fileName: name };
}
