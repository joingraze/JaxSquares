// The board screen (/g/:id): live scoreboard, the squares grid, claiming
// (with the newcomer join-and-claim shortcut), results, players and activity.
// Board state comes from useGame (socket + polling + optimistic patches).
//
// Mid-game the screen answers two questions first: who has this period if it
// ended now (the "Right now" card and the lit square), and how close am I.
// Board notices go to a bottom ticker or a callout on the square, never over
// the top bar or the scoreboard.
//
// The grid is what people came for: everything above it is a compact row, so
// the whole board is on the first screen of an iPhone in every state; the
// rest (find a player, my numbers, results, players, activity) sits below it.

import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type Ref } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { periodPhrase } from "../../shared/formats";
import { cellKey, countClaimedBy, drawFor, gridSize, resolveResults, upcomingPeriod } from "../../shared/squares";
import type { Activity, GameState } from "../../shared/types";
import { GridIcon, SearchIcon, ShareIcon, TrophyIcon, WifiOffIcon, XIcon } from "../components/icons";
import { useHideTabBar } from "../components/shell";
import { ActionBar, Avatar, Button, EmptyState, IconButton, SegmentedControl, Skeleton, TopBar, celebrate, cx, useToast } from "../components/ui";
import { ActivityFeed } from "../features/board/ActivityFeed";
import { Board, type BoardCallout } from "../features/board/Board";
import {
  EMPTY_SELECTION,
  applyTap,
  axisLabels,
  boardPhase,
  buildCells,
  cellsOf,
  decideTap,
  defaultDrawKey,
  drawKeyOf,
  lostToOthers,
  drawTabs,
  mineAfter,
  headlineScore,
  myNumbers,
  myWinIds,
  nowSentence,
  periodCards,
  playerRows,
  pruneSelection,
  rightNow,
  squaresLeftFor,
  type Selection,
} from "../features/board/boardModel";
import { MySquares } from "../features/board/MySquares";
import { PlayerFinder } from "../features/board/PlayerFinder";
import { PlayersList } from "../features/board/PlayersList";
import { ResultsStrip } from "../features/board/ResultsStrip";
import { RightNow } from "../features/board/RightNow";
import { Scorebug } from "../features/board/Scorebug";
import { celebratedWins, markCelebrated } from "../features/board/storage";
import { Ticker } from "../features/board/Ticker";
import { useTicker } from "../features/board/useTicker";
import { useNow } from "../features/board/useNow";
import { HostControls, loadHostTools } from "../features/host/hostTools";
import { InviteHero } from "../features/invite/InviteHero";
import { JoinedCard } from "../features/invite/JoinedCard";
import { boardAlert } from "../features/notifications/alerts";
import { alertTickerNote } from "../features/notifications/BoardAlert";
import { api, errorMessage, inviteUrl } from "../lib/api";
import { pluralize, teamVars } from "../lib/format";
import { getAdminToken, getPlayerId, isHostOf, useAdminToken } from "../lib/identity";
import { claimPatch, releasePatch, useGame } from "../lib/live";
import { haptic, shareLink } from "../lib/native";

// Not in the board's own chunk: host tools (only the host needs them; see hostDevice below) and the
// sheets, which all start closed and load once the board is up.
const InviteSheet = lazy(() => import("../features/invite/InviteSheet").then((m) => ({ default: m.InviteSheet })));
const JoinSheet = lazy(() => import("../features/invite/JoinSheet").then((m) => ({ default: m.JoinSheet })));
const NotifyPrompt = lazy(() => import("../features/notifications/NotifyPrompt").then((m) => ({ default: m.NotifyPrompt })));

type Cell = { row: number; col: number };
type Spotlight = { kind: "period" | "cell" | "player"; id: string };
/** My wins being celebrated (period keys, board order); `burst` only for one that just happened. */
type Glory = { periods: string[]; burst: boolean };

/** How long a callout stays pinned to a square. */
const CALLOUT_MS = 2600;
/** How long the big "You won" banner stays before folding into the Winners card. */
const GLORY_MS = 15_000;

