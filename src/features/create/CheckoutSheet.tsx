// Opens an unpaid board (the only payment in JaxSquares). The create page only
// shows this when a real web checkout needs its own tap (Apple Pay / Google Pay
// button, card form); test mode and the App Store open straight from Create.
// It is self-contained, so host controls can open it for an existing draft
// (GET /api/games/:id + the saved admin token) with no create-page state:
//   test   – no-charge test checkout, one tap
//   wallet – Apple Pay / Google Pay (Stripe Express Checkout), card form fallback
//   card   – Stripe Payment Element
//   iap    – Apple In-App Purchase inside the iOS app (shows the App Store's price)
// Every primary confirm carries data-testid="pay-confirm".

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { Game, GameState, PaymentConfig } from "../../../shared/types";
import { AlertIcon, CheckIcon, LiveIcon, PencilIcon } from "../../components/icons";
import { BottomSheet, Button, celebrate, CELEBRATION_COLORS, cx, Skeleton, TeamMark } from "../../components/ui";
import {
  appStorePrice,
  CheckoutError,
  checkoutMethod,
  confirmStripePaid,
  createStripeIntent,
  fetchAppConfig,
  formatPrice,
  mountCardForm,
  mountWalletButton,
  payTest,
  payWithIAP,
  preloadCheckout,
  type CardForm,
  type CheckoutMethod,
  type MountedCheckout,
} from "../../lib/checkout";
import { kickoffLabel, readableTeamColor, withAlpha, zoneLabel } from "../../lib/format";
import { haptic, platform } from "../../lib/native";
import { CUSTOM_X_COLOR, CUSTOM_Y_COLOR } from "./CustomMatchup";
import { formatLine } from "./model";
import { VsBadge } from "./VsBadge";
import { useResolvedTheme } from "../../lib/theme";

export interface CheckoutDraft {
  game: Game;
  adminToken: string;
}

export interface CheckoutSheetProps {
  open: boolean;
  draft: CheckoutDraft | null;
  /** The payment config if the caller already has it; null/omitted and the sheet loads /api/config itself. */
  payments?: PaymentConfig | null;
  onPaid: (gameId: string, state: GameState | null) => void;
  /** Closed without paying: the board stays a draft. */
  onClose: () => void;
  /** Also told when the sheet re-reads /api/config after a failure (optional). */
  onRetryConfig?: () => void;
}

type Phase = "ready" | "paying" | "paid" | "pending";

/** How long the "you're live" moment shows before the board opens. */
const PAID_BEAT_MS = 520;

