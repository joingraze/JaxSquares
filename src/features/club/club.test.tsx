// The Club Pass on the client: Profile's club settings (name, logo, TV link,
// boards, Manage) for a holder, the one-line pitch for everyone else on the
// web, the iOS rules (nothing offered, priced or linked to buying or
// managing it; a holder's features still work), the club's branding on the
// board header, TV mode and the printout, and the players CSV action.

import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CLUB_NAME_MONEY_ERROR } from "../../../shared/clubs";
import type { AppConfig, ClubBrand, ClubSettings, ClubTvLink, GameState, HostPass, HostPassOffer, PaymentConfig } from "../../../shared/types";

const env = vi.hoisted(() => ({ platform: "web" as "web" | "ios" }));
vi.mock("../../lib/native", async (orig) => {
  const real = await orig<typeof import("../../lib/native")>();
  return { ...real, haptic: vi.fn(async () => {}), platform: () => env.platform, isNative: () => env.platform === "ios", copyText: vi.fn(async () => "copied") };
});
vi.mock("../../components/ui/confetti", () => ({ celebrate: vi.fn(), CELEBRATION_COLORS: [], prefersReducedMotion: () => true }));
// StoreKit (the Host Pass's App Store price in the iOS app): the Club Pass never asks it anything.
vi.mock("@capgo/native-purchases", () => ({
  NativePurchases: {
    configure: vi.fn(async () => {}),
    getProduct: vi.fn(async ({ productIdentifier }: { productIdentifier: string }) => ({ product: { identifier: productIdentifier, priceString: "21,99 €", price: 21.99, currencyCode: "EUR" } })),
  },
}));
const prepareLogo = vi.fn(async (file: Blob) => new Blob([new Uint8Array([1, 2, 3]), String(file.size)], { type: "image/webp" }));
vi.mock("../../lib/clubLogo", async (orig) => ({ ...(await orig<typeof import("../../lib/clubLogo")>()), prepareLogo: (f: Blob) => prepareLogo(f) }));

const passStore = await import("../../lib/hostPassStore");
const identity = await import("../../lib/identity");
const { ToastProvider } = await import("../../components/ui");
const { ClubSection } = await import("./ClubSection");
const { ClubBanner } = await import("./ClubMark");
const { ExportPlayersRow } = await import("./ExportPlayersRow");
const { sendPlayersCsv } = await import("./exportPlayers");
const { clubBoardLine, clubStatusLine, nextBoard, rotationOrder } = await import("./clubModel");
const { fitWithin } = await import("../../lib/clubLogo");
const { HostPassSection } = await import("../pass/HostPassSection");
const { TvOpenPanel } = await import("../tv/TvPanel");
const { PrintSheet } = await import("../print/PrintSheet");

const HOST_OFFER: HostPassOffer = { priceCents: 1999, currency: "usd", iapProductId: "com.jaxsquares.app.hostpass.yearly", web: true };
const TEST: PaymentConfig = {
  mode: "test",
  priceCents: 499,
  currency: "usd",
  stripePublishableKey: null,
  iapProductId: "com.jaxsquares.app.board",
  hostPass: HOST_OFFER,
  clubPass: { priceCents: 4900, currency: "usd", web: true },
};
const LIVE: PaymentConfig = { ...TEST, mode: "live", stripePublishableKey: "pk_test_123" };
const RENEWS = Date.UTC(2027, 9, 19, 18);
const active = (over: Partial<HostPass> = {}): HostPass => ({ active: true, status: "active", provider: "stripe", renewsAt: RENEWS, endsAt: null, autoRenew: true, ...over });

const CLUB: ClubBrand = { id: "0123456789abcdef", name: "The Rusty Anchor", hasLogo: true, logoVersion: "abcd1234abcd1234" };
const settings = (over: Partial<ClubSettings> = {}): ClubSettings => ({
  club: CLUB,
  tvKey: null,
  boards: [
    { id: "brd111", name: "Sunday Squares", status: "open", squaresLeft: 42, totalSquares: 100, startsAt: null },
    { id: "brd222", name: "Monday Night", status: "locked", squaresLeft: 0, totalSquares: 100, startsAt: null },
  ],
  ...over,
});

