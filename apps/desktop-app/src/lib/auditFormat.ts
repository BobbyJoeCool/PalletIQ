import type { AuditEntityType, AuditEntry, AuditRef, AuditSummaryField } from '@shared/audit';
import { displayLocationId } from '@shared/location';

/**
 * Presentation rules for the Audit Tool (#148): labels, how identifiers are displayed,
 * and how one trail entry is broken into cross-references and readable detail text. Pure,
 * and shared by the on-screen trail and the Excel export so both read the same.
 */

/** Label for each lookup type, as shown in the type picker and on chips. */
export const AUDIT_TYPE_LABELS: Record<AuditEntityType, string> = {
  LOCATION: 'Location',
  PALLET: 'Pallet ID',
  DPCI: 'DPCI',
  CID: 'Container ID',
  USER: 'zNumber',
  AISLE: 'Aisle',
};

/** Example of what to type for each lookup type. */
export const AUDIT_ID_PLACEHOLDERS: Record<AuditEntityType, string> = {
  LOCATION: '318-001-04',
  PALLET: '4471203',
  DPCI: '057-01-0004',
  CID: 'Container ID',
  USER: 'z002p23',
  AISLE: '318',
};

/** Message for each error code a lookup can fail with. */
export const AUDIT_ERROR_MESSAGES: Record<string, string> = {
  NOT_FOUND: 'No record found.',
  INVALID_INPUT: 'That is not a valid identifier for this lookup type.',
  INVALID_CID_FORMAT: 'That is not a valid Container ID.',
  NO_DESKTOP_ACCESS: 'This account does not have access to the Audit Tool.',
  UNAUTHORIZED: 'Your session has ended. Sign in again.',
};

/** Shown for any other failure (API down, unexpected server error). */
export const AUDIT_FALLBACK_ERROR =
  'The lookup failed. Check that the API is running and try again.';

/**
 * @param ref - a cross-reference
 * @returns its identifier as shown to the user (locations gain dashes; the rest are as stored)
 */
export function displayRefId(ref: AuditRef): string {
  return ref.type === 'LOCATION' ? displayLocationId(ref.id) : ref.id;
}

/**
 * @param field - a summary line
 * @returns its value as shown: timestamps in local time, everything else as sent
 */
export function summaryValueText(field: AuditSummaryField): string {
  return field.isTime ? formatAuditTime(field.value) : field.value;
}

/**
 * The records one trail entry points at, in a fixed reading order: who, pallet, location,
 * item, container.
 *
 * @param entry - a trail entry
 * @returns one cross-reference per identifier the entry carries
 */
export function refsOfEntry(entry: AuditEntry): AuditRef[] {
  const refs: AuditRef[] = [];
  if (entry.userId) refs.push({ type: 'USER', id: entry.userId });
  if (entry.palletId != null) refs.push({ type: 'PALLET', id: String(entry.palletId) });
  if (entry.location) refs.push({ type: 'LOCATION', id: entry.location });
  if (entry.dpci) refs.push({ type: 'DPCI', id: entry.dpci });
  if (entry.cid) refs.push({ type: 'CID', id: entry.cid });
  return refs;
}

/** Detail keys already shown elsewhere on the entry (as the reason code). */
const DETAIL_KEYS_SHOWN_ELSEWHERE = new Set(['reasonPrefix', 'reasonNumber']);

/**
 * @param value - a detail value of any stored shape
 * @returns it as short text; nested values are written as JSON
 */
function detailValueText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

/**
 * An entry's extra fields as `key: value` pairs, skipping empty values and the reason
 * parts (shown as the reason code instead).
 *
 * @param entry - a trail entry
 * @returns the pairs in stored order; empty if the entry has no details worth showing
 */
export function detailPairs(entry: AuditEntry): { key: string; value: string }[] {
  if (!entry.details) return [];
  return Object.entries(entry.details)
    .filter(
      ([key, value]) => !DETAIL_KEYS_SHOWN_ELSEWHERE.has(key) && value != null && value !== ''
    )
    .map(([key, value]) => ({ key, value: detailValueText(value) }));
}

/**
 * @param iso - an ISO timestamp from the API
 * @returns it in the viewer's local time, `MM/DD/YYYY HH:MM:SS`
 */
export function formatAuditTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${pad(date.getMonth() + 1)}/${pad(date.getDate())}/${date.getFullYear()} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  );
}
