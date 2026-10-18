// New board as a guided flow, five steps that each start filled in, so a
// host can just tap Next and still end up with a properly set-up board:
//   1. The game       NFL / College by week (the soonest is already picked;
//                     tapping a game picks it and moves on), or two typed
//                     teams plus a kickoff date and time.
//   2. How squares win  the preset cards, every-score setups, board size,
//                     reverse and fresh numbers.
//   3. Square price & prizes  dollars / points / just for fun (skippable:
//                     Review then flags "Square price: not set"). The
//                     amounts fill themselves in from the square price
//                     (suggestPrizes) whenever the price, the game type,
//                     reverse or the every-score options change, until the
//                     host types an amount; "Use suggested amounts" puts
//                     them back.
//   4. Final touches  board name, max squares per player, the host's name
//                     when this device has none.
//   5. Review         a card per step (tap to change it; Next from there comes
//                     back), the lineup players will see, then Create.
// Each step is a URL (/new?step=...), so the browser's back button and the
// iOS swipe-back move between steps, and the draft lives in sessionStorage
// so a reload keeps it (cleared once the board is made).
//
// Create works as before: one tap creates the board and, in test mode or the
// iOS app, opens it too ("Setting up your board" to "You're live!" with
// confetti, then /g/<id>?invite=1 with its invite sheet up). Only a real web
// checkout adds a step: the Apple Pay / Google Pay sheet. Opening the board
// first rewinds the flow's steps, so Back from the board goes where the host
// started, not into a finished flow.

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { defaultFormat, isPrizeNoteError, rulesOf, withRules } from "../../shared/formats";
import type { Game, GameFormat, PaymentConfig, ScheduleEvent } from "../../shared/types";
import { ArrowRightIcon, CheckIcon, ChevronLeftIcon, InfoIcon, XIcon } from "../components/icons";
import { useHideTabBar } from "../components/shell";
import {
  ActionBar,
  Avatar,
  Button,
  celebrate,
  CELEBRATION_COLORS,
  cx,
  IconButton,
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
import { useNow } from "../features/board/useNow";
import { CheckoutSheet, type CheckoutDraft } from "../features/create/CheckoutSheet";
import { CUSTOM_X_COLOR, CUSTOM_Y_COLOR, TEAM_INPUT_ID } from "../features/create/CustomMatchup";
import { BOARD_NAME_INPUT_ID, DetailsPanel } from "../features/create/DetailsSection";
import { FormatPicker } from "../features/create/FormatPicker";
import { GamePicker, type PickerTab } from "../features/create/GamePicker";
import { defaultKickoff, kickoffError } from "../features/create/kickoff";
import { KICKOFF_INPUT_ID, KickoffPicker } from "../features/create/KickoffPicker";
import {
  boardNameFor,
  buildCreateInput,
  createFormat,
  inputSignature,
  matchupShortNames,
  matchupTeams,
  teamColorsFrom,
  type CreateBlocker,
  type Matchup,
} from "../features/create/model";
import { ReviewStep } from "../features/create/ReviewStep";
import { useSchedule, type ScheduleLeague } from "../features/create/useSchedule";
import {
  blockerStep,
  clearDraft,
  loadDraft,
  nextStep,
  parseStep,
  reachableStep,
  readNav,
  saveDraft,
  STEP_INFO,
  STEPS,
  stepBlocker,
  stepSearch,
  type WizardCheck,
  type WizardNav,
  type WizardStep,
} from "../features/create/wizard";
import { WizardProgress } from "../features/create/WizardProgress";
import { RulesEditor } from "../features/rules/RulesEditor";
import { autoFill, type PrizeChoice, type RulesDraft } from "../features/rules/rulesModel";

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
/** A tapped game shows its check for a beat before the flow moves on. */
const PICK_BEAT_MS = 260;
const HOST_INPUT_ID = "host-name";
const GAME_SECTION_ID = "create-game";

export default function CreateGame() {
  useHideTabBar();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const profile = useProfile();
  const schedule = useSchedule();
  const now = useNow(30_000);
  const colors = useMemo(() => teamColorsFrom(schedule.nfl.events), [schedule.nfl.events]);

  // ---- the draft (restored after a reload) ----
  const [restored] = useState(() => loadDraft());
  const [tab, setTab] = useState<PickerTab>(restored?.tab ?? "nfl");
  const tabTouched = useRef(restored?.tabTouched ?? false);
  /** Explicit picks per league (any week); without one, the soonest game is picked. */
  const [picked, setPicked] = useState<Partial<Record<ScheduleLeague, ScheduleEvent>>>(restored?.picked ?? {});
  const [custom, setCustom] = useState(restored?.custom ?? { x: "", y: "" });
  const [kickoff, setKickoff] = useState<number | null>(() => (restored ? restored.kickoff : defaultKickoff(Date.now())));
  // Always with rules (notes and amounts live in them); the prize choice stays unset until the host picks one.
  const [format, setFormat] = useState<GameFormat>(() => restored?.format ?? withRules(defaultFormat()));
  const [prizeChoice, setPrizeChoice] = useState<PrizeChoice>(restored?.prizeChoice ?? null);
  // The amounts follow the suggestion until the host types one (see autoFill).
  const [prizesAuto, setPrizesAuto] = useState(restored?.prizesAuto ?? true);
  const [name, setName] = useState(restored?.name ?? "");
  const [nameTouched, setNameTouched] = useState(restored?.nameTouched ?? false);
  const [maxPerPlayer, setMaxPerPlayer] = useState(restored?.maxPerPlayer ?? 0);
  // Ask for the host's name only when this device has never set one.
  const [needsName] = useState(() => !profile.name.trim());
  const [hostName, setHostName] = useState(restored?.hostName || profile.name);
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
  /** The board to open once the flow's steps are rewound (see openBoard). */
  const leavingTo = useRef<string | null>(null);
  const [frozen, setFrozen] = useState<WizardStep | null>(null);

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

  // Focused fields (and error scrolls) stop clear of the pinned header and the bottom bar.
  useEffect(() => {
    const root = document.documentElement;
    const prev = { top: root.style.scrollPaddingTop, bottom: root.style.scrollPaddingBottom };
    root.style.scrollPaddingTop = "calc(var(--safe-top) + var(--topbar-h) + 4rem)";
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
  const scheduleLoading = tab !== "custom" && schedule[tab].loading && !explicit;

  const matchup: Matchup | null = tab === "custom" ? { kind: "custom", x: custom.x, y: custom.y } : event ? { kind: "linked", event } : null;
  const teams = matchupTeams(matchup, colors);
  const shortNames = matchupShortNames(matchup);
  const autoName = shortNames ? boardNameFor(shortNames[0], shortNames[1]) : "";
  const shownName = nameTouched ? name : autoName;
  const customKickoff = tab === "custom" ? kickoff : null;
  const check: WizardCheck = { matchup, kickoff: customKickoff, hostName: needsName ? hostName : null, format, name: nameTouched ? name : "", now };

  // ---- steps (the URL says which; history state says how we got here) ----
  const nav = readNav(location.state);
  const requested = parseStep(location.search);
  // A step can't be reached past an incomplete one (wait for the games before judging the first).
  const reachable = scheduleLoading ? requested : reachableStep(requested, check);
  const step: WizardStep = frozen ?? reachable;
  /** An in-app page sits under the flow (closing it goes back there). */
  const appBack = nav.wizardDepth > 0 ? !!nav.appBack : location.key !== "default";

  useEffect(() => {
    if (frozen || leavingTo.current || reachable === requested) return;
    navigate({ search: stepSearch(reachable) }, { replace: true, state: location.state });
  }, [frozen, reachable, requested, navigate, location.state]);

  // Steps slide forward and back (the global reduced-motion rule turns this into a plain swap).
  const motion = useRef<{ step: WizardStep; dir: "none" | "forward" | "back" }>({ step, dir: "none" });
  if (motion.current.step !== step) {
    motion.current = { step, dir: STEPS.indexOf(step) > STEPS.indexOf(motion.current.step) ? "forward" : "back" };
  }

  // The draft survives a reload until the board is made.
  useEffect(() => {
    if (leavingTo.current || frozen) return;
    saveDraft({ tab, tabTouched: tabTouched.current, picked, custom, kickoff, format, prizeChoice, prizesAuto, name, nameTouched, maxPerPlayer, hostName });
  }, [tab, picked, custom, kickoff, format, prizeChoice, prizesAuto, name, nameTouched, maxPerPlayer, hostName, frozen]);

  // Opening the board: rewind the flow's steps first (Back from the board then
  // goes where the host started), then replace the first one with the board.
  useEffect(() => {
    if (!leavingTo.current || nav.wizardDepth !== 0) return;
    const target = leavingTo.current;
    leavingTo.current = null;
    navigate(target, { replace: true });
  }, [location.key, nav.wizardDepth, navigate]);

  const blocker = stepBlocker(step, check);
  const stepIndex = STEPS.indexOf(step);

  const go = (to: WizardStep, extra: Partial<WizardNav> = {}) =>
    navigate({ search: stepSearch(to) }, { state: { wizardDepth: nav.wizardDepth + 1, appBack, ...extra } satisfies WizardNav });

  /** Next (or Done, from Review): the step's blocker if any, else on to the next step. */
  const goNext = () => {
    if (blocker) {
      setShake((n) => n + 1);
      void haptic("error");
      return showBlocker(blocker);
    }
    // The soonest game was showing as picked: make it the pick, so a reload keeps it.
    if (step === "game" && tab !== "custom" && event && picked[tab]?.eventId !== event.eventId) setPicked((p) => ({ ...p, [tab]: event }));
    if (nav.fromReview) {
      if (nav.wizardDepth > 0) return navigate(-1);
      return navigate({ search: stepSearch("review") }, { replace: true, state: { wizardDepth: 0, appBack } satisfies WizardNav });
    }
    const next = nextStep(step);
    if (next) go(next);
  };
  const goNextRef = useRef(goNext);
  goNextRef.current = goNext;

  const goBack = () => {
    if (nav.wizardDepth > 0) return navigate(-1);
    const prev = STEPS[stepIndex - 1];
    if (prev) navigate({ search: stepSearch(prev) }, { replace: true, state: { wizardDepth: 0, appBack } satisfies WizardNav });
  };

  /** Leave the flow (the draft stays for this session). */
  const close = () => {
    if (appBack) navigate(-(nav.wizardDepth + 1));
    else navigate("/", { replace: true });
  };

  const pickTab = (next: PickerTab) => {
    tabTouched.current = true;
    setTab(next);
  };

  // Tapping a game picks it and moves on, after a beat to see the check.
  const [advance, setAdvance] = useState(0);
  const stepRef = useRef(step);
  stepRef.current = step;
  useEffect(() => {
    if (!advance) return;
    const t = setTimeout(() => stepRef.current === "game" && goNextRef.current(), prefersReducedMotion() ? 0 : PICK_BEAT_MS);
    return () => clearTimeout(t);
  }, [advance]);
  const pickEvent = (e: ScheduleEvent) => {
    setPicked((p) => (p[e.league]?.eventId === e.eventId ? p : { ...p, [e.league]: e }));
    if (step === "game") setAdvance((n) => n + 1);
  };

  /** Brings the problem into view: focus its field, centered clear of both bars. */
  const showBlocker = (b: CreateBlocker) => {
    const id = blockerTarget(b);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const el = document.getElementById(id);
        if (!el) return;
        if (el instanceof HTMLInputElement && el.type !== "datetime-local") el.focus({ preventScroll: true });
        el.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "center" });
      }),
    );
  };

  const openBoard = (id: string) => {
    clearDraft();
    const target = `/g/${encodeURIComponent(id)}?invite=1`;
    if (nav.wizardDepth > 0) {
      leavingTo.current = target;
      setFrozen(step);
      navigate(-nav.wizardDepth);
    } else {
      leavingTo.current = null;
      navigate(target, { replace: true });
    }
  };

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
      setShake((n) => n + 1);
      void haptic("error");
      // Review can't fix it: take the host to the step that can.
      return go(blockerStep(blocker), { fromReview: true });
    }
    const input = buildCreateInput({
      matchup,
      colors,
      kickoff: customKickoff,
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
      go("prizes", { fromReview: true });
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
  // What players will see about prizes, as the host has it now.
  const shownFormat = createFormat(format, prizeChoice);
  const rulesDraft: RulesDraft = { rules, choice: prizeChoice, squarePrice: format.squarePrice ?? null, freshNumbers: format.freshNumbers };
  /** Every change to how squares win or to the prizes: the suggested amounts follow it while the host hasn't typed one. */
  const updatePrizes = (next: GameFormat, choice: PrizeChoice = prizeChoice) => {
    const filled = autoFill({ format, choice: prizeChoice }, { format: next, choice }, prizesAuto);
    setFormat(filled.format);
    setPrizeChoice(choice);
    setPrizesAuto(filled.auto);
  };
  const editRules = (d: RulesDraft) =>
    updatePrizes(withRules({ ...format, rules: d.rules, squarePrice: d.squarePrice, freshNumbers: d.freshNumbers }), d.choice);
  const matchupLabel = shortNames ? (matchup?.kind === "linked" ? `${shortNames[0]} @ ${shortNames[1]}` : `${shortNames[0]} vs ${shortNames[1]}`) : "";
  const info = STEP_INFO[step];

  let body: ReactNode;
  switch (step) {
    case "game":
      body = (
        <section id={GAME_SECTION_ID} aria-label="The game" className="scroll-mt-24">
          <GamePicker
            schedule={schedule}
            tab={tab}
            onTab={pickTab}
            selected={event}
            onPickEvent={pickEvent}
            custom={custom}
            onCustomChange={(side, value) => setCustom((c) => ({ ...c, [side]: value }))}
            showErrors={shake > 0 && !teams}
            colors={colors}
            customFooter={<KickoffPicker value={kickoff} onChange={setKickoff} now={now} error={kickoffError(kickoff, now)} />}
          />
        </section>
      );
      break;
    case "format":
      body = (
        <FormatPicker format={format} onChange={(f, choice) => updatePrizes(f, choice)} prizeChoice={prizeChoice} teamX={teams?.teamX} teamY={teams?.teamY} />
      );
      break;
    case "prizes":
      body = <RulesEditor draft={rulesDraft} onChange={editRules} boardSize={format.boardSize} />;
      break;
    case "details":
      body = (
        <div className="flex flex-col gap-5">
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
              error={shake > 0 && !hostName.trim() ? "Add your name so friends know whose board it is." : undefined}
              inputClassName="font-semibold"
            />
          )}
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
        </div>
      );
      break;
    case "review":
      body = (
        <ReviewStep
          teams={teams}
          matchupLabel={matchupLabel}
          linked={teams?.linkedEvent ?? null}
          kickoff={customKickoff}
          format={shownFormat}
          name={(nameTouched ? name.trim() : "") || autoName || "Squares"}
          maxPerPlayer={maxPerPlayer}
          host={{ name: hostName, color: profile.color, emoji: profile.emoji }}
          now={now}
          onEdit={(s) => go(s, { fromReview: true })}
        />
      );
      break;
  }

  // ---- the bottom bar ----
  const reason = blocker && !(step === "game" && scheduleLoading) ? blocker.label : null;
  let createLabel: string;
  let createLeading = null;
  if (phase === "working") {
    createLabel = "Setting up your board…";
    createLeading = <Spinner size={18} />;
  } else if (phase === "live") {
    createLabel = "You're live!";
    createLeading = <CheckIcon size={20} strokeWidth={3} />;
  } else createLabel = "Create board";
  const nextLabel = nav.fromReview ? "Done" : step === "prizes" && prizeChoice === null ? "Skip for now" : "Next";

  return (
    <>
      <TopBar
        title="New board"
        large={false}
        leading={<IconButton label="Close" icon={<XIcon size={22} />} onClick={close} />}
        accessory={<WizardProgress step={step} />}
      />

      {/* Clipped sideways: a step sliding in never widens the page (the phone would zoom out). */}
      <div className="overflow-x-clip">
        <div
          key={step}
          data-testid="wizard-step"
          data-step={step}
          className={cx(
            "flex flex-col gap-5 px-safe pb-2 pt-3",
            motion.current.dir === "forward" && "animate-route-push",
            motion.current.dir === "back" && "animate-route-pop",
          )}
        >
          <header className="px-1">
            <h1 className="font-display text-title-2 font-extrabold text-ink">{info.title}</h1>
            <p className="mt-1 text-subhead text-ink-muted">{info.subtitle}</p>
          </header>
          {body}
        </div>
      </div>

      <ActionBar>
        {/* Solid behind the buttons so fields and errors never show through; a short fade on top. */}
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-linear-to-t from-canvas from-80% to-canvas/0" />
        {reason && step !== "review" && (
          <p role="status" className="mb-2 flex items-center justify-center gap-1.5 text-center text-footnote font-semibold text-ink-muted animate-fade-in">
            <InfoIcon size={14} className="shrink-0" />
            {reason}
          </p>
        )}
        <div key={shake} className={cx("flex gap-2.5", shake > 0 && "animate-shake")}>
          {stepIndex > 0 && phase === "idle" && (
            <Button
              data-testid="wizard-back"
              variant="secondary"
              size="lg"
              className="shrink-0 px-4"
              leading={<ChevronLeftIcon size={20} strokeWidth={2.6} />}
              onClick={goBack}
              aria-label="Back"
            >
              Back
            </Button>
          )}
          {step === "review" ? (
            <Button
              data-testid="create-submit"
              size="lg"
              block
              aria-busy={phase === "working" || undefined}
              onClick={() => void submit()}
              haptic={false}
              leading={createLeading}
              trailing={phase === "idle" ? <ArrowRightIcon size={20} strokeWidth={2.6} /> : undefined}
              className={cx("min-w-0 flex-1", phase === "live" && "animate-pop", phase === "working" && "cursor-progress")}
            >
              {createLabel}
            </Button>
          ) : (
            <Button
              data-testid="wizard-next"
              size="lg"
              block
              aria-disabled={blocker ? true : undefined}
              onClick={goNext}
              haptic={false}
              trailing={nav.fromReview ? <CheckIcon size={20} strokeWidth={2.8} /> : <ArrowRightIcon size={20} strokeWidth={2.6} />}
              className="min-w-0 flex-1"
            >
              {nextLabel}
            </Button>
          )}
        </div>
        {step === "review" && (
          <p aria-live="polite" className="mt-2 text-center text-caption text-ink-subtle">
            {notice ?? (price ? `${price} to open, one time · Friends join with just the link` : "Friends join with just the link. No app or account.")}
          </p>
        )}
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
    case "kickoff":
      return KICKOFF_INPUT_ID;
    case "host":
      return HOST_INPUT_ID;
    case "name":
      return BOARD_NAME_INPUT_ID;
    case "prize":
      return b.key;
  }
}
