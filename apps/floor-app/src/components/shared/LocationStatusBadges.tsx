import type { HoldCategory } from '@shared/locationPolicy';
import { HOLD_LABELS } from './HoldPanel';
import { StatusBadge } from './StatusBadge';

/**
 * A location's status badge plus its Contracted and hold badges (#172) — presentational;
 * the screen passes the location fields it already fetched. Hold names come from the shared
 * HOLD_LABELS rather than a per-screen copy.
 */
export function LocationStatusBadges({ status, contraction, holdCategory, showHold = true }: {
  status: string;
  contraction: boolean;
  holdCategory: HoldCategory | string | null;
  /** False to render the hold separately (e.g. in its own row). */
  showHold?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <StatusBadge status={status} />
      {contraction && <StatusBadge status="CONTRACTED" variant="danger" />}
      {showHold && holdCategory && <HoldBadge holdCategory={holdCategory} />}
    </div>
  );
}

/** A hold category as a named danger badge ("Hold Both", …). */
export function HoldBadge({ holdCategory }: { holdCategory: HoldCategory | string }) {
  const name = HOLD_LABELS[holdCategory as HoldCategory]?.name ?? holdCategory;
  return <StatusBadge status={name} variant="danger" />;
}
