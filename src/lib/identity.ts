// Identity for this device (no account needed; signing in is optional).
//
// - clientId: random secret sent as `x-client-id` on every request. It is the
//   device's only credential, so it never appears in a URL, a share, the UI or
//   any server response.
// - playerId: the public id the server uses for this device in every payload
//   (Player.id, Square.playerId, Activity.actor, results), derived one-way from
//   the clientId (shared/playerId.ts). Compare against this to find "mine".
//   Signed in, the server acts as the account's canonical clientId, so the
//   public id is the account's: the server hands it over (GET /api/me, the
//   sign-in response) and it's stored here, so "mine" works offline at startup.
// - account: who this device is signed in as (shown only on this device).
// - profile: the name/color/emoji used when joining a board.
// - admin tokens: one per hosted game, sent as `x-admin-token`.
// - co-hosted boards: ids of the boards this identity co-hosts (GET /api/me,
//   accepting an invite). Only a hint to load the host tools early: a co-host
//   holds no token, the server authorizes them by clientId, and the board's
//   own state (Game.cohostIds) decides what shows (src/lib/hostRole.ts).
// - known games: ids this device created or joined (for hydration + dashboard).
// - seen games: boards this device opened without joining (an invite it hasn't
//   acted on yet), so Home can offer them back (`GET /api/me/games?seen=`).
//
// Reads are synchronous (localStorage). The native app also mirrors every value
// into Capacitor Preferences because iOS may evict a WebView's localStorage;
// `hydrateIdentity()` runs once at startup, before the first render, to copy
// values back in either direction.

import { useSyncExternalStore } from "react";
import { derivePlayerId, derivePlayerIdSync, isPlayerId } from "../../shared/playerId";
import type { AccountInfo } from "../../shared/types";
import { getStored, removeStored, setStored } from "./native";

export const STORAGE_KEYS = {
  clientId: "jaxsquares.clientId",
  profile: "jaxsquares.profile",
  games: "jaxsquares.games",
  seen: "jaxsquares.seen",
  admin: (gameId: string) => `jaxsquares.admin.${gameId}`,
  /** The server's public id for this device when it differs from the derived one (signed in): `{ for, id }`. */
  playerId: "jaxsquares.playerId",
  /** The account this device is signed in to (AccountInfo), absent when it isn't. */
  account: "jaxsquares.account",
  /** Ids of the boards this identity co-hosts (a hint for loading host tools; no token). */
  cohosts: "jaxsquares.cohosts",
  /** The Club Pass holder's club TV link, as made on this device (src/lib/club.ts): only its token's hash is on the server. */
  clubTv: "jaxsquares.clubTv",
} as const;

/** Server limit for player names (worker cleanProfile). */
export const NAME_MAX_LENGTH = 24;
const KNOWN_GAMES_MAX = 100;
/** Board codes, as the worker accepts them (GameView lowercases a typed one). */
const GAME_ID_RE = /^[a-z0-9]{4,16}$/;
/** Boards opened without joining, kept for Home (the server reads at most 50). */
export const SEEN_GAMES_MAX = 50;

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
  // Another tab changed the profile, or signed in or out.
  window.addEventListener("storage", (e) => {
    if (e.key === STORAGE_KEYS.profile || e.key === STORAGE_KEYS.account || e.key === STORAGE_KEYS.clientId || e.key === null) emit();
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

/** The public id derived from this device's own clientId. */
function ownPlayerId(): string {
  const clientId = getClientId();
  if (playerIdCache?.clientId !== clientId) playerIdCache = { clientId, playerId: derivePlayerIdSync(clientId) };
  return playerIdCache.playerId;
}

let serverIdCache: { raw: string | null; value: { for: string; id: string } | null } | null = null;

/** The stored server-confirmed public id, tied to the device id it was given for (`for` = that device's derived id). */
function serverPlayerId(): { for: string; id: string } | null {
  const raw = readLocal(STORAGE_KEYS.playerId);
  if (serverIdCache?.raw !== raw) {
    let value: { for: string; id: string } | null = null;
    try {
      const v = raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
      if (v && isPlayerId(v.for) && isPlayerId(v.id)) value = { for: v.for, id: v.id };
    } catch {
      // corrupt: ignore it, the derived id stands
    }
    serverIdCache = { raw, value };
  }
  return serverIdCache.value;
}

/**
 * This device's public player id: what GameState uses for Player.id,
 * Square.playerId, Activity.actor and results. Signed in, it's the account's
 * id as the server confirmed it (GET /api/me), kept across launches; else it's
 * derived from the clientId. Synchronous: hydrateIdentity computes the derived
 * one with WebCrypto at startup; if anything asks earlier (or the clientId
 * changed) it is derived on the spot with the same hash. A stored server id
 * only counts for the clientId it was given for.
 */
export function getPlayerId(): string {
  const own = ownPlayerId();
  const server = serverPlayerId();
  return server && server.for === own ? server.id : own;
}

/** React binding: this device's public player id, re-rendering when it changes (sign-in, sign-out). */
export function usePlayerId(): string {
  return useSyncExternalStore(subscribeIdentity, getPlayerId, getPlayerId);
}

// ---- Account (optional sign-in) ----

let accountCache: { raw: string | null; value: AccountInfo | null } | null = null;

function parseAccount(raw: string | null): AccountInfo | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Record<string, unknown>;
    if (v.provider !== "apple" && v.provider !== "google") return null;
    const providers = Array.isArray(v.providers) ? v.providers.filter((p): p is "apple" | "google" => p === "apple" || p === "google") : [];
    return {
      provider: v.provider,
      ...(providers.length > 0 ? { providers } : {}),
      email: typeof v.email === "string" ? v.email : null,
      name: typeof v.name === "string" ? v.name : null,
      since: typeof v.since === "number" ? v.since : 0,
    };
  } catch {
    return null;
  }
}

