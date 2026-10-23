// Profile → Venue add-on (docs/payments.md "Pricing"), under the Annual Pass:
// the Annual Pass with the Venue add-on (plan "club" in the API).
//
// A holder (an active pass with the Venue add-on) gets the venue's settings:
// its name, its logo (resized and re-encoded in the browser:
// src/lib/clubLogo.ts), the TV link (Copy, and a new one that cuts off the
// old), its open and live boards, and on the web Manage (the Stripe Customer
// Portal; "End test pass" in test mode). In the iOS app the same features
// work, the status reads "Annual Pass + Venue · Active", and nothing offers,
// prices or links to buying or managing it (App Store guidelines 3.1.1 /
// 3.1.3(b)).
//
// Everyone else on the web sees one line: "Running squares for a bar or
// restaurant? Annual Pass + Venue · $99.99/year", which opens its checkout
// (signing in first, like the web Annual Pass). A holder of a web Annual Pass
// sees "Add the Venue add-on · +$80/year" instead: it's added to their pass
// (ClubCheckoutSheet `upgrade`). Nothing at all in the iOS app.

import { lazy, Suspense, useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import { Link } from "react-router-dom";
import { CLUB_NAME_MAX, clubNameProblem } from "../../../shared/clubs";
import type { ClubSettings, HostPass, MeResponse, PaymentConfig } from "../../../shared/types";
import { ChevronRightIcon, CopyIcon, CrownIcon, ImageIcon, RefreshIcon, TrashIcon, TvIcon } from "../../components/icons";
import { Badge, Button, ListGroup, ListRow, Skeleton, TextField, buttonStyles, useToast } from "../../components/ui";
import { ApiError, errorMessage } from "../../lib/api";
import { CheckoutError, clubCheckoutMethod, clubPassPrice, endTestPass, fetchAppConfig, formatPrice, passPortalUrl } from "../../lib/checkout";
import { clubApi, knownTvLink } from "../../lib/club";
import { prepareLogo } from "../../lib/clubLogo";
import { setHostPassState } from "../../lib/hostPassStore";
import { useAccount } from "../../lib/identity";
import { copyText, haptic, platform } from "../../lib/native";
import { useHostPass } from "../../lib/useHostPass";
import { perYear } from "../pass/passText";
import { ClubMark } from "./ClubMark";
import { clubBoardLine, clubStatusLine } from "./clubModel";

const ClubCheckoutSheet = lazy(() => import("./ClubCheckoutSheet").then((m) => ({ default: m.ClubCheckoutSheet })));
const SignInSheet = lazy(() => import("../account/SignInSheet").then((m) => ({ default: m.SignInSheet })));

const SHEET_EXIT_MS = 320;

function usePayments(): PaymentConfig | null {
  const [payments, setPayments] = useState<PaymentConfig | null>(null);
  useEffect(() => {
    let live = true;
    fetchAppConfig()
      .then((c) => live && setPayments(c.payments))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  return payments;
}

export function ClubSection() {
  const { club, pass: hostPass, loaded } = useHostPass();
  const on = platform();
  const payments = usePayments();
  if (!loaded) return null;
  if (club?.active) return <ClubHolder pass={club} ios={on === "ios"} />;
  // The iOS app never offers it, prices it or links to buying it.
  if (on === "ios" || !payments) return null;
  return <ClubPitch payments={payments} pass={club} upgrade={upgradeable(hostPass, payments)} />;
}

/** A running web Annual Pass, live: the Venue add-on is added to it (a test pass just gets the test venue pass). */
function upgradeable(pass: HostPass | null, payments: PaymentConfig): boolean {
  return payments.mode === "live" && pass?.active === true && pass.provider === "stripe";
}

/** "+$80/year": what the Venue add-on adds to the Annual Pass per year. */
function addOnPrice(payments: PaymentConfig): string | null {
  const club = payments.clubPass?.priceCents;
  const host = payments.hostPass?.priceCents;
  return club && host && club > host ? `+${formatPrice(club - host, payments.currency)}/year` : null;
}

// ---- Everyone else (web): one line ----

function ClubPitch({ payments, pass, upgrade }: { payments: PaymentConfig; pass: HostPass | null; upgrade: boolean }) {
  const toast = useToast();
  const signedIn = useAccount() !== null;
  const [buyOpen, setBuyOpen] = useState(false);
  const [signInOpen, setSignInOpen] = useState(false);
  const method = clubCheckoutMethod(payments, "web");
  if (!method) return null;
  const price = clubPassPrice(payments, "web");
  const test = method === "test";

  const get = () => {
    void haptic("selection");
    if ((method === "wallet" || method === "card") && !signedIn) setSignInOpen(true);
    else setBuyOpen(true);
  };
  const signedInFor = (me: MeResponse) => {
    if (me.clubPass?.active) {
      toast.success("Your Venue add-on is on this account", "Your venue's features are on.");
      return;
    }
    setTimeout(() => setBuyOpen(true), SHEET_EXIT_MS);
  };

  return (
    <div data-testid="club-pitch" data-state={pass ? pass.status : "none"}>
      <ListGroup>
        {/* Its own row (not ListRow): the question wraps instead of being cut short. */}
        <button type="button" data-testid="club-get" onClick={get} className="pressable flex w-full items-center gap-3 px-4 py-3.5 text-left">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-400/15 text-ink-brand ring-1 ring-inset ring-brand-line/30">
            <CrownIcon size={17} strokeWidth={2.3} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-callout font-semibold leading-snug text-ink">Running squares for a bar or restaurant?</span>
            <span className="mt-0.5 block text-subhead font-bold text-ink-brand">
              {upgrade ? `Add the Venue add-on · ${addOnPrice(payments) ?? "yearly"}` : `Annual Pass + Venue · ${perYear(price)}`}
            </span>
            {test && <span className="block text-footnote text-ink-subtle">Free while checkout is in test mode</span>}
            {pass && <span className="block text-footnote text-ink-subtle">{clubStatusLine(pass)}</span>}
          </span>
          <ChevronRightIcon size={18} className="shrink-0 text-ink-subtle" />
        </button>
      </ListGroup>
      {(buyOpen || signInOpen) && (
        <Suspense fallback={null}>
          <ClubCheckoutSheet
            open={buyOpen}
            payments={payments}
            upgrade={upgrade}
            onActive={(state) => {
              setBuyOpen(false);
              if (state?.club?.active) toast.success("You've got the Venue add-on", "Name your venue and add its logo below.");
              else toast.show({ tone: "neutral", title: "Payment received", description: "Your Venue add-on is still confirming. It shows up here in a moment." });
            }}
            onSignIn={() => {
              setBuyOpen(false);
              setTimeout(() => setSignInOpen(true), SHEET_EXIT_MS);
            }}
            onClose={() => setBuyOpen(false)}
          />
          <SignInSheet
            open={signInOpen}
            onClose={() => setSignInOpen(false)}
            title="Sign in to get the Venue add-on"
            description="Your pass stays with your account, so your venue works on every device you sign in on."
            onSignedIn={signedInFor}
          />
        </Suspense>
      )}
    </div>
  );
}

// ---- The holder's club ----

function ClubHolder({ pass, ios }: { pass: HostPass; ios: boolean }) {
  const toast = useToast();
  const [settings, setSettings] = useState<ClubSettings | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [managing, setManaging] = useState(false);
  const test = pass.provider === "test";

  const load = useCallback(() => {
    setFailed(null);
    clubApi.mine().then(setSettings, (err: unknown) => setFailed(errorMessage(err)));
  }, []);
  useEffect(load, [load]);

  const manage = async () => {
    setManaging(true);
    try {
      if (test) {
        setHostPassState(await endTestPass("club"));
        toast.show({ tone: "neutral", title: "Test venue pass ended", description: "Get it again any time. It's free in test mode." });
      } else {
        window.location.assign(await passPortalUrl());
      }
    } catch (err) {
      toast.error("Couldn't open Manage", err instanceof CheckoutError || err instanceof Error ? err.message : "Try again.");
    } finally {
      setManaging(false);
    }
  };

  return (
    <div data-testid="club-section" className="flex flex-col gap-7">
      <ListGroup
        title="Venue add-on"
        footer={ios ? "Your venue's branding, co-hosts, players lists and TV link work here too." : "Every board you host for a year, venue boards included, with your venue on each."}
      >
        <ListRow
          data-testid="club-status"
          leading={settings ? <ClubMark club={settings.club} size={36} /> : <ClubCrown />}
          title={
            <span className="flex items-center gap-2">
              Annual Pass + Venue
              {test && <Badge tone="outline">Test</Badge>}
            </span>
          }
          subtitle={ios ? "Active" : clubStatusLine(pass)}
        />
        {/* Manage where it was bought, on the web only: the iOS app never links to it. */}
        {!ios && (pass.provider === "stripe" || test) && (
          <ListRow
            data-testid="club-manage"
            title={test ? "End test venue pass" : "Manage"}
            subtitle={test ? undefined : "Update your card, see receipts or cancel"}
            chevron={!test}
            onClick={managing ? undefined : () => void manage()}
            trailing={managing ? <span className="text-footnote text-ink-subtle">Opening…</span> : undefined}
          />
        )}
      </ListGroup>

      {settings ? (
        <ClubSettingsPanel settings={settings} onChange={setSettings} ios={ios} />
      ) : failed ? (
        <ListGroup title="Your venue">
          <div className="flex flex-col items-start gap-3 px-4 py-4">
            <p className="text-subhead text-ink-muted">{failed}</p>
            <Button variant="secondary" size="sm" onClick={load}>
              Try again
            </Button>
          </div>
        </ListGroup>
      ) : (
        <ListGroup title="Your venue">
          <div className="flex flex-col gap-3 px-4 py-4">
            <Skeleton className="h-13 w-full rounded-btn" />
            <Skeleton className="h-16 w-full rounded-xl" />
          </div>
        </ListGroup>
      )}
    </div>
  );
}

function ClubCrown() {
  return (
    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-400 text-ink-inverse">
      <CrownIcon size={17} strokeWidth={2.3} />
    </span>
  );
}

function ClubSettingsPanel({ settings, onChange, ios }: { settings: ClubSettings; onChange: (s: ClubSettings) => void; ios: boolean }) {
  const toast = useToast();
  const { club, boards } = settings;
  const [name, setName] = useState(club.name);
  const [saving, setSaving] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [logoBusy, setLogoBusy] = useState<"upload" | "remove" | null>(null);
  const [tvBusy, setTvBusy] = useState(false);
  const [confirmRotate, setConfirmRotate] = useState(false);
  const [tvUrl, setTvUrl] = useState<string | null>(() => knownTvLink(settings));
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => setName(club.name), [club.name]);
  useEffect(() => setTvUrl(knownTvLink(settings)), [settings]);

  const trimmed = name.replace(/\s+/g, " ").trim();
  const localProblem = clubNameProblem(trimmed);
  const dirty = trimmed !== club.name;

  const saveName = async () => {
    if (!dirty || saving) return;
    if (localProblem) return setNameError(localProblem);
    setSaving(true);
    setNameError(null);
    try {
      onChange(await clubApi.rename(trimmed));
      void haptic("success");
      toast.success(trimmed ? "Venue name saved" : "Venue name removed", trimmed ? "It shows on every board you host." : "Your boards show no venue now.");
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) setNameError(err.message);
      else toast.error("Couldn't save the name", errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const pickLogo = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setLogoBusy("upload");
    try {
      const logo = await prepareLogo(file);
      onChange(await clubApi.uploadLogo(logo));
      void haptic("success");
      toast.success("Logo saved", "It shows on your boards, TV and printouts.");
    } catch (err) {
      toast.error("Couldn't use that logo", errorMessage(err));
    } finally {
      setLogoBusy(null);
    }
  };

  const removeLogo = async () => {
    setLogoBusy("remove");
    try {
      onChange(await clubApi.removeLogo());
    } catch (err) {
      toast.error("Couldn't remove the logo", errorMessage(err));
    } finally {
      setLogoBusy(null);
    }
  };

  const makeTvLink = async () => {
    setTvBusy(true);
    setConfirmRotate(false);
    try {
      const link = await clubApi.newTvLink();
      setTvUrl(link.tvUrl);
      onChange(link);
      void haptic("success");
      toast.success(settings.tvKey ? "New TV link ready" : "TV link ready", settings.tvKey ? "The old link stopped working." : "Open it on the TV's browser.");
    } catch (err) {
      toast.error("Couldn't make a TV link", errorMessage(err));
    } finally {
      setTvBusy(false);
    }
  };

  const copyTv = async () => {
    if (!tvUrl) return;
    const outcome = await copyText(tvUrl);
    if (outcome === "copied") toast.success("TV link copied", "Open it in the TV's browser.");
  };

  return (
    <>
      <ListGroup title="Your venue" footer="Your venue's name and logo show on every board you host, its TV view, its printout and its invite. Never an amount.">
        <div className="flex flex-col gap-3 px-4 py-4">
          <TextField
            data-testid="club-name"
            label="Venue name"
            placeholder="The Rusty Anchor"
            value={name}
            maxLength={CLUB_NAME_MAX}
            counter
            error={nameError ?? (dirty && localProblem ? localProblem : undefined)}
            onChange={(e) => {
              setName(e.target.value);
              setNameError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") void saveName();
            }}
            enterKeyHint="done"
            autoComplete="organization"
          />
          {dirty && (
            <Button data-testid="club-name-save" size="sm" className="self-start" loading={saving} disabled={!!localProblem} onClick={() => void saveName()}>
              Save name
            </Button>
          )}
        </div>
        <div className="flex items-center gap-3.5 px-4 py-3.5">
          <ClubMark club={{ ...club, name: club.name || "?" }} size={56} className="ring-1 ring-line" />
          <div className="min-w-0 flex-1">
            <p className="text-callout font-bold text-ink">Logo</p>
            <p className="text-footnote text-ink-subtle">{club.hasLogo ? "Beside your venue's name" : "Square pictures work best"}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <Button
              data-testid="club-logo-upload"
              variant="secondary"
              size="sm"
              leading={<ImageIcon size={16} />}
              loading={logoBusy === "upload"}
              disabled={logoBusy !== null}
              onClick={() => fileRef.current?.click()}
            >
              {club.hasLogo ? "Replace" : "Upload"}
            </Button>
            {club.hasLogo && (
              <Button
                data-testid="club-logo-remove"
                variant="ghost"
                size="sm"
                aria-label="Remove logo"
                loading={logoBusy === "remove"}
                disabled={logoBusy !== null}
                onClick={() => void removeLogo()}
              >
                <TrashIcon size={16} />
              </Button>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => void pickLogo(e)} data-testid="club-logo-file" />
        </div>
      </ListGroup>

      <ListGroup title="Venue TV" footer="Opens your open and live boards on a TV, one every 20 seconds; a winner jumps to the front. Anyone with the link can watch, so share it only with your screens.">
        <div data-testid="club-tv" data-state={tvUrl ? "known" : settings.tvKey ? "elsewhere" : "none"} className="flex flex-col gap-3 px-4 py-4">
          <div className="flex items-start gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-surface-4 text-ink">
              <TvIcon size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-callout font-bold text-ink">TV link</p>
              {tvUrl ? (
                <p data-testid="club-tv-url" className="mt-0.5 truncate font-mono text-footnote text-ink-muted" title={tvUrl}>
                  {tvUrl.replace(/^https?:\/\//, "").replace(/#.*$/, "#…")}
                </p>
              ) : (
                <p className="mt-0.5 text-footnote text-ink-subtle">
                  {settings.tvKey ? "Made on another device. Make a new one here (the old one stops working)." : "Show your venue's boards on the TV at the bar."}
                </p>
              )}
            </div>
          </div>
          {confirmRotate ? (
            <div data-testid="club-tv-confirm" className="flex flex-col gap-2 rounded-2xl bg-surface-3 p-3 ring-1 ring-inset ring-line">
              <p className="text-footnote text-ink-muted">The old link stops working right away on every TV using it.</p>
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" onClick={() => setConfirmRotate(false)}>
                  Keep it
                </Button>
                <Button data-testid="club-tv-rotate-confirm" size="sm" loading={tvBusy} onClick={() => void makeTvLink()}>
                  Make a new link
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {tvUrl && (
                <Button data-testid="club-tv-copy" size="sm" leading={<CopyIcon size={16} />} onClick={() => void copyTv()}>
                  Copy link
                </Button>
              )}
              {tvUrl && !ios && (
                <a data-testid="club-tv-open" href={tvUrl} target="_blank" rel="noopener" className={buttonStyles({ variant: "secondary", size: "sm" })}>
                  <TvIcon size={16} />
                  Open
                </a>
              )}
              {settings.tvKey ? (
                <Button
                  data-testid="club-tv-rotate"
                  size="sm"
                  variant="secondary"
                  leading={<RefreshIcon size={16} />}
                  loading={tvBusy}
                  onClick={() => {
                    void haptic("selection");
                    setConfirmRotate(true);
                  }}
                >
                  New link
                </Button>
              ) : (
                <Button data-testid="club-tv-make" size="sm" leading={<TvIcon size={16} />} loading={tvBusy} onClick={() => void makeTvLink()}>
                  Make a TV link
                </Button>
              )}
            </div>
          )}
        </div>
      </ListGroup>

      <ListGroup title="Venue boards" footer={boards.length > 0 ? "Open and live boards you host. Finished ones drop off." : undefined}>
        {boards.length > 0 ? (
          boards.map((b) => (
            <ListRow
              key={b.id}
              data-testid="club-board"
              title={b.name}
              subtitle={clubBoardLine(b)}
              to={`/g/${b.id}`}
              trailing={<ChevronRightIcon size={18} className="text-ink-subtle" />}
              chevron={false}
            />
          ))
        ) : (
          <div className="px-4 py-4">
            <p data-testid="club-boards-empty" className="text-subhead text-ink-muted">
              No open boards right now. <Link to="/new" className="font-semibold text-ink-brand underline underline-offset-2">Make one</Link> and it shows here and on your venue TV.
            </p>
          </div>
        )}
      </ListGroup>
    </>
  );
}
