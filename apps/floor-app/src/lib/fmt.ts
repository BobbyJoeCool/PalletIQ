/**
 * Formats a raw location ID string as a human-readable aisle-bin[-level] string.
 * 8 digits → "322-122-08" (aisle-bin-level)
 * 6 digits → "322-122" (aisle-bin only)
 * Any other length is returned unchanged.
 *
 * @param id - Raw location string, either 6-digit (aisle+bin) or 8-digit (aisle+bin+level)
 * @returns Dash-separated display string
 */
export function fmtLocation(id: string): string {
  if (id.length === 8) return `${id.slice(0, 3)}-${id.slice(3, 6)}-${id.slice(6)}`;
  if (id.length === 6) return `${id.slice(0, 3)}-${id.slice(3)}`;
  return id;
}

/** Formats a DPCI object as `DDD-CC-IIII`. */
export function fmtDpci(dpci: { dept: number; class: number; item: number }): string {
  return `${String(dpci.dept).padStart(3, '0')}-${String(dpci.class).padStart(2, '0')}-${String(dpci.item).padStart(4, '0')}`;
}
