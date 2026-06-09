import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Card, TextInput } from "../components/ui";

const ROSTER = [
  { name: "Super Bowl Squares", sport: "🏈", live: true },
  { name: "King of the Hill", sport: "⛳", live: false },
  { name: "Pick'em Pools", sport: "🏀", live: false },
  { name: "Bracket Battles", sport: "🏆", live: false },
];

export default function Home() {
  const navigate = useNavigate();
  const [code, setCode] = useState("");

  function join(e: React.FormEvent) {
    e.preventDefault();
    const id = code.trim().toLowerCase();
    if (id) navigate(`/g/${id}`);
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="pt-2">
        <h1 className="text-3xl font-extrabold leading-tight tracking-tight">
          Run the squares pool your group actually wants to play.
        </h1>
        <p className="mt-3 text-slate-400">
          Spin up a Super Bowl Squares board in seconds, share a link, and let friends claim
          squares from their phones. Numbers drawn live, winners called automatically.
        </p>
      </section>

      <Button onClick={() => navigate("/new")} className="w-full py-4 text-lg">
        + Create a Squares game
      </Button>

      <Card>
        <form onSubmit={join} className="flex flex-col gap-3">
          <p className="text-sm font-medium text-slate-300">Have a game code or link?</p>
          <div className="flex gap-2">
            <TextInput
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="e.g. k7m4p2"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              aria-label="Game code"
            />
            <Button type="submit" variant="secondary" disabled={!code.trim()}>
              Join
            </Button>
          </div>
        </form>
      </Card>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
          On the roster
        </h2>
        <div className="grid grid-cols-2 gap-3">
          {ROSTER.map((g) => (
            <div
              key={g.name}
              className={`rounded-xl border border-white/5 bg-pitch-900/60 p-3 ${
                g.live ? "" : "opacity-60"
              }`}
            >
              <div className="text-2xl">{g.sport}</div>
              <div className="mt-1 text-sm font-semibold">{g.name}</div>
              <div className="mt-1 text-xs text-slate-500">
                {g.live ? "Available now" : "Coming soon"}
              </div>
            </div>
          ))}
        </div>
      </section>

      <HowItWorks />
    </div>
  );
}

function HowItWorks() {
  const steps = [
    "Create a board and set the buy-in & payouts.",
    "Share the link — friends claim squares from any phone.",
    "Lock the board to randomly draw the 0–9 numbers.",
    "Enter scores each quarter; winners light up instantly.",
  ];
  return (
    <section className="rounded-2xl border border-white/5 bg-pitch-900/40 p-4">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
        How it works
      </h2>
      <ol className="flex flex-col gap-2.5">
        {steps.map((s, i) => (
          <li key={i} className="flex gap-3 text-sm text-slate-300">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand-500/15 text-xs font-bold text-brand-400">
              {i + 1}
            </span>
            <span>{s}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
