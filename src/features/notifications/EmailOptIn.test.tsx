import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EMAIL_ERRORS, EMAIL_OPT_IN } from "../../../shared/email";
import type { EmailNotices } from "../../../shared/types";
import type { PushState } from "../../lib/push";

vi.mock("../../lib/native", async (orig) => {
  const real = await orig<typeof import("../../lib/native")>();
  return { ...real, haptic: vi.fn(async () => {}) };
});
vi.mock("../../components/ui/confetti", () => ({ celebrate: vi.fn(), CELEBRATION_COLORS: [], prefersReducedMotion: () => true }));
const getPushState = vi.fn<() => Promise<PushState>>();
vi.mock("../../lib/push", async (orig) => {
  const real = await orig<typeof import("../../lib/push")>();
  return { ...real, getPushState: () => getPushState(), enablePush: vi.fn() };
});

const { EmailOptIn } = await import("./EmailOptIn");
const { NotifyPrompt } = await import("./NotifyPrompt");
const { BoardNotifySheet } = await import("./BoardNotifySheet");
const { resetEmailConfig } = await import("../../lib/emailNotices");

/** A fake server for one board's email routes (and /api/config). */
function server(initial: EmailNotices, opts: { emailEnabled?: boolean } = {}) {
  let current = initial;
  const requests: { method: string; path: string; body: unknown }[] = [];
  let next: { status: number; body: unknown } | null = null;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input).replace(/^.*\/api/, "");
      const method = init?.method ?? "GET";
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      requests.push({ method, path, body });
      const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
      if (path === "/config") return json({ payments: {}, vapidPublicKey: null, emailEnabled: opts.emailEnabled ?? true });
      if (next) {
        const r = next;
        next = null;
        return json(r.body, r.status);
      }
      if (method === "POST") current = { status: "pending", email: body.email ? `${String(body.email)[0]}•••@${String(body.email).split("@")[1]}` : current.email };
      if (method === "DELETE") current = { status: "none", email: null };
      return json(current);
    }),
  );
  return {
    requests,
    /** The next request answers this instead. */
    fail: (status: number, error: string) => void (next = { status, body: { error } }),
  };
}

beforeEach(() => {
  localStorage.clear();
  resetEmailConfig();
  getPushState.mockReset();
});

afterEach(() => vi.unstubAllGlobals());

const optIn = () => render(<EmailOptIn gameId="g1" boardName="Sunday Squares" />);
const card = () => screen.getByTestId("email-optin");

