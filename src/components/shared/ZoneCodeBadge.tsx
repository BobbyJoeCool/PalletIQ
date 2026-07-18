import { STORAGE_CODE_COLOR_FALLBACK, STORAGE_CODE_COLORS } from '../../lib/storageCodeColors';

/**
 * One Storage Code-Size's empty/staged counts as a color-coded pill (e.g. "CR-M: 5(2)"),
 * replacing the plain label-plus-`CellValue` row previously used in STG's and ELZ's Zone
 * Summary panels. Color matches `AisleGrid`'s own per-Storage-Code palette so a badge reads
 * as the same "type" as its cells on the map beside it. `compact` (STG's narrower summary
 * column, meant to lay badges out horizontally to save space) is smaller than `default`
 * (ELZ's own wider summary panel).
 */
export function ZoneCodeBadge({
  storageCode, size, empty, staged, badgeSize = 'default',
}: { storageCode: string; size: string; empty: number; staged: number; badgeSize?: 'compact' | 'default' }) {
  if (empty === 0 && staged === 0) return null;
  const color = STORAGE_CODE_COLORS[storageCode] ?? STORAGE_CODE_COLOR_FALLBACK;
  const padding = badgeSize === 'compact' ? 'px-2 py-0.5' : 'px-3 py-1.5';
  const textSize = badgeSize === 'compact' ? 'text-[11px]' : 'text-[14px]';

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border font-data font-semibold whitespace-nowrap ${padding} ${textSize}`}
      style={{ borderColor: color, backgroundColor: `${color}22`, color }}
    >
      {storageCode}-{size}:
      <span className="text-white">
        {empty > 0 && empty}
        {staged > 0 && <span className="text-[#9A9A9A] ml-0.5">({staged})</span>}
      </span>
    </span>
  );
}
