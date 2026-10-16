import "@fontsource-variable/figtree";
import "@fontsource-variable/bricolage-grotesque/opsz.css";
import "./index.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App, { createAppRouter } from "./App";
import { captureHostLink, hydrateIdentity } from "./lib/identity";
import { initPush } from "./lib/push";

/** Never hold the first paint hostage to the native store. */
const HYDRATE_TIMEOUT_MS = 1500;

async function start(): Promise<void> {
  // Opened from a host link: keep the token, then drop it from the address bar.
  const rest = captureHostLink(location.pathname, location.search);
  if (rest !== null) history.replaceState(history.state, "", `${location.pathname}${rest}${location.hash}`);

  // Restore the device id, profile and host tokens from the native store before anything reads them.
  await Promise.race([
    hydrateIdentity().catch((err: unknown) => console.warn("identity hydrate failed", err)),
    new Promise((resolve) => setTimeout(resolve, HYDRATE_TIMEOUT_MS)),
  ]);

  // Deep links, notification taps and App Store recovery are wired inside the router (LaunchHooks in App.tsx).
  const router = createAppRouter();
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App router={router} />
    </StrictMode>,
  );

  // Service worker (web) or FCM listeners (app), then a silent re-sync. Needs the device id, so after hydration.
  try {
    initPush();
  } catch (err) {
    console.warn("push init failed", err);
  }
}

void start();
