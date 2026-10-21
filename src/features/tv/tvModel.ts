// Pure view-model helpers for TV mode (/g/:id/tv): how big the board can be on
// this screen, what fits in a square from across the room, the winners-so-far
// strip and the winner celebration card. No React, no IO (tvModel.test.ts).
//
// Amounts show here (TV mode is an in-app view, like the board), read from the
// results (PeriodResult) only, never from the rules.

import { formatAmount, formatRange, periodPhrase, scorePlayLabel, unitOf } from "../../../shared/formats";
import { primaryAward, resolveResults, type PeriodResult } from "../../../shared/squares";
import type { Activity, AmountUnit, Game, GameState, Player, Team } from "../../../shared/types";
import { CLAIM_LINE, venueLines } from "../../../shared/venue";
import { initialsOf } from "../../lib/format";
import { textEm } from "../../lib/textWidth";
import type { PeriodCard } from "../board/boardModel";
import { momentPrizes, priceLine, type MomentPrize } from "../rules/rulesModel";

// ---- Layout ----

export interface TvLayout {
  orientation: "landscape" | "portrait";
  /** Outer padding, px. */
  pad: number;
  /** The board's side, px: team band + digit axis + every square and gap. */
  board: number;
  /** The team-name band along the top and the left, px. */
  band: number;
  /** The drawn digits' row and column, px. */
  axis: number;
  /** One square, px. */
  cell: number;
  /** Between squares, px. */
  gap: number;
  /** The info panel beside the board (landscape) or under it (portrait), px. */
  panel: { width: number; height: number };
  /** Type unit: 1% of the screen's short side, so text scales from 720p to 4K. */
  unit: number;
}

/** Wider than this reads as a TV / laptop (board left, panel right); anything narrower stacks. */
const LANDSCAPE_RATIO = 1.15;
/** The most of a landscape screen's width the board takes: the panel needs room for the QR code and the score. */
const BOARD_WIDTH_SHARE = 0.6;
/** The most of a portrait screen's height the board takes (a phone mirroring to a TV). */
const BOARD_HEIGHT_SHARE = 0.62;

/**
 * The board as large as the screen allows: the full height on a 16:9 screen
 * (less padding), capped so the panel keeps its share; whole pixels so the
 * squares stay crisp.
 */
export function tvLayout(width: number, height: number, n: number): TvLayout {
  const w = Math.max(320, Math.floor(width));
  const h = Math.max(320, Math.floor(height));
  const short = Math.min(w, h);
  const pad = Math.round(short * 0.03);
  const landscape = w / h >= LANDSCAPE_RATIO;
  const room = landscape ? Math.min(h - 2 * pad, (w - 3 * pad) * BOARD_WIDTH_SHARE) : Math.min(w - 2 * pad, (h - 3 * pad) * BOARD_HEIGHT_SHARE);
  const band = Math.round(room * 0.05);
  const axis = Math.round(room * (n > 5 ? 0.065 : 0.09));
  const gap = Math.max(2, Math.round(room * (n > 5 ? 0.004 : 0.008)));
  const cell = Math.max(8, Math.floor((room - band - axis - n * gap) / n));
  const board = band + axis + n * (cell + gap);
  const panel = landscape
    ? { width: Math.max(0, w - board - 3 * pad), height: h - 2 * pad }
    : { width: w - 2 * pad, height: Math.max(0, h - board - 3 * pad) };
  return { orientation: landscape ? "landscape" : "portrait", pad, board, band, axis, cell, gap, panel, unit: short / 100 };
}

// ---- What a square says ----

/** Share of a square's width the text may use. */
const TEXT_ROOM = 0.86;
/** The TV's names are extra bold: a touch wider than the measured bold advances. */
const HEAVY = 1.03;

/** The name as people say it across a room: the first word. */
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? "";
}

/**
 * A square's text on the TV: the first name as large as it fits (up to about
 * a quarter of the square), or the initials once a name would have to shrink
 * below what reads from across the room.
 */
