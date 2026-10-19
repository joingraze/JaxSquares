import type { ReactNode } from "react";
import { Button, Card, Field, Pill, TextInput } from "../../../src/components/ui";
import { money } from "../../../src/lib/format";
import { StudioGrid, type StudioGridProps } from "./StudioGrid";
import { spring } from "../lib/anim";

/*
 * In-phone screens built from the app's own UI primitives (src/components/ui).
 * Layout numbers below are screen pts on the 375pt-wide phone:
 *   content starts at y=123; the grid card spans roughly y=219–585.
 */

export const GRID_CARD_TOP = 219;
export const PILLS_TOP = 179;

/** The game page (mirrors src/pages/GameView.tsx) around an animatable grid. */
export function GameScreen({
  name,
  claimed,
  pricePerSquare,
  locked,
  myCount,
  grid,
  scroll = 0,
  below,
}: {
  name: string;
  claimed: number;
  pricePerSquare: number;
  locked: boolean;
  myCount?: number;
  grid: StudioGridProps;
  scroll?: number;
  below?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4" style={{ transform: `translateY(${-scroll}px)` }}>
      <div>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h1 className="truncate text-xl font-extrabold">{name}</h1>
            <p className="text-sm text-slate-400">
              {grid.teamX} <span className="text-slate-600">vs</span> {grid.teamY}
            </p>
          </div>
          <Button variant="secondary" className="shrink-0 px-3 py-2 text-sm">
            Share
          </Button>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <Pill
            className={!locked ? "bg-brand-500/15 text-brand-300" : "bg-gold-500/15 text-gold-300"}
          >
            {!locked ? "● Claiming open" : "🔒 Numbers drawn"}
          </Pill>
          <Pill className="bg-pitch-700 text-slate-300">{claimed}/100 claimed</Pill>
          {pricePerSquare > 0 && (
            <Pill className="bg-pitch-700 text-slate-300">
              Pot {money(claimed * pricePerSquare)}
            </Pill>
          )}
          {myCount !== undefined && (
            <Pill className="bg-pitch-700 text-slate-300">You: {myCount}</Pill>
          )}
        </div>
      </div>
      <Card className="p-3">
        <StudioGrid {...grid} locked={locked} />
      </Card>
      {below}
    </div>
  );
}

export interface CreateValues {
  name: string;
  teamX: string;
  teamY: string;
  price: string;
  maxPerPlayer: string;
  payouts: [string, string, string, string];
  /** Field index with the focus ring, if any. */
  focus?: number;
}

const PERIOD_LABELS = ["Q1", "Half", "Q3", "Final"];

/** Compact take on src/pages/CreateGame.tsx using the same fields and primitives. */
export function CreateScreen({
  values,
  scroll = 0,
  pressed = 0,
}: {
  values: CreateValues;
  scroll?: number;
  pressed?: number;
}) {
  const focusCls = (i: number) =>
    values.focus === i ? " border-brand-500 ring-2 ring-brand-500/30" : "";
  const pot = (Number(values.price) || 0) * 100;
  return (
    <div className="flex flex-col gap-4" style={{ transform: `translateY(${-scroll}px)` }}>
      <div>
        <span className="text-sm text-slate-400">← Back</span>
        <h1 className="mt-1 text-2xl font-extrabold">New Squares game</h1>
      </div>
      <Card>
        <div className="flex flex-col gap-3">
          <Field label="Game name">
            <TextInput
              readOnly
              value={values.name}
              placeholder="Sunday Squares with the crew"
              className={focusCls(0)}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Top team (columns)">
              <TextInput
                readOnly
                value={values.teamX}
                placeholder="Chiefs"
                className={focusCls(1)}
              />
            </Field>
            <Field label="Side team (rows)">
              <TextInput
                readOnly
                value={values.teamY}
                placeholder="Eagles"
                className={focusCls(2)}
              />
            </Field>
          </div>
        </div>
      </Card>
      <Card>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Price / square">
            <TextInput
              readOnly
              value={values.price ? `$${values.price}` : ""}
              placeholder="$5"
              className={focusCls(3)}
            />
          </Field>
          <Field label="Max / player">
            <TextInput
              readOnly
              value={values.maxPerPlayer}
              placeholder="0"
              className={focusCls(4)}
            />
          </Field>
        </div>
        <p className="mt-3 text-sm text-slate-400">
          Full board pot: <span className="font-semibold text-brand-400">${pot}</span>
        </p>
      </Card>
      <Card>
        <p className="mb-3 text-sm font-medium text-slate-300">Payout per period</p>
        <div className="grid grid-cols-2 gap-3">
          {PERIOD_LABELS.map((label, i) => (
            <div key={label} className="flex items-center gap-2">
              <span className="w-10 text-sm font-semibold text-slate-200">{label}</span>
              <TextInput
                readOnly
                value={values.payouts[i] ? `$${values.payouts[i]}` : ""}
                placeholder="$0"
                className={"py-2" + focusCls(5 + i)}
              />
            </div>
          ))}
        </div>
      </Card>
      <Button className="w-full py-4 text-lg" style={{ transform: `scale(${1 - 0.04 * pressed})` }}>
        Create game
      </Button>
    </div>
  );
}

