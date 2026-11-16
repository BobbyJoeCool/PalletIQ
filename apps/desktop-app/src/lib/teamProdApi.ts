import type { TeamProdView } from '@shared/teamProd';
import type { ShiftCode } from '@shared/workforce';
import { apiFetch } from './api';

/** Team Prod Summary (#147). Errors throw the API's code (see apiFetch). */
export function fetchTeamProd(
  token: string,
  date: string,
  shift: ShiftCode | null
): Promise<TeamProdView> {
  const params = new URLSearchParams({ date });
  if (shift) params.set('shift', shift);
  return apiFetch<TeamProdView>(`/api/team-prod?${params.toString()}`, token);
}
