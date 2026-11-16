import type { RosterView, Segment, ShiftCode } from '@shared/workforce';
import { apiFetch } from './api';

/** Client for Job/Function Assignment (#145). Errors throw the API's code (see apiFetch). */

export function fetchRoster(
  token: string,
  date: string,
  shift: ShiftCode | null
): Promise<RosterView> {
  const params = new URLSearchParams({ date });
  if (shift) params.set('shift', shift);
  return apiFetch<RosterView>(`/api/roster?${params.toString()}`, token);
}

/** Saves new timelines for some workers; all succeed or none do. Returns the updated roster. */
export function saveRoster(
  token: string,
  body: {
    date: string;
    shiftCode: ShiftCode;
    timelines: { workerZ: string; segments: Segment[] }[];
  }
): Promise<RosterView> {
  return apiFetch<RosterView>('/api/roster', token, { method: 'PUT', body: JSON.stringify(body) });
}
