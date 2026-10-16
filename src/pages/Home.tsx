// Home: the welcome screen on a brand-new device, the dashboard once you have
// boards. A device that has never made or joined a board goes straight to the
// welcome (no skeleton flash); if the server turns out to know boards for it,
// the dashboard takes over.

import { useMemo } from "react";
import { Button, EmptyState, LogoMark, TopBar } from "../components/ui";
import { Dashboard } from "../features/home/Dashboard";
import { HomeSkeleton } from "../features/home/HomeSkeleton";
import { Welcome } from "../features/home/Welcome";
import { getKnownGames } from "../lib/identity";
import { useMyGames } from "../lib/live";

export default function Home() {
  const { games, loading, error, refresh } = useMyGames();
  const knowsBoards = useMemo(() => getKnownGames().length > 0, []);

  if (games && games.length > 0) return <Dashboard games={games} error={error} refresh={refresh} />;
  if (games || !knowsBoards) return <Welcome />;

  return (
    <>
      <TopBar title="Home" leading={<LogoMark size={30} className="ml-2.5" />} largeTitle="Your boards" />
      {loading ? (
        <HomeSkeleton />
      ) : (
        <div className="px-safe">
          <EmptyState
            art="📡"
            title="Can't reach the stadium"
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
