// The Host Pass on the client: the purchase gate (the web needs a sign-in),
// prices (the App Store's own in the iOS app, never the web price), the
// checkout sheet's two choices with the subscription disclosure, and
// Profile's Host Pass section.

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppConfig, Game, HostPass, HostPassOffer, PaymentConfig } from "../../../shared/types";

const env = vi.hoisted(() => ({ platform: "web" as "web" | "ios" }));
const getProduct = vi.fn(async ({ productIdentifier }: { productIdentifier: string }) => ({
  product: { identifier: productIdentifier, priceString: productIdentifier.includes("hostpass") ? "10,99 €" : "5,49 €" },
}));
const manageSubscriptions = vi.fn(async () => {});
vi.mock("@capgo/native-purchases", () => ({
  NativePurchases: {
    configure: vi.fn(async () => {}),
    getProduct: (opts: { productIdentifier: string }) => getProduct(opts),
    manageSubscriptions: () => manageSubscriptions(),
  },
}));
vi.mock("../../lib/native", async (orig) => {
  const real = await orig<typeof import("../../lib/native")>();
  return { ...real, haptic: vi.fn(async () => {}), platform: () => env.platform };
});
vi.mock("../../components/ui/confetti", () => ({ celebrate: vi.fn(), CELEBRATION_COLORS: [], prefersReducedMotion: () => true }));
const stripeElement = { on: vi.fn(), mount: vi.fn(), destroy: vi.fn() };
vi.mock("@stripe/stripe-js", () => ({
  loadStripe: vi.fn(async () => ({ elements: () => ({ create: () => stripeElement }), confirmPayment: vi.fn() })),
}));

const { hostPassPrice, passCheckoutMethod } = await import("../../lib/checkout");
const { startPassPurchase } = await import("../../lib/useHostPass");
const passStore = await import("../../lib/hostPassStore");
const identity = await import("../../lib/identity");
const { ToastProvider } = await import("../../components/ui");
const { CheckoutSheet } = await import("../create/CheckoutSheet");
const { HostPassSection } = await import("./HostPassSection");

const OFFER: HostPassOffer = { priceCents: 999, currency: "usd", iapProductId: "com.jaxsquares.app.hostpass.yearly", web: true };
const TEST: PaymentConfig = { mode: "test", priceCents: 499, currency: "usd", stripePublishableKey: null, iapProductId: "com.jaxsquares.app.board", hostPass: OFFER };
const LIVE: PaymentConfig = { ...TEST, mode: "live", stripePublishableKey: "pk_test_123" };
const LIVE_NO_WEB_PASS: PaymentConfig = { ...LIVE, hostPass: { ...OFFER, web: false } };

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

const RENEWS = Date.UTC(2027, 9, 19, 18);
const active = (over: Partial<HostPass> = {}): HostPass => ({ active: true, status: "active", provider: "stripe", renewsAt: RENEWS, endsAt: null, autoRenew: true, ...over });

function signIn(): void {
  identity.setServerIdentity(identity.getPlayerId(), { provider: "google", email: "jordan@example.com", name: "Jordan", since: 1 });
}

const fetchMock = vi.fn();
let clock = Date.UTC(2026, 9, 19, 12);

