export type StatusVariant = 'neutral' | 'good' | 'warning' | 'danger' | 'info';

const VARIANT_STYLES: Record<StatusVariant, string> = {
  neutral: 'bg-[#1A1A1A] text-[#9A9A9A] border-[#3A3A3A]',
  good:    'bg-[#003300] text-[#33CC33] border-[#006600]',
  warning: 'bg-[#332600] text-[#DDAA00] border-[#664D00]',
  danger:  'bg-[#330000] text-[#FF4444] border-[#660000]',
  info:    'bg-[#001A33] text-[#4499FF] border-[#003366]',
};

// Best-effort default coloring across LocationStatus, PalletStatus, and LabelStatus
// (see Documentation/Flowcharts-ERDs/enums.mmd) — callers can always override via the
// `variant` prop when a specific screen needs different semantics for the same status.
const KNOWN_VARIANTS: Record<string, StatusVariant> = {
  EMPTY: 'good',
  AVAILABLE: 'good',
  STORED: 'neutral',
  STAGED: 'neutral',
  PRINTED: 'neutral',
  PULLED: 'neutral',
  RESERVED: 'warning',
  PULL_PENDING: 'warning',
  CA_PULL_PEND: 'warning',
  FP_PULL_PEND: 'warning',
  PUT_PENDING: 'warning',
  DIVERTED: 'warning',
  CANCELED: 'danger',
  PURGED: 'danger',
  CONSOLIDATED: 'neutral',
  HOLD_IN: 'danger',
  HOLD_OUT: 'danger',
  HOLD_BOTH: 'danger',
  HOLD_PERM: 'danger',
};

/** Looks up a reasonable default color variant for a known status string. */
export function statusVariant(status: string): StatusVariant {
  return KNOWN_VARIANTS[status] ?? 'neutral';
}

interface StatusBadgeProps {
  status: string;
  variant?: StatusVariant;
}

/**
 * Generic status pill shared across Pallet, Location, and Label status displays —
 * deferred from Phase 5.2, built in Phase 9.0. Defaults to `statusVariant(status)`'s
 * best guess; pass `variant` explicitly when a screen needs different semantics
 * (e.g. a status that reads as informational in one context and risky in another).
 */
export function StatusBadge({ status, variant }: StatusBadgeProps) {
  const resolved = variant ?? statusVariant(status);
  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 rounded-[6px] border font-ui text-[13px] font-semibold uppercase tracking-wider ${VARIANT_STYLES[resolved]}`}
    >
      {status.replace(/_/g, ' ')}
    </span>
  );
}
