// Profile's notification controls, one shape per state: a big "turn on" ask,
// the settings rows when on (switch + test ping), or the how-to when blocked
// or when an iPhone needs the Home Screen app first.

import { useState } from "react";
import type { ReactNode } from "react";
import { BellIcon, BellOffIcon, SparklesIcon } from "../../../components/icons";
import { Button, Card, ListGroup, ListRow, Skeleton, Switch, cx, useToast } from "../../../components/ui";
import { haptic } from "../../../lib/native";
import { disablePush, enablePush, sendTestPush } from "../../../lib/push";
import { BlockedGuide, InstallGuide, StateIcon } from "../Guides";
import { PreviewBanners } from "../NotifyPrompt";
import { clearAskDismissals } from "../prefs";
import { pushIsOn, type PushStatus } from "../usePushStatus";

/** `quiet`: another action leads the screen (e.g. picking a name), so the ask doesn't shout. */
export function NotificationsCard({
  status,
  quiet = false,
  boardName = "Sunday Night Squares",
}: {
  status: PushStatus;
  quiet?: boolean;
  /** A board of mine for the preview banner, so the example feels like mine. */
  boardName?: string;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState<null | "enable" | "disable" | "test">(null);
  const { state, off } = status;
  const on = pushIsOn(status);

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
          toast.show({ tone: "success", title: "Notifications are on", description: "We'll ping you the second your square hits.", haptic: false });
        } else if (s === "denied") {
          void haptic("warning");
        }
      })
      .catch(() => toast.error("Couldn't turn them on", "Check your connection and try again."))
      .finally(() => setBusy(null));
  };

  const turnOff = () => {
    setBusy("disable");
    disablePush()
      .catch(() => undefined) // turned off locally either way; the server drops dead devices on its own
      .finally(() => {
        status.refresh();
        setBusy(null);
        toast.show({ tone: "neutral", title: "Notifications off", description: "Turn them back on here anytime." });
      });
  };

  const test = () => {
    setBusy("test");
    sendTestPush()
      .then((sent) => {
        if (sent > 0) toast.success("Test sent", "It should land in a few seconds.");
        else toast.error("That didn't reach this device", "Turn notifications off and on, then try again.");
      })
      .catch(() => toast.error("Couldn't send a test", "Check your connection and try again."))
      .finally(() => setBusy(null));
  };

  if (state === null) {
    return (
      <Card padding="md" className="flex items-center gap-3.5">
        <Skeleton className="h-12 w-12 rounded-2xl" />
        <span className="flex flex-1 flex-col gap-2">
          <Skeleton className="h-4 w-3/5" />
          <Skeleton className="h-3 w-4/5" />
        </span>
      </Card>
    );
  }

  if (state === "granted") {
    return (
      <ListGroup title="Notifications" footer={on ? "Numbers drawn, kickoff and winning squares. Nothing else." : undefined}>
        <ListRow
          leading={<RowIcon tone={on ? "brand" : "muted"}><BellIcon size={19} /></RowIcon>}
          title={on ? "Notifications are on" : "Notifications are off"}
          subtitle={on ? "For this device" : "Turned off on this device"}
          trailing={
            <Switch
              checked={on}
              disabled={busy === "enable" || busy === "disable"}
              onChange={(next) => (next ? turnOn() : turnOff())}
              aria-label="Notifications on this device"
            />
          }
        />
        {on && !off && (
          <ListRow
            leading={
              <RowIcon tone="muted">
                <SparklesIcon size={19} />
              </RowIcon>
            }
            title="Send a test notification"
            subtitle="Make sure pings reach this device"
            onClick={busy ? undefined : test}
            trailing={busy === "test" ? <span className="text-footnote font-semibold text-ink-muted">Sending…</span> : undefined}
            chevron={busy !== "test"}
          />
        )}
      </ListGroup>
    );
  }

  if (state === "default") {
    return (
      <Card tone={quiet ? "default" : "brand"} padding="lg">
        <PreviewBanners boardName={boardName} lines={["🔢 Numbers are in. Find your squares.", "🎉 Your square hit at Half! 🏆"]} />
        <h2 className="mt-5 font-display text-title-3 font-extrabold text-ink">Get a ping when your square hits</h2>
        <p className="mt-1.5 text-subhead text-ink-muted">Numbers drawn, kickoff and every winning square. Nothing else.</p>
        <Button
          size="lg"
          variant={quiet ? "secondary" : "primary"}
          block
          className="mt-5"
          loading={busy === "enable"}
          haptic={false}
          onClick={turnOn}
          data-testid="notify-enable"
        >
          Turn on notifications
        </Button>
      </Card>
    );
  }

  if (state === "needs-install") {
    return (
      <Card padding="lg">
        <div className="flex items-start gap-3.5">
          <StateIcon tone="brand" />
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-title-3 font-extrabold text-ink">Get pings on your iPhone</h2>
            <p className="mt-1 text-subhead text-ink-muted">iPhone only sends notifications to apps on your Home Screen. Three taps:</p>
          </div>
        </div>
        <InstallGuide />
      </Card>
    );
  }

  if (state === "denied") {
    return (
      <Card padding="lg">
        <div className="flex items-start gap-3.5">
          <StateIcon tone="danger" />
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-title-3 font-extrabold text-ink">Notifications are blocked</h2>
            <p className="mt-1 text-subhead text-ink-muted">Switch them back on so you don't miss your square:</p>
          </div>
        </div>
        <div className="mt-5">
          <BlockedGuide />
        </div>
      </Card>
    );
  }

  // unsupported
  return (
    <ListGroup title="Notifications">
      <ListRow
        leading={
          <RowIcon tone="muted">
            <BellOffIcon size={19} />
          </RowIcon>
        }
        title="Not available here"
        subtitle="Get the JaxSquares app, or open this in Safari or Chrome"
      />
    </ListGroup>
  );
}

function RowIcon({ tone, children }: { tone: "brand" | "muted"; children: ReactNode }) {
  return (
    <span
      aria-hidden
      className={cx(
        "grid h-9 w-9 place-items-center rounded-full",
        tone === "brand" ? "bg-brand-400/15 text-brand-300 ring-1 ring-inset ring-brand-400/30" : "bg-surface-4 text-ink-muted",
      )}
    >
      {children}
    </span>
  );
}
