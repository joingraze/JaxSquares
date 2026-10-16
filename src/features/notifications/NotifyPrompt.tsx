// The contextual "get notified" ask: a sheet that shows exactly what you'd get
// (lock-screen style banners about *this* board), then one tap to turn
// notifications on.
//
// Handles every PushState: default (ask), granted (thank you, then close),
// denied (the fix for this platform, illustrated, rechecked when you come
// back), unsupported (never shows), needs-install (iPhone Safari tab:
// illustrated Add to Home Screen guide).
//
// Never nags: closing it remembers the dismissal for that trigger, so the same
// automatic ask doesn't come back. A tap (a bell, a "turn on" row) or
// `explicit` always opens it. After a claim it waits for the confetti to land
// before it slides up.

import { useCallback, useEffect, useRef, useState } from "react";
import { BellIcon, CheckIcon } from "../../components/icons";
import { BottomSheet, Button, LogoMark, celebrate } from "../../components/ui";
import { getPlayerId } from "../../lib/identity";
import { peekGame } from "../../lib/live";
import { haptic, onAppResume } from "../../lib/native";
import { enablePush, getPushState, type PushState } from "../../lib/push";
import { askCopy } from "./askCopy";
import { BlockedGuide, InstallGuide } from "./Guides";
import { blockedHelp, detectHelpEnv, type BlockedHelp } from "./platformHelp";
import { clearAskDismissals, openedByTap, rememberAskDismissed, shouldShowAsk, type AskTrigger } from "./prefs";
import "./notifications.css";

export interface NotifyPromptProps {
  /** The board the ask is about (its name and my squares fill the preview). Optional for the general Home ask. */
  gameId?: string | null;
  /** What just happened, so the ask can be specific. "home" = a general ask from the dashboard. */
  trigger: AskTrigger;
  open: boolean;
  onClose: () => void;
  /**
   * Opened by an explicit tap (a bell, a "turn on" row): always opens, even if
   * this trigger's automatic ask was dismissed before, and without waiting.
   * Defaults to detecting a tap that happened just before opening.
   */
  explicit?: boolean;
  /**
   * How long an automatic ask waits before showing, so it doesn't land on top
   * of a celebration. Defaults to letting the claim confetti finish.
   */
  settleMs?: number;
}

type Phase = "checking" | "ask" | "working" | "done" | "blocked" | "install" | "hidden";

/** Shown this long after turning on before the sheet closes itself. */
const DONE_MS = 1700;
/** The claim "pop" confetti lasts ~2.3 s and the board opens the ask 1.2 s in: wait out the rest. */
export const CONFETTI_SETTLE_MS = 1300;

function phaseFor(state: PushState): Phase {
  switch (state) {
    case "default":
      return "ask";
    case "needs-install":
      return "install";
    case "denied":
      return "blocked";
    default:
      // granted (nothing to ask) or unsupported (can't work here)
      return "hidden";
  }
}

