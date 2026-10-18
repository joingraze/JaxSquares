// The sign-in buttons, drawn to each brand's rules.
//
// - Apple (Human Interface Guidelines, "Sign in with Apple"): the Apple logo and
//   "Sign in with Apple" in the system font; the black button on light
//   backgrounds, the white one on dark. Corner radius may match the app's.
// - Google (Sign in with Google branding guidelines), drawn in the iOS app,
//   where Google's own button can't render: the full-color "G" on white with a
//   #747775 stroke and #1F1F1F text (light), or on #131314 with a #8E918F
//   stroke and #E3E3E3 text (dark); "Sign in with Google" in Roboto Medium
//   (the system sans where Roboto isn't installed); pill shape. On the web
//   GoogleWebButton renders Google's own button (Google Identity Services).
//
// Both follow the app theme (useResolvedTheme), and stay 44pt tall.

import { useEffect, useRef, useState } from "react";
import type { SignInInput } from "../../../shared/types";
import { Spinner, cx } from "../../components/ui";
import { clampGoogleWidth, loadGoogleIdentity, renderGoogleButton } from "../../lib/authSdk";
import { useResolvedTheme } from "../../lib/theme";

const SYSTEM_FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", system-ui, sans-serif';
const ROBOTO = 'Roboto, "Roboto Medium", system-ui, -apple-system, "Segoe UI", sans-serif';

export function AppleLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 814 1000" aria-hidden focusable="false" className={className} fill="currentColor">
      <path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76.5 0-103.7 40.8-165.9 40.8s-105.6-57-155.5-127C46.7 790.7 0 663 0 541.8c0-194.4 126.4-297.5 250.8-297.5 66.1 0 121.2 43.4 162.7 43.4 39.5 0 101.1-46 176.3-46 28.5 0 130.9 2.6 198.3 99.2zm-234-181.5c31.1-36.9 53.1-88.1 53.1-139.3 0-7.1-.6-14.3-1.9-20.1-50.6 1.9-110.8 33.7-147.1 75.8-28.5 32.4-55.1 83.6-55.1 135.5 0 7.8 1.3 15.6 1.9 18.1 3.2.6 8.4 1.3 13.6 1.3 45.4 0 102.5-30.4 135.5-71.3z" />
    </svg>
  );
}

export function GoogleLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden focusable="false" className={className}>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

interface BrandButtonProps {
  onClick: () => void;
  busy?: boolean;
  disabled?: boolean;
  "data-testid"?: string;
}

/** "Sign in with Apple": white on the dark theme, black on the light one. */
export function AppleButton({ onClick, busy, disabled, "data-testid": testId }: BrandButtonProps) {
  const dark = useResolvedTheme() === "dark";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      data-testid={testId}
      className={cx(
        "pressable relative flex h-11 w-full select-none items-center justify-center gap-2 rounded-full px-5 text-[17px] font-semibold leading-none tracking-[-0.02em]",
        "disabled:opacity-60",
        dark ? "bg-white text-black" : "bg-black text-white",
      )}
      style={{ fontFamily: SYSTEM_FONT }}
    >
      {busy ? <Spinner size={18} /> : <AppleLogo className="-mt-0.5 h-[18px] w-[15px] shrink-0" />}
      Sign in with Apple
    </button>
  );
}

/** "Sign in with Google" drawn natively (the iOS app). */
export function GoogleButton({ onClick, busy, disabled, "data-testid": testId }: BrandButtonProps) {
  const dark = useResolvedTheme() === "dark";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      data-testid={testId}
      className={cx(
        "pressable relative flex h-11 w-full select-none items-center justify-center gap-3 rounded-full border px-4 text-[16px] font-medium leading-none tracking-[0.01em]",
        "disabled:opacity-60",
        dark ? "border-[#8E918F] bg-[#131314] text-[#E3E3E3]" : "border-[#747775] bg-white text-[#1F1F1F]",
      )}
      style={{ fontFamily: ROBOTO }}
    >
      {busy ? <Spinner size={18} /> : <GoogleLogo className="h-5 w-5 shrink-0" />}
      Sign in with Google
    </button>
  );
}

/**
 * Google's own "Sign in with Google" button (web), sized to its container.
 * Shows a same-sized placeholder until Google's script has drawn it.
 */
export function GoogleWebButton({
  googleClientId,
  onToken,
  onUnavailable,
  disabled,
}: {
  googleClientId: string;
  onToken: (input: SignInInput) => void;
  onUnavailable?: (message: string) => void;
  disabled?: boolean;
}) {
  const theme = useResolvedTheme();
  const box = useRef<HTMLDivElement>(null);
  const slot = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  // A new render (fresh nonce) after each token, and on theme or size changes.
  const [round, setRound] = useState(0);
  const onTokenRef = useRef(onToken);
  onTokenRef.current = onToken;
  const onUnavailableRef = useRef(onUnavailable);
  onUnavailableRef.current = onUnavailable;

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    let alive = true;
    void loadGoogleIdentity().then(
      () => {
        if (!alive || !slot.current || !box.current) return;
        try {
          cleanup = renderGoogleButton(slot.current, {
            googleClientId,
            theme,
            width: clampGoogleWidth(box.current.clientWidth || 320),
            onToken: (input) => {
              onTokenRef.current(input);
              setRound((n) => n + 1);
            },
          });
          setReady(true);
        } catch (err) {
          onUnavailableRef.current?.(err instanceof Error ? err.message : "Sign in with Google isn't available right now.");
        }
      },
      (err: unknown) => alive && onUnavailableRef.current?.(err instanceof Error ? err.message : "Couldn't load Sign in with Google."),
    );
    return () => {
      alive = false;
      cleanup?.();
    };
  }, [googleClientId, theme, round]);

  return (
    <div
      ref={box}
      data-testid="signin-google"
      className={cx("relative flex h-11 w-full items-center justify-center", disabled && "pointer-events-none opacity-60")}
    >
      {!ready && <div aria-hidden className="absolute inset-x-0 top-0.5 h-10 animate-pulse rounded-full bg-ink/8" />}
      <div ref={slot} className="relative flex justify-center [color-scheme:normal]" />
    </div>
  );
}
