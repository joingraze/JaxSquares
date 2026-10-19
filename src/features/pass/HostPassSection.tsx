// Profile → Host Pass, next to Account. No pass: a short pitch and "Get the
// Host Pass", which goes through startPassPurchase (the web asks for a sign-in
// first) and opens the checkout sheet in pass mode. Active: "Active · renews
// Oct 19, 2027" (or "Ends Oct 19, 2027" with auto-renew off) and Manage: Apple's
// subscription management in the iOS app, a Stripe Customer Portal on the web,
// and "End test pass" for the no-charge test pass. The iOS app always offers
// "Restore purchases" (App Store guideline 3.1.1); it never shows the web price
// or Stripe (a pass bought on the web just says to manage it there).

import { lazy, Suspense, useState } from "react";
import type { HostPass, MeResponse } from "../../../shared/types";
import { CrownIcon, RefreshIcon } from "../../components/icons";
import { Badge, Button, ListGroup, ListRow, Skeleton, useToast } from "../../components/ui";
import { CheckoutError, endTestPass, manageAppStoreSubscriptions, passPortalUrl, restorePassPurchases } from "../../lib/checkout";
import { setHostPassState } from "../../lib/hostPassStore";
import { useAccount } from "../../lib/identity";
import { platform } from "../../lib/native";
import { startPassPurchase, useHostPass, useHostPassPrice, useHostPrices } from "../../lib/useHostPass";
import { passPaysOffAt, passStatusLine, paysForItself, perYear } from "./passText";

const CheckoutSheet = lazy(() => import("../create/CheckoutSheet").then((m) => ({ default: m.CheckoutSheet })));
const SignInSheet = lazy(() => import("../account/SignInSheet").then((m) => ({ default: m.SignInSheet })));

const SHEET_EXIT_MS = 320;

function PassMark() {
  return (
    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gold-400 text-ink-inverse shadow-[inset_0_-2px_0_rgb(0_0_0/0.18),inset_0_1px_0_rgb(255_255_255/0.4)]">
      <CrownIcon size={17} strokeWidth={2.3} />
    </span>
  );
}

