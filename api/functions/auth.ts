import { app } from '@azure/functions';
import type { HttpRequest, InvocationContext } from '@azure/functions';
import bcrypt from 'bcryptjs';
import prisma from '../lib/prisma.js';
import { signToken, type Role } from '../lib/jwt.js';
import { withHandler } from '../lib/response.js';

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
