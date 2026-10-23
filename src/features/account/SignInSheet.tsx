// A bottom sheet with the sign-in buttons, for anywhere that needs an account
// (Home's card, the welcome screen, and the Annual Pass purchase on the web). Closes
// itself once signed in.

import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import type { MeResponse } from "../../../shared/types";
import { BottomSheet, Button } from "../../components/ui";
import { useAuthSetup } from "../../lib/auth";
import { SignInButtons } from "./SignInButtons";

export interface SignInSheetProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  /** After signing in (the sheet closes itself first). */
  onSignedIn?: (me: MeResponse) => void;
  /** A button under the sign-in buttons that just closes the sheet ("Not now"), for an offer the person can skip. */
  dismissLabel?: string;
}

export function SignInSheet({
  open,
  onClose,
  title = "Keep your boards on every device",
  description = "Sign in and your boards, squares and invites follow you to every phone and computer you use.",
  onSignedIn,
  dismissLabel,
}: SignInSheetProps) {
  const setup = useAuthSetup();
  return (
    <BottomSheet open={open} onClose={onClose} title={title} description={description}>
      <div data-testid="signin-sheet" className="flex flex-col gap-4 pb-1">
        {setup.ready && setup.providers.length === 0 ? (
          <p className="rounded-xl bg-surface-3 px-4 py-3.5 text-subhead text-ink-muted">Signing in isn't available here yet.</p>
        ) : (
          <SignInButtons
            setup={setup}
            onSignedIn={(me) => {
              onClose();
              onSignedIn?.(me);
            }}
          />
        )}
        {dismissLabel && (
          <Button variant="ghost" block onClick={onClose} data-testid="signin-dismiss" className="-mt-1 text-ink-muted">
            {dismissLabel}
          </Button>
        )}
        <p className="px-1 text-center text-footnote text-ink-subtle">
          Playing never needs an account. We use your sign-in only to find your boards.{" "}
          <Link to="/privacy" onClick={onClose} className="font-semibold text-ink-muted underline-offset-2 hover:underline">
            Privacy
          </Link>
        </p>
      </div>
    </BottomSheet>
  );
}
