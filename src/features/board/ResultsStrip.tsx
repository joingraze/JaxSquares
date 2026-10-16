// Period-by-period results: score, who won (and reverse), the host's prize
// note. Tapping a decided period spotlights its square on the board.
// Fixed periods lay out two by two; every-score boards get a swipeable strip,
// newest first, so it always opens on whole cards with the score in play.
// A period whose square nobody took says so plainly ("Nobody had 7–3"); the
// host can pick a winner from host tools.

import { everyScoreIndex, periodPhrase } from "../../../shared/formats";
import type { Player, Team } from "../../../shared/types";
import { GiftIcon, RefreshIcon } from "../../components/icons";
import { Avatar, cx, LiveDot } from "../../components/ui";
import type { PeriodCard } from "./boardModel";

export interface ResultsStripProps {
  cards: PeriodCard[];
  players: Player[];
  me: string;
  teamX: Team;
  teamY: Team;
  reverse: boolean;
  /** Numbers aren't drawn yet: cards only show what's at stake. */
  predraw: boolean;
  /**
   * The live "if it ended now" owner and score for the period in play. Fixed
   * periods only: an every-score entry is never won by the score it's at now
   * (the next entry needs a new score; 0-0 never wins).
   */
  liveNow: { playerId: string | null; scoreX: number; scoreY: number } | null;
  selectedKey: string | null;
  onSelect: (key: string | null) => void;
  /** Lay the cards out two by two (fixed periods) instead of a swipeable strip (every score). */
  grid?: boolean;
}

