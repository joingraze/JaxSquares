// The host fee checkout: the price helpers in lib/checkout and CheckoutSheet
// opened on its own (as host controls do when the host draws, or pays ahead).

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
// Stripe's card form, faked: mounts, never completes.
const stripeElement = { on: vi.fn(), mount: vi.fn(), destroy: vi.fn() };
vi.mock("@stripe/stripe-js", () => ({
  loadStripe: vi.fn(async () => ({ elements: () => ({ create: () => stripeElement }), confirmPayment: vi.fn() })),
}));

const { appStorePrice, hostFeePrice } = await import("../../lib/checkout");
const { CheckoutSheet } = await import("./CheckoutSheet");

const TEST: PaymentConfig = { mode: "test", priceCents: 499, currency: "usd", stripePublishableKey: null, iapProductId: "com.jaxsquares.board" };
const LIVE: PaymentConfig = { ...TEST, mode: "live", stripePublishableKey: "pk_test_123" };

describe("host fee price", () => {
  it("is the server price on the web (test mode too) and only ever the App Store's own string on iOS", async () => {
    expect(await hostFeePrice(TEST, "web")).toBe("$4.99");
    expect(await hostFeePrice(LIVE, "web")).toBe("$4.99");
    expect(await hostFeePrice(LIVE, "android")).toBe("$4.99");
    expect(await hostFeePrice(LIVE, "ios")).toBe("4,99 €");
    expect(await hostFeePrice(TEST, "ios")).toBe("4,99 €");
    expect(getProduct).toHaveBeenCalledWith({ productIdentifier: "com.jaxsquares.board" });
  });

  it("never falls back to the web price in the iOS app", async () => {
    getProduct.mockRejectedValueOnce(new Error("StoreKit isn't ready"));
    expect(await hostFeePrice({ ...LIVE, iapProductId: "com.jaxsquares.missing" }, "ios")).toBeNull();
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
  status: "open",
  paid: false,
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
    render(<CheckoutSheet open board={{ game, adminToken: "tok" }} payments={null} onPaid={() => {}} onClose={() => {}} />);
    expect(await screen.findByRole("button", { name: "Try again" })).toHaveAttribute("data-testid", "pay-confirm");
  });

  it("loads the config itself and pays the fee to draw in one tap, with no sales pitch", async () => {
    const config: AppConfig = { payments: TEST, vapidPublicKey: null };
    const state = { game: { ...game, paid: true } } as unknown as GameState;
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith("/api/config")) return new Response(JSON.stringify(config), { status: 200 });
      if (url.endsWith("/api/games/abc123/pay/test")) return new Response(JSON.stringify({ state }), { status: 200 });
      return new Response("{}", { status: 404 });
    });
    const onPaid = vi.fn();
    render(<CheckoutSheet open board={{ game, adminToken: "tok" }} onPaid={onPaid} onClose={() => {}} />);

    const confirm = await screen.findByRole("button", { name: "Draw the numbers" });
    expect(confirm).toHaveAttribute("data-testid", "pay-confirm");
    expect(screen.getByRole("dialog", { name: "Draw the numbers" })).toBeInTheDocument();
    expect(screen.getByText(/The host fee for this board\. Squares lock and the numbers get drawn right after\./)).toBeInTheDocument();
    expect(screen.getByText("Packers vs Bears Squares")).toBeInTheDocument();
    expect(screen.getByText("No charge while checkout is in test mode.")).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "What's included" })).toBeNull();

    fireEvent.click(confirm);
    await waitFor(() => expect(onPaid).toHaveBeenCalledWith("abc123", state), { timeout: 2000 });
    const payCall = fetchMock.mock.calls.find(([url]) => String(url).endsWith("/pay/test"));
    expect(payCall?.[1]?.headers).toMatchObject({ "x-admin-token": "tok" });
  });

  it("says what paying ahead does on a linked board", async () => {
    render(<CheckoutSheet open purpose="ahead" board={{ game, adminToken: "tok" }} payments={TEST} onPaid={() => {}} onClose={() => {}} />);
    expect(await screen.findByRole("button", { name: "Pay ahead" })).toHaveAttribute("data-testid", "pay-confirm");
    expect(screen.getByRole("dialog", { name: "Pay ahead for kickoff" })).toBeInTheDocument();
    expect(screen.getByText(/Jax draws the numbers at kickoff/)).toBeInTheDocument();
  });
});

describe("CheckoutSheet after a config change", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("shows the price of the PaymentIntent it will charge, not a stale config's", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith("/pay/stripe")) return new Response(JSON.stringify({ clientSecret: "pi_1_secret", amountCents: 599, currency: "usd" }), { status: 200 });
      return new Response("{}", { status: 404 });
    });
    // The page loaded config while the board cost $4.99; the server now charges $5.99.
    render(<CheckoutSheet open board={{ game, adminToken: "tok" }} payments={LIVE} onPaid={() => {}} onClose={() => {}} />);
    expect(await screen.findByRole("button", { name: "Pay $5.99" })).toHaveAttribute("data-testid", "pay-confirm");
    expect(screen.getByText("$5.99 host fee, once for this board.")).toBeInTheDocument();
  });

  it("switches to the real checkout when the server says test checkout is off", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith("/api/config")) return new Response(JSON.stringify({ payments: LIVE, vapidPublicKey: null }), { status: 200 });
      if (url.endsWith("/pay/test")) return new Response(JSON.stringify({ error: "Test checkout is off" }), { status: 403 });
      if (url.endsWith("/pay/stripe")) return new Response(JSON.stringify({ clientSecret: "pi_1_secret", amountCents: 499, currency: "usd" }), { status: 200 });
      return new Response("{}", { status: 404 });
    });
    render(<CheckoutSheet open board={{ game, adminToken: "tok" }} payments={TEST} onPaid={() => {}} onClose={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: "Draw the numbers" }));
    expect(await screen.findByRole("button", { name: "Pay $4.99" }, { timeout: 2000 })).toHaveAttribute("data-testid", "pay-confirm");
    expect(screen.queryByText("Test checkout is off")).toBeNull();
  });
});
