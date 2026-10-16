// The dashboard for someone with boards: one headline sentence, then boards
// grouped by what they need — Live now, Needs you, Up next, Final.

import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { GameSummary } from "../../../shared/types";
import { ArrowRightIcon, ShareIcon, WifiOffIcon } from "../../components/icons";
import { Button, celebrate, cx, LiveDot, LogoMark, TopBar, useToast } from "../../components/ui";
import { inviteUrl, type ApiError } from "../../lib/api";
import { countdown, kickoffLabel } from "../../lib/format";
import { getPlayerId, useProfile } from "../../lib/identity";
import { haptic, shareLink } from "../../lib/native";
import { BoardCard } from "./BoardCard";
import { SectionHeader } from "./BoardBits";
import { FinalList } from "./FinalList";
import { HowItWorks } from "./HowItWorks";
import { JoinCodeSheet } from "./JoinCodeSheet";
import { LiveCard } from "./LiveCard";
import { LiveCarousel } from "./LiveCarousel";
import { NotifyBell } from "./NotifyBell";
import { groupBoards, headlineFor, hostAction, latestBuzz, liveSnapshot, primaryActionId, type Buzz, type Headline } from "./sections";
import { celebratedWins, markCelebrated } from "../board/storage";
import { useBoardDetails } from "./useBoardDetails";
import { useNow } from "./useNow";
import { PULL_THRESHOLD, usePullToRefresh } from "./usePullToRefresh";
import "./home.css";

const DAY = 24 * 60 * 60 * 1000;

export interface DashboardProps {
  games: GameSummary[];
  error: ApiError | null;
  refresh: () => Promise<void>;
}

export function Dashboard({ games, error, refresh }: DashboardProps) {
  const me = getPlayerId();
  const profile = useProfile();
  const now = useNow();
  const details = useBoardDetails(games);
  const grouped = useMemo(() => groupBoards(games), [games]);
  // Live boards: the one you're winning first (it matches the headline), then games with a running clock.
  const sections = useMemo(() => {
    const rank = (g: GameSummary) => {
      const s = details[g.id];
      const snap = s ? liveSnapshot(s, me) : null;
      return (snap?.meWinning ? 2 : 0) + (snap?.inProgress || g.live?.state === "in" ? 1 : 0);
    };
    return { ...grouped, live: [...grouped.live].sort((a, b) => rank(b) - rank(a)) };
  }, [grouped, details, me]);
  const [joining, setJoining] = useState(false);
  const { pull, refreshing } = usePullToRefresh(refresh);
  useWinCelebration(games);

  // Live boards are sorted with the one you're winning first, so the headline matches the first card.
  const lead = sections.live[0] && details[sections.live[0].id] ? liveSnapshot(details[sections.live[0].id], me) : null;
  const headline = headlineFor(sections, { winning: lead?.meWinning && lead.leader ? lead.leader : null, now });
  const focus = sections.live[0] ?? sections.needs[0] ?? sections.next[0] ?? null;
  const primaryId = primaryActionId(sections);
  const buzzOf = (g: GameSummary) => {
    const s = details[g.id];
    return s && g.status === "open" ? latestBuzz(s, me, now) : null;
  };

  let delay = 0;
  const enter = () => ({ animationDelay: `${(delay++ * 45).toString()}ms` });

  return (
    <>
      <TopBar
        title="Home"
        leading={<LogoMark size={30} className="ml-2.5" />}
        trailing={<NotifyBell gameId={focus?.id ?? null} isHost={focus?.isHost ?? false} />}
        largeTitle={<HeadlineText headline={headline} name={profile.name} />}
      />

      <PullIndicator pull={pull} refreshing={refreshing} />

      <div
        className="flex flex-col gap-7 px-safe transition-transform duration-300 ease-out-quint"
        style={pull > 0 ? { transform: `translate3d(0, ${pull.toFixed(1)}px, 0)`, transitionDuration: refreshing ? undefined : "0ms" } : undefined}
      >
        {error && (
          <div className="flex items-center gap-3 rounded-2xl bg-surface-2 px-3.5 py-2.5 ring-1 ring-inset ring-line">
            <WifiOffIcon size={18} className="shrink-0 text-ink-subtle" />
            <p className="min-w-0 flex-1 text-footnote text-ink-muted">
              <span className="font-bold text-ink">{error.isNetwork ? "You're offline." : "Couldn't refresh."}</span> Showing your last update.
            </p>
            <Button variant="ghost" size="sm" onClick={() => void refresh()}>
              Retry
            </Button>
          </div>
        )}

        {sections.live.length > 0 && (
          <section aria-labelledby="home-live">
            <SectionHeader id="home-live" icon={<LiveDot tone="live" />} title="Live now" tone="live" count={sections.live.length} />
            {sections.live.length === 1 ? (
              <div className="home-enter" style={enter()}>
                <LiveCard game={sections.live[0]} state={details[sections.live[0].id]} me={me} />
              </div>
            ) : (
              <div className="home-enter" style={enter()}>
                <LiveCarousel label="Live boards">
                  {sections.live.map((g) => (
                    <LiveCard key={g.id} game={g} state={details[g.id]} me={me} compact />
                  ))}
                </LiveCarousel>
              </div>
            )}
          </section>
        )}

        {sections.needs.length > 0 && (
          <section aria-labelledby="home-needs">
            <SectionHeader id="home-needs" title="Needs you" tone="brand" count={sections.needs.length} />
            <div className="flex flex-col gap-3">
              {sections.needs.map((g) => (
                <div key={g.id} className="home-enter" style={enter()}>
                  <NeedsCard game={g} now={now} primary={g.id === primaryId} buzz={buzzOf(g)} />
                </div>
              ))}
            </div>
          </section>
        )}

        {sections.next.length > 0 && (
          <section aria-labelledby="home-next">
            <SectionHeader id="home-next" title="Up next" count={sections.next.length} />
            <div className="flex flex-col gap-3">
              {sections.next.map((g) => (
                <div key={g.id} className="home-enter" style={enter()}>
                  <NextCard game={g} now={now} primary={g.id === primaryId} buzz={buzzOf(g)} />
                </div>
              ))}
            </div>
          </section>
        )}

        {sections.final.length > 0 && (
          <section aria-labelledby="home-final" className="home-enter" style={enter()}>
            <SectionHeader id="home-final" title="Final" count={sections.final.length} />
            <FinalList games={sections.final} details={details} />
          </section>
        )}

        {games.length <= 2 && sections.final.length === 0 && (
          <div className="home-enter" style={enter()}>
            <HowItWorks />
          </div>
        )}

        <button
          type="button"
          onClick={() => {
            void haptic("selection");
            setJoining(true);
          }}
          className="pressable mx-auto flex items-center gap-1.5 rounded-full px-4 py-2 text-subhead font-bold text-ink-muted hover:text-ink"
        >
          Have a code? <span className="text-brand-400">Join a board</span>
          <ArrowRightIcon size={16} strokeWidth={2.6} className="text-brand-400" />
        </button>
      </div>

      <JoinCodeSheet open={joining} onClose={() => setJoining(false)} />
    </>
  );
}

