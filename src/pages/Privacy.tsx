// Privacy policy (App Store "Privacy Policy URL": https://jaxsquares.com/privacy).
// Source text: docs/app-store/privacy-policy.md. Keep the two, the App Privacy
// answers in docs/app-store/listing.md and ios/App/App/PrivacyInfo.xcprivacy in step.
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { BellIcon, CheckIcon, GridIcon, InfoIcon, LockIcon, MailIcon, PencilIcon, RefreshIcon, TrashIcon, UserIcon, UsersIcon, XIcon } from "../components/icons";
import { buttonStyles, Card, ListGroup, ListRow, TopBar } from "../components/ui";

const UPDATED = "October 19, 2026";
const SUPPORT_EMAIL = "support@jaxsquares.com";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="px-1 font-display text-title-3 font-extrabold text-ink">{title}</h2>
      {children}
    </section>
  );
}

function Prose({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-3 px-1 text-callout text-ink-muted">{children}</div>;
}

/** A row that wraps (ListRow truncates): icon tile, bold lead-in, muted detail. */
function Fact({ icon, title, children }: { icon?: ReactNode; title: ReactNode; children: ReactNode }) {
  return (
    <div className="flex gap-3.5 px-4 py-3.5">
      {icon && (
        <span aria-hidden className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-surface-4 text-ink-brand [&>svg]:h-[1.15rem] [&>svg]:w-[1.15rem]">
          {icon}
        </span>
      )}
      <div className="min-w-0">
        <p className="text-callout font-bold text-ink">{title}</p>
        <p className="mt-0.5 text-subhead text-ink-muted">{children}</p>
      </div>
    </div>
  );
}

function Check({ children, no }: { children: ReactNode; no?: boolean }) {
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

export default function Privacy() {
  return (
    <>
      <TopBar title="Privacy" subtitle={`Last updated ${UPDATED}`} back />
      <div className="flex flex-col gap-8 px-safe pt-1">
        <Card tone="brand" padding="lg">
          <p className="eyebrow text-ink-brand">The short version</p>
          <p className="mt-2 font-display text-title-3 font-extrabold text-ink">We keep as little as a squares board needs.</p>
          <ul className="mt-4 flex flex-col gap-2.5 text-callout text-ink">
            <Check>No account needed to play, no ads, no tracking.</Check>
            <Check>Card and Apple Pay details never reach us.</Check>
            <Check>We never sell or share your information.</Check>
            <Check>Ask, and we'll delete what we hold.</Check>
          </ul>
        </Card>

        <Section title="What we collect">
          <ListGroup footer="We don't collect your phone number, contacts, photos, location or health data, or your email unless you sign in and share it or ask for email about a board. There are no analytics or advertising SDKs.">
            <Fact icon={<UserIcon />} title="A random device ID">
              Created the first time you open JaxSquares and stored on your device, so we can recognize your squares and the boards you host or join. It isn't your Apple or advertising identifier.
            </Fact>
            <Fact icon={<LockIcon />} title="If you sign in (hosts do; optional for players)">
              Signing in with Apple or Google gives us the account ID they assign you and, if you share it, your email. We use them only to keep your boards on every device you sign in on, and we show your email only to you. Sign in with Apple lets you hide your email.
            </Fact>
            <Fact icon={<PencilIcon />} title="The name you choose">
              The display name, color and emoji you pick. Everyone in that board can see them, and a nickname is fine.
            </Fact>
            <Fact icon={<GridIcon />} title="Board content">
              Board and team names, the optional prize notes a host writes, and the game's scores and results.
            </Fact>
            <Fact icon={<BellIcon />} title="Notification tokens">
              Only if you turn notifications on: the push token your device or browser gives us, used to tell you about your boards. Turn it off any time.
            </Fact>
            <Fact icon={<MailIcon />} title="Email for a board (optional)">
              Only if you ask for email about a board: the address you type. We send one email to confirm it, then only when the numbers are drawn, if you win, and the final results. Only you see it, and we delete it a week after the board's game ends.
            </Fact>
            <Fact icon={<LockIcon />} title="Purchase records">
              When a host pays the host fee for a board (when they draw its numbers), we keep the transaction reference, amount and the board it paid for. Card and Apple Pay details go straight to Apple or Stripe.
            </Fact>
            <Fact icon={<LockIcon />} title="An Annual Pass (optional)">
              If you get the yearly Annual Pass, we keep its subscription reference (from the App Store or Stripe), whether it's active, when it renews or ends, and whether it renews, tied to your device ID or account. For a pass bought on the web, Stripe also keeps a customer record for it. We use this only to cover your boards' host fee and to show your pass.
            </Fact>
            <Fact icon={<LockIcon />} title="The Venue add-on and your venue (optional)">
              If your Annual Pass has the Venue add-on, we keep it like any Annual Pass, plus your venue: the name and logo you give it (the logo is resized on your device before it's uploaded), and a scrambled fingerprint of its TV link, never the link itself. The club's name and logo are public on the boards you host, their TV view, printout and link previews. They're deleted with your account.
            </Fact>
            <Fact icon={<InfoIcon />} title="Basic server logs">
              Our hosting provider records technical details like IP address and request time to keep the service running and secure. We don't use them to work out where you are.
            </Fact>
          </ListGroup>
        </Section>

        <Section title="How we use it">
          <Prose>
            <p>Only to run JaxSquares:</p>
            <ul className="flex flex-col gap-2 text-ink">
              <Check>Showing boards and drawing numbers</Check>
              <Check>Recording scores and winning squares</Check>
              <Check>Sending the notifications and emails you asked for</Check>
              <Check>Letting hosts draw the numbers once a board is paid for, covered by their Annual Pass, or free (5 or fewer players hold squares)</Check>
              <Check>Showing a venue's name and logo on its host's boards, and a venue board's players list (names, squares and when each joined) to its host and co-hosts</Check>
              <Check>Keeping your boards on every device you sign in on</Check>
              <Check>Preventing abuse</Check>
            </ul>
            <ul className="mt-1 flex flex-col gap-2">
              <Check no>We don't sell your information.</Check>
              <Check no>We don't share it for advertising.</Check>
              <Check no>We don't track you across other apps or websites.</Check>
            </ul>
          </Prose>
        </Section>

        <Section title="Who processes it for us">
          <ListGroup footer="Each provider handles data under its own privacy terms, and only for these purposes.">
            <ListRow title="Cloudflare" subtitle="Hosting and database" />
            <ListRow title="Apple" subtitle="In-App Purchase and subscriptions, push delivery, Sign in with Apple" />
            <ListRow title="Google" subtitle="Sign in with Google (optional)" />
            <ListRow title="Google Firebase Cloud Messaging" subtitle="Push notifications in the app" />
            <ListRow title="Stripe" subtitle="Web payments for the host fee, the Venue add-on and the Annual Pass" />
            <ListRow title="Resend" subtitle="Sending the board emails you ask for" />
          </ListGroup>
        </Section>

        <Section title="Sharing inside a board">
          <Card padding="lg" className="flex gap-3.5">
            <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent-500/15 text-ink-accent">
              <UsersIcon size={19} />
            </span>
            <div className="text-callout text-ink-muted">
              <p>
                Anyone with a board's link can see its name and prize notes, the players' names, colors and emoji, who claimed which squares,
                and the scores and winners.
              </p>
              <p className="mt-2 font-semibold text-ink">Only share links with people you want to play with.</p>
            </div>
          </Card>
        </Section>

        <Section title="How long we keep it">
          <ListGroup>
            <Fact title="Boards and their data">Until the host deletes the board.</Fact>
            <Fact title="Your account">Until you delete it. Your boards and squares stay on their boards afterwards, no longer tied to you.</Fact>
            <Fact title="A venue's name and logo">Until you change them, or delete your account. They stop showing on your boards when your Venue add-on ends.</Fact>
            <Fact title="Purchase records">As long as tax and accounting law requires.</Fact>
            <Fact title="Push tokens">Deleted when you turn notifications off, or when Apple or Google tells us a token is no longer valid.</Fact>
            <Fact title="Email for a board">
              Deleted a week after the board's game ends, as soon as you unsubscribe or turn it off, or after 7 days if you never confirm it. If you unsubscribe from all JaxSquares email, we keep only a scrambled fingerprint of the address so we never email it again.
            </Fact>
          </ListGroup>
        </Section>

        <Section title="Your choices">
          <ListGroup>
            <Fact icon={<GridIcon />} title="Leave a board">
              Release your squares before the numbers are drawn.
            </Fact>
            <Fact icon={<TrashIcon />} title="Delete a board">
              The host can delete a board at any time. It's removed for everyone.
            </Fact>
            <Fact icon={<BellIcon />} title="Notifications">
              Turn them off in the app, or in iOS Settings → Notifications → JaxSquares.
            </Fact>
            <Fact icon={<MailIcon />} title="Email">
              Every email has an unsubscribe link, for that board or for all JaxSquares email. You can also turn it off from the board's bell.
            </Fact>
            <Fact icon={<LockIcon />} title="Sign out or delete your account">
              In Profile → Account. Signing out takes your boards off that device. Deleting your account removes your sign-in, email and device links, and revokes JaxSquares' access to your Apple ID. Your boards and squares stay on their boards for the other players.
            </Fact>
            <Fact icon={<RefreshIcon />} title="Start fresh">
              Delete the app, or clear this site's data in your browser, and the device ID is removed from your device.
            </Fact>
            <Fact icon={<UserIcon />} title="Ask us">
              To find out what we hold or have it deleted, email {SUPPORT_EMAIL} with a board link. We'll respond within 30 days.
            </Fact>
          </ListGroup>
        </Section>

        <Section title="Children">
          <Prose>
            <p>JaxSquares isn't directed to children under 13, and we don't knowingly collect information from them.</p>
          </Prose>
        </Section>

        <Section title="Changes">
          <Prose>
            <p>If this policy changes, we'll update the date at the top. If a change matters, we'll also tell you in the app.</p>
          </Prose>
        </Section>

        <Card tone="raised" padding="lg" className="flex flex-col items-start gap-4">
          <div>
            <p className="font-display text-title-3 font-extrabold text-ink">Questions about your data?</p>
            <p className="mt-1 text-callout text-ink-muted">Write to us and a real person will answer.</p>
          </div>
          <a href={`mailto:${SUPPORT_EMAIL}?subject=Privacy%20question`} className={buttonStyles({ block: true })}>
            Email us
          </a>
          <p className="text-footnote text-ink-subtle">
            <span className="select-all font-semibold text-ink-muted">{SUPPORT_EMAIL}</span>
            <br />
            See also our{" "}
            <Link to="/terms" className="font-semibold text-ink-brand underline-offset-2 hover:underline">
              Terms
            </Link>{" "}
            and{" "}
            <Link to="/support" className="font-semibold text-ink-brand underline-offset-2 hover:underline">
              Support
            </Link>
            .
          </p>
        </Card>
      </div>
    </>
  );
}
