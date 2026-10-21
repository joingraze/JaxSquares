import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
const { InviteHero } = await import("./InviteHero");
const { JoinedCard } = await import("./JoinedCard");

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

  it("welcomes a returning player back without asking their name again", async () => {
    identity.setProfile({ name: "Sam", color: "#38b6ff", emoji: "🦈" });
    const next = { ...makeState(), version: 4 };
    join.mockResolvedValue({ state: next });
    render(<JoinSheet state={makeState()} open onJoined={() => {}} onClose={() => {}} selectedCount={1} />);
    expect(await screen.findByRole("heading", { name: "Welcome back, Sam!" })).toBeInTheDocument();
    expect(screen.queryByTestId("join-name")).toBeNull();
    expect(screen.getByTestId("join-submit")).toHaveTextContent("Join & claim my square");
    await act(async () => {
      fireEvent.click(screen.getByTestId("join-submit"));
    });
    expect(join).toHaveBeenCalledWith("k7mq2x", expect.objectContaining({ name: "Sam", emoji: "🦈" }));
  });

  it("lets a returning player change their name and look", async () => {
    identity.setProfile({ name: "Sam", color: "#38b6ff", emoji: "🦈" });
    render(<JoinSheet state={makeState()} open onJoined={() => {}} onClose={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: "Change" }));
    expect(screen.getByTestId("join-name")).toHaveValue("Sam");
    expect(screen.getByRole("radio", { name: "🦈" })).toHaveAttribute("aria-checked", "true");
  });

  it("opens the editor when a returning player's name is taken here", async () => {
    identity.setProfile({ name: "Jordan", color: "#38b6ff", emoji: "🦈" });
    render(<JoinSheet state={makeState()} open onJoined={() => {}} onClose={() => {}} />);
    expect(await screen.findByTestId("join-name")).toHaveValue("Jordan");
    expect(screen.getByText(/already a Jordan here/)).toBeInTheDocument();
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

  it("copies the link from the preview card with feedback", async () => {
    copyText.mockResolvedValue("copied");
    render(<InviteSheet state={makeState()} open onClose={() => {}} />);
    const copy = await screen.findByTestId("invite-copy");
    await act(async () => {
      fireEvent.click(copy);
    });
    expect(copyText).toHaveBeenCalledWith(inviteUrl("k7mq2x"));
    expect(copy).toHaveAccessibleName("Link copied");
    expect(screen.getByText("Copied. Paste it anywhere.")).toBeInTheDocument();
  });

  it("copies the board code with a tap (the letters are separate tiles, so they can't be selected)", async () => {
    copyText.mockResolvedValue("copied");
    render(<InviteSheet state={makeState()} open onClose={() => {}} />);
    fireEvent.click(await screen.findByTestId("invite-code-toggle"));
    const copy = screen.getByTestId("invite-copy-code");
    expect(screen.getByText("Tap the code to copy it.")).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(copy);
    });
    expect(copyText).toHaveBeenCalledWith("K7MQ2X");
    expect(copy).toHaveAccessibleName("Code copied");
    expect(screen.getByText("Code copied. Paste it in Join with a code.")).toBeInTheDocument();
  });

  it("previews the exact message and pitches by board state", async () => {
    const state = makeState("host");
    vi.spyOn(identity, "getPlayerId").mockReturnValue("host");
    render(<InviteSheet state={state} open onClose={() => {}} />);
    expect(await screen.findByRole("heading", { name: "Your board's live. Who's first?" })).toBeInTheDocument();
    expect(screen.getByText("Grab a square on my Chiefs vs Bills board 🏈")).toBeInTheDocument();
    // The card has one title (the board's name) and the short matchup under it; nothing repeats.
    expect(screen.getAllByText("Sunday Night Squares")).toHaveLength(1);
    expect(screen.getByText("Join on JaxSquares")).toBeInTheDocument();
    expect(screen.getByTestId("invite-share")).toHaveTextContent("Text your crew");
  });

  it("says how many boards the game has and names them, with no amount in the message", async () => {
    shareLink.mockResolvedValue("shared");
    const state = makeState("someone-else");
    state.siblings = [
      { id: "b2b2b2", name: "Sunday Night Squares · Board 2", status: "open", squarePrice: 5, unit: "$", justForFun: false, squaresLeft: 40, totalSquares: 100 },
      { id: "c3c3c3", name: "Sunday Night Squares · Board 3", status: "open", squarePrice: 20, unit: "$", justForFun: false, squaresLeft: 90, totalSquares: 100 },
    ];
    render(<InviteSheet state={state} open onClose={() => {}} />);
    expect(await screen.findByTestId("invite-boards")).toHaveTextContent(
      "This game has 3 boards: Sunday Night Squares, Sunday Night Squares · Board 2, Sunday Night Squares · Board 3",
    );
    // A player's sheet doesn't offer adding a board.
    expect(screen.queryByTestId("invite-add-board")).toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByTestId("invite-share"));
    });
    const sent = shareLink.mock.calls[0][0] as { text: string };
    expect(sent.text).toBe("Grab a square on our Chiefs vs Bills board 🏈 · This game has 3 boards");
    expect(sent.text).not.toMatch(/\$|\b(5|20)\b/);
  });

  it("offers the host another board for this game right after creating", async () => {
    const onAddBoard = vi.fn();
    render(<InviteSheet state={makeState()} open justCreated onClose={() => {}} onAddBoard={onAddBoard} />);
    const add = await screen.findByTestId("invite-add-board");
    expect(add).toHaveTextContent("Add another board for this game");
    fireEvent.click(add);
    expect(onAddBoard).toHaveBeenCalled();
    // A board on its own has no boards line.
    expect(screen.queryByTestId("invite-boards")).toBeNull();
  });

  it("leads a venue's just-made board with Put it on your TV", async () => {
    const onShowTv = vi.fn();
    const venue = makeState();
    venue.game.format = { ...venue.game.format, venue: true, justForFun: true, squarePrice: null };
    render(<InviteSheet state={venue} open justCreated onClose={() => {}} onShowTv={onShowTv} onPrint={() => {}} />);
    const card = await screen.findByTestId("invite-venue-tv");
    expect(card).toHaveTextContent("Put it on your TV");
    fireEvent.click(screen.getByTestId("invite-venue-tv-open"));
    expect(onShowTv).toHaveBeenCalled();
    // One way to the TV: the small "Show on TV" button steps aside; printing stays.
    expect(screen.queryByTestId("invite-tv")).toBeNull();
    expect(screen.getByTestId("invite-print")).toBeInTheDocument();
    cleanup();
    // Later, or on a friends' board: the usual buttons.
    render(<InviteSheet state={venue} open onClose={() => {}} onShowTv={onShowTv} />);
    expect(await screen.findByTestId("invite-tv")).toBeInTheDocument();
    expect(screen.queryByTestId("invite-venue-tv")).toBeNull();
  });

  it("keeps the code behind one toggle and never shows the host link", async () => {
    identity.saveAdminToken("k7mq2x", "secret-token");
    render(<InviteSheet state={makeState()} open onClose={() => {}} />);
    const toggle = await screen.findByTestId("invite-code-toggle");
    expect(screen.queryByRole("img", { name: /Board code/ })).toBeNull();
    fireEvent.click(toggle);
    expect(screen.getByRole("img", { name: "Board code K 7 M Q 2 X" })).toBeInTheDocument();
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.queryByText(/host link/i)).toBeNull();
    expect(document.body.textContent).not.toContain("secret-token");
  });
});

