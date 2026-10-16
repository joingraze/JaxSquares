// Home: the welcome screen on a brand-new device, the dashboard once you have
// boards. A device that has never made or joined a board goes straight to the
// welcome (no skeleton flash); if the server turns out to know boards for it,
// the dashboard takes over. Loading and error keep the dashboard's header
// (greeting, headline, bell) so the page doesn't jump when boards arrive.

import { useMemo } from "react";
import { Button, EmptyState } from "../components/ui";
import { Dashboard } from "../features/home/Dashboard";
import { HomeHeader } from "../features/home/HomeHeader";
import { HomeSkeleton } from "../features/home/HomeSkeleton";
import { Welcome } from "../features/home/Welcome";
import { getKnownGames, useProfile } from "../lib/identity";
import { useMyGames } from "../lib/live";

export default function Home() {
  const { games, loading, error, refresh } = useMyGames();
  const profile = useProfile();
  const knowsBoards = useMemo(() => getKnownGames().length > 0, []);

  if (games && games.length > 0) return <Dashboard games={games} error={error} refresh={refresh} />;
  if (games || !knowsBoards) return <Welcome />;

  return (
    <>
      <HomeHeader
        name={profile.name}
        headline={loading ? null : { lead: "Can't reach", hot: "the stadium.", tone: "brand" }}
      />
      {loading ? (
        <HomeSkeleton />
      ) : (
        <div className="px-safe">
          <EmptyState
            art="📡"
            title="Your boards are safe"
            description={error?.message ?? "Couldn't load your boards."}
            action={
              <Button variant="secondary" size="lg" block onClick={() => void refresh()}>
                Try again
              </Button>
            }
          />
        </div>
      )}
    </>
  );
}
