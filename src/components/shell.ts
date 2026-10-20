// Shell context: lets a page hide the tab dock and gives fixed bars a place to
// render outside the animated route container.

import { createContext, useContext, useEffect } from "react";

export interface ShellApi {
  /** The tab dock is on screen. */
  tabBarVisible: boolean;
  /** Hide the tab dock until the returned function is called. */
  hideTabBar: () => () => void;
  /** Container for fixed overlays (ActionBar) that must not move with route transitions. */
  overlayRoot: HTMLElement | null;
}

export const ShellContext = createContext<ShellApi>({
  tabBarVisible: false,
  hideTabBar: () => () => {},
  overlayRoot: null,
});

export function useShell(): ShellApi {
  return useContext(ShellContext);
}

/** Hide the tab dock while the calling component is mounted (e.g. a full-screen flow). */
export function useHideTabBar(hidden = true): void {
  const { hideTabBar } = useShell();
  useEffect(() => (hidden ? hideTabBar() : undefined), [hidden, hideTabBar]);
}

/** Routes that show the tab dock. */
export const TAB_PATHS: ReadonlySet<string> = new Set(["/", "/new", "/me"]);
