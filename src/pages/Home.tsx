// Home: the welcome screen on a brand-new device, the dashboard once you have
// boards (or an invite you opened). A device that has never made, joined or
// opened a board goes straight to the welcome (no skeleton flash); if the
// server turns out to know boards for it, the dashboard takes over. Loading
// and error keep the dashboard's header (greeting, headline, bell) so the page
// doesn't jump when boards arrive.

import { useMemo } from "react";
import { Button, EmptyState } from "../components/ui";
import { Dashboard } from "../features/home/Dashboard";
import { HomeHeader } from "../features/home/HomeHeader";
import { HomeSkeleton } from "../features/home/HomeSkeleton";
import { homeBoards } from "../features/home/sections";
import { Welcome } from "../features/home/Welcome";
import { getKnownGames, useProfile, useSeenGames } from "../lib/identity";
import { useMyGames } from "../lib/live";

export default function Home() {
  const { games: all, loading, error, refresh } = useMyGames();
  const profile = useProfile();
  // Invites you only opened stay on Home while they're in the seen list ("Not for me" takes one off at once).
  const seen = useSeenGames();
  const games = useMemo(() => (all ? homeBoards(all, seen) : null), [all, seen]);
  const knowsBoards = useMemo(() => getKnownGames().length > 0 || seen.length > 0, [seen]);

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
