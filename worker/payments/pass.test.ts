// @vitest-environment node
import { describe, expect, it } from "vitest";
import { PASS_GRACE_MS, applePassStatus, bestActive, passCovers, passView, stripePassStatus } from "./pass";
import type { PassRow } from "./store";

const NOW = Date.UTC(2026, 9, 19, 12);
const DAY = 24 * 60 * 60_000;

function row(over: Partial<PassRow> = {}): PassRow {
  return {
    id: "hp_1",
    clientId: "client-1",
    provider: "iap",
    externalId: "200000",
    status: "active",
    currentPeriodEnd: NOW + 100 * DAY,
    autoRenew: true,
    livemode: true,
    eventAt: NOW,
    createdAt: NOW - DAY,
    updatedAt: NOW,
    ...over,
  };
}

describe("passCovers", () => {
  it("covers while active and paid up; an auto-renewing pass gets the grace window, one that won't renew doesn't", () => {
    expect(passCovers(row(), NOW)).toBe(true);
    expect(passCovers(row({ currentPeriodEnd: NOW - PASS_GRACE_MS / 2 }), NOW)).toBe(true);
    expect(passCovers(row({ currentPeriodEnd: NOW - PASS_GRACE_MS - 1 }), NOW)).toBe(false);
    expect(passCovers(row({ currentPeriodEnd: NOW - 1, autoRenew: false }), NOW)).toBe(false);
    for (const status of ["pending", "past_due", "ended", "revoked"] as const) expect(passCovers(row({ status }), NOW)).toBe(false);
    expect(passCovers(row({ currentPeriodEnd: null }), NOW)).toBe(false);
  });
});

describe("passView", () => {
  it("shows the active pass paid up the longest, renewing or ending", () => {
    const short = row({ id: "a", currentPeriodEnd: NOW + DAY });
    const long = row({ id: "b", provider: "stripe", currentPeriodEnd: NOW + 200 * DAY, autoRenew: false });
    expect(bestActive([short, long], NOW)?.id).toBe("b");
    expect(passView([short, long], NOW)).toEqual({ active: true, status: "active", provider: "stripe", renewsAt: null, endsAt: NOW + 200 * DAY, autoRenew: false });
    expect(passView([short], NOW)).toEqual({ active: true, status: "active", provider: "iap", renewsAt: NOW + DAY, endsAt: null, autoRenew: true });
  });

  it("with none active, shows the latest that started (ended, refunded or in billing retry); never a pending one", () => {
    expect(passView([], NOW)).toBeNull();
    expect(passView([row({ status: "pending" })], NOW)).toBeNull();
    expect(passView([row({ currentPeriodEnd: NOW - 3 * DAY, autoRenew: false })], NOW)).toMatchObject({ active: false, status: "ended", endsAt: NOW - 3 * DAY });
    expect(passView([row({ status: "past_due" })], NOW)).toMatchObject({ active: false, status: "past_due", renewsAt: null });
    expect(passView([row({ status: "revoked" })], NOW)).toMatchObject({ active: false, status: "revoked" });
  });
});

describe("provider statuses", () => {
  it("maps Stripe's subscription statuses", () => {
    expect(["active", "trialing", "past_due", "incomplete", "canceled", "incomplete_expired", "unpaid", "paused"].map(stripePassStatus)).toEqual([
      "active",
      "active",
      "past_due",
      "pending",
      "ended",
      "ended",
      "ended",
      "ended",
    ]);
  });

  it("maps the App Store's subscription statuses (grace period still covers)", () => {
    expect([1, 2, 3, 4, 5, 9, undefined].map(applePassStatus)).toEqual(["active", "ended", "past_due", "active", "revoked", null, null]);
  });
});
