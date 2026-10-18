// Support page (App Store "Support URL": https://jaxsquares.com/support).
// The contact address is a placeholder until the mailbox exists. The host fee
// shows as this device shows it (useHostFee): inside the iOS app only the App
// Store's price and Apple's billing, never the web price or Stripe.
import { useEffect, useRef, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import jaxJpg from "../assets/jax-portrait-512.jpg";
import jaxWebp from "../assets/jax-portrait-512.webp";
import { ChevronDownIcon, PawIcon } from "../components/icons";
import { buttonStyles, Card, Jax, ListGroup, ListRow, LogoMark, TopBar } from "../components/ui";
import { platform } from "../lib/native";
import { useHostFee } from "../lib/useHostFee";

const SUPPORT_EMAIL = "support@jaxsquares.com";

interface Faq {
  q: string;
  a: ReactNode;
}

const link = "font-semibold text-ink-brand underline-offset-2 hover:underline";

/** `price`: the host fee as this device shows it (null while loading); `inApp`: inside the iOS app. */
function faqs(price: string | null, inApp: boolean): Faq[] {
  return [
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
            Setting up a board, inviting friends and picking squares are free. The only charge is the host fee for creating and managing a board:{" "}
            {price ? `${price} per board` : "once per board"}, charged when the host draws the numbers.
          </p>
          <p>
            {inApp
              ? "In the iPhone app it's an In-App Purchase billed by Apple."
              : "In the iPhone app it's an In-App Purchase billed by Apple. On the web it's charged through Stripe."}
          </p>
          <p>
            JaxSquares never sells squares, and it never collects, holds, sends or tracks money between players. A square price or prize amount a
            host shows is just information, and players settle nothing through JaxSquares. Prize notes like “Loser buys wings” are just for fun.
          </p>
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
      q: "I paid, but I can't draw the numbers yet.",
      a: (
        <>
          <p>
            Open JaxSquares again while you're online. Purchases that went through but weren't confirmed (say the app closed mid-checkout) are
            finished automatically when the app starts, and then you can draw the numbers.
          </p>
          <p>
            Still stuck? Email us the board link. Refunds for App Store purchases are handled by Apple at{" "}
            <a href="https://reportaproblem.apple.com" target="_blank" rel="noopener noreferrer" className={link}>
              reportaproblem.apple.com
            </a>
            .{inApp ? "" : " To ask about a refund for a web payment, email us."}
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
}

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

/** The real Jax (a tight, metadata-free crop of the owner's photo) next to his drawing. */
function MeetJax() {
  return (
    <section id="meet-jax" aria-labelledby="meet-jax-title" className="scroll-mt-20">
      <Card padding="none" className="relative overflow-hidden">
        {/* Sunset warmth from his photo. */}
        <div aria-hidden className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-[radial-gradient(closest-side,rgb(255_171_15/0.22),transparent)]" />
        <div className="relative flex items-center gap-4 p-4">
          <div className="relative shrink-0">
            <picture>
              <source srcSet={jaxWebp} type="image/webp" />
              <img
                src={jaxJpg}
                width={512}
                height={512}
                loading="lazy"
                decoding="async"
                alt="Jax, a small fluffy golden dog with floppy ears, on the beach at sunset"
                className="h-32 w-32 rounded-[1.5rem] bg-surface-3 object-cover shadow-float ring-2 ring-gold-line/70"
              />
            </picture>
            <span aria-hidden className="absolute -bottom-2 -right-3 grid h-11 w-11 place-items-center rounded-full bg-surface-2 shadow-float ring-1 ring-inset ring-line-strong">
              <Jax pose="face" size={34} />
            </span>
          </div>
          <div className="min-w-0">
            <p className="eyebrow flex items-center gap-1 text-ink-subtle">
              <PawIcon size={12} filled strokeWidth={0} />
              Meet Jax
            </p>
            <h2 id="meet-jax-title" className="mt-1 font-display text-title-3 font-extrabold text-ink">
              Chief squares officer
            </h2>
            <p className="mt-1 text-subhead text-ink-muted">JaxSquares is named after Jax. He hasn't missed a kickoff yet.</p>
          </div>
        </div>
      </Card>
    </section>
  );
}

export default function Support() {
  const { price } = useHostFee();
  // Profile links here as /support#meet-jax.
  const { hash } = useLocation();
  const scrolled = useRef(false);
  useEffect(() => {
    if (hash !== "#meet-jax" || scrolled.current) return;
    scrolled.current = true;
    const t = setTimeout(() => document.getElementById("meet-jax")?.scrollIntoView({ behavior: "smooth", block: "center" }), 120);
    return () => clearTimeout(t);
  }, [hash]);

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
            {faqs(price, platform() === "ios").map((faq, i) => (
              <FaqItem key={faq.q} faq={faq} defaultOpen={i === 0} />
            ))}
          </ListGroup>
        </section>

        <MeetJax />

        <ListGroup title="The fine print">
          <ListRow title="Privacy Policy" subtitle="What we keep and why" to="/privacy" />
          <ListRow title="Terms" subtitle="Free to play, no money between players" to="/terms" />
        </ListGroup>
      </div>
    </>
  );
}
