// The contextual "get notified" ask: a sheet that shows exactly what you'd get
// (lock-screen style banners), then one tap to turn notifications on.
//
// Handles every PushState: default (ask), granted (thank you, then close),
// denied (how to switch it back on), unsupported (never shows), needs-install
// (iPhone Safari tab: illustrated Add to Home Screen guide).
//
// Never nags: closing it remembers the dismissal for that trigger, so the same
// automatic ask doesn't come back. A tap (the bell) always opens it.

import { useEffect, useRef, useState } from "react";
import { BellIcon, CheckIcon } from "../../components/icons";
import { BottomSheet, Button, LogoMark, celebrate } from "../../components/ui";
import { peekGame } from "../../lib/live";
import { haptic } from "../../lib/native";
import { enablePush, getPushState, type PushState } from "../../lib/push";
import { BlockedGuide, InstallGuide } from "./Guides";
import { clearAskDismissals, openedByTap, rememberAskDismissed, shouldShowAsk, type AskTrigger } from "./prefs";
import "./notifications.css";

export interface NotifyPromptProps {
  gameId: string;
  /** What just happened, so the ask can be specific. */
  trigger: "claimed" | "created" | "joined";
  open: boolean;
  onClose: () => void;
  /**
   * Opened by an explicit tap (a bell, a "turn on" row): shows even if this
   * trigger's automatic ask was dismissed before. Defaults to detecting a tap
   * that happened just before opening.
   */
  explicit?: boolean;
}

type Phase = "checking" | "ask" | "working" | "done" | "blocked" | "install" | "hidden";

/** Shown this long after turning on before the sheet closes itself. */
const DONE_MS = 1700;

const COPY: Record<AskTrigger, { title: string; body: string }> = {
  claimed: {
    title: "Want a ping when your square hits?",
    body: "We'll buzz you when the numbers drop and the moment one of your squares wins.",
  },
  created: {
    title: "Know when your crew shows up",
    body: "Get a ping when friends join, when your board fills up and when a square hits.",
  },
  joined: {
    title: "Want a ping when it's go time?",
    body: "We'll buzz you when the numbers drop and the moment your square wins.",
  },
};

/** Real copy from the push service (docs/push.md), so the preview is honest. */
const BANNERS: Record<AskTrigger, [back: string, front: string]> = {
  claimed: ["🔢 Numbers are in. Find your squares.", "🎉 Your square hit at Half! 🏆"],
  created: ["🦊 Maya joined your board. 8 players in.", "🔥 Your board is full. Time to draw numbers."],
  joined: ["🔢 Numbers are in. Find your squares.", "🎉 Your square hit at Half! 🏆"],
};

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

export function NotifyPrompt({ gameId, trigger, open, onClose, explicit }: NotifyPromptProps) {
  const [phase, setPhase] = useState<Phase>("checking");
  const [note, setNote] = useState<string | null>(null);
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
    if (!shouldShowAsk(trigger, byTap)) {
      setPhase("hidden");
      onCloseRef.current();
      return;
    }
    setPhase("checking");
    let alive = true;
    void getPushState()
      .catch((): PushState => "unsupported")
      .then((state) => {
        if (!alive) return;
        const next = phaseFor(state);
        setPhase(next);
        if (next === "hidden") onCloseRef.current();
      });
    return () => {
      alive = false;
    };
  }, [open, trigger, explicit]);

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

  const turnOn = () => {
    // Safari only shows the permission prompt from inside the tap: call it before anything else.
    const result = enablePush();
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
          if (next === "hidden") onClose();
          else setPhase(next);
        }
      })
      .catch(() => {
        void haptic("error");
        setPhase("ask");
        setNote("Couldn't finish setting up. Check your connection and try again.");
      });
  };

  const showing = open && phase !== "checking" && phase !== "hidden";
  const boardName = peekGame(gameId)?.game.name ?? "JaxSquares";
  const copy = COPY[trigger];

  const header =
    phase === "install"
      ? { title: "Add JaxSquares to your Home Screen", description: "iPhone only sends notifications to Home Screen apps. Takes ten seconds." }
      : phase === "blocked"
        ? { title: "Notifications are blocked", description: "They're switched off for JaxSquares. Here's how to turn them back on:" }
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
        ) : phase === "install" || phase === "blocked" ? (
          <Button size="lg" block variant="secondary" onClick={dismiss}>
            Got it
          </Button>
        ) : undefined
      }
    >
      {(phase === "ask" || phase === "working") && (
        <div className="flex flex-col pt-3">
          <PreviewBanners key={`${open}`} boardName={boardName} lines={BANNERS[trigger]} />
          <p className="mt-4 flex items-center justify-center gap-1.5 text-footnote text-ink-subtle">
            <BellIcon size={14} />
            Game moments only. Mute any board in Profile.
          </p>
          {note && (
            <p role="status" className="mt-3 rounded-xl bg-surface-3 px-3 py-2 text-center text-footnote font-semibold text-ink">
              {note}
            </p>
          )}
        </div>
      )}

      {phase === "install" && <InstallGuide />}

      {phase === "blocked" && (
        <div className="pt-2">
          <BlockedGuide />
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
            <span className="block truncate text-footnote text-ink">{line}</span>
          </span>
        </div>
      ))}
    </div>
  );
}
