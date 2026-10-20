// Creating a board is free: Create makes the board and opens it in one tap, with
// no checkout (drawing is free with up to 5 players; bigger boards pay the host
// fee when the host draws the numbers). Review's line says so with the price
// this device shows: the server's on the web, only
// the App Store's own string in the iOS app. End to end through the real
// lib/checkout with the server and StoreKit faked; the board is set up through
// the guided steps (custom teams, then Next to Review).

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PaymentConfig } from "../../../shared/types";

const native = {
  configure: vi.fn(async () => {}),
  purchaseProduct: vi.fn(),
  finishTransaction: vi.fn(async () => {}),
  getUnfinishedTransactions: vi.fn(async () => ({ transactions: [] as unknown[] })),
  getProduct: vi.fn(async () => ({ product: { priceString: "4,99 €" } })),
  addListener: vi.fn(async () => ({ remove: async () => {} })),
};
vi.mock("@capgo/native-purchases", () => ({ NativePurchases: native }));
const device = { platform: "web" as "ios" | "web" };
vi.mock("../../lib/native", async (orig) => {
  const real = await orig<typeof import("../../lib/native")>();
  return { ...real, haptic: vi.fn(async () => {}), platform: () => device.platform };
});
vi.mock("../../components/ui/confetti", () => ({ celebrate: vi.fn(), CELEBRATION_COLORS: [], prefersReducedMotion: () => true }));

const { ToastProvider } = await import("../../components/ui");
const { fetchAppConfig } = await import("../../lib/checkout");
const { setProfile } = await import("../../lib/identity");
const { default: CreateGame } = await import("../../pages/CreateGame");

const LIVE: PaymentConfig = { mode: "live", priceCents: 499, currency: "usd", stripePublishableKey: "pk_test_1", iapProductId: "com.jaxsquares.app.board" };

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function boardOf(id: string) {
  return {
    id,
    name: "KC vs PHI",
    sport: "football",
    league: "custom",
    teamX: { name: "Chiefs", abbr: "KC", color: null },
    teamY: { name: "Eagles", abbr: "PHI", color: null },
    format: { periods: "quarters", reverse: false, boardSize: 100, freshNumbers: false },
    status: "open",
    paid: false,
  };
}

let server: { payments: PaymentConfig; created: number };
let requests: { method: string; url: string }[];

beforeEach(async () => {
  for (const fn of Object.values(native)) fn.mockClear();
  requests = [];
  server = { payments: LIVE, created: 0 };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init: RequestInit = {}) => {
      const url = String(input);
      const method = init.method ?? "GET";
      requests.push({ method, url });
      if (url.includes("/api/schedule")) return json({ events: [], unavailable: true });
      if (url.endsWith("/api/config")) return json({ payments: server.payments, vapidPublicKey: null });
      if (method === "POST" && url.endsWith("/api/games")) {
        const id = `g${++server.created}`;
        return json({ game: boardOf(id), adminToken: `admin-${id}`, paymentRequired: false }, 201);
      }
      return json({ error: "not found" }, 404);
    }),
  );
  setProfile({ name: "Jordan" });
  sessionStorage.clear();
});

async function renderPage(payments: PaymentConfig) {
  server.payments = payments;
  await fetchAppConfig({ refresh: true });
  render(
    <ToastProvider>
      <MemoryRouter initialEntries={["/new"]}>
        <Routes>
          <Route path="/new" element={<CreateGame />} />
          <Route path="/g/:id" element={<p>Board page</p>} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
  );
  // No real games this week: the flow leads with custom teams.
  const x = await screen.findByTestId("team-x-input");
  fireEvent.change(x, { target: { value: "Chiefs" } });
  fireEvent.change(screen.getByTestId("team-y-input"), { target: { value: "Eagles" } });
  // The rest keeps its defaults: Next to Review.
  for (const step of ["format", "prizes", "details", "review"]) {
    fireEvent.click(screen.getByTestId("wizard-next"));
    await waitFor(() => expect(screen.getByTestId("wizard-step")).toHaveAttribute("data-step", step));
  }
}

const create = () => act(async () => void fireEvent.click(screen.getByTestId("create-submit")));

describe("creating a board", () => {
  it("makes and opens the board in one tap, with no checkout", async () => {
    device.platform = "web";
    await renderPage(LIVE);
    await waitFor(() => expect(screen.getByTestId("create-fee")).toHaveTextContent("Free to set up and invite. Free to draw with up to 5 players, $4.99 for bigger boards."));
    await create();
    expect(await screen.findByText("Board page", undefined, { timeout: 3000 })).toBeInTheDocument();
    expect(requests.filter((r) => r.method === "POST").map((r) => r.url)).toEqual(["/api/games"]);
    expect(requests.some((r) => r.url.includes("/pay/"))).toBe(false);
    expect(native.purchaseProduct).not.toHaveBeenCalled();
  });

  it("shows only the App Store's price in the iOS app, and buys nothing to create", async () => {
    device.platform = "ios";
    await renderPage(LIVE);
    await waitFor(() => expect(screen.getByTestId("create-fee")).toHaveTextContent("Free to set up and invite. Free to draw with up to 5 players, 4,99 € for bigger boards."));
    expect(screen.queryByText(/\$4\.99/)).toBeNull();
    await create();
    expect(await screen.findByText("Board page", undefined, { timeout: 3000 })).toBeInTheDocument();
    expect(native.purchaseProduct).not.toHaveBeenCalled();
  });

  it("still says when the fee is due when the App Store can't give its price (never the web price)", async () => {
    device.platform = "ios";
    native.getProduct.mockRejectedValueOnce(new Error("StoreKit isn't ready"));
    await renderPage({ ...LIVE, iapProductId: "com.jaxsquares.app.board.unlisted" });
    const line = screen.getByTestId("create-fee");
    await waitFor(() => expect(native.getProduct).toHaveBeenCalled());
    expect(line).toHaveTextContent("Free to set up and invite. Free to draw with up to 5 players; bigger boards have a host fee when you draw.");
    expect(line.textContent).not.toMatch(/\$/);
  });
});
