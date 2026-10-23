// The TV display switches: shown at once, saved whole, put back when the save fails.

import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GameFormat } from "../../../shared/types";
import { TvDisplaySettings } from "./TvDisplaySettings";

const format: GameFormat = { periods: "quarters", reverse: false, boardSize: 100, freshNumbers: false };
const toggle = (part: string) => within(screen.getByTestId(`tv-display-${part}`).closest("li")!).getByRole("switch");

afterEach(cleanup);

describe("TvDisplaySettings", () => {
  it("flips a part at once and saves the whole set", async () => {
    const onChange = vi.fn(async () => true);
    render(<TvDisplaySettings game={{ format, tv: { winners: false } }} onChange={onChange} />);
    expect(toggle("winners")).not.toBeChecked();
    expect(toggle("freeToPlay")).not.toBeChecked();
    await act(async () => void fireEvent.click(toggle("amounts")));
    expect(onChange).toHaveBeenCalledWith({ winners: false, amounts: false });
    expect(toggle("amounts")).not.toBeChecked();
  });

  it("puts a switch back when the save fails", async () => {
    render(<TvDisplaySettings game={{ format }} onChange={async () => false} />);
    await act(async () => void fireEvent.click(toggle("celebrations")));
    expect(toggle("celebrations")).toBeChecked();
  });

  it("starts a venue board with free to play on, and keeps it off a board with a square price", () => {
    render(<TvDisplaySettings game={{ format: { ...format, venue: true } }} onChange={async () => true} />);
    expect(toggle("freeToPlay")).toBeChecked();
    cleanup();
    render(<TvDisplaySettings game={{ format: { ...format, squarePrice: 5 } }} onChange={async () => true} />);
    expect(toggle("freeToPlay")).toBeDisabled();
    expect(screen.getByText("Only on a board with no square price")).toBeInTheDocument();
  });
});
