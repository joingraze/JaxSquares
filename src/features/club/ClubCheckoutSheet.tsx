// Buys the Annual Pass + Venue on the web (docs/payments.md "Pricing"): $99.99
// a year, auto-renewing, through the same Stripe Billing flow as the Annual
// Pass (its own Price), or the no-charge test pass in test mode. `upgrade`: the
// buyer already has a web Annual Pass, so the Venue add-on is added to it
// instead (POST /api/payments/pass/stripe/venue: what's left of this year's
// difference is charged now to the card the pass renews on; it renews at the
// venue price). Never in the iOS app: ClubSection doesn't offer it there, and
// clubCheckoutMethod says null on iOS (App Store guidelines 3.1.1 /
// 3.1.3(b)). A web subscription needs an account, so a signed-out browser is
// sent to sign in first (onSignIn), like the Annual Pass. Its confirm carries
// data-testid="pay-confirm".

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { VENUE_ADDON_NAME, VENUE_PASS_NAME } from "../../../shared/pricing";
import { ACCOUNT_REQUIRED_CODE, UPGRADE_PASS_CODE, type HostPassState, type PaymentConfig } from "../../../shared/types";
import { AlertIcon, CheckIcon } from "../../components/icons";
import { BottomSheet, Button, celebrate, cx, Skeleton } from "../../components/ui";
import {
  CheckoutError,
  clubCheckoutMethod,
  clubPassPrice,
  confirmPassPaid,
  createPassIntent,
  formatPrice,
  mountCardForm,
  mountWalletButton,
  onStripeTestKeys,
  preloadCheckout,
  startTestPass,
  STRIPE_TEST_NOTE,
  upgradePassToVenue,
  type CardForm,
  type CheckoutMethod,
  type MountedCheckout,
} from "../../lib/checkout";
import { setHostPassState } from "../../lib/hostPassStore";
import { useAccount } from "../../lib/identity";
import { haptic, platform } from "../../lib/native";
import { perYear } from "../pass/passText";
import { ClubPerks } from "./ClubPerks";

export interface ClubCheckoutSheetProps {
  open: boolean;
  payments: PaymentConfig;
  /** The buyer holds a web Annual Pass: add the Venue add-on to it rather than sell a second pass. */
  upgrade?: boolean;
  /** The Venue add-on is on (the identity's state), or null while a web payment is still confirming. */
  onActive: (state: HostPassState | null) => void;
  /** The web pass needs an account: close this, sign in, then open it again. */
  onSignIn: () => void;
  onClose: () => void;
}

type Phase = "ready" | "paying" | "paid";
const PAID_BEAT_MS = 520;

