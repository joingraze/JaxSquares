// The host sheet's "Co-hosts" section (shared/cohosts.ts). The host sees who
// co-hosts with a Remove on each, and "Invite a co-host": a single-use link
// (7 days) shared like any invite, until the board has its plan's limit
// (cohostLimitOf: MAX_COHOSTS, or CLUB_MAX_COHOSTS on an Annual Pass + Venue holder's board). A co-host
// sees the same list with "Step down" on their own row, and who the host is.
// The confirms live in the host sheet ("cohost-remove", "step-down").

import { cohostIdsOf, cohostLimitOf } from "../../../shared/cohosts";
import type { GameState } from "../../../shared/types";
import { ShareIcon, UserPlusIcon } from "../../components/icons";
import { Avatar, Button, ListGroup, ListRow } from "../../components/ui";
import type { HostRole } from "../../lib/hostRole";
import { COHOST_PITCH, cohostPlayers } from "./hostModel";

export interface CohostsSectionProps {
  state: GameState;
  role: HostRole;
  /** This device's public player id. */
  me: string;
  /** A host action is in flight. */
  busy: boolean;
  /** Host: make and share an invite link. */
  onInvite: () => void;
  /** Host: ask to remove this co-host (opens the confirm). */
  onRemove: (playerId: string) => void;
  /** Co-host: ask to step down (opens the confirm). */
  onStepDown: () => void;
}

export function CohostsSection({ state, role, me, busy, onInvite, onRemove, onStepDown }: CohostsSectionProps) {
  const cohosts = cohostPlayers(state);
  const limit = cohostLimitOf(state.game);
  const full = cohostIdsOf(state.game).length >= limit;
  const host = state.players.find((p) => p.id === state.game.hostPlayerId);
  // The pitch in full, under the list (a row's subtitle would cut it short).
  const footer =
    role === "host"
      ? full
        ? `Up to ${limit} co-hosts. Remove one to invite someone new.`
        : `${COHOST_PITCH} Up to ${limit} co-hosts; each link works once, for 7 days.`
      : `${host?.name || "The host"} hosts this board. You can do everything they can, except remove them, delete the board or invite co-hosts.`;
  return (
    <ListGroup title="Co-hosts" footer={footer}>
      {cohosts.map((p) => {
        const mine = p.id === me;
        return (
          <ListRow
            key={p.id}
            data-testid="cohost-row"
            leading={<Avatar name={p.name} color={p.color} emoji={p.emoji} size="md" decorative />}
            title={mine ? `${p.name} (you)` : p.name}
            subtitle="Co-host"
            trailing={
              role === "host" ? (
                <RowButton testId="cohost-remove" label={`Remove ${p.name} as co-host`} disabled={busy} onClick={() => onRemove(p.id)}>
                  Remove
                </RowButton>
              ) : mine ? (
                <RowButton testId="cohost-step-down" label="Step down as co-host" disabled={busy} onClick={onStepDown}>
                  Step down
                </RowButton>
              ) : undefined
            }
          />
        );
      })}
      {role === "host" && (
        <ListRow
          data-testid="cohost-invite"
          leading={
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-400/15 text-ink-brand">
              <UserPlusIcon size={18} />
            </span>
          }
          title="Invite a co-host"
          subtitle="Send a link that works once"
          trailing={<ShareIcon size={18} className="text-ink-subtle" />}
          disabled={full || busy}
          onClick={onInvite}
        />
      )}
    </ListGroup>
  );
}

/** A compact row action: 36pt to keep the row slim, tap-target keeps the hit area 44pt. */
function RowButton({ children, label, testId, disabled, onClick }: { children: string; label: string; testId: string; disabled: boolean; onClick: () => void }) {
  return (
    <Button
      size="sm"
      variant="secondary"
      data-testid={testId}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="tap-target !h-9 !rounded-xl !px-3.5 !text-footnote"
    >
      {children}
    </Button>
  );
}
