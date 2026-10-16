import { createBrowserRouter, RouterProvider, type RouteObject } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { ToastProvider } from "./components/ui/Toast";
import CreateGame from "./pages/CreateGame";
import GameView from "./pages/GameView";
import Home from "./pages/Home";
import NotFound from "./pages/NotFound";
import Privacy from "./pages/Privacy";
import Profile from "./pages/Profile";
import RouteError from "./pages/RouteError";
import Terms from "./pages/Terms";

export const routes: RouteObject[] = [
  {
    path: "/",
    element: <AppShell />,
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