/** Who this device is signed in as, or null. Stable reference until it changes. */
export function getAccount(): AccountInfo | null {
  const raw = readLocal(STORAGE_KEYS.account);
  if (accountCache?.raw !== raw) accountCache = { raw, value: parseAccount(raw) };
  return accountCache.value;
}

export function isSignedIn(): boolean {
  return getAccount() !== null;
}

/** React binding: the account, re-rendering on sign-in and sign-out (this tab or another). */
export function useAccount(): AccountInfo | null {
  return useSyncExternalStore(subscribeIdentity, getAccount, getAccount);
}

/**
 * Stores who the server says this device is (GET /api/me, the sign-in
 * response): its public id (kept only when it differs from the derived one)
 * and its account. Returns true when either changed.
 */
export function setServerIdentity(playerId: string, account: AccountInfo | null): boolean {
  const beforeId = getPlayerId();
  const beforeAccount = readLocal(STORAGE_KEYS.account);
  const own = ownPlayerId();
  if (isPlayerId(playerId) && playerId !== own) persist(STORAGE_KEYS.playerId, JSON.stringify({ for: own, id: playerId }));
  else if (readLocal(STORAGE_KEYS.playerId) !== null) unpersist(STORAGE_KEYS.playerId);
  const nextAccount = account ? JSON.stringify(account) : null;
  if (nextAccount) {
    if (nextAccount !== beforeAccount) persist(STORAGE_KEYS.account, nextAccount);
  } else if (beforeAccount !== null) {
    unpersist(STORAGE_KEYS.account);
  }
  const changed = beforeId !== getPlayerId() || beforeAccount !== nextAccount;
  if (changed) emit();
  return changed;
}

/** Keys in localStorage starting with `prefix` (admin tokens kept for boards no longer listed, say). */
function localKeysWith(prefix: string): string[] {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(prefix)) keys.push(key);
    }
    return keys;
  } catch {
    return [...memory.keys()].filter((k) => k.startsWith(prefix));
  }
}

/**
 * Signing out: the device starts fresh. A new clientId, and the stored player
 * id, account, profile, known boards with their admin tokens and the seen list
 * are gone (here and in the native store). Device settings (theme, push
 * on/off) stay.
 */