export default function GameView() {
  const id = useParams().id?.toLowerCase();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { ticker, note: tickerNote, dismiss: dismissTicker } = useTicker();
  const me = getPlayerId();
  const now = useNow();
  useHideTabBar();
  // On the host's device the tools download alongside the board's data, and the board waits for them
  // (unless they fail to load) so they never pop in above the squares.
  // Subscribed: a host-link token the server refuses is dropped after the first render.
  const hostDevice = !!useAdminToken(id);
  if (hostDevice && !HostControls) void loadHostTools().catch(() => undefined);
  const [hostToolsFailed, setHostToolsFailed] = useState(false);
  const [, setHostToolsIn] = useState(!!HostControls);

  // ---- live activity -> the bottom ticker (one alert per moment; tap one to see its square) ----
  // Read through a ref: the jump needs the board's current draw tabs and scroll position.
  const jumpRef = useRef<(cell: Cell, periodKey: string | null) => void>(() => {});
  const onActivity = useCallback(
    (a: Activity, s: GameState) => {
      let alert: ReturnType<typeof boardAlert> = null;
      try {
        alert = boardAlert(a, s, me);
      } catch {
        alert = null;
      }
      // My own win: the gold banner says it (and buzzes) from the win effect below.
      if (!alert || alert.banner) return;
      const note = alertTickerNote(alert, s, me);
      const cell = note.cell;
      const periodKey = typeof (a.data as Record<string, unknown> | null)?.periodKey === "string" ? String((a.data as Record<string, unknown>).periodKey) : null;
      ticker.show({
        key: note.key,
        title: note.title,
        detail: note.detail,
        icon: note.icon,
        tone: note.tone,
        duration: note.duration,
        onTap: cell ? () => jumpRef.current(cell, periodKey) : undefined,
      });
      if (alert.haptic) void haptic(alert.haptic);
    },
    [me, ticker],
  );

  const { state, loading, notFound, error, connection, watching, mutate, receive, refresh, fromPage } = useGame(id, { onActivity });
  // Opened from an invite link, the board's state came with the page and is here on the first
  // render. The full board is a heavy first render on a slow phone, so the skeleton paints for a
  // frame first instead of a blank screen meanwhile.
  const [shellFirst, setShellFirst] = useState(fromPage);
  useEffect(() => {
    if (!shellFirst) return;
    const raf = requestAnimationFrame(() => setShellFirst(false));
    return () => cancelAnimationFrame(raf);
  }, [shellFirst]);

  // ---- local UI state ----
  const [selection, setSelection] = useState<Selection>(EMPTY_SELECTION);
  const selectionRef = useRef(selection);
  selectionRef.current = selection;
  const [joinOpen, setJoinOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  // True when the invite sheet was opened by the create flow right after checkout.
  const [justCreated, setJustCreated] = useState(false);
  // Landed here from checkout (stays true after the invite sheet closes).
  const [fromCheckout, setFromCheckout] = useState(false);
  const [notifyOpen, setNotifyOpen] = useState(false);
  // The "get notified" ask for a board I just created (after its invite sheet closes).
  const [createdAsk, setCreatedAsk] = useState(false);
  // A newcomer just joined: the "You're in" card (with "Bring a friend") sits above the board until dismissed.
  const [welcome, setWelcome] = useState(false);
  const welcomeRef = useRef(false);
  const [zoom, setZoom] = useState(false);
  const [spot, setSpot] = useState<Spotlight | null>(null);
  const [drawPick, setDrawPick] = useState<string | null>(null);
  const [pick, setPick] = useState<{ prompt: string } | null>(null);
  const pickResolve = useRef<((cell: Cell | null) => void) | null>(null);
  const [busy, setBusy] = useState(false);
  // Host tapped remove on a player's row: the host tools open the confirm.
  const [removeRequest, setRemoveRequest] = useState<string | null>(null);
  const clearRemoveRequest = useCallback(() => setRemoveRequest(null), []);
  const [callout, setCallout] = useState<BoardCallout | null>(null);
  /** Wins being celebrated right now (the gold banner), else null. */
  const [glory, setGlory] = useState<Glory | null>(null);
  const gloryRef = useRef<HTMLElement>(null);
  const hadState = useRef(false);
  const boardRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  if (state) hadState.current = true;

  // ---- derived ----
  const game = state?.game ?? null;
  const results = useMemo(() => (state ? resolveResults(state) : []), [state]);
  const nowView = useMemo(() => (state ? rightNow(state, me) : null), [state, me]);
  const drawKey = state ? (drawPick && state.game.numbers?.[drawPick] ? drawPick : defaultDrawKey(state)) : "*";
  // Fresh numbers: the square in play only shows under its own period's digits.
  const nowOnBoard = nowView && (!game?.format.freshNumbers || nowView.drawKey === drawKey) ? nowView : null;
  const cells = useMemo(
    () =>
      state
        ? buildCells({
            state,
            me,
            selection,
            results,
            now: nowOnBoard ? { cell: nowOnBoard.cell, reverseCell: nowOnBoard.reverse?.cell ?? null } : null,
            drawKey,
          })
        : [],
    [state, me, selection, results, nowOnBoard, drawKey],
  );
  const joined = !!state?.players.some((p) => p.id === me);
  const mineCount = state ? countClaimedBy(state.squares, me) : 0;
  const isHost = !!game && (isHostOf(game.id) || game.hostPlayerId === me);
  const wantHostTools = hostDevice || isHost;
  useEffect(() => {
    if (!wantHostTools || HostControls) return;
    let alive = true;
    loadHostTools().then(
      () => alive && setHostToolsIn(true),
      (err: unknown) => {
        console.warn("host tools failed to load", err);
        if (alive) setHostToolsFailed(true);
      },
    );
    return () => {
      alive = false;
    };
  }, [wantHostTools]);
  const phase = state ? boardPhase(state) : "open";
  const axis = useMemo(
    () => (game ? axisLabels(drawFor(game, drawKey), gridSize(game.format.boardSize)) : { x: [], y: [], drawn: false }),
    [game, drawKey],
  );
  const tabs = game ? drawTabs(game) : [];
  const cards = useMemo(() => (state ? periodCards(state, results) : []), [state, results]);
  const rows = useMemo(() => (state ? playerRows(state, results, me) : []), [state, results, me]);
  const winIds = useMemo(() => myWinIds(results, me), [results, me]);
  const next = state ? upcomingPeriod(state) : null;
  const numbers = state && axis.drawn ? myNumbers(state, me, drawKey) : [];
  const squareCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const sq of state?.squares ?? []) m.set(sq.playerId, (m.get(sq.playerId) ?? 0) + 1);
    return m;
  }, [state]);

  const spotlight = useMemo<ReadonlySet<string> | null>(() => {
    if (!spot || !state) return null;
    if (spot.kind === "cell") return new Set([spot.id]);
    if (spot.kind === "player") {
      const keys = new Set(state.squares.filter((sq) => sq.playerId === spot.id).map((sq) => cellKey(sq.row, sq.col)));
      return keys.size ? keys : null;
    }
    const r = results.find((x) => x.periodKey === spot.id);
    if (!r) return null;
    const keys = new Set<string>();
    if (r.cell) keys.add(cellKey(r.cell.row, r.cell.col));
    if (r.reverseCell) keys.add(cellKey(r.reverseCell.row, r.reverseCell.col));
    return keys.size ? keys : null;
  }, [spot, results, state]);

  // ---- effects ----

  // Squares someone else just took (or a lock) fall out of the selection.
  useEffect(() => {
    if (!state) return;
    const cur = selectionRef.current;
    const nextSel = pruneSelection(cur, state, me);
    if (nextSel === cur) return;
    if (state.game.status === "open" && lostToOthers(cur, state, me) > 0) {
      void haptic("warning");
      ticker.show({ title: "Someone just grabbed one of your picks", detail: "Pick another open square.", tone: "neutral" });
    }
    setSelection(nextSel);
  }, [state, me, ticker]);

  // ?invite=1 (the create flow lands here after checkout): open the invite sheet once,
  // even while the board is still "draft" because the payment webhook hasn't landed yet.
  useEffect(() => {
    if (params.get("invite") !== "1") return;
    setJustCreated(true);
    setFromCheckout(true);
    setInviteOpen(true);
    const nextParams = new URLSearchParams(params);
    nextParams.delete("invite");
    setParams(nextParams, { replace: true });
  }, [params, setParams]);

  // Fresh from checkout but still "draft": check back every couple of seconds until the payment lands.
  const draftAfterCheckout = fromCheckout && game?.status === "draft";
  useEffect(() => {
    if (!draftAfterCheckout) return;
    let tries = 0;
    const t = setInterval(() => {
      tries += 1;
      void refresh();
      if (tries >= 20) clearInterval(t);
    }, 2500);
    return () => clearInterval(t);
  }, [draftAfterCheckout, refresh]);

  // My square won: a buzz and the gold banner, once per win per device; a short burst on it when
  // the win just happened. A win first seen later (opened mid-game) gets the same banner, quietly:
  // inline above the board, never a note floating over it.
  useEffect(() => {
    if (!game || winIds.length === 0) return;
    const seen = celebratedWins(game.id);
    const fresh = winIds.filter((w) => !seen.has(w));
    if (fresh.length === 0) return;
    markCelebrated(game.id, fresh);
    const latest = results[results.length - 1];
    const freshPeriods = new Set(fresh.map((w) => w.split(":")[0]));
    void haptic("success");
    setGlory({
      periods: results.filter((r) => freshPeriods.has(r.periodKey)).map((r) => r.periodKey),
      burst: !!latest && freshPeriods.has(latest.periodKey),
    });
  }, [game, winIds, results]);

  // The celebration is a moment: one burst on the banner, then it folds into the Winners card.
  useEffect(() => {
    if (!glory) return;
    const raf = glory.burst ? requestAnimationFrame(() => burstOn(gloryRef.current)) : 0;
    const t = setTimeout(() => setGlory(null), GLORY_MS);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t);
    };
  }, [glory]);

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

  // A spotlight on a result or a square is a moment, not a mode (a player's squares stay lit until cleared).
  useEffect(() => {
    if (!spot || spot.kind === "player") return;
    const t = setTimeout(() => setSpot(null), 5000);
    return () => clearTimeout(t);
  }, [spot]);

  useEffect(() => {
    if (!callout) return;
    const t = setTimeout(() => setCallout(null), CALLOUT_MS);
    return () => clearTimeout(t);
  }, [callout]);

  // Back from another app: catch up right away (also notices a board deleted meanwhile).
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refresh]);

  // The square in play just moved onto one of mine: a buzz (the Right now card says the rest).
  const liveKey = nowView?.live ? `${nowView.periodKey}:${nowView.cell.row},${nowView.cell.col}` : null;
  const liveMine = !!nowView?.live && nowView.mine;
  // undefined until the first state is seen, so opening the board mid-game doesn't buzz.
  const lastLive = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (!hasState) return;
    const prev = lastLive.current;
    lastLive.current = liveKey;
    if (prev === undefined || !liveKey || !liveMine || prev === liveKey) return;
    void haptic("heavy");
  }, [hasState, liveKey, liveMine]);

  // Leaving pick mode if the component unmounts mid-pick.
  useEffect(() => () => pickResolve.current?.(null), []);

  // ---- actions ----

  const scrollToBoard = useCallback(() => {
    boardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);

  // A ticker alert was tapped: light up its square (under that period's numbers on fresh-number boards).
  jumpRef.current = (cell, periodKey) => {
    const g = stateRef.current?.game;
    if (!g || pickingRef.current) return;
    void haptic("selection");
    setCallout(null);
    if (periodKey && g.format.freshNumbers) setDrawPick(drawKeyOf(g, periodKey));
    setSpot({ kind: "cell", id: cellKey(cell.row, cell.col) });
    scrollToBoard();
  };

  // NotifyPrompt decides for itself whether to ask (it remembers dismissals per trigger and closes
  // itself otherwise), and an automatic ask after a claim waits for the confetti on its own.
  const maybeAskNotify = useCallback(() => setNotifyOpen(true), []);

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
          // (A newcomer's "You're in" card says this already.)
          if (firstSquares && !welcomeRef.current) {
            const after = stateRef.current;
            const mineNow = after?.squares.find((sq) => sq.playerId === getPlayerId() && cellsToClaim.some((c) => c.row === sq.row && c.col === sq.col));
            const first = mineNow ?? cellsToClaim[0];
            setCallout({
              key: cellKey(first.row, first.col),
              tone: "brand",
              children: (
                <CalloutBody
                  title={"You're on the board! 🎉"}
                  detail={res.claimed === 1 ? "Numbers get drawn when the host locks the board." : `${res.claimed} squares are yours. Numbers get drawn at lock.`}
                />
              ),
            });
          }
          maybeAskNotify();
        }
        if (res.skipped > 0) {
          ticker.show({
            title: res.claimed === 0 ? "Those squares just got taken" : `${pluralize(res.skipped, "square")} got taken first`,
            detail: "Pick another open square.",
            tone: "neutral",
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
    [id, mutate, toast, ticker, maybeAskNotify],
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
      // The welcome card ("You're in", what you got, Bring a friend) takes it from here.
      welcomeRef.current = true;
      setWelcome(true);
      if (picked.length > 0) void claim(picked);
    },
    [receive, claim],
  );

  const dismissWelcome = useCallback(() => {
    welcomeRef.current = false;
    setWelcome(false);
  }, []);

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
        setCallout(null);
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
      setSpot((cur) => (cur?.kind === "player" ? cur : null));
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
        setCallout({
          key: cell.key,
          tone: "warn",
          children: (
            <CalloutBody
              title={`Up to ${outcome.max} squares each`}
              detail={cell.mine ? "Unpick one of your new squares to keep this one." : "Tap one of yours to give it back, then pick another."}
            />
          ),
        });
        return;
      }
      if (outcome.kind === "inspect") {
        inspectRef.current(cell, s);
        return;
      }
      setCallout(null);
      void haptic("selection");
      const nextSel = applyTap(sel, cell.key, outcome);
      setSelection(nextSel);
      // Newcomer: the first pick opens the join sheet straight away (link -> square -> Join & claim).
      // Not the host on another device (host link): they join only if they choose to, from the bar.
      if (!isJoined && outcome.kind === "select" && sel.claim.size === 0 && !getAdminToken(s.game.id)) setJoinOpen(true);
    },
    [me, endPick],
  );

  // Read through a ref so the memoized tap handler always sees the current axes.
  const inspectRef = useRef(inspect);
  inspectRef.current = inspect;

  /** Who has this square, pinned right on it. */
  function inspect(cell: (typeof cells)[number][number], s: GameState) {
    if (callout?.key === cell.key) {
      setCallout(null);
      return;
    }
    if (s.game.status === "draft") {
      setCallout({ key: cell.key, children: <CalloutBody title="This board isn't open yet" /> });
      return;
    }
    if (!cell.ownerId) {
      setCallout({ key: cell.key, children: <CalloutBody title={s.game.status === "open" ? "Open square" : "Nobody took this one"} /> });
      return;
    }
    const owner = cell.owner;
    const where = axis.drawn
      ? `${s.game.teamX.abbr || s.game.teamX.name} ${axis.x[cell.col]} · ${s.game.teamY.abbr || s.game.teamY.name} ${axis.y[cell.row]}`
      : "Numbers get drawn at lock";
    const won = cell.wins.length
      ? `Won ${cell.wins.map((w) => `${periodPhrase(w.periodKey, w.label).short}${w.reverse ? " (reverse)" : ""}`).join(", ")}`
      : null;
    void haptic("light");
    setCallout({
      key: cell.key,
      tone: cell.wins.length ? "win" : cell.mine ? "brand" : "neutral",
      children: (
        <CalloutBody
          icon={owner ? <Avatar name={owner.name} color={owner.color} emoji={owner.emoji} size="sm" decorative /> : undefined}
          title={cell.mine ? "Your square" : `${owner?.name ?? "Someone"}'s square`}
          detail={where}
          extra={won}
          now={cell.live && nowView && !nowView.everyScore ? nowSentence({ ...nowView, mine: false, ownerId: cell.ownerId }) : null}
        />
      ),
    });
  }

  const share = useCallback(() => setInviteOpen(true), []);

  const brag = useCallback(async () => {
    if (!state) return;
    const won = new Set(myWinIds(results, me).map((w) => w.split(":")[0]));
    const last = results.filter((r) => won.has(r.periodKey)).at(-1);
    const when = last ? periodPhrase(last.periodKey, last.label).moment : "";
    const outcome = await shareLink({
      title: state.game.name,
      text: `My square just hit${when ? ` ${when}` : ""} on ${state.game.name} 🏆`,
      url: inviteUrl(state.game.id),
    });
    if (outcome === "copied") ticker.show({ title: "Link copied", detail: "Paste it in the group chat.", tone: "success" });
  }, [state, results, me, ticker]);

  const selectPlayer = useCallback(
    (playerId: string | null, scroll = false) => {
      void haptic("selection");
      setCallout(null);
      setSpot(playerId ? { kind: "player", id: playerId } : null);
      if (playerId && scroll) scrollToBoard();
    },
    [scrollToBoard],
  );

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

  if (!state || !game || shellFirst || (hostDevice && !HostControls && !hostToolsFailed)) {
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
  // Host tools render only on the device holding the admin token.
  const hostBar = isHost && !!getAdminToken(game.id);
  // The host on another device (opened the host link) isn't invited to their own board.
  const newcomer = !joined && open && !hostBar;
  // While squares are being picked the host can take someone off the board (confirmed in the host tools).
  const canRemove = hostBar && !!HostControls && (game.status === "open" || game.status === "draft");
  const n = gridSize(game.format.boardSize);
  const claimN = selection.claim.size;
  const releaseN = selection.release.size;
  const left = squaresLeftFor(game.maxPerPlayer, mineCount);
  // What's left once this selection goes through (a give-back frees a spot).
  const leftAfter = squaresLeftFor(game.maxPerPlayer, mineAfter(mineCount, selection));
  const showBar = !pick && !joinOpen && open && claimN + releaseN > 0;
  const firstMine = state.squares.find((sq) => sq.playerId === me);
  const focusKey =
    [...selection.claim][0] ??
    (nowOnBoard ? cellKey(nowOnBoard.cell.row, nowOnBoard.cell.col) : null) ??
    (firstMine ? cellKey(firstMine.row, firstMine.col) : null);
  const myWinResults = results.filter((r) => r.winnerPlayerId === me || r.reverseWinnerPlayerId === me);
  const gloryResults = glory ? results.filter((r) => glory.periods.includes(r.periodKey)) : [];
  const headline = headlineScore(state);
  const abbr = (t: typeof game.teamX) => t.abbr || t.name;
  const compactTitle =
    scoreHidden && headline && phase !== "open" && phase !== "draft"
      ? `${abbr(game.teamX)} ${headline.scoreX}–${headline.scoreY} ${abbr(game.teamY)}${phase === "live" ? ` · ${headline.detail}` : phase === "final" ? " · Final" : ""}`
      : null;
  const sectionTitle = "eyebrow mb-2 px-1 text-ink-subtle";
  const wonKeys = new Set(
    myWinResults.flatMap((r) => [
      r.winnerPlayerId === me && r.cell ? cellKey(r.cell.row, r.cell.col) : null,
      r.reverseWinnerPlayerId === me && r.reverseCell ? cellKey(r.reverseCell.row, r.reverseCell.col) : null,
    ]).filter((k): k is string => k !== null),
  );
  const freshTabNote =
    tabs.length > 1 && nowView && nowView.drawKey !== drawKey
      ? `These are the ${tabs.find((t) => t.key === drawKey)?.label ?? ""} numbers. The square in play is on the ${tabs.find((t) => t.key === nowView.drawKey)?.label ?? "current"} tab.`
      : null;
  const playerSpot = spot?.kind === "player" ? spot.id : null;
  const showSpot = (periodKey: string) => {
    setSpot({ kind: "period", id: periodKey });
    if (game.format.freshNumbers) setDrawPick(drawKeyOf(game, periodKey));
    scrollToBoard();
  };

  return (
    <div style={teamVars(game.teamX, game.teamY)} className="flex flex-1 flex-col">
      <TopBar
        title={compactTitle ?? game.name}
        large={false}
        back
        trailing={<IconButton label="Invite friends" icon={<ShareIcon size={22} />} onClick={share} haptic="light" />}
      />

      <div className="flex flex-col gap-3 px-safe pt-1">
        {connection === "offline" && (
          <p className="flex items-center gap-2 rounded-2xl bg-danger-500/12 px-3.5 py-2 text-footnote font-semibold text-danger-300 ring-1 ring-inset ring-danger-500/30">
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

        {/* My wins, one slim row. Out of the way while the host taps a square. */}
        {!pick &&
          (gloryResults.length > 0 ? (
            <WinBanner
              anchorRef={gloryRef}
              periods={gloryResults.map((r) => ({ key: r.periodKey, label: r.label }))}
              prize={gloryResults[gloryResults.length - 1].prize}
              onBrag={() => void brag()}
              onShow={() => showSpot(gloryResults[gloryResults.length - 1].periodKey)}
            />
          ) : (
            phase === "final" &&
            myWinResults.length > 0 && (
              <WinShelf
                labels={myWinResults.map((r) => periodPhrase(r.periodKey, r.label).short)}
                prize={myWinResults[myWinResults.length - 1].prize}
                onBrag={() => void brag()}
                onShow={() => showSpot(myWinResults[myWinResults.length - 1].periodKey)}
              />
            )
          ))}

        {isHost && (
          <div className="empty:hidden">
            {HostControls && (
              <HostControls
                state={state}
                apply={receive}
                pickCell={pickCell}
                onInvite={share}
                removeRequest={removeRequest}
                onRemoveRequestHandled={clearRemoveRequest}
              />
            )}
          </div>
        )}

        {/* Host tools say "Open board" for an unpaid board; right after checkout the payment is just landing. */}
        {game.status === "draft" && isHost && fromCheckout && (
          <p className="rounded-2xl bg-surface-2 px-3.5 py-2.5 text-footnote text-ink-muted ring-1 ring-inset ring-line">
            Confirming your payment. This usually takes a few seconds.
          </p>
        )}

        {welcome && joined && <JoinedCard state={state} onDismiss={dismissWelcome} />}

        {/* ---- the grid ---- */}
        <section ref={boardRef} aria-label="Squares" className="-mx-2 scroll-mt-24">
          {nowView && !pick ? (
            <div className="mb-2 px-2">
              <RightNow
                now={nowView}
                players={state.players}
                me={me}
                teamX={game.teamX}
                teamY={game.teamY}
                onShow={() => {
                  void haptic("selection");
                  if (game.format.freshNumbers && nowView.drawKey !== drawKey) setDrawPick(nowView.drawKey);
                  setSpot({ kind: "cell", id: cellKey(nowView.cell.row, nowView.cell.col) });
                }}
              />
            </div>
          ) : (
            !newcomer &&
            !pick &&
            !(phase === "draft" && hostBar) && (
              <div className="mb-1 flex min-h-6 items-center gap-2 px-3 text-footnote leading-snug text-ink-muted">
                <BoardHint phase={phase} joined={joined} mineCount={mineCount} left={left} isHost={isHost} />
              </div>
            )
          )}

          {tabs.length > 1 && (
            <div className="mb-1 px-2">
              <SegmentedControl
                size="sm"
                aria-label="Numbers for period"
                options={tabs.map((t) => ({ value: t.key, label: t.label }))}
                value={drawKey}
                onChange={setDrawPick}
              />
              {freshTabNote && <p className="mt-1.5 px-1 text-caption text-ink-subtle">{freshTabNote}</p>}
            </div>
          )}

          {pick && (
            <div className="mx-2 mb-2 flex items-center gap-3 rounded-2xl bg-gold-400 px-3.5 py-2 text-ink-inverse shadow-glow-gold animate-pop">
              <TrophyIcon size={18} filled className="shrink-0" />
              <p className="min-w-0 flex-1 text-subhead font-extrabold leading-snug">{pick.prompt}</p>
              <button
                type="button"
                onClick={() => endPick(null)}
                className="pressable flex h-11 shrink-0 items-center rounded-full bg-black/15 px-3.5 text-footnote font-extrabold"
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
              nowKind={nowOnBoard ? (nowOnBoard.live ? "live" : "projected") : null}
              callout={callout}
              onTap={onTap}
              onPinch={(zoomIn) => {
                if (n <= 5 || pick) return;
                void haptic("selection");
                setCallout(null);
                setZoom(zoomIn);
              }}
              accessory={
                n > 5 && !pick ? (
                  <button
                    type="button"
                    onClick={() => {
                      void haptic("selection");
                      setCallout(null);
                      setZoom((z) => !z);
                    }}
                    aria-pressed={zoom}
                    aria-label={zoom ? "Fit the whole board" : "Zoom in on the board"}
                    className={cx(
                      "pressable flex h-11 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-footnote font-extrabold ring-1 ring-inset",
                      zoom ? "bg-brand-400 text-ink-inverse ring-brand-400" : "bg-surface-3 text-ink ring-line-strong",
                    )}
                  >
                    {zoom ? <GridIcon size={15} /> : <SearchIcon size={15} />}
                    {zoom ? "Fit" : "Zoom"}
                  </button>
                ) : undefined
              }
            />
          </div>

          {!pick && (state.squares.length > 0 || numbers.length > 0) && (
            <div className="mt-3 flex flex-col gap-2.5 px-2">
              <PlayerFinder players={state.players} counts={squareCounts} me={me} selected={playerSpot} onSelect={(pid) => selectPlayer(pid)} />
              <MySquares
                numbers={numbers}
                now={nowOnBoard}
                teamX={game.teamX}
                teamY={game.teamY}
                wonKeys={wonKeys}
                spotKey={spot?.kind === "cell" ? spot.id : null}
                onSpot={(key) => {
                  void haptic("selection");
                  setSpot(key ? { kind: "cell", id: key } : null);
                }}
              />
            </div>
          )}
        </section>

        {/* ---- results ---- */}
        {cards.length > 0 && (
          <section aria-label="Results">
            <div className="mb-2 flex items-center justify-between gap-2 px-1">
              <p className="eyebrow text-ink-subtle">{phase === "open" || phase === "draft" ? "What's up for grabs" : "Winners"}</p>
              {myWinResults.length > 0 && gloryResults.length === 0 && phase !== "final" && (
                <button
                  type="button"
                  onClick={() => void brag()}
                  className="pressable flex h-7 items-center gap-1 rounded-full bg-gold-400/15 px-2.5 text-caption font-extrabold text-gold-300 ring-1 ring-inset ring-gold-400/40"
                >
                  <TrophyIcon size={12} filled />
                  Brag
                </button>
              )}
            </div>
            <ResultsStrip
              cards={cards}
              players={state.players}
              me={me}
              teamX={game.teamX}
              teamY={game.teamY}
              reverse={game.format.reverse}
              predraw={!game.numbers}
              liveNow={nowView?.live ? { playerId: nowView.ownerId, scoreX: nowView.scoreX, scoreY: nowView.scoreY } : null}
              selectedKey={spot?.kind === "period" ? spot.id : null}
              grid={game.format.periods !== "every-score"}
              onSelect={(key) => {
                void haptic("selection");
                setCallout(null);
                setSpot(key ? { kind: "period", id: key } : null);
                // Fresh numbers: show the digits that decided that period.
                if (key && game.format.freshNumbers) setDrawPick(drawKeyOf(game, key));
                if (key) scrollToBoard();
              }}
            />
          </section>
        )}

        {/* ---- players ---- */}
        <section aria-label="Players">
          <p className={sectionTitle}>
            Players · {state.players.length}
            {phase !== "open" && phase !== "draft" && state.squares.length > 0 ? <span className="normal-case tracking-normal"> · tap one to find their squares</span> : null}
          </p>
          <PlayersList
            rows={rows}
            total={state.players.length}
            hostId={game.hostPlayerId}
            stage={phase === "open" || phase === "draft" ? "picking" : "game"}
            leading={nowView?.ownerId ? { playerId: nowView.ownerId, label: nowView.everyScore ? "now" : nowView.label } : null}
            selectedId={playerSpot}
            onSelect={(pid) => selectPlayer(playerSpot === pid ? null : pid, true)}
            onRemove={
              canRemove
                ? (pid) => {
                    void haptic("light");
                    setRemoveRequest(pid);
                  }
                : undefined
            }
          />
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
                  {claimN > 0 ? `Give back ${releaseN}` : `Give back ${pluralize(releaseN, "square")}`}
                </Button>
              )}
              {claimN > 0 && (
                <Button data-testid="claim-submit" size="lg" className="min-w-0 flex-1" loading={busy} onClick={() => void submit()}>
                  {joined ? `Claim ${pluralize(claimN, "square")}` : `Join & claim ${claimN}`}
                </Button>
              )}
            </div>
            {leftAfter !== null && claimN > 0 && (
              <p className="px-2 pt-1.5 text-center text-caption font-semibold text-ink-muted">
                {leftAfter <= 0 ? `That's your max of ${game.maxPerPlayer}` : `${leftAfter} more after this (max ${game.maxPerPlayer})`}
              </p>
            )}
          </div>
        </ActionBar>
      )}

      <Ticker note={tickerNote} onDismiss={dismissTicker} />

      <Suspense fallback={null}>
        <InviteSheet
          state={state}
          open={inviteOpen}
          watching={watching}
          justCreated={justCreated}
          onClose={() => {
            setInviteOpen(false);
            // Fresh from creating the board: now's the moment to offer notifications.
            if (justCreated) setCreatedAsk(true);
            setJustCreated(false);
          }}
        />
        <JoinSheet state={state} open={joinOpen} onJoined={onJoined} onClose={onJoinClose} selectedCount={selection.claim.size} />
        <NotifyPrompt gameId={game.id} trigger="claimed" open={notifyOpen} onClose={() => setNotifyOpen(false)} />
        <NotifyPrompt gameId={game.id} trigger="created" open={createdAsk} onClose={() => setCreatedAsk(false)} />
      </Suspense>
    </div>
  );
}

