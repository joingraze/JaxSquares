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
// Creating is free: one tap makes the board and opens it ("Setting up your
// board" to "You're live!" with confetti, then /g/<id>?invite=1 with its
// invite sheet up). Setting up, inviting and picking squares cost nothing;
// drawing is free with up to 5 players, and bigger boards pay the host fee
// when the host draws the numbers (Review says so, createFeeLine, with the
// price this device shows: the App Store's in the iOS app). Opening the board
// first rewinds the flow's steps, so Back from the board goes where the host
// started, not into a finished flow.
//
// "A whole season" (season boards, docs/ARCHITECTURE.md "Season boards"):
// on the game step, after the sport and league, the host picks one game or a
// whole season. A season is a team's season (its schedule, playoffs joining
// as they're set) or games picked from the league's lists, plus whether the
// numbers stay the same all season (features/create/SeasonPicker). The other
// steps are the same: the rules and prizes apply to every game. Review shows
// "Jaguars 2026 season · 17 games so far" and the season's one host fee.
//
// "Add another board for this game" (/new?from=<board id>, host only) runs
// the same flow from that board (features/create/sibling.ts): its game, rules,
// board size and max per player, three steps (Square price & prizes, Final
// touches, Review), the name "Office Squares · Board 2". The new board joins
// that board's group and pays its own host fee at its own draw.

