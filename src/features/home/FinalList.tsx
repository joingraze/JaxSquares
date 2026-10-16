// "Final" section: finished boards as compact rows with the score and who won.
// The score comes with the summary; names and avatars need the board's state,
// which Home fetches once and only for the rows on screen.

import { useState } from "react";
import type { GameState, GameSummary } from "../../../shared/types";
import { TrophyIcon } from "../../components/icons";
import { AvatarGroup, Badge, Button, ListGroup, ListRow } from "../../components/ui";
import { scoreLine } from "../../lib/format";
import { prefetchGame } from "../../lib/live";
import { haptic } from "../../lib/native";
import { Matchup } from "./BoardBits";
import { finalSummary, phraseOf, times } from "./sections";

/** Rows shown before "Show all". */
export const FINALS_COLLAPSED = 3;

export interface FinalListProps {
  games: GameSummary[];
  details: Readonly<Record<string, GameState>>;
  me: string;
  /** Told when the list expands or collapses (so details are fetched for the rows shown). */
  onExpand?: (all: boolean) => void;
}

export function FinalList({ games, details, me, onExpand }: FinalListProps) {
  const [all, setAll] = useState(false);
  const shown = all ? games : games.slice(0, FINALS_COLLAPSED);
  return (
    <>
      <ListGroup>
        {shown.map((g) => (
          <FinalRow key={g.id} game={g} state={details[g.id]} me={me} />
        ))}
      </ListGroup>
      {games.length > FINALS_COLLAPSED && (
        <Button
          variant="ghost"
          size="sm"
          className="mx-auto mt-2 flex !h-11 text-ink-muted"
          onClick={() => {
            setAll(!all);
            onExpand?.(!all);
          }}
        >
          {all ? "Show less" : `Show all ${games.length}`}
        </Button>
      )}
    </>
  );
}

function FinalRow({ game, state, me }: { game: GameSummary; state: GameState | undefined; me: string }) {
  const summary = state ? finalSummary(state) : null;
  const scoreX = summary?.scoreX ?? game.latestScore?.scoreX ?? null;
  const scoreY = summary?.scoreY ?? game.latestScore?.scoreY ?? null;
  const score = scoreX !== null && scoreY !== null ? scoreLine(scoreX, scoreY) : null;
  const wins = [...new Map(game.myWins.map((w) => [w.periodKey, w])).values()];
  const others = summary?.winners.map((w) => w.player).filter((p) => p.id !== me) ?? [];

  let subtitle: string;
  if (wins.length === 1) subtitle = `You hit ${phraseOf(wins[0].periodKey, wins[0].label).moment}`;
  else if (wins.length > 1) subtitle = `You hit ${times(wins.length)}`;
  else if (others.length > 0) subtitle = `${others[0].name}${others.length > 1 ? ` +${others.length - 1}` : ""} won`;
  else subtitle = game.isHost ? "You hosted" : "Good game";

  return (
    <ListRow
      to={`/g/${game.id}`}
      onPointerDown={() => void prefetchGame(game.id)}
      onClick={() => void haptic("selection")}
      leading={<Matchup teamX={game.teamX} teamY={game.teamY} />}
      title={game.name}
      subtitle={
        <>
          {score && <span className="font-bold tabular-nums text-ink">{score}</span>}
          {score && " · "}
          <span className={wins.length > 0 ? "font-semibold text-gold-300" : undefined}>{subtitle}</span>
        </>
      }
      trailing={
        wins.length > 0 ? (
          <Badge tone="gold" icon={<TrophyIcon />}>
            {wins.length > 1 ? `×${wins.length}` : "Won"}
          </Badge>
        ) : others.length > 0 ? (
          <AvatarGroup people={others.map((p) => ({ id: p.id, name: p.name, color: p.color, emoji: p.emoji }))} max={3} size="sm" />
        ) : undefined
      }
    />
  );
}
