// This device's notification status for UI: the system state plus whether the
// user turned notifications off in the app. Re-checked when the app comes back
// to the foreground (they may have just flipped it in Settings).

import { useCallback, useEffect, useRef, useState } from "react";
import { onAppResume } from "../../lib/native";
import { getPushState, isPushOff, type PushState } from "../../lib/push";

export interface PushStatus {
  /** null while checking. */
  state: PushState | null;
  /** Turned off in the app (the system permission may still be granted). */
  off: boolean;
  refresh: () => void;
  /** Apply a state you already know (e.g. enablePush's result). */
  set: (state: PushState) => void;
}

export function usePushStatus(active = true): PushStatus {
  const [state, setState] = useState<PushState | null>(null);
  const [off, setOff] = useState(() => isPushOff());
  const alive = useRef(true);

  const refresh = useCallback(() => {
    void getPushState()
      .catch((): PushState => "unsupported")
      .then((s) => {
        if (!alive.current) return;
        setState(s);
        setOff(isPushOff());
      });
  }, []);

  const set = useCallback((s: PushState) => {
    setState(s);
    setOff(isPushOff());
  }, []);

  useEffect(() => {
    alive.current = true;
    if (!active) return;
    refresh();
    const stop = onAppResume(refresh);
    return () => {
      alive.current = false;
      stop();
    };
  }, [active, refresh]);

  return { state, off, refresh, set };
}

/** On, from the user's point of view: allowed by the system and not turned off in the app. */
export function pushIsOn(status: Pick<PushStatus, "state" | "off">): boolean {
  return status.state === "granted" && !status.off;
}
