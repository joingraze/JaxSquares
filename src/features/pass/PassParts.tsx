// Pieces of the Annual Pass UI shared by the checkout sheet and Profile: the
// "This board / Annual Pass" choice, the pass card, and the subscription
// disclosure Apple requires next to the subscribe button (name, length, price
// per period, auto-renewal until canceled, how to cancel, Terms and Privacy).
// Prices come from the caller: the App Store's own string in the iOS app,
// never the web price there (App Store guideline 3.1.1).

import type { ReactNode } from "react";
import { PASS_NAME, VENUE_PASS_NAME } from "../../../shared/pricing";
import type { PassPlan } from "../../../shared/types";
import { Link } from "react-router-dom";
import { CheckIcon, CrownIcon, SparklesIcon } from "../../components/icons";
import { cx } from "../../components/ui";
import type { CheckoutMethod } from "../../lib/checkout";
import { paysForItself, perYear } from "./passText";

export type CheckoutPlan = "board" | "pass";

// ---- This board / Annual Pass ----

function PlanOption({
  plan,
  selected,
  title,
  detail,
  extra,
  onSelect,
}: {
  plan: CheckoutPlan;
  selected: boolean;
  title: string;
  detail: string;
  extra?: ReactNode;
  onSelect: (plan: CheckoutPlan) => void;
}) {
  const pass = plan === "pass";
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      data-testid={`plan-${plan}`}
      onClick={() => onSelect(plan)}
      className={cx(
        "pressable relative flex w-full items-start gap-3 rounded-2xl px-3.5 py-3 text-left ring-inset transition-colors",
        selected ? (pass ? "bg-gold-400/10 ring-2 ring-gold-line" : "bg-brand-400/10 ring-2 ring-brand-line") : "bg-surface-3 ring-1 ring-line",
      )}
    >
      <span
        aria-hidden
        className={cx(
          "mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full ring-2 ring-inset",
          selected ? (pass ? "bg-gold-400 text-ink-inverse ring-gold-400" : "bg-brand-400 text-ink-inverse ring-brand-400") : "ring-line-strong",
        )}
      >
        {selected && <CheckIcon size={12} strokeWidth={3.4} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-callout font-extrabold text-ink">
          {pass && <CrownIcon size={15} strokeWidth={2.4} className="shrink-0 text-ink-gold" />}
          {title}
        </span>
        <span className="mt-0.5 block text-footnote text-ink-muted">{detail}</span>
        {extra && <span className="mt-1 block text-footnote font-semibold text-ink-gold">{extra}</span>}
      </span>
    </button>
  );
}

/**
 * The two ways to pay at the draw: this board once, or the yearly Annual Pass
 * (with the Venue add-on on a venue board: `venue`). One tap switches.
 * `paysOffAt`: the board the pass pays for itself on (passPaysOffAt, from the
 * prices this device shows); null hides that line.
 */
export function PlanPicker({
  plan,
  onChange,
  boardPrice,
  passPrice,
  paysOffAt,
  disabled,
  venue = false,
}: {
  plan: CheckoutPlan;
  onChange: (plan: CheckoutPlan) => void;
  boardPrice: string | null;
  passPrice: string | null;
  paysOffAt: number | null;
  disabled?: boolean;
  /** A venue board: this board with its Venue add-on, or the Annual Pass + Venue. */
  venue?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label="How to pay" data-testid="plan-picker" className={cx("mt-4 flex flex-col gap-2.5", disabled && "pointer-events-none opacity-60")}>
      <PlanOption
        plan="board"
        selected={plan === "board"}
        title={boardPrice ? `This board · ${boardPrice}` : "This board"}
        detail={venue ? "Once, for this board, with the Venue add-on" : "Once, for this board"}
        onSelect={onChange}
      />
      <PlanOption
        plan="pass"
        selected={plan === "pass"}
        title={`${venue ? VENUE_PASS_NAME : PASS_NAME} · ${perYear(passPrice)}`}
        detail={venue ? "Every board you host for a year, venue boards too" : "Every board you host for a year"}
        extra={paysOffAt ? <span data-testid="pass-pays-off">{paysForItself(paysOffAt)}</span> : undefined}
        onSelect={onChange}
      />
    </div>
  );
}

// ---- The pass card (Profile's Get sheet) ----

