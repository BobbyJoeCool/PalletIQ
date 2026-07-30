import { SIZES } from './sizes';

export interface ZoneBreakdownEntry {
  storageCode: string;
  size: string;
  empty: number;
  staged: number;
}

export interface StorageCodeColumn {
  storageCode: string;
  entries: ZoneBreakdownEntry[];
}

/**
 * Groups a zone's flat Storage Code/Size breakdown into one column per Storage Code, each
 * column's own entries sorted largest Size first (top) down to smallest (bottom) — ELZ's
 * and STG's shared Zone Summary panel layout (2026-07-28, direct instruction: "columns
 * with each freight type, then the badges organized by Size, Largest at the top").
 * Columns themselves are ordered alphabetically by Storage Code — no size/count-based
 * column ordering was specified, so this defaults to the same predictable A-Z ordering
 * `STORAGE_CODES` is already listed in elsewhere in the app.
 */
export function groupBreakdownByStorageCode(breakdown: ZoneBreakdownEntry[]): StorageCodeColumn[] {
  const bySc = new Map<string, ZoneBreakdownEntry[]>();
  for (const entry of breakdown) {
    if (!bySc.has(entry.storageCode)) bySc.set(entry.storageCode, []);
    bySc.get(entry.storageCode)!.push(entry);
  }
  const columns = [...bySc.entries()].map(([storageCode, entries]) => ({
    storageCode,
    entries: [...entries].sort((a, b) => SIZES.indexOf(b.size) - SIZES.indexOf(a.size)),
  }));
  columns.sort((a, b) => a.storageCode.localeCompare(b.storageCode));
  return columns;
}