export function tvCellName(name: string, cell: number): { text: string; size: number; initials: boolean } {
  const first = firstName(name);
  const max = cell * 0.24;
  const min = cell * 0.17;
  if (first) {
    const fit = Math.min(max, (cell * TEXT_ROOM) / (textEm(first) * HEAVY));
    if (fit >= min) return { text: first, size: Math.floor(fit * 10) / 10, initials: false };
  }
  return { text: initialsOf(name), size: round1(cell * 0.3), initials: true };
}

const round1 = (n: number) => Math.round(n * 10) / 10;

// ---- Winners so far ----

export type TvPlayer = Pick<Player, "id" | "name" | "color" | "emoji">;

export interface TvWinner {
  key: string;
  /** As the board's result cards say it: "Q1 · $200", "Score 3 · TD · $50", "Final · $640". */
  label: string;
  /** The headline winner (the reverse square's on a reverse-only moment), or null when nobody had the square. */
  player: TvPlayer | null;
  /** The headline square's prize note ("Free wings"), or null. */
  prize: string | null;
  /** The score that decided it, "7–3" (null for a host pick without a score). */
  score: string | null;
  /** Only the reverse square won this moment. */
  reverseOnly: boolean;
  /** The reverse square's winner beside the square's ("Reverse · $50"), when it's someone else. */
  reverse: { label: string; player: TvPlayer | null } | null;
  source: PeriodResult["source"];
}

function money(amount: number | null | undefined, unit: AmountUnit): string | null {
  return amount ? formatAmount(amount, unit) : null;
}

/** "Q1 · $200", "Score 3 · TD · $50": the result card's label for this result. */
export function resultLabel(r: PeriodResult, unit: AmountUnit): string {
  const main = primaryAward(r);
  const kind = r.scoreKind ? scorePlayLabel(r.scoreKind) : null;
  return [periodPhrase(r.periodKey, r.label).short, kind, money(main.amount, unit)].filter(Boolean).join(" · ");
}

/** Every decided moment with its winner, in game order (the strip shows the latest that fit). */
export function tvWinners(state: Pick<GameState, "game" | "players">, results: readonly PeriodResult[]): TvWinner[] {
  const unit = unitOf(state.game.format);
  const byId = new Map(state.players.map((p) => [p.id, p]));
  const who = (id: string | null): TvPlayer | null => {
    if (!id) return null;
    const p = byId.get(id);
    return p ? { id: p.id, name: p.name, color: p.color, emoji: p.emoji } : { id, name: "Someone", color: "#45594c", emoji: "" };
  };
  return results.map((r) => {
    const main = primaryAward(r);
    const showReverse = !main.reverse && r.awardsReverse && !!r.reverseCell && r.reverseWinnerPlayerId !== r.winnerPlayerId;
    return {
      key: r.periodKey,
      label: resultLabel(r, unit),
      player: who(main.playerId),
      prize: (main.reverse ? r.reversePrize : r.prize) || null,
      score: r.score ? (main.reverse ? `${r.score.scoreY}–${r.score.scoreX}` : `${r.score.scoreX}–${r.score.scoreY}`) : null,
      reverseOnly: main.reverse,
      reverse: showReverse ? { label: ["Reverse", money(r.reverseAmount, unit)].filter(Boolean).join(" · "), player: who(r.reverseWinnerPlayerId) } : null,
      source: r.source,
    };
  });
}

/** The latest `max` items (game order kept) and how many earlier ones didn't fit. */
export function latest<T>(items: readonly T[], max: number): { shown: T[]; earlier: number } {
  const keep = Math.max(0, Math.floor(max));
  const shown = keep === 0 ? [] : items.slice(-keep);
  return { shown, earlier: items.length - shown.length };
}

// ---- The celebration ----

export interface TvCelebration {
  /** Unique per winner moment (the activity id). */
  id: string;
  periodKey: string;
  /** "Q1 winner", "Halftime winner", "Final winner", "Score 3 winner". */
  title: string;
  /** "Touchdown" on an every-score entry with a kind; else null. */
  kind: string | null;
  player: TvPlayer | null;
  /** The headline square's amount ("$200"; the rest of the board total for a final that takes it). */
  amount: string | null;
  /** The headline square's prize note ("Free wings"). */
  prize: string | null;
  /** "KC 7 – 3 BUF". */
  score: string | null;
  /** The reverse square's winner, when it's someone else. */
  reverse: { player: TvPlayer | null; amount: string | null; prize: string | null } | null;
  /** The board uses claim codes: the winner shows staff the code on their phone (never on the TV). */
  claim: boolean;
}

