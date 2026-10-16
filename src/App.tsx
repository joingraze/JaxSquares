import { useEffect, useRef } from "react";
import { createBrowserRouter, RouterProvider, useNavigate, type RouteObject } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { ToastProvider } from "./components/ui/Toast";
import { useToast } from "./components/ui/toastContext";
import { getAdminToken } from "./lib/identity";
import { initNative, platform } from "./lib/native";
import { onNotificationTap } from "./lib/push";
import CreateGame from "./pages/CreateGame";
import GameView from "./pages/GameView";
import Home from "./pages/Home";
import NotFound from "./pages/NotFound";
import Privacy from "./pages/Privacy";
import Profile from "./pages/Profile";
import RouteError from "./pages/RouteError";
import Support from "./pages/Support";
import Terms from "./pages/Terms";

let iapRecoveryStarted = false;

/**
 * Launch wiring that needs the router: universal / jaxsquares:// links and the
 * splash hand-off (initNative), notification taps, and finishing App Store
 * purchases that were charged but never confirmed. Renders nothing.
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
    if (platform() !== "ios" || iapRecoveryStarted) return;
    iapRecoveryStarted = true;
    // Loaded on demand so the web bundle never carries the IAP path.
    void import("./lib/checkout")
      .then(({ recoverIAPPurchases }) => recoverIAPPurchases((gameId) => getAdminToken(gameId)))
      .then((opened) => {
        for (const { game } of opened) {
          toast.show({
            tone: "success",
            title: "Your board is open",
            description: `${game.name} is ready for squares. Send the link to your crew.`,
            action: { label: "Open", onClick: () => void navigateRef.current(`/g/${game.id}`) },
          });
        }
      })
      .catch((err: unknown) => console.warn("App Store purchase recovery failed", err));
  }, [toast]);

  return null;
}

export const routes: RouteObject[] = [
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
          { index: true, element: <Home /> },
          { path: "new", element: <CreateGame /> },
          { path: "g/:id", element: <GameView /> },
          { path: "me", element: <Profile /> },
          { path: "privacy", element: <Privacy /> },
          { path: "terms", element: <Terms /> },
          { path: "support", element: <Support /> },
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

export function createAppRouter() {
  return createBrowserRouter(routes, {
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
