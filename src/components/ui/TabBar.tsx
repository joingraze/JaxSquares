import { useEffect, useRef, type ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { useProfile } from "../../lib/identity";
import { haptic } from "../../lib/native";
import { HomeIcon, PlusIcon } from "../icons";
import { Avatar } from "./Avatar";
import { useBottomChrome } from "./bottomChrome";
import { cx } from "./cx";

/** Distance from the bottom of the viewport to the top of the dock. */
const DOCK_TOP = "calc(var(--tabbar-h) + max(var(--safe-bottom), 0.5rem))";

export interface TabBarProps {
  hidden?: boolean;
}

/**
 * Floating bottom dock: Home, the New board keycap, and Profile (your avatar).
 * Content scrolling down fades into the canvas before it reaches the dock, so
 * nothing ghosts through it.
 */
export function TabBar({ hidden = false }: TabBarProps) {
  const ref = useRef<HTMLElement>(null);
  const profile = useProfile();
  useBottomChrome(hidden ? null : DOCK_TOP);

  useEffect(() => {
    if (ref.current) ref.current.inert = hidden;
  }, [hidden]);

  return (
    <nav
      ref={ref}
      aria-label="Main"
      aria-hidden={hidden || undefined}
      className={cx(
        "pointer-events-none fixed inset-x-0 bottom-0 z-40 px-3 transition-[transform,visibility] duration-300 ease-out-quint",
        "pb-[max(var(--safe-bottom),0.5rem)]",
        hidden && "invisible translate-y-[calc(100%+1rem)]",
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-[calc(100%+1.75rem)] bg-linear-to-t from-canvas from-55% to-transparent"
      />
      <div className="glass pointer-events-auto mx-auto flex h-(--tabbar-h) max-w-md items-center gap-1 rounded-[1.75rem] px-2 shadow-float ring-1 ring-inset ring-line-strong">
        <Tab to="/" end label="Home" icon={(active) => <HomeIcon size={24} filled={active} strokeWidth={active ? 1.6 : 2} />} />
        <NavLink
          data-testid="new-board"
          to="/new"
          onClick={() => void haptic("light")}
          className={({ isActive }) =>
            cx(
              "keycap mx-1 flex h-12 shrink-0 items-center gap-1.5 rounded-2xl bg-brand-400 pl-3.5 pr-4.5 text-callout font-extrabold text-ink-inverse [--keycap-edge:var(--color-brand-700)]",
              isActive && "translate-y-[3px] shadow-[inset_0_1px_0_rgb(255_255_255/0.2),0_1px_0_var(--color-brand-700)]",
            )
          }
        >
          <PlusIcon size={20} strokeWidth={3} />
          New board
        </NavLink>
        <Tab
          to="/me"
          label="Profile"
          icon={(active) => (
            <Avatar
              name={profile.name || "You"}
              color={profile.color}
              emoji={profile.emoji}
              size="xs"
              ring={active ? "brand" : "none"}
              decorative
            />
          )}
        />
      </div>
    </nav>
  );
}

function Tab({ to, label, icon, end }: { to: string; label: string; icon: (active: boolean) => ReactNode; end?: boolean }) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={() => void haptic("selection")}
      className={({ isActive }) =>
        cx(
          "pressable flex h-14 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-2xl",
          isActive ? "text-ink" : "text-ink-subtle hover:text-ink-muted",
        )
      }
    >
      {({ isActive }) => (
        <>
          <span key={String(isActive)} className={cx("grid h-6 place-items-center", isActive && "animate-tab-bounce text-brand-400")}>
            {icon(isActive)}
          </span>
          <span className="text-[0.6875rem] font-bold leading-none">{label}</span>
        </>
      )}
    </NavLink>
  );
}
