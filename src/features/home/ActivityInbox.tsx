// Home's bell: an activity inbox across every board you're in, with an
// unread count. Wins, friends joining and grabbing squares on your boards,
// numbers drawn, finals and "your board is full" land here the moment they
// happen. Lock-screen alerts are offered (or explained, when this device
// can't get them) at the top of the inbox itself.

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertIcon, BellIcon, CheckIcon, LiveIcon, TrophyIcon } from "../../components/icons";
import { Avatar, BottomSheet, Button, cx, IconButton } from "../../components/ui";
import { relativeTime } from "../../lib/format";
import { haptic } from "../../lib/native";
import { NotifyPrompt } from "../notifications/NotifyPrompt";
import { pushIsOn, usePushStatus, type PushStatus } from "../notifications/usePushStatus";
import { readSeenAt, unreadCount, writeSeenAt, type InboxItem } from "./inbox";

export interface ActivityBellProps {
  items: InboxItem[];
  now: number;
  /** Board whose name and squares fill the alerts preview (the most relevant one on the dashboard), if any. */
  focusGameId: string | null;
}

export function ActivityBell({ items, now, focusGameId }: ActivityBellProps) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [asking, setAsking] = useState(false);
  const [seenAt, setSeenAt] = useState(() => readSeenAt());
  /** What counted as new when the inbox was opened (kept while it's open). */
  const [newSince, setNewSince] = useState(seenAt);
  const push = usePushStatus();
  const unread = unreadCount(items, seenAt);

  const show = () => {
    setNewSince(seenAt);
    const at = Math.max(Date.now(), items[0]?.at ?? 0);
    setSeenAt(at);
    writeSeenAt(at);
    setOpen(true);
  };

  // While the inbox is open, whatever arrives is read as it lands.
  useEffect(() => {
    if (!open || !items[0] || items[0].at <= seenAt) return;
    setSeenAt(items[0].at);
    writeSeenAt(items[0].at);
  }, [open, items, seenAt]);

  const go = (href: string) => {
    void haptic("selection");
    setOpen(false);
    navigate(href);
  };

  const fresh = items.filter((i) => i.at > newSince);
  const earlier = items.filter((i) => i.at <= newSince);

  return (
    <>
      <span className="relative inline-flex">
        <IconButton label={unread > 0 ? `Activity, ${unread} new` : "Activity"} icon={<BellIcon size={22} />} haptic="selection" onClick={show} />
        {unread > 0 && (
          <span
            aria-hidden
            className="pointer-events-none absolute right-0.5 top-0.5 grid h-4.5 min-w-4.5 place-items-center rounded-full bg-accent-500 px-1 text-[0.625rem] font-extrabold leading-none tabular-nums text-white ring-2 ring-canvas"
          >
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </span>
      <BottomSheet open={open} onClose={() => setOpen(false)} title="Activity" description="What's happening across your boards.">
        <PushRow
          status={push}
          onAsk={() => {
            setOpen(false);
            setAsking(true);
          }}
          onSettings={() => go("/me")}
        />
        {items.length === 0 ? (
          <p className="px-1 py-6 text-center text-subhead text-ink-muted">
            Nothing yet. Friends joining, numbers drawn and winners show up here as they happen.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {fresh.length > 0 && <InboxGroup title="New" items={fresh} now={now} unread onOpen={go} />}
            {earlier.length > 0 && <InboxGroup title={fresh.length > 0 ? "Earlier" : "Recent"} items={earlier} now={now} onOpen={go} />}
          </div>
        )}
      </BottomSheet>
      {/* The general ask from the dashboard: about your boards, not one you just made or joined. */}
      <NotifyPrompt
        gameId={focusGameId}
        trigger="home"
        open={asking}
        explicit
        onClose={() => {
          setAsking(false);
          push.refresh();
        }}
      />
    </>
  );
}

function InboxGroup({
  title,
  items,
  now,
  unread = false,
  onOpen,
}: {
  title: string;
  items: InboxItem[];
  now: number;
  unread?: boolean;
  onOpen: (href: string) => void;
}) {
  return (
    <section>
      <h3 className={cx("eyebrow mb-1 px-1", unread ? "text-ink-brand" : "text-ink-subtle")}>{title}</h3>
      <ul className="flex flex-col">
        {items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => onOpen(item.href)}
              className="pressable flex min-h-14 w-full items-center gap-3 rounded-2xl px-1 py-2 text-left hover:bg-ink/4"
            >
              <ItemArt item={item} />
              <span className="min-w-0 flex-1">
                <span className={cx("block text-subhead", unread ? "font-bold text-ink" : "font-semibold text-ink")}>{item.text}</span>
                <span className="block truncate text-caption text-ink-muted">
                  {item.board}
                  {item.detail && ` · ${item.detail}`}
                </span>
              </span>
              <span className="shrink-0 self-start pt-0.5 text-caption text-ink-subtle">{relativeTime(item.at, Math.max(now, item.at))}</span>
              {unread && <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-brand-line" />}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ItemArt({ item }: { item: InboxItem }) {
  if (item.player) return <Avatar name={item.player.name} color={item.player.color} emoji={item.player.emoji} size="md" decorative />;
  const art = {
    win: { icon: <TrophyIcon size={18} filled />, cls: "bg-gold-400 text-ink-inverse" },
    todo: { icon: <AlertIcon size={18} />, cls: "bg-brand-400 text-ink-inverse" },
    live: { icon: <LiveIcon size={18} />, cls: "bg-live-500 text-white" },
    social: { icon: <BellIcon size={18} />, cls: "bg-surface-4 text-ink" },
  }[item.tone];
  return (
    <span aria-hidden className={cx("grid h-9 w-9 shrink-0 place-items-center rounded-full", art.cls)}>
      {art.icon}
    </span>
  );
}

/** Lock-screen alerts: offered when they can be turned on, explained when they can't. */
function PushRow({ status, onAsk, onSettings }: { status: PushStatus; onAsk: () => void; onSettings: () => void }) {
  if (status.state === null) return null;
  if (pushIsOn(status)) {
    return (
      <p className="mb-4 flex items-center gap-2 px-1 text-footnote text-ink-muted">
        <CheckIcon size={15} strokeWidth={3} className="shrink-0 text-ink-brand" />
        <span className="flex-1">Lock-screen alerts are on for this device.</span>
        <button type="button" onClick={onSettings} className="pressable -my-2 min-h-11 px-2 font-bold text-ink">
          Settings
        </button>
      </p>
    );
  }
  if (status.state === "unsupported") {
    return (
      <p className="mb-4 rounded-2xl bg-surface-3 px-3.5 py-3 text-footnote text-ink-muted ring-1 ring-inset ring-line">
        Lock-screen alerts aren't available in this browser. Everything still lands here, live, while JaxSquares is open.
      </p>
    );
  }
  const copy =
    status.state === "granted"
      ? { title: "Lock-screen alerts are off", body: "You turned them off in your profile.", cta: "Change", act: onSettings }
      : status.state === "denied"
        ? { title: "Alerts are blocked for JaxSquares", body: "Switch them back on in Settings to hear about wins.", cta: "How to fix", act: onAsk }
        : status.state === "needs-install"
          ? { title: "Alerts on iPhone need the app icon", body: "Add JaxSquares to your Home Screen, then turn them on.", cta: "Show me how", act: onAsk }
          : { title: "Get these on your lock screen", body: "Wins, numbers and friends joining, even when the app is closed.", cta: "Turn on", act: onAsk };
  return (
    <div className="mb-4 flex items-center gap-3 rounded-2xl bg-surface-3 px-3.5 py-3 ring-1 ring-inset ring-line">
      <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-400/14 text-ink-brand">
        <BellIcon size={18} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-subhead font-bold text-ink">{copy.title}</p>
        <p className="text-caption text-ink-muted">{copy.body}</p>
      </div>
      <Button size="sm" variant="primary" className="!rounded-[0.875rem]" onClick={copy.act}>
        {copy.cta}
      </Button>
    </div>
  );
}
