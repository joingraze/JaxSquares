// Account-free identity for this device.
//
// - clientId: random secret sent as `x-client-id` on every request. It is the
//   device's only credential, so it never appears in a URL, a share, the UI or
//   any server response.
// - playerId: the public id the server uses for this device in every payload
//   (Player.id, Square.playerId, Activity.actor, results), derived one-way from
//   the clientId (shared/playerId.ts). Compare against this to find "mine".
// - profile: the name/color/emoji used when joining a board.
// - admin tokens: one per hosted game, sent as `x-admin-token`.
// - known games: ids this device created or joined (for hydration + dashboard).
//
// Reads are synchronous (localStorage). The native app also mirrors every value
// into Capacitor Preferences because iOS may evict a WebView's localStorage;
// `hydrateIdentity()` runs once at startup, before the first render, to copy
// values back in either direction.

import { useSyncExternalStore } from "react";
import { derivePlayerId, derivePlayerIdSync } from "../../shared/playerId";
import { getStored, removeStored, setStored } from "./native";

export const STORAGE_KEYS = {
  clientId: "jaxsquares.clientId",
  profile: "jaxsquares.profile",
  games: "jaxsquares.games",
  admin: (gameId: string) => `jaxsquares.admin.${gameId}`,
} as const;

/** Server limit for player names (worker cleanProfile). */
export const NAME_MAX_LENGTH = 24;
const KNOWN_GAMES_MAX = 100;

export interface Profile {
  name: string;
  color: string;
  emoji: string;
}

/** Player colors: bright enough to read on the night background, distinct from each other, never volt (that's "you"/actions). */
export const PLAYER_COLORS: readonly { value: string; name: string }[] = [
  { value: "#ff6b35", name: "Blaze" },
  { value: "#ffd23f", name: "Sunny" },
  { value: "#34d07b", name: "Turf" },
  { value: "#1fd1c1", name: "Aqua" },
  { value: "#38b6ff", name: "Sky" },
  { value: "#5b74ff", name: "Royal" },
  { value: "#9b6bff", name: "Grape" },
  { value: "#ff4f9a", name: "Flare" },
  { value: "#ff8fd0", name: "Bubblegum" },
  { value: "#ff4757", name: "Cherry" },
  { value: "#ffa26b", name: "Peach" },
  { value: "#e6ede8", name: "Chalk" },
];

export const PLAYER_EMOJIS: readonly string[] = [
  "🏈", "🔥", "⚡", "🏆", "👑", "🎯", "🚀", "😎",
  "🤠", "🥳", "🤖", "👽", "🦅", "🐻", "🦁", "🐯",
  "🐐", "🦈", "🐬", "🐴", "🦬", "🐸", "🐼", "🦄",
  "🦖", "🍕", "🌮", "🍗", "🌭", "🧀", "🍀", "💎",
];

// ---- Storage (localStorage with an in-memory fallback when it's unavailable) ----

const memory = new Map<string, string>();

function readLocal(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return memory.get(key) ?? null;
  }
}

function writeLocal(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    memory.set(key, value);
  }
}

function deleteLocal(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
  memory.delete(key);
}

/** Write locally now and mirror to the native store in the background. */
function persist(key: string, value: string): void {
  writeLocal(key, value);
  void setStored(key, value).catch(() => {});
}

function unpersist(key: string): void {
  deleteLocal(key);
  void removeStored(key).catch(() => {});
}

// ---- Change notifications (for useProfile) ----

const listeners = new Set<() => void>();

function emit(): void {
  profileCache = null;
  for (const l of listeners) l();
}

