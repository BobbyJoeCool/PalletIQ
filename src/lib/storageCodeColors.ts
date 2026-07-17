/**
 * Curated per-Storage-Code text color for AisleGrid cells (v1.6.5), so a Storage Code
 * reads as visually distinct against the grid's dark cell background at a glance.
 *
 * Fixed assignment, not algorithmically generated — one color per the 8 real codes
 * (`CR`/`FD`/`BK`/`NR`/`NF`/`RF`/`RS`/`BS`, see `api/prisma/seed.ts`'s STORAGE_CODES),
 * in the categorical order/hues from the dataviz skill's dark-mode reference palette
 * (`references/palette.md`), validated via `scripts/validate_palette.js --mode dark`
 * against this app's dark cell surface: CVD-safe adjacency (worst pair ΔE 8.4) and
 * normal-vision separation (worst pair ΔE 19.3), all 8 clearing 3:1 contrast.
 *
 * Any Storage Code outside this fixed set (shouldn't happen against the current seed
 * data, but the reference list is fetched live) falls back to the grid's original
 * neutral text color rather than generating a 9th hue — see AisleGrid.tsx's
 * `colorForStorageCode`.
 */
export const STORAGE_CODE_COLORS: Record<string, string> = {
  CR: '#3987e5', // blue
  FD: '#008300', // green
  BK: '#d55181', // magenta
  NR: '#c98500', // yellow
  NF: '#199e70', // aqua
  RF: '#d95926', // orange
  RS: '#9085e9', // violet
  BS: '#e66767', // red
};

/** Neutral fallback for any Storage Code not in the curated palette above. */
export const STORAGE_CODE_COLOR_FALLBACK = '#CFCFCF';
