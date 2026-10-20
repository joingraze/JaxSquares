// Profile → Account. Signed out: "Sign in to keep your boards on every device"
// with the sign-in buttons (hidden entirely when no provider is set up here).
// Signed in: "Signed in with Apple · email", Sign out and Delete account, each
// behind a confirm sheet that says what happens; and "Another way to sign in"
// for a provider the account doesn't have yet (addSignIn), which combines two
// accounts after a confirm when that sign-in already has one.

import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ACCOUNT_EXISTS_CODE, type AccountInfo, type AuthProvider, type SignInInput } from "../../../shared/types";
import { CheckIcon, XIcon } from "../../components/icons";
import { BottomSheet, Button, ListGroup, ListRow, cx, useToast } from "../../components/ui";
import { ApiError, errorMessage } from "../../lib/api";
import { addSignIn, deleteAccount, PROVIDER_LABEL, signOut, useAuthSetup } from "../../lib/auth";
import { useAccount } from "../../lib/identity";
import { useHostPass } from "../../lib/useHostPass";
import { useResolvedTheme } from "../../lib/theme";
import { AppleLogo, GoogleLogo } from "./ProviderButtons";
import { SignInButtons } from "./SignInButtons";

export function AccountSection() {
  const account = useAccount();
  const setup = useAuthSetup();
  if (account) return <SignedIn account={account} />;
  // Nothing to offer on this platform (or still finding out): no section at all.
  if (!setup.ready || setup.providers.length === 0) return null;
  return (
    <div data-testid="account-section" data-state="signed-out">
      <ListGroup
        title="Account"
        footer={
          <>
            We use your sign-in only to find your boards.{" "}
            <Link to="/privacy" className="font-semibold text-ink-muted underline-offset-2 hover:underline">
              Privacy
            </Link>
          </>
        }
      >
        <div className="px-4 pb-4 pt-3.5">
          <p className="text-callout font-bold text-ink">Sign in to keep your boards on every device</p>
          <p className="mt-1 text-subhead text-ink-muted">Your squares, the boards you host and your invites follow you. Playing never needs an account.</p>
          <div className="mt-3.5">
            <SignInButtons setup={setup} />
          </div>
        </div>
      </ListGroup>
    </div>
  );
}

/** The provider's mark in a round tile, drawn to its brand (Apple's black/white, Google's color G on white). */
export function ProviderMark({ provider }: { provider: AuthProvider }) {
  const dark = useResolvedTheme() === "dark";
  if (provider === "apple") {
    return (
      <span aria-hidden className={cx("grid h-9 w-9 place-items-center rounded-full", dark ? "bg-white text-black" : "bg-black text-white")}>
        <AppleLogo className="-mt-0.5 h-[17px] w-[14px]" />
      </span>
    );
  }
  return (
    <span aria-hidden className="grid h-9 w-9 place-items-center rounded-full bg-white ring-1 ring-inset ring-[#747775]/40">
      <GoogleLogo className="h-[18px] w-[18px]" />
    </span>
  );
}

/** Every way the account signs in (an older server only says the first). */
const signInsOf = (account: AccountInfo): AuthProvider[] => account.providers ?? [account.provider];
const namesOf = (providers: AuthProvider[]) => providers.map((p) => PROVIDER_LABEL[p]).join(" and ");

type PendingCombine = { provider: AuthProvider; input: SignInInput };

function SignedIn({ account }: { account: AccountInfo }) {
  const [confirm, setConfirm] = useState<"sign-out" | "delete" | null>(null);
  const setup = useAuthSetup();
  const have = signInsOf(account);
  const missing = setup.providers.filter((p) => !have.includes(p));
  const [combine, setCombine] = useState<PendingCombine | null>(null);
  return (
    <div data-testid="account-section" data-state="signed-in">
      <ListGroup title="Account" footer="Your boards, squares and invites follow you to every device you sign in on.">
        <ListRow
          data-testid="account-signed-in"
          leading={<ProviderMark provider={account.provider} />}
          title={`Signed in with ${namesOf(have)}`}
          subtitle={account.email ?? account.name ?? (account.provider === "apple" ? "Email kept private" : undefined)}
        />
        <ListRow data-testid="account-sign-out" title="Sign out" onClick={() => setConfirm("sign-out")} chevron />
        <ListRow data-testid="account-delete" title="Delete account" destructive onClick={() => setConfirm("delete")} />
      </ListGroup>
      {missing.length > 0 && (
        <div data-testid="account-add" className="mt-6">
          <ListGroup title="Another way to sign in" footer={`Add ${namesOf(missing)} and either one opens this account, on any device.`}>
            <div className="px-4 py-3.5">
              <SignInButtons
                setup={setup}
                only={missing}
                submit={addSignIn}
                success={{ title: "Sign-in added", description: "Either one opens this account now, on any device." }}
                onFailure={(err, provider, input) => {
                  if (!(err instanceof ApiError && (err.body as { code?: unknown } | undefined)?.code === ACCOUNT_EXISTS_CODE)) return false;
                  setCombine({ provider, input });
                  return true;
                }}
              />
            </div>
          </ListGroup>
        </div>
      )}
      <CombineSheet pending={combine} onClose={() => setCombine(null)} />
      <SignOutSheet open={confirm === "sign-out"} onClose={() => setConfirm(null)} />
      <DeleteAccountSheet open={confirm === "delete"} onClose={() => setConfirm(null)} account={account} />
    </div>
  );
}

/**
 * The sign-in being added already has its own JaxSquares account: combine it
 * into this one (its boards, squares, host controls and passes move over, and
 * both sign-ins open this account), or keep them apart.
 */
