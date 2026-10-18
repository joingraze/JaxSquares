import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AccountInfo, AuthConfig, MeResponse } from "../../../shared/types";
import { ToastProvider } from "../../components/ui";
import { resetAuthConfig } from "../../lib/auth";
import { getAdminToken, getClientId, getPlayerId, isSignedIn, saveAdminToken, setServerIdentity } from "../../lib/identity";
import { AccountSection } from "./AccountSection";

vi.mock("../../lib/native", async (orig) => {
  const real = await orig<typeof import("../../lib/native")>();
  return { ...real, haptic: vi.fn(async () => {}) };
});

const fetchMock = vi.fn();
const CANONICAL = "CanonicalPlayerId00001";
const APPLE: AccountInfo = { provider: "apple", email: "maya@privaterelay.appleid.com", name: null, since: 1_760_000_000_000 };
const ALL: AuthConfig = { googleWebClientId: "web.apps.googleusercontent.com", googleIosClientId: null, appleServicesId: "com.jaxsquares.web", appleNative: true };

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function serve(auth: AuthConfig, me?: MeResponse) {
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    if (url.endsWith("/api/config")) return json({ payments: {}, vapidPublicKey: null, auth });
    if (url.endsWith("/api/auth/apple") && me) return json(me);
    if (url.endsWith("/api/auth/sign-out") || (url.endsWith("/api/account") && init?.method === "DELETE")) return json({ ok: true });
    if (url.includes("/api/me/games")) return json({ games: [] });
    return json({ error: "Not found" }, 404);
  });
}

function renderSection() {
  return render(
    <ToastProvider>
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AccountSection />
      </MemoryRouter>
    </ToastProvider>,
  );
}

const requestTo = (path: string) => fetchMock.mock.calls.find(([url]) => String(url).endsWith(`/api${path}`));

beforeEach(() => {
  localStorage.clear();
  resetAuthConfig();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete window.AppleID;
});

describe("Profile → Account, signed out", () => {
  it("offers the sign-in buttons set up for this platform", async () => {
    serve(ALL);
    renderSection();
    const section = await screen.findByTestId("account-section");
    expect(section).toHaveAttribute("data-state", "signed-out");
    expect(within(section).getByText("Sign in to keep your boards on every device")).toBeInTheDocument();
    expect(within(section).getByRole("button", { name: "Sign in with Apple" })).toBeInTheDocument();
    // Google's own button renders on the web (its script fills this slot).
    expect(within(section).getByTestId("signin-google")).toBeInTheDocument();
  });

  it("shows nothing when no provider is set up", async () => {
    serve({ googleWebClientId: null, googleIosClientId: null, appleServicesId: null, appleNative: true });
    renderSection();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await act(async () => {});
    expect(screen.queryByTestId("account-section")).toBeNull();
  });

  it("signs in with Apple from the tap: the popup opens before anything awaits, then the boards arrive", async () => {
    const me: MeResponse = { playerId: CANONICAL, account: APPLE, hostTokens: { abc234: "host-token-1" }, profile: null };
    serve(ALL, me);
    let finish!: (v: Awaited<ReturnType<NonNullable<Window["AppleID"]>["auth"]["signIn"]>>) => void;
    const init = vi.fn();
    const signIn = vi.fn(() => new Promise<never>((resolve) => (finish = resolve as never)));
    window.AppleID = { auth: { init, signIn } };
    renderSection();
    fireEvent.click(await screen.findByRole("button", { name: "Sign in with Apple" }));
    // Safari only opens the popup straight from the tap.
    expect(signIn).toHaveBeenCalledTimes(1);
    const options = init.mock.calls[0][0] as { clientId: string; nonce: string; usePopup: boolean; redirectURI: string; state: string };
    expect(options).toMatchObject({ clientId: "com.jaxsquares.web", usePopup: true, redirectURI: `${location.origin}/auth/apple` });
    expect(options.nonce).toMatch(/^[0-9a-f]{64}$/);

    await act(async () => finish({ authorization: { id_token: "apple.id.token", code: "c0de", state: options.state }, user: { name: { firstName: "Maya" } } }));
    expect(await screen.findByText("Signed in with Apple")).toBeInTheDocument();
    const body = JSON.parse(String((requestTo("/auth/apple")![1] as RequestInit).body));
    expect(body).toMatchObject({ idToken: "apple.id.token", authorizationCode: "c0de", name: "Maya", redirectUri: `${location.origin}/auth/apple` });
    // The raw nonce goes to the server; Apple only ever saw its hash.
    expect(body.nonce).not.toBe(options.nonce);
    expect(getPlayerId()).toBe(CANONICAL);
    expect(getAdminToken("abc234")).toBe("host-token-1");
  });

  it("stays quiet when the person closes Apple's popup", async () => {
    serve(ALL);
    window.AppleID = { auth: { init: vi.fn(), signIn: vi.fn(async () => Promise.reject({ error: "popup_closed_by_user" })) } };
    renderSection();
    fireEvent.click(await screen.findByRole("button", { name: "Sign in with Apple" }));
    await act(async () => {});
    expect(screen.queryByText("Couldn't sign in")).toBeNull();
    expect(isSignedIn()).toBe(false);
  });
});

describe("Profile → Account, signed in", () => {
  beforeEach(() => {
    saveAdminToken("abc234", "host-token-1");
    setServerIdentity(CANONICAL, APPLE);
  });

  it("says who it's signed in as", async () => {
    serve(ALL);
    renderSection();
    const section = screen.getByTestId("account-section");
    expect(section).toHaveAttribute("data-state", "signed-in");
    expect(within(screen.getByTestId("account-signed-in")).getByText("Signed in with Apple")).toBeInTheDocument();
    expect(screen.getByText(APPLE.email!)).toBeInTheDocument();
  });

  it("signs out after a confirm that says what happens", async () => {
    serve(ALL);
    const before = getClientId();
    renderSection();
    fireEvent.click(screen.getByTestId("account-sign-out"));
    expect(await screen.findByText("Signing out takes your boards off this device. Sign back in to get them back.")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("account-sign-out-confirm"));
    await waitFor(() => expect(isSignedIn()).toBe(false));
    expect(requestTo("/auth/sign-out")).toBeTruthy();
    expect(getClientId()).not.toBe(before);
    expect(getAdminToken("abc234")).toBeNull();
    expect(await screen.findByText("Signed out")).toBeInTheDocument();
  });

  it("deletes the account after a confirm listing what's deleted and what stays", async () => {
    serve(ALL);
    renderSection();
    fireEvent.click(screen.getByTestId("account-delete"));
    const sheet = await screen.findByTestId("account-delete-sheet");
    expect(within(sheet).getByText(/Your sign-in with Apple/)).toHaveTextContent(`Your sign-in with Apple (${APPLE.email})`);
    expect(within(sheet).getByText("JaxSquares' access to your Apple ID")).toBeInTheDocument();
    expect(within(sheet).getByText(/Your boards and squares, so your friends' games carry on/)).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("account-delete-confirm"));
    await waitFor(() => expect(isSignedIn()).toBe(false));
    expect((requestTo("/account")![1] as RequestInit).method).toBe("DELETE");
    expect(await screen.findByText("Account deleted")).toBeInTheDocument();
  });
});
