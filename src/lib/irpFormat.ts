/**
 * Shared formatting for IRP's summary and hour-by-hour zoom-in views — both render the
 * exact same per-function field set (see DevNotes/DesignPrompts/IRP.md's Row Layout
 * section), just inside a different row wrapper (function name vs. hour range). Rendering
 * itself lives in src/components/shared/IRPFields.tsx.
 */

export interface FunctionFieldValues {
  functionCode: string;
  locations: number | null;
  cartons: number | null;
  pallets: number | null;
  puts: number | null;
  density: number | null;
  ratePerHour: number | null;
  pctToGoal: number | null;
  hours: number;
  hoursOfWork: number | null;
}

export const FUNCTION_META: Record<string, { name: string }> = {
  CA:  { name: 'Carton Air' },
  CF:  { name: 'Carton Floor' },
  FP:  { name: 'Full Pallet' },
  BKP: { name: 'Breakpack' },
  BK:  { name: 'Bulk' },
  RP:  { name: 'Rack Puts' },
  HP:  { name: 'Hand Puts (XS)' },
  GPM: { name: 'GPM Staging' },
  CON: { name: 'Consolidation' },
};

/** Formats an ISO timestamp as "6:00AM" — spec's Data Window Indicator format. */
export function fmtClock(iso: string): string {
  const d = new Date(iso);
  const h24 = d.getHours();
  const period = h24 < 12 ? 'AM' : 'PM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${h12}:${min}${period}`;
}

/** 1-decimal formatting for density/rate/hours figures, per spec's Formatting rule. */
export function fmt1(n: number | null): string {
  return n == null ? '—' : n.toFixed(1);
}

export function fmtPct(n: number | null): string {
  return n == null ? '—' : `${Math.round(n * 100)}%`;
}

/** Red-to-green performance gradient class for a starred field's background; grey/neutral
 *  for "no data" (spec's explicit distinction between "0% performance" and "no data yet"). */
export function goalBg(pct: number | null): string {
  if (pct == null) return 'bg-[#2A2A2A] text-[#9A9A9A]';
  const clamped = Math.max(0, Math.min(1, pct));
  if (clamped >= 1) return 'bg-[#1B5E20] text-white';
  if (clamped >= 0.75) return 'bg-[#4C7A1F] text-white';
  if (clamped >= 0.5) return 'bg-[#8A7A1A] text-white';
  if (clamped >= 0.25) return 'bg-[#8A5A1A] text-white';
  return 'bg-[#7A2A1A] text-white';
}
