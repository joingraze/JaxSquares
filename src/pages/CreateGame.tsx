import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Card, Field, Select, TextInput } from "../components/ui";
import { api, ApiError } from "../lib/api";
import { saveAdminToken } from "../lib/identity";
import { DEFAULT_FOOTBALL_PERIODS, type Period, type Sport } from "../../shared/types";

const SPORTS: { value: Sport; label: string }[] = [
  { value: "football", label: "🏈 Football" },
  { value: "basketball", label: "🏀 Basketball" },
  { value: "baseball", label: "⚾ Baseball" },
  { value: "hockey", label: "🏒 Hockey" },
  { value: "soccer", label: "⚽ Soccer" },
  { value: "other", label: "🎯 Other" },
];

export default function CreateGame() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [sport, setSport] = useState<Sport>("football");
  const [teamX, setTeamX] = useState("");
  const [teamY, setTeamY] = useState("");
  const [price, setPrice] = useState("5");
  const [maxPerPlayer, setMaxPerPlayer] = useState("0");
  const [periods] = useState<Period[]>(DEFAULT_FOOTBALL_PERIODS);
  const [payouts, setPayouts] = useState<Record<string, string>>(() =>
    Object.fromEntries(DEFAULT_FOOTBALL_PERIODS.map((p) => [p.key, ""])),
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pot = (Number(price) || 0) * 100;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const { game, adminToken } = await api.createGame({
        name: name.trim() || "Squares Pool",
        sport,
        teamX: teamX.trim() || "Team X",
        teamY: teamY.trim() || "Team Y",
        pricePerSquare: Number(price) || 0,
        maxPerPlayer: Math.max(0, Math.trunc(Number(maxPerPlayer) || 0)),
        periods,
        payouts: Object.fromEntries(periods.map((p) => [p.key, Number(payouts[p.key]) || 0])),
      });
      saveAdminToken(game.id, adminToken);
      navigate(`/g/${game.id}`, { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create game. Try again.");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <div>
        <button type="button" onClick={() => navigate("/")} className="text-sm text-slate-400">
          ← Back
        </button>
        <h1 className="mt-2 text-2xl font-extrabold">New Squares game</h1>
      </div>

      <Card>
        <div className="flex flex-col gap-4">
          <Field label="Game name">
            <TextInput
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Sunday Squares with the crew"
              maxLength={80}
            />
          </Field>
          <Field label="Sport">
            <Select value={sport} onChange={(e) => setSport(e.target.value as Sport)}>
              {SPORTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Top team (columns)">
              <TextInput
                value={teamX}
                onChange={(e) => setTeamX(e.target.value)}
                placeholder="Chiefs"
                maxLength={40}
              />
            </Field>
            <Field label="Side team (rows)">
              <TextInput
                value={teamY}
                onChange={(e) => setTeamY(e.target.value)}
                placeholder="Eagles"
                maxLength={40}
              />
            </Field>
          </div>
        </div>
      </Card>

      <Card>
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Price / square" hint="Set 0 for a free pool">
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                  $
                </span>
                <TextInput
                  inputMode="decimal"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  className="pl-7"
                />
              </div>
            </Field>
            <Field label="Max / player" hint="0 = no limit">
              <TextInput
                inputMode="numeric"
                value={maxPerPlayer}
                onChange={(e) => setMaxPerPlayer(e.target.value)}
              />
            </Field>
          </div>
          <p className="text-sm text-slate-400">
            Full board pot: <span className="font-semibold text-brand-400">${pot || 0}</span>
          </p>
        </div>
      </Card>

      <Card>
        <p className="mb-3 text-sm font-medium text-slate-300">Payout per period</p>
        <div className="flex flex-col gap-3">
          {periods.map((p) => (
            <div key={p.key} className="flex items-center gap-3">
              <span className="w-16 text-sm font-semibold text-slate-200">{p.label}</span>
              <div className="relative flex-1">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                  $
                </span>
                <TextInput
                  inputMode="decimal"
                  value={payouts[p.key]}
                  onChange={(e) => setPayouts((prev) => ({ ...prev, [p.key]: e.target.value }))}
                  placeholder="0"
                  className="pl-7"
                />
              </div>
            </div>
          ))}
        </div>
      </Card>

      {error && (
        <p className="rounded-xl bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{error}</p>
      )}

      <Button type="submit" disabled={submitting} className="w-full py-4 text-lg">
        {submitting ? "Creating…" : "Create game"}
      </Button>
    </form>
  );
}
