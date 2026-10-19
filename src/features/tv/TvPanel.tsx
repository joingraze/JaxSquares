// The panel beside the TV board. While squares are open: the matchup, a big
// QR code ("Scan to grab a square") and the short link. Once the numbers are
// drawn: the scoreboard (live score, quarter and clock), who the score points
// at right now, the winners so far and what's still to play. Big type, high
// contrast, nothing to hover or tap. Team colors come from the board's
// --team-x / --team-y, so the panel and the board's bands always match.

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { formatAmount, formatRange } from "../../../shared/formats";
import { gameKickoff } from "../../../shared/kickoff";
import { shownClub } from "../../../shared/clubs";
import type { ClubBrand, GameState, Player, Team } from "../../../shared/types";
import { GiftIcon, RefreshIcon, TrophyIcon } from "../../components/icons";
import { LogoMark, cx } from "../../components/ui";
import { contrastText, countdown, kicksOffLabel, pluralize, shortTeam } from "../../lib/format";
import { boardPhase, claimedCount, headlineScore, nowSentence, type NowView } from "../board/boardModel";
import { displayLink } from "../invite/inviteModel";
import { QrCode } from "../invite/QrCode";
import { prizeLineup } from "../rules/rulesModel";
import { TvClubBrand } from "../club/TvClubBrand";
import { latest, type TvPlayer, type TvUpcoming, type TvWinner } from "./tvModel";

type Side = "x" | "y";

/**
 * The small JaxSquares mark in the panel's corner; on a Club Pass holder's
 * board, the club's logo and name instead (src/features/club), unless the
 * club TV already shows them in its own corner (`club={null}`).
 */
export function TvBrand({ club }: { club?: ClubBrand | null }) {
  const shown = shownClub(club);
  if (shown) return <TvClubBrand club={shown} />;
  return (
    <p className="tv-brand" data-testid="tv-brand">
      <LogoMark size={28} className="h-[calc(var(--u)*3.2)] w-[calc(var(--u)*3.2)]" />
      <span>
        Jax<span className="text-ink-brand">Squares</span>
      </span>
    </p>
  );
}

/** A player as an emoji (or initial) on their color, sized in TV units. */
export function TvAvatar({ player, size }: { player: Pick<Player, "name" | "color" | "emoji"> | null; size: number }) {
  const box = { width: `calc(var(--u) * ${size})`, height: `calc(var(--u) * ${size})` };
  if (!player) {
    return (
      <span
        aria-hidden
        className="tv-avatar border-dashed border-line-strong text-ink-subtle"
        style={{ ...box, borderWidth: "calc(var(--u) * 0.25)", fontSize: `calc(var(--u) * ${size * 0.45})` }}
      >
        ?
      </span>
    );
  }
  return (
    <span
      aria-hidden
      className="tv-avatar"
      style={{ ...box, backgroundColor: player.color, color: contrastText(player.color), fontSize: `calc(var(--u) * ${size * (player.emoji ? 0.56 : 0.48)})` }}
    >
      {player.emoji || [...(player.name.trim() || "?")][0].toLocaleUpperCase()}
    </span>
  );
}

const abbrOf = (team: Team) => (team.abbr || team.name.slice(0, 3)).toUpperCase().slice(0, 4);

function TeamChip({ side, team }: { side: Side; team: Team }) {
  return (
    <span className="tv-team-chip" data-side={side} aria-hidden>
      {abbrOf(team)}
    </span>
  );
}

// ---- Open board: the QR code ----

export interface TvOpenPanelProps {
  state: GameState;
  /** Hide the club's branding in the panel (the club TV shows it in its own corner). */
  hideClub?: boolean;
  /** At the panel's foot: the club TV's corner (its club and which board of how many). */
  footer?: ReactNode;
  url: string;
  /** The QR code's side, px. */
  qr: number;
  /** Lay the QR code beside its caption (a wide panel) instead of above it. */
  row: boolean;
  now: number;
}

