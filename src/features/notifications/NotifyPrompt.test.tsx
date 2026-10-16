import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PushState } from "../../lib/push";

const getPushState = vi.fn<() => Promise<PushState>>();
const enablePush = vi.fn<() => Promise<PushState>>();
vi.mock("../../lib/push", async (orig) => {
  const real = await orig<typeof import("../../lib/push")>();
  return { ...real, getPushState: () => getPushState(), enablePush: () => enablePush() };
});
vi.mock("../../lib/native", async (orig) => {
  const real = await orig<typeof import("../../lib/native")>();
  return { ...real, haptic: vi.fn(async () => {}) };
});
vi.mock("../../components/ui/confetti", () => ({ celebrate: vi.fn(), CELEBRATION_COLORS: [], prefersReducedMotion: () => true }));

const { NotifyPrompt } = await import("./NotifyPrompt");
const prefs = await import("./prefs");

function setup(props: Partial<Parameters<typeof NotifyPrompt>[0]> = {}) {
  const onClose = vi.fn();
  render(<NotifyPrompt gameId="g1" trigger="claimed" open onClose={onClose} explicit={false} {...props} />);
  return { onClose };
}

beforeEach(() => {
  localStorage.clear();
  getPushState.mockReset();
  enablePush.mockReset();
});

describe("NotifyPrompt", () => {
  it("asks with copy that fits the moment", async () => {
    getPushState.mockResolvedValue("default");
    setup();
    expect(await screen.findByText("Want a ping when your square hits?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Turn on notifications" })).toBeInTheDocument();
  });

  it("calls enablePush inside the tap, before anything awaits", async () => {
    getPushState.mockResolvedValue("default");
    let resolve!: (s: PushState) => void;
    enablePush.mockReturnValue(new Promise((r) => (resolve = r)));
    setup();
    fireEvent.click(await screen.findByRole("button", { name: "Turn on notifications" }));
    // Synchronously called by the click handler (Safari's user-gesture rule).
    expect(enablePush).toHaveBeenCalledTimes(1);
    await act(async () => resolve("granted"));
    expect(await screen.findByText("You're in!")).toBeInTheDocument();
  });

  it("thanks, then closes itself once on", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      getPushState.mockResolvedValue("default");
      enablePush.mockResolvedValue("granted");
      const { onClose } = setup();
      fireEvent.click(await screen.findByRole("button", { name: "Turn on notifications" }));
      await screen.findByText("You're in!");
      await act(async () => {
        vi.advanceTimersByTime(2000);
      });
      expect(onClose).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("explains how to switch them back on when blocked", async () => {
    getPushState.mockResolvedValue("default");
    enablePush.mockResolvedValue("denied");
    setup();
    fireEvent.click(await screen.findByRole("button", { name: "Turn on notifications" }));
    expect(await screen.findByText("Notifications are blocked")).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Turn notifications back on" })).toBeInTheDocument();
  });

  it("guides an iPhone Safari tab to the Home Screen", async () => {
    getPushState.mockResolvedValue("needs-install");
    setup({ trigger: "joined" });
    expect(await screen.findByText("Add JaxSquares to your Home Screen")).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Add JaxSquares to your Home Screen" })).toBeInTheDocument();
  });

  it("never shows where push can't work, or when it's already on", async () => {
    for (const state of ["unsupported", "granted"] as const) {
      getPushState.mockResolvedValue(state);
      const { onClose } = setup();
      await waitFor(() => expect(onClose).toHaveBeenCalled());
      expect(screen.queryByRole("dialog")).toBeNull();
    }
  });

  it("remembers a dismissal and doesn't ask again for that trigger", async () => {
    getPushState.mockResolvedValue("default");
    const first = setup();
    fireEvent.click(await screen.findByRole("button", { name: "Not now" }));
    expect(first.onClose).toHaveBeenCalled();
    expect(prefs.wasAskDismissed("claimed")).toBe(true);
  });

  it("stays quiet after a dismissal unless opened by a tap", async () => {
    prefs.rememberAskDismissed("claimed");
    getPushState.mockResolvedValue("default");
    const auto = setup();
    await waitFor(() => expect(auto.onClose).toHaveBeenCalled());
    expect(getPushState).not.toHaveBeenCalled();
  });

  it("opens anyway from an explicit tap", async () => {
    prefs.rememberAskDismissed("created");
    getPushState.mockResolvedValue("default");
    setup({ trigger: "created", explicit: true });
    expect(await screen.findByText("Know when your crew shows up")).toBeInTheDocument();
  });

  it("lets you try again after closing the system prompt", async () => {
    getPushState.mockResolvedValue("default");
    enablePush.mockResolvedValue("default");
    setup();
    fireEvent.click(await screen.findByRole("button", { name: "Turn on notifications" }));
    expect(await screen.findByText(/Tap again whenever/)).toBeInTheDocument();
  });
});
