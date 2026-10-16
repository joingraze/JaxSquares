// The create page's checkout decisions, end to end through the real lib/checkout
// with the server and StoreKit faked: a draft with an App Store purchase in
// flight is never thrown away, and a page that loaded while checkout was in
// test mode still opens the board after the switch to live.

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GameState, PaymentConfig } from "../../../shared/types";

const native = {
  configure: vi.fn(async () => {}),
  purchaseProduct: vi.fn(),
  finishTransaction: vi.fn(async () => {}),
  getUnfinishedTransactions: vi.fn(async () => ({ transactions: [] as unknown[] })),
  getProduct: vi.fn(async () => ({ product: { priceString: "$4.99" } })),
  addListener: vi.fn(async () => ({ remove: async () => {} })),
};
vi.mock("@capgo/native-purchases", () => ({ NativePurchases: native }));
const device = { platform: "ios" as "ios" | "web" };
vi.mock("../../lib/native", async (orig) => {
  const real = await orig<typeof import("../../lib/native")>();
  return { ...real, haptic: vi.fn(async () => {}), platform: () => device.platform };
});
vi.mock("../../components/ui/confetti", () => ({ celebrate: vi.fn(), CELEBRATION_COLORS: [], prefersReducedMotion: () => true }));

const { ToastProvider } = await import("../../components/ui");
const { fetchAppConfig } = await import("../../lib/checkout");
const { setProfile } = await import("../../lib/identity");
const { default: CreateGame } = await import("../../pages/CreateGame");

const TEST: PaymentConfig = { mode: "test", priceCents: 499, currency: "usd", stripePublishableKey: null, iapProductId: "com.jaxsquares.app.board" };
const LIVE: PaymentConfig = { ...TEST, mode: "live", stripePublishableKey: "pk_test_1" };

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function draftOf(id: string, status = "draft") {
  return {
    id,
    name: "KC vs PHI",
    sport: "football",
    league: "custom",
    teamX: { name: "Chiefs", abbr: "KC", color: null },
    teamY: { name: "Eagles", abbr: "PHI", color: null },
    format: { periods: "quarters", reverse: false, boardSize: 100, freshNumbers: false },
    status,
  };
}

let server: { payments: PaymentConfig; payTest: () => Response; created: number };
let requests: { method: string; url: string }[];

beforeEach(async () => {
  for (const fn of Object.values(native)) fn.mockClear();
  native.getUnfinishedTransactions.mockResolvedValue({ transactions: [] });
  requests = [];
  server = { payments: LIVE, payTest: () => json({ error: "Test checkout is off" }, 403), created: 0 };
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
        return json({ game: draftOf(id), adminToken: `admin-${id}`, paymentRequired: true }, 201);
      }
      const id = /\/api\/games\/([^/]+)/.exec(url)?.[1] ?? "";
      if (method === "DELETE") return json({ ok: true });
      if (url.endsWith("/pay/test")) return server.payTest();
      if (url.endsWith("/pay/iap")) return json({ state: { game: draftOf(id, "open") } as unknown as GameState });
      if (method === "GET") return json({ game: draftOf(id) });
      return json({ error: "not found" }, 404);
    }),
  );
  setProfile({ name: "Jordan" });
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
  // No real games this week: the page leads with custom teams.
  const x = await screen.findByTestId("team-x-input");
  fireEvent.change(x, { target: { value: "Chiefs" } });
  fireEvent.change(screen.getByTestId("team-y-input"), { target: { value: "Eagles" } });
}

const create = () => act(async () => void fireEvent.click(screen.getByTestId("create-submit")));

describe("CreateGame checkout", () => {
  it("keeps a draft whose App Store purchase is waiting on approval when the settings change", async () => {
    device.platform = "ios";
    native.purchaseProduct.mockRejectedValue(new Error("Transaction pending"));
    await renderPage(LIVE);

    await create();
    expect(await screen.findByText(/Waiting on approval/)).toBeInTheDocument();
    expect(native.purchaseProduct).toHaveBeenCalledWith(expect.objectContaining({ appAccountToken: expect.any(String) }));

    // The host renames a team and taps Create again: that makes a new draft...
    fireEvent.change(screen.getByTestId("team-x-input"), { target: { value: "Raiders" } });
    await create();
    await waitFor(() => expect(server.created).toBe(2));
    await waitFor(() => expect(native.purchaseProduct).toHaveBeenCalledTimes(2));
    // ...but the first one, which a parent may still approve (and pay for), stays.
    expect(requests.filter((r) => r.method === "DELETE")).toEqual([]);
  });

  it("still drops a stale draft nobody paid for", async () => {
    device.platform = "ios";
    native.purchaseProduct.mockRejectedValue(new Error("User cancelled"));
    await renderPage(LIVE);
    await create();
    expect(await screen.findByText(/No charge/)).toBeInTheDocument();
    fireEvent.change(screen.getByTestId("team-x-input"), { target: { value: "Raiders" } });
    await create();
    await waitFor(() => expect(requests.filter((r) => r.method === "DELETE").map((r) => r.url)).toEqual(["/api/games/g1"]));
  });

  it("opens the board with the real checkout when test mode was switched off after the page loaded", async () => {
    device.platform = "ios";
    native.purchaseProduct.mockResolvedValue({ transactionId: "2000000000000042", productIdentifier: TEST.iapProductId });
    await renderPage(TEST);
    server.payments = LIVE; // the operator flips PAYMENTS_MODE=live

    await create();
    await waitFor(() => expect(native.purchaseProduct).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("Board page", undefined, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.queryByText(/Test checkout is off/)).toBeNull();
    expect(requests.some((r) => r.url.endsWith("/pay/iap"))).toBe(true);
  });
});
