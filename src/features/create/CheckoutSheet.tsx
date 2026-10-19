// Pays a board's host fee: the only payment in JaxSquares, due when the host
// draws the numbers of a board more than 5 players hold squares on (setting
// up, inviting and picking squares are free, and so is drawing a smaller
// board). The host tools open it from "Draw the numbers · $4.99" (then draw
// and play the reveal), or, on a linked board, to pay ahead so Jax draws at
// kickoff. It is self-contained: the board (GET /api/games/:id) and the saved
// admin token are all it needs.
//
// It also sells the Host Pass, the yearly alternative: at the draw the host
// picks "This board · $4.99" (the default) or "Host Pass · $19.99/year"
// ("Pays for itself by your fifth board", worked out from the two prices
// this device shows) with one tap, and Profile opens it in pass mode
// (purpose "pass", no board). The pass
// has its subscription disclosure beside its button. On the web it needs an
// account first: the sheet asks the parent to sign in (onSignInForPass), then
// it's reopened on the pass. Drawing after buying the pass needs no payment:
// the server marks the board paid through the pass.
//   test   – no-charge test checkout (a test pass for the pass), one tap
//   wallet – Apple Pay / Google Pay (Stripe Express Checkout), card form fallback
//   card   – Stripe Payment Element
//   iap    – Apple In-App Purchase inside the iOS app (shows the App Store's price)
// Every primary confirm carries data-testid="pay-confirm".

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ACCOUNT_REQUIRED_CODE, type Game, type GameState, type HostPassState, type PaymentConfig } from "../../../shared/types";
import { AlertIcon, CheckIcon, LiveIcon, PencilIcon } from "../../components/icons";
import { BottomSheet, Button, celebrate, CELEBRATION_COLORS, cx, Skeleton, TeamMark } from "../../components/ui";
import {
  appStorePrice,
  buyPassWithIAP,
  CheckoutError,
  checkoutMethod,
  confirmPassPaid,
  confirmStripePaid,
  createPassIntent,
  createStripeIntent,
  fetchAppConfig,
  formatPrice,
  mountCardForm,
  mountWalletButton,
  passCheckoutMethod,
  payTest,
  payWithIAP,
  preloadCheckout,
  startTestPass,
  type CardForm,
  type CheckoutMethod,
  type MountedCheckout,
} from "../../lib/checkout";
import { kickoffLabel, readableTeamColor, withAlpha, zoneLabel } from "../../lib/format";
import { setHostPassState } from "../../lib/hostPassStore";
import { useAccount } from "../../lib/identity";
import { haptic, platform } from "../../lib/native";
import { useResolvedTheme } from "../../lib/theme";
import { useHostPrices } from "../../lib/useHostPass";
import { PassCard, PassDisclosure, PlanPicker, type CheckoutPlan } from "../pass/PassParts";
import { passPaysOffAt, perYear } from "../pass/passText";
import { CUSTOM_X_COLOR, CUSTOM_Y_COLOR } from "./CustomMatchup";
import { formatLine } from "./model";
import { VsBadge } from "./VsBadge";

export type { CheckoutPlan };

export interface CheckoutBoard {
  game: Game;
  adminToken: string;
}

/**
 * Why the sheet is open: to draw the numbers now, ahead of kickoff so Jax
 * draws them (linked boards), or Profile's "Get the Host Pass" (no board).
 */
export type CheckoutPurpose = "draw" | "ahead" | "pass";

export interface CheckoutSheetProps {
  open: boolean;
  board: CheckoutBoard | null;
  purpose?: CheckoutPurpose;
  /** The choice picked when it opens: this board unless asked (the pass, after signing in for it). */
  initialPlan?: CheckoutPlan;
  /** The payment config if the caller already has it; null/omitted and the sheet loads /api/config itself. */
  payments?: PaymentConfig | null;
  /** The board's fee is paid (`state` is the paid board, or null while a web payment is still landing). */
  onPaid?: (gameId: string, state: GameState | null) => void;
  /**
   * The Host Pass is bought (or turned out to be active already): the pass's
   * state, or null while a web payment is still confirming. The pass is only
   * offered when this is given.
   */
  onPassActive?: (state: HostPassState | null) => void;
  /** The pass on the web needs an account: close this sheet, sign in, then reopen it with initialPlan "pass". */
  onSignInForPass?: () => void;
  /** Closed without paying: nothing changes, and squares stay open. */
  onClose: () => void;
  /** Also told when the sheet re-reads /api/config after a failure (optional). */
  onRetryConfig?: () => void;
}

