// Profile's notifications control. One card shell for every state (icon,
// title, a one-line value, one action) so a state change reads as the same
// control changing, not a different section:
//
//   ask        [bell]  Get pinged when your square hits    First up: …        [Turn on]
//   on         [bell]  Notifications are on                Next: …            [switch]
//   off        [off]   Notifications are off               You'll miss: …     [switch]
//   install    [bell]  Get pings on your iPhone            Needs Home Screen  [Show me how]
//   blocked    [off]   Off in iPhone Settings              You'll miss: …     [Fix it]
//   unsupported[off]   Not available in this browser       Where they work    [›]
//
// "Show me how" / "Fix it" open the notifications sheet with the illustrated
// guide for this platform (it rechecks when you come back from Settings).

import { useState, type ReactNode } from "react";
import type { GameSummary } from "../../../../shared/types";
import { BellIcon, BellOffIcon, ChevronRightIcon, SparklesIcon } from "../../../components/icons";
import { BottomSheet, Button, Skeleton, Switch, cx, useToast } from "../../../components/ui";
import { haptic } from "../../../lib/native";
import { disablePush, enablePush, sendTestPush } from "../../../lib/push";
import { StateIcon } from "../Guides";
import { NotifyPrompt } from "../NotifyPrompt";
import { blockedHelp, detectHelpEnv } from "../platformHelp";
import { clearAskDismissals } from "../prefs";
import { pushIsOn, type PushStatus } from "../usePushStatus";
import { pingBoards, wouldMiss } from "./pings";

const SCOPE = "Numbers drawn, kickoff and winning squares. Nothing else.";
const TOAST_ID = "notify-settings";

export function NotificationsCard({ status, games }: { status: PushStatus; games: readonly GameSummary[] | null }) {
  const toast = useToast();
  const [busy, setBusy] = useState<null | "enable" | "disable" | "test">(null);
  const [guide, setGuide] = useState(false);
  const [why, setWhy] = useState(false);
  const { state, off } = status;
  const on = pushIsOn(status);
  const miss = wouldMiss(games ?? []);
  const focus = pingBoards(games ?? []).active[0];

  const turnOn = () => {
    // Straight from the tap: Safari only prompts inside it.
    const result = enablePush();
    setBusy("enable");
    result
      .then((s) => {
        status.set(s);
        if (s === "granted") {
          clearAskDismissals();
          void haptic("success");
          toast.show({ id: TOAST_ID, tone: "success", title: "Notifications are on", description: "We'll ping you the second your square hits.", haptic: false });
        } else if (s === "denied") {
          void haptic("warning");
        }
      })
      .catch(() => toast.show({ id: TOAST_ID, tone: "error", title: "Couldn't turn them on", description: "Check your connection and try again." }))
      .finally(() => setBusy(null));
  };

  const turnOff = () => {
    setBusy("disable");
    disablePush()
      .catch(() => undefined) // turned off locally either way; the server drops dead devices on its own
      .finally(() => {
        status.refresh();
        setBusy(null);
        toast.show({ id: TOAST_ID, tone: "neutral", title: "Notifications off", description: "Turn them back on here anytime." });
      });
  };

  const test = () => {
    setBusy("test");
    sendTestPush()
      .then((sent) => {
        if (sent > 0) toast.show({ id: TOAST_ID, tone: "success", title: "Test sent", description: "It should land in a few seconds." });
        else toast.show({ id: TOAST_ID, tone: "error", title: "That didn't reach this device", description: "Turn notifications off and on, then try again." });
      })
      .catch(() => toast.show({ id: TOAST_ID, tone: "error", title: "Couldn't send a test", description: "Check your connection and try again." }))
      .finally(() => setBusy(null));
  };

  const guideSheet = (
    <NotifyPrompt
      gameId={focus?.id}
      trigger="home"
      explicit
      open={guide}
      onClose={() => {
        setGuide(false);
        status.refresh();
      }}
    />
  );

  if (state === null) {
    return (
      <Shell icon={<Skeleton className="h-12 w-12 rounded-2xl" />} title={<Skeleton className="h-4 w-3/5" />} value={<Skeleton className="mt-1 h-3 w-4/5" />} />
    );
  }

  if (state === "granted") {
    const toggle = (
      <Switch
        checked={on}
        disabled={busy === "enable" || busy === "disable"}
        onChange={(next) => (next ? turnOn() : turnOff())}
        aria-label="Notifications on this device"
      />
    );
    return (
      <Shell
        tone={on ? "on" : "off"}
        icon={<StateIcon tone={on ? "brand" : "muted"}>{on ? undefined : <BellOffIcon size={22} />}</StateIcon>}
        title={on ? "Notifications are on" : "Notifications are off"}
        value={on ? (miss ? `Next: ${miss}` : "On for this device") : miss ? `You'll miss: ${miss}` : "Off on this device"}
        action={toggle}
        footer={on ? SCOPE : undefined}
      >
        {on && !off && (
          <button type="button" onClick={busy ? undefined : test} className="pressable flex min-h-13 w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-white/3">
            <span aria-hidden className="grid h-8 w-8 place-items-center rounded-full bg-surface-4 text-ink-muted">
              <SparklesIcon size={17} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-subhead font-semibold text-ink">Send a test notification</span>
              <span className="block text-footnote text-ink-muted">Make sure pings reach this device</span>
            </span>
            {busy === "test" ? (
              <span className="text-footnote font-semibold text-ink-muted">Sending…</span>
            ) : (
              <ChevronRightIcon size={18} className="-mr-1 shrink-0 text-ink-subtle" />
            )}
          </button>
        )}
      </Shell>
    );
  }

  if (state === "default") {
    return (
      <Shell
        tone="ask"
        icon={<StateIcon tone="brand" />}
        title="Get pinged when your square hits"
        value={miss ? `First up: ${miss}` : "Only the moments that matter on your boards."}
        footer={SCOPE}
        action={
          <Button
            size="sm"
            loading={busy === "enable"}
            haptic={false}
            onClick={turnOn}
            aria-label="Turn on notifications"
            data-testid="notify-enable"
            className="!h-10 !px-4"
          >
            Turn on
          </Button>
        }
      />
    );
  }

  if (state === "needs-install") {
    return (
      <>
        <Shell
          tone="ask"
          icon={<StateIcon tone="brand" />}
          title="Get pings on your iPhone"
          value="iPhone needs JaxSquares on your Home Screen first. Takes ten seconds."
          action={
            <Button size="sm" onClick={() => setGuide(true)} aria-label="Show me how" className="!h-10 !px-4">
              Set up
            </Button>
          }
        />
        {guideSheet}
      </>
    );
  }

  if (state === "denied") {
    const help = blockedHelp(detectHelpEnv());
    return (
      <>
        <Shell
          tone="blocked"
          icon={<StateIcon tone="danger" />}
          title={help.kind === "install" ? "Get pings on your iPhone" : help.short}
          value={miss ? `You'll miss: ${miss}` : help.kind === "install" ? "iPhone needs JaxSquares on your Home Screen first." : "One switch brings them back."}
          action={
            <Button size="sm" onClick={() => setGuide(true)} className="!h-10 !px-4">
              {help.kind === "install" ? "Set up" : "Fix it"}
            </Button>
          }
        />
        {guideSheet}
      </>
    );
  }

  // unsupported: say where they do work, one tap away.
  return (
    <>
      <Shell
        tone="off"
        onClick={() => setWhy(true)}
        icon={<StateIcon tone="muted">{<BellOffIcon size={22} />}</StateIcon>}
        title="Not available in this browser"
        value="See where JaxSquares can ping you."
        action={<ChevronRightIcon size={18} className="-mr-1 shrink-0 text-ink-subtle" />}
      />
      <BottomSheet
        open={why}
        onClose={() => setWhy(false)}
        title="Where notifications work"
        description="This browser can't get push notifications. Your boards still update live while JaxSquares is open."
        footer={
          <Button size="lg" block variant="secondary" onClick={() => setWhy(false)}>
            Got it
          </Button>
        }
      >
        <ul className="flex flex-col gap-3 pb-2">
          {[
            ["iPhone and iPad", "Open JaxSquares in Safari, add it to your Home Screen, then turn them on."],
            ["Android and computers", "Chrome, Edge or Firefox, with notifications allowed for jaxsquares.com."],
            ["The JaxSquares app", "Turn them on from Profile in the app."],
          ].map(([where, how]) => (
            <li key={where} className="flex gap-3 rounded-2xl bg-surface-3 px-3.5 py-3 ring-1 ring-inset ring-line">
              <BellIcon size={18} className="mt-0.5 shrink-0 text-brand-300" />
              <span>
                <span className="block text-callout font-bold text-ink">{where}</span>
                <span className="block text-footnote text-ink-muted">{how}</span>
              </span>
            </li>
          ))}
        </ul>
      </BottomSheet>
    </>
  );
}

