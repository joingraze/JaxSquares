import { describe, expect, it } from "vitest";
import type { GameState } from "../shared/types";
import { bootScript, inlineJson, inviteMeta } from "./og";

function state(over: Partial<GameState["game"]> = {}, extra: Partial<GameState> = {}): GameState {
  return {
    game: {
      id: "abc123",
      name: "Smith Family Squares",
      sport: "football",
      league: "nfl",
      teamX: { name: "Chiefs", abbr: "KC" },
      teamY: { name: "Eagles", abbr: "PHI" },
      format: { periods: "quarters", reverse: false, boardSize: 100, freshNumbers: false },
      periods: [],
      prizes: {},
      maxPerPlayer: 0,
      numbers: null,
      status: "open",
      linkedEvent: null,
      hostPlayerId: "h",
      createdAt: 0,
      lockedAt: null,
      ...over,
    },
    players: [],
    squares: [
      { row: 0, col: 0, playerId: "a", claimedAt: 0 },
      { row: 0, col: 1, playerId: "a", claimedAt: 0 },
    ],
    scores: [],
    manualWinners: [],
    live: null,
    activity: [],
    version: 1,
    ...extra,
  };
}

describe("inviteMeta", () => {
  it("invites to the board with squares left", () => {
    const m = inviteMeta(state(), "https://jaxsquares.com");
    expect(m.title).toBe("Join Smith Family Squares on JaxSquares");
    expect(m.description).toBe("Chiefs vs Eagles · 98 of 100 squares left. Grab yours");
    expect(m.url).toBe("https://jaxsquares.com/g/abc123");
    expect(m.image).toBe("https://jaxsquares.com/og-image.png");
  });

  it("uses 5x5 totals", () => {
    const m = inviteMeta(state({ format: { periods: "final", reverse: false, boardSize: 25, freshNumbers: false } }), "https://x");
    expect(m.description).toContain("23 of 25 squares left");
  });

  it("describes locked and final boards", () => {
    expect(inviteMeta(state({ status: "locked" }), "https://x").description).toContain("Numbers are drawn");
    const final = inviteMeta(
      state({ status: "final" }, { scores: [{ periodKey: "final", scoreX: 27, scoreY: 24, source: "live", updatedAt: 0 }] }),
      "https://x",
    );
    expect(final.title).toBe("See who won Smith Family Squares on JaxSquares");
    expect(final.description).toBe("Final: Chiefs 27, Eagles 24");
  });

  it("previews a finished board as its recap: the final score and how many players won", () => {
    // Numbers drawn: digit d is in column d and row d, so a score's square is (y % 10, x % 10).
    const digits = Array.from({ length: 10 }, (_, d) => [d]);
    const numbers = { "*": { x: digits, y: digits } };
    const square = (row: number, col: number, playerId: string) => ({ row, col, playerId, claimedAt: 0 });
    const score = (periodKey: string, scoreX: number, scoreY: number) => ({ periodKey, scoreX, scoreY, source: "live" as const, updatedAt: 0 });
    const s = state(
      { status: "final", numbers, periods: [{ key: "q1", label: "Q1" }, { key: "q2", label: "Half" }, { key: "q3", label: "Q3" }, { key: "final", label: "Final" }] },
      {
        // Ana wins Q1 and Half, Ben Q3, Cy the Final; nobody holds 3-0.
        squares: [square(0, 7, "ana"), square(3, 4, "ben"), square(4, 7, "cy"), square(0, 3, "ana")],
        scores: [score("q1", 7, 0), score("q2", 7, 0), score("q3", 14, 3), score("final", 27, 24)],
      },
    );
    const m = inviteMeta(s, "https://jaxsquares.com");
    expect(m.description).toBe("Final: Chiefs 27, Eagles 24 · 3 winners");
    expect(m.url).toBe("https://jaxsquares.com/g/abc123");
    // Every-score board without a Final entry: the last score in game order.
    const every = state(
      { status: "final", numbers, format: { periods: "every-score", reverse: false, boardSize: 100, freshNumbers: false }, periods: [] },
      { squares: [square(0, 7, "ana")], scores: [score("s1", 7, 0), score("s2", 10, 7)] },
    );
    expect(inviteMeta(every, "https://x").description).toBe("Final: Chiefs 10, Eagles 7 · 1 winner");
    // The TV view and the printable board keep their own previews.
    expect(inviteMeta(s, "https://x", "tv").title).toBe("Smith Family Squares on TV · JaxSquares");
  });

  it("never mentions money", () => {
    for (const status of ["draft", "open", "locked", "final"] as const) {
      expect(inviteMeta(state({ status }), "https://x").description).not.toMatch(/\$|bet|wager|pot|payout|buy-in/i);
    }
  });
});

