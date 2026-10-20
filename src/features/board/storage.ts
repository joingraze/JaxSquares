// Small per-device flags for the board screen (celebrations already shown).
// localStorage only; failures are ignored. (The notifications ask remembers
// its own dismissals per trigger: features/notifications/prefs.ts.)

const CELEBRATED = (gameId: string) => `jaxsquares.celebrated.${gameId}`;

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // private mode / storage full: the worst case is a repeat celebration
  }
}

export function celebratedWins(gameId: string): Set<string> {
  try {
    const v = JSON.parse(read(CELEBRATED(gameId)) ?? "[]") as unknown;
    return new Set(Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

export function markCelebrated(gameId: string, ids: string[]): void {
  const all = celebratedWins(gameId);
  for (const id of ids) all.add(id);
  write(CELEBRATED(gameId), JSON.stringify([...all]));
}