const TITLES: Record<string, string> = { q1: "Q1 winner", q2: "Halftime winner", q3: "Q3 winner", final: "Final winner" };

const abbr = (t: Team) => t.abbr || t.name;

/**
 * The card a winner activity celebrates on the TV, from the board's results
 * (so the amount is the one the board shows). null for anything else, or a
 * moment the results don't have (the score was taken back meanwhile).
 */
export function celebrationFor(activity: Activity, state: GameState, results: readonly PeriodResult[] = resolveResults(state)): TvCelebration | null {
  if (activity.type !== "winner") return null;
  const periodKey = typeof activity.data?.periodKey === "string" ? activity.data.periodKey : null;
  const r = periodKey ? results.find((x) => x.periodKey === periodKey) : undefined;
  if (!r) return null;
  const [w] = tvWinners(state, [r]);
  const unit = unitOf(state.game.format);
  const main = primaryAward(r);
  if (!w.player && !w.reverse?.player) return null;
  const { game } = state;
  return {
    id: activity.id,
    periodKey: r.periodKey,
    title: TITLES[r.periodKey] ?? `${periodPhrase(r.periodKey, r.label).short} winner`,
    kind: r.scoreKind ? scorePlayLabel(r.scoreKind, true) : null,
    player: w.player,
    amount: money(main.amount, unit),
    prize: w.prize,
    score: r.score ? `${abbr(game.teamX)} ${r.score.scoreX} – ${r.score.scoreY} ${abbr(game.teamY)}` : null,
    reverse: w.reverse ? { player: w.reverse.player, amount: money(r.reverseAmount, unit), prize: r.reversePrize || null } : null,
    claim: game.format.claimCodes === true,
  };
}

// ---- Still to play ----

export interface TvUpcoming {
  key: string;
  /** "Half", "Q3", "Final", "Next score". */
  label: string;
  /** What it can show: "$200", "$5–$20" by score type, "the rest"; null without an amount. */
  amount: string | null;
  /** The prize note ("Free wings"): the square's, or the reverse square's on a reverse-only moment. */
  note: string | null;
  /** The moment in play right now. */
  live: boolean;
}

/** The moments still to come, from the board's period cards (the results strip's "still to come" cards). */
export function tvUpcoming(cards: readonly PeriodCard[], unit: AmountUnit): TvUpcoming[] {
  return cards
    .filter((c) => c.status !== "done")
    .map((c) => ({
      key: c.key,
      label: periodPhrase(c.key, c.label).short,
      amount:
        c.rest && c.awardsSquare
          ? "the rest"
          : c.range
            ? formatRange(c.range, unit)
            : c.reverseRange
              ? `${formatRange(c.reverseRange, unit)} reverse`
              : null,
      note: (c.awardsSquare ? c.prize : c.reversePrize) || null,
      live: c.status === "live",
    }));
}

// ---- Prizes and house rules (venue boards) ----

export interface TvDetails {
  /** "$10 a square", or null. */
  price: string | null;
  /** Each moment's prize with its note (rulesModel.momentPrizes). */
  prizes: MomentPrize[];
  /** The house rules, then how a winner collects when the board uses claim codes. */
  rules: string[];
  /** A club's free board: "Free to play · No purchase necessary", "Prizes from …". */
  venue: string[];
}

/**
 * What the TV spells out beyond the amounts: each prize with its note, the
 * house rules and the venue lines (shared/venue.ts). null when the board has
 * none of them: the open panel then keeps its one-line amounts (prizeLineup).
 */
export function tvDetails(game: Pick<Game, "format"> & Partial<Pick<Game, "club">>): TvDetails | null {
  const { format } = game;
  const prizes = momentPrizes(format);
  const rules = [...(format.houseRules ?? []), ...(format.claimCodes ? [CLAIM_LINE] : [])];
  const venue = venueLines(game);
  const notes = prizes.some((p) => p.note || p.reverse?.note);
  if (!notes && rules.length === 0 && venue.length === 0) return null;
  return { price: priceLine(format), prizes, rules, venue };
}
