// Terms of use (https://jaxsquares.com/terms). Plain language on purpose; have it
// reviewed before launch. The product rule it encodes: no money between players.
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { CheckIcon, GiftIcon, UsersIcon, XIcon } from "../components/icons";
import { Card, ListGroup, TopBar } from "../components/ui";

const UPDATED = "October 16, 2026";
const SUPPORT_EMAIL = "support@jaxsquares.com";

function Section({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5">
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
  return (
    <>
      <TopBar title="Terms" subtitle={`Last updated ${UPDATED}`} back />
      <div className="flex flex-col gap-8 px-safe pt-1">
        <Card tone="brand" padding="lg">
          <p className="eyebrow text-ink-brand">In plain words</p>
          <p className="mt-2 font-display text-title-3 font-extrabold text-ink">JaxSquares is a free-to-play game board for friends.</p>
          <ul className="mt-4 flex flex-col gap-2.5 text-callout text-ink">
            <Point>Joining a board and claiming squares is always free.</Point>
            <Point no>No wagering, ever.</Point>
            <Point no>No money handled between players.</Point>
            <Point>Prizes are informal notes between friends.</Point>
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
            JaxSquares is not a gambling service. Players never pay to join, squares are never sold, and the app doesn't collect, hold, track or pay
            out money or anything of value between players.
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

        <Section n={4} title="Creating a board">
          <p>
            The person who creates a board pays JaxSquares a one-time fee, through Apple In-App Purchase in the iPhone app or Stripe on the web.
            It's the only charge in JaxSquares, and it unlocks that one board for everyone you invite.
          </p>
          <p>
            The board creation fee is non-refundable, except where the law or the platform's rules require a refund. App Store purchases are
            refunded by Apple at{" "}
            <a href="https://reportaproblem.apple.com" target="_blank" rel="noopener noreferrer" className={link}>
              reportaproblem.apple.com
            </a>
            .
          </p>
        </Section>

        <Section n={5} title="Hosts">
          <p>
            The host runs the board: they lock it, enter or correct scores, pick a winning square when a result needs fixing, and can delete the
            board at any time. Host controls live on the device that created the board, so keep your host link somewhere safe.
          </p>
        </Section>

        <Section n={6} title="Scores and results">
          <p>
            Live scores come from a third-party sports data provider and can be late or wrong. Hosts can correct them. Results in JaxSquares are for
            fun and aren't official.
          </p>
        </Section>

        <Section n={7} title="Be a good sport">
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

        <Section n={8} title="Not affiliated">
          <p>
            JaxSquares isn't affiliated with or endorsed by any league, team or broadcaster. Team names appear only to describe the matchup.
          </p>
        </Section>

        <Section n={9} title="The service">
          <p>
            We work hard to keep JaxSquares running, but we provide it “as is”, without warranties. To the extent the law allows, we aren't liable
            for indirect losses, and our total liability is limited to what you paid us in the last 12 months.
          </p>
          <p>
            We may update these terms. We'll change the date at the top, and if a change matters we'll tell you in the app. Using JaxSquares after
            that means you accept the update.
          </p>
        </Section>

        <Section n={10} title="Contact">
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
