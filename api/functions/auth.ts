import { app } from '../lib/functionsRuntime.js';
import type { HttpRequest, InvocationContext } from '../lib/functionsRuntime.js';
import bcrypt from 'bcryptjs';
import prisma from '../lib/prisma.js';
import { signToken, type Role } from '../lib/jwt.js';
import { withHandler } from '../lib/response.js';
import { isDesktopEligible } from '../../shared/roles.js';

/**
 * Looks up a user by zNumber — submitted as a badge scan value or a manually typed
 * employee number. Both input methods use the same endpoint and the same field.
 * Returns the user's first and last name so the PIN screen can display a greeting.
 *
 * @param req - HTTP request with JSON body `{ zNumber: string }`
 * @returns `{ firstName, lastName }` from the matching user record
 * @throws 400 INVALID_INPUT if zNumber is missing; 404 NOT_FOUND if no matching user
 */
async function identify(req: HttpRequest, _ctx: InvocationContext): Promise<unknown> {
  const body = await req.json() as { zNumber?: unknown };
  const zNumber = typeof body.zNumber === 'string' ? body.zNumber.toLowerCase().trim() : null;

  if (!zNumber) throw Object.assign(new Error('INVALID_INPUT'), { status: 400 });

  const user = await prisma.user.findUnique({
    where: { zNumber },
    select: { firstName: true, lastName: true },
  });

  if (!user) throw Object.assign(new Error('NOT_FOUND'), { status: 404 });

  return { firstName: user.firstName, lastName: user.lastName };
}

/**
 * Verifies a zNumber + 4-digit PIN pair and, on success, issues a signed JWT.
 * The PIN is compared against the stored bcrypt hash — the raw PIN is never stored.
 * The returned token is valid for 12 hours and encodes the user's zNumber and role — session
 * length is actually enforced client-side by the 15-minute idle timeout in AuthContext.tsx.
 *
 * @param req - HTTP request with JSON body `{ zNumber: string; pin: string }`
 * @returns `{ token, user: { zNumber, firstName, lastName, role } }` on success
 * @throws 400 INVALID_INPUT for missing fields; 404 NOT_FOUND if user not found;
 *   401 INVALID_PIN if the PIN does not match the stored hash
 */
async function login(req: HttpRequest, _ctx: InvocationContext): Promise<unknown> {
  const body = await req.json() as { zNumber?: unknown; pin?: unknown };
  const zNumber = typeof body.zNumber === 'string' ? body.zNumber.toLowerCase().trim() : null;
  const pin = typeof body.pin === 'string' ? body.pin.trim() : null;

  if (!zNumber || !pin) throw Object.assign(new Error('INVALID_INPUT'), { status: 400 });

  const user = await prisma.user.findUnique({
    where: { zNumber },
    select: { zNumber: true, firstName: true, lastName: true, role: true, pinHash: true },
  });

  if (!user) throw Object.assign(new Error('NOT_FOUND'), { status: 404 });

  const match = await bcrypt.compare(pin, user.pinHash);
  if (!match) throw Object.assign(new Error('INVALID_PIN'), { status: 401 });

  const token = await signToken({ zNumber: user.zNumber, role: user.role as Role });

  return {
    token,
    user: {
      zNumber: user.zNumber,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
    },
  };
}

/**
 * Desktop-app login: verifies a zNumber + password pair and issues a signed JWT.
 * Separate from the tablet's identify/login pair because it uses a different credential
 * (`User.passwordHash`, not the 4-digit PIN) and is restricted to desktop-eligible users.
 *
 * Eligibility is checked before the password, so a WORKER/IM gets a clear
 * NO_DESKTOP_ACCESS rather than a misleading wrong-password error. An eligible user
 * whose password an admin has not set yet gets PASSWORD_NOT_SET (there is no
 * self-service reset in this phase). The token is the same 12-hour `{ zNumber, role }`
 * JWT the tablet login issues, so every existing `requireAuth` endpoint accepts it.
 *
 * @param req - HTTP request with JSON body `{ zNumber: string; password: string }`
 * @returns `{ token, user: { zNumber, firstName, lastName, role, departmentId } }`
 * @throws 400 INVALID_INPUT for missing fields; 404 NOT_FOUND if user not found;
 *   403 NO_DESKTOP_ACCESS if the user's role/department is not desktop-eligible;
 *   403 PASSWORD_NOT_SET if no desktop password has been set for the user;
 *   401 INVALID_PASSWORD if the password does not match the stored hash
 */
async function desktopLogin(req: HttpRequest, _ctx: InvocationContext): Promise<unknown> {
  const body = await req.json() as { zNumber?: unknown; password?: unknown };
  const zNumber = typeof body.zNumber === 'string' ? body.zNumber.toLowerCase().trim() : null;
  // Not trimmed — leading/trailing whitespace is a legitimate part of a password.
  const password = typeof body.password === 'string' ? body.password : null;

  if (!zNumber || !password) throw Object.assign(new Error('INVALID_INPUT'), { status: 400 });

  const user = await prisma.user.findUnique({
    where: { zNumber },
    select: {
      zNumber: true, firstName: true, lastName: true,
      role: true, departmentId: true, passwordHash: true,
    },
  });

  if (!user) throw Object.assign(new Error('NOT_FOUND'), { status: 404 });

  if (!isDesktopEligible(user.role as Role, user.departmentId)) {
    throw Object.assign(new Error('NO_DESKTOP_ACCESS'), { status: 403 });
  }

  if (!user.passwordHash) throw Object.assign(new Error('PASSWORD_NOT_SET'), { status: 403 });

  const match = await bcrypt.compare(password, user.passwordHash);
  if (!match) throw Object.assign(new Error('INVALID_PASSWORD'), { status: 401 });

  const token = await signToken({ zNumber: user.zNumber, role: user.role as Role });

  return {
    token,
    user: {
      zNumber: user.zNumber,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      departmentId: user.departmentId,
    },
  };
}

app.http('identify', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'auth/identify',
  handler: withHandler(identify),
});

app.http('login', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'auth/login',
  handler: withHandler(login),
});

app.http('desktopLogin', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'auth/desktop-login',
  handler: withHandler(desktopLogin),
});
