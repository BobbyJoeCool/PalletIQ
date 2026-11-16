import { app } from '../lib/functionsRuntime.js';
import type { HttpRequest } from '../lib/functionsRuntime.js';
import { withHandler } from '../lib/response.js';
import { requireDesktopAccess, type DesktopActor } from '../lib/desktopAccess.js';
import { hasMinRole } from '../lib/permissions.js';
import {
  addRamping, cancelProdGoal, editRamping, loadDailyPlan, loadProdGoals, loadRamping, removeRamping, saveDailyPlan,
  serverToday, setProdGoal,
} from '../lib/prodPlan.js';
import { defaultShiftFor, isShiftCode } from '../../shared/workforce.js';
import prisma from '../lib/prisma.js';

// Prod Goal / Ramping / Daily Plan (Desktop, #146). Who may do what (decided 2026-11-16):
//   - open the screen, edit ramping overrides and Daily Plan targets: LWW, OM, Admin
//   - change prod goal rates: OM and Admin only
// ICQA is excluded unless they hold one of those roles. Ramping and targets are scoped to
// the viewer's home department; prod goals are global.

const invalid = () => Object.assign(new Error('INVALID_INPUT'), { status: 400 });
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

async function requireLeadOrAbove(req: HttpRequest): Promise<DesktopActor> {
  const actor = await requireDesktopAccess(req);
  if (!hasMinRole(actor.role, 'LEAD')) throw Object.assign(new Error('FORBIDDEN'), { status: 403 });
  return actor;
}

function requireManager(actor: DesktopActor): void {
  if (!hasMinRole(actor.role, 'MANAGER')) throw Object.assign(new Error('FORBIDDEN'), { status: 403 });
}

async function body(req: HttpRequest): Promise<Record<string, unknown>> {
  const b = (await req.json()) as unknown;
  if (typeof b !== 'object' || b === null || Array.isArray(b)) throw invalid();
  return b as Record<string, unknown>;
}

function isoDate(value: unknown): string {
  if (typeof value !== 'string' || !DATE_RE.test(value)) throw invalid();
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) throw invalid();
  return value;
}

function idParam(req: HttpRequest): number {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) throw invalid();
  return id;
}

/** GET /api/prod-goals */
async function getProdGoals(req: HttpRequest): Promise<unknown> {
  await requireLeadOrAbove(req);
  return loadProdGoals();
}

/** POST /api/prod-goals — `{ functionCode, rate, effectiveDate }` (OM / Admin). */
async function postProdGoal(req: HttpRequest): Promise<unknown> {
  const actor = await requireLeadOrAbove(req);
  requireManager(actor);
  const b = await body(req);
  if (typeof b.functionCode !== 'string' || typeof b.rate !== 'number') throw invalid();
  return setProdGoal(b.functionCode, b.rate, isoDate(b.effectiveDate), actor.zNumber);
}

/** DELETE /api/prod-goals/{id} — cancel a scheduled change (OM / Admin). */
async function deleteProdGoal(req: HttpRequest): Promise<unknown> {
  const actor = await requireLeadOrAbove(req);
  requireManager(actor);
  return cancelProdGoal(idParam(req));
}

/** GET /api/ramping */
async function getRamping(req: HttpRequest): Promise<unknown> {
  const actor = await requireLeadOrAbove(req);
  return loadRamping(actor.departmentId);
}

/** POST /api/ramping — `{ workerZ, functionCode, percent, startDate, endDate? }`. */
async function postRamping(req: HttpRequest): Promise<unknown> {
  const actor = await requireLeadOrAbove(req);
  const b = await body(req);
  if (typeof b.workerZ !== 'string' || typeof b.functionCode !== 'string' || typeof b.percent !== 'number') throw invalid();
  return addRamping(actor.departmentId, {
    workerZ: b.workerZ, functionCode: b.functionCode, percent: b.percent,
    startDate: isoDate(b.startDate ?? serverToday()), endDate: b.endDate == null ? null : isoDate(b.endDate),
  }, actor.zNumber);
}