beforeEach(() => {
  localStorage.clear();
  env.platform = "web";
  passStore.resetHostPass();
  fetchMock.mockReset();
  fetchMock.mockImplementation(async () => new Response("{}", { status: 404 }));
  vi.stubGlobal("fetch", fetchMock);
  // The app config is reused for a minute; each test starts past that.
  clock += 10 * 60_000;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(clock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("startPassPurchase (the one gate every purchase goes through)", () => {
  it("asks the web for a sign-in first, never the iOS app or the test pass", () => {
    expect(startPassPurchase(LIVE, "web", false)).toEqual({ kind: "sign-in" });
    expect(startPassPurchase(LIVE, "web", true).kind).toBe("checkout");
    expect(startPassPurchase(LIVE, "ios", false)).toEqual({ kind: "checkout", method: "iap" });
    expect(startPassPurchase(TEST, "web", false)).toEqual({ kind: "checkout", method: "test" });
    expect(startPassPurchase(TEST, "ios", false)).toEqual({ kind: "checkout", method: "test" });
  });

  it("isn't on sale on the web in live mode until the Stripe price is set", () => {
    expect(startPassPurchase(LIVE_NO_WEB_PASS, "web", true)).toEqual({ kind: "unavailable" });
    expect(passCheckoutMethod(LIVE_NO_WEB_PASS, "ios")).toBe("iap");
    expect(passCheckoutMethod({ ...LIVE, hostPass: undefined }, "web")).toBeNull();
  });
});

describe("hostPassPrice", () => {
  it("is the server's price on the web and only the App Store's own string in the iOS app", async () => {
    expect(await hostPassPrice(LIVE, "web")).toBe("$9.99");
    expect(await hostPassPrice(TEST, "web")).toBe("$9.99");
    expect(await hostPassPrice(LIVE, "ios")).toBe("10,99 €");
    getProduct.mockRejectedValueOnce(new Error("StoreKit isn't ready"));
    expect(await hostPassPrice({ ...LIVE, hostPass: { ...OFFER, iapProductId: "com.jaxsquares.app.hostpass.missing" } }, "ios")).toBeNull();
  });
});

function sheet(props: Partial<Parameters<typeof CheckoutSheet>[0]> = {}) {
  return render(
    <MemoryRouter>
      <CheckoutSheet open board={{ game, adminToken: "tok" }} payments={TEST} onPaid={() => {}} onPassActive={() => {}} onClose={() => {}} {...props} />
    </MemoryRouter>,
  );
}

describe("the checkout sheet at the draw: this board or the Host Pass", () => {
  it("offers both, defaults to this board, and switches in one tap", async () => {
    sheet();
    const board = await screen.findByTestId("plan-board");
    const pass = screen.getByTestId("plan-pass");
    expect(screen.getByRole("radiogroup", { name: "How to pay" })).toBeInTheDocument();
    expect(board).toHaveTextContent("This board · $4.99");
    expect(board).toHaveAttribute("aria-checked", "true");
    expect(pass).toHaveTextContent("Host Pass · $9.99/year");
    expect(pass).toHaveTextContent("Every board you host for a year");
    expect(pass).toHaveTextContent("Pays for itself on your second board");
    expect(pass).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("button", { name: "Draw the numbers" })).toHaveAttribute("data-testid", "pay-confirm");
    expect(screen.queryByTestId("pass-disclosure")).toBeNull();

    fireEvent.click(pass);
    expect(pass).toHaveAttribute("aria-checked", "true");
    expect(await screen.findByRole("button", { name: "Start test pass" })).toHaveAttribute("data-testid", "pay-confirm");
    expect(screen.getByTestId("pass-disclosure")).toHaveTextContent("Test pass: no charge while checkout is in test mode. It lasts a year and doesn't renew.");
    fireEvent.click(board);
    expect(await screen.findByRole("button", { name: "Draw the numbers" })).toBeInTheDocument();
  });

  it("starts the test pass with no charge and hands back the active pass", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url.endsWith("/api/payments/pass/test") ? Response.json({ pass: active({ provider: "test", autoRenew: false, renewsAt: null, endsAt: RENEWS }), offer: OFFER }) : new Response("{}", { status: 404 }),
    );
    const onPassActive = vi.fn();
    sheet({ onPassActive, initialPlan: "pass" });
    fireEvent.click(await screen.findByRole("button", { name: "Start test pass" }));
    await waitFor(() => expect(onPassActive).toHaveBeenCalledWith(expect.objectContaining({ pass: expect.objectContaining({ active: true }) })), { timeout: 2000 });
    expect(passStore.hasActivePass()).toBe(true);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/pay/"))).toBe(false);
  });

  it("isn't offered where it isn't sold, or when the caller doesn't take it", async () => {
    const { unmount } = sheet({ payments: LIVE_NO_WEB_PASS });
    fetchMock.mockImplementation(async () => Response.json({ clientSecret: "pi_secret", amountCents: 499, currency: "usd" }));
    expect(await screen.findByRole("button", { name: "Pay $4.99" })).toBeInTheDocument();
    expect(screen.queryByTestId("plan-picker")).toBeNull();
    unmount();
    sheet({ onPassActive: undefined });
    expect(await screen.findByRole("button", { name: "Draw the numbers" })).toBeInTheDocument();
    expect(screen.queryByTestId("plan-picker")).toBeNull();
  });
});

