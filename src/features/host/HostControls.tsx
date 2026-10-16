// Everything the board's host can do, behind one compact bar on the board.
// Renders nothing unless this device holds the board's admin token.
//
// The bar says where the board stands and offers the next move (invite, lock &
// draw, enter the score); tapping it opens the host sheet. Locking plays the
// number-draw reveal for the host; everyone else sees their board update live.

import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { GameState, NumberDraw } from "../../../shared/types";
import { ChevronRightIcon, CrownIcon, LockIcon, PencilIcon, TrophyIcon, UsersIcon } from "../../components/icons";
import { celebrate, cx, useToast } from "../../components/ui";
import { inviteUrl } from "../../lib/api";
import { readableTeamColor } from "../../lib/format";
import { getAdminToken, getPlayerId } from "../../lib/identity";
import { haptic, shareLink } from "../../lib/native";
import "./host.css";
import { hostSummary, revealDraw, type HostSummary } from "./hostModel";
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
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const later = (fn: () => void, ms: number) => timers.current.push(setTimeout(fn, ms));

  const summary = hostSummary(state);

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
      <HostBar
        summary={picking ? { ...summary, status: `Picking the ${picking} winner…` } : summary}
        quiet={picking !== null}
        onOpen={() => openSheet("home")}
        onAction={barAction}
      />
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
        onLock={() => void lock()}
        onPickWinner={pickWinner}
        onEnded={ended}
        onDeleted={deleted}
      />
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
  setup: <PencilIcon size={15} strokeWidth={2.4} />,
  invite: <UsersIcon size={15} strokeWidth={2.4} />,
  lock: <LockIcon size={15} strokeWidth={2.4} />,
  score: <PencilIcon size={15} strokeWidth={2.4} />,
  auto: null,
  final: <TrophyIcon size={15} strokeWidth={2.4} />,
} as const;

function HostBar({
  summary,
  quiet,
  onOpen,
  onAction,
}: {
  summary: HostSummary;
  /** Something else has the host's attention (pick mode): no competing call to action. */
  quiet: boolean;
  onOpen: () => void;
  onAction: () => void;
}) {
  const hot = summary.action.kind === "lock" || summary.action.kind === "score";
  return (
    <div className="hx-bar flex items-center gap-2 rounded-card py-1.5 pl-1.5 pr-2">
      <button
        type="button"
        data-testid="host-open"
        onClick={onOpen}
        aria-haspopup="dialog"
        className="pressable flex min-w-0 flex-1 items-center gap-2.5 rounded-2xl py-1 pl-1 text-left"
      >
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gold-400 text-ink-inverse shadow-[inset_0_-2px_0_rgb(0_0_0/0.18),inset_0_1px_0_rgb(255_255_255/0.4)]">
          <CrownIcon size={18} strokeWidth={2.3} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-0.5 text-subhead font-extrabold leading-tight text-ink">
            Host tools
            <ChevronRightIcon size={14} strokeWidth={2.8} className="text-ink-subtle" />
          </span>
          <span className="block truncate text-footnote leading-snug text-ink-muted">{summary.status}</span>
        </span>
      </button>
      {!quiet && summary.action.kind !== "auto" && summary.action.kind !== "setup" && (
        <button
          type="button"
          data-testid="host-bar-action"
          onClick={onAction}
          className={cx(
            "keycap flex h-9 shrink-0 items-center gap-1.5 rounded-xl px-3 text-subhead font-extrabold [--keycap-depth:3px]",
            hot
              ? "hx-nudge bg-brand-400 text-ink-inverse [--keycap-edge:var(--color-brand-700)]"
              : "bg-surface-4 text-ink ring-1 ring-inset ring-line [--keycap-edge:#0a120e]",
          )}
        >
          {ACTION_ICON[summary.action.kind]}
          {summary.action.label}
        </button>
      )}
    </div>
  );
}