function Perk({ children }: { children: ReactNode }) {
  return (
    <li className="flex items-start gap-2.5">
      <span aria-hidden className="mt-px grid h-5 w-5 shrink-0 place-items-center rounded-full bg-gold-400/15 text-ink-gold">
        <CheckIcon size={12} strokeWidth={3.2} />
      </span>
      <span>{children}</span>
    </li>
  );
}

/** `paysOffAt`: as PlanPicker's (null leaves that perk out). `plan` "club": the Annual Pass + Venue. */
export function PassCard({ price, test, paysOffAt = null, plan = "host" }: { price: string | null; test?: boolean; paysOffAt?: number | null; plan?: PassPlan }) {
  const venue = plan === "club";
  return (
    <div data-testid="pass-card" className="relative overflow-hidden rounded-card bg-surface-3 p-4 ring-1 ring-inset ring-gold-line/40">
      <div aria-hidden className="pointer-events-none absolute -right-10 -top-14 h-40 w-40 rounded-full bg-[radial-gradient(closest-side,rgb(255_194_51/0.22),transparent)]" />
      <div className="relative flex items-center gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gold-400 text-ink-inverse shadow-[inset_0_-2px_0_rgb(0_0_0/0.18),inset_0_1px_0_rgb(255_255_255/0.4)]">
          <CrownIcon size={21} strokeWidth={2.3} />
        </span>
        <div className="min-w-0">
          <p className="font-display text-title-3 font-extrabold text-ink">{venue ? VENUE_PASS_NAME : PASS_NAME}</p>
          <p className="text-subhead font-semibold text-ink-muted">{test ? "Test pass · no charge" : perYear(price)}</p>
        </div>
      </div>
      <ul className="relative mt-3.5 flex flex-col gap-2 text-subhead text-ink">
        <Perk>Every board you host for a year from today</Perk>
        <Perk>{venue ? "Venue boards included: free to play, prize pickup, 10 co-hosts" : "Draw the numbers with no host fee"}</Perk>
        {venue && <Perk>Your venue's name and logo on your boards and TV</Perk>}
        {paysOffAt ? <Perk>{paysForItself(paysOffAt)}</Perk> : null}
      </ul>
    </div>
  );
}

// ---- The disclosure next to the subscribe button ----

const link = "font-semibold text-ink-muted underline underline-offset-2";

/**
 * What Apple asks to see before someone subscribes (and fair to show on the
 * web too): the pass's name, length, price per period, that it renews until
 * canceled, how to cancel, and links to the Terms and Privacy Policy.
 * `onNavigate` closes the sheet when a link is followed.
 */
export function PassDisclosure({
  method,
  price,
  onNavigate,
  plan = "host",
}: {
  method: CheckoutMethod | null;
  price: string | null;
  onNavigate?: () => void;
  /** "club": the Annual Pass + Venue. */
  plan?: PassPlan;
}) {
  const name = plan === "club" ? VENUE_PASS_NAME : PASS_NAME;
  let text: ReactNode;
  if (method === "test") {
    text = "Test pass: no charge while checkout is in test mode. It lasts a year and doesn't renew.";
  } else if (method === "iap") {
    text = (
      <>
        {name}, 1 year, {price ? `${price} a year` : "at the price the App Store shows"}. Charged to your Apple ID when you confirm. It renews
        automatically each year unless you cancel at least 24 hours before it renews; the renewal is charged in the 24 hours before. Cancel any
        time in Settings › your name › Subscriptions.
      </>
    );
  } else {
    text = (
      <>
        {name}, 1 year, {price ? `${price} a year` : "yearly"}. It renews automatically each year until you cancel. Cancel any time in Profile ›
        Annual Pass › Manage.
      </>
    );
  }
  return (
    <p data-testid="pass-disclosure" className="px-1 text-center text-caption leading-snug text-ink-subtle">
      {text}{" "}
      <Link to="/terms#host-pass" onClick={onNavigate} className={link}>
        Terms
      </Link>{" "}
      ·{" "}
      <Link to="/privacy" onClick={onNavigate} className={link}>
        Privacy
      </Link>
    </p>
  );
}

/** "Included with your Annual Pass": where a price would be on a board the pass covers. */
export function PassIncluded({ className }: { className?: string }) {
  return (
    <p data-testid="host-pass-note" className={cx("flex items-center justify-center gap-1.5 text-footnote font-semibold text-ink-gold", className)}>
      <SparklesIcon size={14} strokeWidth={2.4} className="shrink-0" />
      Included with your {PASS_NAME}
    </p>
  );
}

