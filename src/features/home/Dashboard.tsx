// The dashboard for someone with boards: one headline sentence that sums up
// the day, then boards grouped by what they need — Live now, Invites (boards
// waiting on my picks), Needs you (host to-dos), Up next, Final.
//
// Everything on it is live: Home follows every board you're in that's still
// moving (useHomeFeed), lays each board's live state over its summary, and
// re-renders the moment a friend grabs a square, numbers drop or a score
// lands. The summary list itself still refreshes in the background (new
// boards, boards past the follow cap, and invites you only opened, which
// aren't followed live).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { GameState, GameSummary } from "../../../shared/types";
import { ArrowRightIcon, MailIcon, ShareIcon, WifiOffIcon } from "../../components/icons";
import { Button, buttonStyles, celebrate, cx, Jax, JaxCheer, LiveDot, useToast } from "../../components/ui";
import { inviteUrl, type ApiError } from "../../lib/api";
import { forgetSeen, getPlayerId, rememberSeen, useProfile } from "../../lib/identity";
import { isMyBoard } from "../../lib/live";
import { haptic, shareLink } from "../../lib/native";
import { celebratedWins, markCelebrated } from "../board/storage";
import { ActivityBell } from "./ActivityInbox";
import { BoardCard, type CardAction } from "./BoardCard";
import { SectionHeader } from "./BoardBits";
import { FINALS_COLLAPSED, FinalList } from "./FinalList";
import { HomeHeader } from "./HomeHeader";
import { HowItWorks } from "./HowItWorks";
import { buildInbox } from "./inbox";
import { InviteCard } from "./InviteCard";
import { JoinCodeSheet } from "./JoinCodeSheet";
import { LiveCard } from "./LiveCard";
import { LiveCarousel } from "./LiveCarousel";
import { statesNotOlder, useHomeFeed } from "./homeFeed";
import {
  boardBuzz,
  cardModel,
  groupBoards,
  headlineFor,
  inviteModel,
  liveHits,
  liveSnapshot,
  phraseOf,
  primaryActionId,
  scoreWithTeams,
  withState,
  type BoardAction,
} from "./sections";
import { useNow } from "./useNow";
import { PULL_THRESHOLD, usePullToRefresh } from "./usePullToRefresh";
import "./home.css";

export interface DashboardProps {
  games: GameSummary[];
  error: ApiError | null;
  refresh: () => Promise<void>;
}

/**
 * Follow boards in play first, then your own boards, then the most recently
 * active. Only boards you're on: an invite you only opened refreshes with the
 * summary list (on focus, every 30 s, pull to refresh).
 */
function followOrder(boards: GameSummary[]): string[] {
  const rank = (g: GameSummary) => (g.status === "locked" || g.live?.state === "in" ? 2 : 0) + (g.isHost ? 1 : 0);
  return boards
    .filter((g) => isMyBoard(g) && (g.status === "open" || g.status === "locked"))
    .sort((a, b) => rank(b) - rank(a) || b.lastActivityAt - a.lastActivityAt)
    .map((g) => g.id);
}

/** "id@version" for a board fetched once (again when its summary moves past the state held). */
const onceKeyOf = (g: GameSummary) => (g.version === undefined ? g.id : `${g.id}@${g.version}`);

