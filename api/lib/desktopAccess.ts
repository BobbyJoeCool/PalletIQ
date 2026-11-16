import prisma from './prisma.js';
import type { HttpRequest } from './functionsRuntime.js';
import type { JwtPayload } from './jwt.js';
import { requireAuth } from './permissions.js';
import { isDesktopEligible } from '../../shared/roles.js';

/**
 * Authenticates a request and requires that the user may use the Manager desktop app —
 * the gate for endpoints that exist only for desktop screens. Same rule the desktop
 * login applies (`isDesktopEligible`: LEAD and up, or home department ICQA), re-checked
 * here because a tablet login issues the same kind of token.
 *
 * The home department is read from the database rather than the token: the token only
 * carries zNumber and role.
 *
 * @param req - incoming HTTP request
 * @returns the decoded JWT payload
 * @throws 401 UNAUTHORIZED if the token is missing/invalid or its user no longer exists;
 *   403 NO_DESKTOP_ACCESS if the user is not desktop-eligible
 */
export async function requireDesktopAccess(req: HttpRequest): Promise<JwtPayload> {
  const auth = await requireAuth(req);

  const user = await prisma.user.findUnique({
    where: { zNumber: auth.zNumber },
    select: { role: true, departmentId: true },
  });
  if (!user) throw Object.assign(new Error('UNAUTHORIZED'), { status: 401 });

  if (!isDesktopEligible(auth.role, user.departmentId)) {
    throw Object.assign(new Error('NO_DESKTOP_ACCESS'), { status: 403 });
  }
  return auth;
}