/** PATCH /api/ramping/{id} — any of `{ percent, startDate, endDate }` (endDate null = open-ended). */
async function patchRamping(req: HttpRequest): Promise<unknown> {
  const actor = await requireLeadOrAbove(req);
  const b = await body(req);
  const patch: { percent?: number; startDate?: string; endDate?: string | null } = {};
  if (b.percent !== undefined) {
    if (typeof b.percent !== 'number') throw invalid();
    patch.percent = b.percent;
  }
  if (b.startDate !== undefined) patch.startDate = isoDate(b.startDate);
  if (b.endDate !== undefined) patch.endDate = b.endDate === null ? null : isoDate(b.endDate);
  return editRamping(actor.departmentId, idParam(req), patch, actor.zNumber);
}

/** DELETE /api/ramping/{id} */
async function deleteRamping(req: HttpRequest): Promise<unknown> {
  const actor = await requireLeadOrAbove(req);
  return removeRamping(actor.departmentId, idParam(req));
}

/** GET /api/daily-plan?date=YYYY-MM-DD&shift=B1 — `shift` optional (viewer's default). */
async function getDailyPlan(req: HttpRequest): Promise<unknown> {
  const actor = await requireLeadOrAbove(req);
  const params = new URL(req.url).searchParams;
  const date = isoDate(params.get('date'));
  const shiftParam = params.get('shift');
  if (shiftParam != null && !isShiftCode(shiftParam)) throw invalid();
  let shift = shiftParam;
  if (!shift) {
    const me = await prisma.user.findUnique({ where: { zNumber: actor.zNumber }, select: { homeShiftCode: true } });
    shift = defaultShiftFor(isShiftCode(me?.homeShiftCode) ? me.homeShiftCode : null, date);
  }
  return loadDailyPlan(actor.departmentId, date, shift);
}

/** PUT /api/daily-plan — `{ date, shiftCode, targets: [{ functionCode, targetVolume | null }] }`. */
async function putDailyPlan(req: HttpRequest): Promise<unknown> {
  const actor = await requireLeadOrAbove(req);
  const b = await body(req);
  if (!isShiftCode(b.shiftCode) || !Array.isArray(b.targets) || b.targets.length > 50) throw invalid();
  const targets = b.targets.map((raw) => {
    if (typeof raw !== 'object' || raw === null) throw invalid();
    const t = raw as Record<string, unknown>;
    if (typeof t.functionCode !== 'string') throw invalid();
    if (t.targetVolume !== null && typeof t.targetVolume !== 'number') throw invalid();
    return { functionCode: t.functionCode, targetVolume: t.targetVolume as number | null };
  });
  return saveDailyPlan(actor.departmentId, isoDate(b.date), b.shiftCode, targets);
}

app.http('getProdGoals', { methods: ['GET'], authLevel: 'anonymous', route: 'prod-goals', handler: withHandler(getProdGoals) });
app.http('postProdGoal', { methods: ['POST'], authLevel: 'anonymous', route: 'prod-goals', handler: withHandler(postProdGoal) });
app.http('deleteProdGoal', { methods: ['DELETE'], authLevel: 'anonymous', route: 'prod-goals/{id}', handler: withHandler(deleteProdGoal) });
app.http('getRamping', { methods: ['GET'], authLevel: 'anonymous', route: 'ramping', handler: withHandler(getRamping) });
app.http('postRamping', { methods: ['POST'], authLevel: 'anonymous', route: 'ramping', handler: withHandler(postRamping) });
app.http('patchRamping', { methods: ['PATCH'], authLevel: 'anonymous', route: 'ramping/{id}', handler: withHandler(patchRamping) });
app.http('deleteRamping', { methods: ['DELETE'], authLevel: 'anonymous', route: 'ramping/{id}', handler: withHandler(deleteRamping) });
app.http('getDailyPlan', { methods: ['GET'], authLevel: 'anonymous', route: 'daily-plan', handler: withHandler(getDailyPlan) });
app.http('putDailyPlan', { methods: ['PUT'], authLevel: 'anonymous', route: 'daily-plan', handler: withHandler(putDailyPlan) });