/** A short burst of gold right on an element (the win banner), instead of confetti over the whole screen. */
function burstOn(el: Element | null) {
  if (!el || typeof window === "undefined") return;
  const r = el.getBoundingClientRect();
  if (r.bottom < 0 || r.top > window.innerHeight) return;
  const origin = { x: (r.left + r.width / 2) / window.innerWidth, y: (r.top + r.height / 2) / window.innerHeight };
  void celebrate("pop", { origin, colors: ["#ffd56b", "#ffc233", "#ffab0f", "#fff3d1", "#c6f91f"] });
}

function CalloutBody({ icon, title, detail, extra, now }: { icon?: ReactNode; title: ReactNode; detail?: ReactNode; extra?: ReactNode; now?: ReactNode }) {
  return (
    <span className="flex items-center gap-2.5">
      {icon}
      <span className="min-w-0">
        <span className="block text-subhead font-extrabold leading-tight text-ink">{title}</span>
        {detail && <span className="block text-caption font-semibold leading-snug text-ink-muted tabular-nums">{detail}</span>}
        {extra && <span className="block text-caption font-bold leading-snug text-gold-300">{extra}</span>}
        {now && <span className="block text-caption font-bold leading-snug text-live-300">{now}</span>}
      </span>
    </span>
  );
}

