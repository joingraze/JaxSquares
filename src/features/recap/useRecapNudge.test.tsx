// "Share the recap" when a winner lands: a toast with the action, once the
// board's own alert for the moment has had its turn; one at a time.

import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Activity } from "../../../shared/types";

vi.mock("../../lib/native", async (orig) => ({ ...(await orig<typeof import("../../lib/native")>()), haptic: vi.fn(async () => {}) }));

const { ToastProvider } = await import("../../components/ui");
const { nudgesRecap, useRecapNudge } = await import("./useRecapNudge");

const winner = (playerIds: string[]): Activity => ({ id: "w", type: "winner", at: 0, actor: null, data: { periodKey: "q1", label: "Q1", playerIds, cell: null, prize: null } });
const final: Activity = { id: "f", type: "final", at: 0, actor: null, data: {} };

afterEach(() => {
  vi.useRealTimers();
});

describe("nudgesRecap", () => {
  it("is for a winner who held the square, or the final whistle", () => {
    expect(nudgesRecap(winner(["ana"]))).toBe(true);
    expect(nudgesRecap(winner([]))).toBe(false);
    expect(nudgesRecap(final)).toBe(true);
    expect(nudgesRecap({ ...final, type: "score" })).toBe(false);
  });
});

describe("useRecapNudge", () => {
  function Harness({ activity, after, onOpen }: { activity: Activity; after: number; onOpen: () => void }) {
    const nudge = useRecapNudge(onOpen);
    return (
      <button type="button" onClick={() => nudge(activity, after)}>
        land
      </button>
    );
  }

  it("offers the recap after the moment's alert, and opens it from the toast", () => {
    vi.useFakeTimers();
    const onOpen = vi.fn();
    render(
      <ToastProvider>
        <Harness activity={winner(["ana"])} after={4200} onOpen={onOpen} />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByText("land"));
    act(() => void vi.advanceTimersByTime(4000));
    expect(screen.queryByText("A winner just landed")).toBeNull();
    act(() => void vi.advanceTimersByTime(300));
    expect(screen.getByText("A winner just landed")).toBeInTheDocument();
    expect(screen.getByText("Send the group the recap card.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Share the recap" }));
    expect(onOpen).toHaveBeenCalled();
  });

  it("stays quiet when nobody held the winning square", () => {
    vi.useFakeTimers();
    render(
      <ToastProvider>
        <Harness activity={winner([])} after={0} onOpen={() => {}} />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByText("land"));
    act(() => void vi.advanceTimersByTime(10_000));
    expect(screen.queryByRole("button", { name: "Share the recap" })).toBeNull();
  });
});
