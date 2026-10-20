import { cx } from "./cx";

/** The mark: a 3x3 board with the winning square lit. */
export function LogoMark({ size = 32, className }: { size?: number; className?: string }) {
  const cells = [0, 1, 2];
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden className={cx("shrink-0", className)}>
      <rect width="32" height="32" rx="9" fill="var(--color-pitch-950)" />
      {cells.flatMap((r) =>
        cells.map((c) => {
          const lit = r === 1 && c === 2;
          return (
            <rect
              key={`${r}${c}`}
              x={4 + c * 8.3}
              y={4 + r * 8.3}
              width="7.2"
              height="7.2"
              rx="2"
              fill={lit ? "var(--color-gold-400)" : (r + c) % 2 ? "var(--color-brand-500)" : "var(--color-brand-400)"}
            />
          );
        }),
      )}
    </svg>
  );
}

/** Wordmark for the home header and splash moments. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-2", className)}>
      <LogoMark size={28} />
      <span className="font-display text-title-3 font-extrabold tracking-[-0.03em]">
        Jax<span className="text-ink-brand">Squares</span>
      </span>
    </span>
  );
}