export function CheckoutSheet({ open, draft, payments: given, onPaid, onClose, onRetryConfig }: CheckoutSheetProps) {
  const [loaded, setLoaded] = useState<PaymentConfig | null>(null);
  const [configFailed, setConfigFailed] = useState(false);
  // What the sheet re-read itself (after a failure, or checkout going live) beats the caller's copy.
  const payments = loaded ?? given;
  const [method, setMethod] = useState<CheckoutMethod | null>(null);
  const [phase, setPhase] = useState<Phase>("ready");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  /** What the board's PaymentIntent charges: shown and itemized instead of the config's price, which can be stale. */
  const [charge, setCharge] = useState<{ amountCents: number; currency: string } | null>(null);
  const [cardComplete, setCardComplete] = useState(false);
  const [cardReady, setCardReady] = useState(false);
  const [storePrice, setStorePrice] = useState<string | null>(null);
  /** Bumped by "Try again" when the PaymentIntent couldn't be created. */
  const [attempt, setAttempt] = useState(0);
  const walletRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const cardForm = useRef<CardForm | null>(null);
  const paidTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gameId = draft?.game.id ?? null;
  const adminToken = draft?.adminToken ?? null;

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

  // Fresh state for every opening / draft.
  useEffect(() => {
    if (!open) return;
    setPhase("ready");
    setError(null);
    setNotice(null);
    setClientSecret(null);
    setCharge(null);
    setCardComplete(false);
    setMethod(payments ? checkoutMethod(payments, platform()) : null);
    if (payments) preloadCheckout(payments, platform());
  }, [open, gameId, payments]);

  // The App Store's own price string for the IAP button.
  useEffect(() => {
    if (!open || method !== "iap" || !payments) return;
    let live = true;
    void appStorePrice(platform(), payments.iapProductId).then((p) => live && setStorePrice(p));
    return () => {
      live = false;
    };
  }, [open, method, payments]);

  useEffect(() => () => {
    if (paidTimer.current) clearTimeout(paidTimer.current);
  }, []);

  // Latest props for callbacks that must stay stable (they're effect deps; a new
  // identity would remount the Stripe button on every parent render).
  const latest = useRef({ onPaid, draft });
  latest.current = { onPaid, draft };

  const succeed = useCallback(
    (state: GameState | null) => {
      if (!gameId) return;
      setPhase("paid");
      setError(null);
      void haptic("success");
      const game = latest.current.draft?.game;
      const colors = game
        ? [readableTeamColor(game.teamX.color, CUSTOM_X_COLOR), readableTeamColor(game.teamY.color, CUSTOM_Y_COLOR), ...CELEBRATION_COLORS.slice(0, 2)]
        : undefined;
      void celebrate("pop", { colors, origin: { x: 0.5, y: 0.85 } });
      paidTimer.current = setTimeout(() => latest.current.onPaid(gameId, state), PAID_BEAT_MS);
    },
    [gameId],
  );

  const fail = useCallback(
    (err: unknown) => {
      // Already open (e.g. the webhook won the race): that's a success.
      if (err instanceof CheckoutError && err.status === 409 && err.state) return succeed(err.state);
      setPhase("ready");
      setError(err instanceof Error && err.message ? err.message : "That didn't go through. Try again.");
      void haptic("error");
    },
    [succeed],
  );

  // Stripe methods need the board's PaymentIntent first.
  useEffect(() => {
    if (!open || !gameId || !adminToken || (method !== "wallet" && method !== "card") || clientSecret) return;
    let cancelled = false;
    setError(null);
    createStripeIntent(gameId, adminToken)
      .then((r) => {
        if (cancelled) return;
        if (typeof r.amountCents === "number" && r.currency) setCharge({ amountCents: r.amountCents, currency: r.currency });
        setClientSecret(r.clientSecret);
      })
      .catch((err: unknown) => !cancelled && fail(err));
    return () => {
      cancelled = true;
    };
  }, [open, gameId, adminToken, method, clientSecret, fail, attempt]);

  // Apple Pay / Google Pay button.
  useEffect(() => {
    const el = walletRef.current;
    if (!open || method !== "wallet" || !clientSecret || !el || !payments || !gameId || !adminToken) return;
    let handle: MountedCheckout | null = null;
    let disposed = false;
    void mountWalletButton(el, {
      clientSecret,
      amountCents: charge?.amountCents ?? payments.priceCents,
      label: "Squares board",
      publishableKey: payments.stripePublishableKey,
      onPaid: () => {
        setPhase("paying");
        confirmStripePaid(gameId, adminToken).then(succeed, fail);
      },
      onUnavailable: () => !disposed && setMethod("card"),
      onCancel: () => setNotice("No charge. Your board is saved whenever you're ready."),
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
  }, [open, method, clientSecret, charge, payments, gameId, adminToken, succeed, fail]);

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
    if (!gameId || !adminToken || phase !== "ready") return;
    setError(null);
    setNotice(null);
    setPhase("paying");
    try {
      if (method === "test") {
        succeed(await payTest(gameId, adminToken));
      } else if (method === "iap") {
        const r = await payWithIAP(gameId, adminToken, payments?.iapProductId);
        if (r.status === "paid") succeed(r.state);
        else if (r.status === "pending") setPhase("pending");
        else {
          setPhase("ready");
          setNotice("No charge. Tap Continue whenever you're ready.");
        }
      } else if (method === "card") {
        const form = cardForm.current;
        if (!form) return setPhase("ready");
        const r = await form.submit();
        if (r.status === "failed") throw new CheckoutError(r.message, 402);
        succeed(await confirmStripePaid(gameId, adminToken));
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

  const busy = phase === "paying" || phase === "paid";
  const price =
    method === "iap"
      ? storePrice
      : charge
        ? formatPrice(charge.amountCents, charge.currency)
        : payments
          ? formatPrice(payments.priceCents, payments.currency)
          : null;

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
        You're live!
      </Button>
    );
  } else if (phase === "pending") {
    action = (
      <Button data-testid="pay-confirm" size="lg" block variant="secondary" onClick={onClose}>
        Done
      </Button>
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
        Pay {price}
      </Button>
    );
  } else if (method === "iap") {
    action = (
      <Button data-testid="pay-confirm" size="lg" block loading={busy} onClick={() => void confirm()}>
        Continue
      </Button>
    );
  } else {
    action = (
      <Button data-testid="pay-confirm" size="lg" block loading={busy} onClick={() => void confirm()} haptic="medium">
        Open my board
      </Button>
    );
  }

  // One quiet line about cost, never a pitch: the host already chose to make this board.
  const costLine =
    method === "test"
      ? "No charge while checkout is in test mode."
      : method === "iap"
        ? price
          ? `${price}, one time. You'll confirm with the App Store.`
          : "You'll confirm with the App Store."
        : price
          ? `${price}, one time.`
          : null;

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      dismissible={!busy}
      title="Open your board"
      description={phase === "pending" ? "Waiting on approval. Your board opens the moment it's approved." : undefined}
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
          {costLine && phase !== "paid" && phase !== "pending" && <p className="text-center text-footnote text-ink-subtle">{costLine}</p>}
        </div>
      }
    >
      {draft && <Ticket game={draft.game} />}
      {method === "card" && !(error && !cardReady) && (
        <div className="relative mt-4 min-h-40">
          <div ref={cardRef} />
          {!clientSecret && <Skeleton className="absolute inset-0 h-40 w-full rounded-btn" />}
        </div>
      )}
    </BottomSheet>
  );
}

/** The board being opened, as an admission ticket in the two team colors. */
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
