import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GameState, Player } from "../../../shared/types";

const join = vi.fn();
vi.mock("../../lib/api", async (orig) => {
  const real = await orig<typeof import("../../lib/api")>();
  return { ...real, api: { ...real.api, join: (...args: unknown[]) => join(...args) } };
});

const shareLink = vi.fn();
const copyText = vi.fn();
vi.mock("../../lib/native", async (orig) => {
  const real = await orig<typeof import("../../lib/native")>();
  return {
    ...real,
    haptic: vi.fn(async () => {}),
    shareLink: (...args: unknown[]) => shareLink(...args),
    copyText: (...args: unknown[]) => copyText(...args),
  };
});

vi.mock("../../components/ui/confetti", () => ({ celebrate: vi.fn(), CELEBRATION_COLORS: [], prefersReducedMotion: () => true }));

const { ApiError, inviteUrl } = await import("../../lib/api");
const identity = await import("../../lib/identity");
const { JoinSheet } = await import("./JoinSheet");
const { InviteSheet } = await import("./InviteSheet");

const player = (id: string, name: string, extra: Partial<Player> = {}): Player => ({
  id,
  name,
  color: "#ff6b35",
  emoji: "🔥",
  joinedAt: 0,
  isHost: false,
  ...extra,
});

function makeState(hostPlayerId = "host"): GameState {
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
      hostPlayerId,
      createdAt: 0,
      lockedAt: null,
    },
    players: [player("host", "Jordan", { isHost: true })],
    squares: [],
    scores: [],
    manualWinners: [],
    live: null,
    activity: [],
    version: 3,
  };
}

beforeEach(() => {
  localStorage.clear();
  identity.setProfile({ name: "" }); // the profile is cached in memory too
  join.mockReset();
  shareLink.mockReset();
  copyText.mockReset();
  // BottomSheet shows on the frame after mounting.
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
    cb(0);
    return 0;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("JoinSheet", () => {
  it("says how many squares it will claim and joins with the typed name", async () => {
    const next = { ...makeState(), version: 4 };
    join.mockResolvedValue({ state: next });
    const onJoined = vi.fn();
    render(<JoinSheet state={makeState()} open onJoined={onJoined} onClose={() => {}} selectedCount={2} />);

    const submit = await screen.findByTestId("join-submit");
    expect(submit).toHaveTextContent("Join & claim 2 squares");
    const name = screen.getByTestId("join-name");
    await waitFor(() => expect(document.activeElement).toBe(name));

    fireEvent.change(name, { target: { value: "  Sam " } });
    await act(async () => {
      fireEvent.click(submit);
    });

    expect(join).toHaveBeenCalledWith("k7mq2x", expect.objectContaining({ name: "Sam" }));
    expect(onJoined).toHaveBeenCalledWith(next);
    // Saved for next time.
    expect(identity.getProfile().name).toBe("Sam");
  });

  it("asks for a name instead of calling the API", async () => {
    render(<JoinSheet state={makeState()} open onJoined={() => {}} onClose={() => {}} selectedCount={0} />);
    const submit = await screen.findByTestId("join-submit");
    expect(submit).toHaveTextContent("Join the board");
    await act(async () => {
      fireEvent.click(submit);
    });
    expect(join).not.toHaveBeenCalled();
    expect(screen.getByText(/Add your name/)).toBeInTheDocument();
  });

  it("shows API errors inline and keeps the sheet usable", async () => {
    join.mockRejectedValue(new ApiError("You're offline. Check your connection and try again.", 0));
    const onJoined = vi.fn();
    render(<JoinSheet state={makeState()} open onJoined={onJoined} onClose={() => {}} />);
    fireEvent.change(await screen.findByTestId("join-name"), { target: { value: "Sam" } });
    await act(async () => {
      fireEvent.click(screen.getByTestId("join-submit"));
    });
    expect(onJoined).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("You're offline");
    expect(screen.getByTestId("join-submit")).toHaveTextContent("Try again");
    expect(screen.getByTestId("join-submit")).not.toBeDisabled();
  });

  it("prefills a returning player's name", async () => {
    identity.setProfile({ name: "Sam", color: "#38b6ff", emoji: "🦈" });
    render(<JoinSheet state={makeState()} open onJoined={() => {}} onClose={() => {}} />);
    expect(await screen.findByTestId("join-name")).toHaveValue("Sam");
    expect(screen.getByRole("radio", { name: "🦈" })).toHaveAttribute("aria-checked", "true");
  });
});

describe("InviteSheet", () => {
  it("shares the invite link with a ready-made message", async () => {
    shareLink.mockResolvedValue("shared");
    render(<InviteSheet state={makeState("someone-else")} open onClose={() => {}} />);
    const send = await screen.findByTestId("invite-share");
    await act(async () => {
      fireEvent.click(send);
    });
    expect(shareLink).toHaveBeenCalledWith({
      title: "Sunday Night Squares",
      text: "Grab a square on our Chiefs vs Bills board 🏈",
      url: inviteUrl("k7mq2x"),
    });
    expect(send).toHaveTextContent("Sent!");
  });

  it("copies the link with feedback", async () => {
    copyText.mockResolvedValue("copied");
    render(<InviteSheet state={makeState()} open onClose={() => {}} />);
    const copy = await screen.findByTestId("invite-copy");
    await act(async () => {
      fireEvent.click(copy);
    });
    expect(copyText).toHaveBeenCalledWith(inviteUrl("k7mq2x"));
    expect(copy).toHaveTextContent("Copied");
  });

  it("shows the code and only offers the host link to the host", async () => {
    const { unmount } = render(<InviteSheet state={makeState()} open onClose={() => {}} />);
    expect(await screen.findByRole("img", { name: "Board code K 7 M Q 2 X" })).toBeInTheDocument();
    expect(screen.queryByText("Save your host link")).toBeNull();
    unmount();

    identity.saveAdminToken("k7mq2x", "secret-token");
    render(<InviteSheet state={makeState()} open onClose={() => {}} />);
    expect(await screen.findByText("Save your host link")).toBeInTheDocument();
  });
});
