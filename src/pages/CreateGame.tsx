// New board: pick the game, pick how squares win, (optionally) tweak details,
// then one tap to create + open checkout. On payment the board opens with its
// invite sheet up (/g/<id>?invite=1), so a host goes from "New board" to a
// sent invite in a few taps.

import { forwardRef, useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { defaultFormat, PRIZE_MONEY_ERROR } from "../../shared/formats";
import type { GameFormat, PaymentConfig, ScheduleEvent } from "../../shared/types";
import { ArrowRightIcon, CheckIcon } from "../components/icons";
import { useHideTabBar } from "../components/shell";
import { ActionBar, Avatar, Button, cx, TextField, TopBar, useToast } from "../components/ui";
import { ApiError, api } from "../lib/api";
import { fetchAppConfig, formatPrice, preloadCheckout } from "../lib/checkout";
import { NAME_MAX_LENGTH, setProfile, useProfile } from "../lib/identity";
import { haptic, platform } from "../lib/native";
import { CheckoutSheet, type CheckoutDraft } from "../features/create/CheckoutSheet";
import { DetailsSection } from "../features/create/DetailsSection";
import { FormatPicker } from "../features/create/FormatPicker";
import { GamePicker, type PickerTab } from "../features/create/GamePicker";
import {
  boardNameFor,
  buildCreateInput,
  firstPrizeProblem,
  inputSignature,
  matchupShortNames,
  matchupTeams,
  type Matchup,
} from "../features/create/model";
import { useSchedule } from "../features/create/useSchedule";

interface Draft extends CheckoutDraft {
  /** inputSignature of the body that created it, so an unchanged re-tap reuses it. */
  sig: string;
}

export default function CreateGame() {
  useHideTabBar();
  const navigate = useNavigate();
  const toast = useToast();
  const profile = useProfile();
  const schedule = useSchedule();

  // ---- form state ----
  const [tab, setTab] = useState<PickerTab>("nfl");
  const tabTouched = useRef(false);
  const [event, setEvent] = useState<ScheduleEvent | null>(null);
  const [custom, setCustom] = useState({ x: "", y: "" });
  const [format, setFormat] = useState<GameFormat>(defaultFormat);
  const [name, setName] = useState("");
  const [nameTouched, setNameTouched] = useState(false);
  const [maxPerPlayer, setMaxPerPlayer] = useState(0);
  const [prizes, setPrizes] = useState<Record<string, string>>({});
  const [detailsOpen, setDetailsOpen] = useState(false);
  // Ask for the host's name only when this device has never set one.
  const [needsName] = useState(() => !profile.name.trim());
  const [hostName, setHostName] = useState(profile.name);
  const [showErrors, setShowErrors] = useState(false);

  // ---- create + checkout ----
  const [payments, setPayments] = useState<PaymentConfig | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const gameRef = useRef<HTMLElement>(null);
  const hostRef = useRef<HTMLInputElement>(null);

  const loadConfig = (refresh = false) =>
    fetchAppConfig({ refresh })
      .then((c) => {
        setPayments(c.payments);
        preloadCheckout(c.payments, platform());
        return c.payments;
      })
      .catch(() => null);

  useEffect(() => {
    void loadConfig();
  }, []);

  // Focused fields (and error scrolls) stop clear of the sticky top bar and the Create bar.
  useEffect(() => {
    const root = document.documentElement;
    const prev = { top: root.style.scrollPaddingTop, bottom: root.style.scrollPaddingBottom };
    root.style.scrollPaddingTop = "calc(var(--safe-top) + var(--topbar-h) + 1rem)";
    root.style.scrollPaddingBottom = "calc(var(--safe-bottom) + 8.5rem)";
    return () => {
      root.style.scrollPaddingTop = prev.top;
      root.style.scrollPaddingBottom = prev.bottom;
    };
  }, []);

  // Land on the first league that has games; lead with custom teams when none do.
  useEffect(() => {
    if (tabTouched.current) return;
    const { nfl, ncaaf } = schedule;
    if (!nfl.loading && nfl.events.length) setTab("nfl");
    else if (!nfl.loading && !ncaaf.loading) setTab(ncaaf.events.length ? "ncaaf" : "custom");
  }, [schedule]);

  const matchup: Matchup | null = tab === "custom" ? { kind: "custom", x: custom.x, y: custom.y } : event ? { kind: "linked", event } : null;
  const teams = matchupTeams(matchup);
  const shortNames = matchupShortNames(matchup);
  const autoName = shortNames ? boardNameFor(shortNames[0], shortNames[1]) : "";
  const shownName = nameTouched ? name : autoName;
  const gameDone = teams !== null;
  const hostDone = hostName.trim().length > 0;

  const price = payments && platform() !== "ios" ? formatPrice(payments.priceCents, payments.currency) : null;

  const pickTab = (next: PickerTab) => {
    tabTouched.current = true;
    setTab(next);
  };

  const pickEvent = (e: ScheduleEvent) => {
    setEvent((cur) => (cur?.eventId === e.eventId ? cur : e));
  };

  const attention = (el: HTMLElement | null) => {
    void haptic("warning");
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const submit = async () => {
    if (creating) return;
    const input = buildCreateInput({
      matchup,
      format,
      name: nameTouched ? name : "",
      maxPerPlayer,
      prizes,
      host: { name: hostName, color: profile.color, emoji: profile.emoji },
    });
    if (!input) {
      setShowErrors(true);
      return attention(gameRef.current);
    }
    if (!hostDone) {
      setShowErrors(true);
      attention(hostRef.current);
      hostRef.current?.focus({ preventScroll: true });
      return;
    }
    const prizeProblem = firstPrizeProblem(format, prizes);
    if (prizeProblem) {
      setDetailsOpen(true);
      void haptic("error");
      requestAnimationFrame(() => attention(document.getElementById(`prize-${prizeProblem.key === "*" ? "all" : prizeProblem.key}`)));
      return;
    }
    if (hostName.trim() !== profile.name) setProfile({ name: hostName.trim() });

    let current = draft;
    const sig = inputSignature(input);
    if (!current || current.sig !== sig) {
      setCreating(true);
      try {
        const res = await api.createGame(input);
        // The settings changed after a cancelled checkout: drop the stale unpaid draft.
        if (current) void api.deleteGame(current.game.id, current.adminToken).catch(() => {});
        current = { game: res.game, adminToken: res.adminToken, sig };
        setDraft(current);
        if (!res.paymentRequired) return openBoard(res.game.id);
      } catch (err) {
        return createFailed(err);
      } finally {
        setCreating(false);
      }
    }
    if (!payments) void loadConfig(true);
    void haptic("medium");
    setSheetOpen(true);
  };

  const createFailed = (err: unknown) => {
    const message = err instanceof Error ? err.message : "Something went wrong. Try again.";
    if (err instanceof ApiError && err.status === 400 && message === PRIZE_MONEY_ERROR) {
      setDetailsOpen(true);
      toast.error("Keep prizes fun", message);
      return;
    }
    if (err instanceof ApiError && err.status === 429) {
      toast.error("Easy, coach", message);
      return;
    }
    toast.error("Couldn't make the board", message);
  };

  const openBoard = (id: string) => navigate(`/g/${encodeURIComponent(id)}?invite=1`, { replace: true });

  // The board fetches its own state (the socket has it too), so the paid state isn't needed here.
  const onPaid = (id: string) => {
    setSheetOpen(false);
    openBoard(id);
  };

  const onCheckoutClose = () => {
    setSheetOpen(false);
    toast.show({
      title: "Saved as a draft",
      description: "It's waiting on Home. Tap Create whenever you're ready.",
      haptic: false,
    });
  };

  return (
    <>
      <TopBar title="New board" subtitle="Pick the game, pick the rules, send the link." back />

      <div className="flex flex-col gap-9 px-safe pb-4">
        <Section ref={gameRef} step={1} title="Pick the game" done={gameDone}>
          <GamePicker
            schedule={schedule}
            tab={tab}
            onTab={pickTab}
            selectedEventId={event?.eventId ?? null}
            onPickEvent={pickEvent}
            custom={custom}
            onCustomChange={(side, value) => setCustom((c) => ({ ...c, [side]: value }))}
            showErrors={showErrors && !gameDone}
          />
        </Section>

        <Section step={2} title="How squares win" done={gameDone}>
          <FormatPicker format={format} onChange={setFormat} teamX={teams?.teamX} teamY={teams?.teamY} />
        </Section>

        {needsName && (
          <Section step={3} title="You're the host" done={hostDone}>
            <TextField
              ref={hostRef}
              data-testid="host-name"
              label="Your name"
              hideLabel
              value={hostName}
              maxLength={NAME_MAX_LENGTH}
              placeholder="Your name"
              autoComplete="given-name"
              autoCapitalize="words"
              enterKeyHint="done"
              onChange={(e) => setHostName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
              leading={<Avatar name={hostName || "You"} color={profile.color} emoji={profile.emoji} size="sm" decorative />}
              hint="Friends see this next to your squares."
              error={showErrors && !hostDone ? "Add your name so friends know whose board it is." : undefined}
              inputClassName="font-semibold"
            />
          </Section>
        )}

        <Section step={needsName ? 4 : 3} title="Details" optional>
          <DetailsSection
            open={detailsOpen}
            onToggle={() => setDetailsOpen((o) => !o)}
            format={format}
            name={shownName}
            autoName={autoName}
            onName={(v) => {
              setNameTouched(true);
              setName(v);
            }}
            maxPerPlayer={maxPerPlayer}
            onMaxPerPlayer={setMaxPerPlayer}
            prizes={prizes}
            onPrize={(key, note) => setPrizes((p) => ({ ...p, [key]: note }))}
          />
        </Section>
      </div>

      <ActionBar>
        <Button
          data-testid="create-submit"
          size="lg"
          block
          loading={creating}
          onClick={() => void submit()}
          haptic={false}
          trailing={<ArrowRightIcon size={20} strokeWidth={2.6} />}
          className={cx(!gameDone && "opacity-90")}
        >
          {price ? (
            <>
              Create board <span className="font-semibold opacity-60">·</span> {price}
            </>
          ) : (
            "Create board"
          )}
        </Button>
        <p className="mt-2 text-center text-caption text-ink-subtle">Friends join with just the link. No app or account.</p>
      </ActionBar>

      <CheckoutSheet
        open={sheetOpen}
        draft={draft}
        payments={payments}
        onPaid={onPaid}
        onClose={onCheckoutClose}
        onRetryConfig={() => void loadConfig(true)}
      />
    </>
  );
}

interface SectionProps {
  step: number;
  title: string;
  done?: boolean;
  optional?: boolean;
  children: ReactNode;
}

const Section = forwardRef<HTMLElement, SectionProps>(function Section({ step, title, done, optional, children }, ref) {
  return (
    <section ref={ref} className="scroll-mt-24">
      <h2 className="mb-3 flex items-center gap-2.5 px-0.5">
        <span
          aria-hidden
          className={cx(
            "grid h-6 w-6 place-items-center rounded-full text-caption font-extrabold tabular-nums transition-colors duration-300",
            done ? "bg-brand-400 text-ink-inverse" : "bg-surface-4 text-ink-muted ring-1 ring-inset ring-line-strong",
          )}
        >
          {done ? <CheckIcon key="done" size={14} strokeWidth={3.2} className="animate-pop" /> : step}
        </span>
        <span className="font-display text-title-3 font-extrabold text-ink">{title}</span>
        {optional && <span className="ml-auto text-footnote font-semibold text-ink-subtle">Optional</span>}
      </h2>
      {children}
    </section>
  );
});
