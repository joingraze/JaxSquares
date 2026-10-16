// Placeholder profile & notifications screen (next wave).
import { Avatar, ListGroup, ListRow, TopBar } from "../components/ui";
import { useProfile } from "../lib/identity";

export default function Profile() {
  const profile = useProfile();
  return (
    <>
      <TopBar title="Profile" />
      <div className="flex flex-col gap-6 px-safe">
        <div className="flex items-center gap-4">
          <Avatar name={profile.name || "You"} color={profile.color} emoji={profile.emoji} size="xl" />
          <div>
            <p className="font-display text-title-2 font-extrabold">{profile.name || "Pick a name"}</p>
            <p className="text-subhead text-ink-muted">Shown on every board you join.</p>
          </div>
        </div>
        <ListGroup title="About">
          <ListRow title="Privacy" to="/privacy" />
          <ListRow title="Terms" to="/terms" />
        </ListGroup>
      </div>
    </>
  );
}
