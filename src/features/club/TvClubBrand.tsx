// A club's logo and name in TV units (--u, 1% of the screen's short side): the
// TV panel's corner on an Annual Pass + Venue holder's board (TvBrand), and the club TV's
// own corner (/club/:id/tv, `corner`).

import type { ClubBrand } from "../../../shared/types";
import { cx } from "../../components/ui";
import { ClubMark } from "./ClubMark";

export function TvClubBrand({ club, corner = false }: { club: ClubBrand; corner?: boolean }) {
  return (
    <p className={cx("tv-brand min-w-0 text-ink", corner && "text-[length:calc(var(--u)*2.7)]")} data-testid={corner ? "club-tv-corner" : "tv-club"}>
      <ClubMark club={club} size="inherit" className={corner ? "h-[calc(var(--u)*5.2)] w-[calc(var(--u)*5.2)] text-[length:calc(var(--u)*2.6)]" : "h-[calc(var(--u)*4)] w-[calc(var(--u)*4)] text-[length:calc(var(--u)*2)]"} />
      <span className="min-w-0 truncate">{club.name.trim()}</span>
    </p>
  );
}
