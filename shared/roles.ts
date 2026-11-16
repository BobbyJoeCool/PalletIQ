// Role hierarchy — one definition for the floor app and the API (#217; the API previously
// declared its own `Role` in api/lib/jwt.ts and its own ROLE_RANK in api/lib/permissions.ts).

export type Role = 'ADMIN' | 'MANAGER' | 'LEAD' | 'IM' | 'WORKER';

/** Rank order, lowest to highest: WORKER → IM → LEAD → MANAGER → ADMIN. */
export const ROLE_RANK: Record<Role, number> = {
  WORKER:  1,
  IM:      2,
  LEAD:    3,
  MANAGER: 4,
  ADMIN:   5,
};

/**
 * Returns true if userRole meets or exceeds minRole in the hierarchy.
 * @param userRole - the caller's current role
 * @param minRole - the minimum role required
 */
export function hasMinRole(userRole: Role, minRole: Role): boolean {
  return ROLE_RANK[userRole] >= ROLE_RANK[minRole];
}

/** Type guard for a role string read from an untyped source (JWT payload, DB column). */
export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && value in ROLE_RANK;
}

/** Home-department id that grants ICQA's elevated access regardless of the user's role. */
export const ICQA_DEPARTMENT_ID = 'IQA';

/** Lowest role that can sign into the Manager desktop app on rank alone. */
export const DESKTOP_MIN_ROLE: Role = 'LEAD';

/**
 * Decides whether a user may sign into the Manager desktop app (apps/desktop-app).
 * Eligible: LEAD (shown as LWW), MANAGER (shown as OM), ADMIN — or anyone whose home
 * department is ICQA, since ICQA is a department rather than a role and carries
 * elevated access whatever the individual's role is. WORKER/IM outside ICQA are
 * tablet-only. Owned here so the API's desktop-login check and any desktop UI gating
 * read one definition.
 *
 * @param role - the user's `User.role` value
 * @param departmentId - the user's home `User.departmentId` (cross-training rows in
 *   `UserDepartment` deliberately do not count)
 * @returns true if the user may use the desktop app
 */
export function isDesktopEligible(role: Role, departmentId: string): boolean {
  return hasMinRole(role, DESKTOP_MIN_ROLE) || departmentId === ICQA_DEPARTMENT_ID;
}
