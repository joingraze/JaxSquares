// A board's notification settings, from the bell in its top bar: this
// device's pushes for the board (the mute switch, when notifications are on
// here) and email notices (docs/email.md), for players notifications can't
// reach. The board shows the bell only to players, and only when email is set
// up on the server.

import { useState } from "react";
import type { EmailNoticeStatus, Sport } from "../../../shared/types";
import { BottomSheet, Button } from "../../components/ui";
import { EmailOptIn } from "./EmailOptIn";
import { MuteToggle } from "./MuteToggle";
import { pushIsOn, usePushStatus } from "./usePushStatus";
import "./notifications.css";

export interface BoardNotifySheetProps {
  gameId: string;
  boardName: string;
  /** The board's sport (the mute row's "tip-off" on a basketball board). */
  sport?: Sport;
  open: boolean;
  onClose: () => void;
}

export function BoardNotifySheet({ gameId, boardName, open, onClose, sport }: BoardNotifySheetProps) {
  const push = usePushStatus(open);
  const [status, setStatus] = useState<EmailNoticeStatus | null>(null);

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Notifications"
      description={boardName}
      footer={
        <Button variant="secondary" size="lg" block onClick={onClose} data-testid="board-notify-done">
          {status === "pending" || status === "confirmed" ? "Done" : "Close"}
        </Button>
      }
    >
      <div className="flex flex-col gap-5 pb-2 pt-3" data-testid="board-notify-sheet">
        {pushIsOn(push) && (
          <section aria-label="On this device">
            <p className="eyebrow mb-2 px-1 text-ink-subtle">On this device</p>
            <div className="rounded-2xl p-3.5 ring-1 ring-inset ring-line">
              <MuteToggle gameId={gameId} label={boardName} sport={sport} />
            </div>
          </section>
        )}
        <section aria-label="Email">
          <p className="eyebrow mb-2 px-1 text-ink-subtle">Email</p>
          <div className="rounded-2xl p-3.5 ring-1 ring-inset ring-line">
            {open && <EmailOptIn gameId={gameId} boardName={boardName} onStatus={setStatus} />}
          </div>
        </section>
      </div>
    </BottomSheet>
  );
}
