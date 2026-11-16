import type { AuditEntityType, AuditResult } from '@shared/audit';
import { apiFetch } from './api';

/** What a pane asks for: an entity type, its identifier, and (aisle only) a narrowing. */
export interface AuditQuery {
  type: AuditEntityType;
  id: string;
  binStart?: string;
  binEnd?: string;
  levelStart?: string;
  levelEnd?: string;
}

/**
 * Looks up one auditable record (`GET /api/audit`).
 *
 * @param token - session token
 * @param query - what to look up; blank range fields are left off the request
 * @returns the record's current state and trail
 * @throws Error whose message is the API's error code — `NOT_FOUND`, `INVALID_INPUT`,
 *   `INVALID_CID_FORMAT`, `NO_DESKTOP_ACCESS`, `UNAUTHORIZED` or `REQUEST_FAILED`
 */
export function fetchAudit(token: string, query: AuditQuery): Promise<AuditResult> {
  const params = new URLSearchParams({ type: query.type, id: query.id.trim() });
  for (const key of ['binStart', 'binEnd', 'levelStart', 'levelEnd'] as const) {
    const value = query[key]?.trim();
    if (value) params.set(key, value);
  }
  return apiFetch<AuditResult>(`/api/audit?${params.toString()}`, token);
}
