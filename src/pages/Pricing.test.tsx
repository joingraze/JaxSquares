// The pricing page shows what's free and each thing a host can buy, at the
// server's prices: the host fee and Venue add-on per board, the Annual Pass
// and the Annual Pass + Venue a year, with where refunds and cancelling are.

import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PaymentConfig } from "../../shared/types";

vi.mock("../lib/native", async (orig) => ({ ...(await orig<typeof import("../lib/native")>()), platform: () => "web" }));

const { default: Pricing } = await import("./Pricing");

const PAYMENTS: PaymentConfig = {
  mode: "live",
  priceCents: 499,
  venuePriceCents: 1000,
  currency: "usd",
  stripePublishableKey: "pk_live_x",
  iapProductId: "com.jaxsquares.app.board",
  hostPass: { priceCents: 1999, currency: "usd", iapProductId: "com.jaxsquares.app.hostpass.yearly", web: true },
  clubPass: { priceCents: 9999, currency: "usd", web: true },
};

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      String(url).endsWith("/api/config") ? Response.json({ payments: PAYMENTS, vapidPublicKey: null }) : Response.json({ error: "not found" }, { status: 404 }),
    ),
  );
});

describe("Pricing", () => {
  it("lists what's free and every price, from the server", async () => {
    render(
      <MemoryRouter>
        <Pricing />
      </MemoryRouter>,
    );
    expect(await screen.findByTestId("pricing-board-price")).toHaveTextContent("$4.99 per board");
    expect(await screen.findByTestId("pricing-pass-price")).toHaveTextContent("$19.99 a year");
    expect(await screen.findByTestId("pricing-club-price")).toHaveTextContent("$99.99 a year");
    expect(screen.getByTestId("pricing-venue")).toHaveTextContent(/Venue add-on, \$10(\.00)? per board/);
    expect(screen.getByText(/players never pay and never need an account/)).toBeInTheDocument();
    expect(screen.getByText(/never collects, holds or sends money between players/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "support@jaxsquares.com" })).toHaveAttribute("href", "mailto:support@jaxsquares.com");
    expect(screen.getAllByRole("link", { name: /^Terms/ })[0]).toHaveAttribute("href", "/terms");
  });
});