const fetchMock = vi.fn();
let mine: ClubSettings = settings();

function serve(payments: PaymentConfig) {
  const config: AppConfig = { payments, vapidPublicKey: null, auth: { googleWebClientId: "web-1.apps.googleusercontent.com", googleIosClientId: null, appleServicesId: null, appleNative: true } };
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    if (url.endsWith("/api/config")) return Response.json(config);
    if (url.endsWith("/api/payments/pass")) return Response.json({ pass: null, offer: payments.hostPass, club: null, clubOffer: payments.clubPass });
    if (url.endsWith("/api/clubs/mine") && method === "GET") return Response.json(mine);
    if (url.endsWith("/api/clubs/mine") && method === "PATCH") {
      mine = { ...mine, club: { ...mine.club, name: JSON.parse(String(init?.body)).name } };
      return Response.json(mine);
    }
    if (url.endsWith("/api/clubs/mine/logo") && method === "PUT") return Response.json(mine);
    if (url.endsWith("/api/clubs/mine/tv") && method === "POST") {
      mine = { ...mine, tvKey: "feedc0de" };
      const link: ClubTvLink = { ...mine, tvUrl: `https://jaxsquares.com/club/${CLUB.id}/tv#k=${"T".repeat(43)}` };
      return Response.json(link, { status: 201 });
    }
    if (url.endsWith("/api/payments/pass/portal")) return Response.json({ url: "https://billing.stripe.com/p/session/club" });
    return new Response("{}", { status: 404 });
  });
}

function profile() {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <HostPassSection />
        <ClubSection />
      </ToastProvider>
    </MemoryRouter>,
  );
}

let clock = Date.UTC(2026, 9, 19, 12);