type Phase = "ready" | "paying" | "paid" | "pending";

/** How long the "paid" moment shows before the host tools take over (the draw, or the board). */
const PAID_BEAT_MS = 520;

interface Copy {
  title: string;
  description: string;
  pending: string;
  test: string;
  paid: string;
  walletCancel: string;
}

const COPY: Record<"draw" | "ahead", Copy> = {
  draw: {
    title: "Draw the numbers",
    description: "The host fee for this board. Squares lock and the numbers get drawn right after.",
    pending: "Waiting on approval. You can draw the numbers once it's approved.",
    test: "Draw the numbers",
    paid: "Paid! Drawing now",
    walletCancel: "No charge. Draw the numbers whenever you're ready.",
  },
  ahead: {
    title: "Pay ahead for kickoff",
    description: "The host fee for this board. Jax draws the numbers at kickoff, and squares stay open till then.",
    pending: "Waiting on approval. Jax draws the numbers at kickoff once it's approved.",
    test: "Pay ahead",
    paid: "All set!",
    walletCancel: "No charge. You can pay any time before kickoff.",
  },
};

const PASS_COPY: Record<CheckoutPurpose, Copy> = {
  draw: {
    title: "Draw the numbers",
    description: "Every board you host for a year, this one included. The numbers get drawn right after.",
    pending: "Waiting on approval. Your Host Pass starts once it's approved.",
    test: "Start test pass",
    paid: "You're in! Drawing now",
    walletCancel: "No charge. You can get the Host Pass any time.",
  },
  ahead: {
    title: "Pay ahead for kickoff",
    description: "Every board you host for a year, this one included. Jax draws the numbers at kickoff.",
    pending: "Waiting on approval. Your Host Pass starts once it's approved.",
    test: "Start test pass",
    paid: "All set!",
    walletCancel: "No charge. You can get the Host Pass any time.",
  },
  pass: {
    title: "Host Pass",
    description: "Draw the numbers on every board you host for a year, with no host fee.",
    pending: "Waiting on approval. Your Host Pass starts once it's approved.",
    test: "Start test pass",
    paid: "You're all set!",
    walletCancel: "No charge. You can get the Host Pass any time.",
  },
};

