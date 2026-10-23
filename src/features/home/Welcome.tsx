// First open on a new device: what JaxSquares is in one line, a board that's
// already mid-game, and the two ways in, with "Sign in" at the top right for
// someone who plays on another device. The tab dock stays out of the way so
// "Make a board" is the one obvious move. The homepage's static version for
// crawlers (scripts/seo/home.ts) says the same: keep the two in step.

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { PlusIcon } from "../../components/icons";
import { buttonStyles, Button, Jax, Wordmark } from "../../components/ui";
import { useHideTabBar } from "../../components/shell";
import { PROVIDER_LABEL } from "../../lib/auth";
import { useAccount } from "../../lib/identity";
import { haptic, isNative } from "../../lib/native";
import { SignInPill } from "../account";
import { detectHelpEnv } from "../notifications/platformHelp";
import { JoinCodeSheet } from "./JoinCodeSheet";
import { MiniBoard } from "./MiniBoard";

const WELCOME_LINKS = [
  ["/pricing", "Pricing"],
  ["/terms", "Terms"],
  ["/privacy", "Privacy"],
  ["/support", "Support"],
] as const;

export function Welcome() {
  useHideTabBar();
  const [joining, setJoining] = useState(false);
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
      <header className="flex h-(--topbar-h) items-center justify-between gap-3 pt-safe" style={{ boxSizing: "content-box" }}>
        <Wordmark />
        {/* A new phone for someone who plays elsewhere: one tap brings their boards over. */}
        <SignInPill
          data-testid="welcome-signin"
          title="Get your boards on this device"
          description="Sign in with the account you use on your other phone or computer."
        />
      </header>

      {/* The board sits right under the logo with the pitch beneath it; the buttons stay down by your thumb. */}
      <div className="pb-5 pt-8">
        <MiniBoard />
      </div>

      <div className="home-enter">
        <div className="relative">
          <h1 className="font-display text-hero font-extrabold text-ink">
            Sports squares,
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
          Football, basketball or soccer: make a board, text the link, and watch the squares fill up. Scores and winners land live.
          {/* New to squares: the rules guide, a page of the website (not in the app's bundle of screens). */}
          {!isNative() && (
            <>
              {" "}
              <a href="/how-to-play-football-squares" data-testid="welcome-guide" className="font-bold text-ink-brand">
                How to play
              </a>
            </>
          )}
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
        {account && (
          <p data-testid="welcome-signed-in" className="mx-auto max-w-[22rem] text-center text-footnote text-ink-muted">
            <span className="font-bold text-ink">Signed in with {PROVIDER_LABEL[account.provider]}, no boards yet.</span> Made one before
            signing in? Open it on the phone or browser you made it on and sign in there too: it joins your account.
          </p>
        )}
        {/* What it costs and the fine print, one tap from the front door. */}
        <nav aria-label="About JaxSquares" data-testid="welcome-links" className="flex flex-wrap items-center justify-center gap-x-1 text-footnote font-semibold text-ink-subtle">
          {WELCOME_LINKS.map(([to, label], i) => (
            <span key={to} className="flex items-center gap-x-1">
              {i > 0 && <span aria-hidden>·</span>}
              <Link to={to} className="inline-flex min-h-11 items-center px-1.5 hover:text-ink">
                {label}
              </Link>
            </span>
          ))}
        </nav>
      </div>

      <JoinCodeSheet open={joining} onClose={() => setJoining(false)} />
    </div>
  );
}