function CombineSheet({ pending, onClose }: { pending: PendingCombine | null; onClose: () => void }) {
  // Kept while the sheet slides away, so its words don't change.
  const [shown, setShown] = useState<PendingCombine | null>(pending);
  if (pending && pending !== shown) setShown(pending);
  const name = shown ? PROVIDER_LABEL[shown.provider] : "";
  const { busy, go } = useAccountAction(
    async () => {
      if (shown) await addSignIn(shown.provider, { ...shown.input, combine: true });
    },
    { title: "Accounts combined", description: "Everything from both is in this account now." },
    "Couldn't combine them",
    onClose,
  );
  return (
    <BottomSheet
      open={!!pending}
      onClose={onClose}
      dismissible={!busy}
      title="Combine your accounts?"
      description={`That ${name} sign-in already has its own JaxSquares account.`}
      footer={
        <div className="flex flex-col gap-2">
          <Button size="lg" block loading={busy} onClick={() => void go()} data-testid="account-combine-confirm">
            Combine accounts
          </Button>
          <Button variant="ghost" size="lg" block disabled={busy} onClick={onClose}>
            Keep them apart
          </Button>
        </div>
      }
    >
      <ul data-testid="account-combine-sheet" className="flex flex-col gap-2.5 pb-1 text-callout text-ink">
        <Line kept>Its boards, squares and host controls move into this account.</Line>
        <Line kept>A Host Pass or Club Pass on it comes along.</Line>
        <Line kept>{name} and your current sign-in both open this account, on every device.</Line>
        <Line>The other account itself. This can't be undone.</Line>
      </ul>
    </BottomSheet>
  );
}

/** Runs an account action from a confirm sheet: busy while it runs, a toast either way. */
function useAccountAction(run: () => Promise<void>, done: { title: string; description: string }, failTitle: string, onClose: () => void) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try {
      await run();
      onClose();
      toast.success(done.title, done.description);
    } catch (err) {
      toast.error(failTitle, errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return { busy, go };
}

export function SignOutSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { busy, go } = useAccountAction(signOut, { title: "Signed out", description: "This device is starting fresh." }, "Couldn't sign out", onClose);
  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      dismissible={!busy}
      title="Sign out?"
      description="Signing out takes your boards off this device. Sign back in to get them back."
      footer={
        <div className="flex flex-col gap-2">
          <Button size="lg" block loading={busy} onClick={() => void go()} data-testid="account-sign-out-confirm">
            Sign out
          </Button>
          <Button variant="ghost" size="lg" block disabled={busy} onClick={onClose}>
            Stay signed in
          </Button>
        </div>
      }
    />
  );
}

function Line({ children, kept }: { children: ReactNode; kept?: boolean }) {
  return (
    <li className="flex items-start gap-2.5">
      <span
        aria-hidden
        className={cx(
          "mt-px grid h-5 w-5 shrink-0 place-items-center rounded-full",
          kept ? "bg-brand-400/15 text-ink-brand" : "bg-danger-500/15 text-ink-danger",
        )}
      >
        {kept ? <CheckIcon size={12} strokeWidth={3.2} /> : <XIcon size={12} strokeWidth={3} />}
      </span>
      <span>{children}</span>
    </li>
  );
}

export function DeleteAccountSheet({ open, onClose, account }: { open: boolean; onClose: () => void; account: AccountInfo }) {
  const { busy, go } = useAccountAction(
    deleteAccount,
    { title: "Account deleted", description: "This device is starting fresh." },
    "Couldn't delete your account",
    onClose,
  );
  const have = signInsOf(account);
  // A Host Pass on the account: a web one stops renewing (nobody could manage it
  // afterwards); an App Store one is Apple's to cancel, and Restore purchases brings it back.
  const { pass } = useHostPass(false);
  const renewing = pass?.active && pass.autoRenew ? pass.provider : null;
  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      dismissible={!busy}
      title="Delete your account?"
      description="This can't be undone."
      footer={
        <div className="flex flex-col gap-2">
          <Button variant="danger" size="lg" block loading={busy} onClick={() => void go()} data-testid="account-delete-confirm">
            Delete account
          </Button>
          <Button variant="ghost" size="lg" block disabled={busy} onClick={onClose}>
            Keep my account
          </Button>
        </div>
      }
    >
      <div data-testid="account-delete-sheet" className="flex flex-col gap-5 pb-1 text-callout text-ink">
        <section>
          <h3 className="eyebrow mb-2 text-ink-subtle">Deleted</h3>
          <ul className="flex flex-col gap-2.5">
            <Line>
              Your sign-in with {namesOf(have)}
              {account.email ? <span className="text-ink-muted"> ({account.email})</span> : null}
            </Line>
            <Line>The link between your devices and your boards</Line>
            {have.includes("apple") && <Line>JaxSquares' access to your Apple ID</Line>}
            {renewing === "stripe" && <Line>Your Host Pass renewal. It won't be charged again.</Line>}
          </ul>
        </section>
        <section>
          <h3 className="eyebrow mb-2 text-ink-subtle">Stays</h3>
          <ul className="flex flex-col gap-2.5">
            <Line kept>
              Your boards and squares, so your friends' games carry on. They won't be tied to you, and you won't be able to change them from any device.
            </Line>
            <Line kept>Playing. This device starts fresh, and no account is needed to keep going.</Line>
            {renewing === "iap" && (
              <Line kept>
                Your Host Pass App Store subscription. It keeps renewing until you cancel it in Settings › your name › Subscriptions. Restore purchases
                brings it back on any device.
              </Line>
            )}
          </ul>
        </section>
      </div>
    </BottomSheet>
  );
}
