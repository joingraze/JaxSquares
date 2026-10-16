// "Final" section: finished boards as compact rows with the score and who won.

import { useState } from "react";
import type { GameState, GameSummary } from "../../../shared/types";
import { TrophyIcon } from "../../components/icons";
import { AvatarGroup, Badge, Button, ListGroup, ListRow } from "../../components/ui";
import { scoreLine } from "../../lib/format";
import { prefetchGame } from "../../lib/live";
import { haptic } from "../../lib/native";
import { Matchup } from "./BoardBits";
import { finalSummary } from "./sections";

const COLLAPSED = 3;

export function FinalList({ games, details }: { games: GameSummary[]; details: Record<string, GameState> }) {
  const [all, setAll] = useState(false);
  const shown = all ? games : games.slice(0, COLLAPSED);
  return (
    <>
      <ListGroup>
        {shown.map((g) => (
          <FinalRow key={g.id} game={g} state={details[g.id]} />
        ))}
      </ListGroup>
      {games.length > COLLAPSED && (
        <Button variant="ghost" size="sm" className="mx-auto mt-2 flex text-ink-muted" onClick={() => setAll((v) => !v)}>
          {all ? "Show less" : `Show all ${games.length}`}
        </Button>
      )}
    </>
  );
}

function FinalRow({ game, state }: { game: GameSummary; state: GameState | undefined }) {
  const summary = state ? finalSummary(state) : null;
  const score = summary && summary.scoreX !== null && summary.scoreY !== null ? scoreLine(summary.scoreX, summary.scoreY) : null;
  const won = game.myWins.length;
  const others = summary?.winners.map((w) => w.player) ?? [];

  let subtitle: string;
  if (won > 0) subtitle = `You won ${game.myWins.map((w) => w.label).join(", ")}`;
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
          <span className={won > 0 ? "font-semibold text-gold-300" : undefined}>{subtitle}</span>
        </>
      }
      trailing={
        won > 0 ? (
          <Badge tone="gold" icon={<TrophyIcon />}>
            {won > 1 ? `×${won}` : "Won"}
          </Badge>
        ) : others.length > 0 ? (
          <AvatarGroup people={others.map((p) => ({ id: p.id, name: p.name, color: p.color, emoji: p.emoji }))} max={3} size="sm" />
        ) : undefined
      }
    />
  );
}