function HeadlineText({ headline, name }: { headline: Headline; name: string }) {
  return (
    <span className="block">
      <span className="mb-1.5 block font-sans text-subhead font-bold tracking-normal text-ink-muted">
        {name ? `Hey ${name}` : "Hey there"}
      </span>
      <span className="block text-balance">
        {headline.lead}{" "}
        <span className={cx(headline.tone === "win" ? "text-foil" : headline.tone === "live" ? "text-live-400" : "text-brand-400")}>
          {headline.hot}
        </span>
      </span>
    </span>
  );
}

function NeedsCard({ game, now, primary, buzz }: { game: GameSummary; now: number; primary: boolean; buzz: Buzz | null }) {
  const navigate = useNavigate();
  const toast = useToast();
  const action = hostAction(game);
  const left = game.totalSquares - game.claimed;
  const open = () => navigate(`/g/${game.id}`);

  if (action === "lock") {
    return (
      <BoardCard
        game={game}
        buzz={buzz}
        now={now}
        highlight="gold"
        status="Board's full!"
        statusTone="gold"
        action={{ label: "Draw numbers", onClick: open, primary, tone: "gold" }}
      />
    );
  }
  if (action === "finish-setup") {
    return (
      <BoardCard
        game={game}
        buzz={buzz}
        now={now}
        status="Not open yet"
        statusTone="brand"
        action={{ label: "Finish setup", onClick: open, primary }}
      />
    );
  }

  const share = async () => {
    const outcome = await shareLink({
      title: game.name,
      text: `Grab a square on ${game.name}: ${game.teamX.name} vs ${game.teamY.name}`,
      url: inviteUrl(game.id),
    });
    if (outcome === "copied") toast.success("Invite link copied", "Paste it in the group chat.");
  };
  return (
    <BoardCard
      game={game}
      buzz={buzz}
      now={now}
      status={`${left} left${game.startsAt ? ` · ${kickoffText(game.startsAt, now, true)}` : ""}`}
      statusTone="brand"
      meta={game.mySquares > 0 ? `${game.mySquares} yours` : "none yours yet"}
      action={{ label: "Invite", icon: <ShareIcon size={16} strokeWidth={2.4} />, onClick: () => void share(), primary }}
    />
  );
}