describe("EmailOptIn", () => {
  it("offers the opt-in with an email keyboard that never zooms, checks the address, then waits for the link", async () => {
    const api = server({ status: "none", email: null });
    optIn();
    expect(await screen.findByText(EMAIL_OPT_IN)).toBeInTheDocument();
    expect(card()).toHaveAttribute("data-state", "none");
    const input = screen.getByTestId("email-optin-input");
    expect(input).toHaveAttribute("type", "email");
    expect(input).toHaveAttribute("autocomplete", "email");
    expect(input).toHaveAttribute("inputmode", "email");
    expect(input.className).toMatch(/\btext-body\b/);

    fireEvent.change(input, { target: { value: "ana@gmail" } });
    fireEvent.click(screen.getByTestId("email-optin-submit"));
    expect(await screen.findByText(EMAIL_ERRORS.invalid)).toBeInTheDocument();
    expect(api.requests.filter((r) => r.method === "POST")).toEqual([]);

    fireEvent.change(input, { target: { value: " ana@gmail.com " } });
    fireEvent.click(screen.getByTestId("email-optin-submit"));
    expect(await screen.findByText("Check your inbox")).toBeInTheDocument();
    expect(api.requests.find((r) => r.method === "POST")).toEqual({ method: "POST", path: "/games/g1/email", body: { email: "ana@gmail.com" } });
    expect(card()).toHaveAttribute("data-state", "pending");
    expect(screen.getByText("a•••@gmail.com")).toBeInTheDocument();
  });

  it("resends the link, and shows the server's reason when it can't", async () => {
    const api = server({ status: "pending", email: "a•••@gmail.com" });
    optIn();
    fireEvent.click(await screen.findByTestId("email-optin-resend"));
    expect(await screen.findByText(/Sent again/)).toBeInTheDocument();
    expect(api.requests.at(-1)).toEqual({ method: "POST", path: "/games/g1/email", body: { resend: true } });
    api.fail(429, "We just sent that link. Check your inbox (and spam folder), or try again in a minute.");
    fireEvent.click(screen.getByTestId("email-optin-resend"));
    expect(await screen.findByTestId("email-optin-error")).toHaveTextContent("We just sent that link.");
  });

  it("shows a confirmed address, masked, and turns it off", async () => {
    const api = server({ status: "confirmed", email: "a•••@gmail.com" });
    optIn();
    expect(await screen.findByText("Email is on")).toBeInTheDocument();
    expect(card()).toHaveAttribute("data-state", "confirmed");
    expect(screen.getByText("a•••@gmail.com")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("email-optin-off"));
    await waitFor(() => expect(card()).toHaveAttribute("data-state", "none"));
    expect(api.requests.at(-1)).toMatchObject({ method: "DELETE", path: "/games/g1/email" });
  });

  it("says when the address unsubscribed from an email, and lets them add it again", async () => {
    server({ status: "unsubscribed", email: null });
    optIn();
    expect(await screen.findByText(/You unsubscribed from this board's email/)).toBeInTheDocument();
    expect(card()).toHaveAttribute("data-state", "unsubscribed");
    expect(screen.getByTestId("email-optin-input")).toBeInTheDocument();
  });

  it("can switch a pending address for another one", async () => {
    server({ status: "pending", email: "a•••@gmail.com" });
    optIn();
    fireEvent.click(await screen.findByTestId("email-optin-change"));
    expect(card()).toHaveAttribute("data-state", "change");
    fireEvent.change(screen.getByTestId("email-optin-input"), { target: { value: "ana@icloud.com" } });
    fireEvent.click(screen.getByTestId("email-optin-submit"));
    expect(await screen.findByText("a•••@icloud.com")).toBeInTheDocument();
  });
});

describe("the board's notification settings", () => {
  it("holds the email opt-in (and no mute switch where push is off)", async () => {
    getPushState.mockResolvedValue("needs-install");
    server({ status: "confirmed", email: "a•••@gmail.com" });
    render(<BoardNotifySheet gameId="g1" boardName="Sunday Squares" open onClose={vi.fn()} />);
    expect(await screen.findByText("Email is on")).toBeInTheDocument();
    expect(screen.getByTestId("board-notify-done")).toHaveTextContent("Done");
    expect(screen.queryByRole("switch")).toBeNull();
  });
});

describe("the notifications ask after a claim", () => {
  const ask = (props: Partial<Parameters<typeof NotifyPrompt>[0]> = {}) =>
    render(<NotifyPrompt gameId="g1" trigger="claimed" open onClose={vi.fn()} explicit={false} settleMs={0} {...props} />);

  it("offers email where this browser has no push at all", async () => {
    getPushState.mockResolvedValue("unsupported");
    server({ status: "none", email: null });
    ask();
    expect(await screen.findByText("Want to hear when your square hits?")).toBeInTheDocument();
    expect(await screen.findByText(EMAIL_OPT_IN)).toBeInTheDocument();
  });

  it("offers email beside the Home Screen guide on an iPhone Safari tab", async () => {
    getPushState.mockResolvedValue("needs-install");
    server({ status: "none", email: null });
    ask();
    expect(await screen.findByText("Add JaxSquares to your Home Screen")).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(await screen.findByTestId("notify-email-instead"));
    });
    expect(await screen.findByText("Get email instead")).toBeInTheDocument();
    expect(await screen.findByTestId("email-optin-input")).toBeInTheDocument();
  });

  it("stays as it was when the server has no email", async () => {
    getPushState.mockResolvedValue("needs-install");
    server({ status: "none", email: null }, { emailEnabled: false });
    ask();
    expect(await screen.findByText("Add JaxSquares to your Home Screen")).toBeInTheDocument();
    expect(screen.queryByTestId("notify-email-instead")).toBeNull();
  });

  it("doesn't offer email on other asks (a host's new board)", async () => {
    getPushState.mockResolvedValue("unsupported");
    server({ status: "none", email: null });
    const onClose = vi.fn();
    ask({ trigger: "created", onClose });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(screen.queryByTestId("email-optin")).toBeNull();
  });
});
