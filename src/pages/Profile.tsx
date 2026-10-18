// Profile (/me): who I am on the boards (name, sticker, color, with a live
// preview square), my notifications (one card for every state), what each
// board will ping about next (with per-board mutes), host links and About.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { LockIcon, MoonIcon, PawIcon, PencilIcon, PhoneIcon, SunIcon, TrophyIcon } from "../components/icons";
import { Button, Card, ListGroup, ListRow, SegmentedControl, TopBar, cx, useToast, type SegmentOption } from "../components/ui";
import { appVersion, WEB_VERSION } from "../features/notifications/profile/appVersion";
import { HostLinksSheet } from "../features/notifications/profile/HostLinksSheet";
import { LookSheet } from "../features/notifications/profile/LookSheet";
import { BoardPings } from "../features/notifications/profile/BoardPings";
import { NotificationsCard } from "../features/notifications/profile/NotificationsCard";
import { boardsToSync, lookChanged, statsOf, syncLook, tagline, type MyStats } from "../features/notifications/profile/profileSync";
import { SquarePreview } from "../features/notifications/profile/SquarePreview";
import { pushIsOn, usePushStatus } from "../features/notifications/usePushStatus";
import { api } from "../lib/api";
import { pluralize } from "../lib/format";
import { getProfile, useProfile, type Profile as Look } from "../lib/identity";
import { isMyBoard, useMyGames } from "../lib/live";
import { setThemePreference, useResolvedTheme, useThemePreference, type ThemePreference } from "../lib/theme";

export default function Profile() {
  const profile = useProfile();
  const toast = useToast();
  // Only boards I'm on: an invite I only opened isn't mine to sync a look to, mute or count.
  const { games: all } = useMyGames();
  const games = useMemo(() => all?.filter(isMyBoard) ?? null, [all]);
  const push = usePushStatus();
  const [lookOpen, setLookOpen] = useState(false);
  const [hostOpen, setHostOpen] = useState(false);
  const [version, setVersion] = useState(WEB_VERSION);

  useEffect(() => {
    let alive = true;
    void appVersion().then((v) => alive && setVersion(v));
    return () => {
      alive = false;
    };
  }, []);

  // ---- editing my look: save as you go, then update the boards I'm on ----
  const before = useRef<Look | null>(null);
  const gamesRef = useRef(games);
  gamesRef.current = games;

  const openLook = useCallback(() => {
    before.current = getProfile();
    setLookOpen(true);
  }, []);

  const closeLook = useCallback(() => {
    setLookOpen(false);
    const prev = before.current;
    before.current = null;
    const next = getProfile();
    if (!prev || !lookChanged(prev, next) || !next.name.trim()) return;
    const ids = boardsToSync(gamesRef.current ?? []);
    if (ids.length === 0) return;
    void syncLook(ids, next, (id, input) => api.join(id, input)).then(({ updated, failed }) => {
      if (updated > 0) {
        toast.show({ tone: "success", title: "Looking good", description: `Updated on ${pluralize(updated, "board")}.`, haptic: false });
      } else if (failed > 0) {
        toast.error("Couldn't update your boards", "Check your connection, then edit your look again.");
      }
    });
  }, [toast]);

  const stats = games ? statsOf(games) : null;
  const named = profile.name.trim().length > 0;
  const hostsAny = (games ?? []).some((g) => g.isHost);

  return (
    <>
      <TopBar title="Profile" large={false} />
      <div className="flex flex-col gap-7 px-safe pt-3">
        <Hero profile={profile} stats={stats} named={named} onEdit={openLook} />

        <NotificationsCard status={push} games={games} />

        {pushIsOn(push) && games && <BoardPings games={games} />}

        <ListGroup title="Hosting">
          <ListRow
            leading={
              <span className="grid h-9 w-9 place-items-center rounded-full bg-gold-400/12 text-ink-gold ring-1 ring-inset ring-gold-line/25">
                <LockIcon size={17} />
              </span>
            }
            title="Host links"
            subtitle={hostsAny ? "Run your boards from another phone" : "How hosting works without an account"}
            onClick={() => setHostOpen(true)}
            chevron
          />
        </ListGroup>

        <Appearance />

        <ListGroup
          title="About"
          footer={
            <>
              JaxSquares {version} · Squares for bragging rights. No money changes hands, ever.
              <Link to="/support#meet-jax" className="mt-0.5 flex w-fit items-center gap-1.5 py-2 font-semibold text-ink-muted hover:text-ink">
                <PawIcon size={13} filled strokeWidth={0} className="shrink-0" />
                Named after Jax, our chief squares officer.
              </Link>
            </>
          }
        >
          <ListRow title="Support" subtitle="Questions, bugs and ideas" to="/support" />
          <ListRow title="Privacy" to="/privacy" />
          <ListRow title="Terms" to="/terms" />
        </ListGroup>
      </div>

      <LookSheet open={lookOpen} onClose={closeLook} />
      <HostLinksSheet open={hostOpen} onClose={() => setHostOpen(false)} games={games ?? []} />
    </>
  );
}

