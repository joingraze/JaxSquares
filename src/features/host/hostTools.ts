// Host tools (HostControls, its sheets and the number reveal) are their own chunk: only the host's
// device ever needs them. The board (src/pages/GameView.tsx) loads them as soon as it knows this
// device holds the host token, and the app prefetches them in the background (prefetchScreens in
// src/App.tsx) so a freshly created board opens with its tools straight away.

import type { HostControls as HostControlsComponent } from "./HostControls";

/** The loaded component, or null until loadHostTools() has finished. */
export let HostControls: typeof HostControlsComponent | null = null;

let loading: Promise<void> | null = null;

/** Starts (or joins) loading the host tools chunk. A failed load can be retried. */
export function loadHostTools(): Promise<void> {
  loading ??= import("./HostControls").then(
    (m) => {
      HostControls = m.HostControls;
    },
    (err: unknown) => {
      loading = null;
      throw err;
    },
  );
  return loading;
}
