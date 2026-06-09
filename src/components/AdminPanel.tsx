import { useState } from "react";
import type { GameState, Score } from "../../shared/types";
import { api, ApiError } from "../lib/api";
import { Button, Card } from "./ui";
import { money } from "../lib/format";

export function AdminPanel({
  state,
  adminToken,
  onState,
}: {
  state: GameState;
  adminToken: string;
  onState: (s: GameState) => void;
}) {
  const { game, squares } = state;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function lock() {
    if (!confirm("Lock the board and randomly draw the 0–9 numbers? Squares can’t change after this."))
      return;
    setBusy(true);
    setError(null);
    try {
      const { state: next } = await api.lock(game.id, adminToken);
      onState(next);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not lock the game.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="border-gold-500/30 bg-gold-500/5">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-lg">🛠️</span>
        <h2 className="font-bold">Commissioner tools</h2>
      </div>

      {error && <p className="mb-3 text-sm text-rose-300">{error}</p>}

      {game.status === "open" ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-slate-300">
            {squares.length} / 100 squares claimed. Lock the board once everyone’s in to draw the
            numbers.
          </p>
          <Button onClick={lock} disabled={busy || squares.length === 0} className="w-full">
            {busy ? "Drawing…" : "🎲 Lock board & draw numbers"}
          </Button>
          {squares.length === 0 && (
            <p className="text-xs text-slate-500">Claim at least one square first.</p>
          )}
        </div>
      ) : (
        <ScoreEditor state={state} adminToken={adminToken} onState={onState} />
      )}
    </Card>
  );
}

function ScoreEditor({
  state,
  adminToken,
  onState,
}: {
  state: GameState;
  adminToken: string;
  onState: (s: GameState) => void;
}) {
  const { game, scores } = state;
  const scoreFor = (key: string): Score | undefined => scores.find((s) => s.periodKey === key);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-slate-300">
        Enter the running score at each period. Winners are called automatically.
      </p>
      {game.periods.map((p) => (
        <PeriodRow
          key={p.key}
          gameId={game.id}
          adminToken={adminToken}
          periodKey={p.key}
          label={p.label}
          teamX={game.teamX}
          teamY={game.teamY}
          payout={game.payouts[p.key] ?? 0}
          current={scoreFor(p.key)}
          onState={onState}
        />
      ))}
    </div>
  );
}

function PeriodRow({
  gameId,
  adminToken,
  periodKey,
  label,
  teamX,
  teamY,
  payout,
  current,
  onState,
}: {
  gameId: string;
  adminToken: string;
  periodKey: string;
  label: string;
  teamX: string;
  teamY: string;
  payout: number;
  current?: Score;
  onState: (s: GameState) => void;
}) {
  const [x, setX] = useState(current ? String(current.scoreX) : "");
  const [y, setY] = useState(current ? String(current.scoreY) : "");
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      const { state } = await api.setScore(gameId, adminToken, {
        periodKey,
        scoreX: Number(x) || 0,
        scoreY: Number(y) || 0,
      });
      onState(state);
    } finally {
      setBusy(false);
    }
  }

  async function clear() {
    setBusy(true);
    try {
      const { state } = await api.deleteScore(gameId, adminToken, periodKey);
      onState(state);
      setX("");
      setY("");
    } finally {
      setBusy(false);
    }
  }

  const dirty = x !== (current ? String(current.scoreX) : "") || y !== (current ? String(current.scoreY) : "");

  return (
    <div className="rounded-xl bg-pitch-800/70 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-semibold">{label}</span>
        {payout > 0 && <span className="text-xs text-brand-400">{money(payout)}</span>}
      </div>
      <div className="flex items-end gap-2">
        <ScoreField label={teamX} value={x} onChange={setX} />
        <span className="pb-3 text-slate-500">–</span>
        <ScoreField label={teamY} value={y} onChange={setY} />
        <Button
          variant={dirty ? "primary" : "secondary"}
          onClick={save}
          disabled={busy}
          className="px-3 py-2 text-sm"
        >
          {current ? "Update" : "Save"}
        </Button>
        {current && (
          <Button variant="ghost" onClick={clear} disabled={busy} className="px-2 py-2 text-sm">
            ✕
          </Button>
        )}
      </div>
    </div>
  );
}

function ScoreField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex-1">
      <span className="mb-1 block truncate text-[11px] text-slate-400">{label}</span>
      <input
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^0-9]/g, ""))}
        placeholder="0"
        className="w-full rounded-lg border border-white/10 bg-pitch-900 px-2 py-2 text-center text-lg font-bold outline-none focus:border-brand-500"
      />
    </label>
  );
}
