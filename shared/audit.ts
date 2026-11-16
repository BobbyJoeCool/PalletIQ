// Audit Tool contract (Desktop: Universal Audit / Cross-Reference, GitHub #148) — the
// shape `GET /api/audit` returns and the desktop app renders. Defined once here so the API
// and the desktop app can't drift apart.

/** Everything a pane can look up. */
export const AUDIT_ENTITY_TYPES = ['LOCATION', 'PALLET', 'DPCI', 'CID', 'USER', 'AISLE'] as const;
export type AuditEntityType = (typeof AUDIT_ENTITY_TYPES)[number];

/** @returns true if the value is one of the lookup types above */
export function isAuditEntityType(value: unknown): value is AuditEntityType {
  return typeof value === 'string' && (AUDIT_ENTITY_TYPES as readonly string[]).includes(value);
}

/**
 * A pointer to another auditable record — what a cross-reference chip carries. `id` is
 * always in the form the lookup accepts back: 8-digit location, numeric pallet ID,
 * `ddd-cc-iiii` DPCI, canonical CID, zNumber.
 */
export interface AuditRef {
  type: AuditEntityType;
  id: string;
}

/** One line of a record's current-state summary; `ref` makes its value a chip. */
export interface AuditSummaryField {
  label: string;
  value: string;
  ref?: AuditRef;
  /** True when `value` is an ISO 8601 timestamp, to be shown in the viewer's local time. */
  isTime?: boolean;
}

/** Which table a trail entry came from. */
export type AuditSource = 'ACTIVITY' | 'CONTAINER' | 'SCAN';

/** One event in a trail, whatever table it was stored in. */
export interface AuditEntry {
  /** Unique within a trail (source + row id). */
  key: string;
  /** ISO 8601 timestamp. */
  timestamp: string;
  source: AuditSource;
  /** The stored action/event type code (e.g. `PUT`, `HOLD_PLACE`, `PULLED`). */
  action: string;
  userId: string | null;
  palletId: number | null;
  /** 8-digit location ID, when the event names a full location. */
  location: string | null;
  /** `ddd-cc-iiii`. */
  dpci: string | null;
  /** Canonical CID. */
  cid: string | null;
  /** Reason code as prefix+number (e.g. `W70`), when the event carries one. */
  reason: string | null;
  /** The event's own extra fields, as stored. */
  details: Record<string, unknown> | null;
}

/** A looked-up record: its current state and its history, newest first. */
export interface AuditResult {
  type: AuditEntityType;
  /** Canonical identifier of what was found. */
  id: string;
  title: string;
  fields: AuditSummaryField[];
  trail: AuditEntry[];
  /** True when the history was longer than {@link AUDIT_TRAIL_LIMIT} and was cut off. */
  truncated: boolean;
}

/** Most trail entries one lookup returns. */
export const AUDIT_TRAIL_LIMIT = 500;