export function ClubCheckoutSheet({ open, payments, upgrade: upgradeAsked = false, onActive, onSignIn, onClose }: ClubCheckoutSheetProps) {
  const on = platform();
  const signedIn = useAccount() !== null;
  const wanted = clubCheckoutMethod(payments, on);
  // Told mid-checkout that this account holds a web Annual Pass after all (409 UPGRADE_PASS_CODE).
  const [upgradeFound, setUpgradeFound] = useState(false);
  const upgrade = (upgradeAsked || upgradeFound) && wanted !== "test" && wanted !== null;
  const name = upgrade ? VENUE_ADDON_NAME : VENUE_PASS_NAME;
  const [method, setMethod] = useState<CheckoutMethod | null>(wanted);
  const [phase, setPhase] = useState<Phase>("ready");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [charge, setCharge] = useState<{ amountCents: number; currency: string } | null>(null);
  const [cardComplete, setCardComplete] = useState(false);
  const [cardReady, setCardReady] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const walletRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const cardForm = useRef<CardForm | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef({ onActive, onSignIn });
  latest.current = { onActive, onSignIn };
  const needsSignIn = (method === "wallet" || method === "card") && !signedIn;

  useEffect(() => {
    if (!open) return;
    setPhase("ready");
    setError(null);
    setNotice(null);
    setClientSecret(null);
    setCharge(null);
    setCardComplete(false);
    setMethod(wanted);
    preloadCheckout(payments, on);
  }, [open, wanted, payments, on]);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const succeed = useCallback((state: HostPassState | null) => {
    setPhase("paid");
    setError(null);
    void haptic("success");
    void celebrate("pop", { colors: ["#ffd56b", "#ffc233", "#c6f432", "#ffffff"], origin: { x: 0.5, y: 0.85 } });
    // The new state after the beat, and after the caller's own answer: it turns Profile's pitch (and
    // this sheet with it) into the holder's settings.
    timer.current = setTimeout(() => {
      latest.current.onActive(state);
      if (state) setHostPassState(state);
    }, PAID_BEAT_MS);
  }, []);

  const fail = useCallback(
    (err: unknown) => {
      if (err instanceof CheckoutError && err.status === 409) {
        if (err.pass?.club?.active) return succeed(err.pass);
        if (err.code === ACCOUNT_REQUIRED_CODE) return latest.current.onSignIn();
        if (err.code === UPGRADE_PASS_CODE) {
          setPhase("ready");
          setUpgradeFound(true);
          return;
        }
      }
      setPhase("ready");
      setError(err instanceof Error && err.message ? err.message : "That didn't go through. Try again.");
      void haptic("error");
    },
    [succeed],
  );

  // Stripe needs the subscription's first payment (not for adding the Venue add-on: that charges the pass's card).
  useEffect(() => {
    if (!open || upgrade || (method !== "wallet" && method !== "card") || clientSecret || needsSignIn) return;
    let cancelled = false;
    createPassIntent("club")
      .then((r) => {
        if (cancelled) return;
        setCharge({ amountCents: r.amountCents, currency: r.currency });
        setClientSecret(r.clientSecret);
      })
      .catch((err: unknown) => !cancelled && fail(err));
    return () => {
      cancelled = true;
    };
  }, [open, upgrade, method, clientSecret, needsSignIn, fail, attempt]);

  const confirmPaid = useCallback(async () => succeed(await confirmPassPaid("club")), [succeed]);

  useEffect(() => {
    const el = walletRef.current;
    if (!open || upgrade || method !== "wallet" || !clientSecret || !el) return;
    let handle: MountedCheckout | null = null;
    let disposed = false;
    const amountCents = charge?.amountCents ?? payments.clubPass?.priceCents ?? 0;
    const origin = typeof location !== "undefined" ? location.origin : "https://jaxsquares.com";
    void mountWalletButton(el, {
      clientSecret,
      amountCents,
      label: `${VENUE_PASS_NAME} (1 year)`,
      publishableKey: payments.stripePublishableKey,
      applePay: {
        recurringPaymentRequest: {
          paymentDescription: `JaxSquares ${VENUE_PASS_NAME}`,
          managementURL: `${origin}/me`,
          regularBilling: { label: VENUE_PASS_NAME, amount: amountCents, recurringPaymentIntervalUnit: "year", recurringPaymentIntervalCount: 1 },
        },
      },
      onPaid: () => {
        setPhase("paying");
        confirmPaid().catch(fail);
      },
      onUnavailable: () => !disposed && setMethod("card"),
      onCancel: () => setNotice(`No charge. You can get the ${VENUE_PASS_NAME} any time.`),
      onError: (message) => {
        setError(message);
        void haptic("error");
      },
    }).then((h) => {
      if (disposed) h.destroy();
      else handle = h;
    });
    return () => {
      disposed = true;
      handle?.destroy();
    };
  }, [open, upgrade, method, clientSecret, charge, payments, confirmPaid, fail]);

  useEffect(() => {
    const el = cardRef.current;
    if (!open || upgrade || method !== "card" || !clientSecret || !el) return;
    let disposed = false;
    mountCardForm(el, { clientSecret, publishableKey: payments.stripePublishableKey, onChange: setCardComplete }).then(
      (form) => {
        if (disposed) form.destroy();
        else {
          cardForm.current = form;
          setCardReady(true);
        }
      },
      (err: unknown) => !disposed && fail(err),
    );
    return () => {
      disposed = true;
      cardForm.current?.destroy();
      cardForm.current = null;
      setCardReady(false);
    };
  }, [open, upgrade, method, clientSecret, payments, fail, attempt]);

  const confirm = async () => {
    if (phase !== "ready") return;
    setError(null);
    setNotice(null);
    setPhase("paying");
    try {
      if (upgrade) succeed(await upgradePassToVenue());
      else if (method === "test") succeed(await startTestPass("club"));
      else if (method === "card") {
        const form = cardForm.current;
        if (!form) return setPhase("ready");
        const r = await form.submit();
        if (r.status === "failed") throw new CheckoutError(r.message, 402);
        await confirmPaid();
      }
    } catch (err) {
      fail(err);
    }
  };

  const busy = phase !== "ready";
  const price = charge ? formatPrice(charge.amountCents, charge.currency) : clubPassPrice(payments, on);
  // "+$80/year": what the Venue add-on adds to the Annual Pass.
  const addOn =
    payments.clubPass && payments.hostPass && payments.clubPass.priceCents > payments.hostPass.priceCents
      ? `+${formatPrice(payments.clubPass.priceCents - payments.hostPass.priceCents, payments.currency)}/year`
      : null;
  let action: ReactNode;
  if (phase === "paid") {
    action = (
      <Button data-testid="pay-confirm" size="lg" block leading={<CheckIcon size={20} strokeWidth={3} />} haptic={false} className="animate-pop">
        You're all set!
      </Button>
    );
  } else if (!method) {
    action = (
      <Button data-testid="pay-confirm" size="lg" block variant="secondary" onClick={onClose}>
        Not available here
      </Button>
    );
  } else if (upgrade) {
    action = (
      <Button data-testid="pay-confirm" size="lg" block loading={busy} onClick={() => void confirm()} haptic="medium">
        {addOn ? `Add it · ${addOn}` : "Add the Venue add-on"}
      </Button>
    );
  } else if (needsSignIn) {
    action = (
      <div className="flex flex-col gap-2">
        <Button data-testid="pass-signin" size="lg" block onClick={() => latest.current.onSignIn()}>
          Sign in to continue
        </Button>
        <p className="text-center text-footnote text-ink-muted">Your pass stays with your account on every device.</p>
      </div>
    );
  } else if ((method === "wallet" || method === "card") && error && (!clientSecret || (method === "card" && !cardReady))) {
    action = (
      <Button
        data-testid="pay-confirm"
        size="lg"
        block
        variant="secondary"
        onClick={() => {
          setError(null);
          setAttempt((n) => n + 1);
        }}
      >
        Try again
      </Button>
    );
  } else if (method === "wallet") {
    action = (
      <div className="flex flex-col gap-2">
        <div data-testid="pay-confirm" className={cx("relative min-h-13 overflow-hidden rounded-btn", busy && "pointer-events-none opacity-60")}>
          <div ref={walletRef} />
          {!clientSecret && <Skeleton className="absolute inset-0 h-13 w-full rounded-btn" />}
        </div>
        <Button variant="ghost" size="sm" onClick={() => setMethod("card")} disabled={busy}>
          Pay with card instead
        </Button>
      </div>
    );
  } else if (method === "card") {
    action = (
      <Button data-testid="pay-confirm" size="lg" block loading={busy} disabled={!cardComplete || !cardReady} onClick={() => void confirm()}>
        {`Subscribe · ${perYear(price)}`}
      </Button>
    );
  } else {
    action = (
      <Button data-testid="pay-confirm" size="lg" block loading={busy} onClick={() => void confirm()} haptic="medium">
        Start test pass
      </Button>
    );
  }

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      dismissible={!busy}
      title={name}
      description={
        upgrade
          ? "Adds venue boards and your venue's name and logo to your Annual Pass."
          : "For bars and restaurants that run boards every week: every board you host for a year, venue boards included."
      }
      footer={
        <div className="flex flex-col gap-3">
          {error && (
            <p role="alert" className="flex items-start gap-1.5 px-1 text-footnote font-semibold text-ink-danger animate-fade-in">
              <AlertIcon size={15} className="mt-px shrink-0" />
              {error}
            </p>
          )}
          {notice && !error && <p className="px-1 text-footnote text-ink-muted animate-fade-in">{notice}</p>}
          {action}
          {(method === "wallet" || method === "card") && !upgrade && phase !== "paid" && onStripeTestKeys(payments) && (
            <p data-testid="stripe-test-note" className="text-center text-footnote text-ink-subtle">
              {STRIPE_TEST_NOTE}
            </p>
          )}
          {phase !== "paid" && method && <ClubDisclosure test={method === "test"} upgrade={upgrade} price={price} addOn={addOn} onNavigate={onClose} />}
        </div>
      }
    >
      <ClubPerks price={method === "test" ? null : upgrade ? addOn : price} test={method === "test"} upgrade={upgrade} />
      {method === "card" && !upgrade && !needsSignIn && !(error && !cardReady) && (
        <div className="relative mt-4 min-h-40">
          <div ref={cardRef} />
          {!clientSecret && <Skeleton className="absolute inset-0 h-40 w-full rounded-btn" />}
        </div>
      )}
    </BottomSheet>
  );
}

