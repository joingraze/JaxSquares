// A club's branding as the app shows it (docs/payments.md "Club Pass"): its
// logo (or its initial on gold when it has none) and "Hosted by <club>". Only
// for a named club (shownClub): a holder who hasn't named theirs shows nothing.

import { shownClub } from "../../../shared/clubs";
import type { ClubBrand, Game } from "../../../shared/types";
import { cx } from "../../components/ui";
import { logoSrc } from "./clubModel";

/** The club's logo, or its initial on gold. `size` in px (or "inherit" to size it with CSS). */
export function ClubMark({ club, size = 32, className }: { club: ClubBrand; size?: number | "inherit"; className?: string }) {
  const src = logoSrc(club);
  const box = size === "inherit" ? undefined : { width: size, height: size };
  if (src) {
    return (
      <img
        src={src}
        alt=""
        width={size === "inherit" ? undefined : size}
        height={size === "inherit" ? undefined : size}
        decoding="async"
        data-testid="club-logo"
        className={cx("shrink-0 rounded-[22%] bg-white object-contain", className)}
        style={box}
      />
    );
  }
  const initial = [...club.name.trim()][0]?.toLocaleUpperCase() ?? "?";
  return (
    <span
      aria-hidden
      data-testid="club-initial"
      className={cx("grid shrink-0 place-items-center rounded-[22%] bg-gold-400 font-display font-extrabold text-ink-inverse", className)}
      style={size === "inherit" ? undefined : { ...box, fontSize: Math.round(size * 0.5) }}
    >
      {initial}
    </span>
  );
}

/** "Hosted by <club>" with its logo, at the top of a Club Pass holder's board (and its invite view). */
export function ClubBanner({ game, className }: { game: Pick<Game, "club">; className?: string }) {
  const club = shownClub(game.club);
  if (!club) return null;
  return (
    <div
      data-testid="club-banner"
      className={cx("flex min-w-0 items-center gap-2.5 rounded-2xl bg-surface-2 py-1.5 pl-1.5 pr-3.5 ring-1 ring-inset ring-line shadow-card", className)}
    >
      <ClubMark club={club} size={30} />
      <p className="min-w-0 truncate text-subhead text-ink-muted">
        Hosted by <b className="font-bold text-ink">{club.name.trim()}</b>
      </p>
    </div>
  );
}
