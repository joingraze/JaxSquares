// Per-board notifications switch (this device). On = you hear about this board.
// Shows the last known setting instantly, then confirms with the server.

import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { BellIcon, BellOffIcon } from "../../components/icons";
import { Switch, cx } from "../../components/ui";
import { ToastContext } from "../../components/ui/toastContext";
import { isGameMuted, refreshGameMuted, setGameMuted } from "../../lib/push";

export interface GameMute {
  muted: boolean;
  busy: boolean;
  /** Optimistic; rolls back (and resolves false) if the server says no. */
  setMuted: (muted: boolean) => Promise<boolean>;
}

/** This device's mute for one board: last known value now, the server's a moment later. */
export function useGameMute(gameId: string, onChange?: (muted: boolean) => void): GameMute {
  const toast = useContext(ToastContext);
  const [muted, setMutedState] = useState(() => isGameMuted(gameId));
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // The server is the source of truth (another device, or storage was cleared).
  useEffect(() => {
    let alive = true;
    setMutedState(isGameMuted(gameId));
    refreshGameMuted(gameId)
      .then((m) => {
        if (alive && !busyRef.current) setMutedState(m);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [gameId]);

  const setMuted = useCallback(
    (next: boolean): Promise<boolean> => {
      if (busyRef.current) return Promise.resolve(false);
      busyRef.current = true;
      setBusy(true);
      setMutedState(next);
      return setGameMuted(gameId, next)
        .then(() => {
          onChangeRef.current?.(next);
          return true;
        })
        .catch(() => {
          setMutedState(!next);
          toast?.show({ id: "notify-settings", tone: "error", title: "Couldn't change that", description: "Check your connection and try again." });
          return false;
        })
        .finally(() => {
          busyRef.current = false;
          setBusy(false);
        });
    },
    [gameId, toast],
  );

  return { muted, busy, setMuted };
}

export interface MuteToggleProps {
  gameId: string;
  /** "row" (default): icon, label and switch. "switch": just the switch, e.g. as a ListRow trailing control. */
  variant?: "row" | "switch";
  /** Board name, for the accessible label. */
  label?: string;
  className?: string;
  /** Told about every confirmed change (true = muted). */
  onChange?: (muted: boolean) => void;
}

export function MuteToggle({ gameId, variant = "row", label, className, onChange }: MuteToggleProps) {
  const { muted, busy, setMuted } = useGameMute(gameId, onChange);

  const control = (
    <Switch
      checked={!muted}
      onChange={(on) => void setMuted(!on)}
      disabled={busy}
      aria-label={label ? `Notifications for ${label}` : "Notifications for this board"}
    />
  );

  if (variant === "switch") return <span className={className}>{control}</span>;

  return (
    <div className={cx("flex items-center gap-3", className)}>
      <span
        aria-hidden
        className={cx(
          "grid h-9 w-9 shrink-0 place-items-center rounded-full transition-colors",
          muted ? "bg-surface-4 text-ink-subtle" : "bg-brand-400/14 text-brand-300",
        )}
      >
        {muted ? <BellOffIcon size={18} /> : <BellIcon size={18} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-callout font-semibold text-ink">{muted ? "Muted on this device" : "Notifications on"}</span>
        <span className="block text-footnote text-ink-muted">{muted ? "You won't get pings from this board" : "Numbers, kickoff and winning squares"}</span>
      </span>
      {control}
    </div>
  );
}