beforeEach(() => {
  localStorage.clear();
  env.platform = "web";
  passStore.resetHostPass();
  mine = settings();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  // The app config is reused for a minute; each test starts past that.
  clock += 10 * 60_000;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(clock);
  prepareLogo.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const holder = (pass = active()) => passStore.setHostPassState({ pass: null, offer: HOST_OFFER, club: pass, clubOffer: TEST.clubPass });
const calls = (method: string, suffix: string) => fetchMock.mock.calls.filter(([u, i]) => String(u).endsWith(suffix) && ((i as RequestInit | undefined)?.method ?? "GET") === method);

// ---- Profile ----

describe("Profile → Club Pass, for a holder", () => {
  it("shows the pass, the club's name, logo, TV link and boards, and Manage on the web", async () => {
    serve(LIVE);
    holder();
    profile();
    expect(await screen.findByTestId("club-status")).toHaveTextContent("Active · renews Oct 19, 2027");
    expect(screen.getByTestId("club-manage")).toHaveTextContent("Manage");
    expect(await screen.findByTestId("club-name")).toHaveValue("The Rusty Anchor");
    expect(screen.getAllByTestId("club-logo")[0]).toHaveAttribute("src", `/api/clubs/${CLUB.id}/logo?v=${CLUB.logoVersion}`);
    expect(screen.getByTestId("club-logo-upload")).toHaveTextContent("Replace");
    expect(screen.getAllByTestId("club-board").map((r) => r.textContent)).toEqual(["Sunday Squares42 squares left", "Monday NightNumbers drawn"]);
    expect(screen.getByTestId("club-tv")).toHaveAttribute("data-state", "none");
    // The Host Pass needs no selling to a Club Pass holder.
    expect(screen.getByTestId("host-pass-section")).toHaveAttribute("data-state", "club");
    expect(screen.getByTestId("host-pass-section")).toHaveTextContent("Included with your Club Pass");
    expect(screen.queryByTestId("pass-get")).toBeNull();
    expect(screen.queryByTestId("club-get")).toBeNull();
  });

  it("renames the club, refusing a name that talks money", async () => {
    serve(LIVE);
    holder();
    profile();
    const input = await screen.findByTestId("club-name");
    fireEvent.change(input, { target: { value: "Cash Bar $5" } });
    expect(await screen.findByText(CLUB_NAME_MONEY_ERROR)).toBeInTheDocument();
    expect(screen.getByTestId("club-name-save")).toBeDisabled();
    fireEvent.change(input, { target: { value: "  The Salty   Dog " } });
    fireEvent.click(screen.getByTestId("club-name-save"));
    await waitFor(() => expect(calls("PATCH", "/api/clubs/mine")).toHaveLength(1));
    expect(JSON.parse(String((calls("PATCH", "/api/clubs/mine")[0][1] as RequestInit).body))).toEqual({ name: "The Salty Dog" });
    expect(await screen.findByText("Club name saved")).toBeInTheDocument();
  });

  it("uploads a logo the browser resized, as its own type", async () => {
    serve(LIVE);
    holder();
    profile();
    const file = new File([new Uint8Array(10)], "logo.jpg", { type: "image/jpeg" });
    fireEvent.change(await screen.findByTestId("club-logo-file"), { target: { files: [file] } });
    await waitFor(() => expect(calls("PUT", "/api/clubs/mine/logo")).toHaveLength(1));
    expect(prepareLogo).toHaveBeenCalledWith(file);
    const init = calls("PUT", "/api/clubs/mine/logo")[0][1] as RequestInit;
    expect((init.headers as Record<string, string>)["content-type"]).toBe("image/webp");
    expect((init.headers as Record<string, string>)["x-client-id"]).toBe(identity.getClientId());
  });

  it("makes a TV link, keeps it on this device to copy, and asks before cutting the old one off", async () => {
    serve(LIVE);
    holder();
    const first = profile();
    fireEvent.click(await screen.findByTestId("club-tv-make"));
    expect(await screen.findByTestId("club-tv-url")).toHaveTextContent(`jaxsquares.com/club/${CLUB.id}/tv#…`);
    expect(screen.getByTestId("club-tv")).toHaveAttribute("data-state", "known");
    expect(screen.getByTestId("club-tv-copy")).toBeInTheDocument();
    expect(screen.getByTestId("club-tv-open")).toHaveAttribute("href", expect.stringContaining("#k="));
    // A new one cuts off the old: it asks first.
    fireEvent.click(screen.getByTestId("club-tv-rotate"));
    expect(screen.getByTestId("club-tv-confirm")).toHaveTextContent("The old link stops working right away");
    first.unmount();

    // Back later: this device still shows it while the server's fingerprint matches.
    profile();
    expect(await screen.findByTestId("club-tv-url")).toBeInTheDocument();
  });

  it("says a TV link made on another device can't be shown here (only its hash is on the server)", async () => {
    mine = settings({ tvKey: "0badf00d" });
    serve(LIVE);
    holder();
    profile();
    expect(await screen.findByTestId("club-tv")).toHaveAttribute("data-state", "elsewhere");
    expect(screen.getByTestId("club-tv")).toHaveTextContent("Made on another device");
    expect(screen.queryByTestId("club-tv-copy")).toBeNull();
    expect(screen.getByTestId("club-tv-rotate")).toBeInTheDocument();
  });

  it("opens the Stripe Customer Portal from Manage, or ends a test Club Pass", async () => {
    serve(LIVE);
    holder();
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign });
    profile();
    fireEvent.click(await screen.findByTestId("club-manage"));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("https://billing.stripe.com/p/session/club"));
  });
});