export function TvOpenPanel({ state, url, qr, row, now, hideClub, footer }: TvOpenPanelProps) {
  const { game } = state;
  const { claimed, total } = claimedCount(state);
  const left = total - claimed;
  const kickoff = gameKickoff(game);
  const lineup = prizeLineup(game.format);
  const players = state.players.length;
  return (
    <section aria-label="Join this board" className="tv-panel" data-testid="tv-open">
      <TvBrand club={hideClub ? null : game.club} />
      <div className="flex flex-col gap-[calc(var(--u)*1.2)]">
        <h2 className="tv-title">{game.name}</h2>
        <p className="tv-text-lg flex min-w-0 flex-wrap items-center gap-x-[calc(var(--u)*1.2)] gap-y-[calc(var(--u)*0.6)]">
          <TeamChip side="x" team={game.teamX} />
          <span>{shortTeam(game.teamX, game.league)}</span>
          <span className="text-ink-subtle">vs</span>
          <TeamChip side="y" team={game.teamY} />
          <span>{shortTeam(game.teamY, game.league)}</span>
        </p>
        {kickoff !== null && kickoff > now && <p className="tv-text-md text-ink-muted">{kicksOffLabel(kickoff, now)}</p>}
      </div>

      <div className={cx("flex flex-1 items-center gap-[calc(var(--u)*3)]", row ? "flex-row" : "flex-col justify-center text-center")}>
        <div className="tv-qr shrink-0" style={{ width: qr, height: qr }} data-testid="tv-qr">
          <QrCode value={url} size={qr} quiet={1} label={`QR code: open ${displayLink(url)} to grab a square`} />
        </div>
        <div className={cx("flex min-w-0 flex-col gap-[calc(var(--u)*1.2)]", !row && "items-center")}>
          <p className="font-display text-[length:calc(var(--u)*5.4)] font-extrabold leading-[1.02] tracking-[-0.03em] text-ink">
            {left > 0 ? "Scan to grab a square" : "Scan to follow along"}
          </p>
          <p data-testid="tv-link" className="font-display text-[length:calc(var(--u)*3.4)] font-extrabold tracking-[-0.01em] text-ink-brand">
            {displayLink(url)}
          </p>
          <p className="tv-text-md text-ink-muted">
            {left > 0 ? (
              <>
                <b className="text-ink">{left}</b> of {total} squares left
              </>
            ) : (
              <b className="text-ink">Every square is taken</b>
            )}
            {" · "}
            {pluralize(players, "player")}
          </p>
          {lineup && !lineup.fun && lineup.parts.length > 0 && (
            <p className="tv-text-md flex items-start gap-[calc(var(--u)*0.8)] text-ink-gold">
              <GiftIcon className="mt-[0.15em] h-[1em] w-[1em] shrink-0" />
              <span>{lineup.parts.join(" · ")}</span>
            </p>
          )}
        </div>
      </div>
      {footer}
    </section>
  );
}

// ---- The game: score, right now, winners ----

export interface TvGamePanelProps {
  state: GameState;
  /** As TvOpenPanelProps.hideClub and .footer. */
  hideClub?: boolean;
  footer?: ReactNode;
  nowView: NowView | null;
  winners: TvWinner[];
  /** What's still to play, with what each can show. */
  upcoming: TvUpcoming[];
  now: number;
}

/**
 * How many winner rows fit in the list without cutting one in half (all of
 * them where nothing limits the height, e.g. a portrait screen that scrolls).
 */
function useRowsThatFit(count: number) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [fit, setFit] = useState(Number.POSITIVE_INFINITY);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const avail = el.clientHeight;
      const rows = [...el.querySelectorAll<HTMLElement>("[data-tv-row]")];
      if (!avail || rows.length === 0) return;
      const head = el.querySelector<HTMLElement>("[data-tv-head]");
      const gap = parseFloat(getComputedStyle(el).rowGap) || 0;
      const rowH = Math.max(...rows.map((r) => r.offsetHeight));
      const room = avail - (head ? head.offsetHeight + gap : 0);
      const next = Math.max(1, Math.floor((room + gap) / (rowH + gap)));
      setFit((cur) => (cur === next ? cur : next));
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [count]);
  return { ref, fit };
}

