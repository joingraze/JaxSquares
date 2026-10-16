import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ChevronLeftIcon } from "../icons";
import { cx } from "./cx";
import { IconButton } from "./IconButton";

export interface TopBarProps {
  title: string;
  /** Muted line under the large title. */
  subtitle?: ReactNode;
  /** iOS large title that collapses into the bar as you scroll (default). false = compact bar only. */
  large?: boolean;
  /** Custom large-title content (e.g. the wordmark on Home); `title` still names the page. */
  largeTitle?: ReactNode;
  /** Back button. A path navigates there; true goes back, or home when the page was opened directly. */
  back?: boolean | string;
  leading?: ReactNode;
  trailing?: ReactNode;
  /** Extra content under the large title (chips, a segmented control). */
  children?: ReactNode;
  className?: string;
}

export function TopBar({ title, subtitle, large = true, largeTitle, back, leading, trailing, children, className }: TopBarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const barRef = useRef<HTMLElement>(null);
  const largeRef = useRef<HTMLHeadingElement>(null);
  const [collapsed, setCollapsed] = useState(!large);

  useEffect(() => {
    if (!large) {
      setCollapsed(true);
      return;
    }
    let frame = 0;
    const measure = () => {
      frame = 0;
      const bar = barRef.current;
      const heading = largeRef.current;
      if (!bar || !heading) return;
      const barBottom = bar.getBoundingClientRect().bottom;
      setCollapsed(heading.getBoundingClientRect().bottom - 6 <= barBottom);
      // iOS overscroll at the top: the large title grows a little, like native.
      const pull = -window.scrollY;
      heading.style.transform = pull > 0 ? `scale(${1 + Math.min(0.1, pull / 700)})` : "";
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [large]);

  const goBack = () => {
    if (typeof back === "string") navigate(back);
    else if (location.key !== "default") navigate(-1);
    else navigate("/", { replace: true });
  };

  const CompactTitle = large ? "div" : "h1";

  return (
    <>
      <header
        ref={barRef}
        className={cx(
          "sticky top-0 z-30 pt-safe transition-[background-color,box-shadow,backdrop-filter] duration-200",
          // Solid once content scrolls under it: nothing ghosts through behind the title.
          collapsed ? "bar-solid" : "bg-transparent",
          className,
        )}
      >
        <div className="relative flex h-(--topbar-h) items-center gap-1 px-2">
          <div className="relative z-10 flex min-w-11 items-center gap-1">
            {back && <IconButton label="Back" icon={<ChevronLeftIcon size={26} strokeWidth={2.4} />} onClick={goBack} />}
            {leading}
          </div>
          <CompactTitle
            aria-hidden={large ? true : undefined}
            className={cx(
              "pointer-events-none absolute inset-x-20 truncate text-center text-headline font-extrabold tracking-[-0.01em] text-ink transition-[opacity,transform] duration-200",
              collapsed ? "translate-y-0 opacity-100" : "translate-y-1.5 opacity-0",
            )}
          >
            {title}
          </CompactTitle>
          <div className="relative z-10 ml-auto flex items-center gap-1">{trailing}</div>
        </div>
      </header>
      {large && (
        <div className="px-4 pb-3 pt-1">
          <h1 ref={largeRef} className="origin-left font-display text-title-1 font-extrabold text-ink will-change-transform">
            {largeTitle ?? title}
          </h1>
          {subtitle && <p className="mt-1.5 text-subhead text-ink-muted">{subtitle}</p>}
          {children && <div className="mt-4">{children}</div>}
        </div>
      )}
    </>
  );
}
