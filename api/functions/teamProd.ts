import { app } from '../lib/functionsRuntime.js';
import type { HttpRequest } from '../lib/functionsRuntime.js';
import { withHandler } from '../lib/response.js';
import { requireDesktopAccess } from '../lib/desktopAccess.js';
import { loadTeamProd } from '../lib/teamProd.js';
import { isShiftCode } from '../../shared/workforce.js';

// Team Prod Summary (Desktop, #147). Read-only; every desktop user — LWW, OM, Admin and
// ICQA — per the design (no ICQA exclusion here).

const invalid = () => Object.assign(new Error('INVALID_INPUT'), { status: 400 });

/** GET /api/team-prod?date=YYYY-MM-DD&shift=B1 — `shift` optional (viewer's default). */
async function getTeamProd(req: HttpRequest): Promise<unknown> {
  const actor = await requireDesktopAccess(req);
  const params = new URL(req.url).searchParams;
  const date = params.get('date');
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw invalid();
  const shift = params.get('shift');
  if (shift != null && !isShiftCode(shift)) throw invalid();
  return loadTeamProd(actor, date, shift);
}

app.http('getTeamProd', { methods: ['GET'], authLevel: 'anonymous', route: 'team-prod', handler: withHandler(getTeamProd) });
