// The board checkout outside the create page: the price helpers in lib/checkout
// and CheckoutSheet opened on its own (as host controls do for an unpaid draft).

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppConfig, Game, GameState, PaymentConfig } from "../../../shared/types";

const getProduct = vi.fn(async ({ productIdentifier }: { productIdentifier: string }) => ({
  product: { identifier: productIdentifier, priceString: "4,99 €" },
}));
vi.mock("@capgo/native-purchases", () => ({
  NativePurchases: { configure: vi.fn(async () => {}), getProduct: (opts: { productIdentifier: string }) => getProduct(opts) },
}));
vi.mock("../../lib/native", async (orig) => {
  const real = await orig<typeof import("../../lib/native")>();
  return { ...real, haptic: vi.fn(async () => {}), platform: () => "web" as const };
});
vi.mock("../../components/ui/confetti", () => ({ celebrate: vi.fn(), CELEBRATION_COLORS: [], prefersReducedMotion: () => true }));

const { appStorePrice, checkoutPrice } = await import("../../lib/checkout");
const { CheckoutSheet } = await import("./CheckoutSheet");

const TEST: PaymentConfig = { mode: "test", priceCents: 499, currency: "usd", stripePublishableKey: null, iapProductId: "com.jaxsquares.board" };
const LIVE: PaymentConfig = { ...TEST, mode: "live", stripePublishableKey: "pk_test_123" };

describe("checkout price", () => {
  it("shows nothing in test mode, the server price on the web and the App Store's own string on iOS", async () => {
    expect(await checkoutPrice(TEST, "web")).toBeNull();
    expect(await checkoutPrice(TEST, "ios")).toBeNull();
    expect(await checkoutPrice(LIVE, "web")).toBe("$4.99");
    expect(await checkoutPrice(LIVE, "ios")).toBe("4,99 €");
    expect(getProduct).toHaveBeenCalledWith({ productIdentifier: "com.jaxsquares.board" });
  });

  it("only asks StoreKit on iOS, once per product", async () => {
    getProduct.mockClear();
    expect(await appStorePrice("web", "com.jaxsquares.board")).toBeNull();
    expect(await appStorePrice("android", "com.jaxsquares.board")).toBeNull();
    await Promise.all([appStorePrice("ios", "com.jaxsquares.other"), appStorePrice("ios", "com.jaxsquares.other")]);
    expect(getProduct).toHaveBeenCalledTimes(1);
  });
});

const game = {
  id: "abc123",
  name: "Packers vs Bears Squares",
  sport: "football",
  league: "custom",
  teamX: { name: "Green Bay Packers", abbr: "GB", color: "#3ab7ff" },
  teamY: { name: "Chicago Bears", abbr: "CHI", color: "#ff66a6" },
  format: { periods: "quarters", reverse: false, boardSize: 100, freshNumbers: false },
  linkedEvent: null,
  status: "draft",
} as unknown as Game;

describe("CheckoutSheet on its own", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  // First: fetchAppConfig caches a successful config for the session.
  it("offers a retry when the config can't load", async () => {
    fetchMock.mockRejectedValue(new TypeError("offline"));
    render(<CheckoutSheet open draft={{ game, adminToken: "tok" }} payments={null} onPaid={() => {}} onClose={() => {}} />);
    expect(await screen.findByRole("button", { name: "Try again" })).toHaveAttribute("data-testid", "pay-confirm");
  });

  it("loads the config itself and opens a draft in one tap, with no sales pitch", async () => {
    const config: AppConfig = { payments: TEST, vapidPublicKey: null };
    const state = { game: { ...game, status: "open" } } as unknown as GameState;
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith("/api/config")) return new Response(JSON.stringify(config), { status: 200 });
      if (url.endsWith("/api/games/abc123/pay/test")) return new Response(JSON.stringify({ state }), { status: 200 });
      return new Response("{}", { status: 404 });
    });
    const onPaid = vi.fn();
    render(<CheckoutSheet open draft={{ game, adminToken: "tok" }} onPaid={onPaid} onClose={() => {}} />);

    const confirm = await screen.findByRole("button", { name: "Open my board" });
    expect(confirm).toHaveAttribute("data-testid", "pay-confirm");
    expect(screen.getByText("Packers vs Bears Squares")).toBeInTheDocument();
    expect(screen.getByText("No charge while checkout is in test mode.")).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "What's included" })).toBeNull();

    fireEvent.click(confirm);
    await waitFor(() => expect(onPaid).toHaveBeenCalledWith("abc123", state), { timeout: 2000 });
    const payCall = fetchMock.mock.calls.find(([url]) => String(url).endsWith("/pay/test"));
    expect(payCall?.[1]?.headers).toMatchObject({ "x-admin-token": "tok" });
  });
});
