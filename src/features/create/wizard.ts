// The guided create flow as data: its five steps and their order, which step
// a URL asks for (`/new?step=game|format|prizes|details|review`), what keeps a
// step from moving on, the history state each step carries, and the draft
// that survives a reload (sessionStorage, cleared once the board is made).
// Pure apart from the storage passed in: no React.

import { sanitizeFormat, withRules } from "../../../shared/formats";
import type { GameFormat, ScheduleEvent } from "../../../shared/types";
import type { PrizeChoice } from "../rules/rulesModel";
import { blockersOf, type CreateBlocker, type Matchup } from "./model";

export const STEPS = ["game", "format", "prizes", "details", "review"] as const;
export type WizardStep = (typeof STEPS)[number];
/** A flow's steps, in order: STEPS, or SIBLING_STEPS for another board for a game. */
export type Steps = readonly WizardStep[];

/**
 * "Add another board for this game" (/new?from=<board id>): the game and the
 * rules come from that board, so the flow goes straight to the square price,
 * then the name, then Review.
 */
export const SIBLING_STEPS: Steps = ["prizes", "details", "review"];

export const STEP_INFO: Record<WizardStep, { label: string; title: string; subtitle: string }> = {
  game: { label: "The game", title: "Pick the game", subtitle: "Real games score themselves, or type your own." },
  format: { label: "How squares win", title: "How do squares win?", subtitle: "Pick when a square wins. Prizes come next." },
  prizes: {
    label: "Square price & prizes",
    title: "Square price & prizes",
    subtitle: "Show friends what a square costs and what wins, or keep it just for fun.",
  },
  details: { label: "Final touches", title: "Final touches", subtitle: "Name your board and set a max per player." },
  review: { label: "Review", title: "Ready to go?", subtitle: "Tap anything to change it." },
};

const isStep = (v: unknown): v is WizardStep => typeof v === "string" && (STEPS as readonly string[]).includes(v);

/** The step a URL's search asks for; the flow's first step when it names none (or one the flow doesn't have). */
export function parseStep(search: string, steps: Steps = STEPS): WizardStep {
  const step = new URLSearchParams(search).get("step");
  return isStep(step) && steps.includes(step) ? step : steps[0];
}

/** The board another one is being made from ("/new?from=k7m2px"), or null: only a board code counts. */
export function parseFrom(search: string): string | null {
  const from = new URLSearchParams(search).get("from")?.trim().toLowerCase() ?? "";
  return /^[a-z0-9]{4,16}$/.test(from) ? from : null;
}

/** The search string for a step: "?step=format", or "?from=k7m2px&step=details" for another board for a game. */
export function stepSearch(step: WizardStep, from: string | null = null): string {
  return from ? `?from=${encodeURIComponent(from)}&step=${step}` : `?step=${step}`;
}

/** 1-based position: "2 of 5". */
export function stepNumber(step: WizardStep, steps: Steps = STEPS): number {
  return steps.indexOf(step) + 1;
}

export function nextStep(step: WizardStep, steps: Steps = STEPS): WizardStep | null {
  return steps[steps.indexOf(step) + 1] ?? null;
}

export function prevStep(step: WizardStep, steps: Steps = STEPS): WizardStep | null {
  const i = steps.indexOf(step);
  return i > 0 ? steps[i - 1] : null;
}

// ---- What holds a step back ----

/** The step whose field a blocker points at. */
export function blockerStep(b: CreateBlocker): WizardStep {
  switch (b.field) {
    case "game":
    case "team-x":
    case "team-y":
    case "kickoff":
      return "game";
    case "prize":
      return "prizes";
    case "host":
    case "name":
      return "details";
  }
}

export interface WizardCheck {
  matchup: Matchup | null;
  /** Custom boards only (null = no set time). */
  kickoff: number | null;
  /** Null when this device already has a name (the field isn't shown). */
  hostName: string | null;
  format: GameFormat;
  /** The board name as typed ("" = the matchup's). */
  name: string;
  now: number;
}

/** What keeps this step from moving on (Next stays disabled with this reason), or null. */
export function stepBlocker(step: WizardStep, check: WizardCheck): CreateBlocker | null {
  const all = blockersOf(check);
  if (step === "review") return all[0] ?? null;
  return all.find((b) => blockerStep(b) === step) ?? null;
}

/**
 * The step to show for a requested one: itself, unless a step before it is
 * still incomplete (a reload or a typed URL can't skip past a missing team).
 */
export function reachableStep(requested: WizardStep, check: WizardCheck, steps: Steps = STEPS): WizardStep {
  const first = blockersOf(check)[0];
  if (!first) return requested;
  const blocked = blockerStep(first);
  if (!steps.includes(blocked)) return requested;
  return steps.indexOf(blocked) < steps.indexOf(requested) ? blocked : requested;
}

// ---- History ----

/**
 * The history state each step entry carries: how many wizard steps were
 * pushed on top of the first one (so leaving can rewind them all), whether
 * this step was opened from Review (its Next goes back there), and whether
 * an in-app page sits under the flow (closing it goes back there, not out).
 */
export interface WizardNav {
  wizardDepth: number;
  fromReview?: boolean;
  appBack?: boolean;
}

