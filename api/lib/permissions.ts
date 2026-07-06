import { jwtVerify } from 'jose';
import type { HttpRequest } from '@azure/functions';
import type { JwtPayload, Role } from './jwt.js';

const ROLE_RANK: Record<Role, number> = {
  WORKER:  1,
  IM:      2,
  LEAD:    3,
  MANAGER: 4,
  ADMIN:   5,
};

/**
 * Returns true if the given user role meets or exceeds the required minimum role.
 * Role hierarchy from lowest to highest: WORKER → IM → LEAD → MANAGER → ADMIN.
 *
 * @param userRole - The caller's current role
 * @param minRole - The minimum role required for the action
 * @returns True if userRole rank ≥ minRole rank
 */
export function hasMinRole(userRole: Role, minRole: Role): boolean {
  return ROLE_RANK[userRole] >= ROLE_RANK[minRole];
}

/** Reads the JWT signing secret from the environment as a Buffer for jose to consume. */
const getSecret = () => Buffer.from(process.env.JWT_SECRET!, 'utf-8');

/**
 * Extracts and verifies the Bearer JWT from the Authorization header.
 * Returns the decoded payload (zNumber + role) for use in handler logic.
 *
 * @param req - Incoming Azure Functions HTTP request
 * @returns Decoded JWT payload `{ zNumber, role }`
 * @throws 401 UNAUTHORIZED if the Authorization header is missing or the token is invalid/expired
 */
export async function requireAuth(req: HttpRequest): Promise<JwtPayload> {
  const auth = req.headers.get('authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) throw Object.assign(new Error('UNAUTHORIZED'), { status: 401 });

  try {
    const { payload } = await jwtVerify(token, getSecret());
    return { zNumber: payload.zNumber as string, role: payload.role as Role };
  } catch (e) {
    // TEMPORARY diagnostic — surfaces the real jose error instead of swallowing it.
    // Revert to plain UNAUTHORIZED once the production auth issue is root-caused.
    const detail = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    throw Object.assign(new Error(`UNAUTHORIZED_DEBUG: ${detail}`), { status: 401 });
  }
}

/**
 * Enforces that the authenticated user's role meets a minimum level.
 * A convenience wrapper around hasMinRole that throws immediately on failure.
 *
 * @param payload - The decoded JWT payload containing the user's role
 * @param minRole - The minimum required role for this action
 * @throws 403 FORBIDDEN if the user's role is below the required minimum
 */
export function requireRole(payload: JwtPayload, minRole: Role): void {
  if (!hasMinRole(payload.role, minRole)) {
    throw Object.assign(new Error('FORBIDDEN'), { status: 403 });
  }
}
