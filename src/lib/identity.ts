// Lightweight, account-free identity. A stable per-device clientId lets a user
// recognize their own squares; admin tokens are stored per game so a creator
// keeps management rights without logging in.

const CLIENT_ID_KEY = "jaxsquares.clientId";
const NAME_KEY = "jaxsquares.playerName";
const COLOR_KEY = "jaxsquares.playerColor";
const ADMIN_KEY = (gameId: string) => `jaxsquares.admin.${gameId}`;

export const PLAYER_COLORS = [
  "#38bdf8",
  "#22c55e",
  "#f59e0b",
  "#f472b6",
  "#a78bfa",
  "#fb7185",
  "#2dd4bf",
  "#facc15",
];

export function getClientId(): string {
  let id = localStorage.getItem(CLIENT_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(CLIENT_ID_KEY, id);
  }
  return id;
}

export function getPlayerName(): string {
  return localStorage.getItem(NAME_KEY) ?? "";
}

export function setPlayerName(name: string): void {
  localStorage.setItem(NAME_KEY, name);
}

export function getPlayerColor(): string {
  const stored = localStorage.getItem(COLOR_KEY);
  if (stored) return stored;
  // Pick a deterministic-ish default from the device id so it's stable.
  const id = getClientId();
  const idx = id.charCodeAt(0) % PLAYER_COLORS.length;
  const color = PLAYER_COLORS[idx];
  localStorage.setItem(COLOR_KEY, color);
  return color;
}

export function setPlayerColor(color: string): void {
  localStorage.setItem(COLOR_KEY, color);
}

export function saveAdminToken(gameId: string, token: string): void {
  localStorage.setItem(ADMIN_KEY(gameId), token);
}

export function getAdminToken(gameId: string): string | null {
  return localStorage.getItem(ADMIN_KEY(gameId));
}
