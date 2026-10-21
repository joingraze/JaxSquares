// Pairing a TV: jaxsquares.com/tv shows a code and opens the board sent to
// it (a new code when one runs out), and "Show on TV" (anyone with the board's
// link) sends the board to the code typed in.

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TV_PAIR_POLL_MS } from "../../../shared/tvBrowser";

const tvPairStart = vi.fn();
const tvPairPoll = vi.fn();
const sendToTv = vi.fn();
vi.mock("../../lib/api", async (orig) => {
  const real = await orig<typeof import("../../lib/api")>();
  return {
    ...real,
    api: {
      ...real.api,
      tvPairStart: (...a: unknown[]) => tvPairStart(...a),
      tvPairPoll: (...a: unknown[]) => tvPairPoll(...a),
      sendToTv: (...a: unknown[]) => sendToTv(...a),
    },
  };
});

vi.mock("../../lib/native", async (orig) => {
  const real = await orig<typeof import("../../lib/native")>();
  return { ...real, haptic: vi.fn(async () => {}) };
});

const { ApiError } = await import("../../lib/api");
const { default: TvPair } = await import("../../pages/TvPair");
const { SendToTv } = await import("./SendToTv");

const pairing = (code: string, token: string) => ({ code, token, expiresAt: Date.now() + 15 * 60_000 });

function renderPair() {
  return render(
    <MemoryRouter initialEntries={["/tv"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/tv" element={<TvPair />} />
        <Route path="/g/:id/tv" element={<p>TV mode</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  tvPairStart.mockReset();
  tvPairPoll.mockReset();
  sendToTv.mockReset();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("the TV's pairing page", () => {
  it("shows its code and opens the board the host sends to it", async () => {
    tvPairStart.mockResolvedValue(pairing("K7MP", "secret-1"));
    tvPairPoll.mockResolvedValueOnce({ gameId: null, expiresAt: 0 }).mockResolvedValueOnce({ gameId: "brd123", expiresAt: 0 });
    renderPair();
    await act(async () => {});
    expect(screen.getByTestId("tv-pair-code")).toHaveTextContent("K7MP");
    expect(screen.getByTestId("tv-pair-code")).toHaveAccessibleName("TV code K 7 M P");

    await act(() => vi.advanceTimersByTimeAsync(TV_PAIR_POLL_MS));
    expect(tvPairPoll).toHaveBeenLastCalledWith("K7MP", "secret-1");
    expect(screen.queryByText("TV mode")).toBeNull();
    await act(() => vi.advanceTimersByTimeAsync(TV_PAIR_POLL_MS));
    expect(screen.getByText("TV mode")).toBeInTheDocument();
  });

  it("takes a new code when its code is gone, and keeps trying when it can't get one", async () => {
    tvPairStart
      .mockRejectedValueOnce(new ApiError("Couldn't make a TV code just now.", 503))
      .mockResolvedValueOnce(pairing("K7MP", "secret-1"))
      .mockResolvedValueOnce(pairing("ACDE", "secret-2"));
    tvPairPoll.mockRejectedValueOnce(new ApiError("This TV's code expired.", 404));
    renderPair();
    await act(async () => {});
    expect(screen.getByTestId("tv-pair-status")).toHaveTextContent("Couldn't make a TV code just now.");

    await act(() => vi.advanceTimersByTimeAsync(5_000));
    expect(screen.getByTestId("tv-pair-code")).toHaveTextContent("K7MP");
    expect(screen.getByTestId("tv-pair-status")).toHaveTextContent("Waiting for a board");

    await act(() => vi.advanceTimersByTimeAsync(TV_PAIR_POLL_MS));
    expect(tvPairStart).toHaveBeenCalledTimes(3);
    expect(screen.getByTestId("tv-pair-code")).toHaveTextContent("ACDE");
  });
});

describe("Show on a TV", () => {
  it("sends the board to the code typed in, any way it's typed", async () => {
    sendToTv.mockResolvedValue({ ok: true });
    render(<SendToTv gameId="brd123" />);
    const input = screen.getByTestId("send-to-tv-code");
    expect(screen.getByTestId("send-to-tv")).toHaveTextContent("/tv");
    expect(screen.getByTestId("send-to-tv-send")).toBeDisabled();
    fireEvent.change(input, { target: { value: "k7 mp" } });
    expect(input).toHaveValue("K7 MP");
    fireEvent.click(screen.getByTestId("send-to-tv-send"));
    await act(async () => {});
    expect(sendToTv).toHaveBeenCalledWith("brd123", "K7MP");
    expect(screen.getByTestId("send-to-tv-sent")).toHaveTextContent("Sent. The board is on the TV showing K7MP.");
    expect(input).toHaveValue("");
  });

  it("offers TV mode on this device, and a bare box for a card that says what it's for", () => {
    const onOpenHere = vi.fn();
    render(<SendToTv gameId="brd123" onOpenHere={onOpenHere} />);
    fireEvent.click(screen.getByTestId("send-to-tv-here"));
    expect(onOpenHere).toHaveBeenCalledTimes(1);
    cleanup();
    render(<SendToTv gameId="brd123" bare />);
    expect(screen.getByTestId("send-to-tv-code")).toBeInTheDocument();
    expect(screen.getByTestId("send-to-tv")).not.toHaveTextContent("/tv");
    expect(screen.queryByTestId("send-to-tv-here")).toBeNull();
  });

  it("says why a code didn't work", async () => {
    sendToTv.mockRejectedValue(new ApiError("No TV is showing that code. Check the TV: its code changes every 15 minutes.", 404));
    render(<SendToTv gameId="brd123" />);
    fireEvent.change(screen.getByTestId("send-to-tv-code"), { target: { value: "ACDE" } });
    fireEvent.keyDown(screen.getByTestId("send-to-tv-code"), { key: "Enter" });
    await act(async () => {});
    expect(screen.getByText(/No TV is showing that code/)).toBeInTheDocument();
    expect(screen.queryByTestId("send-to-tv-sent")).toBeNull();
  });
});
