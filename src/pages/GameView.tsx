// The board screen (/g/:id): live scoreboard, the squares grid, claiming
// (with the newcomer join-and-claim shortcut), results, players and activity.
// Board state comes from useGame (socket + polling + optimistic patches).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { cellKey, countClaimedBy, drawFor, gridSize, liveCell, resolveResults, upcomingPeriod } from "../../shared/squares";
import type { Activity, GameState } from "../../shared/types";
import { GridIcon, SearchIcon, ShareIcon, TrophyIcon, WifiOffIcon, XIcon } from "../components/icons";
import { useHideTabBar } from "../components/shell";
import {
  ActionBar,
  Avatar,
  Button,
  EmptyState,
  IconButton,
  SegmentedControl,
  Skeleton,
  TopBar,
  celebrate,
  cx,
  useToast,
} from "../components/ui";
import { ActivityFeed } from "../features/board/ActivityFeed";
import { Board } from "../features/board/Board";
import {
  EMPTY_SELECTION,
  applyTap,
  axisLabels,
  boardPhase,
  buildCells,
  cellsOf,
  decideTap,
  defaultDrawKey,
  lostToOthers,
  drawTabs,
  headlineScore,
  myNumbers,
  myWinIds,
  periodCards,
  playerRows,
  pruneSelection,
  squaresLeftFor,
  type Selection,
} from "../features/board/boardModel";
import { PlayersList } from "../features/board/PlayersList";
import { ResultsStrip } from "../features/board/ResultsStrip";
import { Scorebug } from "../features/board/Scorebug";
import { celebratedWins, markCelebrated, markNotifyAsked, notifyAsked } from "../features/board/storage";
import { useNow } from "../features/board/useNow";
import { HostControls } from "../features/host/HostControls";
import { InviteHero } from "../features/invite/InviteHero";
import { InviteSheet } from "../features/invite/InviteSheet";
import { JoinSheet } from "../features/invite/JoinSheet";
import { describeActivity } from "../features/notifications/activity";
import { NotifyPrompt } from "../features/notifications/NotifyPrompt";
import { api, errorMessage, inviteUrl } from "../lib/api";
import { pluralize, teamVars } from "../lib/format";
import { getPlayerId, isHostOf } from "../lib/identity";
import { claimPatch, releasePatch, useGame } from "../lib/live";
import { haptic, shareLink } from "../lib/native";
import { getPushState } from "../lib/push";

type Cell = { row: number; col: number };
type Spotlight = { kind: "period" | "cell"; id: string };

