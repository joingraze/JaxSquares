import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AccountInfo } from "../../../shared/types";

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
vi.mock("./SignInSheet", () => ({ SignInSheet: ({ open }: { open: boolean }) => (open ? <div data-testid="signin-sheet" /> : null) }));

const { SIGNIN_SNOOZE_KEY, SIGNIN_SNOOZE_MS, SignInCard } = await import("./SignInCard");

const NOW = new Date(2026, 9, 20, 12, 0, 0).getTime();

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
  account.current = null;
  auth.providers = ["google", "apple"];
});

describe("the sign-in card", () => {
  it("on a board, says these squares only live on this device and opens sign-in", () => {
    render(<SignInCard place="board" />);
    expect(screen.getByTestId("board-signin-card")).toHaveTextContent(
      "Keep your boards on every deviceYour squares here only live on this device. Sign in with Google or Apple and they follow you to any phone or computer.",
    );
    fireEvent.click(screen.getByTestId("board-signin-open"));
    expect(screen.getByTestId("signin-sheet")).toBeInTheDocument();
  });

  it("snoozes for 3 days, on the board and on Home alike", () => {
    const { unmount } = render(<SignInCard place="board" />);
    act(() => fireEvent.click(screen.getByRole("button", { name: "Remind me in 3 days" })));
    expect(screen.queryByTestId("board-signin-card")).toBeNull();
    expect(Number(localStorage.getItem(SIGNIN_SNOOZE_KEY))).toBe(NOW + SIGNIN_SNOOZE_MS);
    unmount();

    // Two days later, neither place shows it.
    vi.setSystemTime(NOW + 2 * 24 * 60 * 60 * 1000);
    const home = render(<SignInCard />);
    expect(screen.queryByTestId("home-signin-card")).toBeNull();
    home.unmount();

    // After 3 days it's back.
    vi.setSystemTime(NOW + SIGNIN_SNOOZE_MS + 1);
    render(<SignInCard />);
    expect(screen.getByTestId("home-signin-card")).toBeInTheDocument();
  });

  it("never shows once signed in, or where sign-in isn't set up", () => {
    account.current = { provider: "google", email: null, name: null, since: 0 } as AccountInfo;
    const { unmount } = render(<SignInCard place="board" />);
    expect(screen.queryByTestId("board-signin-card")).toBeNull();
    unmount();
    account.current = null;
    auth.providers = [];
    render(<SignInCard place="board" />);
    expect(screen.queryByTestId("board-signin-card")).toBeNull();
  });
});