/** The one shape every state shares: icon, title, one-line value, one action, optional rows below. */
function Shell({
  tone = "off",
  icon,
  title,
  value,
  action,
  footer,
  onClick,
  children,
}: {
  tone?: "ask" | "on" | "off" | "blocked";
  icon: ReactNode;
  title: ReactNode;
  value: ReactNode;
  action?: ReactNode;
  footer?: ReactNode;
  onClick?: () => void;
  children?: ReactNode;
}) {
  const head = (
    <>
      {icon}
      <span className="min-w-0 flex-1">
        <span className="block font-display text-headline font-extrabold leading-snug text-ink">{title}</span>
        <span className="mt-0.5 block text-footnote leading-snug text-ink-muted">{value}</span>
      </span>
      {action && <span className="flex shrink-0 items-center">{action}</span>}
    </>
  );
  return (
    <section>
      <h2 className="eyebrow mb-2 px-1 text-ink-subtle">Notifications</h2>
      <div
        className={cx(
          "overflow-hidden rounded-card bg-surface-2 shadow-card ring-1 ring-inset [&>*+*]:border-t [&>*+*]:border-line",
          tone === "ask" ? "ring-brand-400/30 bg-[linear-gradient(120deg,rgb(198_249_31/0.07),transparent_55%)]" : tone === "blocked" ? "ring-danger-500/25" : "ring-line",
        )}
      >
        {onClick ? (
          <button type="button" onClick={onClick} className="pressable flex w-full items-center gap-3.5 p-4 text-left hover:bg-white/3">
            {head}
          </button>
        ) : (
          <div className="flex items-center gap-3.5 p-4">{head}</div>
        )}
        {children}
      </div>
      {footer && <p className="mt-2 px-1 text-footnote text-ink-subtle">{footer}</p>}
    </section>
  );
}