describe("Profile → Club Pass, for everyone else on the web", () => {
  it("is one line: who it's for and the price", async () => {
    serve(LIVE);
    passStore.setHostPassState({ pass: null, offer: HOST_OFFER, club: null, clubOffer: LIVE.clubPass });
    profile();
    const pitch = await screen.findByTestId("club-get");
    expect(pitch).toHaveTextContent("Running squares for a bar, club or office?");
    expect(pitch).toHaveTextContent("Club Pass · $49/year");
    expect(screen.queryByTestId("club-section")).toBeNull();
  });

  it("asks a signed-out browser to sign in first; in test mode it's a no-charge test pass", async () => {
    serve(LIVE);
    passStore.setHostPassState({ pass: null, offer: HOST_OFFER, club: null, clubOffer: LIVE.clubPass });
    const live = profile();
    fireEvent.click(await screen.findByTestId("club-get"));
    expect(await screen.findByRole("dialog", { name: "Sign in to get the Club Pass" })).toBeInTheDocument();
    live.unmount();

    serve(TEST);
    clock += 10 * 60_000;
    vi.setSystemTime(clock);
    profile();
    fireEvent.click(await screen.findByTestId("club-get"));
    const sheet = await screen.findByRole("dialog", { name: "Club Pass" });
    expect(within(sheet).getByTestId("club-perks")).toHaveTextContent("Up to 10 co-hosts on each board");
    expect(within(sheet).getByTestId("pay-confirm")).toHaveTextContent("Start test Club Pass");
    expect(within(sheet).getByTestId("club-disclosure")).toHaveTextContent("Test pass: no charge");
  });
});

describe("the iOS app", () => {
  it("never offers, prices or links to buying the Club Pass", async () => {
    env.platform = "ios";
    serve(LIVE);
    passStore.setHostPassState({ pass: null, offer: HOST_OFFER, club: null, clubOffer: LIVE.clubPass });
    profile();
    await screen.findByTestId("host-pass-section");
    await act(async () => {});
    expect(screen.queryByTestId("club-get")).toBeNull();
    expect(screen.queryByTestId("club-pitch")).toBeNull();
    expect(document.body).not.toHaveTextContent(/Club Pass|\$49/);
  });

  it("lets a holder's club work, says 'Club Pass · Active', and has no purchase or manage links", async () => {
    env.platform = "ios";
    serve(LIVE);
    holder();
    profile();
    const status = await screen.findByTestId("club-status");
    expect(status).toHaveTextContent("Club Pass");
    expect(within(status).getByText("Active")).toBeInTheDocument();
    expect(await screen.findByTestId("club-name")).toHaveValue("The Rusty Anchor");
    expect(screen.queryByTestId("club-manage")).toBeNull();
    expect(screen.queryByTestId("club-tv-open")).toBeNull();
    expect(screen.getByTestId("club-section")).not.toHaveTextContent(/\$|renews|Manage|stripe|web/i);
  });
});

// ---- Branding ----

const state = (club: ClubBrand | null, over: Partial<GameState["game"]> = {}): GameState =>
  ({
    game: {
      id: "brd111",
      name: "Sunday Squares",
      sport: "football",
      league: "custom",
      teamX: { name: "Chiefs", abbr: "KC", color: "#e31837" },
      teamY: { name: "Bills", abbr: "BUF", color: "#00338d" },
      format: { periods: "quarters", reverse: false, boardSize: 100, freshNumbers: false },
      periods: [{ key: "final", label: "Final" }],
      prizes: {},
      maxPerPlayer: 0,
      numbers: null,
      status: "open",
      linkedEvent: null,
      startsAt: null,
      hostPlayerId: "host_public_id_0000000",
      createdAt: 0,
      lockedAt: null,
      paid: false,
      club,
      ...over,
    },
    players: [],
    squares: [],
    scores: [],
    manualWinners: [],
    live: null,
    activity: [],
    version: 1,
  }) as GameState;