export function readNav(state: unknown): WizardNav {
  const s = (state && typeof state === "object" ? state : {}) as Record<string, unknown>;
  const depth = typeof s.wizardDepth === "number" && Number.isInteger(s.wizardDepth) && s.wizardDepth > 0 ? s.wizardDepth : 0;
  return { wizardDepth: depth, fromReview: s.fromReview === true, appBack: s.appBack === true };
}

// ---- The draft that survives a reload ----

export type PickerTab = "nfl" | "ncaaf" | "custom";

/** Everything the host has chosen so far. */
export interface WizardDraft {
  tab: PickerTab;
  /** The host chose the tab (the flow stops leading with whichever league has games). */
  tabTouched: boolean;
  /** Games picked per league (any week); a league without one shows its soonest game. */
  picked: Partial<Record<"nfl" | "ncaaf", ScheduleEvent>>;
  custom: { x: string; y: string };
  /** Custom boards: epoch ms, or null for no set time. */
  kickoff: number | null;
  format: GameFormat;
  prizeChoice: PrizeChoice;
  /**
   * The amounts still follow the suggestion (the host hasn't typed one): a
   * new square price, game type, reverse or every-score option fills them in
   * again. Absent in older drafts = true.
   */
  prizesAuto: boolean;
  name: string;
  nameTouched: boolean;
  maxPerPlayer: number;
  hostName: string;
  /**
   * The board this draft adds another board to (/new?from=), or absent for a
   * board of its own: a draft is only picked up again by the same kind of flow.
   */
  from?: string | null;
}

export const DRAFT_KEY = "jaxsquares.createDraft";
/** A draft older than this starts over (a new session, a new board). */
export const DRAFT_TTL_MS = 12 * 60 * 60_000;
const DRAFT_VERSION = 1;

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function session(): Store | null {
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage;
  } catch {
    return null;
  }
}

export function saveDraft(draft: WizardDraft, now = Date.now(), store: Store | null = session()): void {
  try {
    store?.setItem(DRAFT_KEY, JSON.stringify({ v: DRAFT_VERSION, savedAt: now, draft }));
  } catch {
    // Full or blocked storage: the flow still works, it just won't survive a reload.
  }
}

export function clearDraft(store: Store | null = session()): void {
  try {
    store?.removeItem(DRAFT_KEY);
  } catch {
    // nothing to clear
  }
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown, max = 200) => (typeof v === "string" ? v.slice(0, max) : "");

/** A saved game that can still be linked (not started, well formed). */
function liveEvent(v: unknown, now: number): ScheduleEvent | null {
  if (!isObj(v)) return null;
  const e = v as unknown as ScheduleEvent;
  const ok =
    typeof e.eventId === "string" &&
    (e.league === "nfl" || e.league === "ncaaf") &&
    typeof e.startsAt === "number" &&
    e.startsAt > now - 5 * 60_000 &&
    isObj(e.home) &&
    isObj(e.away) &&
    typeof e.home.name === "string" &&
    typeof e.away.name === "string";
  return ok ? e : null;
}

/**
 * The saved draft, or null when there's none, it's stale or unreadable. A
 * game that has started since is dropped (the league shows its soonest again),
 * and a custom kickoff more than a day gone falls back to no set time.
 */
export function loadDraft(now = Date.now(), store: Store | null = session()): WizardDraft | null {
  let raw: string | null = null;
  try {
    raw = store?.getItem(DRAFT_KEY) ?? null;
  } catch {
    return null;
  }
  if (!raw) return null;
  let saved: unknown;
  try {
    saved = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isObj(saved) || saved.v !== DRAFT_VERSION || typeof saved.savedAt !== "number" || now - saved.savedAt > DRAFT_TTL_MS) return null;
  const d = saved.draft;
  if (!isObj(d) || !isObj(d.format) || !isObj(d.custom)) return null;
  const tab: PickerTab = d.tab === "ncaaf" || d.tab === "custom" ? d.tab : "nfl";
  const picked: WizardDraft["picked"] = {};
  if (isObj(d.picked)) {
    for (const league of ["nfl", "ncaaf"] as const) {
      const e = liveEvent(d.picked[league], now);
      if (e && e.league === league) picked[league] = e;
    }
  }
  const kickoff = typeof d.kickoff === "number" && Number.isFinite(d.kickoff) && d.kickoff > now - 24 * 60 * 60_000 ? d.kickoff : null;
  const choice = d.prizeChoice === "$" || d.prizeChoice === "pts" || d.prizeChoice === "fun" ? d.prizeChoice : null;
  const max = typeof d.maxPerPlayer === "number" && Number.isInteger(d.maxPerPlayer) && d.maxPerPlayer >= 0 ? d.maxPerPlayer : 0;
  let format: GameFormat;
  try {
    format = withRules(sanitizeFormat(d.format));
  } catch {
    return null;
  }
  return {
    tab,
    tabTouched: d.tabTouched === true,
    picked,
    custom: { x: str(d.custom.x, 40), y: str(d.custom.y, 40) },
    kickoff,
    format,
    prizeChoice: choice,
    prizesAuto: d.prizesAuto !== false,
    name: str(d.name, 60),
    nameTouched: d.nameTouched === true,
    maxPerPlayer: max,
    hostName: str(d.hostName, 24),
    ...(typeof d.from === "string" && parseFrom(`?from=${encodeURIComponent(d.from)}`) ? { from: d.from } : {}),
  };
}