function BoardHint({
  phase,
  joined,
  mineCount,
  left,
  isHost,
}: {
  phase: ReturnType<typeof boardPhase>;
  joined: boolean;
  mineCount: number;
  left: number | null;
  isHost: boolean;
}) {
  if (phase === "draft") return <span>{isHost ? "Open the board so friends can pick squares." : "The host is still setting this board up."}</span>;
  if (phase === "open") {
    if (!joined) return <b className="font-bold text-ink">Tap any open square to jump in.</b>;
    if (mineCount === 0) return <b className="font-bold text-ink">Tap open squares to pick yours.</b>;
    return (
      <span>
        <b className="font-bold text-brand-300">You have {mineCount}</b>
        {left !== null ? ` · ${left} left` : ""} · Tap one of yours to give it back
      </span>
    );
  }
  if (phase === "final") return <span>That's the final whistle. Gold squares took the prizes.</span>;
  return mineCount > 0 ? (
    <span>
      <b className="font-bold text-brand-300">Your {mineCount === 1 ? "square is" : `${mineCount} squares are`} highlighted.</b> Every period is decided.
    </span>
  ) : (
    <span>Every period is decided. Tap any square to see whose it is.</span>
  );
}

/**
 * My square just hit: one slim gold row above the board (it never covers the grid or the
 * chips under it), then it folds into the Winners card. Several wins first seen together share it.
 */
