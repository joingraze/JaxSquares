// What the Club Pass includes, as a card: in its checkout sheet and Profile's
// pitch (web only). `price` is the web price ("$49"); the iOS app never shows it.

import type { ReactNode } from "react";
import { CheckIcon, CrownIcon } from "../../components/icons";
import { perYear } from "../pass/passText";

function Perk({ children }: { children: ReactNode }) {
  return (
    <li className="flex items-start gap-2.5">
      <span aria-hidden className="mt-px grid h-5 w-5 shrink-0 place-items-center rounded-full bg-brand-400/15 text-ink-brand">
        <CheckIcon size={12} strokeWidth={3.2} />
      </span>
      <span>{children}</span>
    </li>
  );
}

export function ClubPerks({ price, test = false }: { price: string | null; test?: boolean }) {
  return (
    <div data-testid="club-perks" className="relative overflow-hidden rounded-card bg-surface-3 p-4 ring-1 ring-inset ring-brand-line/40">
      <div aria-hidden className="pointer-events-none absolute -right-10 -top-14 h-40 w-40 rounded-full bg-[radial-gradient(closest-side,rgb(198_249_31/0.18),transparent)]" />
      <div className="relative flex items-center gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-400 text-ink-inverse shadow-[inset_0_-2px_0_rgb(0_0_0/0.18),inset_0_1px_0_rgb(255_255_255/0.4)]">
          <CrownIcon size={21} strokeWidth={2.3} />
        </span>
        <div className="min-w-0">
          <p className="font-display text-title-3 font-extrabold text-ink">Club Pass</p>
          <p className="text-subhead font-semibold text-ink-muted">{test ? "Test pass · no charge" : perYear(price)}</p>
        </div>
      </div>
      <ul className="relative mt-3.5 flex flex-col gap-2 text-subhead text-ink">
        <Perk>Everything in the Host Pass: no host fee on any board you host</Perk>
        <Perk>Your club's name and logo on your boards, TV and printouts</Perk>
        <Perk>Up to 10 co-hosts on each board</Perk>
        <Perk>Download each board's players list</Perk>
        <Perk>A TV link that rotates your boards for the bar or the break room</Perk>
      </ul>
    </div>
  );
}
