import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useGameState } from "../lib/useGameState";
import { api, ApiError } from "../lib/api";
import {
  getAdminToken,
  getClientId,
  getPlayerColor,
  getPlayerName,
  setPlayerColor,
  setPlayerName,
} from "../lib/identity";
import { cellKey, resolveResults } from "../../shared/squares";
import { money } from "../lib/format";
import { Button, Card, Pill, Spinner } from "../components/ui";
import { SquaresGrid } from "../components/SquaresGrid";
import { PlayerBar } from "../components/PlayerBar";
import { AdminPanel } from "../components/AdminPanel";
import { Results } from "../components/Results";
import { ShareButton } from "../components/ShareButton";
import type { GameState } from "../../shared/types";

export default function GameView() {
  const { id } = useParams<{ id: string }>();
  const { state, setState, error, loading } = useGameState(id);
  const myClientId = getClientId();
  const adminToken = id ? getAdminToken(id) : null;

  const [name, setNameState] = useState(getPlayerName());
  const [color, setColorState] = useState(getPlayerColor());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => setPlayerName(name), [name]);
  useEffect(() => setPlayerColor(color), [color]);

  if (loading) return <Spinner label="Loading game…" />;
  if (error === "notfound") return <GameMissing />;
  if (error === "network" && !state) return <GameMissing network />;
  if (!state) return <Spinner />;

  const { game, squares } = state;
  const byCell = new Map(squares.map((s) => [cellKey(s.row, s.col), s]));
  const open = game.status === "open";

  const claimable = [...selected].filter((k) => !byCell.has(k));
  const releasable = [...selected].filter((k) => byCell.get(k)?.clientId === myClientId);
  const myCount = squares.filter((s) => s.clientId === myClientId).length;

  const winningCells = new Set(
    resolveResults(game, squares, state.scores)
      .filter((r) => r.cell)
      .map((r) => cellKey(r.cell!.row, r.cell!.col)),
  );

  function onCellTap(row: number, col: number) {
    if (!open) return;
    const key = cellKey(row, col);
    const sq = byCell.get(key);
    if (sq && sq.clientId !== myClientId) return; // someone else's
    setActionError(null);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function parse(keys: string[]) {
    return keys.map((k) => {
      const [row, col] = k.split(",").map(Number);
      return { row, col };
    });
  }

  async function claim() {
    if (!id) return;
    if (!name.trim()) {
      setActionError("Add your name first.");
      return;
    }
    setBusy(true);
    setActionError(null);
    try {
      const res = await api.claim(id, {
        clientId: myClientId,
        playerName: name.trim(),
        playerColor: color,
        cells: parse(claimable),
      });
      applyState(res.state);
      if (res.skipped > 0) setActionError(`${res.skipped} square(s) were just taken.`);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Could not claim. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function release() {
    if (!id) return;
    setBusy(true);
    setActionError(null);
    try {
      const res = await api.release(id, { clientId: myClientId, cells: parse(releasable) });
      applyState(res.state);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Could not update. Try again.");
    } finally {
      setBusy(false);
    }
  }

  function applyState(next: GameState) {
    setState(next);
    setSelected(new Set());
  }

  return (
    <div className="flex flex-col gap-4 pb-28">
      {/* Header */}
      <div>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h1 className="truncate text-xl font-extrabold">{game.name}</h1>
            <p className="text-sm text-slate-400">
              {game.teamX} <span className="text-slate-600">vs</span> {game.teamY}
            </p>
          </div>
          <ShareButton gameName={game.name} className="shrink-0 px-3 py-2 text-sm" />
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <Pill className={open ? "bg-brand-500/15 text-brand-300" : "bg-gold-500/15 text-gold-300"}>
            {open ? "● Claiming open" : "🔒 Numbers drawn"}
          </Pill>
          <Pill className="bg-pitch-700 text-slate-300">{squares.length}/100 claimed</Pill>
          {game.pricePerSquare > 0 && (
            <Pill className="bg-pitch-700 text-slate-300">
              Pot {money(squares.length * game.pricePerSquare)}
            </Pill>
          )}
          <Pill className="bg-pitch-700 text-slate-300">You: {myCount}</Pill>
        </div>
      </div>

      {adminToken && <AdminPanel state={state} adminToken={adminToken} onState={applyState} />}

      {open && (
        <PlayerBar name={name} color={color} onName={setNameState} onColor={setColorState} />
      )}

      <Card className="p-3">
        <SquaresGrid
          game={game}
          squares={squares}
          myClientId={myClientId}
          selected={selected}
          winningCells={winningCells}
          onCellTap={onCellTap}
        />
        {open && (
          <p className="mt-3 text-center text-xs text-slate-500">
            Tap empty squares to claim them. Tap your own to release.
          </p>
        )}
      </Card>

      <Results state={state} />

      {actionError && (
        <p className="rounded-xl bg-rose-500/10 px-3 py-2 text-center text-sm text-rose-300">
          {actionError}
        </p>
      )}

      {/* Sticky action bar */}
      {open && (claimable.length > 0 || releasable.length > 0) && (
        <div className="safe-bottom fixed inset-x-0 bottom-0 z-30 mx-auto max-w-md px-4 pt-2">
          <div className="flex gap-2 rounded-2xl border border-white/10 bg-pitch-800/95 p-2 shadow-2xl shadow-black/50 backdrop-blur">
            {releasable.length > 0 && (
              <Button variant="danger" onClick={release} disabled={busy} className="flex-1">
                Release {releasable.length}
              </Button>
            )}
            {claimable.length > 0 && (
              <Button onClick={claim} disabled={busy} className="flex-1">
                {busy ? "…" : `Claim ${claimable.length}`}
                {game.pricePerSquare > 0 &&
                  ` · ${money(claimable.length * game.pricePerSquare)}`}
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function GameMissing({ network = false }: { network?: boolean }) {
  return (
    <div className="flex flex-col items-center gap-3 py-20 text-center">
      <div className="text-5xl">{network ? "📡" : "🔍"}</div>
      <h1 className="text-xl font-bold">{network ? "Can’t reach the game" : "Game not found"}</h1>
      <p className="text-slate-400">
        {network
          ? "Check your connection and try again."
          : "Double-check the game code or link."}
      </p>
    </div>
  );
}
