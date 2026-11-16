// Pure trail assembly for the Audit Tool (#148): turning rows from the three tables that
// record history (ActivityLog, the container event tables, ScanLog) into one common entry
// shape, and merging them into a single newest-first trail. No Prisma client import, so it
// is unit-testable; the queries live in functions/audit.ts.

import { serializeActivityRow, type ActivityRow } from './activityRow.js';
import { AUDIT_TRAIL_LIMIT, type AuditEntry } from '../../shared/audit.js';

/**
 * @param value - anything
 * @returns the value if it is a plain object (not an array), else null
 */
function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * Parses a stored JSON `details` column without ever throwing — a malformed row should
 * cost that one entry its details, not fail the whole lookup.
 *
 * @param raw - the stored JSON text, or null
 * @returns the parsed object, or null if absent, unparseable, or not an object
 */
export function parseDetails(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    return asRecord(JSON.parse(raw));
  } catch {
    return null;
  }
}

/**
 * @param prefix - reason prefix letter, or null
 * @param number - reason number, or null
 * @returns the combined code (e.g. `W70`), or null unless both parts are present
 */
function reasonCode(prefix: unknown, number: unknown): string | null {
  return typeof prefix === 'string' && typeof number === 'string' ? `${prefix}${number}` : null;
}

/** An ActivityLog row → trail entry. */
export function fromActivityRow(row: ActivityRow): AuditEntry {
  // The shared serializer owns the location/DPCI formatting rules; details are parsed
  // here instead so a malformed row can't throw.
  const formatted = serializeActivityRow({ ...row, details: null });
  return {
    key: `A:${row.id}`,
    timestamp: row.timestamp.toISOString(),
    source: 'ACTIVITY',
    action: row.actionType,
    userId: row.userId,
    palletId: row.palletId,
    location: formatted.location,
    dpci: formatted.dpci,
    cid: null,
    reason: reasonCode(row.reasonPrefix, row.reasonNumber),
    details: parseDetails(row.details),
  };
}

/** A container-side event, as the CII event log already assembles them. */
export interface ContainerTrailEvent {
  source: string;
  eventType: string;
  timestamp: Date;
  userZ: string | null;
  details?: Record<string, unknown>;
}

/**
 * A container event → trail entry.
 *
 * @param cid - the container the event belongs to
 * @param event - the event
 * @param index - position within that container's event list, used only to make the key unique
 * @param context - the pallet/item the container belongs to, when known
 */
export function fromContainerEvent(
  cid: string,
  event: ContainerTrailEvent,
  index: number,
  context: { palletId?: number | null; dpci?: string | null } = {},
): AuditEntry {
  const details = event.details ?? null;
  return {
    key: `C:${cid}:${event.source}:${index}`,
    timestamp: event.timestamp.toISOString(),
    source: 'CONTAINER',
    action: event.eventType,
    userId: event.userZ,
    palletId: context.palletId ?? null,
    location: null,
    dpci: context.dpci ?? null,
    cid,
    reason: reasonCode(details?.reasonPrefix, details?.reasonNumber),
    details,
  };
}

/** A ScanLog row as stored. */
export interface ScanLogRow {
  id: string;
  zNumber: string;
  timestamp: Date;
  actionType: string;
  details: string;
}

/** A ScanLog row → trail entry. Its only structured link is the CID inside `details`. */
export function fromScanLogRow(row: ScanLogRow): AuditEntry {
  const details = parseDetails(row.details);
  return {
    key: `S:${row.id}`,
    timestamp: row.timestamp.toISOString(),
    source: 'SCAN',
    action: row.actionType,
    userId: row.zNumber,
    palletId: null,
    location: null,
    dpci: null,
    cid: typeof details?.cid === 'string' ? details.cid : null,
    reason: reasonCode(details?.reasonPrefix, details?.reasonNumber),
    details,
  };
}

/**
 * Merges entries from any number of sources into one trail: newest first, cut off at the
 * limit.
 *
 * @param entries - entries in any order
 * @param limit - most entries to keep
 * @returns the trail, and whether anything was cut off
 */
export function mergeTrail(
  entries: AuditEntry[],
  limit: number = AUDIT_TRAIL_LIMIT,
): { trail: AuditEntry[]; truncated: boolean } {
  // ISO timestamps sort correctly as strings; the key is a stable tie-break.
  const sorted = [...entries].sort(
    (a, b) => b.timestamp.localeCompare(a.timestamp) || a.key.localeCompare(b.key),
  );
  return { trail: sorted.slice(0, limit), truncated: sorted.length > limit };
}

/** An inclusive numeric range; either end may be open. */
export interface NumericRange {
  start?: number;
  end?: number;
}

/**
 * Reads an optional inclusive range from two query-string values.
 *
 * @param startRaw - the range's start as typed, or null/empty for open
 * @param endRaw - the range's end as typed, or null/empty for open
 * @returns the range (possibly with both ends open), or null if either value is not a
 *   non-negative whole number or the start is after the end
 */
export function parseRange(startRaw: string | null, endRaw: string | null): NumericRange | null {
  const range: NumericRange = {};
  for (const [key, raw] of [['start', startRaw], ['end', endRaw]] as const) {
    if (raw == null || raw.trim() === '') continue;
    if (!/^\d+$/.test(raw.trim())) return null;
    range[key] = parseInt(raw.trim(), 10);
  }
  if (range.start != null && range.end != null && range.start > range.end) return null;
  return range;
}

/** @returns true if the range has neither end set */
export function isOpenRange(range: NumericRange): boolean {
  return range.start == null && range.end == null;
}

/**
 * @param range - a range
 * @returns it written out for a title (`1–20`, `5+`, `up to 9`), or null if fully open
 */
export function describeRange(range: NumericRange): string | null {
  if (range.start != null && range.end != null) {
    return range.start === range.end ? String(range.start) : `${range.start}–${range.end}`;
  }
  if (range.start != null) return `${range.start}+`;
  if (range.end != null) return `up to ${range.end}`;
  return null;
}