function NextCard({ game, now, primary, buzz }: { game: GameSummary; now: number; primary: boolean; buzz: Buzz | null }) {
  const navigate = useNavigate();
  const left = game.totalSquares - game.claimed;
  const soon = game.startsAt !== null && game.startsAt - now < DAY;
  const status = game.startsAt ? kickoffText(game.startsAt, now) : left > 0 ? "Squares open" : "Board's full";
  const pick = game.mySquares === 0 && left > 0;
  return (
    <BoardCard
      game={game}
      buzz={buzz}
      now={now}
      status={status}
      statusTone={soon ? "brand" : "muted"}
      meta={game.mySquares > 0 ? `${game.mySquares} yours` : `${left} left`}
      action={pick ? { label: "Pick squares", onClick: () => navigate(`/g/${game.id}`), primary } : undefined}
    />
  );
}

function kickoffText(startsAt: number, now: number, short = false): string {
  const ms = startsAt - now;
  if (ms <= 0) return "Kicking off";
  if (ms < 2 * DAY) return short ? `kicks off in ${countdown(ms)}` : `Kickoff in ${countdown(ms)}`;
  return short ? kickoffLabel(startsAt, now) : `Kickoff ${kickoffLabel(startsAt, now)}`;
}

function PullIndicator({ pull, refreshing }: { pull: number; refreshing: boolean }) {
  if (pull <= 0 && !refreshing) return null;
  const progress = Math.min(1, pull / PULL_THRESHOLD);
  return (
    <div aria-hidden={!refreshing} role={refreshing ? "status" : undefined} className="relative z-10 h-0">
      <div
        className="ptr-ball absolute left-1/2 top-0 -ml-5 grid h-10 w-10 place-items-center rounded-full bg-surface-3 shadow-float ring-1 ring-inset ring-line-strong"
        style={{ opacity: refreshing ? 1 : progress, transform: `translateY(${(pull / 2 - 20).toFixed(1)}px) scale(${0.6 + progress * 0.4})` }}
      >
        <span className={cx("text-xl leading-none", refreshing && "ptr-spin")} style={refreshing ? undefined : { transform: `rotate(${(pull * 4).toFixed(0)}deg)` }}>
          🏈
        </span>
        {refreshing && <span className="sr-only">Refreshing your boards</span>}
      </div>
    </div>
  );
}

/**
 * Confetti + a toast when one of your squares wins while you're looking at
 * Home. Wins already on the board when Home opened stay quiet, and the
 * board's per-device ledger means a win is celebrated once, here or there.
 */
function useWinCelebration(games: GameSummary[]) {
  const toast = useToast();
  const navigate = useNavigate();
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    const wins = games.flatMap((g) => winIds(g).map((id) => ({ key: `${g.id}|${id}`, id, game: g })));
    if (seen.current === null) {
      seen.current = new Set(wins.map((w) => w.key));
      return;
    }
    const fresh = wins.filter((w) => !seen.current!.has(w.key));
    for (const w of fresh) seen.current.add(w.key);
    const unclaimed = fresh.filter((w) => !celebratedWins(w.game.id).has(w.id));
    if (unclaimed.length === 0) return;
    for (const w of unclaimed) markCelebrated(w.game.id, [w.id]);
    const first = unclaimed[0];
    const label = first.game.myWins.find((m) => winId(m) === first.id)?.label ?? "a period";
    void haptic("success");
    void celebrate("win");
    toast.show({
      tone: "win",
      title: `You won ${label}!`,
      description: `Your square hit on ${first.game.name}.`,
      action: { label: "See it", onClick: () => navigateRef.current(`/g/${first.game.id}`) },
    });
  }, [games, toast]);
}

/** Same ids the board uses for its celebration ledger: "q1", or "q1:reverse" for a reverse-only win. */
function winId(w: { periodKey: string; label: string }): string {
  return w.label.endsWith("(reverse)") ? `${w.periodKey}:reverse` : w.periodKey;
}

function winIds(g: GameSummary): string[] {
  const ids = g.myWins.map(winId);
  // Holding both the square and its reverse is one win on the board.
  return ids.filter((id) => !(id.endsWith(":reverse") && ids.includes(id.slice(0, -":reverse".length))));
}
