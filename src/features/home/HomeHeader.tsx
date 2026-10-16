// Home's header, shared by the dashboard, its loading skeleton and the error
// state so the page never changes shape while content fills in: logo, the
// bell, "Hey <name>", and the headline (a two-line placeholder while loading).
//
// The compact bar turns solid once it collapses (the shared glass lets cards
// ghost through the title), with the bar's hairline underneath.

import type { ReactNode } from "react";
import { BellIcon } from "../../components/icons";
import { cx, IconButton, LogoMark, Skeleton, TopBar } from "../../components/ui";
import type { Headline } from "./sections";

export interface HomeHeaderProps {
  name: string;
  /** null: still loading (shows a placeholder the same size as a two-line headline). */
  headline: Headline | null;
  /** The bell (or anything else on the right). Defaults to an inert bell so the layout matches. */
  trailing?: ReactNode;
  /** Bump to replay the headline's entrance (e.g. a win landing while it's on screen). */
  pulse?: number;
}

export function HomeHeader({ name, headline, trailing, pulse = 0 }: HomeHeaderProps) {
  return (
    <TopBar
      title="Home"
      leading={<LogoMark size={30} className="ml-2.5" />}
      trailing={trailing ?? <IconButton label="Activity" icon={<BellIcon size={22} />} disabled />}
      className="[&.glass]:bg-[rgb(10_17_13)]"
      largeTitle={
        <span className="block">
          <span className="mb-1.5 block font-sans text-subhead font-bold tracking-normal text-ink-muted">{name ? `Hey ${name}` : "Hey there"}</span>
          {headline ? (
            <span key={pulse} className={cx("block text-balance", pulse > 0 && "home-headline-win")}>
              {headline.lead}{" "}
              <span className={cx(headline.tone === "win" ? "text-foil" : headline.tone === "live" ? "text-live-400" : "text-brand-400")}>
                {headline.hot}
              </span>
            </span>
          ) : (
            // Two lines at the headline's own line height, so the cards below don't move when it arrives.
            <span aria-hidden className="block">
              <span className="flex h-[1.06em] items-center">
                <Skeleton className="h-[0.8em] w-[78%] rounded-xl" />
              </span>
              <span className="flex h-[1.06em] items-center">
                <Skeleton className="h-[0.8em] w-[56%] rounded-xl" />
              </span>
            </span>
          )}
        </span>
      }
    />
  );
}