export function HostPassSection() {
  const toast = useToast();
  const { pass, loaded } = useHostPass();
  const { price, payments } = useHostPassPrice();
  // "Pays for itself by your fifth board": from the two prices this device shows (hidden when either is unknown).
  const amounts = useHostPrices(payments !== null, payments);
  const paysOffAt = passPaysOffAt(amounts.pass, amounts.board);
  const signedIn = useAccount() !== null;
  const on = platform();
  const [buyOpen, setBuyOpen] = useState(false);
  const [signInOpen, setSignInOpen] = useState(false);
  const [busy, setBusy] = useState<"manage" | "restore" | null>(null);

  if (!loaded || !payments) {
    return (
      <ListGroup title="Host Pass">
        <div className="px-4 py-4">
          <Skeleton className="h-12 w-full rounded-xl" />
        </div>
      </ListGroup>
    );
  }

  const start = startPassPurchase(payments, on, signedIn);
  const test = payments.mode === "test";
  const active = pass?.active === true;
  // Not sold here and never held: nothing to show.
  if (!pass && start.kind === "unavailable" && on !== "ios") return null;

  const get = () => {
    if (start.kind === "sign-in") return setSignInOpen(true);
    if (start.kind === "checkout") setBuyOpen(true);
  };

  const signedInFor = (me: MeResponse) => {
    if (me.hostPass?.active) {
      toast.success("Your Host Pass is on this account", "Every board you host is covered.");
      return;
    }
    setTimeout(() => setBuyOpen(true), SHEET_EXIT_MS);
  };

  const run = async (kind: "manage" | "restore", work: () => Promise<void>) => {
    setBusy(kind);
    try {
      await work();
    } catch (err) {
      toast.error(kind === "restore" ? "Couldn't restore purchases" : "Couldn't open Manage", err instanceof CheckoutError || err instanceof Error ? err.message : "Try again.");
    } finally {
      setBusy(null);
    }
  };

  const manage = () =>
    run("manage", async () => {
      if (!pass) return;
      if (pass.provider === "test") {
        setHostPassState(await endTestPass());
        toast.show({ tone: "neutral", title: "Test pass ended", description: "Get it again any time. It's free in test mode." });
      } else if (pass.provider === "iap") {
        await manageAppStoreSubscriptions();
      } else {
        window.location.assign(await passPortalUrl());
      }
    });

  const restore = () =>
    run("restore", async () => {
      const result = await restorePassPurchases(payments.hostPass?.iapProductId);
      setHostPassState(result);
      if (result.restored > 0 && result.pass?.active) toast.success("Host Pass restored", "Every board you host is covered.");
      else toast.show({ tone: "neutral", title: "No Host Pass found", description: "This Apple ID has no active Host Pass to restore." });
    });

  const state = active ? "active" : pass ? pass.status : "none";
  return (
    <div data-testid="host-pass-section" data-state={state}>
      <ListGroup title="Host Pass" footer={footer(pass, on, test)}>
        {active && pass ? (
          <ActiveRows pass={pass} on={on} test={pass.provider === "test"} busy={busy === "manage"} onManage={() => void manage()} canEnd={test} />
        ) : (
          <div className="px-4 pb-4 pt-3.5">
            <div className="flex items-start gap-3">
              <PassMark />
              <div className="min-w-0 flex-1">
                <p className="text-callout font-bold text-ink">Every board you host, for a year</p>
                <p className="mt-1 text-subhead text-ink-muted">
                  Draw the numbers with no host fee.{paysOffAt ? ` ${paysForItself(paysOffAt)}.` : ""}
                </p>
                {pass && (
                  <p data-testid="pass-status" className="mt-1.5 text-footnote font-semibold text-ink-subtle">
                    {passStatusLine(pass)}
                  </p>
                )}
              </div>
            </div>
            {start.kind !== "unavailable" && (
              <Button data-testid="pass-get" block className="mt-3.5" onClick={get}>
                {test ? "Get a test pass · no charge" : `Get the Host Pass · ${perYear(price)}`}
              </Button>
            )}
            {pass?.status === "past_due" && (
              <Button data-testid="pass-manage" variant="secondary" block className="mt-2" loading={busy === "manage"} onClick={() => void manage()}>
                Manage
              </Button>
            )}
          </div>
        )}
        {on === "ios" && (
          <ListRow
            data-testid="pass-restore"
            leading={<RefreshIcon size={18} className="text-ink-muted" />}
            title="Restore purchases"
            subtitle="Bought the Host Pass with this Apple ID before?"
            onClick={busy ? undefined : () => void restore()}
            trailing={busy === "restore" ? <span className="text-footnote text-ink-subtle">Checking…</span> : undefined}
          />
        )}
      </ListGroup>
      {(buyOpen || signInOpen) && (
        <Suspense fallback={null}>
          <CheckoutSheet
            open={buyOpen}
            board={null}
            purpose="pass"
            payments={payments}
            onPassActive={(next) => {
              setBuyOpen(false);
              if (next?.pass?.active) toast.success("You've got the Host Pass", "Every board you host for a year is covered.");
              else toast.show({ tone: "neutral", title: "Payment received", description: "Your Host Pass is still confirming. It shows up here in a moment." });
            }}
            onSignInForPass={() => {
              setBuyOpen(false);
              setTimeout(() => setSignInOpen(true), SHEET_EXIT_MS);
            }}
            onClose={() => setBuyOpen(false)}
          />
          <SignInSheet
            open={signInOpen}
            onClose={() => setSignInOpen(false)}
            title="Sign in to get the Host Pass"
            description="Your Host Pass stays with your account, so every board you host on any device is covered."
            onSignedIn={signedInFor}
          />
        </Suspense>
      )}
    </div>
  );
}

function ActiveRows({
  pass,
  on,
  test,
  busy,
  canEnd,
  onManage,
}: {
  pass: HostPass;
  on: string;
  test: boolean;
  busy: boolean;
  canEnd: boolean;
  onManage: () => void;
}) {
  // Manage where it was bought: the App Store's own page in the iOS app, Stripe's portal on the web.
  const manageHere = test ? canEnd : pass.provider === "iap" ? on === "ios" : on !== "ios";
  return (
    <>
      <ListRow
        data-testid="pass-status"
        leading={<PassMark />}
        title={
          <span className="flex items-center gap-2">
            Host Pass
            {test && <Badge tone="outline">Test</Badge>}
          </span>
        }
        subtitle={test ? `Test pass · no charge · ${passStatusLine(pass).replace(/^Active · /, "")}` : passStatusLine(pass)}
      />
      {manageHere && (
        <ListRow
          data-testid="pass-manage"
          title={test ? "End test pass" : "Manage"}
          subtitle={test ? undefined : pass.provider === "iap" ? "Cancel or change it in your Apple ID's subscriptions" : "Update your card, see receipts or cancel"}
          onClick={busy ? undefined : onManage}
          trailing={busy ? <span className="text-footnote text-ink-subtle">Opening…</span> : undefined}
          chevron={!test}
        />
      )}
    </>
  );
}

function footer(pass: HostPass | null, on: string, test: boolean): string {
  if (pass?.active && pass.provider === "iap" && on !== "ios") return "Bought in the iPhone app. Manage it on your iPhone: Settings › your name › Subscriptions.";
  if (pass?.active && pass.provider === "stripe" && on === "ios") return "Bought on the web. Manage it where you bought it.";
  if (test) return "Test mode: the pass is free and lasts a year. Boards you draw while it's active stay drawn after it ends.";
  return "Covers the host fee on every board you host while it's active. Boards you draw stay drawn after it ends.";
}
