import { STORAGE_CODE_COLOR_FALLBACK, STORAGE_CODE_COLORS } from '../../lib/storageCodeColors';

/**
 * A single Storage Code — optionally paired with a Size — as a color-coded pill (e.g.
 * "CR" or "CR-L"). Same `STORAGE_CODE_COLORS` palette `AisleGrid`/`ZoneCodeBadge` already
 * use, so a badge reads as the same "type" wherever it appears in the app. Unlike
 * `ZoneCodeBadge` (always Storage Code + Size, plus an empty/staged count breakdown for a
 * Zone Summary panel), this is a bare identity badge for a single pallet or location —
 * no counts, and Size is optional (SDP's Verify-Put Modal, #151, pairs it with the
 * directed location but leaves it off the DPCI's own badge).
 */
export function StorageCodeBadge({
  storageCode, size, badgeSize = 'default',
}: { storageCode: string; size?: string; badgeSize?: 'compact' | 'default' }) {
  const color = STORAGE_CODE_COLORS[storageCode] ?? STORAGE_CODE_COLOR_FALLBACK;
  const padding = badgeSize === 'compact' ? 'px-2 py-0.5' : 'px-3 py-1.5';
  const textSize = badgeSize === 'compact' ? 'text-[11px]' : 'text-[14px]';

  return (
    <span
      className={`inline-flex items-center rounded-full border font-data font-semibold whitespace-nowrap ${padding} ${textSize}`}
      style={{ borderColor: color, backgroundColor: `${color}22`, color }}
    >
      {size ? `${storageCode}-${size}` : storageCode}
    </span>
  );
}
