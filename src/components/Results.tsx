import type { GameState } from "../../shared/types";
import { resolveResults } from "../../shared/squares";
import { money } from "../lib/format";
import { Card } from "./ui";

export function Results({ state }: { state: GameState }) {
  const { game, squares, scores } = state;
  if (game.status !== "locked") return null;

  const results = resolveResults(game, squares, scores);
  const labelFor = (key: string) => game.periods.find((p) => p.key === key)?.label ?? key;
  const scoreFor = (key: string) => scores.find((s) => s.periodKey === key);

  if (results.length === 0) {
    return (
      <Card>
        <h2 className="mb-1 font-bold">Winners</h2>
        <p className="text-sm text-slate-400">
          No scores recorded yet. Winners appear here as each period is scored.
        </p>
      </Card>
    );
  }

  return (
    <Card>
      <h2 className="mb-3 font-bold">🏆 Winners</h2>
      <div className="flex flex-col gap-2">
        {results.map((r) => {
          const score = scoreFor(r.periodKey);
          return (
            <div
              key={r.periodKey}
              className="flex items-center justify-between rounded-xl bg-pitch-800/70 px-3 py-2.5"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">{labelFor(r.periodKey)}</span>
                  {score && (
                    <span className="text-xs text-slate-500">
                      {game.teamX} {score.scoreX} – {score.scoreY} {game.teamY}
                    </span>
                  )}
                </div>
                <div className="mt-0.5 truncate text-sm">
                  {r.winner ? (
                    <span className="font-bold text-brand-400">{r.winner.playerName}</span>
                  ) : (
                    <span className="text-slate-500">Unclaimed square</span>
                  )}
                </div>
              </div>
              {r.payout > 0 && (
                <span className="shrink-0 rounded-lg bg-brand-500/15 px-2.5 py-1 text-sm font-bold text-brand-300">
                  {money(r.payout)}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