export function Dashboard({ games, error, refresh }: DashboardProps) {
  const me = getPlayerId();
  const profile = useProfile();
  const now = useNow(15_000);
  const [openedAt] = useState(() => Date.now());
  const [finalsShown, setFinalsShown] = useState(FINALS_COLLAPSED);
  const { snapshot, sync } = useHomeFeed();
  // A state older than its summary (a board Home stopped following, or a final
  // the host corrected since) is dropped: the summary knows better.
  const details = useMemo(() => statesNotOlder(snapshot.states, games), [snapshot.states, games]);

  // Each summary with its board's live state on top (only states from the network: a cached one may be older).
  // A board deleted while Home followed it disappears now, not at the next summary refresh.
  const boards = useMemo(
    () =>
      games
        .filter((g) => !snapshot.gone.has(g.id))
        .map((g) => (snapshot.fresh.has(g.id) && details[g.id] ? withState(g, details[g.id], me) : g)),
    [games, snapshot, details, me],
  );
  const grouped = useMemo(() => groupBoards(boards), [boards]);
  // Live boards: the one you're winning first (it matches the headline), then games with a running clock.
  const sections = useMemo(() => {
    const rank = (g: GameSummary) => {
      const s = details[g.id];
      const snap = s ? liveSnapshot(s, me) : null;
      return (snap?.meWinning ? 2 : 0) + (snap?.inProgress || g.live?.state === "in" ? 1 : 0);
    };
    return { ...grouped, live: [...grouped.live].sort((a, b) => rank(b) - rank(a)) };
  }, [grouped, details, me]);

  const liveKey = followOrder(boards).join(",");
  // Fetched once: the finals on screen, and games in play I'm only watching (not followed live),
  // each again when its summary moves past the state held.
  const onceKey = [...sections.live.filter((g) => !isMyBoard(g)), ...sections.final.slice(0, finalsShown)].map(onceKeyOf).join(",");
  useEffect(() => {
    const versions: Record<string, number> = {};
    const once = (onceKey ? onceKey.split(",") : []).map((key) => {
      const [id, version] = key.split("@");
      if (version !== undefined) versions[id] = Number(version);
      return id;
    });
    sync(liveKey ? liveKey.split(",") : [], once, versions);
  }, [sync, liveKey, onceKey]);

  const [joining, setJoining] = useState(false);
  const { pull, refreshing } = usePullToRefresh(refresh);
  const [winPulse, setWinPulse] = useState(0);
  const [cheer, setCheer] = useState(0);
  useWinCelebration(
    boards,
    details,
    () => setWinPulse((n) => n + 1),
    () => setCheer((n) => n + 1),
  );

  const winningNow = sections.live.some((g) => {
    const snap = details[g.id] ? liveSnapshot(details[g.id], me) : null;
    return !!snap?.meWinning && snap.leader?.kind === "now";
  });
  const headline = headlineFor(sections, { winningNow, hits: liveHits(sections), now });
  const focus = sections.live[0] ?? sections.invites[0] ?? sections.needs[0] ?? sections.next[0] ?? null;
  const primaryId = primaryActionId(sections);
  // The inbox is news from boards I'm on; a board I'm only watching isn't.
  const inbox = useMemo(() => buildInbox(boards.filter(isMyBoard), details, me, now), [boards, details, me, now]);
  const actionFor = useCardAction();
  const hideInvite = useHideInvite(refresh);

  let delay = 0;
  const enter = () => ({ animationDelay: `${(delay++ * 45).toString()}ms` });

  const card = (g: GameSummary) => {
    const model = cardModel(g, now);
    const s = details[g.id];
    const buzz = model.buzz && s ? boardBuzz(s, me, now) : null;
    return (
      <div key={g.id} className="home-enter" style={enter()}>
        <BoardCard
          game={g}
          model={model}
          now={now}
          buzz={buzz}
          buzzIsNew={!!buzz && buzz.at >= openedAt}
          action={model.action ? actionFor(g, model.action.kind, model.action.label, g.id === primaryId) : undefined}
        />
      </div>
    );
  };

  const inviteCard = (g: GameSummary) => (
    <div key={g.id} className="home-enter" style={enter()}>
      <InviteCard
        game={g}
        model={inviteModel(g, now)}
        primary={g.id === primaryId}
        onPick={actionFor(g, "pick", "Pick squares", false).onClick}
        onHide={() => hideInvite(g)}
      />
    </div>
  );

  return (
    <>
      <HomeHeader
        name={profile.name}
        headline={headline}
        pulse={winPulse}
        trailing={<ActivityBell items={inbox} now={now} focusGameId={focus?.id ?? null} />}
      />

      <PullIndicator pull={pull} refreshing={refreshing} />

      <div
        className="flex flex-col gap-6 px-safe transition-transform duration-300 ease-out-quint"
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

        {sections.invites.length > 0 && (
          <section aria-labelledby="home-invites" data-testid="home-invites">
            <SectionHeader
              id="home-invites"
              icon={<MailIcon size={14} strokeWidth={2.4} className="text-ink-accent" />}
              title="Invites"
              tone="accent"
              count={sections.invites.length}
            />
            <div className="flex flex-col gap-3">{sections.invites.map(inviteCard)}</div>
          </section>
        )}

        {sections.needs.length > 0 && (
          <section aria-labelledby="home-needs">
            <SectionHeader id="home-needs" title="Needs you" tone="brand" count={sections.needs.length} />
            <div className="flex flex-col gap-3">{sections.needs.map(card)}</div>
          </section>
        )}

        {sections.next.length > 0 && (
          <section aria-labelledby="home-next">
            <SectionHeader id="home-next" title="Up next" count={sections.next.length} />
            <div className="flex flex-col gap-3">{sections.next.map(card)}</div>
          </section>
        )}

        {sections.live.length + sections.invites.length + sections.needs.length + sections.next.length === 0 && (
          <section aria-labelledby="home-quiet" className="home-enter flex items-center gap-3 rounded-card bg-surface-2 py-3 pl-2 pr-4 ring-1 ring-inset ring-line" style={enter()}>
            <Jax pose="sleep" size={116} />
            <div className="min-w-0 flex-1">
              <h2 id="home-quiet" className="font-display text-headline font-extrabold text-ink">
                All quiet
              </h2>
              <p className="text-footnote text-ink-muted">Jax is napping till the next kickoff.</p>
              <Link
                to="/new"
                onClick={() => void haptic("light")}
                className={buttonStyles({ size: "sm", variant: "secondary", className: "mt-2.5" })}
              >
                Start the next board
              </Link>
            </div>
          </section>
        )}

        {sections.final.length > 0 && (
          <section aria-labelledby="home-final" className="home-enter" style={enter()}>
            <SectionHeader id="home-final" title="Final" count={sections.final.length} />
            <FinalList games={sections.final} details={details} me={me} onExpand={(all) => setFinalsShown(all ? sections.final.length : FINALS_COLLAPSED)} />
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
          className="pressable mx-auto flex min-h-11 items-center gap-1.5 rounded-full px-4 py-2 text-subhead font-bold text-ink-muted hover:text-ink"
        >
          Have a code? <span className="text-ink-brand">Join a board</span>
          <ArrowRightIcon size={16} strokeWidth={2.6} className="text-ink-brand" />
        </button>
      </div>

      <JoinCodeSheet open={joining} onClose={() => setJoining(false)} />
      <JaxCheer play={cheer} />
    </>
  );
}

/**
 * Each card's one action. Deep links take the host straight to the step:
 * the draw confirm (?draw=1) or checkout (?checkout=1).
 */
function useCardAction() {
  const navigate = useNavigate();
  const toast = useToast();
  return useCallback(
    (game: GameSummary, kind: BoardAction, label: string, primary: boolean): CardAction => {
      switch (kind) {
        case "invite":
          return {
            label,
            primary,
            icon: <ShareIcon size={16} strokeWidth={2.4} />,
            onClick: () =>
              void shareLink({
                title: game.name,
                text: `Grab a square on ${game.name}: ${game.teamX.name} vs ${game.teamY.name}`,
                url: inviteUrl(game.id),
              }).then((outcome) => {
                if (outcome === "copied") toast.success("Invite link copied", "Paste it in the group chat.");
              }),
          };
        case "lock":
          return { label, primary, onClick: () => navigate(`/g/${game.id}?draw=1`) };
        case "finish-setup":
          return { label, primary, onClick: () => navigate(`/g/${game.id}?checkout=1`) };
        default:
          return { label, primary, onClick: () => navigate(`/g/${game.id}`) };
      }
    },
    [navigate, toast],
  );
}

/**
 * "Not for me" on an invite I only opened: it leaves the seen list (so Home
 * stops showing it at once, see homeBoards) with an Undo that puts it back.
 * The invite link itself still works.
 */
function useHideInvite(refresh: () => Promise<void>) {
  const toast = useToast();
  return useCallback(
    (game: GameSummary) => {
      forgetSeen(game.id);
      toast.show({
        id: `hide-invite-${game.id}`,
        title: "Invite hidden",
        description: `${game.name} is off your Home. The link still works.`,
        haptic: false,
        duration: 6000,
        action: {
          label: "Undo",
          onClick: () => {
            rememberSeen(game.id);
            // In case a refresh since then left the board out.
            void refresh();
          },
        },
      });
    },
    [toast, refresh],
  );
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
 * Confetti when one of your squares wins while you're looking at Home (wins
 * already on the board when Home opened stay quiet, and the board's
 * per-device ledger means a win is celebrated once, here or there). With the
 * headline on screen it takes the news (no toast saying it twice); scrolled
 * away, a toast carries it in plain words. Either way Jax pops up to cheer.
 */
function useWinCelebration(boards: GameSummary[], states: Readonly<Record<string, GameState>>, onHeadline: () => void, onCheer: () => void) {
  const toast = useToast();
  const navigate = useNavigate();
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;
  const statesRef = useRef(states);
  statesRef.current = states;
  const onHeadlineRef = useRef(onHeadline);
  onHeadlineRef.current = onHeadline;
  const onCheerRef = useRef(onCheer);
  onCheerRef.current = onCheer;
  const seen = useRef<Set<string> | null>(null);

  const announce = useCallback(
    (game: GameSummary, win: { periodKey: string; label: string }) => {
      void haptic("success");
      void celebrate("win");
      onCheerRef.current();
      if (typeof window !== "undefined" && window.scrollY < 120) {
        onHeadlineRef.current();
        return;
      }
      const s = statesRef.current[game.id];
      const score = s?.scores.find((x) => x.periodKey === win.periodKey) ?? null;
      const reverse = win.label.endsWith("(reverse)");
      toast.show({
        tone: "win",
        title: `Your ${reverse ? "reverse " : ""}square hit ${phraseOf(win.periodKey, win.label).moment}!`,
        description: score ? `${game.name} · ${scoreWithTeams(game, score.scoreX, score.scoreY)}` : game.name,
        action: { label: "See it", onClick: () => navigateRef.current(`/g/${game.id}`) },
      });
    },
    [toast],
  );

  useEffect(() => {
    const wins = boards.flatMap((g) => winIds(g).map((id) => ({ key: `${g.id}|${id}`, id, game: g })));
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
    const win = first.game.myWins.find((m) => winId(m) === first.id) ?? { periodKey: first.id, label: first.id };
    announce(first.game, win);
  }, [boards, announce]);
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
