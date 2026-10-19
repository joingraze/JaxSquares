// Inline SVG icon set (24px grid, 2px rounded strokes). Icons are decorative by
// default (aria-hidden); pass `title` when an icon carries meaning on its own.

import type { ReactNode, SVGProps } from "react";

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, "children"> {
  size?: number;
  /** Fill closed shapes with currentColor (used for active tab icons). */
  filled?: boolean;
  title?: string;
}

function make(name: string, body: ReactNode, opts: { fillable?: boolean } = {}) {
  function Icon({ size = 24, filled = false, title, strokeWidth = 2, ...rest }: IconProps) {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill={filled && opts.fillable ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden={title ? undefined : true}
        role={title ? "img" : undefined}
        focusable="false"
        {...rest}
      >
        {title && <title>{title}</title>}
        {body}
      </svg>
    );
  }
  Icon.displayName = `${name}Icon`;
  return Icon;
}

export const HomeIcon = make(
  "Home",
  <path d="M3.5 10.2 12 3.2l8.5 7V20a1 1 0 0 1-1 1H15v-5a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v5H4.5a1 1 0 0 1-1-1z" />,
  { fillable: true },
);
export const PlusIcon = make("Plus", <path d="M12 5v14M5 12h14" />);
export const MinusIcon = make("Minus", <path d="M5 12h14" />);
export const UserIcon = make(
  "User",
  <>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21a8 8 0 0 1 16 0" />
  </>,
  { fillable: true },
);
export const UsersIcon = make(
  "Users",
  <>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
    <path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18.5 14.2A6.5 6.5 0 0 1 21.5 20" />
  </>,
);
export const BellIcon = make(
  "Bell",
  <>
    <path d="M6 9a6 6 0 1 1 12 0c0 6 2.5 8 2.5 8h-17S6 15 6 9" />
    <path d="M10.2 20.5a2 2 0 0 0 3.6 0" />
  </>,
  { fillable: true },
);
export const BellOffIcon = make(
  "BellOff",
  <>
    <path d="M8.2 4.2A6 6 0 0 1 18 9c0 2.6.5 4.4 1 5.6M17 17H3.5S6 15 6 9c0-.6.1-1.2.2-1.7" />
    <path d="M10.2 20.5a2 2 0 0 0 3.6 0M3 3l18 18" />
  </>,
);
export const ShareIcon = make(
  "Share",
  <>
    <path d="M12 3v12M8 7l4-4 4 4" />
    <path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1" />
  </>,
);
export const CopyIcon = make(
  "Copy",
  <>
    <rect x="8" y="8" width="13" height="13" rx="2.5" />
    <path d="M16 8V5.5A2.5 2.5 0 0 0 13.5 3h-8A2.5 2.5 0 0 0 3 5.5v8A2.5 2.5 0 0 0 5.5 16H8" />
  </>,
);
export const LinkIcon = make(
  "Link",
  <>
    <path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1" />
    <path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1" />
  </>,
);
export const CheckIcon = make("Check", <path d="m5 12.5 4.5 4.5L19 7.5" />);
export const XIcon = make("X", <path d="M6 6l12 12M18 6 6 18" />);
export const ChevronLeftIcon = make("ChevronLeft", <path d="m15 18-6-6 6-6" />);
export const ChevronRightIcon = make("ChevronRight", <path d="m9 18 6-6-6-6" />);
export const ChevronDownIcon = make("ChevronDown", <path d="m6 9 6 6 6-6" />);
export const ChevronUpIcon = make("ChevronUp", <path d="m6 15 6-6 6 6" />);
export const ArrowRightIcon = make("ArrowRight", <path d="M5 12h14M13 6l6 6-6 6" />);
export const TrophyIcon = make(
  "Trophy",
  <>
    <path d="M8 3.5h8V9a4 4 0 0 1-8 0z" />
    <path d="M8 5.5H5.5a1 1 0 0 0-1 1A4 4 0 0 0 8 10.4M16 5.5h2.5a1 1 0 0 1 1 1 4 4 0 0 1-3.5 3.9" />
    <path d="M12 13v3.5M8.5 20.5h7M9.5 20.5c0-2 1-4 2.5-4s2.5 2 2.5 4" />
  </>,
  { fillable: true },
);
export const FootballIcon = make(
  "Football",
  <>
    <path d="M5.3 18.7c-2.4-2.4-1.5-8.6 2.4-12.5s10.1-4.8 12.5-2.4 1.5 8.6-2.4 12.5-10.1 4.8-12.5 2.4z" />
    <path d="m9.5 14.5 5-5M10.3 12.3l1.4 1.4M11.3 11.3l1.4 1.4M12.3 10.3l1.4 1.4" />
    <path d="M4.6 13.6l5.8 5.8M13.6 4.6l5.8 5.8" opacity="0.55" />
  </>,
);
export const GridIcon = make(
  "Grid",
  <>
    <rect x="3" y="3" width="18" height="18" rx="3.5" />
    <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
  </>,
);
export const LockIcon = make(
  "Lock",
  <>
    <rect x="4" y="10.5" width="16" height="10.5" rx="2.5" />
    <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
  </>,
  { fillable: true },
);
export const UnlockIcon = make(
  "Unlock",
  <>
    <rect x="4" y="10.5" width="16" height="10.5" rx="2.5" />
    <path d="M8 10.5V7.5a4 4 0 0 1 7.8-1.2" />
  </>,
);
export const ClockIcon = make(
  "Clock",
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </>,
);
export const CalendarIcon = make(
  "Calendar",
  <>
    <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
    <path d="M3.5 10h17M8 3v4M16 3v4" />
  </>,
);
export const SlidersIcon = make(
  "Sliders",
  <>
    <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
    <circle cx="15" cy="7" r="2" />
    <circle cx="9" cy="17" r="2" />
  </>,
);
export const PencilIcon = make(
  "Pencil",
  <>
    <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z" />
    <path d="m13.5 6.5 4 4" />
  </>,
);
export const TrashIcon = make(
  "Trash",
  <>
    <path d="M4 7h16M10 11v6M14 11v6M9 7V4.5h6V7" />
    <path d="m6 7 .9 12.1A2 2 0 0 0 8.9 21h6.2a2 2 0 0 0 2-1.9L18 7" />
  </>,
);
export const InfoIcon = make(
  "Info",
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5.5M12 7.5h.01" />
  </>,
);
export const AlertIcon = make(
  "Alert",
  <>
    <path d="M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
    <path d="M12 9v4.5M12 17.2h.01" />
  </>,
);
export const RefreshIcon = make(
  "Refresh",
  <>
    <path d="M20 11a8 8 0 0 0-14.3-4.9L4 8" />
    <path d="M4 3.5V8h4.5M4 13a8 8 0 0 0 14.3 4.9L20 16" />
    <path d="M20 20.5V16h-4.5" />
  </>,
);
export const ShuffleIcon = make(
  "Shuffle",
  <>
    <path d="M16 3.5h4.5V8M4 20 20.5 3.5M20.5 16v4.5H16M15 15l5.5 5.5M4 4l5 5" />
  </>,
);
export const SparklesIcon = make(
  "Sparkles",
  <>
    <path d="M10 3.5 11.6 8a3 3 0 0 0 1.9 1.9L18 11.5l-4.5 1.6a3 3 0 0 0-1.9 1.9L10 19.5 8.4 15a3 3 0 0 0-1.9-1.9L2 11.5l4.5-1.6A3 3 0 0 0 8.4 8z" />
    <path d="M18.5 3v4M16.5 5h4" />
  </>,
  { fillable: true },
);
export const StarIcon = make(
  "Star",
  <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9z" />,
  { fillable: true },
);
export const CrownIcon = make(
  "Crown",
  <>
    <path d="m3 7.5 4.5 4L12 5l4.5 6.5 4.5-4-2 11H5z" />
    <path d="M5.5 21h13" />
  </>,
  { fillable: true },
);
export const GiftIcon = make(
  "Gift",
  <>
    <rect x="3.5" y="7.5" width="17" height="4.5" rx="1" />
    <path d="M5 12v7.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V12M12 7.5v13" />
    <path d="M12 7.5S10.8 3.5 8.3 3.5a2 2 0 0 0 0 4M12 7.5s1.2-4 3.7-4a2 2 0 0 1 0 4" />
  </>,
);
/** An envelope: an invite to someone else's board. */
export const MailIcon = make(
  "Mail",
  <>
    <rect x="3" y="5.5" width="18" height="13" rx="2.2" />
    <path d="m3.8 7 8.2 6.2L20.2 7" />
  </>,
);
export const MoreIcon = make(
  "More",
  <>
    <circle cx="5.5" cy="12" r="1.25" fill="currentColor" />
    <circle cx="12" cy="12" r="1.25" fill="currentColor" />
    <circle cx="18.5" cy="12" r="1.25" fill="currentColor" />
  </>,
);
export const SearchIcon = make(
  "Search",
  <>
    <circle cx="11" cy="11" r="7" />
    <path d="m20.5 20.5-4.5-4.5" />
  </>,
);
export const FlagIcon = make(
  "Flag",
  <>
    <path d="M5 21V4M5 4.5s1.5-1 4-1 4 2 6.5 2 3.5-1 3.5-1v9.5s-1 1-3.5 1-4-2-6.5-2-4 1-4 1" />
  </>,
);
export const EyeIcon = make(
  "Eye",
  <>
    <path d="M2.5 12S6 5 12 5s9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7" />
    <circle cx="12" cy="12" r="3" />
  </>,
);
export const LiveIcon = make(
  "Live",
  <>
    <circle cx="12" cy="12" r="2" fill="currentColor" />
    <path d="M8.2 15.8a5.4 5.4 0 0 1 0-7.6M15.8 8.2a5.4 5.4 0 0 1 0 7.6M5.3 18.7a9.5 9.5 0 0 1 0-13.4M18.7 5.3a9.5 9.5 0 0 1 0 13.4" />
  </>,
);
export const WifiOffIcon = make(
  "WifiOff",
  <>
    <path d="M12 19.5h.01M8.6 16a5 5 0 0 1 6.8 0M5 12.5a10 10 0 0 1 4.2-2.3M14.8 10.2A10 10 0 0 1 19 12.5M2 9a15 15 0 0 1 3.6-2.4M11 5a15 15 0 0 1 11 4M3 3l18 18" />
  </>,
);
export const MoonIcon = make("Moon", <path d="M20 14.6A8.2 8.2 0 0 1 9.4 4a8.2 8.2 0 1 0 10.6 10.6Z" />, { fillable: true });
export const SunIcon = make(
  "Sun",
  <>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4" />
  </>,
);
export const PhoneIcon = make(
  "Phone",
  <>
    <rect x="6.5" y="2.5" width="11" height="19" rx="2.8" />
    <path d="M10.5 18.5h3" />
  </>,
);
/** Jax's paw print. */
export const PawIcon = make(
  "Paw",
  <>
    <path d="M12 12.5c-2.9 0-5.5 2.6-5.5 4.9 0 1.6 1.3 2.4 2.8 2.4 1.1 0 1.7-.6 2.7-.6s1.6.6 2.7.6c1.5 0 2.8-.8 2.8-2.4 0-2.3-2.6-4.9-5.5-4.9Z" />
    <ellipse cx="5.2" cy="10" rx="1.7" ry="2.2" />
    <ellipse cx="9" cy="5.6" rx="1.8" ry="2.4" />
    <ellipse cx="15" cy="5.6" rx="1.8" ry="2.4" />
    <ellipse cx="18.8" cy="10" rx="1.7" ry="2.2" />
  </>,
  { fillable: true },
);
export const TvIcon = make(
  "Tv",
  <>
    <rect x="2.5" y="4.5" width="19" height="13" rx="2.5" />
    <path d="M8 21h8M12 17.5V21" />
  </>,
);
export const PrinterIcon = make(
  "Printer",
  <>
    <path d="M7 8.5V3.5h10v5" />
    <path d="M7 17.5H5a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
    <path d="M7 14h10v6.5H7z" />
    <path d="M17 11.5h.01" />
  </>,
);
export const ExpandIcon = make("Expand", <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />);
export const ShrinkIcon = make("Shrink", <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />);