export function TvGamePanel({ state, nowView, winners, upcoming, now, hideClub, footer }: TvGamePanelProps) {
  const { game } = state;
  const phase = boardPhase(state);
  const score = headlineScore(state);
  const kickoff = gameKickoff(game);
  const lead = score ? Math.sign(score.scoreX - score.scoreY) : 0;
  const byId = new Map(state.players.map((p) => [p.id, p]));
  const { ref: listRef, fit } = useRowsThatFit(winners.length);
  const { shown, earlier } = latest(winners, fit);

  let status: { text: string; tone: "live" | "final" | "muted" };
  if (phase === "live") status = { text: score?.detail || "Live", tone: "live" };
  else if (phase === "final") status = { text: "Final", tone: "final" };
  // A countdown only while nothing's been scored (a custom board's host can score before its set time).
  else if (kickoff !== null && kickoff > now && !score) status = { text: `Numbers drawn · kicks off in ${countdown(kickoff - now)}`, tone: "muted" };
  else status = { text: score ? score.detail : "Numbers drawn", tone: "muted" };

  return (
    <section aria-label="Scoreboard" className="tv-panel" data-testid="tv-game">
      <div className="flex min-w-0 items-center justify-between gap-[calc(var(--u)*2)]">
        <TvBrand club={hideClub ? null : game.club} />
        <p className="tv-text-md min-w-0 truncate text-right text-ink-muted">{game.name}</p>
      </div>

      <div className="tv-card flex flex-col gap-[calc(var(--u)*1.2)]" data-testid="tv-score">
        {(["x", "y"] as const).map((side) => {
          const team = side === "x" ? game.teamX : game.teamY;
          const value = score ? (side === "x" ? score.scoreX : score.scoreY) : null;
          const trailing = lead !== 0 && (side === "x" ? lead < 0 : lead > 0);
          return (
            <div key={side} className="tv-score-row">
              <TeamChip side={side} team={team} />
              <span className="tv-team-name">{shortTeam(team, game.league)}</span>
              <span className="tv-score" data-trailing={trailing} data-testid={`tv-score-${side}`}>
                {value ?? "–"}
              </span>
            </div>
          );
        })}
        <p
          data-testid="tv-status"
          className={cx(
            "tv-eyebrow flex items-center gap-[calc(var(--u)*0.8)] border-t border-line pt-[calc(var(--u)*1.2)]",
            status.tone === "live" ? "text-ink-live" : status.tone === "final" ? "text-ink-gold" : "text-ink-muted",
          )}
        >
          {status.tone === "live" && <span aria-hidden className="inline-block h-[calc(var(--u)*1.3)] w-[calc(var(--u)*1.3)] animate-pulse rounded-full bg-live-500" />}
          {status.tone === "live" ? `Live · ${status.text}` : status.text}
        </p>
      </div>

      {nowView && <TvNow now={nowView} byId={byId} game={game} />}

      <div ref={listRef} className="tv-winners flex-1" data-testid="tv-winners">
        {winners.length > 0 && (
          <>
            <p data-tv-head className="tv-eyebrow flex items-center gap-[calc(var(--u)*0.8)] text-ink-gold">
              <TrophyIcon filled className="h-[1.1em] w-[1.1em]" />
              {phase === "final" ? "Winners" : "Winners so far"}
              {earlier > 0 && <span className="normal-case tracking-normal text-ink-subtle">· {earlier} earlier</span>}
            </p>
            {shown.map((w) => (
              <WinnerRow key={w.key} winner={w} />
            ))}
          </>
        )}
      </div>

      {upcoming.length > 0 && (
        <div className="flex flex-col gap-[calc(var(--u)*0.8)]" data-testid="tv-upcoming">
          <p className="tv-eyebrow text-ink-muted">Still to play</p>
          <p className="flex flex-wrap gap-[calc(var(--u)*0.8)]">
            {upcoming.map((u) => (
              <span key={u.key} className={cx("tv-chip", u.live ? "text-ink-live" : "text-ink")}>
                {u.label}
                {u.amount && <span className="tabular-nums text-ink-gold">{u.amount}</span>}
              </span>
            ))}
          </p>
        </div>
      )}
      {footer}
    </section>
  );
}

function WinnerRow({ winner }: { winner: TvWinner }) {
  return (
    <div className="tv-winner" data-testid="tv-winner" data-tv-row data-key={winner.key}>
      <div className="flex min-w-0 flex-col gap-[calc(var(--u)*0.3)]">
        <span className="tv-eyebrow truncate text-ink-gold" data-testid="tv-winner-label">
          {winner.label}
        </span>
        <span className="flex min-w-0 items-center gap-[calc(var(--u)*1)]">
          <TvAvatar player={winner.player} size={3.4} />
          <span className={cx("truncate text-[length:calc(var(--u)*2.9)] font-extrabold leading-tight", winner.player ? "text-ink" : "text-ink-subtle")}>
            {winner.player ? winner.player.name : `Nobody had ${winner.score ?? "it"}`}
          </span>
          {winner.reverseOnly && <RefreshIcon className="h-[calc(var(--u)*2)] w-[calc(var(--u)*2)] shrink-0 text-ink-subtle" title="Reverse square" />}
        </span>
        {winner.reverse && (
          <span className="tv-text-md flex min-w-0 items-center gap-[calc(var(--u)*0.6)] text-ink-muted">
            <RefreshIcon className="h-[0.9em] w-[0.9em] shrink-0" />
            <span className="truncate">
              {winner.reverse.label}: <b className="text-ink">{winner.reverse.player?.name ?? "nobody"}</b>
            </span>
          </span>
        )}
      </div>
      {winner.score && <span className="font-display text-[length:calc(var(--u)*3.4)] font-extrabold tabular-nums text-ink">{winner.score}</span>}
    </div>
  );
}

