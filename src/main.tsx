import "@fontsource-variable/figtree";
import "@fontsource-variable/bricolage-grotesque/opsz.css";
import "./index.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App, { createAppRouter, prefetchScreens, preloadScreen } from "./App";
import { loadHostTools } from "./features/host/hostTools";
import { checkHostToken } from "./lib/api";
import { captureHostLink, getAdminToken, hydrateIdentity, isCohostGame } from "./lib/identity";
import { isNative } from "./lib/native";
import { initPush } from "./lib/push";
import { initTheme } from "./lib/theme";
import { isTvBrowser } from "../shared/tvBrowser";

/** Never hold the first paint hostage to the native store. */
const HYDRATE_TIMEOUT_MS = 1500;
/**
 * Background work waits this long after the page has loaded (and then for an idle moment), so it
 * doesn't compete with the first screen's data, fonts and sheets on a slow connection.
 */
const SETTLE_MS = { push: 1500, me: 1000, prefetch: 3000 };

/** Run once the page has loaded, the delay has passed and the main thread is idle. */
function afterSettle(fn: () => void, delay: number): void {
  const idle = (cb: () => void) =>
    "requestIdleCallback" in window ? requestIdleCallback(cb, { timeout: 2000 }) : setTimeout(cb, 0);
  const go = () => setTimeout(() => idle(fn), delay);
  if (document.readyState === "complete") go();
  else addEventListener("load", go, { once: true });
}

/** Push wiring (service worker or FCM listeners, then a silent re-sync). Needs the device id, so after hydration. */
function startPush(): void {
  try {
    initPush();
  } catch (err) {
    console.warn("push init failed", err);
  }
}

async function start(): Promise<void> {
  // index.html already painted the saved theme; this keeps it in step (OS changes, the native store).
  initTheme();

  // A smart TV opening the home page gets the pairing page: a code to send a board to it (src/pages/TvPair.tsx).
  if (location.pathname === "/" && isTvBrowser(navigator.userAgent)) history.replaceState(history.state, "", "/tv");

  // The opened screen's chunk (index.html already started downloading it): ready before the router
  // is created, so the first render shows the screen instead of waiting a round for a lazy route.
  const screenReady = preloadScreen(location.pathname);

  // Restore the device id, profile and host tokens from the native store before anything reads them.
  await Promise.race([
    hydrateIdentity().catch((err: unknown) => console.warn("identity hydrate failed", err)),
    new Promise((resolve) => setTimeout(resolve, HYDRATE_TIMEOUT_MS)),
  ]);

  // Opened from a host link: keep the token, then drop it from the address bar. After hydration (it
  // waits for it past the timeout), so a token this device already holds, maybe only in the native
  // store, is seen and never overwritten.
  const rest = captureHostLink(location.pathname, location.search, location.hash, checkHostToken);
  if (rest !== null) history.replaceState(history.state, "", `${location.pathname}${rest.search}${rest.hash}`);

  // The host (or a co-host) opening the board: its host tools load alongside the board's chunk and data.
  const board = /^\/g\/([^/]+)\/?$/i.exec(location.pathname);
  const boardId = board?.[1].toLowerCase();
  if (boardId && (getAdminToken(boardId) || isCohostGame(boardId))) void loadHostTools().catch(() => undefined);

  await screenReady;

  // Deep links, notification taps and App Store recovery are wired inside the router (LaunchHooks in App.tsx).
  const router = createAppRouter();
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App router={router} />
    </StrictMode>,
  );

  // In the app, notification listeners go up right away (a tap may have launched it). On the web the
  // service worker and VAPID key wait until the first screen is up: nothing on it needs them.
  if (isNative()) startPush();
  else afterSettle(startPush, SETTLE_MS.push);

  // Who the server says this device is (GET /api/me): the account's player id and host tokens when
  // signed in, its own boards' host tokens otherwise. The stored id already covers "mine" until then.
  afterSettle(() => void import("./lib/auth").then((m) => m.refreshMe()).catch(() => undefined), SETTLE_MS.me);

  // Then the other screens (and host tools), so moving between them never waits on the network.
  afterSettle(prefetchScreens, SETTLE_MS.prefetch);
}

void start();
