// Home's one sign-in nudge: shown on a device that has boards (it's on the
// dashboard), isn't signed in and can sign in here. "Not now" hides it for
// good on this device.

import { useState, type CSSProperties } from "react";
import { UsersIcon, XIcon } from "../../components/icons";
import { Button, Card, IconButton } from "../../components/ui";
import { PROVIDER_LABEL, useAuthSetup } from "../../lib/auth";
import { useAccount } from "../../lib/identity";
import { SignInSheet } from "./SignInSheet";

export const SIGNIN_CARD_DISMISSED_KEY = "jaxsquares.signinCard.dismissed";

function wasDismissed(): boolean {
  try {
    return localStorage.getItem(SIGNIN_CARD_DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

export function SignInCard({ className, style }: { className?: string; style?: CSSProperties }) {
  const account = useAccount();
  const setup = useAuthSetup();
  const [dismissed, setDismissed] = useState(wasDismissed);
  const [open, setOpen] = useState(false);

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(SIGNIN_CARD_DISMISSED_KEY, "1");
    } catch {
      // storage unavailable: hidden for this visit
    }
  };

  const show = !account && !dismissed && setup.ready && setup.providers.length > 0;
  const names = setup.providers.map((p) => PROVIDER_LABEL[p]).join(" or ");

  return (
    <>
      {show && (
        <div className={className} style={style}>
          <Card data-testid="home-signin-card" padding="md" className="flex items-start gap-3.5 pr-2">
            <span aria-hidden className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-400/12 text-ink-brand ring-1 ring-inset ring-brand-line/25">
              <UsersIcon size={20} />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="font-display text-headline font-extrabold text-ink">Keep your boards on every device</h2>
              <p className="mt-0.5 text-footnote text-ink-muted">
                Sign in with {names} and your boards, squares and invites follow you to any phone or computer.
              </p>
              <Button size="sm" className="mt-3" onClick={() => setOpen(true)} data-testid="home-signin-open">
                Sign in
              </Button>
            </div>
            <IconButton label="Not now" icon={<XIcon size={18} />} size="sm" className="-mt-1" onClick={dismiss} data-testid="home-signin-dismiss" />
          </Card>
        </div>
      )}
      <SignInSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}
