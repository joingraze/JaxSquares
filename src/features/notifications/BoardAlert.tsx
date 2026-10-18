// How a live board alert looks: the subject's own avatar (mine for my news,
// the winner's for theirs, a board glyph for system news) with a small badge,
// a short headline, and the score or my numbers as team-colored chips.
//
// Two ways to use it on the board:
// - <BoardAlertCard>: the whole alert as one tappable card (tap = jump to the square).
// - alertTickerNote(): the same pieces shaped for the board's Ticker
//   ({ title, detail, icon, tone, duration }).
//
// The words and rules live in alerts.ts (pure, tested); this file only draws.

import type { CSSProperties, ReactNode } from "react";
import type { GameState, Player } from "../../../shared/types";
import { ChevronRightIcon, FlagIcon, FootballIcon, GridIcon, LockIcon, TrophyIcon } from "../../components/icons";
import { Avatar, cx } from "../../components/ui";
import { teamVars } from "../../lib/format";
import { teamShort, type AlertChip, type AlertSubject } from "./activity";
import type { BoardAlert } from "./alerts";
import "./notifications.css";
import { useResolvedTheme } from "../../lib/theme";

type Glyph = Extract<AlertSubject, { kind: "system" }>["glyph"];

const GLYPH: Record<Glyph, { cls: string; icon: (px: number) => ReactNode }> = {
  numbers: { cls: "bg-brand-400 text-ink-inverse", icon: (px) => <LockIcon size={px} /> },
  score: { cls: "bg-live-500 text-white", icon: (px) => <FootballIcon size={px} /> },
  winner: { cls: "bg-gold-400 text-ink-inverse", icon: (px) => <TrophyIcon size={px} filled /> },
  final: { cls: "bg-ink text-canvas", icon: (px) => <FlagIcon size={px} /> },
  board: { cls: "bg-surface-4 text-ink", icon: (px) => <GridIcon size={px} /> },
};

function subjectPlayer(subject: AlertSubject | undefined, state: GameState, me: string): Player | undefined {
  if (!subject || subject.kind === "system") return undefined;
  const id = subject.kind === "me" ? me : subject.id;
  return state.players.find((p) => p.id === id);
}

/**
 * The alert's art: whose news it is, with a badge for what happened.
 * `contained` keeps the badge inside the box (for a slot that clips, like the Ticker's icon).
 */
export function AlertArt({
  alert,
  state,
  me,
  size = 40,
  contained = false,
}: {
  alert: Pick<BoardAlert, "subject" | "kind" | "tone">;
  state: GameState;
  me: string;
  size?: number;
  contained?: boolean;
}) {
  const person = subjectPlayer(alert.subject, state, me);
  const glyph: Glyph =
    alert.subject?.kind === "system"
      ? alert.subject.glyph
      : alert.kind === "final"
        ? "final"
        : alert.kind === "numbers"
          ? "numbers"
          : "board";
  // People wear a badge for game moments; chatter (joins, picks) is just their face.
  const badge: Glyph | null = person
    ? alert.kind === "win" || alert.kind === "my-win"
      ? "winner"
      : alert.kind === "final"
        ? "final"
        : alert.kind === "numbers"
          ? "numbers"
          : null
    : null;
  const g = GLYPH[glyph];
  const face = contained && badge ? size - 4 : size;
  const dot = Math.round(size * (contained ? 0.44 : 0.48));
  return (
    <span aria-hidden className="relative inline-grid shrink-0" style={{ width: size, height: size }}>
      <span style={{ width: face, height: face }}>
        {person ? (
          <Avatar name={person.name} color={person.color} emoji={person.emoji} size={face >= 36 ? "md" : "sm"} decorative className="!h-full !w-full" />
        ) : (
          <span className={cx("grid h-full w-full place-items-center rounded-full", g.cls)}>{g.icon(Math.round(face * 0.5))}</span>
        )}
      </span>
      {badge && (
        <span
          className={cx(
            "absolute grid place-items-center rounded-full ring-2 ring-surface-3",
            contained ? "bottom-0 right-0" : "-bottom-1 -right-1",
            GLYPH[badge].cls,
          )}
          style={{ width: dot, height: dot }}
        >
          {GLYPH[badge].icon(Math.round(dot * 0.6))}
        </span>
      )}
    </span>
  );
}

function TeamTag({ which, children }: { which: "x" | "y"; children: ReactNode }) {
  return (
    <span
      className="inline-grid h-[1.125rem] place-items-center rounded-[0.3125rem] px-1 font-display text-[0.625rem] font-extrabold leading-none tracking-tight"
      style={{ backgroundColor: `var(--team-${which})`, color: `var(--team-${which}-ink)` }}
    >
      {children}
    </span>
  );
}