export default function GameView() {
  const id = useParams().id?.toLowerCase();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const me = getPlayerId();
  const now = useNow();
  useHideTabBar();

  // ---- live activity -> toasts ----
  const lastBurst = useRef(0);
  const celebrateOnce = useCallback((kind: "win" | "pop" | "cannons" = "win") => {
    const t = Date.now();
    if (t - lastBurst.current < 2500) return;
    lastBurst.current = t;
    void celebrate(kind);
  }, []);

  const onActivity = useCallback(
    (a: Activity, s: GameState) => {
      let ann: ReturnType<typeof describeActivity> = null;
      try {
        ann = describeActivity(a, s, me);
      } catch {
        ann = null;
      }
      if (!ann) return;
      const actor = a.actor ? s.players.find((p) => p.id === a.actor) : undefined;
      toast.show({
        id: `activity-${a.type}`,
        title: ann.text,
        tone: ann.tone === "win" ? "win" : ann.tone === "live" ? "live" : a.type === "joined" || a.type === "claimed" ? "social" : "neutral",
        icon: actor && a.type !== "winner" ? <Avatar name={actor.name} color={actor.color} emoji={actor.emoji} size="sm" decorative /> : undefined,
        haptic: ann.haptic ?? false,
      });
      if (ann.celebrate) celebrateOnce("win");
    },
    [me, toast, celebrateOnce],
  );

  const { state, loading, notFound, error, connection, watching, mutate, receive, refresh } = useGame(id, { onActivity });

  // ---- local UI state ----
  const [selection, setSelection] = useState<Selection>(EMPTY_SELECTION);
  const selectionRef = useRef(selection);
  selectionRef.current = selection;
  const [joinOpen, setJoinOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  // True when the invite sheet was opened by the create flow right after checkout.
  const [justCreated, setJustCreated] = useState(false);
  const [notifyOpen, setNotifyOpen] = useState(false);
  const [zoom, setZoom] = useState(false);
  const [spot, setSpot] = useState<Spotlight | null>(null);
  const [drawPick, setDrawPick] = useState<string | null>(null);
  const [pick, setPick] = useState<{ prompt: string } | null>(null);
  const pickResolve = useRef<((cell: Cell | null) => void) | null>(null);
  const [busy, setBusy] = useState(false);
  const [freshWin, setFreshWin] = useState(false);
  const hadState = useRef(false);
  const boardRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  if (state) hadState.current = true;

  // ---- derived ----
  const game = state?.game ?? null;
  const results = useMemo(() => (state ? resolveResults(state) : []), [state]);
  const cells = useMemo(() => (state ? buildCells({ state, me, selection, results }) : []), [state, me, selection, results]);
  const joined = !!state?.players.some((p) => p.id === me);
  const mineCount = state ? countClaimedBy(state.squares, me) : 0;
  const isHost = !!game && (isHostOf(game.id) || game.hostPlayerId === me);
  const phase = state ? boardPhase(state) : "open";
  const drawKey = state ? (drawPick && state.game.numbers?.[drawPick] ? drawPick : defaultDrawKey(state)) : "*";
  const axis = useMemo(
    () => (game ? axisLabels(drawFor(game, drawKey), gridSize(game.format.boardSize)) : { x: [], y: [], drawn: false }),
    [game, drawKey],
  );
  const tabs = game ? drawTabs(game) : [];
  const cards = useMemo(() => (state ? periodCards(state, results) : []), [state, results]);
  const rows = useMemo(() => (state ? playerRows(state, results, me) : []), [state, results, me]);
  const winIds = useMemo(() => myWinIds(results, me), [results, me]);
  const live = state && state.game.status !== "final" ? liveCell(state) : null;
  const next = state ? upcomingPeriod(state) : null;
  const numbers = state && axis.drawn ? myNumbers(state, me, drawKey) : [];

  const spotlight = useMemo<ReadonlySet<string> | null>(() => {
    if (!spot) return null;
    if (spot.kind === "cell") return new Set([spot.id]);
    const r = results.find((x) => x.periodKey === spot.id);
    if (!r) return null;
    const keys = new Set<string>();
    if (r.cell) keys.add(cellKey(r.cell.row, r.cell.col));
    if (r.reverseCell) keys.add(cellKey(r.reverseCell.row, r.reverseCell.col));
    return keys.size ? keys : null;
  }, [spot, results]);

  // ---- effects ----

  // Squares someone else just took (or a lock) fall out of the selection.
  useEffect(() => {
    if (!state) return;
    const cur = selectionRef.current;
    const next = pruneSelection(cur, state, me);
    if (next === cur) return;
    if (state.game.status === "open" && lostToOthers(cur, state, me) > 0) {
      toast.show({ id: "taken", title: "Someone just grabbed one of your picks", tone: "neutral", haptic: "warning" });
    }
    setSelection(next);
  }, [state, me, toast]);

  // ?invite=1 (the create flow lands here after checkout): open the invite sheet once.
  useEffect(() => {
    if (params.get("invite") !== "1") return;
    setJustCreated(true);
    setInviteOpen(true);
    const nextParams = new URLSearchParams(params);
    nextParams.delete("invite");
    setParams(nextParams, { replace: true });
  }, [params, setParams]);

  // My square won: confetti, a buzz and the gold banner, once per win per device.
  useEffect(() => {
    if (!game || winIds.length === 0) return;
    const seen = celebratedWins(game.id);
    const fresh = winIds.filter((w) => !seen.has(w));
    if (fresh.length === 0) return;
    markCelebrated(game.id, fresh);
    setFreshWin(true);
    void haptic("success");
    celebrateOnce("win");
  }, [game, winIds, celebrateOnce]);

  // Once the scoreboard scrolls away, the top bar carries the score.
  const [scoreHidden, setScoreHidden] = useState(false);
  const scoreRef = useRef<HTMLDivElement>(null);
  const hasState = !!state;
  useEffect(() => {
    const el = scoreRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setScoreHidden(!e.isIntersecting), { rootMargin: "-56px 0px 0px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [hasState]);

  // A spotlight is a moment, not a mode: it fades back to the full board.
  useEffect(() => {
    if (!spot) return;
    const t = setTimeout(() => setSpot(null), 5000);
    return () => clearTimeout(t);
  }, [spot]);

  // The live square just moved onto one of mine: a buzz and a heads-up (once per move).
  const liveKey = live ? `${live.periodKey}:${live.cell.row},${live.cell.col}` : null;
  const liveMine = !!live && live.playerId === me;
  // undefined until the first state is seen, so opening the board mid-game doesn't buzz.
  const lastLive = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (!hasState) return;
    const prev = lastLive.current;
    lastLive.current = liveKey;
    if (prev === undefined || !liveKey || !liveMine || prev === liveKey) return;
    void haptic("heavy");
    toast.show({
      id: "live-mine",
      tone: "live",
      title: "Your square is live!",
      description: "If the period ended right now, it's yours.",
      haptic: false,
    });
  }, [hasState, liveKey, liveMine, toast]);

  // Leaving pick mode if the component unmounts mid-pick.
  useEffect(() => () => pickResolve.current?.(null), []);

  // ---- actions ----

  const scrollToBoard = useCallback(() => {
    boardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);

  const maybeAskNotify = useCallback(() => {
    if (!id || notifyAsked(id)) return;
    void getPushState()
      .then((st) => {
        if (st !== "default" && st !== "needs-install") return;
        markNotifyAsked(id);
        setTimeout(() => setNotifyOpen(true), 1200);
      })
      .catch(() => {});
  }, [id]);

  const claim = useCallback(
    async (cellsToClaim: Cell[]) => {
      if (!id || cellsToClaim.length === 0) return;
      void haptic("medium");
      const before = stateRef.current;
      const firstSquares = !!before && countClaimedBy(before.squares, getPlayerId()) === 0;
      try {
        const res = await mutate(() => api.claim(id, cellsToClaim), claimPatch(getPlayerId(), cellsToClaim));
        if (res.claimed > 0) {
          void haptic("success");
          void celebrate("pop", { origin: { x: 0.5, y: 0.82 } });
          if (firstSquares) {
            toast.show({
              id: "claimed",
              tone: "success",
              title: "You're on the board!",
              description: res.claimed === 1 ? "Your square glows volt. Numbers get drawn at lock." : "Your squares glow volt. Numbers get drawn at lock.",
              haptic: false,
            });
          }
          maybeAskNotify();
        }
        if (res.skipped > 0) {
          toast.show({
            id: "skipped",
            tone: "neutral",
            title: res.claimed === 0 ? "Those squares just got taken" : `${pluralize(res.skipped, "square")} got taken first`,
            description: "Pick another open square.",
          });
        }
      } catch (err) {
        // Put the picks back so a retry is one tap (squares taken meanwhile get pruned).
        setSelection((prev) => ({
          claim: new Set([...prev.claim, ...cellsToClaim.map((c) => cellKey(c.row, c.col))]),
          release: prev.release,
        }));
        toast.error(errorMessage(err));
      }
    },
    [id, mutate, toast, maybeAskNotify],
  );

  const release = useCallback(
    async (cellsToRelease: Cell[]) => {
      if (!id || cellsToRelease.length === 0) return;
      try {
        await mutate(() => api.release(id, cellsToRelease), releasePatch(getPlayerId(), cellsToRelease));
        void haptic("light");
      } catch (err) {
        toast.error(errorMessage(err));
      }
    },
    [id, mutate, toast],
  );

  const submit = useCallback(async () => {
    const sel = selectionRef.current;
    if (!joined) {
      setJoinOpen(true);
      return;
    }
    const toClaim = cellsOf(sel.claim);
    const toRelease = cellsOf(sel.release);
    setSelection(EMPTY_SELECTION);
    setBusy(true);
    try {
      await release(toRelease);
      await claim(toClaim);
    } finally {
      setBusy(false);
    }
  }, [joined, claim, release]);

  const onJoined = useCallback(
    (fresh: GameState) => {
      receive(fresh);
      setJoinOpen(false);
      const picked = cellsOf(selectionRef.current.claim);
      setSelection(EMPTY_SELECTION);
      if (picked.length > 0) void claim(picked);
      else toast.success("You're in!", "Tap any open square to claim it.");
    },
    [receive, claim, toast],
  );

  // A sheet may close itself right before reporting the join; let onJoined win.
  const onJoinClose = useCallback(() => {
    setTimeout(() => setJoinOpen(false), 0);
  }, []);

  const pickCell = useCallback(
    (prompt: string) =>
      new Promise<Cell | null>((resolve) => {
        pickResolve.current?.(null);
        pickResolve.current = resolve;
        setPick({ prompt });
        setSelection(EMPTY_SELECTION);
        setSpot(null);
        setTimeout(scrollToBoard, 50);
      }),
    [scrollToBoard],
  );

  // Dev only: lets the screenshot harness drive pick mode before HostControls calls it.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const w = window as unknown as { __jxPickCell?: typeof pickCell };
    w.__jxPickCell = pickCell;
    return () => {
      delete w.__jxPickCell;
    };
  }, [pickCell]);

  const endPick = useCallback((cell: Cell | null) => {
    const resolve = pickResolve.current;
    pickResolve.current = null;
    setPick(null);
    resolve?.(cell);
  }, []);

  const cellsRef = useRef(cells);
  cellsRef.current = cells;
  const pickingRef = useRef(false);
  pickingRef.current = pick !== null;

  const onTap = useCallback(
    (row: number, col: number, el: HTMLButtonElement) => {
      const s = stateRef.current;
      const cell = cellsRef.current[row]?.[col];
      if (!s || !cell) return;
      if (pickingRef.current) {
        void haptic("medium");
        endPick({ row, col });
        return;
      }
      setSpot(null);
      const sel = selectionRef.current;
      const isJoined = s.players.some((p) => p.id === me);
      const outcome = decideTap({
        status: s.game.status,
        cell,
        selection: sel,
        maxPerPlayer: s.game.maxPerPlayer,
        mineCount: countClaimedBy(s.squares, me),
      });

      if (outcome.kind === "limit") {
        void haptic("warning");
        el.classList.remove("jx-nope");
        void el.offsetWidth;
        el.classList.add("jx-nope");
        toast.show({
          id: "limit",
          title: `Up to ${outcome.max} squares each`,
          description: "Tap one of yours to let it go, then pick another.",
          tone: "neutral",
          haptic: false,
        });
        return;
      }
      if (outcome.kind === "inspect") {
        inspectRef.current(cell, s);
        return;
      }
      void haptic("selection");
      const nextSel = applyTap(sel, cell.key, outcome);
      setSelection(nextSel);
      // Newcomer: the first pick opens the join sheet straight away (link -> square -> Join & claim).
      if (!isJoined && outcome.kind === "select" && sel.claim.size === 0) setJoinOpen(true);
    },
    [me, endPick, toast],
  );

  // Read through a ref so the memoized tap handler always sees the current axes.
  const inspectRef = useRef(inspect);
  inspectRef.current = inspect;

  function inspect(cell: (typeof cells)[number][number], s: GameState) {
    if (s.game.status === "draft") {
      toast.show({ id: "cell", title: "This board isn't open yet", tone: "neutral", haptic: false, duration: 2200 });
      return;
    }
    if (!cell.ownerId) {
      toast.show({
        id: "cell",
        title: s.game.status === "open" ? "Open square" : "Nobody took this one",
        tone: "neutral",
        haptic: false,
        duration: 1800,
      });
      return;
    }
    const owner = cell.owner;
    const where = axis.drawn
      ? `${s.game.teamX.abbr || s.game.teamX.name} ${axis.x[cell.col]} · ${s.game.teamY.abbr || s.game.teamY.name} ${axis.y[cell.row]}`
      : "Numbers drawn when the board locks";
    const won = cell.wins.length ? ` · Won ${cell.wins.map((w) => w.label).join(", ")}` : "";
    void haptic("light");
    toast.show({
      id: "cell",
      title: cell.mine ? "Your square" : `${owner?.name ?? "Someone"}'s square`,
      description: where + won,
      icon: owner ? <Avatar name={owner.name} color={owner.color} emoji={owner.emoji} size="sm" decorative /> : undefined,
      tone: cell.wins.length ? "win" : "neutral",
      haptic: false,
      duration: 2200,
    });
  }

  const share = useCallback(() => setInviteOpen(true), []);

  const brag = useCallback(async () => {
    if (!state) return;
    const won = new Set(myWinIds(results, me).map((w) => w.split(":")[0]));
    const label = results.filter((r) => won.has(r.periodKey)).at(-1)?.label ?? "a square";
    const outcome = await shareLink({
      title: state.game.name,
      text: `My square just hit for ${label} on ${state.game.name} 🏆`,
      url: inviteUrl(state.game.id),
    });
    if (outcome === "copied") toast.success("Link copied", "Paste it in the group chat.");
  }, [state, results, me, toast]);

  // ---- render: not found / deleted / error / loading ----

  if (notFound) {
    const deleted = hadState.current;
    return (
      <>
        <TopBar title="Board" large={false} back />
        <EmptyState
          art={deleted ? "🧹" : "🧐"}
          title={deleted ? "This board was deleted" : "Board not found"}
          description={deleted ? "The host took this board down. Squares and results are gone with it." : "This link may be old, or the host deleted the board."}
          action={
            <Button size="lg" block onClick={() => navigate("/", { replace: true })}>
              Back to my boards
            </Button>
          }
        />
      </>
    );
  }

  if (!state || !game) {
    return (
      <>
        <TopBar title="Board" large={false} back />
        {error && !loading ? (
          <EmptyState
            art={<WifiOffIcon />}
            title="Couldn't load this board"
            description={error.message}
            action={
              <Button size="lg" block onClick={() => void refresh()}>
                Try again
              </Button>
            }
          />
        ) : (
          <BoardSkeleton />
        )}
      </>
    );
  }

  // ---- render: the board ----

  const open = game.status === "open";
  const newcomer = !joined && open;
  const n = gridSize(game.format.boardSize);
  const claimN = selection.claim.size;
  const releaseN = selection.release.size;
  const left = squaresLeftFor(game.maxPerPlayer, mineCount);
  const showBar = !pick && !joinOpen && open && claimN + releaseN > 0;
  const liveOwner = live?.playerId ? state.players.find((p) => p.id === live.playerId) ?? null : null;
  const liveNow = live
    ? {
        owner: liveOwner,
        mine: live.playerId === me,
        label:
          game.format.periods === "every-score"
            ? "the next score"
            : (game.periods.find((p) => p.key === live.periodKey)?.label ?? "this period"),
      }
    : null;
  const firstMine = state.squares.find((s) => s.playerId === me);
  const focusKey =
    [...selection.claim][0] ??
    (live ? cellKey(live.cell.row, live.cell.col) : null) ??
    (firstMine ? cellKey(firstMine.row, firstMine.col) : null);
  const myWinResults = results.filter((r) => r.winnerPlayerId === me || r.reverseWinnerPlayerId === me);
  const headline = headlineScore(state);
  const abbr = (t: typeof game.teamX) => t.abbr || t.name;
  const compactTitle =
    scoreHidden && headline && phase !== "open" && phase !== "draft"
      ? `${abbr(game.teamX)} ${headline.scoreX}–${headline.scoreY} ${abbr(game.teamY)}${phase === "live" ? ` · ${headline.detail}` : phase === "final" ? " · Final" : ""}`
      : null;
  const sectionTitle = "eyebrow mb-2 px-1 text-ink-subtle";

  return (
    <div style={teamVars(game.teamX, game.teamY)} className="flex flex-1 flex-col">
      <TopBar
        title={compactTitle ?? game.name}
        large={false}
        back
        trailing={<IconButton label="Invite friends" icon={<ShareIcon size={22} />} onClick={share} haptic="light" />}
      />

      <div className="flex flex-col gap-4 px-safe pt-1">
        {connection === "offline" && (
          <p className="flex items-center gap-2 rounded-2xl bg-danger-500/12 px-3.5 py-2.5 text-footnote font-semibold text-danger-300 ring-1 ring-inset ring-danger-500/30">
            <WifiOffIcon size={16} />
            You're offline. Showing the last update.
          </p>
        )}

        {/* A newcomer gets the invite hero (matchup, who's in, squares left) in place of the scoreboard. */}
        <div ref={scoreRef}>
          {newcomer ? (
            <InviteHero state={state} watching={watching} onJoin={() => setJoinOpen(true)} />
          ) : (
            <Scorebug state={state} watching={watching} connection={connection} nextLabel={next?.label ?? null} now={now} />
          )}
        </div>

        {myWinResults.length > 0 && (
          <WinBanner
            labels={myWinResults.map((r) => r.label)}
            prize={myWinResults[myWinResults.length - 1].prize}
            fresh={freshWin}
            onBrag={() => void brag()}
            onShow={() => {
              const last = myWinResults[myWinResults.length - 1];
              setSpot({ kind: "period", id: last.periodKey });
              scrollToBoard();
            }}
          />
        )}

        {isHost && (
          <div className="empty:hidden">
            <HostControls state={state} apply={receive} pickCell={pickCell} onInvite={share} />
          </div>
        )}

        {game.status === "draft" && (
          <p className="rounded-2xl bg-surface-2 px-4 py-3 text-subhead text-ink-muted ring-1 ring-inset ring-line">
            {isHost ? "Finish checkout to open this board for squares." : "The host is still setting this board up. Check back in a bit."}
          </p>
        )}

        {/* ---- the grid ---- */}
        <section ref={boardRef} aria-label="Squares" className="-mx-2 scroll-mt-24">
          {!newcomer && !pick && (
            <div className="mb-2 flex min-h-6 items-center gap-2 px-3 text-footnote leading-snug text-ink-muted">
              <BoardHint phase={phase} joined={joined} mineCount={mineCount} left={left} liveNow={liveNow} nextLabel={next?.label ?? null} />
            </div>
          )}

          {tabs.length > 1 && (
            <div className="mb-3 px-2">
              <SegmentedControl
                size="sm"
                aria-label="Numbers for period"
                options={tabs.map((t) => ({ value: t.key, label: t.label }))}
                value={drawKey}
                onChange={setDrawPick}
              />
            </div>
          )}

          {pick && (
            <div className="mx-2 mb-3 flex items-center gap-3 rounded-2xl bg-gold-400 px-3.5 py-2.5 text-ink-inverse shadow-glow-gold animate-pop">
              <TrophyIcon size={18} filled className="shrink-0" />
              <p className="min-w-0 flex-1 text-subhead font-extrabold leading-snug">{pick.prompt}</p>
              <button
                type="button"
                onClick={() => endPick(null)}
                className="pressable shrink-0 rounded-full bg-black/15 px-3 py-1.5 text-footnote font-extrabold"
              >
                Cancel
              </button>
            </div>
          )}

          <div className={cx("rounded-[1.1rem] px-2", pick && "outline-2 outline-offset-2 outline-gold-400/80 outline-dashed")}>
            <Board
              game={game}
              cells={cells}
              axis={axis}
              open={open}
              zoom={zoom && n > 5}
              spotlight={spotlight}
              picking={!!pick}
              final={game.status === "final"}
              focusKey={focusKey}
              onTap={onTap}
              accessory={
                n > 5 && !pick ? (
                  <button
                    type="button"
                    onClick={() => {
                      void haptic("selection");
                      setZoom((z) => !z);
                    }}
                    aria-pressed={zoom}
                    aria-label={zoom ? "Fit the whole board" : "Zoom in on the board"}
                    className={cx(
                      "pressable tap-target flex h-7 shrink-0 items-center gap-1 rounded-full px-2.5 text-caption font-extrabold ring-1 ring-inset",
                      zoom ? "bg-brand-400 text-ink-inverse ring-brand-400" : "bg-surface-3 text-ink ring-line-strong",
                    )}
                  >
                    {zoom ? <GridIcon size={13} /> : <SearchIcon size={13} />}
                    {zoom ? "Fit" : "Zoom"}
                  </button>
                ) : undefined
              }
            />
          </div>

          {numbers.length > 0 && (
            <div className="mt-3 px-2">
              <div className="mb-2 flex items-center justify-between gap-2 px-1">
                <p className="eyebrow text-ink-subtle">Your numbers</p>
                <p className="flex items-center gap-2.5 text-caption font-bold text-ink-muted">
                  <span className="flex items-center gap-1">
                    <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-team-x" />
                    {game.teamX.abbr || game.teamX.name}
                  </span>
                  <span className="flex items-center gap-1">
                    <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-team-y" />
                    {game.teamY.abbr || game.teamY.name}
                  </span>
                </p>
              </div>
              <div className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4">
                {numbers.map((nb) => {
                  const key = cellKey(nb.row, nb.col);
                  const on = spot?.kind === "cell" && spot.id === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      aria-pressed={on}
                      onClick={() => {
                        void haptic("selection");
                        setSpot(on ? null : { kind: "cell", id: key });
                      }}
                      className={cx(
                        "pressable flex h-9 shrink-0 items-center gap-1.5 rounded-full pl-1 pr-3 font-display text-subhead font-extrabold tabular-nums ring-1 ring-inset",
                        on ? "bg-brand-400 text-ink-inverse ring-brand-400" : "bg-surface-2 text-ink ring-line-strong",
                      )}
                    >
                      <span className="grid h-7 min-w-7 place-items-center rounded-full bg-team-x px-1.5 text-team-x-ink">{nb.x}</span>
                      <span className="grid h-7 min-w-7 place-items-center rounded-full bg-team-y px-1.5 text-team-y-ink">{nb.y}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </section>

        {/* ---- results ---- */}
        {cards.length > 0 && (
          <section aria-label="Results">
            <p className={sectionTitle}>{phase === "open" || phase === "draft" ? "What's up for grabs" : "Winners"}</p>
            <ResultsStrip
              cards={cards}
              players={state.players}
              me={me}
              teamX={game.teamX}
              teamY={game.teamY}
              reverse={game.format.reverse}
              predraw={!game.numbers}
              liveNow={live && state.live ? { playerId: live.playerId, scoreX: state.live.scoreX, scoreY: state.live.scoreY } : null}
              selectedKey={spot?.kind === "period" ? spot.id : null}
              grid={game.format.periods !== "every-score"}
              onSelect={(key) => {
                void haptic("selection");
                setSpot(key ? { kind: "period", id: key } : null);
                // Fresh numbers: show the digits that decided that period.
                if (key && game.numbers?.[key]) setDrawPick(key);
                if (key) scrollToBoard();
              }}
            />
          </section>
        )}

        {/* ---- players ---- */}
        <section aria-label="Players">
          <p className={sectionTitle}>
            Players · {state.players.length}
          </p>
          <PlayersList rows={rows} total={state.players.length} hostId={game.hostPlayerId} />
        </section>

        {/* ---- activity ---- */}
        {state.activity.length > 0 && (
          <section aria-label="Activity">
            <p className={sectionTitle}>Activity</p>
            <ActivityFeed state={state} me={me} now={now} />
          </section>
        )}
      </div>

      {showBar && (
        <ActionBar>
          <div className="glass rounded-[1.375rem] p-2 shadow-float ring-1 ring-inset ring-line-strong">
            <div className="flex items-center gap-2">
              <IconButton
                label="Clear selection"
                icon={<XIcon size={20} />}
                variant="solid"
                size="lg"
                className="!h-14 !w-14 !rounded-[1.125rem]"
                onClick={() => {
                  void haptic("light");
                  setSelection(EMPTY_SELECTION);
                }}
              />
              {releaseN > 0 && (
                <Button
                  variant={claimN > 0 ? "secondary" : "danger"}
                  size="lg"
                  className={claimN > 0 ? "shrink-0" : "flex-1"}
                  disabled={busy}
                  onClick={() => void submit()}
                >
                  Release {releaseN}
                </Button>
              )}
              {claimN > 0 && (
                <Button data-testid="claim-submit" size="lg" className="min-w-0 flex-1" loading={busy} onClick={() => void submit()}>
                  {joined ? `Claim ${pluralize(claimN, "square")}` : `Join & claim ${claimN}`}
                </Button>
              )}
            </div>
            {left !== null && claimN > 0 && (
              <p className="px-2 pt-1.5 text-center text-caption font-semibold text-ink-muted">
                {left - claimN <= 0 ? `That's your max of ${game.maxPerPlayer}` : `${left - claimN} more after this (max ${game.maxPerPlayer})`}
              </p>
            )}
          </div>
        </ActionBar>
      )}

      <InviteSheet
        state={state}
        open={inviteOpen}
        watching={watching}
        justCreated={justCreated}
        onClose={() => {
          setInviteOpen(false);
          setJustCreated(false);
        }}
      />
      <JoinSheet state={state} open={joinOpen} onJoined={onJoined} onClose={onJoinClose} selectedCount={selection.claim.size} />
      <NotifyPrompt gameId={game.id} trigger="claimed" open={notifyOpen} onClose={() => setNotifyOpen(false)} />
    </div>
  );
}

interface LiveNow {
  owner: { name: string; color: string; emoji: string } | null;
  mine: boolean;
  label: string;
}

function BoardHint({
  phase,
  joined,
  mineCount,
  left,
  liveNow,
  nextLabel,
}: {
  phase: ReturnType<typeof boardPhase>;
  joined: boolean;
  mineCount: number;
  left: number | null;
  liveNow: LiveNow | null;
  nextLabel: string | null;
}) {
  if (phase === "draft") return <span>Squares open once the board is live.</span>;
  if (phase === "open") {
    if (!joined) return <b className="font-bold text-ink">Tap any open square to jump in.</b>;
    if (mineCount === 0) return <b className="font-bold text-ink">Tap open squares to pick yours.</b>;
    return (
      <span>
        <b className="font-bold text-brand-300">You have {mineCount}</b>
        {left !== null ? ` · ${left} left` : ""} · tap yours to let go
      </span>
    );
  }
  if (liveNow) {
    // Who the red ring belongs to: the live heartbeat of the board.
    return (
      <>
        <span aria-hidden className="relative flex h-2.5 w-2.5 shrink-0">
          <span className="absolute inset-0 animate-live rounded-full bg-live-500" />
          <span className="relative h-2.5 w-2.5 rounded-full bg-live-500" />
        </span>
        {liveNow.owner && (
          <Avatar name={liveNow.owner.name} color={liveNow.owner.color} emoji={liveNow.owner.emoji} size="xs" ring={liveNow.mine ? "brand" : "none"} decorative />
        )}
        <span className="min-w-0">
          {liveNow.mine ? (
            <>
              <b className="font-extrabold text-brand-300">You're winning {liveNow.label}</b> right now
            </>
          ) : liveNow.owner ? (
            <>
              <b className="font-bold text-ink">{liveNow.owner.name}</b> wins {liveNow.label} if it ended now
            </>
          ) : (
            <>Nobody has the <b className="font-bold text-live-400">red ring</b> square right now</>
          )}
        </span>
      </>
    );
  }
  if (phase === "final") return <span>Final. Gold squares took home the prizes.</span>;
  return mineCount > 0 ? (
    <span>
      <b className="font-bold text-brand-300">Your {mineCount === 1 ? "square glows" : `${mineCount} squares glow`}</b> volt.
      {nextLabel ? ` Good luck in ${nextLabel}!` : " Good luck!"}
    </span>
  ) : (
    <span>Numbers are drawn. Tap any square to see whose it is.</span>
  );
}

function WinBanner({
  labels,
  prize,
  fresh,
  onBrag,
  onShow,
}: {
  labels: string[];
  prize: string | null;
  fresh: boolean;
  onBrag: () => void;
  onShow: () => void;
}) {
  const list = [...new Set(labels)];
  const joinedLabels = list.join(" + ");
  const title = list.length === 1 ? `You won ${list[0]}!` : joinedLabels.length <= 12 ? `You won ${joinedLabels}!` : `You won ${list.length} times!`;
  if (!fresh) {
    // After the moment: a slim trophy shelf, so the board stays on screen.
    return (
      <section
        aria-label="Your wins"
        className="flex items-center gap-2.5 rounded-2xl bg-gold-400/12 py-1.5 pl-2 pr-1.5 ring-1 ring-inset ring-gold-400/40"
      >
        <button type="button" onClick={onShow} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-gold-400 text-ink-inverse">
            <TrophyIcon size={17} filled />
          </span>
          <span className="min-w-0 truncate text-subhead">
            <b className="font-extrabold text-gold-200">{title}</b>
            {prize && <span className="text-gold-300/80"> · {prize}</span>}
          </span>
        </button>
        <Button variant="gold" size="sm" onClick={onBrag} className="shrink-0">
          Brag
        </Button>
      </section>
    );
  }
  return (
    <section
      aria-label="Your wins"
      className="jx-shine jx-glory relative flex items-center gap-3 overflow-hidden rounded-card bg-[linear-gradient(140deg,var(--color-gold-300),var(--color-gold-500)_60%,var(--color-gold-600))] p-3.5 pr-3 text-ink-inverse shadow-glow-gold"
    >
      <button type="button" onClick={onShow} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-pitch-950 text-gold-300 shadow-[inset_0_1px_0_rgb(255_255_255/0.15)]">
          <TrophyIcon size={26} filled />
        </span>
        <span className="min-w-0">
          <span className="block font-display text-title-3 font-extrabold leading-tight">{title}</span>
          <span className="block truncate text-footnote font-semibold opacity-80">{prize ?? "Tap to see your square"}</span>
        </span>
      </button>
      <Button variant="secondary" size="sm" onClick={onBrag} className="shrink-0 !bg-pitch-950 !text-gold-200 ring-0">
        Brag
      </Button>
    </section>
  );
}

function BoardSkeleton() {
  return (
    <div className="flex flex-col gap-4 px-safe pt-1" aria-busy="true" aria-label="Loading board">
      <Skeleton className="h-[8.5rem] w-full rounded-card" />
      <Skeleton className="h-4 w-48" />
      <div className="-mx-2 grid grid-cols-[18px_minmax(0,1fr)] gap-1 p-1.5">
        <span />
        <Skeleton className="h-4 w-full rounded-md opacity-50" />
        <Skeleton className="h-full w-full rounded-md opacity-50" />
        <div className="grid grid-cols-10 gap-[3px]">
          {Array.from({ length: 100 }, (_, i) => (
            <Skeleton key={i} className="aspect-square rounded-[6px]" style={{ opacity: 0.35 + ((i * 7) % 10) / 30 }} />
          ))}
        </div>
      </div>
    </div>
  );
}
