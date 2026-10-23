// The club TV (/club/:clubId/tv#k=<token>): an Annual Pass + Venue holder's open and live
// boards on the TV at the bar or in the break room, one every 20 seconds, each
// shown with the board TV's own screen (TvScreen, src/features/tv). A winner
// landing on a board that isn't up takes the screen at once (live games are
// first in line anyway), and the club's logo and name stay in the corner,
// with which board of how many.
//
// The link's token is the only key: it's in the fragment (never sent in a
// request URL, so never in a log) and goes to GET /api/clubs/:id/tv as a
// header. A wrong or old token is a 404 ("This TV link doesn't work
// anymore"). The page only ever has the boards' public state, the same as
// anyone with each board's link; it never joins, claims or holds a token.

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { CLUB_TV_ROTATE_MS, shownClub } from "../../shared/clubs";
import type { Activity, ClubBrand, ClubTvState } from "../../shared/types";
import { WifiOffIcon } from "../components/icons";
import { Button, EmptyState, Jax, Spinner, cx } from "../components/ui";
import { ClubMark } from "../features/club/ClubMark";
import { latestWinner, nextBoard, rotationOrder } from "../features/club/clubModel";
import { TvClubBrand } from "../features/club/TvClubBrand";
import { useAwake, useTvTheme, useWakeLock } from "../features/tv/screen";
import "../features/tv/tv.css";
import { ApiError } from "../lib/api";
import { clubApi, tvTokenFromHash } from "../lib/club";
import { primeGame } from "../lib/live";
import { TvScreen } from "./TvView";

/** How often the TV asks which boards are on (the board on screen is live over its own socket meanwhile). */
export const CLUB_TV_POLL_MS = 15_000;

type Load = { kind: "loading" } | { kind: "ready"; tv: ClubTvState } | { kind: "missing" } | { kind: "offline"; message: string };

