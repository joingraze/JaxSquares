// Placeholder board screen: proves the live data layer end to end. The next
// wave builds the real grid, claiming, scores and celebrations here.
import { useParams } from "react-router-dom";
import { ShareIcon } from "../components/icons";
import { Badge, Card, EmptyState, IconButton, LiveDot, Meter, Skeleton, TeamMark, TopBar, useToast } from "../components/ui";
import { inviteUrl } from "../lib/api";
import { STATUS_LABEL, pluralize, teamVars } from "../lib/format";
import { useGame } from "../lib/live";
import { shareLink } from "../lib/native";
import { totalSquares } from "../../shared/squares";

export default function GameView() {
  const { id } = useParams();
  const toast = useToast();
  const { state, loading, notFound, error, connection, watching } = useGame(id);

  if (notFound) {
    return (
      <>
        <TopBar title="Board" large={false} back />
        <EmptyState art="🧐" title="Board not found" description="This link may be old, or the host deleted the board." />
      </>
    );
  }

  const game = state?.game;
  const share = async () => {
    if (!game) return;
    const outcome = await shareLink({ title: game.name, text: `Grab a square on ${game.name}`, url: inviteUrl(game.id) });
    if (outcome === "copied") toast.success("Invite link copied");
  };

  return (
    <>
      <TopBar
        title={game?.name ?? "Board"}
        large={false}
        back
        trailing={<IconButton label="Share invite" icon={<ShareIcon size={22} />} onClick={() => void share()} disabled={!game} />}
      />
      <div className="flex flex-col gap-4 px-safe pt-2">
        {loading || !state || !game ? (
          <>
            <Skeleton className="h-28 w-full rounded-card" />
            <Skeleton className="aspect-square w-full rounded-card" />
            {error && <p className="text-center text-footnote text-ink-muted">{error.message}</p>}
          </>
        ) : (
          <>
            <Card style={teamVars(game.teamX, game.teamY)} className="flex flex-col gap-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <TeamMark team={game.teamX} />
                  <span className="font-display text-title-3 font-extrabold text-ink-subtle">vs</span>
                  <TeamMark team={game.teamY} />
                </div>
                <Badge tone={game.status === "final" ? "gold" : "neutral"}>{STATUS_LABEL[game.status]}</Badge>
              </div>
              <Meter value={state.squares.length} max={totalSquares(game.format.boardSize)} label="Squares claimed" />
              <p className="flex items-center gap-2 text-footnote text-ink-muted">
                <LiveDot tone={connection === "live" ? "brand" : "muted"} pulse={connection === "live"} />
                {connection === "live" ? `Live · ${pluralize(watching, "fan")} watching` : connection === "offline" ? "Offline" : "Reconnecting…"}
              </p>
            </Card>
            <EmptyState art="🏟️" title="The board lands here next" description={`${pluralize(state.players.length, "player")} on this board.`} />
          </>
        )}
      </div>
    </>
  );
}
