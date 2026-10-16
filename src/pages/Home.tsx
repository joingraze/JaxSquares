// Placeholder dashboard: the next wave replaces this with the full Home screen.
import { Link, useNavigate } from "react-router-dom";
import type { GameSummary } from "../../shared/types";
import { BellIcon, PlusIcon } from "../components/icons";
import { Badge, Button, buttonStyles, Card, EmptyState, IconButton, Meter, Skeleton, TeamMark, TopBar } from "../components/ui";
import { STATUS_LABEL } from "../lib/format";
import { useProfile } from "../lib/identity";
import { prefetchGame, useMyGames } from "../lib/live";

export default function Home() {
  const { games, loading, error, refresh } = useMyGames();
  const profile = useProfile();
  const navigate = useNavigate();

  return (
    <>
      <TopBar
        title="Your boards"
        subtitle={profile.name ? `Game night, ${profile.name}. ${profile.emoji}` : "Game night starts here."}
        trailing={<IconButton label="Notifications" icon={<BellIcon size={22} />} onClick={() => navigate("/me")} />}
      />
      <div className="flex flex-col gap-3 px-safe">
        {loading &&
          [0, 1, 2].map((i) => (
            <Card key={i} className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <Skeleton className="h-10 w-10" />
                <Skeleton className="h-4 flex-1" />
              </div>
              <Skeleton className="h-2.5 w-full rounded-full" />
            </Card>
          ))}

        {!loading && error && !games?.length && (
          <EmptyState
            art="📡"
            title="Can't reach the stadium"
            description={error.message}
            action={
              <Button variant="secondary" onClick={() => void refresh()}>
                Try again
              </Button>
            }
          />
        )}

        {!loading && !error && games?.length === 0 && (
          <EmptyState
            title="No boards yet"
            description="Make a board, send the link to your crew, and watch the squares fill up."
            action={
              <Link to="/new" className={buttonStyles({ size: "lg", block: true })}>
                <PlusIcon size={20} strokeWidth={3} />
                Make a board
              </Link>
            }
          />
        )}

        {games?.map((g) => <GameCard key={g.id} game={g} />)}
      </div>
    </>
  );
}

function GameCard({ game }: { game: GameSummary }) {
  return (
    <Link to={`/g/${game.id}`} onPointerDown={() => void prefetchGame(game.id)} className="block">
      <Card interactive className="flex flex-col gap-3.5">
        <div className="flex items-center gap-3">
          <div className="flex -space-x-2">
            <TeamMark team={game.teamX} />
            <TeamMark team={game.teamY} className="ring-2 ring-surface-2" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-headline font-extrabold">{game.name}</p>
            <p className="truncate text-footnote text-ink-muted">
              {game.teamX.name} vs {game.teamY.name}
            </p>
          </div>
          {game.isHost ? <Badge tone="brand">Host</Badge> : <Badge>{STATUS_LABEL[game.status]}</Badge>}
        </div>
        <Meter value={game.claimed} max={game.totalSquares} label={`${game.mySquares} yours · ${game.playerCount} playing`} size="sm" />
      </Card>
    </Link>
  );
}