describe("the club's branding", () => {
  it("heads a holder's board: 'Hosted by' with the logo; nothing for an unnamed club or any other board", () => {
    const { rerender } = render(<ClubBanner game={{ club: CLUB }} />);
    expect(screen.getByTestId("club-banner")).toHaveTextContent("Hosted by The Rusty Anchor");
    expect(screen.getByTestId("club-logo")).toHaveAttribute("src", `/api/clubs/${CLUB.id}/logo?v=${CLUB.logoVersion}`);
    rerender(<ClubBanner game={{ club: { ...CLUB, hasLogo: false, logoVersion: null } }} />);
    expect(screen.getByTestId("club-initial")).toHaveTextContent("T");
    rerender(<ClubBanner game={{ club: { ...CLUB, name: "  " } }} />);
    expect(screen.queryByTestId("club-banner")).toBeNull();
    rerender(<ClubBanner game={{ club: null }} />);
    expect(screen.queryByTestId("club-banner")).toBeNull();
  });

  it("puts the club's logo and name in the TV panel (the JaxSquares mark otherwise)", () => {
    const { rerender } = render(<TvOpenPanel state={state(CLUB)} url="https://jaxsquares.com/g/brd111" qr={200} row now={0} />);
    expect(screen.getByTestId("tv-club")).toHaveTextContent("The Rusty Anchor");
    expect(within(screen.getByTestId("tv-club")).getByTestId("club-logo")).toBeInTheDocument();
    rerender(<TvOpenPanel state={state(null)} url="https://jaxsquares.com/g/brd111" qr={200} row now={0} />);
    expect(screen.queryByTestId("tv-club")).toBeNull();
    expect(screen.getByTestId("tv-brand")).toHaveTextContent("JaxSquares");
    // The club TV shows the club in its own corner instead.
    rerender(<TvOpenPanel state={state(CLUB)} url="https://jaxsquares.com/g/brd111" qr={200} row now={0} hideClub footer={<p data-testid="corner">corner</p>} />);
    expect(screen.queryByTestId("tv-club")).toBeNull();
    expect(screen.getByTestId("corner")).toBeInTheDocument();
  });

  it("prints the logo and 'Hosted by' on the printable board, never an amount", () => {
    render(<PrintSheet state={state(CLUB)} url="https://jaxsquares.com/g/brd111" amounts={false} />);
    expect(screen.getByTestId("print-club")).toHaveTextContent("Hosted by The Rusty Anchor");
    expect(within(screen.getByTestId("print-sheet")).getByTestId("club-logo")).toBeInTheDocument();
    expect(screen.getByTestId("print-sheet")).not.toHaveTextContent("$");
  });
});

// ---- The players CSV ----

describe("the players list (CSV)", () => {
  it("is in host tools on a Club Pass board only, and downloads on the web", async () => {
    const created: Blob[] = [];
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: (b: Blob) => (created.push(b), "blob:csv"), revokeObjectURL: () => {} }));
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    identity.saveAdminToken("brd111", "admin-token-1");
    fetchMock.mockImplementation(async () => new Response("\uFEFFPlayer,Squares\r\n", { headers: { "content-type": "text/csv", "content-disposition": 'attachment; filename="sunday-squares-players.csv"' } }));
    const { rerender } = render(
      <ToastProvider>
        <ExportPlayersRow game={{ id: "brd111", name: "Sunday Squares", club: null }} />
      </ToastProvider>,
    );
    expect(screen.queryByTestId("host-export")).toBeNull();
    rerender(
      <ToastProvider>
        <ExportPlayersRow game={{ id: "brd111", name: "Sunday Squares", club: CLUB }} />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByTestId("host-export"));
    expect(await screen.findByText("Players list downloaded")).toBeInTheDocument();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/api\/games\/brd111\/export\.csv\?tz=/);
    expect((init.headers as Record<string, string>)["x-admin-token"]).toBe("admin-token-1");
    expect(created).toHaveLength(1);
    expect(click).toHaveBeenCalledTimes(1);
    click.mockRestore();
  });

  it("goes through the share sheet in the iOS app: the file where the web view can share one, else its text", async () => {
    const csv = { blob: new Blob(["\uFEFFPlayer,Squares\r\nAna,2\r\n"], { type: "text/csv" }), fileName: "sunday-squares-players.csv" };
    const share = vi.fn(async () => {});
    const shareText = vi.fn(async () => {});
    const download = vi.fn();
    expect(await sendPlayersCsv(csv, "Sunday Squares", { native: true, share, canShare: () => true, shareText, download })).toBe("shared");
    const data = (share.mock.calls[0] as unknown as [ShareData])[0];
    expect(data.files?.[0].name).toBe("sunday-squares-players.csv");
    expect(await sendPlayersCsv(csv, "Sunday Squares", { native: true, share, canShare: () => false, shareText, download })).toBe("shared");
    expect(shareText).toHaveBeenCalledWith({ title: "Sunday Squares players", text: "Player,Squares\r\nAna,2\r\n" });
    // The tap's gesture expired while the list loaded: the native sheet instead.
    share.mockRejectedValueOnce(new DOMException("no gesture", "NotAllowedError"));
    expect(await sendPlayersCsv(csv, "Sunday Squares", { native: true, share, canShare: () => true, shareText, download })).toBe("shared");
    expect(shareText).toHaveBeenCalledTimes(2);
    shareText.mockRejectedValueOnce(new Error("Share canceled"));
    expect(await sendPlayersCsv(csv, "Sunday Squares", { native: true, canShare: () => false, shareText, download })).toBe("cancelled");
    expect(download).not.toHaveBeenCalled();
    expect(await sendPlayersCsv(csv, "Sunday Squares", { native: false, share, canShare: () => true, shareText, download })).toBe("saved");
    expect(download).toHaveBeenCalledWith(csv.blob, csv.fileName);
  });
});

