// "Pings by board": one row per board that can still ping, in a stable order
// (live first, then by kickoff), each saying what it pings about next. Muting
// dims the row, tags it and confirms with an Undo. Finished boards are listed
// greyed out, so the list adds up with the Boards count above it.

import type { GameSummary } from "../../../../shared/types";
import { BellIcon, BellOffIcon, FlagIcon } from "../../../components/icons";
import { Badge, ListGroup, ListRow, Switch, cx, useToast } from "../../../components/ui";
import { useGameMute } from "../MuteToggle";
import { MiniMatchup } from "./MiniMatchup";
import { nextPing, pingBoards } from "./pings";

/** Ended boards spelled out before collapsing into "+N more". */
const ENDED_SHOWN = 2;

export function BoardPings({ games }: { games: readonly GameSummary[] }) {
  const { active, ended } = pingBoards(games);
  if (active.length === 0 && ended.length === 0) return null;
  const extra = ended.length - ENDED_SHOWN;
  return (
    <ListGroup
      title="Pings by board"
      footer={ended.length > 0 ? "Muting a board only affects this device. Ended boards don't ping." : "Muting a board only affects this device."}
    >
      {active.map((g) => (
        <BoardPingRow key={g.id} game={g} />
      ))}
      {ended.slice(0, ENDED_SHOWN).map((g) => (
        <ListRow
          key={g.id}
          className="opacity-55"
          leading={<MiniMatchup teamX={g.teamX} teamY={g.teamY} />}
          title={<span className="text-ink-muted">{g.name}</span>}
          subtitle="Ended · no more pings"
          trailing={
            <Badge tone="outline" icon={<FlagIcon />}>
              Final
            </Badge>
          }
        />
      ))}
      {extra > 0 && <ListRow className="opacity-55" title={<span className="text-ink-muted">+{extra} more ended</span>} subtitle="Ended boards don't ping" />}
    </ListGroup>
  );
}

function BoardPingRow({ game }: { game: GameSummary }) {
  const toast = useToast();
  const { muted, busy, setMuted } = useGameMute(game.id);

  const change = (mute: boolean) => {
    void setMuted(mute).then((ok) => {
      if (!ok) return;
      // One settings toast at a time: this replaces "Test sent" and the like.
      toast.show({
        id: "notify-settings",
        tone: "neutral",
        haptic: "selection",
        icon: (
          <span className={cx("grid h-9 w-9 place-items-center rounded-xl", mute ? "bg-surface-4 text-ink-muted" : "bg-brand-400 text-ink-inverse")}>
            {mute ? <BellOffIcon size={18} /> : <BellIcon size={18} />}
          </span>
        ),
        title: mute ? `${game.name} muted` : `${game.name} unmuted`,
        description: mute ? "No pings from this board on this device." : nextPing(game),
        action: { label: "Undo", onClick: () => void setMuted(!mute) },
      });
    });
  };

  return (
    <ListRow
      leading={
        <span className={cx("transition-opacity", muted && "opacity-40 grayscale")}>
          <MiniMatchup teamX={game.teamX} teamY={game.teamY} />
        </span>
      }
      title={<span className={muted ? "text-ink-muted" : undefined}>{game.name}</span>}
      subtitle={
        // Wraps instead of truncating: the next ping is the point of the row.
        <span className="flex flex-wrap items-center gap-x-1.5 whitespace-normal">
          {muted ? (
            <>
              <Badge tone="outline" icon={<BellOffIcon />}>
                Muted
              </Badge>
              <span>No pings on this device</span>
            </>
          ) : (
            nextPing(game)
          )}
        </span>
      }
      trailing={<Switch checked={!muted} disabled={busy} onChange={(on) => change(!on)} aria-label={`Notifications for ${game.name}`} />}
    />
  );
}
