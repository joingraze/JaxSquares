// Everything the board's host can do, behind one compact bar on the board.
// Renders for the board's host (this device holds its admin token) and for its
// co-hosts (useHostRole): a co-host gets every tool but the host-only ones
// (inviting or removing co-hosts, the host link, deleting the board) and sends
// no admin token; the server authorizes them by clientId. Nothing for anyone else.
//
// The bar says where the board stands and offers the next move (invite, lock
// & draw, enter the score); with nothing to do it folds to one slim row.
// Tapping it opens the host sheet. Locking plays the number-draw reveal for the
// host; everyone else sees their board update live.
//
// The host fee is due when the numbers are drawn: on a board whose fee isn't
// paid the draw reads "Draw the numbers · $4.99" and opens the checkout sheet
// first (this board, or the yearly Annual Pass), then draws. A linked board can
// be paid ahead ("Pay now and Jax draws the numbers at kickoff"). A board with
// 5 or fewer players holding squares is free: "Draw the numbers · Free", "Free
// for up to 5 players", and it just draws (no pay-ahead: Jax draws a free
// linked board at kickoff anyway). With an active Annual Pass a bigger board's
// draw reads "Draw the numbers", "Included with your Annual Pass", and just
// draws. Setting up, inviting and picking squares are free. A co-host's draw
// is covered by their own pass or the host's: this device only knows its own,
// so a co-host whose fee looks due tries the draw first and pays on the 402.
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
import { coverOf, coversBoard } from "../../../shared/pricing";
import { freshNumbersInfo, wordsFor } from "../../../shared/sports";
import type { GameState, HostPassState, MeResponse, NumberDraw } from "../../../shared/types";
import { ChevronRightIcon, CrownIcon, LockIcon, PencilIcon, ShuffleIcon, TrophyIcon, UsersIcon } from "../../components/icons";
import { celebrate, cx, useToast } from "../../components/ui";
import { api, inviteUrl } from "../../lib/api";
import { readableTeamColor } from "../../lib/format";
import { canRemovePlayer } from "../board/boardModel";
import { useHostRole, type HostRole } from "../../lib/hostRole";
import { getAdminToken, getPlayerId } from "../../lib/identity";
import { haptic, shareLink } from "../../lib/native";
import { useHostFee } from "../../lib/useHostFee";
import { useHostPass } from "../../lib/useHostPass";
import type { CheckoutPlan, CheckoutPurpose } from "../create/CheckoutSheet";
import { PassIncluded } from "../pass/PassParts";
import "./host.css";
import { FreeDrawNote } from "./FreeDrawNote";
import { claimedOf, drawIsFree, hostSummary, isPicking, needsHostFee, revealDraw, type HostSummary, type RemoveCopy } from "./hostModel";
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
  // The host (the admin token) or a co-host (by public id); anyone else gets nothing.
  const role = useHostRole(props.state);
  if (!role) return null;
  return <HostPanel {...props} role={role} />;
}

/** Time for the sheet to slide away before the board takes over (pick mode, the reveal). */
const SHEET_EXIT_MS = 320;

// The checkout sheet only matters while a board's host fee is due, so it loads on demand;
// so does the sign-in sheet the Annual Pass needs first on the web.
const CheckoutSheet = lazy(() => import("../create/CheckoutSheet").then((m) => ({ default: m.CheckoutSheet })));
const SignInSheet = lazy(() => import("../account/SignInSheet").then((m) => ({ default: m.SignInSheet })));

interface Reveal {
  draw: NumberDraw | null;
  label: string | null;
  /** Board as it was locked (squares/players for the mini board). */
  state: GameState;
}