// ---- Model ----

describe("club model", () => {
  const board = (id: string, over: Partial<GameState> = {}, game: Partial<GameState["game"]> = {}) => ({ ...state(CLUB, { id, ...game }), ...over });
  const winner = (id: string, at: number) => ({ id, type: "winner" as const, at, actor: null, data: {} });

  it("puts live games first on the club TV", () => {
    const live = board("live1", { live: { state: "in", period: 2, clock: "4:00", detail: "Q2", scoreX: 7, scoreY: 3, updatedAt: 0 } }, { status: "locked" });
    expect(rotationOrder([board("open1"), live, board("open2")]).map((b) => b.game.id)).toEqual(["live1", "open1", "open2"]);
  });

  it("goes round, and sends a new winner to the front", () => {
    const order = [board("a"), board("b"), board("c", { activity: [winner("w1", 5)] })];
    const seen = new Map([
      ["a", ""],
      ["b", ""],
      ["c", "w1"],
    ]);
    expect(nextBoard(order, "a", seen)).toEqual({ id: "b", winner: null });
    expect(nextBoard(order, "c", seen)).toEqual({ id: "a", winner: null });
    const fresh = [order[0], board("b", { activity: [winner("w2", 9)] }), order[2]];
    expect(nextBoard(fresh, "c", seen)).toEqual({ id: "b", winner: expect.objectContaining({ id: "w2" }) });
    expect(nextBoard([], null, seen)).toBeNull();
  });

  it("says the pass and the boards plainly", () => {
    expect(clubStatusLine(active())).toBe("Active · renews Oct 19, 2027");
    expect(clubStatusLine(active({ autoRenew: false, renewsAt: null, endsAt: RENEWS }))).toBe("Active · ends Oct 19, 2027");
    expect(clubStatusLine(active({ active: false, status: "ended", renewsAt: null, endsAt: RENEWS }))).toBe("Ended Oct 19, 2027");
    expect(clubBoardLine({ status: "open", squaresLeft: 1 })).toBe("1 square left");
    expect(clubBoardLine({ status: "open", squaresLeft: 0 })).toBe("Every square taken");
    expect(clubBoardLine({ status: "locked", squaresLeft: 0 })).toBe("Numbers drawn");
  });

  it("fits a logo within 256x256 without enlarging it", () => {
    expect(fitWithin(1024, 512, 256)).toEqual({ width: 256, height: 128 });
    expect(fitWithin(100, 300, 256)).toEqual({ width: 85, height: 256 });
    expect(fitWithin(64, 64, 256)).toEqual({ width: 64, height: 64 });
  });
});