const link = "font-semibold text-ink-muted underline underline-offset-2";

/** The subscription's terms beside its button: name, length, price per year, renewal until canceled, how to cancel. */
function ClubDisclosure({
  test,
  upgrade,
  price,
  addOn,
  onNavigate,
}: {
  test: boolean;
  upgrade: boolean;
  price: string | null;
  addOn: string | null;
  onNavigate: () => void;
}) {
  return (
    <p data-testid="club-disclosure" className="px-1 text-center text-caption leading-snug text-ink-subtle">
      {test
        ? "Test pass: no charge while checkout is in test mode. It lasts a year and doesn't renew."
        : upgrade
          ? `The Venue add-on, ${addOn ?? "yearly"}, added to your Annual Pass. Today you pay for what's left of your pass's year, charged to the card it renews on. Then it renews with your pass${price ? ` at ${price} a year` : ""} until you cancel in Profile › Venue add-on › Manage.`
          : `${VENUE_PASS_NAME}, 1 year, ${price ? `${price} a year` : "yearly"}. It renews automatically each year until you cancel. Cancel any time in Profile › Venue add-on › Manage.`}{" "}
      <Link to="/terms#club-pass" onClick={onNavigate} className={link}>
        Terms
      </Link>{" "}
      ·{" "}
      <Link to="/privacy" onClick={onNavigate} className={link}>
        Privacy
      </Link>
    </p>
  );
}
