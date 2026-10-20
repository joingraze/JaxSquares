// "More boards for this game" on a board in a group: each sibling's name, its
// square price when set (in the app), squares left or where it stands, and a
// tap that opens it.

import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { SiblingBoard } from "../../../shared/types";

vi.mock("../../lib/native", async (orig) => ({ ...(await orig<typeof import("../../lib/native")>()), haptic: vi.fn(async () => {}) }));
vi.mock("../../lib/live", async (orig) => ({ ...(await orig<typeof import("../../lib/live")>()), prefetchGame: vi.fn(async () => null) }));

const { SiblingBoards } = await import("./SiblingBoards");

const sib = (over: Partial<SiblingBoard>): SiblingBoard => ({
  id: "b2b2b2",
  name: "Office Squares · Board 2",
  status: "open",
  squarePrice: 5,
  unit: "$",
  justForFun: false,
  squaresLeft: 42,
  totalSquares: 100,
  ...over,
});

function renderRow(siblings: SiblingBoard[], boardName = "Office Squares") {
  render(
    <MemoryRouter initialEntries={["/g/a1a1a1"]}>
      <Routes>
        <Route path="/g/a1a1a1" element={<SiblingBoards siblings={siblings} boardName={boardName} />} />
        <Route path="/g/:id" element={<p>Opened another board</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("SiblingBoards", () => {
  it("lists each other board with its price, squares left and a link to it", () => {
    renderRow([
      sib({}),
      sib({ id: "c3c3c3", name: "Office Squares · Board 3", squarePrice: 20, squaresLeft: 0 }),
      sib({ id: "d4d4d4", name: "Just for laughs", squarePrice: null, justForFun: true, status: "locked" }),
      sib({ id: "e5e5e5", name: "Points board", unit: "pts", squarePrice: 10, status: "final" }),
    ]);
    const row = screen.getByTestId("sibling-boards");
    expect(row).toHaveTextContent("More boards for this game");
    const boards = within(row).getAllByTestId("sibling-board");
    // Numbered boards of "Office Squares" read short next to it.
    expect(boards.map((b) => b.textContent)).toEqual([
      "Board 2$5 a square·42 left",
      "Board 3$20 a square·Board's full",
      "Just for laughsJust for fun·Numbers drawn",
      "Points board10 pts a square·Final",
    ]);
    expect(boards[0]).toHaveAttribute("href", "/g/b2b2b2");
    fireEvent.click(boards[1]);
    expect(screen.getByText("Opened another board")).toBeInTheDocument();
  });

  it("leaves the price out when the host set none, and keeps a full name that shares nothing", () => {
    renderRow([sib({ squarePrice: null })], "Family Squares");
    expect(screen.getByTestId("sibling-board")).toHaveTextContent(/^Office Squares · Board 242 left$/);
    expect(screen.getByTestId("sibling-board")).not.toHaveTextContent("$");
  });

  it("renders nothing for a board on its own", () => {
    renderRow([]);
    expect(screen.queryByTestId("sibling-boards")).not.toBeInTheDocument();
  });
});
