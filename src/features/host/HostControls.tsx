// Everything the board's host can do, behind one compact bar on the board.
// Renders nothing unless this device holds the board's admin token.
//
// The bar says where the board stands and offers the next move (invite, lock
// & draw, enter the score); with nothing to do it folds to one slim row.
// Tapping it opens the host sheet. Locking plays the number-draw reveal for the
// host; everyone else sees their board update live.
//
// The host fee is due when the numbers are drawn: on a board whose fee isn't
// paid the draw reads "Draw the numbers · $4.99" and opens the checkout sheet
// first, then draws. A linked board can be paid ahead ("Pay now and Jax draws
// the numbers at kickoff"). Setting up, inviting and picking squares are free.
//
// Deep link (from Home): ?draw=1 opens the lock & draw confirm. Cleared once handled.
//
// Rules & prizes: the board's rules sheet asks through `rulesRequest` (its
// "Edit" button); the sheet opens on the rules editor.
//
// Removing a player: the board's players list asks through `removeRequest`
// (a public player id); the sheet opens on the "Remove Maya?" confirm.

import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { periodPhrase } from "../../../shared/formats";
import type { GameState, NumberDraw } from "../../../shared/types";
import { ChevronRightIcon, CrownIcon, LockIcon, PencilIcon, ShuffleIcon, TrophyIcon, UsersIcon } from "../../components/icons";
import { celebrate, cx, useToast } from "../../components/ui";
import { api, inviteUrl } from "../../lib/api";
import { readableTeamColor } from "../../lib/format";
import { getAdminToken, getPlayerId } from "../../lib/identity";
import { haptic, shareLink } from "../../lib/native";
import { useHostFee } from "../../lib/useHostFee";
import type { CheckoutPurpose } from "../create/CheckoutSheet";
import "./host.css";
import { claimedOf, hostSummary, isPicking, needsHostFee, revealDraw, type HostSummary, type RemoveCopy } from "./hostModel";
import { HostSheet, type HostView, type RemoveTarget } from "./HostSheet";
import { NumberReveal } from "./NumberReveal";
import { PAY_FIRST, useHostActions } from "./useHostActions";

export interface HostControlsProps {
  state: GameState;
  /** Apply a GameState returned by a host API call (the socket will also deliver it). */
  apply: (state: GameState) => void;
  /** Ask the board to let the host tap one square; resolves null if cancelled. */
  pickCell: (prompt: string) => Promise<{ row: number; col: number } | null>;
  /** Open the invite sheet. */
  onInvite: () => void;
  /** A player (public id) the host tapped remove on, on the board's players list. */
  removeRequest?: string | null;
  /** The board's rules sheet asked to edit the rules (a counter: each new value opens the editor). */
  rulesRequest?: number;
  /** The request was taken (the confirm is open): clear it so the same player can be asked again. */
  onRemoveRequestHandled?: () => void;
}

export function HostControls(props: HostControlsProps) {
  // The admin token is the host's key; without it there's nothing to show.
  if (!getAdminToken(props.state.game.id)) return null;
  return <HostPanel {...props} />;
}

/** Time for the sheet to slide away before the board takes over (pick mode, the reveal). */
const SHEET_EXIT_MS = 320;

// The checkout sheet only matters while a board's host fee is due, so it loads on demand.
const CheckoutSheet = lazy(() => import("../create/CheckoutSheet").then((m) => ({ default: m.CheckoutSheet })));

interface Reveal {
  draw: NumberDraw | null;
  label: string | null;
  /** Board as it was locked (squares/players for the mini board). */
  state: GameState;
}

