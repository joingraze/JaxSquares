// Header bell. While notifications are off (and can be turned on) it carries a
// dot and opens the notifications ask; otherwise it goes to Profile, where the
// notification settings live.

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BellIcon } from "../../components/icons";
import { IconButton } from "../../components/ui";
import { onAppResume } from "../../lib/native";
import { getPushState, type PushState } from "../../lib/push";
import { NotifyPrompt } from "../notifications/NotifyPrompt";

export interface NotifyBellProps {
  /** Board the ask is about (the most relevant one on the dashboard). */
  gameId: string | null;
  /** The device hosts that board. */
  isHost: boolean;
}

/** States where asking makes sense (an iOS Safari tab is asked to add to Home Screen). */
export const CAN_ASK: ReadonlySet<PushState> = new Set<PushState>(["default", "needs-install"]);

export function NotifyBell({ gameId, isHost }: NotifyBellProps) {
  const navigate = useNavigate();
  const [state, setState] = useState<PushState | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    const check = () =>
      void getPushState()
        .then((s) => alive && setState(s))
        .catch(() => alive && setState("unsupported"));
    check();
    const stop = onAppResume(check);
    return () => {
      alive = false;
      stop();
    };
  }, [open]);

  const ask = state !== null && CAN_ASK.has(state) && gameId !== null;
  return (
    <>
      <IconButton
        label={ask ? "Turn on notifications" : "Notifications"}
        icon={<BellIcon size={22} />}
        badge={ask}
        haptic="selection"
        onClick={() => (ask ? setOpen(true) : navigate("/me"))}
      />
      {gameId && <NotifyPrompt gameId={gameId} trigger={isHost ? "created" : "joined"} open={open} onClose={() => setOpen(false)} />}
    </>
  );
}
