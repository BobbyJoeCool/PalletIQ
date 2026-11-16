import type { DailyPlanView, ProdGoalsView, RampingView } from '@shared/prodPlan';
import type { ShiftCode } from '@shared/workforce';
import { apiFetch } from './api';

/** Client for Prod Goal / Ramping / Daily Plan (#146). Errors throw the API's code (see apiFetch). */

export interface RampingData {
  today: string;
  overrides: RampingView[];
  workers: { zNumber: string; firstName: string; lastName: string }[];
  functions: { code: string; label: string }[];
}

export const fetchProdGoals = (token: string) => apiFetch<ProdGoalsView>('/api/prod-goals', token);

export const setProdGoal = (
  token: string,
  body: { functionCode: string; rate: number; effectiveDate: string }
) =>
  apiFetch<ProdGoalsView>('/api/prod-goals', token, { method: 'POST', body: JSON.stringify(body) });

export const cancelProdGoal = (token: string, id: number) =>
  apiFetch<ProdGoalsView>(`/api/prod-goals/${id}`, token, { method: 'DELETE' });

export const fetchRamping = (token: string) => apiFetch<RampingData>('/api/ramping', token);

export const addRamping = (
  token: string,
  body: {
    workerZ: string;
    functionCode: string;
    percent: number;
    startDate: string;
    endDate: string | null;
  }
) => apiFetch<RampingData>('/api/ramping', token, { method: 'POST', body: JSON.stringify(body) });

export const editRamping = (
  token: string,
  id: number,
  body: { percent?: number; startDate?: string; endDate?: string | null }
) =>
  apiFetch<RampingData>(`/api/ramping/${id}`, token, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });

export const removeRamping = (token: string, id: number) =>
  apiFetch<RampingData>(`/api/ramping/${id}`, token, { method: 'DELETE' });

export function fetchDailyPlan(
  token: string,
  date: string,
  shift: ShiftCode | null
): Promise<DailyPlanView> {
  const params = new URLSearchParams({ date });
  if (shift) params.set('shift', shift);
  return apiFetch<DailyPlanView>(`/api/daily-plan?${params.toString()}`, token);
}

export const saveDailyPlan = (
  token: string,
  body: {
    date: string;
    shiftCode: string;
    targets: { functionCode: string; targetVolume: number | null }[];
  }
) =>
  apiFetch<DailyPlanView>('/api/daily-plan', token, { method: 'PUT', body: JSON.stringify(body) });

/** Messages for this screen's error codes. */
const ERRORS: Record<string, string> = {
  FORBIDDEN: 'Your role cannot do that.',
  NO_DESKTOP_ACCESS: 'This account does not have desktop access.',
  UNAUTHORIZED: 'Your session has ended. Sign in again.',
  INVALID_RATE: 'Enter a positive rate with at most two decimals.',
  INVALID_DATE: 'Enter a valid date; an end date cannot be before the start.',
  BACKDATED: 'A goal change can start today or later, not in the past.',
  NOT_UPCOMING: 'Only a change that has not started yet can be cancelled.',
  INVALID_PERCENT: 'Ramping percent must be a whole number from 1 to 99.',
  RAMPING_OVERLAP: 'That worker already has a ramping override on this function for those dates.',
  WORKER_NOT_FOUND: 'That worker is not a team member of your department.',
  INVALID_FUNCTION: 'That function is not available for your department.',
  INVALID_TARGET: 'Targets must be whole numbers, zero or more.',
  SHIFT_NOT_ON_DATE: 'That shift does not run on the chosen date.',
  NOT_FOUND: 'That record no longer exists. Reload and try again.',
  INVALID_INPUT: 'Some of the entries are not valid.',
};

/** @returns the message for an error thrown by this client */
export function prodPlanErrorText(err: unknown): string {
  const code = err instanceof Error ? err.message : '';
  return ERRORS[code] ?? 'The request failed. Check that the API is running and try again.';
}
