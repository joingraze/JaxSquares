// Pricing (https://jaxsquares.com/pricing): what's free and what a host pays
// (shared/pricing.ts), linked from the welcome screen next to Terms and
// Privacy. Prices come from the server's config, as this device shows them
// (useHostFee, useHostPassPrice): inside the iOS app only the App Store's,
// and never the web-only Venue add-on or Annual Pass + Venue (App Store
// guidelines 3.1.1 / 3.1.3(b)). Refunds and cancelling are Terms' (sections
// 4-6); this page points there.

import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { FREE_PLAYER_LIMIT } from "../../shared/hostFee";
import { CalendarIcon, CheckIcon, GridIcon, TvIcon, XIcon } from "../components/icons";
import { Card, ListGroup, ListRow, TopBar } from "../components/ui";
import { formatPrice } from "../lib/checkout";
import { platform } from "../lib/native";
import { useHostFee } from "../lib/useHostFee";
import { useClubPassPrice, useHostPassPrice } from "../lib/useHostPass";

const SUPPORT_EMAIL = "support@jaxsquares.com";
const link = "font-semibold text-ink-brand underline-offset-2 hover:underline";

function Point({ children, no }: { children: ReactNode; no?: boolean }) {
  return (
    <li className="flex items-start gap-2.5">
      <span
        aria-hidden
        className={
          no
            ? "mt-px grid h-5 w-5 shrink-0 place-items-center rounded-full bg-ink/8 text-ink-muted"
            : "mt-px grid h-5 w-5 shrink-0 place-items-center rounded-full bg-brand-400/15 text-ink-brand"
        }
      >
        {no ? <XIcon size={12} strokeWidth={3} /> : <CheckIcon size={12} strokeWidth={3.2} />}
      </span>
      <span>{children}</span>
    </li>
  );
}

/** One thing a host can buy: its name, price and what it covers. */
function Plan({ icon, name, price, per, testId, children }: { icon: ReactNode; name: string; price: string | null; per: string; testId: string; children: ReactNode }) {
  return (
    <Card padding="lg" data-testid={testId}>
      <div className="flex items-start gap-3.5">
        <span aria-hidden className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-400/12 text-ink-brand ring-1 ring-inset ring-brand-line/25">
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-title-3 font-extrabold text-ink">{name}</h2>
          <p className="mt-0.5 font-display text-headline font-extrabold tabular-nums text-ink-brand" data-testid={`${testId}-price`}>
            {price ?? "…"} <span className="font-sans text-footnote font-bold text-ink-muted">{per}</span>
          </p>
        </div>
      </div>
      <div className="mt-3 flex flex-col gap-2 text-callout text-ink-muted">{children}</div>
    </Card>
  );
}

export default function Pricing() {
  const { price, payments } = useHostFee();
  const { price: passPrice } = useHostPassPrice();
  const clubPrice = useClubPassPrice();
  const inApp = platform() === "ios";
  const venuePrice = !inApp && payments?.venuePriceCents ? formatPrice(payments.venuePriceCents, payments.currency) : null;

  return (
    <>
      <TopBar title="Pricing" subtitle="Free to play. Hosts pay only to draw bigger boards." back />
      <div className="flex flex-col gap-5 px-safe pt-1">
        <Card tone="brand" padding="lg">
          <p className="eyebrow text-ink-brand">Free</p>
          <ul className="mt-3 flex flex-col gap-2.5 text-callout text-ink">
            <Point>Making a board, inviting friends and picking squares.</Point>
            <Point>Playing: players never pay and never need an account.</Point>
            <Point>Drawing the numbers on a board {FREE_PLAYER_LIMIT} or fewer players hold squares on.</Point>
            <Point no>JaxSquares never collects, holds or sends money between players. A square price or prize a host shows is information only.</Point>
          </ul>
        </Card>

        <Plan icon={<GridIcon size={22} />} name="Per game" price={price} per="per board" testId="pricing-board">
          <p>
            The host fee, charged once when the host draws the numbers of a board more than {FREE_PLAYER_LIMIT} players hold squares on. Nothing is
            charged before that.
          </p>
          {!inApp && (
            <p data-testid="pricing-venue">
              A bar or restaurant's board (venue mode) adds the Venue add-on,{" "}
              <span className="font-bold text-ink">{venuePrice ?? "…"} per board</span>, charged with the host fee.
            </p>
          )}
        </Plan>

        <Plan icon={<CalendarIcon size={22} />} name="Annual Pass" price={passPrice} per="a year" testId="pricing-pass">
          <p>No host fee on any board you host for a year from the day you buy it, season boards included.</p>
          <p>
            Renews every year until you cancel.{" "}
            {inApp ? "Cancel in Settings › your name › Subscriptions." : "Cancel any time in Profile › Annual Pass › Manage."} It stays active to the
            end of the year you've paid for.
          </p>
        </Plan>

        {!inApp && (
          <Plan icon={<TvIcon size={22} />} name="Annual Pass + Venue" price={clubPrice} per="a year" testId="pricing-club">
            <p>
              For bars and restaurants: every board you host for a year, venue boards included, with your venue's name and logo, up to 10 co-hosts,
              players lists and a TV link that shows your boards.
            </p>
            <p>Renews every year until you cancel in Profile › Annual Pass › Manage.</p>
          </Plan>
        )}

        <p className="px-1 text-footnote text-ink-subtle">
          Prices are in US dollars{inApp ? " or your App Store currency" : ""}. Except where the law requires one, host fees and passes aren't
          refunded: see the{" "}
          <Link to="/terms" className={link}>
            Terms
          </Link>{" "}
          for refunds and cancelling. Questions? Email{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`} className={link}>
            {SUPPORT_EMAIL}
          </a>
          .
        </p>

        <ListGroup title="The fine print">
          <ListRow title="Terms" subtitle="Payments, refunds and cancelling" to="/terms" />
          <ListRow title="Privacy Policy" subtitle="What we keep and why" to="/privacy" />
          <ListRow title="Support" subtitle="Questions, bugs and ideas" to="/support" />
        </ListGroup>
      </div>
    </>
  );
}
