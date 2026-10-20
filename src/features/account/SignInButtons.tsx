// The sign-in buttons for this platform, in order (Apple first in the iOS
// app), running the whole flow: the provider's sheet, then POST /api/auth/*,
// then adopting the account's boards (completeSignIn). Used by the Profile
// account section and SignInSheet.

import { useEffect, useState } from "react";
import type { AuthProvider, MeResponse, SignInInput } from "../../../shared/types";
import { Skeleton, useToast } from "../../components/ui";
import { errorMessage } from "../../lib/api";
import { completeSignIn, SignInCancelled, useAuthSetup } from "../../lib/auth";
import { loadAppleJs, nativeSignIn, webAppleSignIn } from "../../lib/authSdk";
import { isNative } from "../../lib/native";
import { AppleButton, GoogleButton, GoogleWebButton } from "./ProviderButtons";

export interface SignInButtonsProps {
  /** After the server has signed this device in and its boards are here. */
  onSignedIn?: (me: MeResponse) => void;
  /** The setup the parent already loaded (else this loads it). */
  setup?: ReturnType<typeof useAuthSetup>;
}

export function SignInButtons({ onSignedIn, setup }: SignInButtonsProps) {
  const own = useAuthSetup();
  const { config, providers, ready } = setup ?? own;
  const toast = useToast();
  const [busy, setBusy] = useState<AuthProvider | null>(null);
  const [googleProblem, setGoogleProblem] = useState<string | null>(null);
  const native = isNative();
  const offersApple = providers.includes("apple");

  // Apple JS has to be loaded before the tap: Safari only opens its popup straight from one.
  useEffect(() => {
    if (!native && offersApple) void loadAppleJs().catch(() => undefined);
  }, [native, offersApple]);

  const finish = async (provider: AuthProvider, input: SignInInput) => {
    setBusy(provider);
    try {
      const me = await completeSignIn(provider, input);
      toast.success("You're signed in", "Your boards follow you to every device you sign in on.");
      onSignedIn?.(me);
    } catch (err) {
      toast.error("Couldn't sign in", errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const fail = (err: unknown) => {
    setBusy(null);
    if (!(err instanceof SignInCancelled)) toast.error("Couldn't sign in", errorMessage(err));
  };

  const start = (provider: AuthProvider) => {
    if (busy || !config) return;
    // Started before any await, so the web popup opens inside the tap.
    let pending: Promise<SignInInput>;
    try {
      pending = native ? nativeSignIn(provider, config) : webAppleSignIn(config.appleServicesId ?? "");
    } catch (err) {
      fail(err);
      return;
    }
    setBusy(provider);
    pending.then((input) => finish(provider, input), fail);
  };

  if (!ready) {
    return (
      <div className="flex flex-col gap-2.5" aria-hidden>
        <Skeleton className="h-11 rounded-full" />
        <Skeleton className="h-11 rounded-full" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
      {providers.map((provider) => {
        if (provider === "apple") {
          return (
            <AppleButton
              key="apple"
              data-testid="signin-apple"
              busy={busy === "apple"}
              disabled={busy !== null && busy !== "apple"}
              onClick={() => start("apple")}
            />
          );
        }
        if (native) {
          return (
            <GoogleButton
              key="google"
              data-testid="signin-google"
              busy={busy === "google"}
              disabled={busy !== null && busy !== "google"}
              onClick={() => start("google")}
            />
          );
        }
        return googleProblem ? (
          <p key="google" className="text-center text-footnote text-ink-subtle">
            {googleProblem}
          </p>
        ) : (
          <GoogleWebButton
            key="google"
            googleClientId={config?.googleWebClientId ?? ""}
            disabled={busy !== null}
            onToken={(input) => void finish("google", input)}
            onUnavailable={setGoogleProblem}
          />
        );
      })}
    </div>
  );
}