describe("InviteHero", () => {
  it("says who invited you and offers one button", () => {
    const onJoin = vi.fn();
    const onPick = vi.fn();
    render(<InviteHero state={makeState()} onJoin={onJoin} onPick={onPick} />);
    expect(screen.getByRole("heading", { name: "Chiefs vs Bills" })).toBeInTheDocument();
    expect(screen.getByText("invited you", { exact: false })).toHaveTextContent("Jordan invited you");
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(1);
    fireEvent.click(buttons[0]);
    expect(onPick).toHaveBeenCalled();
    expect(onJoin).not.toHaveBeenCalled();
  });

  it("says the game has more boards, and points at them", () => {
    const state = makeState();
    state.siblings = [{ id: "b2b2b2", name: "Board 2", status: "open", squarePrice: 5, unit: "$", justForFun: false, squaresLeft: 40, totalSquares: 100 }];
    const target = document.createElement("section");
    target.id = "sibling-boards";
    target.scrollIntoView = vi.fn();
    document.body.appendChild(target);
    render(<InviteHero state={state} onJoin={() => {}} onPick={() => {}} />);
    const line = screen.getByTestId("invite-hero-boards");
    expect(line).toHaveTextContent("This game has 2 boards·See them");
    fireEvent.click(line);
    expect(target.scrollIntoView).toHaveBeenCalled();
    target.remove();
  });

  it("joins to follow along when there's nothing left to pick", () => {
    const onJoin = vi.fn();
    const state = makeState();
    state.game.status = "locked";
    render(<InviteHero state={state} onJoin={onJoin} />);
    fireEvent.click(screen.getByRole("button", { name: "Join to follow along" }));
    expect(onJoin).toHaveBeenCalled();
  });
});

describe("JoinedCard", () => {
  it("celebrates and shares the board", async () => {
    shareLink.mockResolvedValue("shared");
    vi.spyOn(identity, "getPlayerId").mockReturnValue("p2");
    const state = makeState();
    state.players.push(player("p2", "Sam"));
    state.squares.push({ row: 0, col: 0, playerId: "p2", claimedAt: 0 });
    render(<JoinedCard state={state} onDismiss={() => {}} />);
    expect(screen.getByText("You're in, Sam! 🎉")).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Bring a friend/ }));
    });
    expect(shareLink).toHaveBeenCalledWith(expect.objectContaining({ text: "Grab a square on our Chiefs vs Bills board 🏈", url: inviteUrl("k7mq2x") }));
    expect(screen.getByRole("button", { name: /Sent!/ })).toBeInTheDocument();
  });
});
