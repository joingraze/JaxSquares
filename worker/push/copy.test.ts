// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { NotifyEvent } from "./types";
import { atPeriod, buildDeliveries, joinNames } from "./copy";
import { HOST, makeGame, makePlayer, pid } from "./testFixtures";

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
    const ds = buildDeliveries(makeGame(), players, { kind: "numbers-drawn", actor: pid(HOST) }, NOW);
    expect(recipients(ds)).toEqual(["client-jax-001", "client-sam-002"]);
    const ended = buildDeliveries(makeGame(), players, { kind: "final", actor: pid(HOST) }, NOW);
    expect(recipients(ended)).toEqual(["client-jax-001", "client-sam-002"]);
  });

  it("matches the actor by public id, never by clientId", () => {
    const ds = buildDeliveries(makeGame(), players, { kind: "numbers-drawn", actor: HOST }, NOW);
    expect(recipients(ds)).toContain(HOST);
  });

  it("reaches the host as a member without a name (getMembers' fallback)", () => {
    const hostOnly = makePlayer(HOST, "", { joinedAt: 0 });
    const ds = buildDeliveries(makeGame(), [hostOnly, ...players.slice(1)], { kind: "board-full" }, NOW);
    expect(recipients(ds)).toEqual([HOST]);
  });

  describe("winner", () => {
    const event: NotifyEvent = { kind: "winner", periodKey: "q2", label: "Half", playerIds: [pid("client-jax-001")] };

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

    it("quotes the shared note on an every-score board (its only prize slot)", () => {
      const every = makeGame({
        format: { periods: "every-score", reverse: false, boardSize: 100, freshNumbers: false },
        prizes: { "*": "Loser buys wings" },
      });
      const ds = buildDeliveries(every, players, { ...event, periodKey: "s3", label: "Score 3" }, NOW);
      expect(bodyFor(ds, "client-jax-001")).toBe("🎉 Your square hit on Score 3! 🏆 Loser buys wings");
      // A period's own note still wins over the shared one.
      const both = makeGame({ prizes: { q2: "Winner picks the music", "*": "Loser buys wings" } });
      expect(bodyFor(buildDeliveries(both, players, event, NOW), "client-jax-001")).toBe("🎉 Your square hit at Half! 🏆 Winner picks the music");
    });

    it("quotes a rule's note but never a square price or prize amount", () => {
      const priced = makeGame({
        format: {
          periods: "custom",
          reverse: true,
          boardSize: 100,
          freshNumbers: false,
          unit: "$",
          squarePrice: 20,
          rules: [
            // Amounts by score type stay in the app too.
            { moment: "score", square: { amount: 50, note: "", byKind: { touchdown: 70, extraPoint: 10, twoPoint: 20, fieldGoal: 30 } }, reverse: null },
            { moment: "q2", square: null, reverse: { amount: 200, note: "Loser buys wings" } },
            // So does the rest of the board total.
            { moment: "final", square: { amount: null, note: "", rest: true }, reverse: { amount: 1000, note: "" } },
          ],
        },
      });
      const half = buildDeliveries(priced, players, event, NOW);
      expect(bodyFor(half, "client-jax-001")).toBe("🎉 Your square hit at Half! 🏆 Loser buys wings");
      const every = buildDeliveries(priced, players, { ...event, periodKey: "s4", label: "Score 4" }, NOW);
      const fin = buildDeliveries(priced, players, { ...event, periodKey: "final", label: "Final" }, NOW);
      expect(bodyFor(fin, HOST)).toBe("🏁 Jax's square hit at the Final. See every winning square.");
      const wrap = buildDeliveries(priced, players, { kind: "final" }, NOW);
      for (const d of [...half, ...every, ...fin, ...wrap]) {
        const text = `${d.content.title} ${d.content.body}`;
        expect(text).not.toMatch(/\$|\b(10|20|30|50|70|200|1,?000|2,?000)\b|pts?\b|\brest\b|board total/i);
      }
    });

    it("names both winners on a reverse board", () => {
      const ds = buildDeliveries(makeGame(), players, { ...event, periodKey: "q1", label: "Q1", playerIds: [pid("client-jax-001"), pid("client-sam-002")] }, NOW);
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
      const ds = buildDeliveries(makeGame(), players, { ...event, playerIds: [pid("client-jax-001"), pid("client-jax-001")] }, NOW);
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

    it("on a board not drawn at kickoff (host fee unpaid), asks the host to draw and tells everyone else who they're waiting on", () => {
      const ds = buildDeliveries(makeGame({ status: "open", paid: false }), players, { kind: "game-starting" }, NOW);
      expect(bodyFor(ds, HOST)).toBe("🏈 Kickoff! Draw the numbers to get your board going.");
      expect(bodyFor(ds, "client-jax-001")).toBe("🏈 Kickoff! Waiting on the host to draw the numbers.");
      expect(recipients(ds)).toEqual([HOST, "client-jax-001", "client-sam-002"].sort());
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

    it("board-full on an unpaid linked board offers paying ahead (it won't draw at kickoff by itself)", () => {
      const game = makeGame({
        status: "open",
        paid: false,
        linkedEvent: { provider: "espn", league: "nfl", eventId: "401", startsAt: NOW + 3_600_000, xIsHome: true },
      });
      const ds = buildDeliveries(game, players, { kind: "board-full" }, NOW);
      expect(recipients(ds)).toEqual([HOST]);
      expect(ds[0].content.body).toBe("🔥 Your board is full. Draw the numbers now, or pay ahead and Jax draws them at kickoff.");
    });

    it("draw-reminder tells the host of an unpaid linked board how soon kickoff is", () => {
      const linked = (startsAt: number) => ({ provider: "espn" as const, league: "nfl" as const, eventId: "401", startsAt, xIsHome: true });
      const unpaid = (startsAt: number) => makeGame({ status: "open", paid: false, linkedEvent: linked(startsAt) });
      const ds = buildDeliveries(unpaid(NOW + 58 * 60_000), players, { kind: "draw-reminder" }, NOW);
      expect(recipients(ds)).toEqual([HOST]);
      expect(ds[0].content).toMatchObject({
        body: "⏰ Kickoff in about an hour. Draw the numbers now, or pay ahead and Jax draws them at kickoff.",
        tag: "abc234:draw-reminder",
        kind: "draw-reminder",
      });
      expect(buildDeliveries(unpaid(NOW + 20 * 60_000), players, { kind: "draw-reminder" }, NOW)[0].content.body).toMatch(/^⏰ Kickoff in 20 minutes\. /);
      // Paid, drawn, or a custom board in the meantime: nothing to remind.
      expect(buildDeliveries(makeGame({ status: "open", paid: true, linkedEvent: linked(NOW + 3_000_000) }), players, { kind: "draw-reminder" }, NOW)).toEqual([]);
      expect(buildDeliveries(makeGame({ status: "locked", paid: true, linkedEvent: linked(NOW + 3_000_000) }), players, { kind: "draw-reminder" }, NOW)).toEqual([]);
      expect(buildDeliveries(makeGame({ status: "open", paid: false }), players, { kind: "draw-reminder" }, NOW)).toEqual([]);
    });

    it("player-joined carries the joiner's emoji and a running count, replacing the last one quietly", () => {
      const ds = buildDeliveries(makeGame({ status: "open" }), players, { kind: "player-joined", name: "Sam" }, NOW);
      expect(recipients(ds)).toEqual([HOST]);
      expect(ds[0].content).toMatchObject({ body: "🐐 Sam joined your board. 3 players in.", tag: "abc234:joined", renotify: false, quiet: true });
    });

    it("nobody hears about it when the host is the actor", () => {
      expect(buildDeliveries(makeGame(), players, { kind: "board-full", actor: pid(HOST) }, NOW)).toEqual([]);
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
      { kind: "winner", periodKey: "q1", label: "Q1", playerIds: [pid("client-jax-001")] },
      { kind: "winner", periodKey: "final", label: "Final", playerIds: [pid("client-sam-002")] },
      { kind: "game-starting" },
      { kind: "board-full" },
      { kind: "player-joined", name: "Sam" },
      { kind: "final" },
      { kind: "draw-reminder" },
    ];
    const unpaid = makeGame({
      status: "open",
      paid: false,
      linkedEvent: { provider: "espn", league: "nfl", eventId: "401", startsAt: NOW + 3_000_000, xIsHome: true },
    });
    const text = events
      .flatMap((e) => [...buildDeliveries(makeGame(), players, e, NOW), ...buildDeliveries(unpaid, players, e, NOW)])
      .map((d) => `${d.content.title} ${d.content.body}`)
      .join("\n");
    expect(text).not.toMatch(/\$|\bbets?\b|wager|gambl|\bpot\b|payout|buy-?in|\bodds\b|\bcash\b|\bmoney\b|jackpot|stakes|\d+\.\d\d/i);
  });
});
