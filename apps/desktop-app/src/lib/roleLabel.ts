import { ICQA_DEPARTMENT_ID } from '@shared/roles';

/**
 * Display names for `User.role` values in the desktop app. The stored values stay
 * LEAD/MANAGER (shared with the live floor app); the desktop design docs' names for
 * those positions — LWW and OM — are a display-only relabel applied here.
 */
const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'System Admin',
  MANAGER: 'OM',
  LEAD: 'LWW',
  IM: 'IM',
  WORKER: 'Team Member',
};

/**
 * @param role - a `User.role` value
 * @returns the label the desktop app shows for it (the raw value if unrecognised)
 */
export function roleLabel(role: string): string {
  return ROLE_LABELS[role] ?? role;
}

/**
 * @param departmentId - a user's home `User.departmentId`
 * @returns true if that department is ICQA, which carries elevated access as a department
 */
export function isIcqaDepartment(departmentId: string): boolean {
  return departmentId === ICQA_DEPARTMENT_ID;
}
