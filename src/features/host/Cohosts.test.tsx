// Co-hosts in the app: useHostRole (one answer to "can this device run this
// board, and as whom?"), the host sheet's Co-hosts section for the host
// (invite, share, remove) and for a co-host (step down, no host-only
// actions), and a co-host's draw while the host fee looks due.

import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppConfig, GameState, NumberDraw, Player, Square } from "../../../shared/types";

const lock = vi.fn();
const createCohostInvite = vi.fn();
const removeCohost = vi.fn();
const removePlayer = vi.fn();
vi.mock("../../lib/api", async (orig) => {
  const real = await orig<typeof import("../../lib/api")>();
  return {
    ...real,
    api: {
      ...real.api,
      lock: (...a: unknown[]) => lock(...a),
      createCohostInvite: (...a: unknown[]) => createCohostInvite(...a),
      removeCohost: (...a: unknown[]) => removeCohost(...a),
      removePlayer: (...a: unknown[]) => removePlayer(...a),
    },
  };
});

const shareLink = vi.fn(async () => "copied");
vi.mock("../../lib/native", async (orig) => {
  const real = await orig<typeof import("../../lib/native")>();
  return { ...real, haptic: vi.fn(async () => {}), shareLink: (...a: unknown[]) => shareLink(...(a as [])) };
});

vi.mock("../../components/ui/confetti", () => ({ celebrate: vi.fn(), CELEBRATION_COLORS: [], prefersReducedMotion: () => true }));

const { ApiError } = await import("../../lib/api");
const passStore = await import("../../lib/hostPassStore");
const identity = await import("../../lib/identity");
const { useHostRole } = await import("../../lib/hostRole");
const { ToastProvider } = await import("../../components/ui");
const { HostControls } = await import("./HostControls");

const DRAW: NumberDraw = {
  x: [[0], [1], [2], [3], [4], [5], [6], [7], [8], [9]],
  y: [[9], [8], [7], [6], [5], [4], [3], [2], [1], [0]],
};

const player = (id: string, name: string): Player => ({ id, name, color: "#ff6b35", emoji: "🔥", joinedAt: 0, isHost: id === "host" });
const sq = (row: number, col: number, playerId: string): Square => ({ row, col, playerId, claimedAt: 0 });

function makeState(over: Partial<GameState["game"]> = {}, rest: Partial<GameState> = {}): GameState {
  return {
    game: {
      id: "hst123",
      name: "Office Pool",
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
      cohostIds: [],
      ...over,
    },
    players: [player("host", "Jordan"), player("maya", "Maya")],
    squares: [],
    scores: [],
    manualWinners: [],
    live: null,
    activity: [],
    version: 1,
    ...rest,
  };
}

function renderHost(state: GameState) {
  const apply = vi.fn();
  const utils = render(
    <MemoryRouter initialEntries={["/g/hst123"]}>
      <ToastProvider>
        <Routes>
          <Route path="/g/:id" element={<HostControls state={state} apply={apply} pickCell={vi.fn(async () => null)} onInvite={vi.fn()} />} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>,
  );
  return { ...utils, apply };
}

async function openSheet() {
  fireEvent.click(screen.getByTestId("host-open"));
  return screen.findByRole("heading", { name: "Host tools" });
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  passStore.resetHostPass();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useHostRole", () => {
  function Probe({ state }: { state: GameState | null }) {
    return <output data-testid="role">{useHostRole(state) ?? "none"}</output>;
  }

  it("is the host with the admin token, a co-host by public id, else nothing, and follows changes", () => {
    const me = identity.getPlayerId();
    const { rerender } = render(<Probe state={makeState()} />);
    expect(screen.getByTestId("role")).toHaveTextContent("none");
    // Being made a co-host arrives as a new state.
    rerender(<Probe state={makeState({ cohostIds: [me] })} />);
    expect(screen.getByTestId("role")).toHaveTextContent("cohost");
    // An older cached state without the field: nothing.
    rerender(<Probe state={makeState({ cohostIds: undefined })} />);
    expect(screen.getByTestId("role")).toHaveTextContent("none");
    // The host's token (a host link, a sign-in) makes it the host, as soon as it's saved.
    act(() => void identity.saveAdminTokens({ hst123: "tok" }));
    expect(screen.getByTestId("role")).toHaveTextContent("host");
    rerender(<Probe state={null} />);
    expect(screen.getByTestId("role")).toHaveTextContent("none");
  });
});

