// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { NotifyEvent } from "./types";
import { atPeriod, buildDeliveries, joinNames } from "./copy";
import { HOST, makeGame, makePlayer } from "./testFixtures";

const NOW = 1_760_000_100_000;
const players = [
  makePlayer(HOST, "Jordan", { emoji: "🦊" }),
  makePlayer("client-jax-001", "Jax"),
  makePlayer("client-sam-002", "Sam", { emoji: "🐐" }),
];
const bodyFor = (ds: ReturnType<typeof buildDeliveries>, clientId: string) => ds.find((d) => d.clientId === clientId)?.content.body;
const recipients = (ds: ReturnType<typeof buildDeliveries>) => ds.map((d) => d.clientId).sort();

describe("atPeriod / joinNames", () => {
  it("phrases period labels naturally", () => {
    expect(atPeriod("Q1")).toBe("in Q1");
    expect(atPeriod("Half")).toBe("at Half");
    expect(atPeriod("Final")).toBe("at the Final");
    expect(atPeriod("Score 3")).toBe("on Score 3");
  });

  it("joins names like a person would", () => {
    expect(joinNames(["Jax"])).toBe("Jax");
    expect(joinNames(["Jax", "Sam"])).toBe("Jax and Sam");
    expect(joinNames(["Jax", "Sam", "Lee"])).toBe("Jax, Sam and Lee");
  });
});