function WinBanner({
  anchorRef,
  periods,
  prize,
  onBrag,
  onShow,
}: {
  anchorRef: Ref<HTMLElement>;
  periods: { key: string; label: string }[];
  prize: string | null;
  onBrag: () => void;
  onShow: () => void;
}) {
  // One win reads as a moment ("hit at halftime"); several list their periods like chips ("hit Q1 + Half").
  const line =
    periods.length > 1
      ? `Your squares hit ${periods.map((p) => periodPhrase(p.key, p.label).short).join(" + ")}`
      : `Your square hit ${periods[0] ? periodPhrase(periods[0].key, periods[0].label).moment : ""}`.trim();
  return (
    <section
      ref={anchorRef}
      aria-label="You won"
      className="jx-shine jx-glory relative flex items-center gap-2.5 overflow-hidden rounded-2xl bg-[linear-gradient(140deg,var(--color-gold-300),var(--color-gold-500)_60%,var(--color-gold-600))] py-1.5 pl-1.5 pr-1.5 text-ink-inverse shadow-glow-gold"
    >
      <button type="button" onClick={onShow} aria-label={`You won! ${line}. Show the square`} className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5 text-left">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-pitch-950 text-gold-300 shadow-[inset_0_1px_0_rgb(255_255_255/0.15)]">
          <TrophyIcon size={22} filled />
        </span>
        <span className="min-w-0">
          <span className="block font-display text-headline font-extrabold leading-tight">You won!</span>
          <span className="block truncate text-caption font-semibold opacity-80">
            {line}
            {prize ? ` · ${prize}` : ""}
          </span>
        </span>
      </button>
      <Button variant="secondary" size="sm" onClick={onBrag} className="shrink-0 !bg-pitch-950 !text-gold-200 ring-0">
        Brag
      </Button>
    </section>
  );
}

/** Final board: a slim trophy shelf for what I won, so the board stays on screen. */
function WinShelf({ labels, prize, onBrag, onShow }: { labels: string[]; prize: string | null; onBrag: () => void; onShow: () => void }) {
  const list = [...new Set(labels)];
  const joinedLabels = list.join(" + ");
  const title = list.length === 1 ? `You won ${list[0]}!` : joinedLabels.length <= 12 ? `You won ${joinedLabels}!` : `You won ${list.length} times!`;
  return (
    <section aria-label="Your wins" className="flex items-center gap-2.5 rounded-2xl bg-gold-400/12 py-1 pl-2 pr-1 ring-1 ring-inset ring-gold-400/40">
      <button type="button" onClick={onShow} className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5 text-left">
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

function BoardSkeleton() {
  return (
    <div className="flex flex-col gap-3 px-safe pt-1" aria-busy="true" aria-label="Loading board">
      <Skeleton className="h-[6.75rem] w-full rounded-card" />
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
