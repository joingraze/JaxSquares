// The venue name this device last made a venue's board under: the next one
// starts with it (a convenience; it never leaves the device, and the host's
// own name elsewhere stays theirs). localStorage can be missing or full.

const KEY = "jaxsquares.venueName";

export function rememberedVenueName(): string {
  try {
    return localStorage.getItem(KEY)?.slice(0, 24) ?? "";
  } catch {
    return "";
  }
}

export function rememberVenueName(name: string): void {
  try {
    if (name.trim()) localStorage.setItem(KEY, name.trim());
  } catch {
    // storage unavailable: the next board just asks again
  }
}
