// New board on one screen: pick the game (the soonest one is already picked),
// glance at the rules and details (one line each, open to change), tap Create.
// That one tap creates the board and, in test mode or the iOS app, opens it
// too: the button runs from "Setting up your board" to "You're live!" with
// confetti and the board opens with its invite sheet up (/g/<id>?invite=1).
// Only a real web checkout adds a step: the Apple Pay / Google Pay sheet.

import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { defaultFormat, isPrizeNoteError, rulesOf, withRules } from "../../shared/formats";
import type { Game, GameFormat, PaymentConfig, ScheduleEvent } from "../../shared/types";
import { ArrowRightIcon, CheckIcon, SlidersIcon, TrophyIcon } from "../components/icons";
import { useHideTabBar } from "../components/shell";
import {
  ActionBar,
  Avatar,
  Button,
  celebrate,
  CELEBRATION_COLORS,
  cx,
  prefersReducedMotion,
  Spinner,
  TextField,
  TopBar,
  useToast,
} from "../components/ui";
import { ApiError, api } from "../lib/api";
import {
  CheckoutError,
  checkoutMethod,
  checkoutPrice,
  fetchAppConfig,
  payTest,
  payWithIAP,
  preloadCheckout,
  UnconfirmedPurchaseError,
  type PurchaseOutcome,
} from "../lib/checkout";
import { readableTeamColor } from "../lib/format";
import { NAME_MAX_LENGTH, setProfile, useProfile } from "../lib/identity";
import { haptic, platform } from "../lib/native";
import { CheckoutSheet, type CheckoutDraft } from "../features/create/CheckoutSheet";
import { CUSTOM_X_COLOR, CUSTOM_Y_COLOR, TEAM_INPUT_ID } from "../features/create/CustomMatchup";
import { DetailsPanel } from "../features/create/DetailsSection";
import { Disclosure } from "../features/create/Disclosure";
import { FormatGlyph, FormatPicker } from "../features/create/FormatPicker";
import { GamePicker, type PickerTab } from "../features/create/GamePicker";
import {
  boardHeadline,
  boardNameFor,
  buildCreateInput,
  createFormat,
  detailsSummary,
  firstBlocker,
  inputSignature,
  matchupShortNames,
  matchupTeams,
  rulesTitle,
  teamColorsFrom,
  type CreateBlocker,
  type Matchup,
} from "../features/create/model";
import { RulesEditor } from "../features/rules/RulesEditor";
import { prizeLineup, prizesSummary, type PrizeChoice, type RulesDraft } from "../features/rules/rulesModel";
import { useSchedule, type ScheduleLeague } from "../features/create/useSchedule";

interface Draft extends CheckoutDraft {
  /** inputSignature of the body that created it, so an unchanged re-tap reuses it. */
  sig: string;
  /**
   * An App Store purchase for it may still land (Ask to Buy, or charged but not
   * confirmed yet), so it's never deleted: it opens when the purchase does.
   */
  paying?: boolean;
}

type Phase = "idle" | "working" | "live";

/** How long "You're live!" and the confetti show before the board opens. */
const LIVE_BEAT_MS = 650;
const HOST_INPUT_ID = "host-name";
const GAME_SECTION_ID = "create-game";

