// TV mode (/g/:id/tv): the board on a TV or a laptop for a watch party or a
// bar, through AirPlay, Chromecast, HDMI or a smart TV's browser. Read-only and
// live (useGame: socket + polling). Anyone with the board link can open it:
// it reads the public board state only (GET /api/games/:id needs no player,
// no membership and no admin token), so a TV that never joined just watches.
//
// While squares are open the panel is a big QR code to the invite link; once
// the numbers are drawn it's the score, who the score points at right now and
// the winners so far. A winner landing gets a short celebration (Jax cheers,
// confetti), then the board comes back. The screen stays awake (Screen Wake
// Lock), and the only controls are a small toolbar that hides itself.

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { unitOf } from "../../shared/formats";
import { featuredSeasonGame } from "../../shared/season";
import { drawFor, gridSize, resolveResults } from "../../shared/squares";
import type { Activity, GameState } from "../../shared/types";
import { ChevronLeftIcon, ExpandIcon, MoonIcon, ShrinkIcon, SunIcon, WifiOffIcon } from "../components/icons";
import { Button, EmptyState, Jax, JaxCheer, Spinner, celebrate } from "../components/ui";
import { axisLabels, boardPhase, buildCells, defaultDrawKey, EMPTY_SELECTION, periodCards, rightNow } from "../features/board/boardModel";
import { useNow } from "../features/board/useNow";
import { TvBoard } from "../features/tv/TvBoard";
import { TvCelebrate } from "../features/tv/TvCelebrate";
import { TvGamePanel, TvOpenPanel } from "../features/tv/TvPanel";
import { celebrationFor, tvLayout, tvUpcoming, tvWinners, type TvCelebration } from "../features/tv/tvModel";
import { setTvTheme, useAwake, useFullscreen, useTvTheme, useWakeLock } from "../features/tv/screen";
import "../features/tv/tv.css";
import { inviteUrl } from "../lib/api";
import { teamVars } from "../lib/format";
import { useGame } from "../lib/live";

/** How long a winner's card stays before the board comes back. */
export const CELEBRATE_MS = 7000;
/** The TV is nobody's player: nothing on it is "mine". */
const NOBODY = "";

