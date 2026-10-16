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
    expect(final.description).toBe("Chiefs vs Eagles · Final: Chiefs 27, Eagles 24");
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

  it("carries only the public GameState: public player ids, no clientId or admin token", () => {
    const html = bootScript(state());
    expect(html).not.toMatch(/clientId|client_id|adminToken|admin_token/);
  });
});