export default function ClubTvView() {
  const clubId = useParams().clubId?.toLowerCase() ?? "";
  const location = useLocation();
  const navigate = useNavigate();
  const token = useMemo(() => tvTokenFromHash(location.hash), [location.hash]);
  useTvTheme();
  useWakeLock();
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [current, setCurrent] = useState<string | null>(null);
  const [arrivedFor, setArrivedFor] = useState<Activity | null>(null);
  /** Bumped to restart the 20 s on the board that's up (a winner just landed on it). */
  const [hold, setHold] = useState(0);
  /** Board id -> the newest winner the TV has accounted for (shown, or there before it looked). */
  const seen = useRef(new Map<string, string>());

  const read = useCallback(
    async (signal?: AbortSignal) => {
      if (!token) return setLoad({ kind: "missing" });
      try {
        const tv = await clubApi.tv(clubId, token, signal);
        // Each board starts from this state when its turn comes (no wait for its first GET).
        for (const b of tv.boards) primeGame(b);
        setLoad({ kind: "ready", tv });
      } catch (err) {
        if (signal?.aborted) return;
        if (err instanceof ApiError && err.status === 404) setLoad({ kind: "missing" });
        else setLoad((prev) => (prev.kind === "ready" ? prev : { kind: "offline", message: err instanceof Error ? err.message : "Couldn't reach JaxSquares." }));
      }
    },
    [clubId, token],
  );

  useEffect(() => {
    const ctrl = new AbortController();
    void read(ctrl.signal);
    const timer = setInterval(() => void read(ctrl.signal), CLUB_TV_POLL_MS);
    const onVisible = () => document.visibilityState === "visible" && void read(ctrl.signal);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      ctrl.abort();
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [read]);

  const tv = load.kind === "ready" ? load.tv : null;
  const order = useMemo(() => (tv ? rotationOrder(tv.boards) : []), [tv]);
  // Polls bring a new list every time; the rotation's clock only restarts when the boards themselves change.
  const orderKey = order.map((b) => b.game.id).join(",");
  const orderRef = useRef(order);
  orderRef.current = order;

  // Every poll: a winner new since the TV last looked sends it to that board now; on the board
  // that's up, it holds the board for another turn. What was there at first sight counts as seen.
  useEffect(() => {
    if (order.length === 0) {
      setCurrent(null);
      return;
    }
    for (const b of order) {
      if (!seen.current.has(b.game.id)) seen.current.set(b.game.id, latestWinner(b)?.id ?? "");
    }
    const up = current && order.some((b) => b.game.id === current) ? current : null;
    const upBoard = up ? order.find((b) => b.game.id === up) : undefined;
    const upWinner = upBoard ? latestWinner(upBoard) : null;
    if (up && upWinner && seen.current.get(up) !== upWinner.id) {
      // It celebrated there already (the board's own socket): just stay on it a while.
      seen.current.set(up, upWinner.id);
      setHold((n) => n + 1);
      return;
    }
    const jump = nextBoard(order.filter((b) => b.game.id !== up), null, seen.current);
    if (jump?.winner) {
      seen.current.set(jump.id, jump.winner.id);
      setArrivedFor(jump.winner);
      setCurrent(jump.id);
      return;
    }
    if (!up) {
      setArrivedFor(null);
      setCurrent(order[0].game.id);
    }
  }, [order, current]);

  // The rotation: the next board every CLUB_TV_ROTATE_MS (restarted by a switch, a hold or a new set of boards).
  useEffect(() => {
    if (!orderKey.includes(",") || !current) return;
    const timer = setTimeout(() => {
      const next = nextBoard(orderRef.current, current, seen.current);
      if (!next) return;
      if (next.winner) seen.current.set(next.id, next.winner.id);
      setArrivedFor(next.winner);
      setCurrent(next.id);
    }, CLUB_TV_ROTATE_MS);
    return () => clearTimeout(timer);
  }, [orderKey, current, hold]);

  const exit = () => navigate("/", { replace: true });

  if (load.kind === "loading") {
    return (
      <ClubTvShell>
        <Spinner size={40} />
      </ClubTvShell>
    );
  }
  if (load.kind === "missing") {
    return (
      <ClubTvShell state="missing">
        <EmptyState
          illustration={<Jax pose="peek" size={156} />}
          title="This TV link doesn't work anymore"
          description="The club may have made a new one. Ask whoever runs the club's boards for the new link."
        />
      </ClubTvShell>
    );
  }
  if (load.kind === "offline") {
    return (
      <ClubTvShell state="offline">
        <EmptyState
          art={<WifiOffIcon />}
          title="Couldn't load the club's boards"
          description={load.message}
          action={
            <Button size="lg" onClick={() => void read()}>
              Try again
            </Button>
          }
        />
      </ClubTvShell>
    );
  }

  const club = load.tv.club;
  if (!current || order.length === 0) {
    return (
      <ClubTvShell state={load.tv.active ? "empty" : "inactive"}>
        <ClubTitle club={club} />
        <p className="mt-[calc(var(--u)*2)] max-w-[60ch] text-center text-[length:calc(var(--u)*2.6)] font-semibold text-ink-muted">
          {load.tv.active ? "No boards right now. They show up here as soon as the club opens one." : "The venue's boards show here while its Venue add-on is active."}
        </p>
      </ClubTvShell>
    );
  }

  const index = order.findIndex((b) => b.game.id === current);
  return (
    <div data-testid="club-tv" data-board={current} data-boards={order.length}>
      <TvScreen
        key={current}
        id={current}
        onExit={exit}
        hideClub
        celebrate={arrivedFor}
        panelFooter={<ClubCorner club={club} index={index} total={order.length} />}
      />
    </div>
  );
}

/** The club's corner at the foot of the panel: its logo and name, and which board of how many. */
function ClubCorner({ club, index, total }: { club: ClubBrand; index: number; total: number }) {
  const named = shownClub(club);
  return (
    <div className="mt-auto flex min-w-0 items-center justify-between gap-[calc(var(--u)*2)] border-t border-line pt-[calc(var(--u)*1.6)]">
      {named ? <TvClubBrand club={named} corner /> : <span />}
      {total > 1 && (
        <p data-testid="club-tv-progress" className="flex shrink-0 items-center gap-[calc(var(--u)*0.8)] text-[length:calc(var(--u)*1.8)] font-bold text-ink-muted">
          <span>
            Board {index + 1} of {total}
          </span>
          <span aria-hidden className="flex gap-[calc(var(--u)*0.5)]">
            {Array.from({ length: total }, (_, i) => (
              <span key={i} className={cx("h-[calc(var(--u)*0.9)] w-[calc(var(--u)*0.9)] rounded-full", i === index ? "bg-brand-400" : "bg-ink/20")} />
            ))}
          </span>
        </p>
      )}
    </div>
  );
}

function ClubTitle({ club }: { club: ClubBrand }) {
  const named = shownClub(club);
  if (!named) return <p className="font-display text-[length:calc(var(--u)*5)] font-extrabold text-ink">Club TV</p>;
  return (
    <div className="flex flex-col items-center gap-[calc(var(--u)*2)]" data-testid="club-tv-title">
      <ClubMark club={named} size="inherit" className="h-[calc(var(--u)*16)] w-[calc(var(--u)*16)] text-[length:calc(var(--u)*8)]" />
      <p className="text-center font-display text-[length:calc(var(--u)*6)] font-extrabold leading-tight tracking-[-0.03em] text-ink">{named.name.trim()}</p>
    </div>
  );
}

/** The full screen around the club TV's own states (loading, a dead link, nothing on), awake and in TV units. */
function ClubTvShell({ children, state = "loading" }: { children: ReactNode; state?: string }) {
  const { awake } = useAwake<HTMLDivElement>();
  const unit = typeof window === "undefined" ? 7.2 : Math.min(window.innerWidth || 1280, window.innerHeight || 720) / 100;
  return (
    <div className="tv-root flex flex-col items-center justify-center p-[calc(var(--u)*4)]" data-awake={awake} data-testid="club-tv" data-state={state} style={{ "--u": `${unit}px` } as CSSProperties}>
      {children}
    </div>
  );
}
