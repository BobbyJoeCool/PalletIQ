import { app } from '@azure/functions';
import type { HttpRequest, InvocationContext } from '@azure/functions';
import prisma from '../lib/prisma.js';
import { withHandler } from '../lib/response.js';

/**
 * Runs a trivial query to force Azure SQL serverless to resume if it's auto-paused.
 * Unauthenticated by design — called from the login screen, before any session exists,
 * specifically to avoid the identify/login calls themselves timing out against a
 * paused database (see phase-11 build log, 11.1/11.6 for the production incident this
 * followed from).
 *
 * @returns `{ status: 'ok' }` once the database has responded
 */
async function health(_req: HttpRequest, _ctx: InvocationContext): Promise<unknown> {
  await prisma.$queryRaw`SELECT 1`;
  return { status: 'ok' };
}

app.http('health', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'health',
  handler: withHandler(health),
});
