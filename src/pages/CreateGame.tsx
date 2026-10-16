// Placeholder for the create-board flow (next wave).
import { EmptyState, TopBar } from "../components/ui";

export default function CreateGame() {
  return (
    <>
      <TopBar title="New board" subtitle="Pick the matchup, the format, and you're live." />
      <div className="px-safe">
        <EmptyState art="🛠️" title="Board builder" description="The create flow lands here next." />
      </div>
    </>
  );
}