export function NotifyPrompt({ gameId, trigger, open, onClose, explicit, settleMs }: NotifyPromptProps) {
  const [phase, setPhase] = useState<Phase>("checking");
  const [note, setNote] = useState<string | null>(null);
  const [help, setHelp] = useState<BlockedHelp>(() => blockedHelp(detectHelpEnv()));
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // A fresh open starts from "checking", before the first paint (no flash of the last session's step).
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setPhase("checking");
  }

  // Decide what to show each time it opens.
  useEffect(() => {
    if (!open) return;
    const byTap = explicit ?? openedByTap();
    setNote(null);
    setHelp(blockedHelp(detectHelpEnv()));
    if (!shouldShowAsk(trigger, byTap)) {
      setPhase("hidden");
      onCloseRef.current();
      return;
    }
    setPhase("checking");
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const wait = byTap ? 0 : (settleMs ?? (trigger === "claimed" ? CONFETTI_SETTLE_MS : 0));
    const started = Date.now();
    void getPushState()
      .catch((): PushState => "unsupported")
      .then((state) => {
        if (!alive) return;
        const next = phaseFor(state);
        if (next === "hidden") {
          setPhase("hidden");
          onCloseRef.current();
          return;
        }
        const show = () => alive && setPhase(next);
        const left = wait - (Date.now() - started);
        if (left > 0) timer = setTimeout(show, left);
        else show();
      });
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [open, trigger, explicit, settleMs]);

  // Turned on: a moment of thanks, then out of the way.
  useEffect(() => {
    if (phase !== "done") return;
    const t = setTimeout(() => onCloseRef.current(), DONE_MS);
    return () => clearTimeout(t);
  }, [phase]);

  const dismiss = () => {
    if (phase === "ask" || phase === "install" || phase === "blocked") rememberAskDismissed(trigger);
    onClose();
  };

  /** Follow an enablePush() through to the right step. */
  const settle = useCallback((result: Promise<PushState>) => {
    setPhase("working");
    setNote(null);
    result
      .then((state) => {
        if (state === "granted") {
          clearAskDismissals();
          void haptic("success");
          void celebrate("pop", { origin: { x: 0.5, y: 0.62 } });
          setPhase("done");
        } else if (state === "default") {
          setPhase("ask");
          setNote("No worries. Tap again whenever you're ready.");
        } else {
          const next = phaseFor(state);
          if (next === "hidden") onCloseRef.current();
          else setPhase(next);
        }
      })
      .catch(() => {
        void haptic("error");
        setPhase("ask");
        setNote("Couldn't finish setting up. Check your connection and try again.");
      });
  }, []);

  // Safari only shows the permission prompt from inside the tap: enablePush() is the first call.
  const turnOn = () => settle(enablePush());

  /** Back from Settings (or tapped "I've turned them on"): look again, and finish setting up if they're allowed now. */
  const recheck = useCallback(
    (byTap: boolean) => {
      void getPushState()
        .catch((): PushState => "unsupported")
        .then((state) => {
          if (state === "granted") settle(enablePush());
          else if (state === "default") setPhase("ask");
          else if (byTap) {
            void haptic("warning");
            setNote(`Still off. ${help.steps[help.steps.length - 1] ?? "Switch them on"}, then come back.`);
          }
        });
    },
    [help, settle],
  );

  // While showing the fix, notice the moment they come back from Settings.
  useEffect(() => {
    if (!open || phase !== "blocked" || help.kind === "install") return;
    return onAppResume(() => recheck(false));
  }, [open, phase, help.kind, recheck]);

  const showing = open && phase !== "checking" && phase !== "hidden";
  const state = gameId ? peekGame(gameId) : null;
  const copy = askCopy(trigger, state, getPlayerId());
  // A Safari tab that reports "blocked" really just needs the Home Screen app: show that guide.
  const blockedInstall = phase === "blocked" && help.kind === "install";

  const header =
    phase === "install"
      ? { title: "Add JaxSquares to your Home Screen", description: "iPhone only sends notifications to Home Screen apps. Takes ten seconds." }
      : phase === "blocked"
        ? { title: help.title, description: help.description }
        : phase === "done"
          ? null
          : { title: copy.title, description: copy.body };

  return (
    <BottomSheet
      open={showing}
      onClose={dismiss}
      dismissible={phase !== "working"}
      title={header?.title}
      description={header?.description}
      aria-label={header ? undefined : "Notifications are on"}
      footer={
        phase === "ask" || phase === "working" ? (
          <div className="flex flex-col gap-1">
            <Button size="lg" block loading={phase === "working"} haptic={false} onClick={turnOn} data-testid="notify-enable">
              Turn on notifications
            </Button>
            <Button variant="ghost" block onClick={dismiss} disabled={phase === "working"} className="text-ink-muted">
              Not now
            </Button>
          </div>
        ) : phase === "blocked" && !blockedInstall ? (
          <div className="flex flex-col gap-1">
            <Button size="lg" block haptic={false} onClick={() => recheck(true)}>
              I've turned them on
            </Button>
            <Button variant="ghost" block onClick={dismiss} className="text-ink-muted">
              Not now
            </Button>
          </div>
        ) : phase === "install" || blockedInstall ? (
          <Button size="lg" block variant="secondary" onClick={dismiss}>
            Got it
          </Button>
        ) : undefined
      }
    >
      {(phase === "ask" || phase === "working") && (
        <div className="flex flex-col pt-3">
          <PreviewBanners key={`${open}`} boardName={copy.boardName} lines={copy.lines} />
          <ul className="mt-4 flex flex-col gap-1.5" aria-label="What you'll get">
            {copy.scope.map((s) => (
              <li key={s} className="flex items-center gap-2 text-footnote font-semibold text-ink">
                <span aria-hidden className="grid h-4.5 w-4.5 shrink-0 place-items-center rounded-full bg-brand-400/16 text-brand-300">
                  <CheckIcon size={11} strokeWidth={3.4} />
                </span>
                {s}
              </li>
            ))}
          </ul>
          <p className="mt-3 flex items-center gap-1.5 text-caption text-ink-subtle">
            <BellIcon size={13} />
            Nothing else. Mute any board in Profile.
          </p>
          {note && (
            <p role="status" className="mt-3 rounded-xl bg-surface-3 px-3 py-2 text-center text-footnote font-semibold text-ink">
              {note}
            </p>
          )}
        </div>
      )}

      {(phase === "install" || blockedInstall) && <InstallGuide />}

      {phase === "blocked" && !blockedInstall && (
        <div className="pt-1">
          <BlockedGuide help={help} />
          {note && (
            <p role="status" className="mt-4 rounded-xl bg-surface-3 px-3 py-2 text-center text-footnote font-semibold text-ink">
              {note}
            </p>
          )}
        </div>
      )}

      {phase === "done" && (
        <div role="status" className="flex flex-col items-center pb-6 pt-2 text-center">
          <span className="jxn-check grid h-20 w-20 place-items-center rounded-full bg-brand-400 text-ink-inverse shadow-glow-brand">
            <CheckIcon size={40} strokeWidth={3.2} />
          </span>
          <h2 className="mt-5 font-display text-title-2 font-extrabold text-ink">You're in!</h2>
          <p className="mt-1.5 text-callout text-ink-muted">We'll ping you the second it matters.</p>
        </div>
      )}
    </BottomSheet>
  );
}

/** Two lock-screen style notifications dropping in: what you'll actually get. */
export function PreviewBanners({ boardName, lines }: { boardName: string; lines: readonly [string, string] }) {
  return (
    <div aria-hidden className="jxn-banners">
      {lines.map((line, i) => (
        <div key={line} className="jxn-banner" data-back={i === 0}>
          <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-[10px] bg-canvas ring-1 ring-white/10">
            <LogoMark size={36} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-baseline gap-2">
              <span className="min-w-0 flex-1 truncate text-footnote font-bold text-ink">{boardName}</span>
              <span className="shrink-0 text-caption text-ink-muted">now</span>
            </span>
            <span className="block text-footnote leading-snug text-ink">{line}</span>
          </span>
        </div>
      ))}
    </div>
  );
}
