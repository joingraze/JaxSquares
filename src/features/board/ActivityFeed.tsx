// Compact live feed of what's happening on the board.

import { useState } from "react";
import type { Activity, GameState } from "../../../shared/types";
import { FootballIcon, LockIcon, SparklesIcon, TrophyIcon } from "../../components/icons";
import { Avatar, cx } from "../../components/ui";
import { relativeTime } from "../../lib/format";
import { describeActivity } from "../notifications/activity";
import { fallbackActivityText } from "./boardModel";

const COLLAPSED = 5;

export function activityText(a: Activity, state: GameState, me: string): string {
  let text: string | null = null;
  try {
    text = describeActivity(a, state, me)?.text ?? null;
  } catch {
    text = null;
  }
  return text || fallbackActivityText(a, state, me);
}

export function ActivityFeed({ state, me, now }: { state: GameState; me: string; now: number }) {
  const [all, setAll] = useState(false);
  const items = state.activity.slice(0, all ? 30 : COLLAPSED);
  if (items.length === 0) return null;
  const byId = new Map(state.players.map((p) => [p.id, p]));
  return (
    <div className="overflow-hidden rounded-card bg-surface-2 shadow-card ring-1 ring-inset ring-line">
      <ul className="flex flex-col py-1.5">
        {items.map((a, i) => {
          const actor = a.actor ? byId.get(a.actor) : undefined;
          const win = a.type === "winner";
          return (
            <li key={a.id} className={cx("flex items-center gap-3 px-4 py-2", i === 0 && "animate-fade-in")}>
              {actor && a.type !== "winner" && a.type !== "score" ? (
                <Avatar name={actor.name} color={actor.color} emoji={actor.emoji} size="xs" decorative />
              ) : (
                <span
                  aria-hidden
                  className={cx(
                    "grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full",
                    win ? "bg-gold-400 text-ink-inverse" : a.type === "score" ? "bg-live-500 text-white" : "bg-surface-4 text-ink-muted",
                  )}
                >
                  {win ? <TrophyIcon size={12} filled /> : a.type === "score" ? <FootballIcon size={12} /> : a.type === "locked" ? <LockIcon size={11} /> : <SparklesIcon size={12} />}
                </span>
              )}
              <span className={cx("min-w-0 flex-1 text-subhead leading-snug", win ? "font-bold text-gold-200" : "text-ink")}>
                {activityText(a, state, me)}
              </span>
              <time className="shrink-0 text-caption tabular-nums text-ink-subtle" dateTime={new Date(a.at).toISOString()}>
                {relativeTime(a.at, now)}
              </time>
            </li>
          );
        })}
      </ul>
      {state.activity.length > COLLAPSED && (
        <button
          type="button"
          onClick={() => setAll((v) => !v)}
          className="w-full border-t border-line py-3 text-subhead font-bold text-brand-300 active:bg-white/5"
        >
          {all ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}
