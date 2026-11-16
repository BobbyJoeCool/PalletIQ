import { app } from '../lib/functionsRuntime.js';
import type { HttpRequest } from '../lib/functionsRuntime.js';
import { withHandler } from '../lib/response.js';
import { requireDesktopAccess, type DesktopActor } from '../lib/desktopAccess.js';
import { hasMinRole } from '../lib/permissions.js';
import { loadRoster, saveTimelines } from '../lib/roster.js';
import { isShiftCode, type Segment } from '../../shared/workforce.js';

// Job/Function Assignment (Desktop, #145). LWW, OM and Admin only — ICQA is excluded
// unless they hold one of those roles themselves (design + decision 2026-11-16). Each
// viewer sees and edits their own home department's roster.

const invalid = () => Object.assign(new Error('INVALID_INPUT'), { status: 400 });

/** Longest list of workers one save may carry. */
const MAX_WORKERS_PER_SAVE = 200;

/** Authenticates and requires LEAD (LWW) or higher. */
async function requireRosterAccess(req: HttpRequest): Promise<DesktopActor> {
  const actor = await requireDesktopAccess(req);
  if (!hasMinRole(actor.role, 'LEAD')) throw Object.assign(new Error('FORBIDDEN'), { status: 403 });
  return actor;
}

/** @returns a "YYYY-MM-DD" date, or throws 400 */
function parseIsoDate(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw invalid();
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) throw invalid();
  return value;
}

/** Reads one timeline section from untrusted JSON. */
function parseSegment(raw: unknown): Segment {
  if (typeof raw !== 'object' || raw === null) throw invalid();
  const r = raw as Record<string, unknown>;
  if (typeof r.start !== 'number' || typeof r.end !== 'number') throw invalid();
  if (typeof r.functionCode !== 'string') throw invalid();
  const reasonCode = r.reasonCode == null ? null : typeof r.reasonCode === 'string' ? r.reasonCode : null;
  const reasonText = r.reasonText == null ? null : typeof r.reasonText === 'string' ? r.reasonText : null;
  if (r.reasonCode != null && reasonCode == null) throw invalid();
  if (r.reasonText != null && reasonText == null) throw invalid();
  return { start: r.start, end: r.end, functionCode: r.functionCode, reasonCode, reasonText };
}

/**
 * GET /api/roster?date=YYYY-MM-DD&shift=B1 — the roster, plan and timelines. `shift` is
 * optional (defaults to the viewer's home shift, or the date's day shift).
 */
async function getRoster(req: HttpRequest): Promise<unknown> {
  const actor = await requireRosterAccess(req);
  const params = new URL(req.url).searchParams;
  const shift = params.get('shift');
  if (shift != null && !isShiftCode(shift)) throw invalid();
  return loadRoster(actor, parseIsoDate(params.get('date')), shift);
}

/**
 * PUT /api/roster — body `{ date, shiftCode, timelines: [{ workerZ, segments }] }`. Each
 * timeline replaces that worker's sections for the shift; all succeed or none do.
 */
async function putRoster(req: HttpRequest): Promise<unknown> {
  const actor = await requireRosterAccess(req);
  const body = (await req.json()) as Record<string, unknown> | null;
  if (!body || !isShiftCode(body.shiftCode) || !Array.isArray(body.timelines)) throw invalid();
  if (body.timelines.length === 0 || body.timelines.length > MAX_WORKERS_PER_SAVE) throw invalid();
  const updates = body.timelines.map((raw) => {
    if (typeof raw !== 'object' || raw === null) throw invalid();
    const t = raw as Record<string, unknown>;
    if (typeof t.workerZ !== 'string' || !Array.isArray(t.segments)) throw invalid();
    return { workerZ: t.workerZ, segments: t.segments.map(parseSegment) };
  });
  if (new Set(updates.map((u) => u.workerZ)).size !== updates.length) throw invalid();
  return saveTimelines(actor, parseIsoDate(body.date), body.shiftCode, updates);
}

app.http('getRoster', { methods: ['GET'], authLevel: 'anonymous', route: 'roster', handler: withHandler(getRoster) });
app.http('putRoster', { methods: ['PUT'], authLevel: 'anonymous', route: 'roster', handler: withHandler(putRoster) });