/** iOS-style share sheet sliding up from the bottom of the screen. */
export function ShareSheet({
  frame,
  start,
  end,
  gameName,
  picked,
}: {
  frame: number;
  start: number;
  end: number;
  gameName: string;
  /** True once the group chat target has been tapped. */
  picked: boolean;
}) {
  if (frame < start) return null;
  const inS = spring(frame - start, 30, { stiffness: 190, damping: 24 });
  const outS = frame > end ? spring(frame - end, 30, { stiffness: 190, damping: 24 }) : 0;
  const y = (1 - inS) * 520 + outS * 520;
  const people = [
    { name: "Sunday Crew 🏈", emoji: "🏈", color: "#22c55e" },
    { name: "Big Mike", emoji: "🧔", color: "#facc15" },
    { name: "Office Pool", emoji: "💼", color: "#38bdf8" },
    { name: "Mom", emoji: "💐", color: "#f472b6" },
  ];
  return (
    <>
      <div
        className="absolute inset-0"
        style={{ background: "rgba(0,0,0,0.45)", opacity: inS - outS, zIndex: 20 }}
      />
      <div
        className="absolute inset-x-0 bottom-0 rounded-t-[28px] px-4 pb-10 pt-3"
        style={{ top: 300, background: "#1c2233", transform: `translateY(${y}px)`, zIndex: 21 }}
      >
        <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-white/25" />
        <div className="flex items-center gap-3 rounded-2xl bg-white/5 p-3">
          <span className="grid h-12 w-12 shrink-0 grid-cols-2 grid-rows-2 gap-0.5 rounded-xl bg-pitch-800 p-1.5">
            <span className="rounded-sm bg-brand-500" />
            <span className="rounded-sm bg-accent-500" />
            <span className="rounded-sm bg-gold-500" />
            <span className="rounded-sm bg-rose-500" />
          </span>
          <span className="min-w-0">
            <span className="block text-[15px] font-bold">Join my squares pool: {gameName}</span>
            <span className="block text-[13px] text-slate-400">
              JaxSquares · tap to claim squares
            </span>
          </span>
        </div>
        <div className="mt-5 flex justify-between px-1">
          {people.map((p, i) => (
            <div key={p.name} className="flex w-[74px] flex-col items-center gap-1.5">
              <span
                className="grid h-[58px] w-[58px] place-items-center rounded-full text-2xl"
                style={{
                  background: p.color + "33",
                  boxShadow: i === 0 && picked ? `0 0 0 3px ${p.color}` : undefined,
                }}
              >
                {p.emoji}
              </span>
              <span className="text-center text-[11px] leading-tight text-slate-300">{p.name}</span>
            </div>
          ))}
        </div>
        <div className="mt-5 flex justify-between px-1">
          {[
            ["💬", "Messages"],
            ["✉️", "Mail"],
            ["🔗", "Copy link"],
            ["⋯", "More"],
          ].map(([icon, label]) => (
            <div key={label} className="flex w-[74px] flex-col items-center gap-1.5">
              <span className="grid h-[54px] w-[54px] place-items-center rounded-2xl bg-white/10 text-2xl">
                {icon}
              </span>
              <span className="text-[11px] text-slate-300">{label}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