import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { defaultFormat, isPrizeNoteError, rulesOf, withRules } from "../../shared/formats";
import { MAX_SEASON_GAMES, seasonReviewLine } from "../../shared/season";
import { fitRules, SPORT_LEAGUES, type BoardSport } from "../../shared/sports";
import { ACCOUNT_REQUIRED_CODE, type Game, type GameFormat, type GameState, type ScheduleEvent, type SeasonNumbers, type SeasonScope, type SeasonTeam } from "../../shared/types";
import { VENUE_DEFAULTS, shownHouseRules } from "../../shared/venue";
import { ArrowRightIcon, CheckIcon, ChevronLeftIcon, InfoIcon, XIcon } from "../components/icons";
import { useHideTabBar } from "../components/shell";
import {
  ActionBar,
  Avatar,
  Button,
  celebrate,
  CELEBRATION_COLORS,
  cx,
  EmptyState,
  IconButton,
  Jax,
  prefersReducedMotion,
  Spinner,
  TextField,
  TopBar,
  useToast,
} from "../components/ui";
import { ApiError, api, errorMessage } from "../lib/api";
import { readableTeamColor } from "../lib/format";
import { hostRoleNow } from "../lib/hostRole";
import { PROVIDER_LABEL, useAuthSetup } from "../lib/auth";
import { NAME_MAX_LENGTH, setProfile, useAccount, useProfile } from "../lib/identity";
import { peekGame, primeGame } from "../lib/live";
import { haptic } from "../lib/native";
import { useHostFee } from "../lib/useHostFee";
import { useNow } from "../features/board/useNow";
import { CUSTOM_X_COLOR, CUSTOM_Y_COLOR, TEAM_INPUT_ID } from "../features/create/CustomMatchup";
import { AudiencePicker } from "../features/create/AudiencePicker";
import { BOARD_NAME_INPUT_ID, DetailsPanel } from "../features/create/DetailsSection";
import { rememberedVenueName, rememberVenueName } from "../features/create/venueName";
import { FormatPicker } from "../features/create/FormatPicker";
import { GamePicker, type BoardScope, type PickerTab } from "../features/create/GamePicker";
import { defaultKickoff, kickoffError } from "../features/create/kickoff";
import { KICKOFF_INPUT_ID, KickoffPicker } from "../features/create/KickoffPicker";
import {
  boardNameFor,
  buildCreateInput,
  createFeeLine,
  createFormat,
  matchupKind,
  matchupShortNames,
  matchupTeams,
  seasonBoardName,
  seasonGamesAhead,
  seasonMatchupLabel,
  teamColorsFrom,
  venueBoardName,
  venueSummary,
  type CreateBlocker,
  type Matchup,
  type SeasonMatchup,
} from "../features/create/model";
import { ReviewStep } from "../features/create/ReviewStep";
import { SeasonPicker } from "../features/create/SeasonPicker";
import { siblingSeed, siblingSeedProblem, type SiblingSeed } from "../features/create/sibling";
import { SiblingIntro } from "../features/create/SiblingIntro";
import { useSchedule, type ScheduleLeague } from "../features/create/useSchedule";
import { useSeasonTeams, useTeamSeason } from "../features/create/useSeason";
import {
  blockerStep,
  clearDraft,
  loadDraft,
  nextStep,
  parseFrom,
  parseStep,
  reachableStep,
  readNav,
  saveDraft,
  SIBLING_STEPS,
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
import { autoFill, setVenue, type PrizeChoice, type RulesDraft } from "../features/rules/rulesModel";

type Phase = "idle" | "working" | "live";

/** How long "You're live!" and the confetti show before the board opens. */
const LIVE_BEAT_MS = 650;
/** A tapped game shows its check for a beat before the flow moves on. */
const PICK_BEAT_MS = 260;
const HOST_INPUT_ID = "host-name";
const FOOTBALL_ONLY: readonly BoardSport[] = ["football"];
const BOTH_SPORTS: readonly BoardSport[] = ["football", "basketball"];
const GAME_SECTION_ID = "create-game";

/**
 * /new: a board of its own, or (?from=<board id>) another board for that
 * board's game, once the board is loaded and this device is shown to host it.
 */

/** Hosts sign in to make a board (the server checks too: ACCOUNT_REQUIRED_CODE). Loaded only when it's needed. */
const SignInSheet = lazy(() => import("../features/account/SignInSheet").then((m) => ({ default: m.SignInSheet })));
export default function CreateGame() {
  const location = useLocation();
  const from = parseFrom(location.search);
  const source = useSiblingSource(from);
  if (!from) return <CreateFlow sibling={null} />;
  if (!source?.seed) return <SiblingPending error={source?.error ?? null} />;
  return <CreateFlow key={source.seed.fromId} sibling={source.seed} />;
}

type SiblingSource = { seed: SiblingSeed | null; error: string | null };

/** A loaded board as the start of another board for its game, or why this device can't add one (its host or a co-host can). */
function sourceOf(state: GameState): SiblingSource {
  const problem = siblingSeedProblem(state, hostRoleNow(state.game) !== null, Date.now());
  return problem ? { seed: null, error: problem } : { seed: siblingSeed(state), error: null };
}

/**
 * The board another one is made from: its seed once loaded, or why it can't
 * be (not this device's board, its game started). The board was usually open
 * a moment ago, so its cached state starts the flow at once; a fresh read
 * follows (the suggested name counts the game's boards as they are now).
 */
function useSiblingSource(from: string | null): SiblingSource | null {
  const [result, setResult] = useState<SiblingSource | null>(() => {
    const cached = from ? peekGame(from) : null;
    return cached ? sourceOf(cached) : null;
  });
  useEffect(() => {
    if (!from) return;
    let alive = true;
    api.getGame(from).then(
      (state) => {
        primeGame(state);
        if (alive) setResult(sourceOf(state));
      },
      (err: unknown) => {
        if (!alive) return;
        const error = err instanceof ApiError && err.status === 404 ? "That board isn't here any more." : errorMessage(err);
        // Offline with the board in hand: carry on with it (the server checks again at Create).
        setResult((cur) => (cur?.seed && !(err instanceof ApiError && err.status === 404) ? cur : { seed: null, error }));
      },
    );
    return () => {
      alive = false;
    };
  }, [from]);
  return result;
}

/** While the board loads (or when it can't take another board): the flow's frame with a spinner or the reason. */
function SiblingPending({ error }: { error: string | null }) {
  useHideTabBar();
  const navigate = useNavigate();
  const location = useLocation();
  const close = () => (location.key !== "default" ? navigate(-1) : navigate("/", { replace: true }));
  return (
    <>
      <TopBar title="Another board" large={false} leading={<IconButton label="Close" icon={<XIcon size={22} />} onClick={close} />} />
      {error ? (
        <EmptyState
          illustration={<Jax pose="peek" size={140} />}
          title="Can't add a board here"
          description={error}
          action={
            <Button size="lg" block onClick={close}>
              Back
            </Button>
          }
        />
      ) : (
        <div data-testid="sibling-loading" className="grid place-items-center py-24 text-ink-muted" aria-busy="true" aria-label="Loading the board">
          <Spinner size={28} />
        </div>
      )}
    </>
  );
}

function CreateFlow({ sibling }: { sibling: SiblingSeed | null }) {
  useHideTabBar();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const profile = useProfile();
  // Another board for a game: three steps, and the board it comes from rides along in the URL.
  const steps = sibling ? SIBLING_STEPS : STEPS;
  const from = sibling?.fromId ?? null;

  // ---- the draft (restored after a reload; only by the same kind of flow) ----
  const [restored] = useState(() => {
    const draft = loadDraft();
    return draft && (draft.from ?? null) === from ? draft : null;
  });
  /** Football or basketball: the game step's first choice (its leagues, or custom teams scored by hand). */
  const [sport, setSport] = useState<BoardSport>(restored?.sport ?? "football");
  const sportTouched = useRef(restored?.sportTouched ?? false);
  const [tab, setTab] = useState<PickerTab>(restored?.tab ?? "nfl");
  const tabTouched = useRef(restored?.tabTouched ?? false);
  // Football's games load right away; basketball's once it's picked, or when football has nothing to link.
  const [wantBasketball, setWantBasketball] = useState(sport === "basketball");
  const schedule = useSchedule(wantBasketball ? BOTH_SPORTS : FOOTBALL_ONLY);
  const now = useNow(30_000);
  const colors = useMemo(
    () => (sport === "basketball" ? teamColorsFrom(schedule.nba.events, "nba") : teamColorsFrom(schedule.nfl.events)),
    [sport, schedule.nba.events, schedule.nfl.events],
  );
  /** Explicit picks per league (any week); without one, the soonest game is picked. */
  const [picked, setPicked] = useState<Partial<Record<ScheduleLeague, ScheduleEvent>>>(restored?.picked ?? {});
  const [custom, setCustom] = useState(restored?.custom ?? { x: "", y: "" });
  const [kickoff, setKickoff] = useState<number | null>(() => (restored ? restored.kickoff : defaultKickoff(Date.now())));
  // Always with rules (notes and amounts live in them); the prize choice stays unset until the host picks one.
  // Another board for a game starts from that board's rules and amounts.
  const [format, setFormat] = useState<GameFormat>(() => restored?.format ?? sibling?.format ?? withRules(defaultFormat()));
  const [prizeChoice, setPrizeChoice] = useState<PrizeChoice>(restored ? restored.prizeChoice : (sibling?.prizeChoice ?? null));
  // The amounts follow the suggestion until the host types one (see autoFill).
  const [prizesAuto, setPrizesAuto] = useState(restored?.prizesAuto ?? true);
  const [name, setName] = useState(restored?.name ?? "");
  const [nameTouched, setNameTouched] = useState(restored?.nameTouched ?? false);
  const [maxPerPlayer, setMaxPerPlayer] = useState(restored ? restored.maxPerPlayer : (sibling?.maxPerPlayer ?? 0));
  // Ask for the host's name only when this device has never set one.
  const [needsName] = useState(() => !profile.name.trim());
  const [hostName, setHostName] = useState(restored?.hostName || profile.name);
  // A venue's board: the venue's name is the host's name on this board only (this device's profile keeps its own).
  const [venueName, setVenueName] = useState(() => restored?.venueName ?? rememberedVenueName());
  const [shake, setShake] = useState(0);

  // ---- a season board (one game's board by default; never for another board for a game) ----
  const [boardScope, setBoardScope] = useState<BoardScope>(sibling ? "game" : (restored?.boardScope ?? "game"));
  const [seasonScope, setSeasonScope] = useState<SeasonScope>(restored?.seasonScope ?? "team");
  const [seasonNumbers, setSeasonNumbers] = useState<SeasonNumbers>(restored?.seasonNumbers ?? "same");
  /** The team picked per league, and the games picked per league. */
  const [seasonTeams, setSeasonTeams] = useState<Partial<Record<ScheduleLeague, SeasonTeam>>>(restored?.seasonTeams ?? {});
  const [seasonPicks, setSeasonPicks] = useState<Partial<Record<ScheduleLeague, ScheduleEvent[]>>>(restored?.seasonPicks ?? {});
  const [teamsAttempt, setTeamsAttempt] = useState(0);
  const [seasonAttempt, setSeasonAttempt] = useState(0);
  const seasonMode = !sibling && boardScope === "season";
  const seasonLeague: ScheduleLeague | null = seasonMode && tab !== "custom" ? tab : null;
  const teamScope = seasonLeague && seasonScope === "team" ? seasonLeague : null;
  const seasonTeam = seasonLeague ? (seasonTeams[seasonLeague] ?? null) : null;
  const leagueTeams = useSeasonTeams(teamScope, teamsAttempt);
  const teamSeason = useTeamSeason(teamScope, seasonTeam?.id ?? null, seasonAttempt);

  // ---- create ----
  // The host fee, for Review's line (due at the draw of a board of 6 or more, not now; a season's once for the season).
  const { price } = useHostFee(true, seasonMode ? "season" : "board");
  const [phase, setPhase] = useState<Phase>("idle");
  // Hosts sign in to make a board, at Create (so they've seen what they're making first). Players never do.
  const account = useAccount();
  const authSetup = useAuthSetup();
  const mustSignIn = !account && authSetup.providers.length > 0;
  const signInNames = authSetup.providers.map((p) => PROVIDER_LABEL[p]).join(" or ");
  const [signingIn, setSigningIn] = useState(false);
  const liveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** False once the host has left the page: a create still in flight then doesn't pull them back. */
  const mounted = useRef(true);
  /** The board to open once the flow's steps are rewound (see openBoard). */
  const leavingTo = useRef<string | null>(null);
  const [frozen, setFrozen] = useState<WizardStep | null>(null);

  useEffect(() => {
    mounted.current = true;
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

  // Land on the first league that has games: football's first, then (when
  // football has nothing to link, say in March) basketball's; lead with custom
  // teams when none do. Once the host picks a sport, only that sport's leagues.
  useEffect(() => {
    if (tabTouched.current) return;
    const landing = (s: BoardSport): PickerTab | "loading" | null => {
      const leagues = SPORT_LEAGUES[s];
      for (const league of leagues) {
        if (schedule[league].loading) return "loading";
        if (schedule[league].events.length) return league;
      }
      return null;
    };
    const here = landing(sport);
    if (here === "loading") return;
    if (here) return setTab(here);
    if (sport === "football" && !sportTouched.current) {
      // Nothing to link in football: look at basketball before typing teams.
      if (!wantBasketball) return setWantBasketball(true);
      const hoops = landing("basketball");
      if (hoops === "loading") return;
      if (hoops) {
        setSport("basketball");
        return setTab(hoops);
      }
    }
    setTab("custom");
  }, [schedule, sport, wantBasketball]);

  /** One game or a whole season: a season needs a league with live scores (custom teams have no season). */
  const pickBoardScope = (next: BoardScope) => {
    if (next === boardScope) return;
    setBoardScope(next);
    if (next === "season" && tab === "custom") {
      tabTouched.current = true;
      setTab(SPORT_LEAGUES[sport].find((l) => !schedule[l].loading && schedule[l].events.length) ?? SPORT_LEAGUES[sport][0]);
    }
  };

  /** Adds a game to the season's picks, or drops it (kept by kickoff). */
  const toggleSeasonGame = (e: ScheduleEvent) =>
    setSeasonPicks((p) => {
      const list = p[e.league] ?? [];
      const next = list.some((x) => x.eventId === e.eventId)
        ? list.filter((x) => x.eventId !== e.eventId)
        : [...list, e].sort((a, b) => a.startsAt - b.startsAt).slice(0, MAX_SEASON_GAMES);
      return { ...p, [e.league]: next };
    });

  /** The host picks a sport: its leagues show (custom stays custom, now scored as that sport). */
  const pickSport = (next: BoardSport) => {
    if (next === sport) return;
    sportTouched.current = true;
    setSport(next);
    if (next === "basketball") setWantBasketball(true);
    if (tab === "custom") return;
    tabTouched.current = false;
    const first = SPORT_LEAGUES[next].find((l) => !schedule[l].loading && schedule[l].events.length) ?? SPORT_LEAGUES[next][0];
    setTab(first);
  };

  // The game in the open league: the one tapped there, else the soonest.
  const leagueEvents = tab === "custom" ? [] : schedule[tab].events;
  const explicit = tab === "custom" ? undefined : picked[tab];
  const event: ScheduleEvent | null = explicit ?? leagueEvents[0] ?? null;
  // A season board: its team's schedule (once loaded) or the games picked in this league.
  const teamReady = teamSeason.status === "ready" ? teamSeason.value : null;
  const seasonMatchup: SeasonMatchup | null = seasonLeague
    ? {
        kind: "season",
        league: seasonLeague,
        scope: seasonScope,
        numbers: seasonNumbers,
        team: seasonScope === "team" ? seasonTeam : null,
        year: seasonScope === "team" ? (teamReady?.year ?? null) : null,
        events: seasonScope === "team" ? (teamReady?.events ?? []) : (seasonPicks[seasonLeague] ?? []),
        ...(seasonScope === "team" && seasonTeam && !teamReady ? { pending: teamSeason.status === "error" ? ("error" as const) : ("loading" as const) } : {}),
      }
    : null;
  const scheduleLoading =
    !sibling &&
    tab !== "custom" &&
    (seasonMatchup
      ? seasonMatchup.pending === "loading" || (seasonScope === "games" && schedule[tab].loading)
      : schedule[tab].loading && !explicit);

  const matchup: Matchup | null = sibling
    ? sibling.matchup
    : seasonMatchup
      ? seasonMatchup
      : tab === "custom"
        ? { kind: "custom", x: custom.x, y: custom.y, sport }
        : event
          ? { kind: "linked", event }
          : null;
  // What the board is played as: its moments, preset cards and words follow it.
  const kind = sibling ? matchupKind(sibling.matchup) : tab === "custom" ? { sport, league: "custom" as const } : { sport, league: tab };
  const teams = matchupTeams(matchup, colors);
  const shortNames = matchupShortNames(matchup);
  // Another board for a game is "Office Squares · Board 2", never named for its price; a season "Jaguars Season Squares".
  // A venue's board (picked on the first step): its steps speak to a venue, and it's "The Rusty Anchor · Chiefs vs Bills".
  const venueFlow = !sibling && format.venue === true;
  const matchupAutoName = sibling
    ? sibling.name
    : seasonMatchup
      ? seasonBoardName(seasonMatchup)
      : shortNames
        ? boardNameFor(shortNames[0], shortNames[1])
        : "";
  const autoName =
    venueFlow && venueName.trim()
      ? venueBoardName(venueName, seasonMatchup ? seasonBoardName(seasonMatchup) : shortNames ? `${shortNames[0]} vs ${shortNames[1]}` : "")
      : matchupAutoName;
  const shownName = nameTouched ? name : autoName;
  const customKickoff = sibling ? (sibling.matchup.from.linkedEvent ? null : sibling.matchup.from.startsAt) : tab === "custom" ? kickoff : null;
  const check: WizardCheck = {
    matchup,
    kickoff: customKickoff,
    hostName: needsName && !venueFlow ? hostName : null,
    venueName: venueFlow ? venueName : null,
    format,
    name: nameTouched ? name : "",
    now,
  };
  /** The host's name on this board: the venue's on a venue's board. */
  const boardHostName = venueFlow ? venueName.trim() : hostName;

  // ---- steps (the URL says which; history state says how we got here) ----
  const nav = readNav(location.state);
  const requested = parseStep(location.search, steps);
  // A step can't be reached past an incomplete one (wait for the games before judging the first).
  const reachable = scheduleLoading ? requested : reachableStep(requested, check, steps);
  const step: WizardStep = frozen ?? reachable;
  /** An in-app page sits under the flow (closing it goes back there). */
  const appBack = nav.wizardDepth > 0 ? !!nav.appBack : location.key !== "default";

  useEffect(() => {
    if (frozen || leavingTo.current || reachable === requested) return;
    navigate({ search: stepSearch(reachable, from) }, { replace: true, state: location.state });
  }, [frozen, reachable, requested, navigate, location.state, from]);

  // Steps slide forward and back (the global reduced-motion rule turns this into a plain swap).
  const motion = useRef<{ step: WizardStep; dir: "none" | "forward" | "back" }>({ step, dir: "none" });
  if (motion.current.step !== step) {
    motion.current = { step, dir: steps.indexOf(step) > steps.indexOf(motion.current.step) ? "forward" : "back" };
  }

  // The draft survives a reload until the board is made.
  useEffect(() => {
    if (leavingTo.current || frozen) return;
    saveDraft({
      sport,
      sportTouched: sportTouched.current,
      tab,
      tabTouched: tabTouched.current,
      picked,
      custom,
      kickoff,
      format,
      prizeChoice,
      prizesAuto,
      name,
      nameTouched,
      maxPerPlayer,
      hostName,
      venueName,
      ...(from ? { from } : { boardScope, seasonScope, seasonNumbers, seasonTeams, seasonPicks }),
    });
  }, [
    sport,
    tab,
    picked,
    custom,
    kickoff,
    format,
    prizeChoice,
    prizesAuto,
    name,
    nameTouched,
    maxPerPlayer,
    hostName,
    venueName,
    frozen,
    from,
    boardScope,
    seasonScope,
    seasonNumbers,
    seasonTeams,
    seasonPicks,
  ]);

  // Opening the board: rewind the flow's steps first (Back from the board then
  // goes where the host started), then replace the first one with the board.
  useEffect(() => {
    if (!leavingTo.current || nav.wizardDepth !== 0) return;
    const target = leavingTo.current;
    leavingTo.current = null;
    navigate(target, { replace: true });
  }, [location.key, nav.wizardDepth, navigate]);

  const blocker = stepBlocker(step, check);
  const stepIndex = steps.indexOf(step);

  const go = (to: WizardStep, extra: Partial<WizardNav> = {}) =>
    navigate({ search: stepSearch(to, from) }, { state: { wizardDepth: nav.wizardDepth + 1, appBack, ...extra } satisfies WizardNav });

  /** Next (or Done, from Review): the step's blocker if any, else on to the next step. */
  const goNext = () => {
    if (blocker) {
      setShake((n) => n + 1);
      void haptic("error");
      return showBlocker(blocker);
    }
    // The soonest game was showing as picked: make it the pick, so a reload keeps it.
    if (step === "game" && !seasonMode && tab !== "custom" && event && picked[tab]?.eventId !== event.eventId) setPicked((p) => ({ ...p, [tab]: event }));
    if (nav.fromReview) {
      if (nav.wizardDepth > 0) return navigate(-1);
      return navigate({ search: stepSearch("review", from) }, { replace: true, state: { wizardDepth: 0, appBack } satisfies WizardNav });
    }
    const next = nextStep(step, steps);
    if (next) go(next);
  };
  const goNextRef = useRef(goNext);
  goNextRef.current = goNext;

  const goBack = () => {
    if (nav.wizardDepth > 0) return navigate(-1);
    const prev = steps[stepIndex - 1];
    if (prev) navigate({ search: stepSearch(prev, from) }, { replace: true, state: { wizardDepth: 0, appBack } satisfies WizardNav });
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

  /** The payoff: the button says you're live, confetti in the team colors, then the board + invite sheet. */
  const goLive = (game: Game) => {
    if (!mounted.current) return;
    setPhase("live");
    void haptic("success");
    const burst = [readableTeamColor(game.teamX.color, CUSTOM_X_COLOR), readableTeamColor(game.teamY.color, CUSTOM_Y_COLOR), ...CELEBRATION_COLORS.slice(0, 2)];
    void celebrate("pop", { colors: burst, origin: { x: 0.5, y: 0.9 } });
    liveTimer.current = setTimeout(() => openBoard(game.id), LIVE_BEAT_MS);
  };

  /** `signedIn`: straight after the sign-in sheet (this render's `mustSignIn` predates it). */
  const submit = async (signedIn = false) => {
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
      // Another board for a game is named for it, a venue's board for the venue; otherwise the matchup's (buildCreateInput).
      name: nameTouched ? name : sibling || venueFlow ? autoName : "",
      maxPerPlayer,
      host: { name: boardHostName, color: profile.color, emoji: profile.emoji },
      now: Date.now(),
    });
    if (!input) return;
    // A venue's name is only this board's: the device's own name stays as it is.
    if (venueFlow) rememberVenueName(venueName);
    else if (hostName.trim() !== profile.name) setProfile({ name: hostName.trim() });
    if (mustSignIn && !signedIn) {
      void haptic("light");
      setSigningIn(true);
      return;
    }

    setPhase("working");
    void haptic("medium");
    try {
      // Free to create: the board opens right away (the host fee is due when they draw the numbers).
      const res = await api.createGame(input);
      goLive(res.game);
    } catch (err) {
      setPhase("idle");
      createFailed(err);
    }
  };

  const createFailed = (err: unknown) => {
    // Sign-in was needed after all (the app hadn't read the sign-in setup yet, or this device was signed out meanwhile).
    if (err instanceof ApiError && (err.body as { code?: unknown } | undefined)?.code === ACCOUNT_REQUIRED_CODE) {
      setSigningIn(true);
      return;
    }
    void haptic("error");
    const message = err instanceof Error ? err.message : "Something went wrong. Try again.";
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

  const rules = rulesOf(format);
  // What players will see about prizes, as the host has it now.
  const shownFormat = createFormat(format, prizeChoice);
  const rulesDraft: RulesDraft = {
    rules,
    choice: prizeChoice,
    squarePrice: format.squarePrice ?? null,
    freshNumbers: format.freshNumbers,
    houseRules: shownHouseRules(format),
    claimCodes: format.claimCodes === true,
    claimMinutes: format.claimMinutes ?? null,
    venue: format.venue === true,
  };
  /** Every change to how squares win or to the prizes: the suggested amounts follow it while the host hasn't typed one. */
  const updatePrizes = (next: GameFormat, choice: PrizeChoice = prizeChoice) => {
    const filled = autoFill({ format, choice: prizeChoice }, { format: next, choice }, prizesAuto);
    setFormat(filled.format);
    setPrizeChoice(choice);
    setPrizesAuto(filled.auto);
  };
  const editRules = (d: RulesDraft) => {
    // Venue mode starts at one square each (VENUE_DEFAULTS), and turning it off lifts that cap again.
    if (d.venue && !format.venue) setMaxPerPlayer(VENUE_DEFAULTS.maxPerPlayer);
    else if (!d.venue && format.venue && maxPerPlayer === VENUE_DEFAULTS.maxPerPlayer) setMaxPerPlayer(0);
    updatePrizes(
      withRules({
        ...format,
        rules: d.rules,
        squarePrice: d.squarePrice,
        freshNumbers: d.freshNumbers,
        houseRules: d.houseRules,
        claimCodes: d.claimCodes,
        claimMinutes: d.claimMinutes ?? undefined,
        venue: d.venue,
      }),
      d.choice,
    );
  };
  // A game that can't take the rules picked so far (every score on basketball,
  // the quarters in men's college basketball's two halves): fit them to it.
  useEffect(() => {
    const fitted = fitRules(rules, kind);
    if (fitted !== rules) updatePrizes(withRules({ ...format, rules: fitted }));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the game's sport or league changes
  }, [kind.sport, kind.league]);
  const linkedMatchup = matchup?.kind === "linked" || (matchup?.kind === "board" && !!matchup.from.linkedEvent);
  const matchupLabel = seasonMatchup
    ? seasonMatchupLabel(seasonMatchup, now)
    : shortNames
      ? linkedMatchup
        ? `${shortNames[0]} @ ${shortNames[1]}`
        : `${shortNames[0]} vs ${shortNames[1]}`
      : "";
  // Another board for a game: the price step says what's carried over and asks for this board's price.
  // A season: its game step picks the season, and every game has the same rules and prizes.
  const info =
    sibling && step === "prizes"
      ? { ...STEP_INFO.prizes, title: "This board's square price", subtitle: "Pick what a square costs on this board. The suggested prizes follow it." }
      : seasonMode && step === "game"
        ? { ...STEP_INFO.game, title: "Pick the season", subtitle: "A team's season or the games you pick, scored live." }
        : seasonMode && step === "format"
          ? { ...STEP_INFO.format, subtitle: "The same rules for every game of the season. Prizes come next." }
          : seasonMode && step === "prizes"
            ? { ...STEP_INFO.prizes, subtitle: "One square price, and the same prizes every game. Or keep it just for fun." }
            : venueFlow && step === "prizes"
              ? { ...STEP_INFO.prizes, title: "What do winners get?", subtitle: "Prizes from your venue, like free food or team gear. Guests see them on the board and the TV." }
              : venueFlow && step === "details"
                ? { ...STEP_INFO.details, subtitle: "Your venue's name, the board's name and squares per person." }
                : STEP_INFO[step];
  const seasonAhead = seasonMatchup ? seasonGamesAhead(seasonMatchup, now) : [];

  let body: ReactNode;
  switch (step) {
    case "game":
      body = (
        <section id={GAME_SECTION_ID} aria-label="The game" className="flex scroll-mt-24 flex-col gap-5">
          {!sibling && <AudiencePicker value={venueFlow ? "venue" : "friends"} onChange={(a) => editRules(setVenue(rulesDraft, a === "venue"))} />}
          <GamePicker
            schedule={schedule}
            sport={sport}
            onSport={pickSport}
            tab={tab}
            onTab={pickTab}
            selected={event}
            onPickEvent={pickEvent}
            custom={custom}
            onCustomChange={(side, value) => setCustom((c) => ({ ...c, [side]: value }))}
            showErrors={shake > 0 && !teams}
            colors={colors}
            customFooter={<KickoffPicker value={kickoff} onChange={setKickoff} now={now} error={kickoffError(kickoff, now, sport)} sport={sport} />}
            boardScope={boardScope}
            onBoardScope={sibling ? undefined : pickBoardScope}
            seasonPanel={
              seasonLeague &&
              seasonMatchup && (
                <SeasonPicker
                  league={seasonLeague}
                  matchup={seasonMatchup}
                  onScope={setSeasonScope}
                  onNumbers={setSeasonNumbers}
                  teams={leagueTeams}
                  onTeam={(t) => setSeasonTeams((cur) => ({ ...cur, [seasonLeague]: t ?? undefined }))}
                  onRetryTeams={() => setTeamsAttempt((n) => n + 1)}
                  season={teamSeason}
                  onRetrySeason={() => setSeasonAttempt((n) => n + 1)}
                  schedule={schedule[seasonLeague]}
                  onToggleGame={toggleSeasonGame}
                  showErrors={shake > 0 && blocker?.field === "game"}
                  now={now}
                />
              )
            }
          />
        </section>
      );
      break;
    case "format":
      body = (
        <FormatPicker
          format={format}
          onChange={(f, choice) => updatePrizes(f, choice)}
          prizeChoice={prizeChoice}
          teamX={teams?.teamX}
          teamY={teams?.teamY}
          kind={kind}
        />
      );
      break;
    case "prizes":
      body = (
        <>
          {sibling && teams && <SiblingIntro seed={sibling} teamX={teams.teamX} teamY={teams.teamY} matchup={matchupLabel} />}
          {/* Venue mode is the first step's "Who's playing?"; another board for a game keeps the switch here. */}
          <RulesEditor draft={rulesDraft} onChange={editRules} boardSize={format.boardSize} kind={kind} venueSwitch={!!sibling} />
        </>
      );
      break;
    case "details":
      body = (
        <div className="flex flex-col gap-5">
          {venueFlow ? (
            <TextField
              id={HOST_INPUT_ID}
              data-testid="venue-name"
              label="Venue name"
              value={venueName}
              maxLength={NAME_MAX_LENGTH}
              placeholder="The Rusty Anchor"
              autoComplete="organization"
              autoCapitalize="words"
              enterKeyHint="done"
              onChange={(e) => setVenueName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
              leading={<Avatar name={venueName || "Venue"} color={profile.color} emoji={profile.emoji} size="sm" decorative />}
              hint="Guests see it as the board's host. Only on this board: your name everywhere else stays yours."
              error={shake > 0 && !venueName.trim() ? "Add your venue's name so guests know whose board it is." : undefined}
              inputClassName="font-semibold"
            />
          ) : needsName && (
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
            venue={venueFlow}
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
          host={{ name: boardHostName, color: profile.color, emoji: profile.emoji }}
          venue={venueFlow ? venueSummary(format, maxPerPlayer) : null}
          now={now}
          onEdit={(s) => go(s, { fromReview: true })}
          sibling={sibling ? { sourceName: sibling.source.name } : null}
          kind={kind}
          steps={steps}
          season={
            seasonMatchup
              ? {
                  line: seasonReviewLine(seasonMatchup, seasonAhead.length),
                  team: seasonMatchup.team,
                  next: seasonAhead[0] ?? null,
                  numbers: seasonMatchup.numbers,
                }
              : null
          }
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
  } else createLabel = seasonMode ? "Create season board" : "Create board";
  const nextLabel = nav.fromReview ? "Done" : step === "prizes" && prizeChoice === null ? "Skip for now" : "Next";

  return (
    <>
      <TopBar
        title={sibling ? "Another board" : "New board"}
        large={false}
        leading={<IconButton label="Close" icon={<XIcon size={22} />} onClick={close} />}
        accessory={<WizardProgress step={step} steps={steps} venue={venueFlow} />}
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
        {step === "review" && mustSignIn && (
          <p data-testid="create-signin-note" className="mt-2 text-center text-caption font-semibold text-ink-muted">
            You'll sign in with {signInNames} to create it. Players never need an account.
          </p>
        )}
        {step === "review" && (
          <p data-testid="create-fee" className={cx("text-center text-caption text-ink-subtle", mustSignIn ? "mt-0.5" : "mt-2")}>
            {createFeeLine(price, seasonMode)}
          </p>
        )}
      </ActionBar>
      {signingIn && (
        <Suspense fallback={null}>
          <SignInSheet
            open
            onClose={() => setSigningIn(false)}
            title={seasonMode ? "Sign in to create your season board" : "Sign in to create your board"}
            description="Hosts sign in so the board, its host controls and any Host Pass stay with you on every device. Players never need an account."
            onSignedIn={() => void submit(true)}
          />
        </Suspense>
      )}
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
