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

export function hasMinRole(userRole: Role, minRole: Role): boolean {
  return ROLE_RANK[userRole] >= ROLE_RANK[minRole];
}

const getSecret = () => Buffer.from(process.env.JWT_SECRET!, 'utf-8');

/**
 * Extracts and verifies the Bearer JWT from the Authorization header.
 * Throws with `status` 401 if missing/invalid, 403 if role check fails.
 */
export async function requireAuth(req: HttpRequest): Promise<JwtPayload> {
  const auth = req.headers.get('authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) throw Object.assign(new Error('UNAUTHORIZED'), { status: 401 });

  try {
    const { payload } = await jwtVerify(token, getSecret());
    return { zNumber: payload.zNumber as string, role: payload.role as Role };
  } catch {
    throw Object.assign(new Error('UNAUTHORIZED'), { status: 401 });
  }
}

export function requireRole(payload: JwtPayload, minRole: Role): void {
  if (!hasMinRole(payload.role, minRole)) {
    throw Object.assign(new Error('FORBIDDEN'), { status: 403 });
  }
}