export function subscribeIdentity(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

if (typeof window !== "undefined") {
  // Another tab changed the profile.
  window.addEventListener("storage", (e) => {
    if (e.key === STORAGE_KEYS.profile || e.key === null) emit();
  });
}

// ---- Client id (secret) and player id (public) ----

function newClientId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  // randomUUID needs a secure context; getRandomValues doesn't (plain-http LAN dev).
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * This device's secret id, created on first use and saved to localStorage and
 * the native store (so iOS clearing WebView storage doesn't orphan the
 * device's boards). Only for the `x-client-id` header.
 */
export function getClientId(): string {
  let id = readLocal(STORAGE_KEYS.clientId);
  if (!id) {
    id = newClientId();
    persist(STORAGE_KEYS.clientId, id);
  }
  return id;
}

let playerIdCache: { clientId: string; playerId: string } | null = null;

/**
 * This device's public player id: what GameState uses for Player.id,
 * Square.playerId, Activity.actor and results. Synchronous: hydrateIdentity
 * computes it with WebCrypto at startup; if anything asks earlier (or the
 * clientId changed) it is derived on the spot with the same hash.
 */
export function getPlayerId(): string {
  const clientId = getClientId();
  if (playerIdCache?.clientId !== clientId) playerIdCache = { clientId, playerId: derivePlayerIdSync(clientId) };
  return playerIdCache.playerId;
}

async function primePlayerId(): Promise<void> {
  const clientId = getClientId();
  if (playerIdCache?.clientId === clientId) return;
  const playerId = await derivePlayerId(clientId);
  // The clientId can't change during the await (hydration is the only writer), but don't cache a stale pair.
  if (getClientId() === clientId) playerIdCache = { clientId, playerId };
}

// ---- Profile ----

/** Small stable hash so a fresh device gets a consistent default color/emoji. */
function hashOf(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function defaultProfile(clientId: string): Profile {
  const h = hashOf(clientId);
  return {
    name: "",
    color: PLAYER_COLORS[h % PLAYER_COLORS.length].value,
    emoji: PLAYER_EMOJIS[(h >>> 8) % PLAYER_EMOJIS.length],
  };
}

function parseProfile(raw: string | null): Partial<Profile> {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw) as Record<string, unknown>;
    const out: Partial<Profile> = {};
    if (typeof v.name === "string") out.name = v.name.slice(0, NAME_MAX_LENGTH);
    if (typeof v.color === "string" && /^#[0-9a-f]{6}$/i.test(v.color)) out.color = v.color;
    if (typeof v.emoji === "string") out.emoji = v.emoji;
    return out;
  } catch {
    return {};
  }
}

let profileCache: Profile | null = null;

/** Always returns a complete profile (defaults filled in); `name` is "" until the player picks one. Stable reference until changed. */
export function getProfile(): Profile {
  if (!profileCache) {
    profileCache = { ...defaultProfile(getClientId()), ...parseProfile(readLocal(STORAGE_KEYS.profile)) };
  }
  return profileCache;
}

export function hasProfileName(): boolean {
  return getProfile().name.trim().length > 0;
}

export function setProfile(patch: Partial<Profile>): Profile {
  const next: Profile = { ...getProfile(), ...patch };
  next.name = next.name.slice(0, NAME_MAX_LENGTH);
  persist(STORAGE_KEYS.profile, JSON.stringify(next));
  emit();
  return getProfile();
}

/** React binding: re-renders when the profile changes (this tab or another). */
export function useProfile(): Profile {
  return useSyncExternalStore(subscribeIdentity, getProfile, getProfile);
}

// ---- Known games ----

export function getKnownGames(): string[] {
  try {
    const v = JSON.parse(readLocal(STORAGE_KEYS.games) ?? "[]") as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** Most recent first, de-duplicated. */
export function rememberGame(gameId: string): void {
  const list = [gameId, ...getKnownGames().filter((id) => id !== gameId)].slice(0, KNOWN_GAMES_MAX);
  persist(STORAGE_KEYS.games, JSON.stringify(list));
}

export function forgetGame(gameId: string): void {
  persist(STORAGE_KEYS.games, JSON.stringify(getKnownGames().filter((id) => id !== gameId)));
  unpersist(STORAGE_KEYS.admin(gameId));
}

// ---- Host (admin) tokens ----

export function saveAdminToken(gameId: string, token: string): void {
  persist(STORAGE_KEYS.admin(gameId), token);
  rememberGame(gameId);
}

export function getAdminToken(gameId: string): string | null {
  return readLocal(STORAGE_KEYS.admin(gameId));
}

export function isHostOf(gameId: string): boolean {
  return getAdminToken(gameId) !== null;
}

const HOST_PARAM = "host";
const GAME_PATH_RE = /^\/g\/([^/?#]+)\/?/;

/** Reads a host link (`/g/<id>?host=<token>`). Returns null when the URL isn't one. */
export function parseHostLink(pathname: string, search: string): { gameId: string; token: string } | null {
  const m = GAME_PATH_RE.exec(pathname);
  if (!m) return null;
  const token = new URLSearchParams(search).get(HOST_PARAM)?.trim();
  if (!token) return null;
  return { gameId: decodeURIComponent(m[1]), token };
}

/**
 * Saves the admin token from a host link so the host can manage the board from
 * another device. Returns the search string with the token removed (the caller
 * replaces the URL so the token doesn't linger in history), or null if the URL
 * wasn't a host link.
 */
export function captureHostLink(pathname: string, search: string): string | null {
  const link = parseHostLink(pathname, search);
  if (!link) return null;
  saveAdminToken(link.gameId, link.token);
  const params = new URLSearchParams(search);
  params.delete(HOST_PARAM);
  const rest = params.toString();
  return rest ? `?${rest}` : "";
}

/** The link a host can open on another device to manage `gameId`. Null when this device isn't the host. */
export function hostLinkUrl(gameId: string, origin: string): string | null {
  const token = getAdminToken(gameId);
  if (!token) return null;
  return `${origin}/g/${encodeURIComponent(gameId)}?${HOST_PARAM}=${encodeURIComponent(token)}`;
}

// ---- Native hydration ----

export interface PersistentStore {
  getStored(key: string): Promise<string | null>;
  setStored(key: string, value: string): Promise<void>;
}

/**
 * Startup step (await before the first render): mirrors identity between
 * localStorage and the native store. `getStored` adopts whichever side has the
 * value (native wins on conflict); the known-games list is merged so neither
 * side loses boards, then each known game's admin token is restored. Finally
 * the public player id is computed (WebCrypto) so getPlayerId() is ready.
 * On the web this only touches localStorage and finishes immediately.
 *
 * Later writes (a new clientId, a new admin token) mirror themselves through
 * persist(), so this only has to reconcile what was there at launch.
 */
export async function hydrateIdentity(store: PersistentStore = { getStored, setStored }): Promise<void> {
  const localGames = getKnownGames();

  const clientId = await store.getStored(STORAGE_KEYS.clientId);
  if (clientId) {
    writeLocal(STORAGE_KEYS.clientId, clientId);
  } else {
    // First launch with the native store: seed it (with the existing local id, or a new one).
    const id = readLocal(STORAGE_KEYS.clientId) ?? newClientId();
    writeLocal(STORAGE_KEYS.clientId, id);
    await store.setStored(STORAGE_KEYS.clientId, id);
  }

  const profile = await store.getStored(STORAGE_KEYS.profile);
  if (profile) writeLocal(STORAGE_KEYS.profile, profile);

  let storedGames: string[] = [];
  try {
    const raw = JSON.parse((await store.getStored(STORAGE_KEYS.games)) ?? "[]") as unknown;
    if (Array.isArray(raw)) storedGames = raw.filter((x): x is string => typeof x === "string");
  } catch {
    // corrupt value: rebuild from the local list
  }
  const merged = [...new Set([...storedGames, ...localGames])].slice(0, KNOWN_GAMES_MAX);
  const mergedJson = JSON.stringify(merged);
  writeLocal(STORAGE_KEYS.games, mergedJson);
  if (mergedJson !== JSON.stringify(storedGames)) await store.setStored(STORAGE_KEYS.games, mergedJson);

  await Promise.all(
    merged.map(async (id) => {
      const key = STORAGE_KEYS.admin(id);
      const token = await store.getStored(key);
      if (token) writeLocal(key, token);
    }),
  );

  await primePlayerId();
  emit();
}
