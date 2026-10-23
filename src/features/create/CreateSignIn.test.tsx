// Hosts sign in to make a board (docs/auth.md "Hosts sign in"): where sign-in
// is set up, Create asks a host who isn't signed in to sign in first, and makes
// the board right after; Review says so ahead of time. The server checks too:
// its account_required answer opens the same sheet. A device that signed in
// before is asked up front instead, once a visit ("Not now" keeps the usual order).

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ACCOUNT_REQUIRED_CODE, type PaymentConfig } from "../../../shared/types";

vi.mock("../../lib/native", async (orig) => {
  const real = await orig<typeof import("../../lib/native")>();
  return { ...real, haptic: vi.fn(async () => {}), platform: () => "web" };
});
vi.mock("../../components/ui/confetti", () => ({ celebrate: vi.fn(), CELEBRATION_COLORS: [], prefersReducedMotion: () => true }));
// The real sheet signs in with Apple or Google; here "Sign in" just says it did.
vi.mock("../account/SignInSheet", () => ({
  SignInSheet: ({ title, description, onClose, onSignedIn, dismissLabel }: { title: string; description?: string; onClose: () => void; onSignedIn?: () => void; dismissLabel?: string }) => (
    <div data-testid="signin-sheet">
      <p>{title}</p>
      {description && <p>{description}</p>}
      <button
        type="button"
        onClick={() => {
          onClose();
          onSignedIn?.();
        }}
      >
        Signed in
      </button>
      {dismissLabel && (
        <button type="button" onClick={onClose}>
          {dismissLabel}
        </button>
      )}
    </div>
  ),
}));

const { ToastProvider } = await import("../../components/ui");
const { getPlayerId, setProfile, setServerIdentity } = await import("../../lib/identity");
const { default: CreateGame } = await import("../../pages/CreateGame");

const PAYMENTS: PaymentConfig = { mode: "test", priceCents: 499, currency: "usd", stripePublishableKey: null, iapProductId: "com.jaxsquares.app.board" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

let creates: number;
/** What POST /api/games answers: the board, or account_required (the server's own check). */
let refuse: boolean;

beforeEach(() => {
  creates = 0;
  refuse = false;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init: RequestInit = {}) => {
      const url = String(input);
      if (url.includes("/api/schedule")) return json({ events: [], unavailable: true });
      if (url.endsWith("/api/config")) {
        return json({ payments: PAYMENTS, vapidPublicKey: null, auth: { googleWebClientId: "web.apps.googleusercontent.com", googleIosClientId: null, appleServicesId: "com.jaxsquares.web", appleNative: true } });
      }
      if (init.method === "POST" && url.endsWith("/api/games")) {
        creates++;
        if (refuse) {
          refuse = false;
          return json({ error: "Sign in with Apple or Google to make a board. Players never need an account.", code: ACCOUNT_REQUIRED_CODE }, 409);
        }
        return json({ game: { id: "g1", name: "KC vs PHI", sport: "football", league: "custom", teamX: { name: "Chiefs" }, teamY: { name: "Eagles" }, format: { periods: "quarters", reverse: false, boardSize: 100, freshNumbers: false }, status: "open", paid: false }, adminToken: "admin-g1", paymentRequired: false }, 201);
      }
      return json({ error: "not found" }, 404);
    }),
  );
  setProfile({ name: "Jordan" });
  sessionStorage.clear();
});

function renderCreate() {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={["/new"]}>
        <Routes>
          <Route path="/new" element={<CreateGame />} />
          <Route path="/g/:id" element={<p>Board page</p>} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
  );
}

async function toReview() {
  renderCreate();
  await fillAndGoToReview();
}

async function fillAndGoToReview() {
  fireEvent.change(await screen.findByTestId("team-x-input"), { target: { value: "Chiefs" } });
  fireEvent.change(screen.getByTestId("team-y-input"), { target: { value: "Eagles" } });
  for (const step of ["format", "prizes", "details", "review"]) {
    fireEvent.click(screen.getByTestId("wizard-next"));
    await waitFor(() => expect(screen.getByTestId("wizard-step")).toHaveAttribute("data-step", step));
  }
}

const create = () => act(async () => void fireEvent.click(screen.getByTestId("create-submit")));

describe("hosts sign in to make a board", () => {
  it("says so on Review, asks at Create, and makes the board right after signing in", async () => {
    await toReview();
    // Never signed in on this device: nothing up front.
    expect(screen.queryByText("Sign in before you start?")).toBeNull();
    expect(await screen.findByTestId("create-signin-note")).toHaveTextContent("You'll sign in with Google or Apple to create it. Players never need an account.");
    await create();
    expect(await screen.findByText("Sign in to create your board")).toBeInTheDocument();
    expect(creates).toBe(0);
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Signed in" })));
    expect(await screen.findByText("Board page", undefined, { timeout: 3000 })).toBeInTheDocument();
    expect(creates).toBe(1);
  });

  it("opens the sign-in sheet when the server says sign in first", async () => {
    await toReview();
    await screen.findByTestId("create-signin-note");
    refuse = true;
    // The host signed in, but this device's link is gone (signed out elsewhere): the server's check catches it.
    await create();
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Signed in" })));
    expect(creates).toBe(1);
    expect(await screen.findByTestId("signin-sheet")).toBeInTheDocument();
    expect(screen.queryByText(/Couldn't make the board/)).toBeNull();
  });
});

describe("a device that signed in before", () => {
  beforeEach(() => localStorage.setItem("jaxsquares.signedInBefore", "google"));

  it("is asked up front, once a visit; Not now keeps sign-in at Create", async () => {
    const view = renderCreate();
    expect(await screen.findByText("Sign in before you start?")).toBeInTheDocument();
    expect(screen.getByText(/You've signed in with Google on this device before/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Not now" }));
    expect(screen.queryByTestId("signin-sheet")).toBeNull();
    await fillAndGoToReview();
    expect(screen.getByTestId("create-signin-note")).toBeInTheDocument();
    await create();
    expect(await screen.findByText("Sign in to create your board")).toBeInTheDocument();
    expect(creates).toBe(0);

    // Back to the flow in the same visit: not asked again.
    view.unmount();
    renderCreate();
    await fillAndGoToReview();
    expect(screen.getByTestId("create-signin-note")).toBeInTheDocument();
    expect(screen.queryByText("Sign in before you start?")).toBeNull();
  });

  it("signed in up front, Create makes the board without asking again", async () => {
    renderCreate();
    await screen.findByText("Sign in before you start?");
    fireEvent.click(screen.getByRole("button", { name: "Signed in" }));
    // The sheet signed this device in.
    act(() => void setServerIdentity(getPlayerId(), { provider: "google", email: null, name: null, since: 0 }));
    expect(screen.queryByText("Sign in before you start?")).toBeNull();
    await fillAndGoToReview();
    expect(screen.queryByTestId("create-signin-note")).toBeNull();
    await create();
    expect(await screen.findByText("Board page", undefined, { timeout: 3000 })).toBeInTheDocument();
    expect(creates).toBe(1);
  });
});