function Hero({ profile, stats, named, onEdit }: { profile: Look; stats: MyStats | null; named: boolean; onEdit: () => void }) {
  return (
    <Card padding="none" className="relative">
      {/* A wash of my color behind the board slice. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-44 opacity-30"
        style={{ background: `radial-gradient(60% 80% at 50% 0%, ${profile.color}, transparent 75%)` }}
      />
      <button
        type="button"
        onClick={onEdit}
        aria-label="Edit your look"
        className="pressable relative block w-full px-5 pt-6"
        data-testid="profile-edit"
      >
        <SquarePreview profile={profile} size={40} />
      </button>
      <div className="relative flex flex-col items-center px-5 pb-5 pt-3.5 text-center">
        <h2 className={cx("max-w-full truncate font-display text-title-1 font-extrabold", named ? "text-ink" : "text-ink-muted")}>
          {named ? profile.name : "Who's playing?"}
        </h2>
        <p className="mt-1 max-w-[19rem] text-subhead text-ink-muted">{tagline(stats, named)}</p>
        <Button
          variant={named ? "secondary" : "primary"}
          size={named ? "sm" : "md"}
          className="mt-3.5"
          leading={<PencilIcon size={16} />}
          onClick={onEdit}
        >
          {named ? "Edit look" : "Pick your name & sticker"}
        </Button>
      </div>
      {named && (
        <dl className="relative grid grid-cols-3 border-t border-line">
          <Stat label="Boards" value={stats?.boards} />
          <Stat label="Squares" value={stats?.squares} />
          <Stat label="Wins" value={stats?.wins} gold />
        </dl>
      )}
    </Card>
  );
}

const THEME_OPTIONS: readonly SegmentOption<ThemePreference>[] = [
  { value: "dark", label: "Dark", icon: <MoonIcon />, testId: "theme-dark" },
  { value: "light", label: "Light", icon: <SunIcon />, testId: "theme-light" },
  { value: "system", label: "System", icon: <PhoneIcon />, testId: "theme-system" },
];

/** Dark (the game-night default), light, or match the phone. Switches on tap; saved on this device. */
function Appearance() {
  const preference = useThemePreference();
  const resolved = useResolvedTheme();
  return (
    <ListGroup
      title="Appearance"
      footer={preference === "system" ? `Matching your phone: ${resolved} right now.` : "System matches your phone's light or dark setting."}
    >
      <div className="px-3 py-3">
        <SegmentedControl aria-label="Theme" options={THEME_OPTIONS} value={preference} onChange={setThemePreference} />
      </div>
    </ListGroup>
  );
}

function Stat({ label, value, gold }: { label: string; value: number | undefined; gold?: boolean }) {
  const lit = gold && (value ?? 0) > 0;
  return (
    <div className="flex flex-col items-center py-3.5 [&+&]:border-l [&+&]:border-line">
      <dd className={cx("flex items-center gap-1 font-display text-title-3 font-extrabold tabular-nums", lit ? "text-ink-gold" : "text-ink")}>
        {lit && <TrophyIcon size={16} filled />}
        {value === undefined ? "–" : value.toLocaleString("en-US")}
      </dd>
      <dt className="eyebrow mt-0.5 text-ink-subtle">{label}</dt>
    </div>
  );
}
