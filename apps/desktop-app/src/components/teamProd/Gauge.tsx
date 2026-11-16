interface GaugeProps {
  label: string;
  /** Percent; null renders an empty, labelled bar. */
  percent: number | null;
  /** The figures behind the percent, shown beside it. */
  detail: string;
  /** Bars fill to 100%; anything past shows as a full bar with the real number. */
  goodAt?: number;
}

/**
 * A labelled progress bar for Team Prod Summary (#147): the percent and the figures it
 * comes from side by side, so nobody has to do the math. Green at or above `goodAt`
 * (default 100), amber from 85, red below.
 */
export function Gauge({ label, percent, detail, goodAt = 100 }: GaugeProps) {
  const color =
    percent == null
      ? 'var(--border-strong)'
      : percent >= goodAt
        ? 'var(--success)'
        : percent >= goodAt * 0.85
          ? 'var(--warning)'
          : 'var(--error)';
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="font-semibold uppercase tracking-wider text-[var(--text-muted)]">
          {label}
        </span>
        <span
          className="font-data text-sm font-semibold"
          style={{ color: percent == null ? undefined : color }}
        >
          {percent == null ? '—' : `${Math.round(percent)}%`}
        </span>
      </div>
      <div
        className="h-2 overflow-hidden rounded bg-[var(--surface-6)]"
        role="progressbar"
        aria-label={label}
        aria-valuenow={percent == null ? undefined : Math.round(percent)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full rounded"
          style={{ width: `${Math.min(100, Math.max(0, percent ?? 0))}%`, backgroundColor: color }}
        />
      </div>
      <span className="font-data text-[11px] text-[var(--text-muted)]">{detail}</span>
    </div>
  );
}