describe("buildDeliveries", () => {
  it("titles every push with the board and deep-links to it", () => {
    const ds = buildDeliveries(makeGame(), players, { kind: "numbers-drawn" }, NOW);
    expect(ds).toHaveLength(3);
    for (const d of ds) {
      expect(d.content).toMatchObject({ title: "Super Bowl LX", url: "/g/abc234", gameId: "abc234", kind: "numbers-drawn" });
    }
    expect(ds[0].content.body).toBe("🔢 Numbers are in. Find your squares.");
  });

  it("never tells the actor about their own action", () => {
    const ds = buildDeliveries(makeGame(), players, { kind: "numbers-drawn", actor: HOST }, NOW);
    expect(recipients(ds)).toEqual(["client-jax-001", "client-sam-002"]);
  });

  it("includes the host even before they've joined as a player", () => {
    const ds = buildDeliveries(makeGame(), players.slice(1), { kind: "final" }, NOW);
    expect(recipients(ds)).toContain(HOST);
  });

  describe("winner", () => {
    const event: NotifyEvent = { kind: "winner", periodKey: "q2", label: "Half", clientIds: ["client-jax-001"] };

    it("congratulates the winner and tells everyone else who hit", () => {
      const ds = buildDeliveries(makeGame(), players, event, NOW);
      expect(bodyFor(ds, "client-jax-001")).toBe("🎉 Your square hit at Half!");
      expect(bodyFor(ds, HOST)).toBe("Jax's square hit at Half.");
      expect(bodyFor(ds, "client-sam-002")).toBe("Jax's square hit at Half.");
      const mine = ds.find((d) => d.clientId === "client-jax-001")!.content;
      expect(mine).toMatchObject({ urgency: "high", tag: "abc234:win:q2", renotify: true, quiet: false });
    });

    it("quotes the host's prize note for the winner", () => {
      const ds = buildDeliveries(makeGame({ prizes: { q2: "Loser buys wings" } }), players, event, NOW);
      expect(bodyFor(ds, "client-jax-001")).toBe("🎉 Your square hit at Half! 🏆 Loser buys wings");
      expect(bodyFor(ds, "client-sam-002")).toBe("Jax's square hit at Half.");
    });

    it("names both winners on a reverse board", () => {
      const ds = buildDeliveries(makeGame(), players, { ...event, periodKey: "q1", label: "Q1", clientIds: ["client-jax-001", "client-sam-002"] }, NOW);
      expect(bodyFor(ds, HOST)).toBe("Jax and Sam hit in Q1.");
      expect(bodyFor(ds, "client-sam-002")).toBe("🎉 Your square hit in Q1!");
    });

    it("wraps up the game in the last period's push", () => {
      const ds = buildDeliveries(makeGame(), players, { ...event, periodKey: "final", label: "Final" }, NOW);
      expect(bodyFor(ds, "client-jax-001")).toBe("🎉 Your square hit at the Final!");
      expect(bodyFor(ds, HOST)).toBe("🏁 Jax's square hit at the Final. See who won each quarter.");
      const halves = makeGame({ format: { periods: "halves", reverse: false, boardSize: 100, freshNumbers: false } });
      expect(bodyFor(buildDeliveries(halves, players, { ...event, periodKey: "final", label: "Final" }, NOW), HOST)).toBe(
        "🏁 Jax's square hit at the Final. See who won each half.",
      );
    });

    it("dedupes a player who won both the square and its reverse", () => {
      const ds = buildDeliveries(makeGame(), players, { ...event, clientIds: ["client-jax-001", "client-jax-001"] }, NOW);
      expect(ds.filter((d) => d.clientId === "client-jax-001")).toHaveLength(1);
    });
  });

  describe("game-starting", () => {
    it("says the board is live", () => {
      const ds = buildDeliveries(makeGame({ lockedAt: NOW - 60 * 60 * 1000 }), players, { kind: "game-starting" }, NOW);
      expect(ds[0].content).toMatchObject({ body: "🏈 Kickoff! The board is live.", urgency: "high", ttlSeconds: 1800 });
    });

    it("folds in the numbers when kickoff just drew them", () => {
      const ds = buildDeliveries(makeGame({ lockedAt: NOW - 1000 }), players, { kind: "game-starting" }, NOW);
      expect(ds[0].content.body).toBe("🏈 Kickoff! Numbers are in. Find your squares.");
    });

    it("speaks the sport's language", () => {
      const ds = buildDeliveries(makeGame({ sport: "basketball" }), players, { kind: "game-starting" }, NOW);
      expect(ds[0].content.body).toBe("🏀 Tip-off! The board is live.");
    });
  });

  describe("host-only events", () => {
    it("board-full goes to the host alone", () => {
      const ds = buildDeliveries(makeGame({ status: "open" }), players, { kind: "board-full" }, NOW);
      expect(recipients(ds)).toEqual([HOST]);
      expect(ds[0].content.body).toBe("🔥 Your board is full. Time to draw numbers.");
    });

    it("board-full on a linked board mentions the kickoff auto-draw", () => {
      const game = makeGame({
        status: "open",
        linkedEvent: { provider: "espn", league: "nfl", eventId: "401", startsAt: NOW + 3_600_000, xIsHome: true },
      });
      expect(buildDeliveries(game, players, { kind: "board-full" }, NOW)[0].content.body).toBe(
        "🔥 Your board is full. Draw numbers now, or they'll draw at kickoff.",
      );
    });

    it("player-joined carries the joiner's emoji and a running count, replacing the last one quietly", () => {
      const ds = buildDeliveries(makeGame({ status: "open" }), players, { kind: "player-joined", name: "Sam" }, NOW);
      expect(recipients(ds)).toEqual([HOST]);
      expect(ds[0].content).toMatchObject({ body: "🐐 Sam joined your board. 3 players in.", tag: "abc234:joined", renotify: false, quiet: true });
    });

    it("nobody hears about it when the host is the actor", () => {
      expect(buildDeliveries(makeGame(), players, { kind: "board-full", actor: HOST }, NOW)).toEqual([]);
    });
  });

  it("final wrap-up fits the board's format", () => {
    const every = makeGame({ format: { periods: "every-score", reverse: false, boardSize: 100, freshNumbers: false } });
    expect(buildDeliveries(makeGame(), players, { kind: "final" }, NOW)[0].content.body).toBe("🏁 That's a wrap. See who won each quarter.");
    expect(buildDeliveries(every, players, { kind: "final" }, NOW)[0].content.body).toBe("🏁 That's a wrap. See every winning square.");
  });

  it("never uses money language", () => {
    const events: NotifyEvent[] = [
      { kind: "numbers-drawn" },
      { kind: "winner", periodKey: "q1", label: "Q1", clientIds: ["client-jax-001"] },
      { kind: "winner", periodKey: "final", label: "Final", clientIds: ["client-sam-002"] },
      { kind: "game-starting" },
      { kind: "board-full" },
      { kind: "player-joined", name: "Sam" },
      { kind: "final" },
    ];
    const text = events
      .flatMap((e) => buildDeliveries(makeGame(), players, e, NOW))
      .map((d) => `${d.content.title} ${d.content.body}`)
      .join("\n");
    expect(text).not.toMatch(/\$|\bbets?\b|wager|gambl|\bpot\b|payout|buy-?in|\bodds\b|\bcash\b|\bmoney\b/i);
  });
});
