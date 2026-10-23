// The sign-in nudge, never a gate: on Home (a device that has boards) and on a
// board (under the grid, for someone holding squares or hosting it), shown on
// a device that isn't signed in where sign-in is set up. "Remind me in 3 days"
// snoozes both places for 3 days on this device.

import { useState, type CSSProperties } from "react";
import { UsersIcon } from "../../components/icons";
import { Button, Card } from "../../components/ui";
import { PROVIDER_LABEL, useAuthSetup } from "../../lib/auth";
import { useAccount } from "../../lib/identity";
import { SignInSheet } from "./SignInSheet";

export const SIGNIN_SNOOZE_KEY = "jaxsquares.signinCard.snoozedUntil";
export const SIGNIN_SNOOZE_MS = 3 * 24 * 60 * 60 * 1000;

function snoozed(now = Date.now()): boolean {
  try {
    return Number(localStorage.getItem(SIGNIN_SNOOZE_KEY)) > now;
  } catch {
    return false;
  }
}

export interface SignInCardProps {
  className?: string;
  style?: CSSProperties;
  /** "board": the copy speaks about this board's squares. */
  place?: "home" | "board";
}

export function SignInCard({ className, style, place = "home" }: SignInCardProps) {
  const account = useAccount();
  const setup = useAuthSetup();
  const [hidden, setHidden] = useState(() => snoozed());
  const [open, setOpen] = useState(false);

  const snooze = () => {
    setHidden(true);
    try {
      localStorage.setItem(SIGNIN_SNOOZE_KEY, String(Date.now() + SIGNIN_SNOOZE_MS));
    } catch {
      // storage unavailable: hidden for this visit
    }
  };

  const show = !account && !hidden && setup.ready && setup.providers.length > 0;
  const names = setup.providers.map((p) => PROVIDER_LABEL[p]).join(" or ");
  const text =
    place === "board"
      ? `Your squares here only live on this device. Sign in with ${names} and they follow you to any phone or computer.`
      : `Sign in with ${names} and your boards, squares and invites follow you to any phone or computer.`;

  return (
    <>
      {show && (
        <div className={className} style={style}>
          <Card data-testid={`${place}-signin-card`} padding="md" className="flex items-start gap-3.5">
            <span aria-hidden className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-400/12 text-ink-brand ring-1 ring-inset ring-brand-line/25">
              <UsersIcon size={20} />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="font-display text-headline font-extrabold text-ink">Keep your boards on every device</h2>
              <p className="mt-0.5 text-footnote text-ink-muted">{text}</p>
              <div className="mt-3 flex flex-wrap items-center gap-x-1 gap-y-2">
                <Button size="sm" onClick={() => setOpen(true)} data-testid={`${place}-signin-open`}>
                  Sign in
                </Button>
                <Button size="sm" variant="ghost" onClick={snooze} data-testid={`${place}-signin-snooze`} className="text-ink-muted">
                  Remind me in 3 days
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}
      <SignInSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}
