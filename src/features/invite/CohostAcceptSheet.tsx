// "Become a co-host of <board>?": what a co-host invite link (/g/<id>?cohost=)
// asks once the board is up (GameView). Says who invited you and what a
// co-host does; accepting joins the board first when you're not on it yet
// (GameView opens the join sheet, then accepts). A link that can't be used
// (used, expired, the board's full of co-hosts) says so and only closes.

import type { ReactNode } from "react";
import type { GameState } from "../../../shared/types";
import { AlertIcon, CrownIcon, FlagIcon, GridIcon, UsersIcon } from "../../components/icons";
import { Avatar, BottomSheet, Button } from "../../components/ui";
import "./invite.css";
import { hostOf } from "./inviteModel";

export interface CohostAcceptSheetProps {
  state: GameState;
  open: boolean;
  /** This device is on the board already (otherwise accepting joins first). */
  joined: boolean;
  busy: boolean;
  /** Why the last try didn't work; `final` when trying again can't help (the link's used or expired). */
  error: { message: string; final: boolean } | null;
  onAccept: () => void;
  onClose: () => void;
}

export function CohostAcceptSheet({ state, open, joined, busy, error, onAccept, onClose }: CohostAcceptSheetProps) {
  const host = hostOf(state);
  const hostName = host?.name || "The host";
  const done = !!error?.final;
  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      dismissible={!busy}
      title={`Become a co-host of ${state.game.name}?`}
      description={`${hostName} invited you to help run this board.`}
      footer={
        <div className="flex flex-col gap-2">
          {error && (
            <p role="alert" className="flex items-start gap-2 rounded-xl bg-danger-500/12 px-3 py-2 text-footnote font-semibold text-ink-danger ring-1 ring-inset ring-danger-500/30">
              <AlertIcon size={16} className="mt-px shrink-0" />
              <span className="min-w-0 flex-1">{error.message}</span>
            </p>
          )}
          {done ? (
            <Button data-testid="cohost-decline" size="lg" block variant="secondary" onClick={onClose}>
              Close
            </Button>
          ) : (
            <>
              <Button data-testid="cohost-accept" size="lg" block loading={busy} haptic="medium" leading={<CrownIcon size={20} />} onClick={onAccept}>
                {error ? "Try again" : joined ? "Become a co-host" : "Join & become a co-host"}
              </Button>
              <Button data-testid="cohost-decline" variant="ghost" block disabled={busy} onClick={onClose}>
                Not now
              </Button>
            </>
          )}
        </div>
      }
    >
      <div className="flex flex-col gap-4 pb-2">
        {host && (
          <div className="flex items-center gap-3 rounded-card bg-surface-3 py-3 pl-3 pr-4 ring-1 ring-inset ring-line">
            <Avatar name={host.name} color={host.color} emoji={host.emoji} size="lg" decorative />
            <div className="min-w-0 flex-1">
              <p className="truncate text-headline font-extrabold text-ink">{host.name}</p>
              <p className="text-footnote text-ink-muted">Host · {state.game.teamX.abbr || state.game.teamX.name} vs {state.game.teamY.abbr || state.game.teamY.name}</p>
            </div>
          </div>
        )}
        <ul className="flex flex-col gap-3.5">
          <Fact icon={<CrownIcon size={16} />}>
            <b className="font-bold text-ink">Run the board together.</b> Enter scores, draw the numbers, edit the rules and prizes, and invite players.
          </Fact>
          <Fact icon={<GridIcon size={16} />}>Take someone off the board, freeing their squares, while squares are being picked.</Fact>
          <Fact icon={<FlagIcon size={16} />}>
            <b className="font-bold text-ink">{hostName} stays the host.</b> Only they can add or remove co-hosts, or delete the board.
          </Fact>
          <Fact icon={<UsersIcon size={16} />}>{joined ? "You keep your squares. Step down any time." : "You'll pick a name and join the board first. Step down any time."}</Fact>
        </ul>
      </div>
    </BottomSheet>
  );
}

function Fact({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-surface-4 text-ink">{icon}</span>
      <span className="pt-1 text-callout text-ink-muted">{children}</span>
    </li>
  );
}