describe("bootScript (the board's state embedded in the invite page)", () => {
  // A board name and a player name chosen to break out of the script, plus the JS line separators.
  const hostile = state(
    { name: "</script><script>alert(1)</script><!--" },
    {
      players: [{ id: "a", name: "<img src=x onerror=alert(1)> & \u2028\u2029", color: "#ff6b35", emoji: "", joinedAt: 0, isHost: false }],
      activity: [{ id: "x", type: "joined", at: 0, actor: "a", data: { name: "</SCRIPT>" } }],
    },
  );

  it("escapes <, >, & and U+2028/2029 so nothing can close the script or open markup", () => {
    const json = inlineJson(hostile);
    expect(json).not.toMatch(/[<>&\u2028\u2029]/);
    expect(json).toContain("\\u003c/script\\u003e");
    expect(json).toContain("\\u0026");
    expect(json).toContain("\\u2028\\u2029");
    // Same value back.
    expect(JSON.parse(json)).toEqual(hostile);

    const html = bootScript(hostile);
    expect(html.startsWith('<script type="application/json" id="jx-boot">')).toBe(true);
    // The only "<" are the script's own tags.
    expect(html.match(/</g)).toHaveLength(2);
    expect(html.endsWith("</script>")).toBe(true);
  });

  it("parses back to the same state in a real HTML parser, with no injected element", () => {
    const { DOMParser } = globalThis as unknown as {
      DOMParser: new () => {
        parseFromString(html: string, type: "text/html"): {
          getElementById(id: string): { textContent: string | null } | null;
          querySelectorAll(selector: string): { length: number };
        };
      };
    };
    const doc = new DOMParser().parseFromString(`<!doctype html><html><head></head><body><div id="root"></div>${bootScript(hostile)}</body></html>`, "text/html");
    expect(doc.querySelectorAll("script")).toHaveLength(1);
    expect(doc.querySelectorAll("img")).toHaveLength(0);
    expect(JSON.parse(doc.getElementById("jx-boot")?.textContent ?? "null")).toEqual(hostile);
  });

  it("never puts a square price or prize amount in a link preview", () => {
    const format = {
      periods: "custom" as const,
      reverse: true,
      boardSize: 100 as const,
      freshNumbers: false,
      unit: "$" as const,
      squarePrice: 25,
      rules: [
        { moment: "score" as const, square: { amount: 50, note: "", byKind: { touchdown: 70, extraPoint: 15, twoPoint: 30 } }, reverse: null },
        // The final takes the rest of the board total: no figure, and no "rest" talk, in a preview either.
        { moment: "final" as const, square: { amount: null, note: "", rest: true as const }, reverse: { amount: 400, note: "Loser buys wings" } },
      ],
    };
    for (const status of ["draft", "open", "locked", "final"] as const) {
      const m = inviteMeta(state({ format, status }, { scores: [{ periodKey: "final", scoreX: 27, scoreY: 24, source: "host", updatedAt: 0 }] }), "https://x");
      expect(`${m.title} ${m.description}`).not.toMatch(/\$|\b(15|25|30|50|70|400|2,?500)\b|pts?\b|\brest\b|board total/i);
    }
  });

  it("carries only the public GameState: public player ids, no clientId or admin token", () => {
    const html = bootScript(state());
    expect(html).not.toMatch(/clientId|client_id|adminToken|admin_token/);
  });
});