describe("the web sign-in gate", () => {
  it("asks a signed-out browser to sign in before the pass, and never starts a subscription", async () => {
    const onSignInForPass = vi.fn();
    sheet({ payments: LIVE, onSignInForPass });
    fireEvent.click(await screen.findByTestId("plan-pass"));
    const signInButton = await screen.findByTestId("pass-signin");
    expect(signInButton).toHaveTextContent("Sign in to continue");
    expect(screen.getByText("Your Host Pass stays with your account on every device.")).toBeInTheDocument();
    // The disclosure Apple asks for sits beside the button (on the web too): name, length, price per period, renewal, cancel, links.
    const disclosure = screen.getByTestId("pass-disclosure");
    expect(disclosure).toHaveTextContent("Host Pass, 1 year, $9.99 a year. It renews automatically each year until you cancel. Cancel any time in Profile › Host Pass › Manage.");
    expect(screen.getByRole("link", { name: "Terms" })).toHaveAttribute("href", "/terms#host-pass");
    expect(screen.getByRole("link", { name: "Privacy" })).toHaveAttribute("href", "/privacy");
    fireEvent.click(signInButton);
    expect(onSignInForPass).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/payments/pass/stripe"))).toBe(false);
  });

  it("goes straight to Stripe once signed in: the pass's first invoice, confirmed as a subscription", async () => {
    signIn();
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/api/payments/pass/stripe")) {
        expect((init?.headers as Record<string, string>)["x-signed-in"]).toBe("1");
        return Response.json({ clientSecret: "pi_sub_secret", amountCents: 999, currency: "usd" });
      }
      if (url.endsWith("/pay/stripe")) return Response.json({ clientSecret: "pi_board_secret", amountCents: 499, currency: "usd" });
      return new Response("{}", { status: 404 });
    });
    sheet({ payments: LIVE, initialPlan: "pass" });
    expect(await screen.findByRole("button", { name: "Subscribe · $9.99/year" })).toHaveAttribute("data-testid", "pay-confirm");
    expect(screen.queryByTestId("pass-signin")).toBeNull();
  });
});

describe("in the iOS app", () => {
  it("shows the App Store's own prices and Apple's subscription terms, never the web price", async () => {
    env.platform = "ios";
    sheet({ payments: LIVE });
    await waitFor(() => expect(screen.getByTestId("plan-pass")).toHaveTextContent("Host Pass · 10,99 €/year"));
    expect(screen.getByTestId("plan-board")).toHaveTextContent("This board · 5,49 €");
    fireEvent.click(screen.getByTestId("plan-pass"));
    expect(await screen.findByRole("button", { name: "Subscribe" })).toHaveAttribute("data-testid", "pay-confirm");
    const disclosure = screen.getByTestId("pass-disclosure");
    expect(disclosure).toHaveTextContent("Host Pass, 1 year, 10,99 € a year. Charged to your Apple ID when you confirm.");
    expect(disclosure).toHaveTextContent("renews automatically each year unless you cancel at least 24 hours before it renews");
    expect(disclosure).toHaveTextContent("Cancel any time in Settings › your name › Subscriptions.");
    expect(document.body.textContent).not.toMatch(/\$9\.99|\$4\.99|Stripe/);
    // No sign-in needed: Apple keeps the subscription.
    expect(screen.queryByTestId("pass-signin")).toBeNull();
  });
});

