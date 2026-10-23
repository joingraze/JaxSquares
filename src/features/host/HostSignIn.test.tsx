// A host who isn't signed in (a board from before hosts had to sign in) runs
// it from this device only: the host sheet offers "Run it from any device",
// which opens sign-in; once signed in, the row is gone.

import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AccountInfo, GameState } from "../../../shared/types";

const auth = vi.hoisted(() => ({ providers: ["google", "apple"] as ("apple" | "google")[] }));
vi.mock("../../lib/auth", async (orig) => {
  const real = await orig<typeof import("../../lib/auth")>();
  return { ...real, useAuthSetup: () => ({ config: null, providers: auth.providers, ready: true }) };
});
const account = vi.hoisted(() => ({ current: null as AccountInfo | null }));
vi.mock("../../lib/identity", async (orig) => {
  const real = await orig<typeof import("../../lib/identity")>();
  return { ...real, useAccount: () => account.current };
});
vi.mock("../../lib/native", async (orig) => {
  const real = await orig<typeof import("../../lib/native")>();
  return { ...real, haptic: vi.fn(async () => {}) };
});
vi.mock("../../components/ui/confetti", () => ({ celebrate: vi.fn(), CELEBRATION_COLORS: [], prefersReducedMotion: () => true }));
vi.mock("../account/SignInSheet", () => ({
  SignInSheet: ({ open, title }: { open: boolean; title: string }) => (open ? <div data-testid="signin-sheet">{title}</div> : null),
}));

const identity = await import("../../lib/identity");
const { ToastProvider } = await import("../../components/ui");
const { HostControls } = await import("./HostControls");

function state(): GameState {
  return {
    game: {
      id: "hst123",
      name: "Sunday Night Squares",
      sport: "football",
      league: "custom",
      teamX: { name: "Chiefs", abbr: "KC", color: "#e31837" },
      teamY: { name: "Bills", abbr: "BUF", color: "#00338d" },
      format: { periods: "quarters", reverse: false, boardSize: 100, freshNumbers: false },
      periods: [
        { key: "q1", label: "Q1" },
        { key: "q2", label: "Half" },
        { key: "q3", label: "Q3" },
        { key: "final", label: "Final" },
      ],
      prizes: {},
      maxPerPlayer: 0,
      numbers: null,
      status: "open",
      linkedEvent: null,
      hostPlayerId: "host",
      createdAt: 0,
      lockedAt: null,
    },
    players: [{ id: "host", name: "Jordan", color: "#ff6b35", emoji: "🔥", joinedAt: 0, isHost: true }],
    squares: [],
    scores: [],
    manualWinners: [],
    live: null,
    activity: [],
    version: 1,
  } as GameState;
}

function renderHost() {
  return render(
    <MemoryRouter initialEntries={["/g/hst123"]}>
      <ToastProvider>
        <Routes>
          <Route path="/g/:id" element={<HostControls state={state()} apply={vi.fn()} pickCell={vi.fn(async () => null)} onInvite={vi.fn()} />} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 404 })));
  identity.saveAdminToken("hst123", "tok");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  account.current = null;
});

describe("a host who isn't signed in", () => {
  it("can put the board on their account from the host sheet", async () => {
    renderHost();
    fireEvent.click(screen.getByTestId("host-open"));
    const row = await screen.findByTestId("host-signin");
    expect(row).toHaveTextContent("Run it from any device");
    vi.useFakeTimers();
    fireEvent.click(row);
    await act(async () => void vi.advanceTimersByTime(1000));
    expect(screen.getByTestId("signin-sheet")).toHaveTextContent("Run your boards from any device");
  });

  it("isn't asked once signed in", async () => {
    account.current = { provider: "google", email: null, name: null, since: 0 } as AccountInfo;
    renderHost();
    fireEvent.click(screen.getByTestId("host-open"));
    expect(await screen.findByText("Host from another phone")).toBeInTheDocument();
    expect(screen.queryByTestId("host-signin")).toBeNull();
  });
});