/** The score or my numbers, team-colored like the board's own scoreboard and Your numbers. */
export function AlertChipView({ chip, state, className }: { chip: AlertChip; state: GameState; className?: string }) {
  const { teamX, teamY } = state.game;
  const vars = teamVars(teamX, teamY, useResolvedTheme()) as CSSProperties;
  const x = teamShort(teamX).slice(0, 4).toUpperCase();
  const y = teamShort(teamY).slice(0, 4).toUpperCase();
  if (chip.kind === "score") {
    return (
      <span style={vars} className={cx("jxn-chip", className)} aria-label={`${teamX.name} ${chip.scoreX}, ${teamY.name} ${chip.scoreY}`}>
        <TeamTag which="x">{x}</TeamTag>
        <b className="tabular-nums">{chip.scoreX}</b>
        <span className="text-ink-subtle">–</span>
        <b className="tabular-nums">{chip.scoreY}</b>
        <TeamTag which="y">{y}</TeamTag>
      </span>
    );
  }
  return (
    <span style={vars} className={cx("inline-flex min-w-0 items-center gap-1.5", className)}>
      {chip.pairs.map((p) => (
        <span key={`${p.row},${p.col}`} className="jxn-chip" aria-label={`${teamX.name} ${p.x}, ${teamY.name} ${p.y}`}>
          <TeamTag which="x">{x}</TeamTag>
          <b className="tabular-nums">{p.x}</b>
          <TeamTag which="y">{y}</TeamTag>
          <b className="tabular-nums">{p.y}</b>
        </span>
      ))}
      {chip.more > 0 && <span className="shrink-0 text-caption font-bold text-ink-muted">+{chip.more}</span>}
    </span>
  );
}

/** Second line: the chip, then the detail text (prize note, "49 left", "You won Half"). */
export function AlertDetail({ alert, state }: { alert: Pick<BoardAlert, "chip" | "detail">; state: GameState }) {
  if (!alert.chip && !alert.detail) return null;
  return (
    <span className="flex min-w-0 items-center gap-2">
      {alert.chip && <AlertChipView chip={alert.chip} state={state} className="shrink-0" />}
      {alert.detail && <span className="min-w-0 truncate text-caption font-semibold text-ink-muted">{alert.detail}</span>}
    </span>
  );
}

/** Tone for the board's Ticker. */
export function tickerTone(alert: Pick<BoardAlert, "tone" | "kind">): "neutral" | "win" | "live" | "social" {
  if (alert.tone === "win") return "win";
  if (alert.tone === "live") return "live";
  return alert.kind === "picks" || alert.kind === "people" ? "social" : "neutral";
}

/**
 * The alert shaped for the board's Ticker: { title, detail, icon, tone, duration }
 * plus `key` (same key replaces in place), `cell` (tap target) and `banner`
 * (skip: the gold "You won" banner already says it).
 */
export function alertTickerNote(alert: BoardAlert, state: GameState, me: string) {
  return {
    key: alert.key,
    title: alert.title,
    detail: alert.chip || alert.detail ? <AlertDetail alert={alert} state={state} /> : undefined,
    icon: <AlertArt alert={alert} state={state} me={me} size={32} contained />,
    tone: tickerTone(alert),
    duration: alert.duration,
    cell: alert.cell,
    banner: alert.banner ?? false,
  };
}

export interface BoardAlertCardProps {
  alert: BoardAlert;
  state: GameState;
  me: string;
  /** Tap: jump to the alert's square (when it has one); otherwise the tap dismisses. */
  onOpen?: (cell: { row: number; col: number }) => void;
  onDismiss?: () => void;
  leaving?: boolean;
  className?: string;
}

/** One rich, tappable alert. Sized for the bottom of the board, never over the scoreboard. */
export function BoardAlertCard({ alert, state, me, onOpen, onDismiss, leaving = false, className }: BoardAlertCardProps) {
  const jump = alert.cell && onOpen ? alert.cell : null;
  return (
    <button
      type="button"
      data-tone={alert.tone}
      data-leaving={leaving}
      onClick={() => (jump ? onOpen!(jump) : onDismiss?.())}
      aria-label={`${alert.text}${jump ? ". Show the square" : ""}`}
      className={cx("jxn-alert pressable", className)}
    >
      <AlertArt alert={alert} state={state} me={me} size={40} />
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="truncate text-subhead font-bold leading-tight text-ink">{alert.title}</span>
        <AlertDetail alert={alert} state={state} />
      </span>
      {jump && <ChevronRightIcon size={18} className="shrink-0 text-ink-subtle" />}
    </button>
  );
}