function HostPanel({ state, apply, pickCell, onInvite, removeRequest = null, onRemoveRequestHandled, rulesRequest = 0 }: HostControlsProps) {
  const { game } = state;
  const toast = useToast();
  const navigate = useNavigate();
  const me = getPlayerId();
  const actions = useHostActions(game.id, apply);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<HostView>("home");
  const [reveal, setReveal] = useState<Reveal | null>(null);
  /** The host closed the reveal (it can be closed mid-shuffle). */
  const revealClosed = useRef(false);
  const [picking, setPicking] = useState<string | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  // Kept after the sheet closes so its copy doesn't flip while it slides away.
  const [purpose, setPurpose] = useState<CheckoutPurpose>("draw");
  const [removing, setRemoving] = useState<RemoveTarget | null>(null);
  const [params, setParams] = useSearchParams();
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const later = (fn: () => void, ms: number) => timers.current.push(setTimeout(fn, ms));

  const adminToken = getAdminToken(game.id);
  // The host fee is due at the draw: have the price (and the checkout config) ready while it is.
  const fee = needsHostFee(game);
  const { price, payments } = useHostFee(fee);
  const summary = hostSummary(state, price);

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
  const squaresOpen = isPicking(game);
  useEffect(() => {
    if ((view === "lock" && !squaresOpen) || (view === "end" && status !== "locked") || ((view === "players" || view === "remove") && !squaresOpen)) {
      setView("home");
    }
  }, [view, status, squaresOpen]);

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

  // ---- remove a player (asked from the board's players list or the sheet's) ----
  const askRemove = (playerId: string, from: RemoveTarget["from"]) => {
    const player = state.players.find((p) => p.id === playerId);
    if (!player || !squaresOpen || playerId === game.hostPlayerId) return;
    setRemoving({ id: playerId, name: player.name, squares: state.squares.filter((s) => s.playerId === playerId).length, from });
    if (from === "board") openSheet("remove");
    else setView("remove");
  };
  const askRemoveRef = useRef(askRemove);
  askRemoveRef.current = askRemove;
  useEffect(() => {
    if (!removeRequest) return;
    onRemoveRequestHandled?.();
    askRemoveRef.current(removeRequest, "board");
  }, [removeRequest, onRemoveRequestHandled]);

  // "Edit rules & prizes" from the board's rules sheet.
  useEffect(() => {
    if (rulesRequest > 0) openSheet("rules");
  }, [rulesRequest, openSheet]);

  const removed = (target: RemoveTarget, copy: RemoveCopy) => {
    toast.show({ id: "host-saved", tone: "success", title: copy.done, description: copy.doneDetail });
    // Back where the host started: the board, or the sheet's players list.
    if (target.from === "board") closeSheet();
    else setView("players");
  };

  // ---- the host fee (due at the draw) ----
  const openCheckout = useCallback((why: CheckoutPurpose) => {
    void haptic("light");
    setOpen(false);
    setPurpose(why);
    setPayOpen(true);
  }, []);

  const paid = async (_gameId: string, next: GameState | null) => {
    setPayOpen(false);
    let fresh = next;
    // A web payment can still be landing (the webhook): look again for a few seconds.
    for (const wait of [0, 1500, 3000, 5000]) {
      if (fresh?.game.paid) break;
      if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
      fresh = (await api.getGame(game.id).catch(() => null)) ?? fresh;
    }
    if (fresh) apply(fresh);
    if (!fresh?.game.paid) {
      toast.show({ id: "host-saved", tone: "neutral", title: "Payment received", description: "It's still confirming. Draw the numbers again in a moment." });
      return;
    }
    if (purpose === "ahead") {
      toast.show({ id: "host-saved", tone: "success", title: "You're all set", description: "Jax draws the numbers at kickoff. Squares stay open till then." });
      return;
    }
    // The host tapped "Draw the numbers": draw right away, with the reveal.
    later(() => void draw(fresh ?? state), SHEET_EXIT_MS);
  };

  // Deep link from Home: ?draw=1 ("Draw numbers").
  const wantsDraw = params.get("draw") === "1";
  const claimed = claimedOf(state).claimed;
  useEffect(() => {
    if (!wantsDraw) return;
    const next = new URLSearchParams(params);
    next.delete("draw");
    setParams(next, { replace: true });
    // A beat so the board paints before the sheet slides up.
    if (squaresOpen) later(() => openSheet(claimed > 0 ? "lock" : "home"), 250);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per deep link
  }, [wantsDraw]);

  // ---- lock + reveal ----
  /** The confirm's "Draw the numbers": pay the host fee first when it's due. */
  const lock = () => {
    if (fee) openCheckout("draw");
    else void draw(state);
  };

  const draw = async (from: GameState) => {
    setOpen(false);
    revealClosed.current = false;
    setReveal({ draw: null, label: null, state: from });
    const next = await actions.lock();
    if (next === PAY_FIRST) {
      // The fee turned out to be due (an older copy of the board said paid): pay, then draw.
      setReveal(null);
      openCheckout("draw");
      return;
    }
    // Closed while the draw was on its way: the board already has the numbers; don't pop back up.
    if (next && revealClosed.current) return;
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
      const { short, moment } = periodPhrase(periodKey, label);
      const cell = await pickCell(`Tap the square that wins ${moment}`).finally(() => setPicking(null));
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
        title: player ? `${player.id === me ? "You win" : `${player.name} wins`} ${moment}` : `${short}: empty square picked`,
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
        fee={fee}
        price={price}
        onPayAhead={() => openCheckout("ahead")}
        onLock={lock}
        onPickWinner={pickWinner}
        onEnded={ended}
        onDeleted={deleted}
        removing={removing}
        onAskRemove={(playerId) => askRemove(playerId, "sheet")}
        onRemoved={removed}
      />
      {(fee || payOpen) && adminToken && (
        <Suspense fallback={null}>
          <CheckoutSheet
            open={payOpen}
            board={{ game, adminToken }}
            purpose={purpose}
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
          onClose={() => {
            revealClosed.current = true;
            setReveal(null);
          }}
          onShare={() => void shareNumbers()}
        />
      )}
    </>
  );
}

// ---- The bar on the board ----

const ACTION_ICON = {
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

  // Time to draw and the host fee is due: the draw (with its price) gets the full width.
  if (kind === "lock" && summary.fee) {
    return (
      <div className="hx-bar hx-bar-fee flex flex-col gap-2.5 rounded-card p-3">
        <button
          type="button"
          data-testid="host-open"
          onClick={onOpen}
          aria-haspopup="dialog"
          className="pressable flex min-h-11 items-center gap-3 rounded-2xl text-left"
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
          className="keycap hx-nudge flex h-12 w-full items-center justify-center gap-2 rounded-btn bg-brand-400 text-callout font-extrabold text-ink-inverse [--keycap-edge:var(--color-brand-700)]"
        >
          <ShuffleIcon size={18} strokeWidth={2.4} />
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
              : "bg-surface-4 text-ink ring-1 ring-inset ring-line [--keycap-edge:var(--color-edge)]",
          nudge && "hx-nudge",
        )}
      >
        {ACTION_ICON[kind]}
        {summary.action.label}
      </button>
    </div>
  );
}