function useViewport(): { width: number; height: number } {
  const read = () => ({ width: window.innerWidth || 1280, height: window.innerHeight || 720 });
  const [size, setSize] = useState(read);
  useEffect(() => {
    const onResize = () => setSize(read());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return size;
}

export default function TvView() {
  const id = useParams().id?.toLowerCase();
  const navigate = useNavigate();
  const location = useLocation();
  const exit = () => {
    if (location.key !== "default") navigate(-1);
    else navigate(`/g/${id ?? ""}`, { replace: true });
  };
  return <TvScreen id={id} onExit={exit} />;
}

export interface TvScreenProps {
  id: string | undefined;
  onExit: () => void;
  /** The club TV (/club/:id/tv) shows the club in its own corner, so the panel doesn't. */
  hideClub?: boolean;
  /** At the panel's foot: the club TV's corner (its club, which board of how many). */
  panelFooter?: ReactNode;
  /** A winner the club TV came to this board for: celebrated once the board is up. */
  celebrate?: Activity | null;
}

/** One board on the TV: the page above, and each board in turn on the club TV (src/pages/ClubTvView.tsx). */
export function TvScreen({ id, onExit, hideClub, panelFooter, celebrate: arrivedFor }: TvScreenProps) {
  const theme = useTvTheme();
  useWakeLock();
  const fullscreen = useFullscreen();
  const { awake, keepRef } = useAwake<HTMLDivElement>();
  const now = useNow(15_000);
  const viewport = useViewport();

  // ---- winners landing -> one celebration at a time ----
  const [queue, setQueue] = useState<TvCelebration[]>([]);
  const onActivity = useCallback((a: Activity, s: GameState) => {
    let c: TvCelebration | null = null;
    try {
      c = celebrationFor(a, s);
    } catch {
      c = null;
    }
    if (c) {
      const next = c;
      setQueue((q) => (q.some((x) => x.id === next.id) ? q : [...q, next]));
    }
  }, []);
  const { state, notFound, error, loading, connection, refresh } = useGame(id, { onActivity });
  // The club TV switched here for a winner that landed while another board was up: celebrate it once the board is up.
  const stateRef = useRef(state);
  stateRef.current = state;
  const loaded = state !== null;
  useEffect(() => {
    if (arrivedFor && loaded && stateRef.current) onActivity(arrivedFor, stateRef.current);
  }, [arrivedFor, loaded, onActivity]);
  const current = queue[0] ?? null;
  const [cheer, setCheer] = useState(0);
  useEffect(() => {
    if (!current) return;
    setCheer((n) => n + 1);
    void celebrate("win");
    const t = setTimeout(() => setQueue((q) => q.slice(1)), CELEBRATE_MS);
    return () => clearTimeout(t);
  }, [current]);

  // Back from a sleeping TV or another tab: catch up right away.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refresh]);

  const game = state?.game ?? null;
  const n = game ? gridSize(game.format.boardSize) : 10;
  const layout = useMemo(() => tvLayout(viewport.width, viewport.height, n), [viewport.width, viewport.height, n]);
  const results = useMemo(() => (state ? resolveResults(state) : []), [state]);
  const nowView = useMemo(() => (state ? rightNow(state, NOBODY) : null), [state]);
  const drawKey = state ? defaultDrawKey(state) : "*";
  const nowOnBoard = nowView && (!game?.format.freshNumbers || nowView.drawKey === drawKey) ? nowView : null;
  const cells = useMemo(
    () =>
      state
        ? buildCells({
            state,
            me: NOBODY,
            selection: EMPTY_SELECTION,
            results,
            now: nowOnBoard ? { cell: nowOnBoard.cell, reverseCell: nowOnBoard.reverse?.cell ?? null } : null,
            drawKey,
          })
        : [],
    [state, results, nowOnBoard, drawKey],
  );
  const axis = useMemo(() => (game ? axisLabels(drawFor(game, drawKey), n) : { x: [], y: [], drawn: false }), [game, drawKey, n]);
  const winners = useMemo(() => (state ? tvWinners(state, results) : []), [state, results]);
  const upcoming = useMemo(() => (state ? tvUpcoming(periodCards(state, results), unitOf(state.game.format)) : []), [state, results]);

  const exit = onExit;

  const rootStyle = {
    ...(game ? teamVars(game.teamX, game.teamY, theme) : {}),
    "--u": `${layout.unit}px`,
    "--pad": `${layout.pad}px`,
  } as CSSProperties;

  const toolbar = (
    <div ref={keepRef} className="tv-toolbar glass shadow-float ring-1 ring-inset ring-line-strong" data-awake={awake} data-testid="tv-toolbar">
      {fullscreen.supported && (
        <Button
          data-testid="tv-fullscreen"
          variant="secondary"
          size="sm"
          leading={fullscreen.active ? <ShrinkIcon size={18} /> : <ExpandIcon size={18} />}
          onClick={fullscreen.toggle}
        >
          {fullscreen.active ? "Exit full screen" : "Full screen"}
        </Button>
      )}
      <Button
        data-testid="tv-theme"
        variant="secondary"
        size="sm"
        leading={theme === "dark" ? <SunIcon size={18} /> : <MoonIcon size={18} />}
        onClick={() => setTvTheme(theme === "dark" ? "light" : "dark")}
      >
        {theme === "dark" ? "Light" : "Dark"}
      </Button>
      <Button data-testid="tv-exit" variant="secondary" size="sm" leading={<ChevronLeftIcon size={18} strokeWidth={2.6} />} onClick={exit}>
        Exit
      </Button>
    </div>
  );

  // A drawn season board on the TV shows its game on now, else the next one (its own board, live);
  // the season board's state, followed here, moves it on to the next game when this one's over.
  const seasonGame = state?.season && state.game.status !== "open" && state.game.status !== "draft" ? (featuredSeasonGame(state.season.games, Date.now())?.id ?? null) : null;
  if (seasonGame && seasonGame !== id) {
    return <TvScreen key={seasonGame} id={seasonGame} onExit={onExit} hideClub={hideClub} panelFooter={panelFooter} />;
  }

  if (notFound || (!state && (error || loading))) {
    return (
      <div className="tv-root flex flex-col items-center justify-center" data-awake={awake} style={rootStyle} data-testid="tv-view" data-state="empty">
        {toolbar}
        {notFound ? (
          <EmptyState
            illustration={<Jax pose="peek" size={156} />}
            title="Jax looked everywhere"
            description="This board isn't here. The link may be old, or the host deleted the board."
          />
        ) : error && !loading ? (
          <EmptyState
            art={<WifiOffIcon />}
            title="Couldn't load this board"
            description={error.message}
            action={
              <Button size="lg" onClick={() => void refresh()}>
                Try again
              </Button>
            }
          />
        ) : (
          <Spinner size={40} />
        )}
      </div>
    );
  }
  if (!state || !game) return null;

  const phase = boardPhase(state);
  const picking = phase === "open" || phase === "draft";
  const url = inviteUrl(game.id);
  const landscape = layout.orientation === "landscape";
  // The QR code: as big as the panel lets it be next to its caption.
  const row = layout.panel.width >= layout.panel.height * 1.1;
  const qr = Math.round(
    row ? Math.min(layout.panel.height * 0.55, layout.panel.width * 0.45) : Math.min(layout.panel.width * 0.7, layout.panel.height * (landscape ? 0.45 : 0.5)),
  );

  return (
    <div className="tv-root" data-awake={awake} style={rootStyle} data-testid="tv-view" data-phase={phase} data-theme-choice={theme}>
      <h1 className="sr-only">{game.name} on TV</h1>
      <div className="tv-stage" data-orientation={layout.orientation}>
        <TvBoard game={game} cells={cells} axis={axis} layout={layout} nowKind={nowOnBoard ? (nowOnBoard.live ? "live" : "projected") : null} />
        {picking ? (
          <TvOpenPanel state={state} url={url} qr={qr} row={row} now={now} hideClub={hideClub} footer={panelFooter} />
        ) : (
          <TvGamePanel state={state} nowView={nowView} winners={winners} upcoming={upcoming} now={now} hideClub={hideClub} footer={panelFooter} />
        )}
      </div>

      {connection === "offline" && (
        <p
          data-testid="tv-offline"
          className="fixed bottom-[calc(var(--u)*2)] left-[calc(var(--u)*2)] flex items-center gap-2 rounded-full bg-danger-500/15 px-4 py-2 text-callout font-bold text-ink-danger ring-1 ring-inset ring-danger-500/40"
        >
          <WifiOffIcon size={18} />
          Offline · showing the last update
        </p>
      )}

      {toolbar}
      {current && <TvCelebrate key={current.id} celebration={current} />}
      <JaxCheer play={cheer} size={Math.round(layout.unit * 26)} />
    </div>
  );
}
