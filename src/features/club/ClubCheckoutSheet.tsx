// Buys the Club Pass on the web (docs/payments.md "Club Pass"): $49 a year,
// auto-renewing, through the same Stripe Billing flow as the Host Pass (the
// club's own Price), or the no-charge test pass in test mode. Never in the
// iOS app: ClubSection doesn't offer it there, and clubCheckoutMethod says
// null on iOS (App Store guidelines 3.1.1 / 3.1.3(b)). A web subscription
// needs an account, so a signed-out browser is sent to sign in first
// (onSignIn), like the Host Pass. Its confirm carries data-testid="pay-confirm".

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ACCOUNT_REQUIRED_CODE, type HostPassState, type PaymentConfig } from "../../../shared/types";
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
  /** The Club Pass is bought (the identity's state), or null while a web payment is still confirming. */
  onActive: (state: HostPassState | null) => void;
  /** The web pass needs an account: close this, sign in, then open it again. */
  onSignIn: () => void;
  onClose: () => void;
}

type Phase = "ready" | "paying" | "paid";
const PAID_BEAT_MS = 520;

export function ClubCheckoutSheet({ open, payments, onActive, onSignIn, onClose }: ClubCheckoutSheetProps) {
  const on = platform();
  const signedIn = useAccount() !== null;
  const wanted = clubCheckoutMethod(payments, on);
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
    if (state) setHostPassState(state);
    setPhase("paid");
    setError(null);
    void haptic("success");
    void celebrate("pop", { colors: ["#ffd56b", "#ffc233", "#c6f432", "#ffffff"], origin: { x: 0.5, y: 0.85 } });
    timer.current = setTimeout(() => latest.current.onActive(state), PAID_BEAT_MS);
  }, []);

  const fail = useCallback(
    (err: unknown) => {
      if (err instanceof CheckoutError && err.status === 409) {
        if (err.pass?.club?.active) return succeed(err.pass);
        if (err.code === ACCOUNT_REQUIRED_CODE) return latest.current.onSignIn();
      }
      setPhase("ready");
      setError(err instanceof Error && err.message ? err.message : "That didn't go through. Try again.");
      void haptic("error");
    },
    [succeed],
  );

  // Stripe needs the subscription's first payment.
  useEffect(() => {
    if (!open || (method !== "wallet" && method !== "card") || clientSecret || needsSignIn) return;
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
  }, [open, method, clientSecret, needsSignIn, fail, attempt]);

  const confirmPaid = useCallback(async () => succeed(await confirmPassPaid("club")), [succeed]);

  useEffect(() => {
    const el = walletRef.current;
    if (!open || method !== "wallet" || !clientSecret || !el) return;
    let handle: MountedCheckout | null = null;
    let disposed = false;
    const amountCents = charge?.amountCents ?? payments.clubPass?.priceCents ?? 0;
    const origin = typeof location !== "undefined" ? location.origin : "https://jaxsquares.com";
    void mountWalletButton(el, {
      clientSecret,
      amountCents,
      label: "Club Pass (1 year)",
      publishableKey: payments.stripePublishableKey,
      applePay: {
        recurringPaymentRequest: {
          paymentDescription: "JaxSquares Club Pass",
          managementURL: `${origin}/me`,
          regularBilling: { label: "Club Pass", amount: amountCents, recurringPaymentIntervalUnit: "year", recurringPaymentIntervalCount: 1 },
        },
      },
      onPaid: () => {
        setPhase("paying");
        confirmPaid().catch(fail);
      },
      onUnavailable: () => !disposed && setMethod("card"),
      onCancel: () => setNotice("No charge. You can get the Club Pass any time."),
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
  }, [open, method, clientSecret, charge, payments, confirmPaid, fail]);

  useEffect(() => {
    const el = cardRef.current;
    if (!open || method !== "card" || !clientSecret || !el) return;
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
  }, [open, method, clientSecret, payments, fail, attempt]);

  const confirm = async () => {
    if (phase !== "ready") return;
    setError(null);
    setNotice(null);
    setPhase("paying");
    try {
      if (method === "test") succeed(await startTestPass("club"));
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
  } else if (needsSignIn) {
    action = (
      <div className="flex flex-col gap-2">
        <Button data-testid="pass-signin" size="lg" block onClick={() => latest.current.onSignIn()}>
          Sign in to continue
        </Button>
        <p className="text-center text-footnote text-ink-muted">Your Club Pass stays with your account on every device.</p>
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
        Start test Club Pass
      </Button>
    );
  }

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      dismissible={!busy}
      title="Club Pass"
      description="For bars, booster clubs, offices and fundraisers that run boards every week."
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
          {(method === "wallet" || method === "card") && phase !== "paid" && onStripeTestKeys(payments) && (
            <p data-testid="stripe-test-note" className="text-center text-footnote text-ink-subtle">
              {STRIPE_TEST_NOTE}
            </p>
          )}
          {phase !== "paid" && method && <ClubDisclosure test={method === "test"} price={price} onNavigate={onClose} />}
        </div>
      }
    >
      <ClubPerks price={method === "test" ? null : price} test={method === "test"} />
      {method === "card" && !needsSignIn && !(error && !cardReady) && (
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
function ClubDisclosure({ test, price, onNavigate }: { test: boolean; price: string | null; onNavigate: () => void }) {
  return (
    <p data-testid="club-disclosure" className="px-1 text-center text-caption leading-snug text-ink-subtle">
      {test
        ? "Test pass: no charge while checkout is in test mode. It lasts a year and doesn't renew."
        : `Club Pass, 1 year, ${price ? `${price} a year` : "yearly"}. It renews automatically each year until you cancel. Cancel any time in Profile › Club Pass › Manage.`}{" "}
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