export function CheckoutSheet({
  open,
  board,
  purpose = "draw",
  initialPlan,
  payments: given,
  onPaid,
  onPassActive,
  onSignInForPass,
  onClose,
  onRetryConfig,
}: CheckoutSheetProps) {
  const [loaded, setLoaded] = useState<PaymentConfig | null>(null);
  const [configFailed, setConfigFailed] = useState(false);
  // What the sheet re-read itself (after a failure, or checkout going live) beats the caller's copy.
  const payments = loaded ?? given;
  const signedIn = useAccount() !== null;
  const [plan, setPlan] = useState<CheckoutPlan>(initialPlan ?? "board");
  const [method, setMethod] = useState<CheckoutMethod | null>(null);
  const [phase, setPhase] = useState<Phase>("ready");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  /** What the PaymentIntent charges: shown and itemized instead of the config's price, which can be stale. */
  const [charge, setCharge] = useState<{ amountCents: number; currency: string } | null>(null);
  const [cardComplete, setCardComplete] = useState(false);
  const [cardReady, setCardReady] = useState(false);
  const [storePrice, setStorePrice] = useState<string | null>(null);
  const [storePassPrice, setStorePassPrice] = useState<string | null>(null);
  /** Bumped by "Try again" when the PaymentIntent couldn't be created. */
  const [attempt, setAttempt] = useState(0);
  const walletRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const cardForm = useRef<CardForm | null>(null);
  const paidTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gameId = board?.game.id ?? null;
  const adminToken = board?.adminToken ?? null;
  const on = platform();

  // The pass is offered where it's sold and the caller takes it; Profile's sheet is the pass alone.
  const passMethod = payments ? passCheckoutMethod(payments, on) : null;
  const passOffered = !!onPassActive && passMethod !== null;
  const amounts = useHostPrices(open && (passOffered || purpose === "pass"), payments);
  const forPass = purpose === "pass" || (passOffered && plan === "pass");
  const copy = forPass ? PASS_COPY[purpose] : COPY[purpose === "ahead" ? "ahead" : "draw"];
  const wantedMethod = payments ? (forPass ? passMethod : checkoutMethod(payments, on)) : null;
  // Buying the pass on the web needs an account (startPassPurchase's rule; the server says so too).
  const needsSignIn = forPass && (wantedMethod === "wallet" || wantedMethod === "card") && !signedIn;

  const loadConfig = useCallback((refresh: boolean) => {
    setConfigFailed(false);
    fetchAppConfig({ refresh })
      .then((c) => setLoaded(c.payments))
      .catch(() => setConfigFailed(true));
  }, []);

  // No config from the caller: fetch it (cached for the session) when the sheet opens.
  useEffect(() => {
    if (open && !given && !loaded) loadConfig(false);
  }, [open, given, loaded, loadConfig]);

  // Each opening starts on the choice asked for (this board by default).
  useEffect(() => {
    if (open) setPlan(purpose === "pass" ? "pass" : (initialPlan ?? "board"));
  }, [open, purpose, initialPlan]);

  // Fresh state for every opening, board and choice.
  useEffect(() => {
    if (!open) return;
    setPhase("ready");
    setError(null);
    setNotice(null);
    setClientSecret(null);
    setCharge(null);
    setCardComplete(false);
    setMethod(wantedMethod);
    if (payments) preloadCheckout(payments, on);
  }, [open, gameId, payments, wantedMethod, forPass, on]);

  // The App Store's own price strings (the board's and the pass's): never the web price in the iOS app.
  useEffect(() => {
    if (!open || on !== "ios" || !payments) return;
    let live = true;
    void appStorePrice(on, payments.iapProductId).then((p) => live && setStorePrice(p));
    if (payments.hostPass) void appStorePrice(on, payments.hostPass.iapProductId).then((p) => live && setStorePassPrice(p));
    return () => {
      live = false;
    };
  }, [open, on, payments]);

  useEffect(() => () => {
    if (paidTimer.current) clearTimeout(paidTimer.current);
  }, []);

  // Latest props for callbacks that must stay stable (they're effect deps; a new
  // identity would remount the Stripe button on every parent render).
  const latest = useRef({ onPaid, onPassActive, onSignInForPass, board });
  latest.current = { onPaid, onPassActive, onSignInForPass, board };

  const celebrateNow = useCallback((pass: boolean) => {
    void haptic("success");
    const game = latest.current.board?.game;
    const colors = pass
      ? ["#ffd56b", "#ffc233", "#ffab0f", "#ffffff"]
      : game
        ? [readableTeamColor(game.teamX.color, CUSTOM_X_COLOR), readableTeamColor(game.teamY.color, CUSTOM_Y_COLOR), ...CELEBRATION_COLORS.slice(0, 2)]
        : undefined;
    void celebrate("pop", { colors, origin: { x: 0.5, y: 0.85 } });
  }, []);

  const succeed = useCallback(
    (state: GameState | null) => {
      if (!gameId) return;
      setPhase("paid");
      setError(null);
      celebrateNow(false);
      paidTimer.current = setTimeout(() => latest.current.onPaid?.(gameId, state), PAID_BEAT_MS);
    },
    [gameId, celebrateNow],
  );

  const succeedPass = useCallback(
    (state: HostPassState | null) => {
      if (state) setHostPassState(state);
      setPhase("paid");
      setError(null);
      celebrateNow(true);
      paidTimer.current = setTimeout(() => latest.current.onPassActive?.(state), PAID_BEAT_MS);
    },
    [celebrateNow],
  );

  const fail = useCallback(
    (err: unknown) => {
      if (err instanceof CheckoutError && err.status === 409) {
        // Already paid for (e.g. the webhook won the race), or the pass is already active: that's a success.
        if (err.state) return succeed(err.state);
        if (err.pass?.pass?.active) return succeedPass(err.pass);
        // The web pass needs an account after all (signed out on another device meanwhile).
        if (err.code === ACCOUNT_REQUIRED_CODE && latest.current.onSignInForPass) return latest.current.onSignInForPass();
      }
      setPhase("ready");
      setError(err instanceof Error && err.message ? err.message : "That didn't go through. Try again.");
      void haptic("error");
    },
    [succeed, succeedPass],
  );

  // Stripe methods need a PaymentIntent first: the board's fee, or the pass's first invoice.
  useEffect(() => {
    if (!open || (method !== "wallet" && method !== "card") || clientSecret || needsSignIn) return;
    if (!forPass && (!gameId || !adminToken)) return;
    let cancelled = false;
    setError(null);
    (forPass ? createPassIntent() : createStripeIntent(gameId!, adminToken!))
      .then((r) => {
        if (cancelled) return;
        if (typeof r.amountCents === "number" && r.currency) setCharge({ amountCents: r.amountCents, currency: r.currency });
        setClientSecret(r.clientSecret);
      })
      .catch((err: unknown) => !cancelled && fail(err));
    return () => {
      cancelled = true;
    };
  }, [open, gameId, adminToken, method, clientSecret, fail, attempt, forPass, needsSignIn]);

  /** After Stripe.js reports a payment: the server reads it back from Stripe. */
  const confirmPaid = useCallback(async () => {
    if (forPass) return succeedPass(await confirmPassPaid());
    if (gameId && adminToken) succeed(await confirmStripePaid(gameId, adminToken));
  }, [forPass, gameId, adminToken, succeed, succeedPass]);

  // Apple Pay / Google Pay button.
  useEffect(() => {
    const el = walletRef.current;
    if (!open || method !== "wallet" || !clientSecret || !el || !payments) return;
    let handle: MountedCheckout | null = null;
    let disposed = false;
    const amountCents = charge?.amountCents ?? (forPass ? (payments.hostPass?.priceCents ?? 0) : payments.priceCents);
    const origin = typeof location !== "undefined" ? location.origin : "https://jaxsquares.com";
    void mountWalletButton(el, {
      clientSecret,
      amountCents,
      label: forPass ? "Host Pass (1 year)" : "Squares board",
      publishableKey: payments.stripePublishableKey,
      // Apple Pay shows a subscription's yearly billing in its sheet.
      applePay: forPass
        ? {
            recurringPaymentRequest: {
              paymentDescription: "JaxSquares Host Pass",
              managementURL: `${origin}/me`,
              regularBilling: { label: "Host Pass", amount: amountCents, recurringPaymentIntervalUnit: "year", recurringPaymentIntervalCount: 1 },
            },
          }
        : undefined,
      onPaid: () => {
        setPhase("paying");
        confirmPaid().catch(fail);
      },
      onUnavailable: () => !disposed && setMethod("card"),
      onCancel: () => setNotice(copy.walletCancel),
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
  }, [open, method, clientSecret, charge, payments, forPass, confirmPaid, fail, copy.walletCancel]);

  // Card form fallback.
  useEffect(() => {
    const el = cardRef.current;
    if (!open || method !== "card" || !clientSecret || !el || !payments) return;
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
    if (!forPass && (!gameId || !adminToken)) return;
    setError(null);
    setNotice(null);
    setPhase("paying");
    try {
      if (method === "test") {
        if (forPass) succeedPass(await startTestPass());
        else succeed(await payTest(gameId!, adminToken!));
      } else if (method === "iap") {
        const r = forPass ? await buyPassWithIAP(payments?.hostPass?.iapProductId) : await payWithIAP(gameId!, adminToken!, payments?.iapProductId);
        if (r.status === "paid") succeed(r.state);
        else if (r.status === "active") succeedPass(r.state);
        else if (r.status === "pending") setPhase("pending");
        else {
          setPhase("ready");
          setNotice(forPass ? "No charge. You can get the Host Pass any time." : "No charge. Tap Continue whenever you're ready.");
        }
      } else if (method === "card") {
        const form = cardForm.current;
        if (!form) return setPhase("ready");
        const r = await form.submit();
        if (r.status === "failed") throw new CheckoutError(r.message, 402);
        await confirmPaid();
      }
    } catch (err) {
      if (method === "test" && err instanceof CheckoutError && err.status === 403) {
        // Test checkout was switched off after this config was read: switch to the real checkout.
        const fresh = await fetchAppConfig({ refresh: true }).then((c) => c.payments, () => null);
        if (fresh && fresh.mode !== "test") return setLoaded(fresh);
      }
      fail(err);
    }
  };

  const retryConfig = () => {
    onRetryConfig?.();
    loadConfig(true);
  };

  const pickPlan = (next: CheckoutPlan) => {
    if (next === plan) return;
    void haptic("selection");
    setPlan(next);
  };

  const busy = phase === "paying" || phase === "paid";
  // The board's price and the pass's, as this device shows them (the App Store's in the iOS app).
  const boardPrice = on === "ios" ? storePrice : !forPass && charge ? formatPrice(charge.amountCents, charge.currency) : payments ? formatPrice(payments.priceCents, payments.currency) : null;
  const passPrice =
    on === "ios" ? storePassPrice : forPass && charge ? formatPrice(charge.amountCents, charge.currency) : payments?.hostPass ? formatPrice(payments.hostPass.priceCents, payments.hostPass.currency) : null;
  const price = forPass ? passPrice : boardPrice;
  // "Pays for itself by your fifth board", from the same two prices (StoreKit's in the iOS app); hidden when either is unknown.
  const paysOffAt = passPaysOffAt(amounts.pass, amounts.board);

  let action: ReactNode;
  if (!payments) {
    action = configFailed ? (
      <Button data-testid="pay-confirm" size="lg" block variant="secondary" onClick={retryConfig}>
        Try again
      </Button>
    ) : (
      <Button data-testid="pay-confirm" size="lg" block loading>
        Getting ready
      </Button>
    );
  } else if (phase === "paid") {
    action = (
      <Button data-testid="pay-confirm" size="lg" block leading={<CheckIcon size={20} strokeWidth={3} />} haptic={false} className="animate-pop">
        {copy.paid}
      </Button>
    );
  } else if (phase === "pending") {
    action = (
      <Button data-testid="pay-confirm" size="lg" block variant="secondary" onClick={onClose}>
        Done
      </Button>
    );
  } else if (needsSignIn) {
    action = (
      <div className="flex flex-col gap-2">
        <Button data-testid="pass-signin" size="lg" block onClick={() => latest.current.onSignInForPass?.()}>
          Sign in to continue
        </Button>
        <p className="text-center text-footnote text-ink-muted">Your Host Pass stays with your account on every device.</p>
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
        {/* Stripe owns the inner node; React only renders the placeholder beside it. */}
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
        {forPass ? `Subscribe · ${perYear(price)}` : `Pay ${price}`}
      </Button>
    );
  } else if (method === "iap") {
    action = (
      <Button data-testid="pay-confirm" size="lg" block loading={busy} onClick={() => void confirm()}>
        {forPass ? "Subscribe" : "Continue"}
      </Button>
    );
  } else {
    action = (
      <Button data-testid="pay-confirm" size="lg" block loading={busy} onClick={() => void confirm()} haptic="medium">
        {copy.test}
      </Button>
    );
  }

  // One quiet line about cost under the board's button, never a pitch: the host
  // already chose to draw. The pass gets its subscription disclosure instead.
  const costLine = forPass
    ? null
    : method === "test"
      ? "No charge while checkout is in test mode."
      : method === "iap"
        ? price
          ? `${price} host fee, once for this board. You'll confirm with the App Store.`
          : "Once for this board. You'll confirm with the App Store."
        : price
          ? `${price} host fee, once for this board.`
          : null;
  const settled = phase === "paid" || phase === "pending";

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      dismissible={!busy}
      title={copy.title}
      description={phase === "pending" ? copy.pending : copy.description}
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
          {costLine && !settled && <p className="text-center text-footnote text-ink-subtle">{costLine}</p>}
          {forPass && !settled && payments && <PassDisclosure method={method ?? passMethod} price={passPrice} onNavigate={onClose} />}
        </div>
      }
    >
      {board && purpose !== "pass" && <Ticket game={board.game} />}
      {purpose === "pass" && <PassCard price={passPrice} test={passMethod === "test"} paysOffAt={paysOffAt} />}
      {passOffered && purpose !== "pass" && (
        <PlanPicker plan={plan} onChange={pickPlan} boardPrice={boardPrice} passPrice={passPrice} paysOffAt={paysOffAt} disabled={busy} />
      )}
      {method === "card" && !needsSignIn && !(error && !cardReady) && (
        <div className="relative mt-4 min-h-40">
          <div ref={cardRef} />
          {!clientSecret && <Skeleton className="absolute inset-0 h-40 w-full rounded-btn" />}
        </div>
      )}
    </BottomSheet>
  );
}

/** The board being paid for, as an admission ticket in the two team colors. */
function Ticket({ game }: { game: Game }) {
  const theme = useResolvedTheme();
  const x = { ...game.teamX, color: game.teamX.color ?? CUSTOM_X_COLOR };
  const y = { ...game.teamY, color: game.teamY.color ?? CUSTOM_Y_COLOR };
  const glowX = withAlpha(readableTeamColor(x.color, CUSTOM_X_COLOR, theme), 0.22);
  const glowY = withAlpha(readableTeamColor(y.color, CUSTOM_Y_COLOR, theme), 0.22);
  const linked = game.linkedEvent;
  return (
    <div
      className="relative overflow-hidden rounded-card bg-surface-3 ring-1 ring-inset ring-line-strong"
      style={{ backgroundImage: `radial-gradient(90% 120% at 0% 0%, ${glowX}, transparent 60%), radial-gradient(90% 120% at 100% 0%, ${glowY}, transparent 60%)` }}
    >
      <div className="flex flex-col items-center px-4 pb-4 pt-5 text-center">
        <div className="flex items-center gap-3">
          <TeamMark team={x} size="lg" className="-rotate-3" />
          <VsBadge />
          <TeamMark team={y} size="lg" className="rotate-3" />
        </div>
        <p className="mt-3 max-w-full truncate font-display text-title-3 font-extrabold text-ink">{game.name}</p>
        <p className="mt-0.5 text-footnote font-semibold text-ink-muted">{formatLine(game.format)}</p>
      </div>
      {/* Perforation */}
      <div aria-hidden className="relative h-0 border-t-2 border-dashed border-ink/12">
        <span className="absolute -left-2.5 -top-2.5 h-5 w-5 rounded-full bg-surface-2" />
        <span className="absolute -right-2.5 -top-2.5 h-5 w-5 rounded-full bg-surface-2" />
      </div>
      <div className="flex items-center justify-center gap-2 px-4 py-2.5 text-footnote font-semibold text-ink-muted">
        {linked ? (
          <>
            <LiveIcon size={15} className="shrink-0 text-ink-subtle" />
            Live scores · {kickoffLabel(linked.startsAt)}
          </>
        ) : (
          <>
            <PencilIcon size={15} className="shrink-0 text-ink-subtle" />
            {game.startsAt ? `You run the score · ${kickoffLabel(game.startsAt)} ${zoneLabel(game.startsAt)}`.trim() : "You run the score · winners pop instantly"}
          </>
        )}
      </div>
    </div>
  );
}
