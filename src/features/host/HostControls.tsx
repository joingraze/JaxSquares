// Everything the board's host can do, behind one compact bar on the board.
// Renders nothing unless this device holds the board's admin token.
//
// The bar says where the board stands and offers the next move (open the
// board, invite, lock & draw, enter the score); with nothing to do it folds to
// one slim row. Tapping it opens the host sheet. Locking plays the number-draw
// reveal for the host; everyone else sees their board update live.
//
// Deep links (from Home): ?checkout=1 opens the checkout for an unpaid board,
// ?draw=1 opens the lock & draw confirm. Both are cleared once handled.

import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import type { GameState, NumberDraw, PaymentConfig } from "../../../shared/types";
import { ChevronRightIcon, CrownIcon, LockIcon, PencilIcon, SparklesIcon, TrophyIcon, UsersIcon } from "../../components/icons";
import { celebrate, cx, useToast } from "../../components/ui";
import { api, inviteUrl } from "../../lib/api";
import { fetchAppConfig } from "../../lib/checkout";
import { readableTeamColor } from "../../lib/format";
import { getAdminToken, getPlayerId } from "../../lib/identity";
import { haptic, shareLink } from "../../lib/native";
import "./host.css";
import { claimedOf, hostSummary, revealDraw, type HostSummary } from "./hostModel";
import { HostSheet, type HostView } from "./HostSheet";
import { NumberReveal } from "./NumberReveal";
import { useHostActions } from "./useHostActions";

export interface HostControlsProps {
  state: GameState;
  /** Apply a GameState returned by a host API call (the socket will also deliver it). */
  apply: (state: GameState) => void;
  /** Ask the board to let the host tap one square; resolves null if cancelled. */
  pickCell: (prompt: string) => Promise<{ row: number; col: number } | null>;
  /** Open the invite sheet. */
  onInvite: () => void;
}

export function HostControls(props: HostControlsProps) {
  // The admin token is the host's key; without it there's nothing to show.
  if (!getAdminToken(props.state.game.id)) return null;
  return <HostPanel {...props} />;
}

/** Time for the sheet to slide away before the board takes over (pick mode, the reveal). */
const SHEET_EXIT_MS = 320;

// The checkout sheet lives with the create flow; only unpaid boards need it, so it loads on demand.
const CheckoutSheet = lazy(() => import("../create/CheckoutSheet").then((m) => ({ default: m.CheckoutSheet })));

interface Reveal {
  draw: NumberDraw | null;
  label: string | null;
  /** Board as it was locked (squares/players for the mini board). */
  state: GameState;
}

