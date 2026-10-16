// Who gets which notification for a game event, and what it says. Pure: the
// caller supplies the game and its players. The board name is the title (like a
// league name), so bodies stay short and never repeat it.
//
// Copy rules: short, fun, and never about money. A host's free-text prize note
// may be quoted as-is.

import type { Game, PeriodsPreset, Player, Sport } from "../../shared/types";
import type { Delivery, NotifyEvent, NotifyKind, PushContent } from "./types";

const HOUR = 60 * 60;

/** Numbers drawn this recently count as "just drawn" for the kickoff copy. */
export const JUST_DRAWN_MS = 2 * 60 * 1000;

const KICKOFF: Record<Sport, string> = {
  football: "🏈 Kickoff!",
  soccer: "⚽ Kickoff!",
  basketball: "🏀 Tip-off!",
  baseball: "⚾ First pitch!",
  hockey: "🏒 Puck drop!",
  other: "⏱️ Game on!",
};

const WRAP_UP: Record<PeriodsPreset, string> = {
  quarters: "See who won each quarter.",
  halves: "See who won each half.",
  final: "See the winning square.",
  "every-score": "See every winning square.",
};

/** Natural phrasing for a period label: "in Q1", "at Half", "at the Final", "on Score 3". */
export function atPeriod(label: string): string {
  if (/^Q\d$/.test(label)) return `in ${label}`;
  if (label === "Half") return "at Half";
  if (label === "Final") return "at the Final";
  return `on ${label}`;
}

/** "Jax", "Jax and Sam", "Jax, Sam and Lee". */
export function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

function base(game: Game, kind: NotifyKind, over: Partial<PushContent> & Pick<PushContent, "body" | "tag">): PushContent {
  return {
    title: game.name,
    url: `/g/${game.id}`,
    gameId: game.id,
    kind,
    renotify: true,
    quiet: false,
    urgency: "normal",
    ttlSeconds: 24 * HOUR,
    ...over,
  };
}

/**
 * Deliveries for one event, before mutes (the store applies those). The actor
 * never hears about their own action; host-only events go to the host alone.
 */
export function buildDeliveries(game: Game, players: Player[], event: NotifyEvent, now = Date.now()): Delivery[] {
  const everyone = [...new Set([game.hostClientId, ...players.map((p) => p.clientId)])].filter(
    (id) => id && id !== event.actor,
  );
  const to = (ids: string[], content: PushContent): Delivery[] => ids.map((clientId) => ({ clientId, content }));
  const hostOnly = everyone.includes(game.hostClientId) ? [game.hostClientId] : [];
  const id = game.id;

  switch (event.kind) {
    case "numbers-drawn":
      return to(
        everyone,
        base(game, event.kind, { body: "🔢 Numbers are in. Find your squares.", tag: `${id}:numbers`, ttlSeconds: 6 * HOUR }),
      );

    case "game-starting": {
      const justDrawn = game.lockedAt !== null && now - game.lockedAt < JUST_DRAWN_MS;
      const body = `${KICKOFF[game.sport] ?? KICKOFF.other} ${justDrawn ? "Numbers are in. Find your squares." : "The board is live."}`;
      return to(everyone, base(game, event.kind, { body, tag: `${id}:kickoff`, urgency: "high", ttlSeconds: HOUR / 2 }));
    }

    case "winner": {
      const winners = [...new Set(event.clientIds)];
      const tag = `${id}:win:${event.periodKey}`;
      const at = atPeriod(event.label);
      const prize = game.prizes[event.periodKey]?.trim();
      const mine = base(game, event.kind, {
        body: `🎉 Your square hit ${at}!${prize ? ` 🏆 ${prize}` : ""}`,
        tag,
        urgency: "high",
        ttlSeconds: 6 * HOUR,
      });
      const names = winners.map((w) => players.find((p) => p.clientId === w)?.name || "Someone");
      const who = names.length === 1 ? `${names[0]}'s square hit` : `${joinNames(names)} hit`;
      // The last fixed period doubles as the wrap-up, so notify() can skip the separate "final" push.
      const isLast = event.periodKey === "final";
      const theirs = base(game, event.kind, {
        body: isLast ? `🏁 ${who} ${at}. ${WRAP_UP[game.format.periods]}` : `${who} ${at}.`,
        tag,
        ttlSeconds: 6 * HOUR,
      });
      return [
        ...to(everyone.filter((c) => winners.includes(c)), mine),
        ...to(everyone.filter((c) => !winners.includes(c)), theirs),
      ];
    }

    case "board-full": {
      const autoDraw = game.linkedEvent !== null && game.status === "open";
      const body = autoDraw
        ? "🔥 Your board is full. Draw numbers now, or they'll draw at kickoff."
        : "🔥 Your board is full. Time to draw numbers.";
      return to(hostOnly, base(game, event.kind, { body, tag: `${id}:full` }));
    }

    case "player-joined": {
      const joiner = [...players].reverse().find((p) => p.name === event.name);
      const count = players.length;
      const body = `${joiner?.emoji || "👋"} ${event.name} joined your board. ${count} ${count === 1 ? "player" : "players"} in.`;
      // Replaces the previous join quietly: the latest one carries the running count.
      return to(hostOnly, base(game, event.kind, { body, tag: `${id}:joined`, renotify: false, quiet: true, ttlSeconds: 12 * HOUR }));
    }

    case "final":
      return to(everyone, base(game, event.kind, { body: `🏁 That's a wrap. ${WRAP_UP[game.format.periods]}`, tag: `${id}:final` }));
  }
}
