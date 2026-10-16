import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { NavigationType, Outlet, ScrollRestoration, useLocation, useNavigate, useNavigationType } from "react-router-dom";
import { checkHostToken } from "../lib/api";
import { captureHostLink } from "../lib/identity";
import * as push from "../lib/push";
import { ShellContext, TAB_PATHS, type ShellApi } from "./shell";
import { TabBar } from "./ui/TabBar";
import { useToast } from "./ui/toastContext";

type Transition = "none" | "push" | "pop" | "fade";

const ANIMATION: Record<Transition, string> = {
  none: "",
  push: "animate-route-push",
  pop: "animate-route-pop",
  fade: "animate-route-fade",
};

function transitionFor(prev: string | null, next: string, navType: NavigationType): Transition {
  if (prev === null || prev === next) return "none";
  if (TAB_PATHS.has(prev) && TAB_PATHS.has(next)) return "fade";
  if (navType === NavigationType.Pop) return "pop";
  if (navType === NavigationType.Replace) return "fade";
  return "push";
}

/**
 * Root layout: night-stadium backdrop, the page (with a native-feeling enter
 * transition), the floating tab dock on top-level routes, and overlays.
 */
export function AppShell() {
  const location = useLocation();
  const navType = useNavigationType();
  const navigate = useNavigate();
  const toast = useToast();

  // ---- tab dock visibility ----
  const [hideCount, setHideCount] = useState(0);
  const hideTabBar = useCallback(() => {
    setHideCount((n) => n + 1);
    let done = false;
    return () => {
      if (done) return;
      done = true;
      setHideCount((n) => n - 1);
    };
  }, []);
  const tabBarVisible = TAB_PATHS.has(location.pathname) && hideCount === 0;

  useLayoutEffect(() => {
    // Pages pad their bottom with var(--shell-bottom) (pb-shell); without the dock only the home indicator needs clearing.
    const root = document.documentElement;
    if (tabBarVisible) root.style.removeProperty("--shell-bottom");
    else root.style.setProperty("--shell-bottom", "var(--safe-bottom)");
  }, [tabBarVisible]);

  const [overlayRoot, setOverlayRoot] = useState<HTMLElement | null>(null);
  const shell = useMemo<ShellApi>(() => ({ tabBarVisible, hideTabBar, overlayRoot }), [tabBarVisible, hideTabBar, overlayRoot]);

  // ---- route transition (decided once per navigation, so later re-renders don't cut it short) ----
  const lastPath = useRef<string | null>(null);
  const anim = useRef<{ key: string; transition: Transition }>({ key: "", transition: "none" });
  if (anim.current.key !== location.key) {
    anim.current = { key: location.key, transition: transitionFor(lastPath.current, location.pathname, navType) };
    lastPath.current = location.pathname;
  }
  const transition = anim.current.transition;

  // ---- host links opened inside the app (#host=<token>, or the older ?host=<token>) ----
  useEffect(() => {
    const rest = captureHostLink(location.pathname, location.search, location.hash, checkHostToken);
    if (rest !== null) navigate({ pathname: location.pathname, ...rest }, { replace: true });
  }, [location.pathname, location.search, location.hash, navigate]);

  // ---- push received while the app is open ----
  useEffect(() => {
    if (typeof push.onForegroundPush !== "function") return;
    return push.onForegroundPush((p) => {
      // The open board already shows its own live toasts.
      if (p.url && p.url === window.location.pathname) return;
      toast.show({
        title: p.title,
        description: p.body,
        tone: "live",
        action: p.url && p.url !== "/" ? { label: "View", onClick: () => navigate(p.url) } : undefined,
      });
    });
  }, [navigate, toast]);

  return (
    <ShellContext.Provider value={shell}>
      <div aria-hidden className="floodlights pointer-events-none fixed inset-0 -z-10" />
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col">
        <main
          key={location.pathname}
          id="main"
          className={`flex flex-1 flex-col pb-shell ${ANIMATION[transition]}`}
        >
          <Outlet />
        </main>
      </div>
      <TabBar hidden={!tabBarVisible} />
      <div ref={setOverlayRoot} />
      <ScrollRestoration />
    </ShellContext.Provider>
  );
}
