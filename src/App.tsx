import { useEffect, useRef, type ComponentType } from "react";
import { createBrowserRouter, matchRoutes, RouterProvider, useNavigate, type RouteObject } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { ToastProvider } from "./components/ui/Toast";
import { useToast } from "./components/ui/toastContext";
import { loadHostTools } from "./features/host/hostTools";
import { getAdminToken } from "./lib/identity";
import { initNative, onAppResume, platform } from "./lib/native";
import { onNotificationTap } from "./lib/push";
import { setHostPassState } from "./lib/hostPassStore";
import NotFound from "./pages/NotFound";
import RouteError from "./pages/RouteError";

let iapWatchStarted = false;

// Each screen is its own chunk, so an invite link only downloads the board (and Home only the
// dashboard). index.html starts fetching the opened URL's chunk alongside the main bundle
// (routePreload in vite.config.ts: keep its route table in sync with the paths below), main.tsx
// waits for it (preloadScreen) so the first render already has the screen, and the other screens
// are fetched once the first one has settled (prefetchScreens) so moving between them stays instant.
type PageModule = { default: ComponentType };
const screens = {
  home: () => import("./pages/Home"),
  create: () => import("./pages/CreateGame"),
  game: () => import("./pages/GameView"),
  profile: () => import("./pages/Profile"),
  privacy: () => import("./pages/Privacy"),
  terms: () => import("./pages/Terms"),
  support: () => import("./pages/Support"),
} satisfies Record<string, () => Promise<PageModule>>;
type Screen = keyof typeof screens;
const isScreen = (id: string | undefined): id is Screen => !!id && Object.prototype.hasOwnProperty.call(screens, id);

const loadedScreens = new Map<Screen, ComponentType>();
function loadScreen(key: Screen): Promise<ComponentType> {
  return screens[key]().then((m: PageModule) => {
    loadedScreens.set(key, m.default);
    return m.default;
  });
}

/** A screen's route: its component when already loaded (no lazy step before the first render), else lazy. */
function screen(key: Screen): Pick<RouteObject, "id" | "Component" | "lazy"> {
  const Component = loadedScreens.get(key);
  return Component ? { id: key, Component } : { id: key, lazy: async () => ({ Component: await loadScreen(key) }) };
}

/** Load the screen for this path (before creating the router). Never rejects: a failed chunk is retried lazily. */
export async function preloadScreen(pathname: string): Promise<void> {
  try {
    const matches = matchRoutes(appRoutes(), pathname) ?? [];
    const id = matches[matches.length - 1]?.route.id;
    if (isScreen(id)) await loadScreen(id);
  } catch {
    // the router loads it lazily instead
  }
}

let prefetchStarted = false;

/**
 * Fetch the main screens (and the host tools a new board opens with) in the background, after the
 * first screen is up, so moving between them never waits on the network.
 */
export function prefetchScreens(): void {
  if (prefetchStarted) return;
  prefetchStarted = true;
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  if (conn?.saveData) return;
  for (const key of ["home", "game", "create", "profile"] as const) void loadScreen(key).catch(() => undefined);
  void loadHostTools().catch(() => undefined);
}

/**
 * Launch wiring that needs the router: universal / jaxsquares:// links and the
 * splash hand-off (initNative), notification taps, and finishing App Store
 * purchases (charged but never confirmed, or approved after Ask to Buy) at
 * launch, on resume and as StoreKit delivers them. Renders nothing.
 */
function LaunchHooks() {
  const navigate = useNavigate();
  const toast = useToast();
  // The native listeners outlive renders; they always reach the current navigate through this ref.
  const navigateRef = useRef(navigate);
  useEffect(() => {
    navigateRef.current = navigate;
  }, [navigate]);

  useEffect(() => {
    const go = (path: string) => void navigateRef.current(path);
    const stopNative = initNative({ navigate: go });
    const stopTaps = onNotificationTap(go);
    return () => {
      stopNative();
      stopTaps();
    };
  }, []);

  useEffect(() => {
    if (platform() !== "ios" || iapWatchStarted) return;
    iapWatchStarted = true;
    // Loaded on demand so the web bundle never carries the IAP path. Runs for the life of the app.
    void import("./lib/checkout")
      .then(({ watchIAPPurchases }) =>
        watchIAPPurchases({
          adminTokenFor: (gameId) => getAdminToken(gameId),
          onResume: onAppResume,
          // A host fee confirmed later (the app closed mid-purchase, or Ask to Buy was approved).
          onPaid: ({ game }) => {
            const drawing = game.status === "open";
            toast.show({
              tone: "success",
              title: "Payment confirmed",
              description: drawing
                ? `${game.name} is paid for. Draw the numbers whenever you're ready.`
                : `${game.name} is paid for.`,
              action: { label: drawing ? "Draw" : "Open", onClick: () => void navigateRef.current(`/g/${game.id}${drawing ? "?draw=1" : ""}`) },
            });
          },
          onUnused: (message) => toast.show({ title: "That purchase wasn't needed", description: message, duration: 0 }),
          // A Host Pass purchase confirmed later, or a renewal: the pass as the server now has it.
          onPass: (state) => setHostPassState(state),
        }),
      )
      .catch((err: unknown) => console.warn("App Store purchase watch failed", err));
  }, [toast]);

  return null;
}

export function appRoutes(): RouteObject[] {
  return [
    {
      path: "/",
      element: (
        <>
          <LaunchHooks />
          <AppShell />
        </>
      ),
      errorElement: <RouteError />,
      // The SPA renders on the client only; nothing to show while a lazy route loads.
      HydrateFallback: () => null,
      children: [
        {
          // Pathless layout so a page that throws renders its error inside the shell.
          errorElement: <RouteError />,
          children: [
            { index: true, ...screen("home") },
            { path: "new", ...screen("create") },
            { path: "g/:id", ...screen("game") },
            { path: "me", ...screen("profile") },
            { path: "privacy", ...screen("privacy") },
            { path: "terms", ...screen("terms") },
            { path: "support", ...screen("support") },
            // Component gallery for building screens; dev server only.
            ...(import.meta.env.DEV
              ? [{ path: "kit", lazy: async () => ({ Component: (await import("./pages/Kit")).default }) }]
              : []),
            { path: "*", element: <NotFound /> },
          ],
        },
      ],
    },
  ];
}

export function createAppRouter() {
  return createBrowserRouter(appRoutes(), {
    future: {
      v7_relativeSplatPath: true,
      v7_fetcherPersist: true,
      v7_normalizeFormMethod: true,
      v7_partialHydration: true,
      v7_skipActionErrorRevalidation: true,
    },
  });
}

export type AppRouter = ReturnType<typeof createAppRouter>;

export default function App({ router }: { router: AppRouter }) {
  return (
    <ToastProvider>
      <RouterProvider router={router} future={{ v7_startTransition: true }} />
    </ToastProvider>
  );
}