function HostPanel({ state, apply, pickCell, onInvite }: HostControlsProps) {
  const { game } = state;
  const toast = useToast();
  const navigate = useNavigate();
  const me = getPlayerId();
  const actions = useHostActions(game.id, apply);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<HostView>("home");
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const [picking, setPicking] = useState<string | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [payments, setPayments] = useState<PaymentConfig | null>(null);
  const [params, setParams] = useSearchParams();
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const later = (fn: () => void, ms: number) => timers.current.push(setTimeout(fn, ms));

  const summary = hostSummary(state);
  const adminToken = getAdminToken(game.id);
  const draft = game.status === "draft";

  // Unpaid board: have the payment config ready so "Open board" opens checkout instantly.
  useEffect(() => {
    if (!draft) return;
    let live = true;
    fetchAppConfig()
      .then((c) => live && setPayments(c.payments))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [draft]);

  // No confetti over the host's own controls: bursts (a win on the board, a
  // claim) are hidden while the host sheet is up.
  useEffect(() => {
    if (!open) return;
    const root = document.documentElement;
    root.dataset.hxQuiet = "1";
    return () => {
      delete root.dataset.hxQuiet;
    };
  }, [open]);

  // The board moved on under an open confirm (auto-lock at kickoff, ended on another phone): back to home.
  const status = game.status;
  useEffect(() => {
    if ((view === "lock" && status !== "open") || (view === "end" && status !== "locked")) setView("home");
  }, [view, status]);

  const openSheet = useCallback((v: HostView = "home") => {
    void haptic("light");
    setView(v);
    setOpen(true);
  }, []);

  const closeSheet = useCallback(() => {
    setOpen(false);
    // Reset after the exit animation so the sheet doesn't flash the home view while leaving.
    timers.current.push(setTimeout(() => setView("home"), SHEET_EXIT_MS + 120));
  }, []);

  // ---- open an unpaid board ----
  const openCheckout = useCallback(() => {
    void haptic("light");
    setOpen(false);
    setPayOpen(true);
  }, []);

  const paid = async (_gameId: string, next: GameState | null) => {
    setPayOpen(false);
    let fresh = next;
    if (!fresh) fresh = await api.getGame(game.id).catch(() => null);
    if (fresh) apply(fresh);
    // Straight to the invite: getting friends in is the next move.
    later(onInvite, SHEET_EXIT_MS);
  };

  // Deep links from Home: ?checkout=1 ("Finish setup") and ?draw=1 ("Draw numbers").
  const wantsCheckout = params.get("checkout") === "1";
  const wantsDraw = params.get("draw") === "1";
  const claimed = claimedOf(state).claimed;
  useEffect(() => {
    if (!wantsCheckout && !wantsDraw) return;
    const next = new URLSearchParams(params);
    next.delete("checkout");
    next.delete("draw");
    setParams(next, { replace: true });
    // A beat so the board paints before the sheet slides up.
    if (wantsCheckout && status === "draft") later(() => setPayOpen(true), 250);
    else if (wantsDraw && status === "open") later(() => openSheet(claimed > 0 ? "lock" : "home"), 250);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per deep link
  }, [wantsCheckout, wantsDraw]);

  // ---- lock + reveal ----
  const lock = async () => {
    setOpen(false);
    setReveal({ draw: null, label: null, state });
    const next = await actions.lock();
    if (!next) {
      setReveal(null);
      later(() => openSheet("lock"), 60);
      return;
    }
    const { key, draw } = revealDraw(next.game);
    const fresh = Object.keys(next.game.numbers ?? {}).length > 1;
    setReveal({ draw, label: fresh ? `${next.game.periods.find((p) => p.key === key)?.label ?? "Q1"} numbers · fresh set each quarter` : null, state: next });
    setView("home");
  };

  const shareNumbers = async () => {
    const outcome = await shareLink({
      title: game.name,
      text: `Numbers are drawn for ${game.name}! Find your squares 👇`,
      url: inviteUrl(game.id),
    });
    if (outcome === "copied") toast.show({ id: "host-share", tone: "success", title: "Link copied", description: "Paste it in the group chat." });
  };

  // ---- pick a winner by hand ----
  const pickWinner = (periodKey: string, label: string) => {
    setOpen(false);
    later(async () => {
      setPicking(label);
      const cell = await pickCell(`Tap the square that wins ${label}`).finally(() => setPicking(null));
      if (!cell) {
        openSheet("home");
        return;
      }
      const next = await actions.setWinner(periodKey, cell);
      if (!next) return;
      const owner = next.squares.find((s) => s.row === cell.row && s.col === cell.col)?.playerId ?? null;
      const player = owner ? next.players.find((p) => p.id === owner) : null;
      void haptic("success");
      toast.show({
        id: player ? "activity-winner" : "host-saved",
        tone: player ? "win" : "neutral",
        title: player ? `${player.id === me ? "You win" : `${player.name} wins`} ${label}` : `${label}: empty square picked`,
        description: player ? "Your pick. Everyone sees it now." : "Nobody owns that square, so nobody wins it.",
      });
      if (player) void celebrate("pop", { origin: { x: 0.5, y: 0.4 }, colors: ["#ffd56b", "#ffc233", "#ffab0f", "#ffffff"] });
    }, SHEET_EXIT_MS);
  };

  // ---- the game ended (Final saved on a typed board, or End game) ----
  const ended = () => {
    closeSheet();
    void haptic("success");
    later(() => {
      void celebrate("cannons", {
        colors: [readableTeamColor(game.teamX.color, "#3ab7ff"), readableTeamColor(game.teamY.color, "#ff66a6"), "#ffc233", "#c6f91f"],
      });
    }, 200);
    toast.show({ id: "activity-final", tone: "win", title: "That's the game!", description: "Winners are crowned for everyone." });
  };

  const deleted = () => {
    setOpen(false);
    toast.show({ id: "host-saved", tone: "neutral", title: "Board deleted", description: `${game.name} is gone for everyone.` });
    navigate("/", { replace: true });
  };

  const barAction = () => {
    switch (summary.action.kind) {
      case "checkout":
        openCheckout();
        return;
      case "invite":
        void haptic("light");
        onInvite();
        return;
      case "lock":
        openSheet("lock");
        return;
      default:
        openSheet("home");
    }
  };

  return (
    <>
      {/* While the host taps a winning square, the board's own instruction bar is the only prompt. */}
      {picking === null && <HostBar summary={summary} onOpen={() => openSheet("home")} onAction={barAction} />}
      <HostSheet
        state={state}
        open={open}
        view={view}
        onView={setView}
        onClose={closeSheet}
        actions={actions}
        me={me}
        onInvite={() => {
          closeSheet();
          later(onInvite, SHEET_EXIT_MS);
        }}
        onOpenBoard={openCheckout}
        onLock={() => void lock()}
        onPickWinner={pickWinner}
        onEnded={ended}
        onDeleted={deleted}
      />
      {(draft || payOpen) && adminToken && (
        <Suspense fallback={null}>
          <CheckoutSheet
            open={payOpen}
            draft={{ game, adminToken }}
            payments={payments}
            onPaid={(id, next) => void paid(id, next)}
            onClose={() => setPayOpen(false)}
          />
        </Suspense>
      )}
      {reveal && (
        <NumberReveal
          game={reveal.state.game}
          squares={reveal.state.squares}
          players={reveal.state.players}
          me={me}
          draw={reveal.draw}
          drawLabel={reveal.label}
          onClose={() => setReveal(null)}
          onShare={() => void shareNumbers()}
        />
      )}
    </>
  );
}

// ---- The bar on the board ----

const ACTION_ICON = {
  checkout: <SparklesIcon size={17} strokeWidth={2.3} />,
  invite: <UsersIcon size={17} strokeWidth={2.4} />,
  lock: <LockIcon size={17} strokeWidth={2.4} />,
  score: <PencilIcon size={17} strokeWidth={2.4} />,
  auto: null,
  final: <TrophyIcon size={17} strokeWidth={2.4} />,
} as const;

function Crown({ size }: { size: "sm" | "md" }) {
  return (
    <span
      className={cx(
        "grid shrink-0 place-items-center bg-gold-400 text-ink-inverse shadow-[inset_0_-2px_0_rgb(0_0_0/0.18),inset_0_1px_0_rgb(255_255_255/0.4)]",
        size === "sm" ? "h-7 w-7 rounded-lg" : "h-10 w-10 rounded-xl",
      )}
    >
      <CrownIcon size={size === "sm" ? 15 : 19} strokeWidth={2.3} />
    </span>
  );
}

function HostBar({ summary, onOpen, onAction }: { summary: HostSummary; onOpen: () => void; onAction: () => void }) {
  const kind = summary.action.kind;

  // Unpaid: the one thing to do, said plainly, with the button right there.
  if (kind === "checkout") {
    return (
      <div className="hx-bar hx-bar-draft flex flex-col gap-3 rounded-card p-3">
        <button
          type="button"
          data-testid="host-open"
          onClick={onOpen}
          aria-haspopup="dialog"
          aria-label="Host tools"
          className="pressable flex min-h-11 items-center gap-3 rounded-2xl text-left"
        >
          <Crown size="md" />
          <span className="min-w-0 flex-1">
            <span className="block text-headline font-extrabold leading-tight text-ink">Your board isn't open yet</span>
            <span className="block text-footnote leading-snug text-ink-muted">Open it so friends can pick squares.</span>
          </span>
          <ChevronRightIcon size={16} strokeWidth={2.6} className="shrink-0 text-ink-subtle" />
        </button>
        <button
          type="button"
          data-testid="host-bar-action"
          onClick={onAction}
          className="keycap hx-nudge flex h-12 w-full items-center justify-center gap-2 rounded-btn bg-brand-400 text-callout font-extrabold text-ink-inverse [--keycap-edge:var(--color-brand-700)]"
        >
          {ACTION_ICON.checkout}
          {summary.action.label}
        </button>
      </div>
    );
  }

  // Nothing to do right now (live feed, final): one slim row.
  if (summary.slim) {
    return (
      <button
        type="button"
        data-testid="host-open"
        onClick={onOpen}
        aria-haspopup="dialog"
        className="hx-bar pressable flex h-11 w-full items-center gap-2.5 rounded-2xl pl-2 pr-3 text-left"
      >
        <Crown size="sm" />
        <span className="shrink-0 text-subhead font-extrabold text-ink">Host tools</span>
        <span className="min-w-0 flex-1 truncate text-footnote text-ink-muted">{summary.status}</span>
        <ChevronRightIcon size={15} strokeWidth={2.6} className="shrink-0 text-ink-subtle" />
      </button>
    );
  }

  // The move to make wears the brand color; the nudge is saved for lock and score.
  const nudge = kind === "lock" || kind === "score";
  const hot = nudge || kind === "invite" || kind === "final";
  return (
    <div className="hx-bar flex items-center gap-2 rounded-card py-1.5 pl-1.5 pr-1.5">
      <button
        type="button"
        data-testid="host-open"
        onClick={onOpen}
        aria-haspopup="dialog"
        className="pressable flex min-h-11 min-w-0 flex-1 items-center gap-2.5 rounded-2xl pl-1 text-left"
      >
        <Crown size="md" />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-0.5 text-subhead font-extrabold leading-tight text-ink">
            Host tools
            <ChevronRightIcon size={14} strokeWidth={2.8} className="text-ink-subtle" />
          </span>
          <span className="block truncate text-footnote leading-snug text-ink-muted">{summary.status}</span>
        </span>
      </button>
      <button
        type="button"
        data-testid="host-bar-action"
        onClick={onAction}
        className={cx(
          "keycap flex h-11 shrink-0 items-center gap-1.5 rounded-[0.875rem] px-3.5 text-subhead font-extrabold [--keycap-depth:3px]",
          kind === "final"
            ? "bg-gold-400 text-ink-inverse [--keycap-edge:var(--color-gold-700)]"
            : hot
              ? "bg-brand-400 text-ink-inverse [--keycap-edge:var(--color-brand-700)]"
              : "bg-surface-4 text-ink ring-1 ring-inset ring-line [--keycap-edge:#0a120e]",
          nudge && "hx-nudge",
        )}
      >
        {ACTION_ICON[kind]}
        {summary.action.label}
      </button>
    </div>
  );
}
