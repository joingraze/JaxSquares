// Terms of use (https://jaxsquares.com/terms). Plain language on purpose; have it
// reviewed before launch. The product rule it encodes: no money between players.
// The only charges are the host's (shared/pricing.ts): the host fee, due when
// the host draws the numbers of a board more than 5 players hold squares on
// (smaller boards draw free), plus the Venue add-on on a venue board, or the
// yearly Annual Pass that covers them. Prices show as this device shows them
// (useHostFee, useHostPassPrice): inside the iOS app only the App Store's
// price and Apple's billing, never the web price or Stripe (App Store
// guideline 3.1.1). /terms#host-pass is linked from the subscription
// disclosure. The Venue add-on (section 6, /terms#club-pass) is sold on the
// web only: in the iOS app this section describes what it unlocks and never
// its price or how to buy it (App Store guidelines 3.1.1 / 3.1.3(b)).
import { useEffect, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { FREE_PLAYER_LIMIT } from "../../shared/hostFee";
import { CheckIcon, GiftIcon, UsersIcon, XIcon } from "../components/icons";
import { Card, ListGroup, TopBar } from "../components/ui";
import { formatPrice } from "../lib/checkout";
import { platform } from "../lib/native";
import { useHostFee } from "../lib/useHostFee";
import { useClubPassPrice, useHostPassPrice } from "../lib/useHostPass";

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
  const { price, payments } = useHostFee();
  const { price: passPrice } = useHostPassPrice();
  const clubPrice = useClubPassPrice();
  const inApp = platform() === "ios";
  // The Venue add-on on one board, on the web only (the app never shows it).
  const venuePrice = !inApp && payments?.venuePriceCents ? formatPrice(payments.venuePriceCents, payments.currency) : null;
  // The subscription disclosures link here as /terms#host-pass and /terms#club-pass.
  const { hash } = useLocation();
  useEffect(() => {
    if (hash !== "#host-pass" && hash !== "#club-pass") return;
    const t = setTimeout(() => document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: "smooth", block: "start" }), 120);
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
            <Point>Drawing the numbers is free with up to {FREE_PLAYER_LIMIT} players; bigger boards have a host fee.</Point>
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
            JaxSquares lets a group of friends play squares together on football, basketball and soccer games: a host makes a board, shares the link, everyone claims squares, and
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
            The only charges in JaxSquares are the host's, for creating and managing boards: the host fee for a board,{" "}
            {price ? `${price} per board` : "once per board"}, charged when the host draws the numbers of a board whose squares are held by more
            than {FREE_PLAYER_LIMIT} players, unless the host's Annual Pass covers it (section 5).
            {inApp ? "" : ` A venue's board (venue mode) adds the Venue add-on${venuePrice ? `, ${venuePrice}` : ""}, charged with its host fee, unless the host's Annual Pass has the Venue add-on (section 6).`}{" "}
            Season boards come with the Annual Pass. Drawing the numbers of a board held by {FREE_PLAYER_LIMIT} or fewer players is free, and so are
            setting up a board, inviting friends and picking squares.
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

        <Section n={5} title="The Annual Pass" id="host-pass">
          <p>
            The Annual Pass is an optional yearly subscription: {passPrice ? `${passPrice} a year` : "a yearly price shown before you buy"}, for a
            year from the day you buy it. While it's active, it covers the host fee on every board you host, season boards included, so drawing the
            numbers costs nothing more. Boards you drew while it was active stay drawn after it ends.
          </p>
          <p>
            It renews automatically every year until you cancel.{" "}
            {inApp
              ? "In the iPhone app it's an App Store subscription billed by Apple. Cancel any time in Settings › your name › Subscriptions, at least 24 hours before it renews to avoid the next charge."
              : "In the iPhone app it's an App Store subscription billed by Apple: cancel it in Settings › your name › Subscriptions, at least 24 hours before it renews to avoid the next charge. On the web it's billed through Stripe: cancel any time in Profile › Annual Pass › Manage, before it renews to avoid the next charge."}{" "}
            Canceling stops the next renewal; the pass stays active until the end of the year you've paid for.
          </p>
          <p>
            Except where the law or the platform's rules require a refund, the Annual Pass isn't refundable. App Store subscriptions are refunded by
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

        <Section n={6} title="The Venue add-on" id="club-pass">
          {inApp ? (
            <p>
              The Venue add-on is for bars and restaurants. If your account's Annual Pass has it, it covers venue boards too, and its venue
              features work in the app too: your venue's name and logo on the boards you host, up to 10 co-hosts per board, each board's players
              list, and a TV link that rotates your boards. Questions about it? Contact{" "}
              <Link to="/support" className={link}>
                Support
              </Link>
              .
            </p>
          ) : (
            <>
              <p>
                The Venue add-on is for bars and restaurants, sold on the web and billed through Stripe. On one board, it's charged with the host
                fee when the numbers are drawn (section 4): a venue board is free to play and gets house rules, prize pickup, up to 10 co-hosts and
                a download of its players list (names, squares, numbers and when they joined; never who paid). On the Annual Pass, the Annual Pass +
                Venue is an optional yearly subscription: {clubPrice ? `${clubPrice} a year` : "a yearly price shown before you buy"}, for a year
                from the day you buy it. It needs a signed-in account. While it's active it covers every board you host, venue boards included, and
                adds your venue's name and logo on those boards (their TV view, printout, invite and link previews) and a TV link that rotates your
                open and live boards. Adding it to an Annual Pass you already have charges what's left of your pass's year at once, to the card the
                pass renews on. Boards you drew while it was active stay drawn after it ends; the venue features stop when it ends.
              </p>
              <p>
                It renews automatically every year until you cancel. Cancel any time in Profile › Venue add-on › Manage, before it renews to avoid
                the next charge; it stays active until the end of the year you've paid for. Except where the law requires a refund, it isn't
                refundable. To ask about a refund, contact{" "}
                <Link to="/support" className={link}>
                  Support
                </Link>
                .
              </p>
            </>
          )}
          <p>
            Your venue's name and logo must be yours to use: don't upload someone else's logo or trademark. Like board names, a venue name can't
            mention money. Anyone with your venue's TV link can watch the boards it shows, so share it only with your own screens; making a new
            link stops the old one.
          </p>
        </Section>

        <Section n={7} title="Hosts">
          <p>
            The host runs the board: they draw the numbers, enter or correct scores, pick a winning square when a result needs fixing, and can
            delete the board at any time. Host controls live on the device that created the board, so keep your host link somewhere safe.
          </p>
        </Section>

        <Section n={8} title="Scores and results">
          <p>
            Live scores come from a third-party sports data provider and can be late or wrong. Hosts can correct them. Results in JaxSquares are for
            fun and aren't official.
          </p>
        </Section>

        <Section n={9} title="Be a good sport">
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

        <Section n={10} title="Not affiliated">
          <p>
            JaxSquares isn't affiliated with or endorsed by any league, team or broadcaster. Team names appear only to describe the matchup.
          </p>
        </Section>

        <Section n={11} title="The service">
          <p>
            We work hard to keep JaxSquares running, but we provide it “as is”, without warranties. To the extent the law allows, we aren't liable
            for indirect losses, and our total liability is limited to what you paid us in the last 12 months.
          </p>
          <p>
            We may update these terms. We'll change the date at the top, and if a change matters we'll tell you in the app. Using JaxSquares after
            that means you accept the update.
          </p>
        </Section>

        <Section n={12} title="Contact">
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
