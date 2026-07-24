import { app } from '@azure/functions';
import type { HttpRequest } from '@azure/functions';
import { withHandler } from '../lib/response.js';
import { requireAuth } from '../lib/permissions.js';
import { getIndividualSummary, getIndividualHourly, FUNCTION_ORDER } from '../lib/irpReporting.js';

/**
 * IRP summary — today's per-function productivity for the logged-in worker only. All
 * roles see the same shape; the worker is always the authenticated caller (`auth.zNumber`),
 * never a client-supplied id, per the "own-activity-only" pattern every scoped reporting
 * endpoint in this app follows.
 */
async function getIndividualReportSummary(req: HttpRequest): Promise<unknown> {
  const auth = await requireAuth(req);
  return getIndividualSummary(auth.zNumber);
}

/**
 * IRP hour-by-hour zoom-in for one function, today, logged-in worker only.
 * @throws 404 NOT_FOUND if functionCode isn't one of IRP's 9 known codes
 */
async function getIndividualReportHourly(req: HttpRequest): Promise<unknown> {
  const auth = await requireAuth(req);
  const functionCode = (req.params.functionCode ?? '').toUpperCase();
  if (!(FUNCTION_ORDER as readonly string[]).includes(functionCode)) {
    throw Object.assign(new Error('NOT_FOUND'), { status: 404 });
  }
  const rows = await getIndividualHourly(auth.zNumber, functionCode);
  return { functionCode, rows };
}

app.http('getIndividualReportSummary', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'reporting/individual',
  handler: withHandler(getIndividualReportSummary),
});

app.http('getIndividualReportHourly', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'reporting/individual/{functionCode}/hourly',
  handler: withHandler(getIndividualReportHourly),
});
