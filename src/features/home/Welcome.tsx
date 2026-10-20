// First open on a new device: what JaxSquares is in one line, a board that's
// already mid-game, and the two ways in. The tab dock stays out of the way so
// "Make a board" is the one obvious move.

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { PlusIcon } from "../../components/icons";
import { buttonStyles, Button, Jax, Wordmark } from "../../components/ui";
import { useHideTabBar } from "../../components/shell";
import { PROVIDER_LABEL, useAuthSetup } from "../../lib/auth";
import { useAccount } from "../../lib/identity";
import { haptic } from "../../lib/native";
import { SignInSheet } from "../account";
import { detectHelpEnv } from "../notifications/platformHelp";
import { JoinCodeSheet } from "./JoinCodeSheet";
import { MiniBoard } from "./MiniBoard";

export function Welcome() {
  useHideTabBar();
  const [joining, setJoining] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  // A new phone for someone who plays elsewhere: one tap brings their boards over.
  const canSignIn = useAuthSetup().providers.length > 0;
  // Signed in with nothing to show: the account has no boards yet. A board made
  // before signing in stays on the device (or browser) it was made on until
  // that one signs in too.
  const account = useAccount();
  // The iPhone Home Screen web app keeps its own storage, apart from Safari's:
  // someone who joined in Safari and then opened the icon lands here with no boards.
  const homeScreenApp = useMemo(() => {
    const env = detectHelpEnv();
    return env.app === null && env.ios && env.standalone;
  }, []);

  return (
    <div className="flex min-h-[calc(100dvh-var(--shell-bottom)-1.5rem)] flex-col overflow-x-clip px-safe">
      <header className="flex h-(--topbar-h) items-center pt-safe" style={{ boxSizing: "content-box" }}>
        <Wordmark />
      </header>

      {/* The board sits right under the logo with the pitch beneath it; the buttons stay down by your thumb. */}
      <div className="pb-5 pt-8">
        <MiniBoard />
      </div>

      <div className="home-enter">
        <div className="relative">
          <h1 className="font-display text-hero font-extrabold text-ink">
            Football squares,
            <br />
            <span className="text-ink-brand">
              live with your
              <br />
              crew.
            </span>
          </h1>
          {/* Jax, the dog the app is named after, part of the crew: in the space the short last lines leave. */}
          <Jax pose="sit" size={78} className="pointer-events-none absolute -bottom-1 -right-1 max-[359px]:hidden" />
        </div>
        <p className="mt-2.5 max-w-[22rem] text-callout text-ink-muted">
          Make a board, text the link, and watch the squares fill up. Scores and winners land live.
        </p>
      </div>

      <div className="home-enter mt-auto flex flex-col gap-3 pt-6" style={{ animationDelay: "80ms" }}>
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
        <p data-testid="welcome-note" className="text-center text-footnote text-ink-subtle">
          {homeScreenApp
            ? "Joined a board in Safari? It's still there. Open your invite link in Safari to get back to it."
            : "Friends join from a link, no account needed."}
        </p>
        {account ? (
          <p data-testid="welcome-signed-in" className="mx-auto max-w-[22rem] text-center text-footnote text-ink-muted">
            <span className="font-bold text-ink">Signed in with {PROVIDER_LABEL[account.provider]}, no boards yet.</span> Made one before
            signing in? Open it on the phone or browser you made it on and sign in there too: it joins your account.
          </p>
        ) : (
          canSignIn && (
            <button
              type="button"
              data-testid="welcome-signin"
              onClick={() => setSigningIn(true)}
              className="pressable mx-auto -mt-1 min-h-11 rounded-full px-4 text-subhead font-bold text-ink-muted hover:text-ink"
            >
              Playing on another device? <span className="text-ink-brand">Sign in</span>
            </button>
          )
        )}
      </div>

      <JoinCodeSheet open={joining} onClose={() => setJoining(false)} />
      <SignInSheet
        open={signingIn}
        onClose={() => setSigningIn(false)}
        title="Get your boards on this device"
        description="Sign in with the account you use on your other phone or computer."
      />
    </div>
  );
}
