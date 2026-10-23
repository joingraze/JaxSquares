// Typing a name in "Your look": the sheet focuses the name field only as it
// opens (when there's no name yet), so a name that stops being empty after
// its first letter never pulls focus out of the field (on a phone, the
// keyboard closing after one letter).

import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../lib/native", async (orig) => {
  const real = await orig<typeof import("../../../lib/native")>();
  return { ...real, haptic: vi.fn(async () => {}) };
});

const { getProfile, setProfile } = await import("../../../lib/identity");
const { LookSheet } = await import("./LookSheet");

beforeEach(() => {
  localStorage.clear();
  setProfile({ name: "" });
  // BottomSheet shows on the frame after mounting.
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
    cb(0);
    return 0;
  });
});

/** Types `text` one letter at a time, as a keyboard would. */
function typeInto(input: HTMLInputElement, text: string) {
  for (const ch of text) fireEvent.change(input, { target: { value: input.value + ch } });
}

describe("Your look's name field", () => {
  it("keeps focus while a first name is typed, letter by letter", async () => {
    render(<LookSheet open onClose={() => {}} />);
    const input = screen.getByTestId("profile-name") as HTMLInputElement;
    await act(async () => {});
    expect(document.activeElement).toBe(input);
    typeInto(input, "Jarryd Hensel");
    await act(async () => {});
    expect(input.value).toBe("Jarryd Hensel");
    expect(document.activeElement).toBe(input);
    expect(getProfile().name).toBe("Jarryd Hensel");
  });

  it("keeps focus when a name is cleared and typed again", async () => {
    setProfile({ name: "Jarryd" });
    render(<LookSheet open onClose={() => {}} />);
    const input = screen.getByTestId("profile-name") as HTMLInputElement;
    input.focus();
    fireEvent.change(input, { target: { value: "" } });
    await act(async () => {});
    typeInto(input, "AJ");
    await act(async () => {});
    expect(input.value).toBe("AJ");
    expect(document.activeElement).toBe(input);
  });
});
