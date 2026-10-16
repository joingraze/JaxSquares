import "@fontsource-variable/figtree";
import "@fontsource-variable/bricolage-grotesque/opsz.css";
import "./index.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App, { createAppRouter } from "./App";
import { captureHostLink, hydrateIdentity } from "./lib/identity";
import * as native from "./lib/native";
import * as push from "./lib/push";

/** Never hold the first paint hostage to the native store. */
const HYDRATE_TIMEOUT_MS = 1500;

/** Startup hooks owned by other modules: call them only if they're exported. */
function optional<T>(mod: object, name: string): T | null {
  const fn = (mod as Record<string, unknown>)[name];
  return typeof fn === "function" ? (fn as T) : null;
}

async function start(): Promise<void> {
  // Opened from a host link: keep the token, then drop it from the address bar.
  const rest = captureHostLink(location.pathname, location.search);
  if (rest !== null) history.replaceState(history.state, "", `${location.pathname}${rest}${location.hash}`);

  // Restore the device id, profile and host tokens from the native store before anything reads them.
  await Promise.race([
    hydrateIdentity().catch((err: unknown) => console.warn("identity hydrate failed", err)),
    new Promise((resolve) => setTimeout(resolve, HYDRATE_TIMEOUT_MS)),
  ]);

  const router = createAppRouter();
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App router={router} />
    </StrictMode>,
  );

  const navigate = (path: string) => void router.navigate(path);

  optional<(opts: { navigate: (path: string) => void }) => unknown>(native, "initNative")?.({ navigate });

  const registerServiceWorker = optional<() => Promise<void>>(push, "registerServiceWorker");
  void registerServiceWorker?.().catch(() => {});
  optional<() => void>(push, "initPush")?.();
  optional<(cb: (url: string) => void) => unknown>(push, "onNotificationTap")?.(navigate);
}

void start();
