// The way to sign in that's always on Home: a small "Sign in" pill at the top
// right of the welcome screen and the dashboard, on a device that isn't signed
// in where sign-in is set up. It stays quieter than "Make a board", and opens
// the same sheet as everywhere else.

import { useState, type ReactNode } from "react";
import { cx } from "../../components/ui";
import { useAuthSetup } from "../../lib/auth";
import { useAccount } from "../../lib/identity";
import { haptic } from "../../lib/native";
import { SignInSheet } from "./SignInSheet";

export interface SignInPillProps {
  /** The sheet's title and description (SignInSheet's defaults otherwise). */
  title?: ReactNode;
  description?: ReactNode;
  className?: string;
  "data-testid"?: string;
}

export function SignInPill({ title, description, className, "data-testid": testId = "home-signin" }: SignInPillProps) {
  const account = useAccount();
  const setup = useAuthSetup();
  const [open, setOpen] = useState(false);
  if (account || !setup.ready || setup.providers.length === 0) return null;
  return (
    <>
      <button
        type="button"
        data-testid={testId}
        onClick={() => {
          void haptic("selection");
          setOpen(true);
        }}
        className={cx(
          // 32pt tall so it sits inside the 44pt top bar with room above and below; tap-target keeps the 44pt hit area.
          "pressable tap-target inline-flex h-8 items-center rounded-full bg-surface-3 px-3.5 text-subhead font-extrabold text-ink ring-1 ring-inset ring-line-strong transition-colors hover:bg-surface-4",
          className,
        )}
      >
        Sign in
      </button>
      <SignInSheet open={open} onClose={() => setOpen(false)} title={title} description={description} />
    </>
  );
}
