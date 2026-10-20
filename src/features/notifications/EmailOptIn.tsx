// The opt-in for email notices about one board (docs/email.md), for players
// notifications can't reach (a browser tab without the Home Screen app). Never
// required. One shape per state:
//
//   none          Email me when the numbers are drawn and if I win   [email] [Email me]
//   pending       Check your inbox · j•••@gmail.com                   [Send again] [Change email] / Remove this address
//   confirmed     Email is on · j•••@gmail.com                        [Turn off email] [Change email]
//   unsubscribed  (the form again, saying they unsubscribed)
//
// The address goes to the server and comes back masked; nothing is stored here.

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { EMAIL_MAX_LENGTH, EMAIL_OPT_IN, emailProblem } from "../../../shared/email";
import type { EmailNoticeStatus } from "../../../shared/types";
import { AlertIcon, CheckIcon, MailIcon } from "../../components/icons";
import { Button, Skeleton, TextField, cx } from "../../components/ui";
import { useEmailNotices } from "../../lib/emailNotices";
import { haptic } from "../../lib/native";

export interface EmailOptInProps {
  gameId: string;
  boardName: string;
  /** Told each status the server confirms (a sheet can say "Done" once it's set). */
  onStatus?: (status: EmailNoticeStatus) => void;
  className?: string;
}

function Tile({ tone, children }: { tone: "brand" | "muted"; children: ReactNode }) {
  return (
    <span
      aria-hidden
      className={cx(
        "grid h-10 w-10 shrink-0 place-items-center rounded-xl",
        tone === "brand" ? "bg-brand-400 text-ink-inverse" : "bg-brand-400/14 text-ink-brand",
      )}
    >
      {children}
    </span>
  );
}

function Head({ icon, title, children }: { icon: ReactNode; title: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      {icon}
      <div className="min-w-0 flex-1 pt-0.5">
        <p className="text-callout font-extrabold leading-snug text-ink">{title}</p>
        {children && <div className="mt-0.5 text-footnote leading-snug text-ink-muted">{children}</div>}
      </div>
    </div>
  );
}

export function EmailOptIn({ gameId, boardName, onStatus, className }: EmailOptInProps) {
  const { notices, busy, error, add, resend, remove } = useEmailNotices(gameId);
  const [draft, setDraft] = useState("");
  const [invalid, setInvalid] = useState<string | null>(null);
  const [changing, setChanging] = useState(false);
  const [sentAgain, setSentAgain] = useState(false);
  const onStatusRef = useRef(onStatus);
  onStatusRef.current = onStatus;
  const status = notices?.status ?? null;

  useEffect(() => {
    if (status) onStatusRef.current?.(status);
  }, [status]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const problem = emailProblem(draft);
    setInvalid(problem);
    if (problem) {
      void haptic("warning");
      return;
    }
    void add(draft.trim()).then((ok) => {
      if (!ok) return;
      void haptic("success");
      setChanging(false);
      setSentAgain(false);
      setDraft("");
    });
  };

  const failure = error && (
    <p role="alert" data-testid="email-optin-error" className="flex items-start gap-1.5 text-footnote font-semibold text-ink-danger">
      <AlertIcon size={14} className="mt-0.5 shrink-0" />
      {error}
    </p>
  );

  if (!notices) {
    return (
      <div data-testid="email-optin" data-state={error ? "error" : "loading"} className={cx("flex flex-col gap-3", className)}>
        {error ? (
          failure
        ) : (
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-xl" />
            <div className="flex flex-1 flex-col gap-1.5">
              <Skeleton className="h-3.5 w-4/5" />
              <Skeleton className="h-3 w-3/5" />
            </div>
          </div>
        )}
      </div>
    );
  }

  const form = (
    <form onSubmit={submit} noValidate className="flex flex-col gap-2.5">
      <TextField
        label="Your email"
        type="email"
        autoComplete="email"
        inputMode="email"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="send"
        placeholder="name@email.com"
        maxLength={EMAIL_MAX_LENGTH}
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          if (invalid) setInvalid(null);
        }}
        error={invalid}
        data-testid="email-optin-input"
      />
      <Button type="submit" block loading={busy === "add"} leading={<MailIcon size={18} />} data-testid="email-optin-submit">
        Email me
      </Button>
      {changing && (
        <Button variant="ghost" size="sm" block className="text-ink-muted" onClick={() => setChanging(false)}>
          Keep {notices.email ?? "my email"}
        </Button>
      )}
    </form>
  );

  let body: ReactNode;
  if (status === "pending" && !changing) {
    body = (
      <>
        <Head icon={<Tile tone="muted"><MailIcon size={20} /></Tile>} title="Check your inbox">
          We sent a link to <b className="font-bold text-ink">{notices.email}</b>. Tap it to start email for {boardName}. Can't find it? Check spam.
        </Head>
        {sentAgain && (
          <p role="status" className="rounded-xl bg-surface-3 px-3 py-2 text-center text-footnote font-semibold text-ink">
            Sent again. The new link replaces the old one.
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            size="sm"
            loading={busy === "resend"}
            data-testid="email-optin-resend"
            onClick={() => void resend().then((ok) => ok && setSentAgain(true))}
          >
            Send again
          </Button>
          <Button variant="ghost" size="sm" data-testid="email-optin-change" onClick={() => setChanging(true)}>
            Change email
          </Button>
        </div>
        <button
          type="button"
          disabled={busy === "remove"}
          data-testid="email-optin-off"
          onClick={() => void remove()}
          className="pressable -my-1 flex min-h-11 items-center self-start rounded-lg px-1 text-footnote font-semibold text-ink-muted underline underline-offset-2"
        >
          {busy === "remove" ? "Removing…" : "Remove this address"}
        </button>
      </>
    );
  } else if (status === "confirmed" && !changing) {
    body = (
      <>
        <Head icon={<Tile tone="brand"><CheckIcon size={20} strokeWidth={3} /></Tile>} title="Email is on">
          <span className="block font-semibold text-ink">{notices.email}</span>
          We'll email you when the numbers are drawn and if you win, then the final results.
        </Head>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" loading={busy === "remove"} data-testid="email-optin-off" onClick={() => void remove()}>
            Turn off email
          </Button>
          <Button variant="ghost" size="sm" data-testid="email-optin-change" onClick={() => setChanging(true)}>
            Change email
          </Button>
        </div>
      </>
    );
  } else {
    body = (
      <>
        <Head icon={<Tile tone="muted"><MailIcon size={20} /></Tile>} title={EMAIL_OPT_IN}>
          {changing
            ? "We'll send a new link to confirm it."
            : status === "unsubscribed"
              ? "You unsubscribed from this board's email. Add your email to turn it back on."
              : "Handy when notifications can't reach you. One email to confirm, then only the big moments."}
        </Head>
        {form}
        <p className="text-caption text-ink-subtle">Never required. Only you see your address, and every email has an unsubscribe link.</p>
      </>
    );
  }

  return (
    <div data-testid="email-optin" data-state={changing ? "change" : (status ?? "none")} className={cx("flex flex-col gap-3", className)}>
      {body}
      {failure}
    </div>
  );
}