export default function CreateGame() {
  useHideTabBar();
  const navigate = useNavigate();
  const toast = useToast();
  const profile = useProfile();
  const schedule = useSchedule();
  const colors = useMemo(() => teamColorsFrom(schedule.nfl.events), [schedule.nfl.events]);

  // ---- form state ----
  const [tab, setTab] = useState<PickerTab>("nfl");
  const tabTouched = useRef(false);
  /** Explicit picks per league (any week); without one, the soonest game is picked. */
  const [picked, setPicked] = useState<Partial<Record<ScheduleLeague, ScheduleEvent>>>({});
  const [custom, setCustom] = useState({ x: "", y: "" });
  // Always with rules (notes and amounts live in them); the prize choice stays unset until the host picks one.
  const [format, setFormat] = useState<GameFormat>(() => withRules(defaultFormat()));
  const [prizeChoice, setPrizeChoice] = useState<PrizeChoice>(null);
  const [name, setName] = useState("");
  const [nameTouched, setNameTouched] = useState(false);
  const [maxPerPlayer, setMaxPerPlayer] = useState(0);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [prizesOpen, setPrizesOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  // Ask for the host's name only when this device has never set one.
  const [needsName] = useState(() => !profile.name.trim());
  const [hostName, setHostName] = useState(profile.name);
  const [showErrors, setShowErrors] = useState(false);
  const [shake, setShake] = useState(0);

  // ---- create + checkout ----
  const [payments, setPayments] = useState<PaymentConfig | null>(null);
  const [price, setPrice] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  /** Quiet line under the button after a checkout ended without paying. */
  const [notice, setNotice] = useState<string | null>(null);
  const liveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** False once the host has left the page: a create still in flight then doesn't pull them back. */
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    fetchAppConfig()
      .then((c) => {
        if (!mounted.current) return;
        setPayments(c.payments);
        preloadCheckout(c.payments, platform());
        return checkoutPrice(c.payments, platform()).then((p) => mounted.current && setPrice(p));
      })
      .catch(() => {});
    return () => {
      mounted.current = false;
      if (liveTimer.current) clearTimeout(liveTimer.current);
    };
  }, []);

  // Focused fields (and error scrolls) stop clear of the sticky top bar and the Create bar.
  useEffect(() => {
    const root = document.documentElement;
    const prev = { top: root.style.scrollPaddingTop, bottom: root.style.scrollPaddingBottom };
    root.style.scrollPaddingTop = "calc(var(--safe-top) + var(--topbar-h) + 1rem)";
    root.style.scrollPaddingBottom = "calc(var(--safe-bottom) + 9.5rem)";
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

  // The game in the open league: the one tapped there, else the soonest.
  const leagueEvents = tab === "custom" ? [] : schedule[tab].events;
  const explicit = tab === "custom" ? undefined : picked[tab];
  const event: ScheduleEvent | null = explicit ?? leagueEvents[0] ?? null;

  const matchup: Matchup | null = tab === "custom" ? { kind: "custom", x: custom.x, y: custom.y } : event ? { kind: "linked", event } : null;
  const teams = matchupTeams(matchup, colors);
  const shortNames = matchupShortNames(matchup);
  const autoName = shortNames ? boardNameFor(shortNames[0], shortNames[1]) : "";
  const shownName = nameTouched ? name : autoName;
  const blocker = firstBlocker({ matchup, hostName: needsName ? hostName : null, format });
  const blockedLabel = showErrors && blocker ? blocker.label : null;

  const pickTab = (next: PickerTab) => {
    tabTouched.current = true;
    setTab(next);
  };

  const pickEvent = (e: ScheduleEvent) => setPicked((p) => (p[e.league]?.eventId === e.eventId ? p : { ...p, [e.league]: e }));

  /** Brings the first problem into view: focus its field, centered clear of both bars. */
  const showBlocker = (b: CreateBlocker) => {
    if (b.field === "prize") setPrizesOpen(true);
    const id = blockerTarget(b);
    // Two frames: the details panel may be opening.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const el = document.getElementById(id);
        if (!el) return;
        if (el instanceof HTMLInputElement) el.focus({ preventScroll: true });
        el.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "center" });
      }),
    );
  };

  const openBoard = (id: string) => navigate(`/g/${encodeURIComponent(id)}?invite=1`, { replace: true });

  /** The payment config for this tap (lib/checkout reuses it for a minute); the last one known if it can't load. */
  const loadPayments = async (refresh = false): Promise<PaymentConfig | null> => {
    const c = await fetchAppConfig({ refresh }).catch(() => null);
    if (!c) return payments;
    if (mounted.current && c.payments !== payments) {
      setPayments(c.payments);
      void checkoutPrice(c.payments, platform()).then((p) => mounted.current && setPrice(p));
    }
    return c.payments;
  };

  /** The payoff: the button says you're live, confetti in the team colors, then the board + invite sheet. */
  const goLive = (game: Game) => {
    if (!mounted.current) return;
    setPhase("live");
    void haptic("success");
    const burst = [readableTeamColor(game.teamX.color, CUSTOM_X_COLOR), readableTeamColor(game.teamY.color, CUSTOM_Y_COLOR), ...CELEBRATION_COLORS.slice(0, 2)];
    void celebrate("pop", { colors: burst, origin: { x: 0.5, y: 0.9 } });
    liveTimer.current = setTimeout(() => openBoard(game.id), LIVE_BEAT_MS);
  };

  const submit = async () => {
    if (phase !== "idle") return;
    if (blocker) {
      setShowErrors(true);
      setShake((n) => n + 1);
      void haptic("error");
      return showBlocker(blocker);
    }
    const input = buildCreateInput({
      matchup,
      colors,
      format,
      prizeChoice,
      name: nameTouched ? name : "",
      maxPerPlayer,
      host: { name: hostName, color: profile.color, emoji: profile.emoji },
    });
    if (!input) return;
    if (hostName.trim() !== profile.name) setProfile({ name: hostName.trim() });

    setNotice(null);
    setPhase("working");
    void haptic("medium");
    let current = draft;
    try {
      const sig = inputSignature(input);
      if (!current || current.sig !== sig) {
        const res = await api.createGame(input);
        // The settings changed after a checkout that didn't finish: drop the stale unpaid
        // draft, unless an App Store purchase for it may still land (it stays on Home).
        if (current && !current.paying) void api.deleteGame(current.game.id, current.adminToken).catch(() => {});
        current = { game: res.game, adminToken: res.adminToken, sig };
        setDraft(current);
        if (!res.paymentRequired) return goLive(current.game);
      }
      // Read per tap, so a page left open across the switch to live checkout pays the right way.
      let config = await loadPayments();
      let method = config ? checkoutMethod(config, platform()) : null;
      if (method === "test") {
        try {
          await payTest(current.game.id, current.adminToken);
          return goLive(current.game);
        } catch (err) {
          // Test checkout was switched off after this config was read: use the real one.
          if (!(err instanceof CheckoutError && err.status === 403)) throw err;
          config = await loadPayments(true);
          method = config ? checkoutMethod(config, platform()) : null;
          if (!method || method === "test") throw err;
        }
      }
      if (method === "iap") {
        // The App Store's own sheet is the confirm step.
        let r: PurchaseOutcome;
        try {
          r = await payWithIAP(current.game.id, current.adminToken, config?.iapProductId);
        } catch (err) {
          // Maybe charged and not confirmed yet: this draft must not be deleted.
          current = { ...current, paying: true };
          setDraft(current);
          throw err;
        }
        if (r.status === "paid") return goLive(current.game);
        if (r.status === "pending") {
          current = { ...current, paying: true };
          setDraft(current);
        }
        setPhase("idle");
        setNotice(r.status === "pending" ? "Waiting on approval. Your board opens the moment it's approved." : "No charge. Your draft is saved on Home.");
        return;
      }
      // A web checkout needs its own tap (Apple Pay / Google Pay must start from a press on their button).
      setPhase("idle");
      setSheetOpen(true);
    } catch (err) {
      // Already open (paid elsewhere, or a retried test checkout): that's the happy path.
      if (err instanceof CheckoutError && err.status === 409 && err.state && current) {
        if (err.unused) toast.show({ title: "That purchase wasn't needed", description: err.message, duration: 0 });
        return goLive(current.game);
      }
      setPhase("idle");
      createFailed(err);
    }
  };

  const createFailed = (err: unknown) => {
    void haptic("error");
    const message = err instanceof Error ? err.message : "Something went wrong. Try again.";
    if (err instanceof UnconfirmedPurchaseError) {
      toast.show({ title: "Payment received", description: message });
      return;
    }
    if (err instanceof ApiError && err.status === 400 && isPrizeNoteError(message)) {
      setPrizesOpen(true);
      toast.error("Keep prizes fun", message);
      return;
    }
    if (err instanceof ApiError && err.status === 429) {
      toast.error("Easy, coach", message);
      return;
    }
    toast.error("Couldn't make the board", message);
  };

  // The sheet celebrates on its own; the board fetches its own state.
  const onPaid = (id: string) => {
    setSheetOpen(false);
    openBoard(id);
  };

  const onCheckoutClose = () => {
    setSheetOpen(false);
    setNotice("No charge. Your draft is saved on Home.");
  };

  const rules = rulesOf(format);
  const rulesSubtitle = [boardHeadline(format), format.freshNumbers && "New numbers each Q"].filter(Boolean).join(" · ");
  // What players will see about prizes, as the host has it now.
  const shownFormat = createFormat(format, prizeChoice);
  const prizesSet = prizeLineup(shownFormat) !== null;
  const rulesDraft: RulesDraft = { rules, choice: prizeChoice, squarePrice: format.squarePrice ?? null, freshNumbers: format.freshNumbers };
  const editRules = (d: RulesDraft) => {
    setPrizeChoice(d.choice);
    setFormat((f) => withRules({ ...f, rules: d.rules, squarePrice: d.squarePrice, freshNumbers: d.freshNumbers }));
  };

  let label: string;
  let leading = null;
  if (phase === "working") {
    label = "Setting up your board…";
    leading = <Spinner size={18} />;
  } else if (phase === "live") {
    label = "You're live!";
    leading = <CheckIcon size={20} strokeWidth={3} />;
  } else label = blockedLabel ?? "Create board";

  return (
    <>
      {/* Opaque once collapsed, so nothing scrolling underneath reads through the title. */}
      <TopBar title="New board" back />

      <div className="flex flex-col gap-6 px-safe pb-2">
        <section id={GAME_SECTION_ID} aria-label="The game" className="scroll-mt-24">
          <GamePicker
            schedule={schedule}
            tab={tab}
            onTab={pickTab}
            selected={event}
            onPickEvent={pickEvent}
            custom={custom}
            onCustomChange={(side, value) => setCustom((c) => ({ ...c, [side]: value }))}
            showErrors={showErrors && !teams}
            colors={colors}
          />
        </section>

        {needsName && (
          <TextField
            id={HOST_INPUT_ID}
            data-testid="host-name"
            label="Your name"
            value={hostName}
            maxLength={NAME_MAX_LENGTH}
            placeholder="What friends call you"
            autoComplete="given-name"
            autoCapitalize="words"
            enterKeyHint="done"
            onChange={(e) => setHostName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
            leading={<Avatar name={hostName || "You"} color={profile.color} emoji={profile.emoji} size="sm" decorative />}
            hint="You're the host. Friends see this next to your squares."
            error={showErrors && !hostName.trim() ? "Add your name so friends know whose board it is." : undefined}
            inputClassName="font-semibold"
          />
        )}

        <div className="overflow-hidden rounded-card bg-surface-2 ring-1 ring-inset ring-line shadow-card">
          <Disclosure
            open={rulesOpen}
            onToggle={() => setRulesOpen((o) => !o)}
            icon={<FormatGlyph rules={rules} />}
            title={rulesTitle(format)}
            subtitle={rulesSubtitle}
            action="Change"
          >
            <FormatPicker
              format={format}
              onChange={setFormat}
              prizeChoice={prizeChoice}
              onPrizeChoice={setPrizeChoice}
              teamX={teams?.teamX}
              teamY={teams?.teamY}
            />
          </Disclosure>
          <div aria-hidden className="mx-4 h-px bg-line" />
          <Disclosure
            open={prizesOpen}
            onToggle={() => setPrizesOpen((o) => !o)}
            icon={<TrophyIcon size={18} className={prizesSet ? "text-ink-gold" : undefined} />}
            title="Square price & prizes"
            subtitle={
              prizesSet ? (
                <span data-testid="prizes-summary" className="text-ink-gold">{prizesSummary(shownFormat)}</span>
              ) : (
                <span data-testid="prizes-summary" className="inline-flex items-center gap-1.5">
                  <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-gold-400" />
                  {prizesSummary(shownFormat)}
                </span>
              )
            }
            action={prizesSet ? "Edit" : "Set"}
            testId="prizes-open"
          >
            <RulesEditor draft={rulesDraft} onChange={editRules} boardSize={format.boardSize} />
          </Disclosure>
          <div aria-hidden className="mx-4 h-px bg-line" />
          <Disclosure
            open={detailsOpen}
            onToggle={() => setDetailsOpen((o) => !o)}
            icon={<SlidersIcon size={18} />}
            title={shownName || autoName || "Name and max squares"}
            subtitle={detailsSummary(maxPerPlayer)}
            action="Edit"
          >
            <DetailsPanel
              format={format}
              name={shownName}
              autoName={autoName}
              onName={(v) => {
                setNameTouched(true);
                setName(v);
              }}
              maxPerPlayer={maxPerPlayer}
              onMaxPerPlayer={setMaxPerPlayer}
            />
          </Disclosure>
        </div>
      </div>

      <ActionBar>
        {/* Solid behind the button so fields and errors never show through; a short fade on top. */}
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-linear-to-t from-canvas from-80% to-canvas/0" />
        <div key={shake} className={cx(shake > 0 && "animate-shake")}>
          <Button
            data-testid="create-submit"
            size="lg"
            block
            aria-busy={phase === "working" || undefined}
            onClick={() => void submit()}
            haptic={false}
            leading={leading}
            trailing={phase === "idle" && !blockedLabel ? <ArrowRightIcon size={20} strokeWidth={2.6} /> : undefined}
            className={cx(phase === "live" && "animate-pop", phase === "working" && "cursor-progress")}
          >
            {label}
          </Button>
        </div>
        <p aria-live="polite" className="mt-2 text-center text-caption text-ink-subtle">
          {notice ?? (price ? `${price} to open, one time · Friends join with just the link` : "Friends join with just the link. No app or account.")}
        </p>
      </ActionBar>

      <CheckoutSheet open={sheetOpen} draft={draft} payments={payments} onPaid={onPaid} onClose={onCheckoutClose} />
    </>
  );
}

/** DOM id of the field (or section) a blocker points at. */
function blockerTarget(b: CreateBlocker): string {
  switch (b.field) {
    case "game":
      return GAME_SECTION_ID;
    case "team-x":
      return TEAM_INPUT_ID.x;
    case "team-y":
      return TEAM_INPUT_ID.y;
    case "host":
      return HOST_INPUT_ID;
    case "prize":
      return b.key;
  }
}