export function ResultsStrip({ cards, players, me, teamX, teamY, reverse, predraw, liveNow, selectedKey, onSelect, grid = false }: ResultsStripProps) {
  const byId = new Map(players.map((p) => [p.id, p]));
  if (cards.length === 0) return null;
  const ordered = grid ? cards : [...cards].reverse();
  const abbr = (t: Team) => t.abbr || t.name.slice(0, 3).toUpperCase();

  return (
    <div
      className={cx(
        grid
          ? "grid grid-cols-2 gap-2.5"
          : "jx-strip scrollbar-none relative -mx-4 flex gap-2.5 overflow-x-auto px-4 pb-1 pt-0.5",
      )}
    >
      {ordered.map((card) => {
        const r = card.result;
        const winner = r?.winnerPlayerId ? byId.get(r.winnerPlayerId) : null;
        const revWinner = r?.reverseWinnerPlayerId ? byId.get(r.reverseWinnerPlayerId) : null;
        const iWon = !!r && (r.winnerPlayerId === me || r.reverseWinnerPlayerId === me);
        const selected = selectedKey === card.key;
        const tappable = !!r?.cell;
        const now = card.status === "live" && everyScoreIndex(card.key) === null ? liveNow : null;
        const liveOwner = now?.playerId ? byId.get(now.playerId) : null;
        return (
          <button
            key={card.key}
            type="button"
            disabled={!tappable}
            aria-pressed={tappable ? selected : undefined}
            onClick={() => onSelect(selected ? null : card.key)}
            className={cx(
              "pressable relative flex shrink-0 flex-col gap-2 rounded-[1.125rem] p-3 text-left ring-1 ring-inset disabled:cursor-default",
              grid ? "min-w-0" : "w-[9.5rem]",
              grid && cards.length % 2 === 1 && card === cards[cards.length - 1] && "col-span-2",
              iWon
                ? "jx-shine bg-[linear-gradient(160deg,rgb(255_194_51/0.28),rgb(255_171_15/0.08)_70%)] bg-surface-2 ring-gold-400/60 shadow-glow-gold"
                : card.status === "live"
                  ? "bg-[linear-gradient(160deg,rgb(255_64_64/0.16),transparent_70%)] bg-surface-2 ring-live-500/45"
                  : card.status === "done"
                    ? "bg-surface-2 ring-line-strong"
                    : "bg-surface-2/60 ring-line",
              selected && "!ring-2 !ring-gold-300",
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span className={cx("eyebrow", card.status === "done" ? "text-gold-300" : "text-ink-muted")}>{periodPhrase(card.key, card.label).short}</span>
              {card.status === "live" && (
                <span className="eyebrow flex items-center gap-1 text-live-400">
                  <LiveDot />
                  Live
                </span>
              )}
              {card.status === "next" && !predraw && !/next/i.test(card.label) && <span className="eyebrow text-brand-300">Up next</span>}
              {r?.source === "host" && <span className="eyebrow text-ink-subtle">Host pick</span>}
            </div>

            {r ? (
              <>
                <div className="flex items-baseline gap-1.5 font-display font-extrabold tabular-nums leading-none">
                  {r.score ? (
                    <>
                      <span className="text-title-3">{r.score.scoreX}</span>
                      <span className="text-ink-subtle">–</span>
                      <span className="text-title-3">{r.score.scoreY}</span>
                      <span className="ml-auto self-center text-[0.625rem] font-bold tracking-wide text-ink-subtle">
                        {abbr(teamX)}–{abbr(teamY)}
                      </span>
                    </>
                  ) : (
                    <span className="text-subhead text-ink-muted">Host's pick</span>
                  )}
                </div>
                <WinnerLine player={winner ?? null} me={me} empty={!r.winnerPlayerId} score={r.score ?? null} />
                {reverse && r.reverseCell && (r.reverseWinnerPlayerId !== r.winnerPlayerId || !r.winnerPlayerId) && (
                  <span className="flex min-w-0 items-center gap-1 text-caption text-ink-muted">
                    <RefreshIcon size={12} className="shrink-0" />
                    <span className="truncate">
                      Reverse:{" "}
                      <b className={cx("font-bold", r.reverseWinnerPlayerId === me ? "text-brand-300" : "text-ink")}>
                        {r.reverseWinnerPlayerId === me ? "You" : (revWinner?.name ?? "nobody")}
                      </b>
                    </span>
                  </span>
                )}
              </>
            ) : now ? (
              <>
                <div className="flex items-baseline gap-1.5 font-display font-extrabold tabular-nums leading-none">
                  <span className="text-title-3">{now.scoreX}</span>
                  <span className="text-ink-subtle">–</span>
                  <span className="text-title-3">{now.scoreY}</span>
                </div>
                <div className="flex min-w-0 items-center gap-1.5 text-caption text-ink-muted">
                  <span className="shrink-0">If it ended now:</span>
                </div>
                <WinnerLine player={liveOwner ?? null} me={me} empty={!now.playerId} score={now} live />
              </>
            ) : (
              <>
                {!predraw && (
                  <div aria-hidden className="flex items-baseline gap-1.5 font-display text-title-3 font-extrabold leading-none text-ink-subtle/50">
                    <span>–</span>
                    <span className="text-callout">–</span>
                    <span>–</span>
                  </div>
                )}
                {!predraw && (
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span
                      aria-hidden
                      className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full border border-dashed border-line-strong text-[0.625rem] font-extrabold text-ink-subtle"
                    >
                      ?
                    </span>
                    <span className="truncate text-subhead font-bold text-ink-subtle">TBD</span>
                  </span>
                )}
              </>
            )}

            <span
              className={cx(
                "flex min-w-0 items-start gap-1.5 font-semibold leading-snug",
                !(predraw && !r) && "mt-auto",
                predraw && !r ? "text-subhead" : "text-caption",
                card.prize ? "text-gold-300" : "text-ink-subtle",
              )}
            >
              <GiftIcon size={predraw && !r ? 16 : 13} className="mt-px shrink-0" />
              <span className="line-clamp-2">{card.prize ?? "Bragging rights"}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function WinnerLine({
  player,
  me,
  empty,
  score,
  live = false,
}: {
  player: Player | null;
  me: string;
  empty: boolean;
  /** The score that pointed at the square, for "Nobody had 7–3". */
  score: { scoreX: number; scoreY: number } | null;
  live?: boolean;
}) {
  if (empty || !player) {
    const nobody = score ? `Nobody ${live ? "has" : "had"} ${score.scoreX}–${score.scoreY}` : "Nobody had it";
    return <span className="text-footnote font-semibold text-ink-subtle">{empty ? nobody : "Someone"}</span>;
  }
  const mine = player.id === me;
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <Avatar name={player.name} color={player.color} emoji={player.emoji} size="xs" ring={mine ? "brand" : "gold"} decorative />
      <span className={cx("truncate text-subhead font-extrabold", mine ? "text-brand-300" : "text-ink")}>{mine ? "You!" : player.name}</span>
    </span>
  );
}
