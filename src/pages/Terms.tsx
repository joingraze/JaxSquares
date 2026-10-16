import { TopBar } from "../components/ui";

export default function Terms() {
  return (
    <>
      <TopBar title="Terms" back />
      <article className="flex flex-col gap-4 px-safe text-callout text-ink-muted [&_h2]:font-display [&_h2]:text-title-3 [&_h2]:font-extrabold [&_h2]:text-ink">
        <p>JaxSquares is a game to play with friends. Boards are for fun.</p>
        <h2>No money between players</h2>
        <p>JaxSquares doesn't handle, hold or track money between players, and boards may not be used for it. A host can add a fun prize note, like "Loser buys wings".</p>
        <h2>Creating a board</h2>
        <p>The creator pays JaxSquares once to create a board. That's the only charge in the app.</p>
        <h2>Be a good sport</h2>
        <p>Pick names and prize notes you'd say out loud at the party. Hosts can remove boards at any time.</p>
      </article>
    </>
  );
}