export function wipeIdentity(): void {
  for (const id of getKnownGames()) unpersist(STORAGE_KEYS.admin(id));
  for (const key of localKeysWith(STORAGE_KEYS.admin(""))) unpersist(key);
  for (const key of [STORAGE_KEYS.games, STORAGE_KEYS.seen, STORAGE_KEYS.profile, STORAGE_KEYS.playerId, STORAGE_KEYS.account, STORAGE_KEYS.cohosts, STORAGE_KEYS.clubTv]) {
    unpersist(key);
  }
  linkTokens.clear();
  persist(STORAGE_KEYS.clientId, newClientId());
  playerIdCache = null;
  emit();
  for (const l of seenListeners) l();
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

/** A stored list of board ids ([] when missing or corrupt). */
function readIds(key: string): string[] {
  try {
    const v = JSON.parse(readLocal(key) ?? "[]") as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function getKnownGames(): string[] {
  return readIds(STORAGE_KEYS.games);
}

/** Most recent first, de-duplicated. */
export function rememberGame(gameId: string): void {
  const list = [gameId, ...getKnownGames().filter((id) => id !== gameId)].slice(0, KNOWN_GAMES_MAX);
  persist(STORAGE_KEYS.games, JSON.stringify(list));
}

export function forgetGame(gameId: string): void {
  persist(STORAGE_KEYS.games, JSON.stringify(getKnownGames().filter((id) => id !== gameId)));
  unpersist(STORAGE_KEYS.admin(gameId));
  linkTokens.delete(gameId);
}

// ---- Seen games (opened from an invite, not joined) ----

const seenListeners = new Set<() => void>();
let seenCache: { raw: string | null; ids: readonly string[] } | null = null;

/** Boards this device opened without joining or hosting, most recent first. */
export function getSeenGames(): string[] {
  return readIds(STORAGE_KEYS.seen).filter((id) => GAME_ID_RE.test(id));
}

function writeSeen(list: string[]): void {
  persist(STORAGE_KEYS.seen, JSON.stringify(list));
  for (const l of seenListeners) l();
}

/** Most recent first, de-duplicated, capped at SEEN_GAMES_MAX (the oldest fall off). */
export function rememberSeen(gameId: string): void {
  if (!GAME_ID_RE.test(gameId)) return;
  const current = getSeenGames();
  if (current[0] === gameId) return;
  writeSeen([gameId, ...current.filter((id) => id !== gameId)].slice(0, SEEN_GAMES_MAX));
}

/** Drops boards from the seen list (hidden from Home, joined, finished or gone). */
export function forgetSeen(gameIds: string | readonly string[]): void {
  const drop = new Set(typeof gameIds === "string" ? [gameIds] : gameIds);
  const current = getSeenGames();
  const list = current.filter((id) => !drop.has(id));
  if (list.length !== current.length) writeSeen(list);
}

function seenSnapshot(): readonly string[] {
  const raw = readLocal(STORAGE_KEYS.seen);
  if (seenCache?.raw !== raw) seenCache = { raw, ids: getSeenGames() };
  return seenCache.ids;
}

function subscribeSeen(listener: () => void): () => void {
  seenListeners.add(listener);
  return () => seenListeners.delete(listener);
}

/** React binding: the seen list, re-rendering when a board is remembered or forgotten here. */
export function useSeenGames(): readonly string[] {
  return useSyncExternalStore(subscribeSeen, seenSnapshot, seenSnapshot);
}

// ---- Host (admin) tokens ----

export function saveAdminToken(gameId: string, token: string): void {
  persist(STORAGE_KEYS.admin(gameId), token);
  rememberGame(gameId);
}

/**
 * Stores the admin tokens the server says this identity holds (GET /api/me):
 * real board codes only, overwriting a different token held here (the
 * server's is authoritative, unlike a host link's). Notifies once; returns how
 * many changed.
 */
export function saveAdminTokens(tokens: Record<string, string>): number {
  let changed = 0;
  for (const [gameId, token] of Object.entries(tokens)) {
    if (!GAME_ID_RE.test(gameId) || typeof token !== "string" || !token || getAdminToken(gameId) === token) continue;
    saveAdminToken(gameId, token);
    linkTokens.delete(gameId);
    changed++;
  }
  if (changed > 0) emit();
  return changed;
}

export function getAdminToken(gameId: string): string | null {
  return readLocal(STORAGE_KEYS.admin(gameId));
}

/**
 * A season's game board shares its season board's admin token (the server
 * makes it so): a device that hosts the season takes the token for the game
 * when it opens it, so the host tools show there too. Never overwrites a token
 * already held. Returns whether it took one.
 */
export function adoptSeasonToken(gameId: string, seasonId: string): boolean {
  if (!GAME_ID_RE.test(gameId) || !GAME_ID_RE.test(seasonId) || getAdminToken(gameId) !== null) return false;
  const token = getAdminToken(seasonId);
  if (!token) return false;
  persist(STORAGE_KEYS.admin(gameId), token);
  emit();
  return true;
}

export function isHostOf(gameId: string): boolean {
  return getAdminToken(gameId) !== null;
}

// ---- Co-hosted boards (a hint; see the top of this file) ----

/** Most co-hosted board ids kept (GET /api/me sends up to 200). */
const COHOST_GAMES_MAX = 200;

/** Boards this identity co-hosts, as far as this device knows. */
export function getCohostGames(): string[] {
  return readIds(STORAGE_KEYS.cohosts).filter((id) => GAME_ID_RE.test(id));
}

/** Whether this device knows it co-hosts `gameId` (load the host tools early; the board's state decides). */
export function isCohostGame(gameId: string): boolean {
  return getCohostGames().includes(gameId);
}

/** The server's list (GET /api/me): replaces what's held. Returns true when it changed. */
export function setCohostGames(ids: readonly string[]): boolean {
  const next = JSON.stringify([...new Set(ids.filter((id) => GAME_ID_RE.test(id)))].slice(0, COHOST_GAMES_MAX));
  if ((readLocal(STORAGE_KEYS.cohosts) ?? "[]") === next) return false;
  persist(STORAGE_KEYS.cohosts, next);
  return true;
}

/** Accepted a co-host invite (it's also a known board now), or stopped co-hosting one. */
export function rememberCohost(gameId: string, cohosting: boolean): void {
  const rest = getCohostGames().filter((id) => id !== gameId);
  setCohostGames(cohosting ? [gameId, ...rest] : rest);
  if (cohosting) rememberGame(gameId);
}

const HOST_PARAM = "host";
const GAME_PATH_RE = /^\/g\/([^/?#]+)\/?/;

/** `host` from a `?a=b` search or `#a=b` fragment. */
function hostParam(part: string): string | null {
  return new URLSearchParams(part.replace(/^[?#]/, "")).get(HOST_PARAM)?.trim() || null;
}

/** `part` (a search or fragment) without its `host` param; left as is when it has none. */
function withoutHost(part: string, lead: "?" | "#"): string {
  const params = new URLSearchParams(part.replace(/^[?#]/, ""));
  if (!params.has(HOST_PARAM)) return part;
  params.delete(HOST_PARAM);
  const rest = params.toString();
  return rest ? `${lead}${rest}` : "";
}

/**
 * Reads a host link: `/g/<id>#host=<token>`, or the older `/g/<id>?host=<token>`
 * (still accepted; the fragment form never reaches the server or its logs).
 * Returns null when the URL isn't one, including a malformed or non-board id,
 * so a crafted link can't throw on startup or store a token under a junk key.
 */
export function parseHostLink(pathname: string, search: string, hash = ""): { gameId: string; token: string } | null {
  const m = GAME_PATH_RE.exec(pathname);
  if (!m) return null;
  const token = hostParam(hash) ?? hostParam(search);
  if (!token) return null;
  let gameId: string;
  try {
    gameId = decodeURIComponent(m[1]).toLowerCase();
  } catch {
    return null;
  }
  return GAME_ID_RE.test(gameId) ? { gameId, token } : null;
}

/**
 * Host-link tokens not adopted because this device already holds a different
 * one for that board (see captureHostLink). Unverified; memory only.
 */
const linkTokens = new Map<string, string>();

/**
 * Asks the server whether `token` is the board's host token: true or false once
 * it has answered, null when it couldn't be asked (offline). `checkHostToken`
 * in api.ts.
 */
export type HostTokenCheck = (gameId: string, token: string) => Promise<boolean | null>;

/**
 * Saves the admin token from a host link so the host can manage the board from
 * another device. Returns the search and fragment with the token removed (the
 * caller replaces the URL so the token doesn't linger in history), or null if
 * the URL wasn't a host link.
 *
 * A token this device already holds is never overwritten: anyone with the
 * invite can craft `#host=x` (or a link gets truncated), and the server can't
 * hand the real token out again. A different token from a link is only kept
 * aside; the API client tries it if the held one is refused and adopts it once
 * it has worked (settleLinkAdminToken). On a device holding none, the token is
 * used at once (so the host's tools show straight away) and `check`ed: one the
 * server refuses is dropped again, so a crafted link can't dress a player's
 * device up as the host. While hydrateIdentity is still restoring tokens from
 * the native store, this waits for it, so a held token is always seen.
 */
export function captureHostLink(
  pathname: string,
  search: string,
  hash = "",
  check?: HostTokenCheck,
): { search: string; hash: string } | null {
  const link = parseHostLink(pathname, search, hash);
  if (!link) return null;
  const { gameId, token } = link;
  const adopt = () => {
    const held = getAdminToken(gameId);
    if (held !== null) {
      if (held !== token) linkTokens.set(gameId, token);
      return;
    }
    saveAdminToken(gameId, token);
    emit();
    void check?.(gameId, token).then(
      (ok) => {
        if (ok === false && getAdminToken(gameId) === token) {
          unpersist(STORAGE_KEYS.admin(gameId));
          emit();
        }
      },
      () => {},
    );
  };
  if (hydrating) void hydrating.then(adopt);
  else adopt();
  return { search: withoutHost(search, "?"), hash: withoutHost(hash, "#") };
}

/** The token a host link offered for `gameId` that differs from the one held here (unverified), if any. */
export function linkAdminToken(gameId: string): string | null {
  return linkTokens.get(gameId) ?? null;
}

/** The server has answered for a host link's token: adopt it if it worked, else drop it. */
export function settleLinkAdminToken(gameId: string, worked: boolean): void {
  const token = linkTokens.get(gameId);
  linkTokens.delete(gameId);
  if (worked && token) saveAdminToken(gameId, token);
}

/**
 * The link a host can open on another device to manage `gameId`. Null when this
 * device isn't the host. The token rides in the fragment, which browsers never
 * send, so it stays out of the Worker's request logs.
 */
export function hostLinkUrl(gameId: string, origin: string): string | null {
  const token = getAdminToken(gameId);
  if (!token) return null;
  return `${origin}/g/${encodeURIComponent(gameId)}#${HOST_PARAM}=${encodeURIComponent(token)}`;
}

/** React binding: this device's admin token for `gameId`, re-rendering when it changes (e.g. a refused host-link token is dropped). */
export function useAdminToken(gameId: string | undefined): string | null {
  const get = () => (gameId ? getAdminToken(gameId) : null);
  return useSyncExternalStore(subscribeIdentity, get, get);
}

// ---- Native hydration ----

export interface PersistentStore {
  getStored(key: string): Promise<string | null>;
  setStored(key: string, value: string): Promise<void>;
}

/**
 * Startup step (await before the first render): mirrors identity between
 * localStorage and the native store (the clientId, profile, server player id
 * and account). `getStored` adopts whichever side has the
 * value (native wins on conflict); the known-games and seen-games lists are
 * merged so neither side loses boards, then each known game's admin token is
 * restored. Finally
 * the public player id is computed (WebCrypto) so getPlayerId() is ready.
 * On the web this only touches localStorage and finishes immediately.
 *
 * Later writes (a new clientId, a new admin token) mirror themselves through
 * persist(), so this only has to reconcile what was there at launch.
 */
export function hydrateIdentity(store: PersistentStore = { getStored, setStored }): Promise<void> {
  const run = hydrateFrom(store);
  const settled: Promise<void> = run.then(
    () => clearHydrating(settled),
    () => clearHydrating(settled),
  );
  hydrating = settled;
  return run;
}

/** Set while hydrateIdentity runs (main.tsx renders without waiting past a timeout); captureHostLink waits on it. */
let hydrating: Promise<void> | null = null;

function clearHydrating(p: Promise<void>): void {
  if (hydrating === p) hydrating = null;
}

/**
 * Merges an id list kept on both sides (native first, so its order wins), writes
 * the result locally and back to the native store if it changed, and returns it.
 */
async function mergeIds(store: PersistentStore, key: string, local: string[], max: number): Promise<string[]> {
  let stored: string[] = [];
  try {
    const raw = JSON.parse((await store.getStored(key)) ?? "[]") as unknown;
    if (Array.isArray(raw)) stored = raw.filter((x): x is string => typeof x === "string");
  } catch {
    // corrupt value: rebuild from the local list
  }
  const merged = [...new Set([...stored, ...local])].slice(0, max);
  const json = JSON.stringify(merged);
  writeLocal(key, json);
  if (json !== JSON.stringify(stored)) await store.setStored(key, json);
  return merged;
}

async function hydrateFrom(store: PersistentStore): Promise<void> {
  const localGames = getKnownGames();
  const localSeen = getSeenGames();

  const clientId = await store.getStored(STORAGE_KEYS.clientId);
  if (clientId) {
    writeLocal(STORAGE_KEYS.clientId, clientId);
  } else {
    // First launch with the native store: seed it (with the existing local id, or a new one).
    const id = readLocal(STORAGE_KEYS.clientId) ?? newClientId();
    writeLocal(STORAGE_KEYS.clientId, id);
    await store.setStored(STORAGE_KEYS.clientId, id);
  }

  // The profile, the server-confirmed player id and account when signed in, and the co-hosted boards.
  for (const key of [STORAGE_KEYS.profile, STORAGE_KEYS.playerId, STORAGE_KEYS.account, STORAGE_KEYS.cohosts]) {
    const value = await store.getStored(key);
    if (value) writeLocal(key, value);
  }

  const merged = await mergeIds(store, STORAGE_KEYS.games, localGames, KNOWN_GAMES_MAX);
  await mergeIds(store, STORAGE_KEYS.seen, localSeen, SEEN_GAMES_MAX);

  await Promise.all(
    merged.map(async (id) => {
      const key = STORAGE_KEYS.admin(id);
      const token = await store.getStored(key);
      if (token) writeLocal(key, token);
    }),
  );

  await primePlayerId();
  emit();
  for (const l of seenListeners) l();
}
