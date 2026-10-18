// Who gets which notification for a game event, and what it says. Pure: the
// caller supplies the game and its players. The board name is the title (like a
// league name), so bodies stay short and never repeat it.
//
// Copy rules: short, fun, and never about money. A host's free-text prize note
// may be quoted as-is; a square price or prize amount never goes in a push
// (amounts stay in the app).

import { periodNote } from "../../shared/formats";
import type { Game, PeriodsPreset, Sport } from "../../shared/types";
import type { Member } from "../db";
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
  custom: "See every winning square.",
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
 * Deliveries for one event, before mutes (the store applies those). `members`
 * are the board's players with their clientIds (worker/db.ts getMembers); events
 * name people by public player id. The actor never hears about their own
 * action; host-only events go to the host alone.
 */
export function buildDeliveries(game: Game, members: Member[], event: NotifyEvent, now = Date.now()): Delivery[] {
  const audience = members.filter((m) => m.clientId && m.id !== event.actor);
  const everyone = [...new Set(audience.map((m) => m.clientId))];
  const to = (ids: string[], content: PushContent): Delivery[] => ids.map((clientId) => ({ clientId, content }));
  const hostOnly = audience.filter((m) => m.isHost || m.id === game.hostPlayerId).map((m) => m.clientId).slice(0, 1);
  const id = game.id;

  switch (event.kind) {
    case "numbers-drawn":
      return to(
        everyone,
        base(game, event.kind, { body: "🔢 Numbers are in. Find your squares.", tag: `${id}:numbers`, ttlSeconds: 6 * HOUR }),
      );

    case "game-starting": {
      const kickoff = KICKOFF[game.sport] ?? KICKOFF.other;
      const push = (body: string) => base(game, event.kind, { body, tag: `${id}:kickoff`, urgency: "high", ttlSeconds: HOUR / 2 });
      if (game.status === "open") {
        // Not drawn at kickoff (the host fee isn't paid): the host draws when they pay.
        const host = new Set(hostOnly);
        return [
          ...to(hostOnly, push(`${kickoff} Draw the numbers to get your board going.`)),
          ...to(everyone.filter((c) => !host.has(c)), push(`${kickoff} Waiting on the host to draw the numbers.`)),
        ];
      }
      const justDrawn = game.lockedAt !== null && now - game.lockedAt < JUST_DRAWN_MS;
      return to(everyone, push(`${kickoff} ${justDrawn ? "Numbers are in. Find your squares." : "The board is live."}`));
    }

    case "winner": {
      const winners = [...new Set(event.playerIds)];
      const tag = `${id}:win:${event.periodKey}`;
      const at = atPeriod(event.label);
      // The square's note (else the reverse square's); never an amount: amounts stay in the app.
      const prize = periodNote(game.format, game.prizes, event.periodKey)?.trim();
      const mine = base(game, event.kind, {
        body: `🎉 Your square hit ${at}!${prize ? ` 🏆 ${prize}` : ""}`,
        tag,
        urgency: "high",
        ttlSeconds: 6 * HOUR,
      });
      const names = winners.map((w) => members.find((m) => m.id === w)?.name || "Someone");
      const who = names.length === 1 ? `${names[0]}'s square hit` : `${joinNames(names)} hit`;
      // The last fixed period doubles as the wrap-up, so notify() can skip the separate "final" push.
      const isLast = event.periodKey === "final";
      const theirs = base(game, event.kind, {
        body: isLast ? `🏁 ${who} ${at}. ${WRAP_UP[game.format.periods]}` : `${who} ${at}.`,
        tag,
        ttlSeconds: 6 * HOUR,
      });
      const won = new Set(audience.filter((m) => winners.includes(m.id)).map((m) => m.clientId));
      return [...to([...won], mine), ...to(everyone.filter((c) => !won.has(c)), theirs)];
    }

    case "board-full": {
      // A linked board draws at kickoff on its own only once its host fee is paid.
      const linkedOpen = game.linkedEvent !== null && game.status === "open";
      const body = !linkedOpen
        ? "🔥 Your board is full. Time to draw numbers."
        : game.paid === false
          ? "🔥 Your board is full. Draw the numbers now, or pay ahead and Jax draws them at kickoff."
          : "🔥 Your board is full. Draw numbers now, or they'll draw at kickoff.";
      return to(hostOnly, base(game, event.kind, { body, tag: `${id}:full` }));
    }

    case "draw-reminder": {
      // Paid or drawn since the reminder was due: nothing to remind.
      if (game.status !== "open" || game.paid !== false || game.linkedEvent === null) return [];
      const mins = Math.round((game.linkedEvent.startsAt - now) / 60_000);
      const when = mins >= 45 ? "Kickoff in about an hour." : mins >= 2 ? `Kickoff in ${mins} minutes.` : "Kickoff's here.";
      const body = `⏰ ${when} Draw the numbers now, or pay ahead and Jax draws them at kickoff.`;
      return to(hostOnly, base(game, event.kind, { body, tag: `${id}:draw-reminder`, urgency: "high", ttlSeconds: HOUR }));
    }

    case "player-joined": {
      const joiner = [...members].reverse().find((p) => p.name === event.name);
      const count = members.filter((m) => m.name).length;
      const body = `${joiner?.emoji || "👋"} ${event.name} joined your board. ${count} ${count === 1 ? "player" : "players"} in.`;
      // Replaces the previous join quietly: the latest one carries the running count.
      return to(hostOnly, base(game, event.kind, { body, tag: `${id}:joined`, renotify: false, quiet: true, ttlSeconds: 12 * HOUR }));
    }

    case "final":
      return to(everyone, base(game, event.kind, { body: `🏁 That's a wrap. ${WRAP_UP[game.format.periods]}`, tag: `${id}:final` }));
  }
}
