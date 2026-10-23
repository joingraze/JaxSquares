import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AccountInfo, GameState } from "../../../shared/types";

const auth = vi.hoisted(() => ({ providers: ["apple", "google"] as ("apple" | "google")[], ready: true }));
vi.mock("../../lib/auth", async (orig) => {
  const real = await orig<typeof import("../../lib/auth")>();
  return { ...real, useAuthSetup: () => ({ config: null, providers: auth.providers, ready: auth.ready }) };
});
const account = vi.hoisted(() => ({ current: null as AccountInfo | null }));
vi.mock("../../lib/identity", async (orig) => {
  const real = await orig<typeof import("../../lib/identity")>();
  return { ...real, getPlayerId: () => "p2", useAccount: () => account.current };
});
vi.mock("../account/SignInSheet", () => ({
  SignInSheet: ({ title, description }: { title: string; description: string }) => (
    <div data-testid="signin-sheet">
      {title} {description}
    </div>
  ),
}));

const { JoinedCard } = await import("./JoinedCard");

function state(): GameState {
  return {
    game: {
      id: "k7mq2x",
      name: "Sunday Night Squares",
      sport: "football",
      league: "custom",
      teamX: { name: "Chiefs", abbr: "KC", color: "#e31837" },
      teamY: { name: "Bills", abbr: "BUF", color: "#00338d" },
      format: { periods: "quarters", reverse: false, boardSize: 100, freshNumbers: false },
      periods: [{ key: "final", label: "Final" }],
      prizes: {},
      maxPerPlayer: 0,
      numbers: null,
      status: "open",
      linkedEvent: null,
      hostPlayerId: "p1",
      createdAt: 0,
      lockedAt: null,
    },
    players: [
      { id: "p1", name: "Jordan", color: "#f00", emoji: "🏈", isHost: true },
      { id: "p2", name: "Sam", color: "#0f0", emoji: "🐶" },
    ],
    squares: [{ row: 0, col: 0, playerId: "p2", claimedAt: 0 }],
    scores: [],
  } as unknown as GameState;
}

afterEach(() => {
  account.current = null;
  auth.providers = ["apple", "google"];
});

describe("JoinedCard's save-to-account line", () => {
  it("tells a player who isn't signed in that the board is only on this device, and opens sign-in", async () => {
    render(<JoinedCard state={state()} onDismiss={() => {}} />);
    const save = screen.getByTestId("joined-save");
    expect(save).toHaveTextContent("Only on this device for now.Save it to your account");
    fireEvent.click(save);
    expect(await screen.findByTestId("signin-sheet")).toHaveTextContent(
      "Keep this board on every device Sign in with Apple or Google and your squares here, and every board you join, follow you to any phone or computer.",
    );
  });

  it("stays out of the way once signed in, or where sign-in isn't set up", () => {
    account.current = { provider: "google", email: null, name: null, since: 0 } as AccountInfo;
    const { unmount } = render(<JoinedCard state={state()} onDismiss={() => {}} />);
    expect(screen.queryByTestId("joined-save")).toBeNull();
    unmount();
    account.current = null;
    auth.providers = [];
    render(<JoinedCard state={state()} onDismiss={() => {}} />);
    expect(screen.queryByTestId("joined-save")).toBeNull();
  });
});
