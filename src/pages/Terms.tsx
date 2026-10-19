// Terms of use (https://jaxsquares.com/terms). Plain language on purpose; have it
// reviewed before launch. The product rule it encodes: no money between players.
// The only charge is the host fee, due when the host draws a board's numbers,
// or the yearly Host Pass that covers it. Prices show as this device shows
// them (useHostFee, useHostPassPrice): inside the iOS app only the App Store's
// price and Apple's billing, never the web price or Stripe (App Store
// guideline 3.1.1). /terms#host-pass is linked from the subscription disclosure.
import { useEffect, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { CheckIcon, GiftIcon, UsersIcon, XIcon } from "../components/icons";
import { Card, ListGroup, TopBar } from "../components/ui";
import { platform } from "../lib/native";
import { useHostFee } from "../lib/useHostFee";
import { useHostPassPrice } from "../lib/useHostPass";

const UPDATED = "October 19, 2026";
const SUPPORT_EMAIL = "support@jaxsquares.com";

function Section({ n, title, id, children }: { n: number; title: string; id?: string; children: ReactNode }) {
  return (
    <section id={id} className="flex scroll-mt-20 flex-col gap-2.5">
      <h2 className="flex items-baseline gap-2.5 px-1 font-display text-title-3 font-extrabold text-ink">
        <span aria-hidden className="w-6 shrink-0 text-right tabular-nums text-ink-brand">
          {n}
        </span>
        {title}
      </h2>
      <div className="flex flex-col gap-2.5 pl-9.5 pr-1 text-callout text-ink-muted">{children}</div>
    </section>
  );
}

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

const link = "font-semibold text-ink-brand underline-offset-2 hover:underline";

export default function Terms() {
  const { price } = useHostFee();
  const { price: passPrice } = useHostPassPrice();
  const inApp = platform() === "ios";
  // The subscription disclosure links here as /terms#host-pass.
  const { hash } = useLocation();
  useEffect(() => {
    if (hash !== "#host-pass") return;
    const t = setTimeout(() => document.getElementById("host-pass")?.scrollIntoView({ behavior: "smooth", block: "start" }), 120);
    return () => clearTimeout(t);
  }, [hash]);
  return (
    <>
      <TopBar title="Terms" subtitle={`Last updated ${UPDATED}`} back />
      <div className="flex flex-col gap-8 px-safe pt-1">
        <Card tone="brand" padding="lg">
          <p className="eyebrow text-ink-brand">In plain words</p>
          <p className="mt-2 font-display text-title-3 font-extrabold text-ink">JaxSquares is a free-to-play game board for friends.</p>
          <ul className="mt-4 flex flex-col gap-2.5 text-callout text-ink">
            <Point>Setting up a board, inviting friends and picking squares are free.</Point>
            <Point no>No wagering, ever.</Point>
            <Point no>No money handled between players.</Point>
            <Point>A square price or prize a host shows is just information.</Point>
          </ul>
        </Card>

        <p className="px-1 text-callout text-ink-muted">
          These terms apply when you use JaxSquares on the web or in the app. By using it, you agree to them. If you don't agree, please don't use
          JaxSquares.
        </p>

        <Section n={1} title="The game">
          <p>
            JaxSquares lets a group of friends play football squares together: a host makes a board, shares the link, everyone claims squares, and
            the numbers are drawn at random when the host locks the board. You don't need an account to play.
          </p>
        </Section>

        <Section n={2} title="No wagering, no money between players">
          <p>
            JaxSquares never sells squares, and it never collects, holds, sends or tracks money or anything of value between players. Players never
            pay to join.
          </p>
          <p>
            A host can show a square price or prize amounts on their board. That's display-only information the host sets. Players settle nothing
            through JaxSquares.
          </p>
          <p className="font-semibold text-ink">You agree not to use JaxSquares to organize wagers or to collect money from other players.</p>
        </Section>

        <Section n={3} title="Prizes are just notes">
          <Card padding="md" className="flex gap-3">
            <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gold-400/15 text-ink-gold">
              <GiftIcon size={19} />
            </span>
            <p>
              A host can add a short note to a period, like <span className="font-semibold text-ink">“Loser buys wings”</span>. It's an informal
              note between friends.
            </p>
          </Card>
          <p>
            JaxSquares doesn't run, sponsor, award or guarantee any prize, and isn't part of anything people agree to outside the app. Keep notes
            friendly and free of money.
          </p>
        </Section>

        <Section n={4} title="The host fee">
          <p>
            The only charge in JaxSquares is the host fee for creating and managing a board: {price ? `${price} per board` : "once per board"},
            charged when the host draws the numbers, unless the host's Host Pass covers it (section 5). Setting up a board, inviting friends and
            picking squares are free.
          </p>
          <p>
            {inApp ? "In the iPhone app, the fee is an In-App Purchase billed by Apple." : "In the iPhone app, the fee is an In-App Purchase billed by Apple. On the web, it's charged through Stripe."}{" "}
            Except where the law or the platform's rules require a refund, the host fee isn't refundable. App Store purchases are refunded by Apple
            at{" "}
            <a href="https://reportaproblem.apple.com" target="_blank" rel="noopener noreferrer" className={link}>
              reportaproblem.apple.com
            </a>
            .
            {!inApp && (
              <>
                {" "}
                To ask about a refund for a web payment, contact{" "}
                <Link to="/support" className={link}>
                  Support
                </Link>
                .
              </>
            )}
          </p>
        </Section>

        <Section n={5} title="The Host Pass" id="host-pass">
          <p>
            The Host Pass is an optional yearly subscription: {passPrice ? `${passPrice} a year` : "a yearly price shown before you buy"}. While
            it's active, it covers the host fee on every board you host, so drawing the numbers costs nothing more. Boards you drew while it was
            active stay drawn after it ends.
          </p>
          <p>
            It renews automatically every year until you cancel.{" "}
            {inApp
              ? "In the iPhone app it's an App Store subscription billed by Apple. Cancel any time in Settings › your name › Subscriptions, at least 24 hours before it renews to avoid the next charge."
              : "In the iPhone app it's an App Store subscription billed by Apple: cancel it in Settings › your name › Subscriptions, at least 24 hours before it renews to avoid the next charge. On the web it's billed through Stripe: cancel any time in Profile › Host Pass › Manage, before it renews to avoid the next charge."}{" "}
            Canceling stops the next renewal; the pass stays active until the end of the year you've paid for.
          </p>
          <p>
            Except where the law or the platform's rules require a refund, the Host Pass isn't refundable. App Store subscriptions are refunded by
            Apple at{" "}
            <a href="https://reportaproblem.apple.com" target="_blank" rel="noopener noreferrer" className={link}>
              reportaproblem.apple.com
            </a>
            .
            {!inApp && (
              <>
                {" "}
                To ask about a refund for a web payment, contact{" "}
                <Link to="/support" className={link}>
                  Support
                </Link>
                .
              </>
            )}{" "}
            Like the host fee, it's paid to JaxSquares for running your boards; it never pays for squares or anything between players.
          </p>
        </Section>

        <Section n={6} title="Hosts">
          <p>
            The host runs the board: they draw the numbers, enter or correct scores, pick a winning square when a result needs fixing, and can
            delete the board at any time. Host controls live on the device that created the board, so keep your host link somewhere safe.
          </p>
        </Section>

        <Section n={7} title="Scores and results">
          <p>
            Live scores come from a third-party sports data provider and can be late or wrong. Hosts can correct them. Results in JaxSquares are for
            fun and aren't official.
          </p>
        </Section>

        <Section n={8} title="Be a good sport">
          <ListGroup>
            <div className="flex gap-3 px-4 py-3.5">
              <UsersIcon size={20} className="mt-0.5 shrink-0 text-ink-accent" />
              <p>
                Pick names, board names and notes you'd be happy to say out loud at the watch party. Don't harass anyone, pretend to be someone
                else, or use JaxSquares to break the law.
              </p>
            </div>
          </ListGroup>
          <p>We may remove boards or content that break these rules.</p>
        </Section>

        <Section n={9} title="Not affiliated">
          <p>
            JaxSquares isn't affiliated with or endorsed by any league, team or broadcaster. Team names appear only to describe the matchup.
          </p>
        </Section>

        <Section n={10} title="The service">
          <p>
            We work hard to keep JaxSquares running, but we provide it “as is”, without warranties. To the extent the law allows, we aren't liable
            for indirect losses, and our total liability is limited to what you paid us in the last 12 months.
          </p>
          <p>
            We may update these terms. We'll change the date at the top, and if a change matters we'll tell you in the app. Using JaxSquares after
            that means you accept the update.
          </p>
        </Section>

        <Section n={11} title="Contact">
          <p>
            Questions? Email{" "}
            <a href={`mailto:${SUPPORT_EMAIL}`} className={link}>
              {SUPPORT_EMAIL}
            </a>{" "}
            or visit{" "}
            <Link to="/support" className={link}>
              Support
            </Link>
            . How we handle your data is in our{" "}
            <Link to="/privacy" className={link}>
              Privacy Policy
            </Link>
            .
          </p>
        </Section>
      </div>
    </>
  );
}