function HostPanel({
  state,
  apply,
  pickCell,
  onInvite,
  removeRequest = null,
  onRemoveRequestHandled,
  rulesRequest = 0,
  role,
}: HostControlsProps & { role: HostRole }) {
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
  /** The checkout's starting choice: this board, or the Annual Pass after signing in for it. */
  const [plan, setPlan] = useState<CheckoutPlan>("board");
  const [signInOpen, setSignInOpen] = useState(false);
  /** What the sign-in is for: buying the Annual Pass, or running this board from any device. */
  const [signInFor, setSignInFor] = useState<"pass" | "host">("pass");
  /** The sign-in sheet loads only once it's needed (it reads the sign-in setup). */
  const [signInUsed, setSignInUsed] = useState(false);
  const [removing, setRemoving] = useState<RemoveTarget | null>(null);
  const [params, setParams] = useSearchParams();
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const later = (fn: () => void, ms: number) => timers.current.push(setTimeout(fn, ms));

  // The host's key; a co-host has none (their checkout and calls go by clientId).
  const adminToken = getAdminToken(game.id);
  // What the board costs is due at the draw (shared/pricing.ts: its host fee,
  // plus the Venue add-on on a venue board), unless 5 or fewer players hold
  // squares (free: the server marks the board paid "free" as it draws) or the
  // host's Annual Pass covers all of it (the server marks it paid through the
  // pass). Either way drawing just draws; a 402 meanwhile (a 6th player got
  // in, the pass ended) opens the checkout. A season board without the pass
  // opens the checkout on the pass.
  const unpaid = needsHostFee(game);
  const free = drawIsFree(state);
  const hostPass = useHostPass(unpaid);
  const covered = unpaid && !free && coversBoard(game, hostPass.cover);
  const fee = unpaid && !free && !covered;
  // Have the price (and the checkout config) ready while something is due.
  const { price, payments } = useHostFee(fee, game, hostPass.cover);
  const summary = hostSummary(state, price, Date.now(), covered);

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
    if (
      (view === "lock" && !squaresOpen) ||
      (view === "end" && status !== "locked") ||
      ((view === "players" || view === "remove") && !squaresOpen) ||
      // The host side views a co-host never gets (and back home if the host made this device a co-host meanwhile).
      ((view === "delete" || view === "cohost-invite" || view === "cohost-remove") && role !== "host")
    ) {
      setView("home");
    }
  }, [view, status, squaresOpen, role]);

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
    // Never the host; a co-host can't remove another co-host either (the server says so too).
    if (!player || !squaresOpen || !canRemovePlayer(game, playerId, me, role)) return;
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
  const openCheckout = useCallback((why: CheckoutPurpose, startOn: CheckoutPlan = "board") => {
    void haptic("light");
    setOpen(false);
    setPurpose(why);
    setPlan(startOn);
    setPayOpen(true);
  }, []);

  /** The Annual Pass is bought (or turned out to be on the account): this board needs nothing more, unless its Venue add-on is still due. */
  const passBought = (next: HostPassState | null) => {
    setPayOpen(false);
    const cover = coverOf(next?.pass, next?.club);
    if (cover === "none") {
      toast.show({ id: "host-saved", tone: "neutral", title: "Payment received", description: "Your Annual Pass is still confirming. Draw the numbers again in a moment." });
      return;
    }
    if (!coversBoard(game, cover)) {
      // The pass without the Venue add-on, on a venue board: the add-on for this board is next.
      later(() => openCheckout(purpose === "ahead" ? "ahead" : "draw"), SHEET_EXIT_MS);
      return;
    }
    if (purpose === "ahead") {
      toast.show({ id: "host-saved", tone: "success", title: "You're all set", description: `Your Annual Pass covers this board. Jax draws the numbers at ${wordsFor(state.game).startLower}.` });
      return;
    }
    // The host tapped "Draw the numbers": draw right away; the pass covers it.
    later(() => void draw(state), SHEET_EXIT_MS);
  };

  /** The pass on the web needs an account: sign in, then back to the checkout on the pass. */
  const signInForPass = () => {
    setPayOpen(false);
    setSignInFor("pass");
    setSignInUsed(true);
    later(() => setSignInOpen(true), SHEET_EXIT_MS);
  };

  const signInToHost = () => {
    closeSheet();
    setSignInFor("host");
    setSignInUsed(true);
    later(() => setSignInOpen(true), SHEET_EXIT_MS);
  };

  const signedInToHost = () => {
    void haptic("success");
    toast.show({ id: "host-saved", tone: "success", title: "This board is on your account", description: "Sign in on any phone or computer to run it there." });
  };

  const signedInForPass = (me: MeResponse) => {
    // The account already had a pass that covers this board: nothing to buy.
    const cover = coverOf(me.hostPass, me.clubPass);
    if (coversBoard(game, cover)) {
      toast.show({ id: "host-saved", tone: "success", title: "Your Annual Pass is on this account", description: "Drawing the numbers is included." });
      if (purpose === "draw") later(() => void draw(state), SHEET_EXIT_MS);
      return;
    }
    later(() => openCheckout(purpose, cover === "none" ? "pass" : "board"), SHEET_EXIT_MS);
  };

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
      toast.show({ id: "host-saved", tone: "success", title: "You're all set", description: `Jax draws the numbers at ${wordsFor(state.game).startLower}. Squares stay open till then.` });
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
  /**
   * The confirm's "Draw the numbers": pay what's due first. A co-host asks the
   * server first (the host's Annual Pass may cover it; a 402 opens the
   * checkout), with the reveal waiting for its answer.
   */
  const lock = () => {
    if (fee && role === "host") openCheckout("draw");
    else void draw(state, fee);
  };

  const draw = async (from: GameState, probe = false) => {
    setOpen(false);
    revealClosed.current = false;
    // A season whose games each draw their own numbers has nothing to reveal here: its games' boards do.
    const freshSeason = from.season?.numbers === "fresh";
    if (!probe && !freshSeason) setReveal({ draw: null, label: null, state: from });
    const next = await actions.lock();
    if (next === PAY_FIRST) {
      // The fee turned out to be due (an older copy of the board said paid, or
      // the Annual Pass ended meanwhile): pay, then draw.
      setReveal(null);
      void hostPass.refresh();
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
    if (freshSeason) {
      void haptic("success");
      const n = next.season?.games.filter((g) => g.id).length ?? 0;
      toast.show({
        id: "host-saved",
        tone: "success",
        title: "The season is set",
        description: `${n} ${n === 1 ? "game has" : "games have"} a board. Each draws its own numbers.`,
      });
      return;
    }
    const { key, draw } = revealDraw(next.game);
    const fresh = Object.keys(next.game.numbers ?? {}).length > 1;
    setReveal({ draw, label: fresh ? `${next.game.periods.find((p) => p.key === key)?.label ?? "Q1"} numbers · fresh set each ${freshNumbersInfo(next.game).each}` : null, state: next });
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
      const { short, moment } = periodPhrase(periodKey, label, state.game.sport);
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
        role={role}
        onInvite={() => {
          closeSheet();
          later(onInvite, SHEET_EXIT_MS);
        }}
        onSignIn={signInToHost}
        fee={fee}
        covered={covered}
        free={free}
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
      {(fee || payOpen) && (
        <Suspense fallback={null}>
          <CheckoutSheet
            open={payOpen}
            // A co-host pays with no token: the payment routes know them by clientId.
            board={{ game, adminToken }}
            purpose={purpose}
            initialPlan={plan}
            payments={payments}
            onPaid={(id, next) => void paid(id, next)}
            onPassActive={passBought}
            onSignInForPass={signInForPass}
            onClose={() => setPayOpen(false)}
          />
        </Suspense>
      )}
      {signInUsed && (
        <Suspense fallback={null}>
          <SignInSheet
            open={signInOpen}
            onClose={() => setSignInOpen(false)}
            {...(signInFor === "pass"
              ? {
                  title: "Sign in to get the Annual Pass",
                  description: "Your Annual Pass stays with your account, so every board you host on any device is covered.",
                  onSignedIn: signedInForPass,
                }
              : {
                  title: "Run your boards from any device",
                  description: "Sign in and every board you host, with its host controls, follows you to any phone or computer.",
                  onSignedIn: signedInToHost,
                })}
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

  // Time to draw and the host fee is due (or the board is free, or the Host
  // Pass covers it): the draw, with its price, "Free for up to 5 players" or
  // "Included with your Annual Pass", gets the full width.
  if (kind === "lock" && (summary.fee || summary.free || summary.covered)) {
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
        {summary.free && <FreeDrawNote className="-mt-0.5" />}
        {summary.covered && <PassIncluded className="-mt-0.5" />}
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