// ---- Profile ----

function serve(payments: PaymentConfig, pass: HostPass | null) {
  const config: AppConfig = { payments, vapidPublicKey: null, auth: { googleWebClientId: "web-1.apps.googleusercontent.com", googleIosClientId: null, appleServicesId: null, appleNative: true } };
  fetchMock.mockImplementation(async (url: string) => {
    if (url.endsWith("/api/config")) return Response.json(config);
    if (url.endsWith("/api/payments/pass")) return Response.json({ pass, offer: payments.hostPass });
    if (url.endsWith("/api/payments/pass/portal")) return Response.json({ url: "https://billing.stripe.com/p/session/test_1" });
    return new Response("{}", { status: 404 });
  });
}

function profile() {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <HostPassSection />
      </ToastProvider>
    </MemoryRouter>,
  );
}

describe("Profile → Host Pass", () => {
  it("pitches it with a Get button when there's no pass (a free test pass in test mode)", async () => {
    serve(TEST, null);
    profile();
    const section = await screen.findByTestId("host-pass-section");
    expect(section).toHaveAttribute("data-state", "none");
    expect(section).toHaveTextContent("Every board you host, for a year");
    expect(section).toHaveTextContent("Pays for itself on your second board");
    expect(await screen.findByTestId("pass-get")).toHaveTextContent("Get a test pass · no charge");
    expect(screen.queryByTestId("pass-restore")).toBeNull();
  });

  it("says when it renews, or when it ends with auto-renew off, and offers Manage", async () => {
    serve(LIVE, active());
    const { unmount } = profile();
    expect(await screen.findByTestId("host-pass-section")).toHaveAttribute("data-state", "active");
    expect(screen.getByTestId("pass-status")).toHaveTextContent("Active · renews Oct 19, 2027");
    expect(screen.getByTestId("pass-manage")).toHaveTextContent("Manage");
    unmount();
    passStore.resetHostPass();
    serve(LIVE, active({ autoRenew: false, renewsAt: null, endsAt: RENEWS }));
    profile();
    await waitFor(() => expect(screen.getByTestId("pass-status")).toHaveTextContent("Ends Oct 19, 2027"));
  });

  it("opens a Stripe Customer Portal from Manage on the web", async () => {
    serve(LIVE, active());
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign });
    profile();
    fireEvent.click(await screen.findByTestId("pass-manage"));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("https://billing.stripe.com/p/session/test_1"));
  });

  it("offers Restore purchases and Apple's subscription management in the iOS app, with the App Store's price", async () => {
    env.platform = "ios";
    serve(LIVE, null);
    const { unmount } = profile();
    expect(await screen.findByTestId("pass-get")).toHaveTextContent("Get the Host Pass · 10,99 €/year");
    expect(screen.getByTestId("pass-restore")).toHaveTextContent("Restore purchases");
    unmount();
    passStore.resetHostPass();
    serve(LIVE, active({ provider: "iap" }));
    profile();
    fireEvent.click(await screen.findByTestId("pass-manage"));
    await waitFor(() => expect(manageSubscriptions).toHaveBeenCalled());
    expect(screen.getByTestId("pass-restore")).toBeInTheDocument();
  });

  it("asks a signed-out browser to sign in before buying (the web gate), then opens the purchase", async () => {
    serve(LIVE, null);
    profile();
    fireEvent.click(await screen.findByTestId("pass-get"));
    expect(await screen.findByTestId("signin-sheet")).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Sign in to get the Host Pass" })).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/payments/pass/stripe"))).toBe(false);
  });
});