describe("the host sheet's Co-hosts, for the host", () => {
  it("invites a co-host: makes a single-use link, then shares it with what a co-host can do", async () => {
    identity.saveAdminToken("hst123", "tok");
    const url = "https://jaxsquares.test/g/hst123?cohost=" + "A".repeat(43);
    createCohostInvite.mockResolvedValue({ url, expiresAt: Date.now() + 7 * 86_400_000 });
    renderHost(makeState());
    await openSheet();
    const invite = await screen.findByTestId("cohost-invite");
    expect(invite).toHaveTextContent("Invite a co-host");
    expect(screen.getByText("They can do everything you can, except remove you. Up to 3 co-hosts; each link works once, for 7 days.")).toBeInTheDocument();
    fireEvent.click(invite);
    await waitFor(() => expect(createCohostInvite).toHaveBeenCalledWith("hst123"));
    expect(await screen.findByRole("heading", { name: /Co-host invite ready/ })).toBeInTheDocument();
    expect(screen.getByText(/The link works once and expires in 7 days\./)).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("cohost-share"));
    await waitFor(() =>
      expect(shareLink).toHaveBeenCalledWith({
        title: "Co-host Office Pool",
        text: 'Help me run "Office Pool" on JaxSquares. This link makes you a co-host. It works once, for 7 days.',
        url,
      }),
    );
    // Back home, the footer says it's on the clipboard.
    expect(await screen.findByText("Co-host link copied")).toBeInTheDocument();
  });

  it("lists co-hosts with Remove, confirmed in plain words", async () => {
    identity.saveAdminToken("hst123", "tok");
    const state = makeState({ cohostIds: ["maya"] });
    const after = makeState({ cohostIds: [] }, { version: 2 });
    removeCohost.mockResolvedValue({ state: after });
    const { apply } = renderHost(state);
    await openSheet();
    const row = await screen.findByTestId("cohost-row");
    expect(row).toHaveTextContent("Maya");
    expect(row).toHaveTextContent("Co-host");
    fireEvent.click(within(row).getByTestId("cohost-remove"));
    expect(await screen.findByRole("heading", { name: /Remove Maya as co-host\?/ })).toBeInTheDocument();
    expect(screen.getByText("They stay on the board with their squares.")).toBeInTheDocument();
    expect(removeCohost).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("cohost-remove-confirm"));
    await waitFor(() => expect(removeCohost).toHaveBeenCalledWith("hst123", "maya"));
    await waitFor(() => expect(apply).toHaveBeenCalledWith(after));
  });

  it("stops offering invites at 3 co-hosts, and says why", async () => {
    identity.saveAdminToken("hst123", "tok");
    const players = [player("host", "Jordan"), player("maya", "Maya"), player("ben", "Ben"), player("cal", "Cal")];
    renderHost(makeState({ cohostIds: ["maya", "ben", "cal"] }, { players }));
    await openSheet();
    expect(await screen.findAllByTestId("cohost-row")).toHaveLength(3);
    expect(screen.getByTestId("cohost-invite")).toBeDisabled();
    expect(screen.getByText("Up to 3 co-hosts. Remove one to invite someone new.")).toBeInTheDocument();
  });
});

