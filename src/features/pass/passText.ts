// How the Host Pass reads in the UI: dates, the yearly price and Profile's status line.

import type { HostPass } from "../../../shared/types";

/** "Oct 19, 2027". */
export function passDate(ms: number): string {
  return new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** "$9.99/year", or "Yearly" when the price can't be said. */
export function perYear(price: string | null): string {
  return price ? `${price}/year` : "Yearly";
}

/** The pass's dates as Profile says them: "Active · renews Oct 19, 2027" or "Ends Oct 19, 2027". */
export function passStatusLine(pass: Pick<HostPass, "active" | "status" | "renewsAt" | "endsAt">): string {
  if (pass.status === "past_due") return "Payment didn't go through · update it in Manage";
  if (pass.status === "revoked") return "Refunded";
  if (!pass.active) return pass.endsAt ? `Ended ${passDate(pass.endsAt)}` : "Ended";
  if (pass.renewsAt) return `Active · renews ${passDate(pass.renewsAt)}`;
  return pass.endsAt ? `Ends ${passDate(pass.endsAt)}` : "Active";
}
