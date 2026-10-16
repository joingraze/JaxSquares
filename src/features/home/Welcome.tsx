// First open on a new device: what JaxSquares is in one line, a board that's
// already mid-game, and the two ways in. The tab dock stays out of the way so
// "Make a board" is the one obvious move.

import { useState } from "react";
import { Link } from "react-router-dom";
import { PlusIcon } from "../../components/icons";
import { buttonStyles, Button, Wordmark } from "../../components/ui";
import { useHideTabBar } from "../../components/shell";
import { haptic } from "../../lib/native";
import { JoinCodeSheet } from "./JoinCodeSheet";
import { MiniBoard } from "./MiniBoard";

export function Welcome() {
  useHideTabBar();
  const [joining, setJoining] = useState(false);

  return (
    <div className="flex min-h-[calc(100dvh-var(--shell-bottom)-1.5rem)] flex-col px-safe">
      <header className="flex h-(--topbar-h) items-center pt-safe" style={{ boxSizing: "content-box" }}>
        <Wordmark />
      </header>

      <div className="flex flex-1 flex-col justify-center py-6">
        <MiniBoard className="mt-6" />
      </div>

      <div className="home-enter">
        <h1 className="font-display text-hero font-extrabold text-ink">
          Football squares,
          <br />
          <span className="text-brand-400">live with your crew.</span>
        </h1>
        <p className="mt-3 max-w-[22rem] text-callout text-ink-muted">
          Make a board, text the link, and watch the squares fill up. Scores and winners land live.
        </p>
      </div>

      <div className="home-enter mt-7 flex flex-col gap-3" style={{ animationDelay: "80ms" }}>
        <Link
          to="/new"
          data-testid="new-board"
          onClick={() => void haptic("light")}
          className={buttonStyles({ size: "lg", block: true })}
        >
          <PlusIcon size={22} strokeWidth={3} />
          Make a board
        </Link>
        <Button variant="secondary" size="lg" block onClick={() => setJoining(true)}>
          Join with a code
        </Button>
        <p className="mt-1 text-center text-footnote text-ink-subtle">No accounts. Friends join from a link.</p>
      </div>

      <JoinCodeSheet open={joining} onClose={() => setJoining(false)} />
    </div>
  );
}
