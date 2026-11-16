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