/** Who the score points at right now (or, on every-score boards, where the next score lands). */
function TvNow({ now, byId, game }: { now: NowView; byId: Map<string, Player>; game: GameState["game"] }) {
  const who = (id: string | null): TvPlayer | null => {
    const p = id ? byId.get(id) : undefined;
    return p ? { id: p.id, name: p.name, color: p.color, emoji: p.emoji } : null;
  };
  const owner = who(now.ownerId);
  const amount = now.rest
    ? `the rest${now.amount !== null ? ` (${formatAmount(now.amount, now.unit)} so far)` : ""}`
    : now.range
      ? formatRange(now.range, now.unit)
      : now.amount
        ? formatAmount(now.amount, now.unit)
        : null;
  const teamOf = (side: Side) => (side === "x" ? game.teamX : game.teamY);
  return (
    <div
      className="tv-card flex flex-col gap-[calc(var(--u)*1.2)]"
      data-testid="tv-now"
      data-live={now.live}
      style={{ borderLeft: `calc(var(--u) * 0.7) solid ${now.live ? "var(--color-live-500)" : "var(--color-brand-line)"}` }}
    >
      <p className={cx("tv-eyebrow", now.live ? "text-ink-live" : "text-ink-muted")}>
        {now.everyScore ? `Next score wins · now ${now.scoreX}–${now.scoreY}` : `Right now · ${now.label}`}
      </p>
      {now.everyScore ? (
        <ul className="grid grid-cols-2 gap-[calc(var(--u)*1)]">
          {now.outcomes.map((o) => {
            const p = who(o.ownerId);
            return (
              <li key={`${o.play.team}${o.play.points}`} className="flex min-w-0 items-center gap-[calc(var(--u)*0.8)]">
                <span className="tv-team-chip !h-[calc(var(--u)*3.6)] !min-w-0 !text-[length:calc(var(--u)*1.6)]" data-side={o.play.team}>
                  {abbrOf(teamOf(o.play.team))} +{o.play.points}
                </span>
                <TvAvatar player={p} size={3} />
                <span className={cx("tv-text-md truncate font-extrabold", p ? "text-ink" : "text-ink-subtle")}>{p ? p.name : "Empty"}</span>
              </li>
            );
          })}
        </ul>
      ) : (
        <>
          <div className="flex min-w-0 items-center gap-[calc(var(--u)*1.4)]">
            <TvAvatar player={owner} size={6.4} />
            <span
              data-testid="tv-now-name"
              className={cx("min-w-0 flex-1 truncate font-display text-[length:calc(var(--u)*5.6)] font-extrabold leading-none tracking-[-0.03em]", owner ? "text-ink" : "text-ink-subtle")}
            >
              {owner ? owner.name : now.ownerId ? "Someone" : "Empty square"}
            </span>
            <span className="flex shrink-0 items-center gap-[calc(var(--u)*0.8)]" aria-label={`${game.teamX.name} ${now.digits.x}, ${game.teamY.name} ${now.digits.y}`}>
              <Digit side="x" digit={now.digits.x} hot={now.live} />
              <Digit side="y" digit={now.digits.y} hot={now.live} />
            </span>
          </div>
          <p className="tv-text-md text-ink-muted">
            {nowSentence(now)}
            {amount && <b className="tabular-nums text-ink-gold"> · {amount}</b>}
          </p>
        </>
      )}
    </div>
  );
}

function Digit({ side, digit, hot }: { side: Side; digit: string; hot: boolean }) {
  return (
    <span aria-hidden className="flex items-center gap-[calc(var(--u)*0.5)]">
      <span className={cx("h-[calc(var(--u)*1.2)] w-[calc(var(--u)*1.2)] rounded-full", side === "x" ? "bg-team-x" : "bg-team-y")} />
      <span
        className={cx(
          "grid h-[calc(var(--u)*5)] min-w-[calc(var(--u)*5)] place-items-center rounded-[calc(var(--u)*1)] px-[calc(var(--u)*0.6)] font-display text-[length:calc(var(--u)*3.4)] font-extrabold tabular-nums",
          hot ? "bg-live-500 text-white" : "bg-ink text-canvas",
        )}
      >
        {digit}
      </span>
    </span>
  );
}
