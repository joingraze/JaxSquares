// Support page (App Store "Support URL": https://jaxsquares.com/support).
// The contact address is a placeholder until the mailbox exists.
import type { ReactNode } from "react";
import { ChevronDownIcon } from "../components/icons";
import { buttonStyles, Card, ListGroup, ListRow, LogoMark, TopBar } from "../components/ui";

const SUPPORT_EMAIL = "support@jaxsquares.com";

interface Faq {
  q: string;
  a: ReactNode;
}

const link = "font-semibold text-ink-brand underline-offset-2 hover:underline";

const FAQS: Faq[] = [
  {
    q: "How do my friends join a board?",
    a: (
      <>
        <p>Tap Share on your board and send the link to the group chat. Friends open it, pick a name and a color, and tap squares to claim them.</p>
        <p>Nobody needs to sign up or download anything. If they have the app, the link opens right in it.</p>
      </>
    ),
  },
  {
    q: "Does it cost anything to play?",
    a: (
      <>
        <p>
          Joining a board and claiming squares is free. The only charge is a one-time fee the host pays JaxSquares to create a board, and it
          unlocks that board for everyone.
        </p>
        <p>No money moves between players in JaxSquares, and squares are never sold. Prize notes like “Loser buys wings” are just for fun.</p>
      </>
    ),
  },
  {
    q: "I lost host access to my board.",
    a: (
      <>
        <p>
          Host controls live on the device that created the board. If you saved your private host link, open it on the new device and your host
          controls come right back.
        </p>
        <p>
          No host link? Email us the board link from any device and we'll help you get back in.
        </p>
      </>
    ),
  },
  {
    q: "I paid, but my board isn't open yet.",
    a: (
      <>
        <p>
          Open JaxSquares again while you're online. Purchases that went through but weren't confirmed (say the app closed mid-checkout) are
          finished automatically when the app starts, and your board opens.
        </p>
        <p>
          Still stuck? Email us the board link. Refunds for App Store purchases are handled by Apple at{" "}
          <a href="https://reportaproblem.apple.com" target="_blank" rel="noopener noreferrer" className={link}>
            reportaproblem.apple.com
          </a>
          .
        </p>
      </>
    ),
  },
  {
    q: "How do I turn notifications on or off?",
    a: (
      <>
        <p>
          Manage them from your Profile in JaxSquares. On iPhone you can also go to Settings → Notifications → JaxSquares; in a browser, use the
          site settings next to the address bar.
        </p>
        <p>We only send what matters: numbers drawn, kickoff, and when your square hits.</p>
      </>
    ),
  },
];

function FaqItem({ faq, defaultOpen }: { faq: Faq; defaultOpen?: boolean }) {
  return (
    <details className="group" open={defaultOpen}>
      <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-ink/3 active:bg-ink/6 [&::-webkit-details-marker]:hidden">
        <span className="flex-1 text-callout font-bold text-ink">{faq.q}</span>
        <ChevronDownIcon size={18} strokeWidth={2.4} className="shrink-0 text-ink-subtle transition-transform duration-200 group-open:rotate-180" />
      </summary>
      <div className="flex flex-col gap-2 px-4 pb-4 text-subhead text-ink-muted">{faq.a}</div>
    </details>
  );
}

export default function Support() {
  return (
    <>
      <TopBar title="Support" subtitle="Help for game day, from real people." back />
      <div className="flex flex-col gap-8 px-safe pt-1">
        <Card tone="raised" padding="lg" className="flex flex-col gap-4">
          <div className="flex items-center gap-3.5">
            <LogoMark size={48} />
            <div className="min-w-0">
              <p className="font-display text-title-3 font-extrabold text-ink">Need a hand?</p>
              <p className="text-subhead text-ink-muted">We usually reply within a day.</p>
            </div>
          </div>
          <a href={`mailto:${SUPPORT_EMAIL}?subject=JaxSquares%20help`} className={buttonStyles({ size: "lg", block: true })}>
            Email support
          </a>
          <p className="text-center text-footnote text-ink-subtle">
            <span className="select-all font-semibold text-ink-muted">{SUPPORT_EMAIL}</span>
            <br />
            Include your board link if it's about a specific board.
          </p>
        </Card>

        <section>
          <h2 className="mb-3 px-1 font-display text-title-3 font-extrabold text-ink">Common questions</h2>
          <ListGroup>
            {FAQS.map((faq, i) => (
              <FaqItem key={faq.q} faq={faq} defaultOpen={i === 0} />
            ))}
          </ListGroup>
        </section>

        <ListGroup title="The fine print">
          <ListRow title="Privacy Policy" subtitle="What we keep and why" to="/privacy" />
          <ListRow title="Terms" subtitle="Free to play, no money between players" to="/terms" />
        </ListGroup>
      </div>
    </>
  );
}