describe("host tools for a co-host", () => {
  it("shows every host tool but the host-only ones, with Step down on their own row", async () => {
    const me = identity.getPlayerId();
    const players = [player("host", "Jordan"), player(me, "Ana"), player("maya", "Maya")];
    renderHost(makeState({ cohostIds: [me, "maya"] }, { players, squares: [sq(0, 0, "maya")] }));
    // No admin token on this device, and still the bar.
    expect(identity.getAdminToken("hst123")).toBeNull();
    expect(screen.getByTestId("host-open")).toHaveTextContent("Host tools");
    await openSheet();
    expect(screen.getByTestId("host-rules")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Edit board/ })).toBeInTheDocument();
    expect(screen.getByTestId("host-lock")).toBeInTheDocument();
    // Host only: inviting co-hosts, removing them, the host link, deleting the board.
    expect(screen.queryByTestId("cohost-invite")).toBeNull();
    expect(screen.queryByTestId("cohost-remove")).toBeNull();
    expect(screen.queryByRole("button", { name: /Host from another phone/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Delete board/ })).toBeNull();
    const rows = screen.getAllByTestId("cohost-row");
    expect(rows.map((r) => r.textContent)).toEqual([expect.stringContaining("Ana (you)"), expect.stringContaining("Maya")]);
    expect(within(rows[0]).getByTestId("cohost-step-down")).toBeInTheDocument();
    expect(within(rows[1]).queryByTestId("cohost-step-down")).toBeNull();
    expect(screen.getByText(/Jordan hosts this board\. You can do everything they can, except remove them, delete the board or invite co-hosts\./)).toBeInTheDocument();
  });

  it("steps down after a confirm (no admin token sent)", async () => {
    const me = identity.getPlayerId();
    identity.rememberCohost("hst123", true);
    const players = [player("host", "Jordan"), player(me, "Ana")];
    const after = makeState({ cohostIds: [] }, { players, version: 2 });
    removeCohost.mockResolvedValue({ state: after });
    const { apply } = renderHost(makeState({ cohostIds: [me] }, { players }));
    await openSheet();
    fireEvent.click(await screen.findByTestId("cohost-step-down"));
    expect(await screen.findByRole("heading", { name: /Step down as co-host\?/ })).toBeInTheDocument();
    expect(screen.getByText("Jordan can invite you back any time.")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("cohost-step-down-confirm"));
    await waitFor(() => expect(removeCohost).toHaveBeenCalledWith("hst123", me));
    await waitFor(() => expect(apply).toHaveBeenCalledWith(after));
    expect(identity.isCohostGame("hst123")).toBe(false);
  });

  it("can remove players, but never the host or another co-host", async () => {
    const me = identity.getPlayerId();
    const players = [player("host", "Jordan"), player(me, "Ana"), player("maya", "Maya"), player("kim", "Kim")];
    renderHost(makeState({ cohostIds: [me, "maya"] }, { players, squares: [sq(0, 0, "kim"), sq(0, 1, "maya")] }));
    await openSheet();
    fireEvent.click(await screen.findByRole("button", { name: /^Players/ }));
    expect(await screen.findByRole("button", { name: "Remove Kim" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove Jordan" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Remove Maya" })).toBeNull();
    // Their tags on the list.
    expect(screen.getAllByTestId("player-cohost")).toHaveLength(2);
  });

  describe("drawing while the host fee looks due", () => {
    const CONFIG: AppConfig = {
      payments: {
        mode: "test",
        priceCents: 499,
        currency: "usd",
        stripePublishableKey: null,
        iapProductId: "com.jaxsquares.board",
        hostPass: { priceCents: 1999, currency: "usd", iapProductId: "com.jaxsquares.app.hostpass.yearly", web: true },
      },
      vapidPublicKey: null,
    };
    /** Six players hold squares: past the free tier. */
    const crowd = (me: string) => Array.from({ length: 100 }, (_, i) => sq(Math.floor(i / 10), i % 10, i % 6 === 0 ? me : `p${i % 6}`));
    const server = () =>
      vi.fn(async (url: string) => {
        if (url.endsWith("/api/config")) return new Response(JSON.stringify(CONFIG), { status: 200 });
        return new Response("{}", { status: 404 });
      });

    it("asks the server first (the host's Annual Pass may cover it), and draws with no checkout when it does", async () => {
      vi.stubGlobal("fetch", server());
      const me = identity.getPlayerId();
      const players = [player("host", "Jordan"), player(me, "Ana")];
      const locked = makeState({ status: "locked", paid: true, numbers: { "*": DRAW }, cohostIds: [me] }, { players, version: 3 });
      lock.mockResolvedValue({ state: locked });
      const { apply } = renderHost(makeState({ paid: false, cohostIds: [me] }, { players, squares: crowd(me) }));
      fireEvent.click(screen.getByTestId("host-bar-action"));
      fireEvent.click(await screen.findByTestId("host-lock-confirm"));
      await waitFor(() => expect(lock).toHaveBeenCalledWith("hst123"));
      await waitFor(() => expect(apply).toHaveBeenCalledWith(locked));
      expect(screen.queryByTestId("pay-confirm")).toBeNull();
      expect(await screen.findByRole("button", { name: "See the board" })).toBeInTheDocument();
    });

    it("pays through the normal checkout on the server's 402", async () => {
      vi.stubGlobal("fetch", server());
      const me = identity.getPlayerId();
      const players = [player("host", "Jordan"), player(me, "Ana")];
      lock.mockRejectedValue(new ApiError("Draw the numbers once the board's paid for.", 402, { error: "x", code: "payment_required" }));
      renderHost(makeState({ paid: false, cohostIds: [me] }, { players, squares: crowd(me) }));
      fireEvent.click(screen.getByTestId("host-bar-action"));
      fireEvent.click(await screen.findByTestId("host-lock-confirm"));
      await waitFor(() => expect(lock).toHaveBeenCalled());
      // No reveal before the server answered, then the checkout (a co-host has no admin token to send).
      expect(screen.queryByTestId("reveal-close")).toBeNull();
      expect(await screen.findByTestId("pay-confirm", {}, { timeout: 3000 })).toBeInTheDocument();
    });
  });
});
