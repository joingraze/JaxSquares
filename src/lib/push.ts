// STUB — owned by the push builder. Client-side push registration.
export type PushState = "unsupported" | "default" | "granted" | "denied";

/** Register the service worker (web only). Safe to call on every load. */
export async function registerServiceWorker(): Promise<void> {}

export async function getPushState(): Promise<PushState> {
  return "unsupported";
}

/** Ask for permission (from a user gesture) and register this device. */
export async function enablePush(): Promise<PushState> {
  return "unsupported";
}
