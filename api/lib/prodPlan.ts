// Prod Goal / Ramping / Daily Plan data layer (Desktop, #146). Rules are pure in
// shared/prodPlan.ts and shared/workforce.ts; functions/prodPlan.ts handles HTTP.

import prisma from './prisma.js';
import { dbDateFromIso, goalsInForce, isoFromDbDate, loadGoalRows } from './prodGoals.js';
import { functionsFor } from './roster.js';
import {
  PULL_FUNCTIONS, attendanceSummary, goalInForce, simulatedDailyDrop, validateGoalChange, validateRamping,
  type DailyPlanView, type GoalRow, type ProdGoalsView, type RampingRow, type RampingView,
} from '../../shared/prodPlan.js';
import {
  TIME_OFF_CODE, WAREHOUSE_FUNCTIONS, isoDateOf, localMidnight, requiredHeadcount, runsOn, shiftHours, shiftProductiveHours,
  shiftWindow, shiftsForDate, simulatedSchedule, simulatedTarget, volumeUnit, type ShiftCode,
} from '../../shared/workforce.js';

const httpError = (code: string, status: number, data?: Record<string, unknown>) =>
  Object.assign(new Error(code), { status, ...(data && { data }) });

/** Roles counted as team members (same as the roster). */
const TEAM_ROLES = ['WORKER', 'IM'];
/** Largest target volume accepted. */
const MAX_TARGET = 10_000_000;

/** @returns today's calendar date on the server */
export function serverToday(): string {
  return isoDateOf(new Date());
}

/** @returns the display name of a function code */
function labelOf(code: string): string {
  return WAREHOUSE_FUNCTIONS.find((f) => f.code === code)?.label ?? code;
}

// ── Prod goals ───────────────────────────────────────────────────────────────────

/** Every function's goal now, its scheduled changes, and its past rates. */
export async function loadProdGoals(): Promise<ProdGoalsView> {
  const rows = await loadGoalRows();
  const today = serverToday();
  const codes = [...new Set(rows.map((r) => r.functionCode))].sort(
    (a, b) => WAREHOUSE_FUNCTIONS.findIndex((f) => f.code === a) - WAREHOUSE_FUNCTIONS.findIndex((f) => f.code === b),
  );
  return {
    today,
    functions: codes.map((code) => {
      const own = rows.filter((r) => r.functionCode === code);
      const current = goalInForce(own, code, today);
      return {
        functionCode: code,
        label: labelOf(code),
        current,
        upcoming: own.filter((r) => r.effectiveDate > today),
        history: own.filter((r) => r.effectiveDate <= today && r.id !== current?.id).reverse(),
      };
    }),
  };
}

/**
 * Sets a function's goal rate from a date (today or later). The unit and any secondary
 * rate carry over from the goal in force before that date. A change on a date that
 * already has a row replaces that row.
 *
 * @throws 400 INVALID_RATE / INVALID_DATE / BACKDATED; 404 NOT_FOUND for a function with no goal
 */
export async function setProdGoal(functionCode: string, rate: number, effectiveDate: string, userId: string): Promise<ProdGoalsView> {
  const error = validateGoalChange(rate, effectiveDate, serverToday());
  if (error) throw httpError(error, 400);

  const rows = await loadGoalRows();
  const base = goalInForce(rows, functionCode, effectiveDate) ?? rows.filter((r) => r.functionCode === functionCode).at(-1);
  if (!base) throw httpError('NOT_FOUND', 404);

  const date = dbDateFromIso(effectiveDate);
  await prisma.prodGoal.upsert({
    where: { functionCode_effectiveDate: { functionCode, effectiveDate: date } },
    create: { functionCode, rate, unit: base.unit, rate2: base.rate2, unit2: base.unit2, effectiveDate: date, setByZ: userId },
    update: { rate, setByZ: userId },
  });
  return loadProdGoals();
}

/** Cancels a scheduled (future) goal change. @throws 404 NOT_FOUND; 409 NOT_UPCOMING */
export async function cancelProdGoal(id: number): Promise<ProdGoalsView> {
  const row = await prisma.prodGoal.findUnique({ where: { id } });
  if (!row) throw httpError('NOT_FOUND', 404);
  if (isoFromDbDate(row.effectiveDate) <= serverToday()) throw httpError('NOT_UPCOMING', 409);
  await prisma.prodGoal.delete({ where: { id } });
  return loadProdGoals();
}

// ── Ramping ──────────────────────────────────────────────────────────────────────

type RampingRecord = { id: number; workerZ: string; functionCode: string; percent: number; startDate: Date; endDate: Date | null };

function toRampingRow(r: RampingRecord): RampingRow {
  return {
    id: r.id, workerZ: r.workerZ, functionCode: r.functionCode, percent: r.percent,
    startDate: isoFromDbDate(r.startDate), endDate: r.endDate ? isoFromDbDate(r.endDate) : null,
  };
}

/**
 * Current and upcoming ramping overrides for the department's team members, and the
 * team members an override can be added for.
 */
export async function loadRamping(departmentId: string): Promise<{ today: string; overrides: RampingView[]; workers: { zNumber: string; firstName: string; lastName: string }[]; functions: { code: string; label: string }[] }> {
  const today = serverToday();
  const [workers, rows] = await Promise.all([
    prisma.user.findMany({
      where: { departmentId, role: { in: TEAM_ROLES } },
      select: { zNumber: true, firstName: true, lastName: true },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    }),
    prisma.rampingOverride.findMany({
      where: { worker: { departmentId }, OR: [{ endDate: null }, { endDate: { gte: dbDateFromIso(today) } }] },
      include: { worker: { select: { firstName: true, lastName: true } } },
      orderBy: [{ startDate: 'asc' }],
    }),
  ]);
  return {
    today,
    overrides: rows.map((r) => ({ ...toRampingRow(r), firstName: r.worker.firstName, lastName: r.worker.lastName })),
    workers,
    functions: functionsFor(departmentId).map((f) => ({ code: f.code, label: f.label })),
  };
}

/** Throws unless the worker is a team member of the department. */
async function requireTeamMember(workerZ: string, departmentId: string): Promise<void> {
  const worker = await prisma.user.findFirst({ where: { zNumber: workerZ, departmentId, role: { in: TEAM_ROLES } }, select: { zNumber: true } });
  if (!worker) throw httpError('WORKER_NOT_FOUND', 404);
}

/** Validates a candidate override against the worker's others. @throws 400 / 409 */
async function checkRamping(candidate: RampingRow, departmentId: string): Promise<void> {
  if (!functionsFor(departmentId).some((f) => f.code === candidate.functionCode)) throw httpError('INVALID_FUNCTION', 400);
  const existing = (await prisma.rampingOverride.findMany({ where: { workerZ: candidate.workerZ } })).map(toRampingRow);
  const error = validateRamping(candidate, existing);
  if (error) throw httpError(error, error === 'RAMPING_OVERLAP' ? 409 : 400);
}

/** Adds a ramping override. @throws 404 WORKER_NOT_FOUND; 400 / 409 per validateRamping */
export async function addRamping(departmentId: string, input: Omit<RampingRow, 'id'>, userId: string) {
  await requireTeamMember(input.workerZ, departmentId);
  await checkRamping({ ...input, id: 0 }, departmentId);
  await prisma.rampingOverride.create({
    data: {
      workerZ: input.workerZ, functionCode: input.functionCode, percent: input.percent,
      startDate: dbDateFromIso(input.startDate), endDate: input.endDate ? dbDateFromIso(input.endDate) : null, setByZ: userId,
    },
  });
  return loadRamping(departmentId);
}

/** Loads an override of the department's team or throws 404. */
async function requireOverride(id: number, departmentId: string): Promise<RampingRow> {
  const row = await prisma.rampingOverride.findFirst({ where: { id, worker: { departmentId } } });
  if (!row) throw httpError('NOT_FOUND', 404);
  return toRampingRow(row);
}

/** Changes an override's percent and/or dates (e.g. ending it today). */
export async function editRamping(departmentId: string, id: number, patch: Partial<Pick<RampingRow, 'percent' | 'startDate' | 'endDate'>>, userId: string) {
  const current = await requireOverride(id, departmentId);
  const next: RampingRow = { ...current, ...patch };
  await checkRamping(next, departmentId);
  await prisma.rampingOverride.update({
    where: { id },
    data: {
      percent: next.percent, startDate: dbDateFromIso(next.startDate),
      endDate: next.endDate ? dbDateFromIso(next.endDate) : null, setByZ: userId,
    },
  });
  return loadRamping(departmentId);
}

/** Removes an override. */
export async function removeRamping(departmentId: string, id: number) {
  await requireOverride(id, departmentId);
  await prisma.rampingOverride.delete({ where: { id } });
  return loadRamping(departmentId);
}

// ── Daily plan ───────────────────────────────────────────────────────────────────

/** Scheduled / out / net for one department's shift, from the simulated schedule and roster Time Off. */
async function departmentStaffing(departmentId: string, isoDate: string, shift: ShiftCode) {
  const window = shiftWindow(shift, isoDate);
  const people = await prisma.user.findMany({
    where: { departmentId, homeShiftCode: shift, role: { in: TEAM_ROLES } },
    select: { zNumber: true },
  });
  const scheduled = people
    .map((p) => ({ zNumber: p.zNumber, scheduled: simulatedSchedule(p.zNumber, shift, isoDate) }))
    .filter((p) => p.scheduled);
  const timeOff = await prisma.functionAssignment.findMany({
    where: {
      workerZ: { in: scheduled.map((p) => p.zNumber) },
      date: localMidnight(isoDate),
      functionCode: TIME_OFF_CODE,
      OR: [{ shiftCode: shift }, { shiftCode: null, startTime: { gte: new Date(window.start), lt: new Date(window.end) } }],
    },
  });
  return attendanceSummary(
    scheduled.map((p) => ({
      scheduled: p.scheduled,
      segments: timeOff
        .filter((t) => t.workerZ === p.zNumber)
        .map((t) => ({ start: t.startTime.getTime(), end: t.endTime.getTime(), functionCode: t.functionCode, reasonCode: t.reasonCode, reasonText: t.reasonText })),
    })),
  );
}

/**
 * Everything the Daily Plan section shows for a date and shift: the simulated Daily Drop,
 * the department's staffing (scheduled minus whole-shift Time Off), other departments'
 * net headcount and targets (no per-worker detail), and the department's target lines.
 *
 * @throws 400 SHIFT_NOT_ON_DATE
 */
export async function loadDailyPlan(departmentId: string, isoDate: string, shift: ShiftCode): Promise<DailyPlanView> {
  if (!runsOn(shift, isoDate)) throw httpError('SHIFT_NOT_ON_DATE', 400);
  const date = dbDateFromIso(isoDate);
  const productiveHours = shiftProductiveHours(shift, isoDate);
  const hours = shiftHours(shift, isoDate);
  const [goals, targets, departments] = await Promise.all([
    goalsInForce(isoDate),
    prisma.dailyPlanTarget.findMany({ where: { date, shiftCode: shift } }),
    prisma.department.findMany({ orderBy: { id: 'asc' } }),
  ]);

  const drop = PULL_FUNCTIONS.flatMap((code) => {
    const goal = goals.get(code);
    const volume = simulatedDailyDrop(code, isoDate, goal?.rate ?? null);
    return volume != null && goal ? [{ functionCode: code, volume, unit: volumeUnit(goal.unit) }] : [];
  });

  const lines = functionsFor(departmentId).map((f) => {
    const goal: GoalRow | undefined = goals.get(f.code);
    const rate = goal?.rate ?? null;
    const entered = targets.find((t) => t.departmentId === departmentId && t.functionCode === f.code);
    const simulated = simulatedTarget(f.code, shift, isoDate, rate);
    const effective = entered?.targetVolume ?? simulated;
    return {
      functionCode: f.code,
      label: f.label,
      rate,
      unit: entered?.unit ?? (goal ? volumeUnit(goal.unit) : null),
      target: entered?.targetVolume ?? null,
      simulatedTarget: simulated,
      requiredHeadcount: effective != null && rate != null ? requiredHeadcount(effective, rate, hours) : null,
    };
  });

  const otherDepartments = [];
  for (const d of departments.filter((dep) => dep.id !== departmentId)) {
    const staffing = await departmentStaffing(d.id, isoDate, shift);
    const theirTargets = targets.filter((t) => t.departmentId === d.id);
    if (staffing.scheduled === 0 && theirTargets.length === 0) continue;
    otherDepartments.push({
      departmentId: d.id,
      name: d.name,
      net: staffing.net,
      targets: theirTargets.map((t) => ({ functionCode: t.functionCode, targetVolume: t.targetVolume, unit: t.unit })),
    });
  }

  return {
    date: isoDate, shiftCode: shift, shiftsOnDate: shiftsForDate(isoDate), departmentId, productiveHours, shiftHours: hours,
    drop, staffing: await departmentStaffing(departmentId, isoDate, shift), otherDepartments, lines,
  };
}

/**
 * Saves the department's targets for a date and shift. A null volume removes the entered
 * target (the roster goes back to the simulated one). Never touches another department.
 *
 * @throws 400 INVALID_FUNCTION / INVALID_TARGET / SHIFT_NOT_ON_DATE
 */
export async function saveDailyPlan(
  departmentId: string,
  isoDate: string,
  shift: ShiftCode,
  entries: { functionCode: string; targetVolume: number | null }[],
): Promise<DailyPlanView> {
  if (!runsOn(shift, isoDate)) throw httpError('SHIFT_NOT_ON_DATE', 400);
  const goals = await goalsInForce(isoDate);
  const allowed = new Set(functionsFor(departmentId).map((f) => f.code));
  for (const e of entries) {
    if (!allowed.has(e.functionCode)) throw httpError('INVALID_FUNCTION', 400);
    if (e.targetVolume != null && (!Number.isInteger(e.targetVolume) || e.targetVolume < 0 || e.targetVolume > MAX_TARGET)) {
      throw httpError('INVALID_TARGET', 400);
    }
  }

  const date = dbDateFromIso(isoDate);
  await prisma.$transaction(async (tx) => {
    for (const e of entries) {
      const key = { departmentId_functionCode_date_shiftCode: { departmentId, functionCode: e.functionCode, date, shiftCode: shift } };
      if (e.targetVolume == null) {
        await tx.dailyPlanTarget.deleteMany({ where: key.departmentId_functionCode_date_shiftCode });
        continue;
      }
      const goal = goals.get(e.functionCode);
      const unit = goal ? volumeUnit(goal.unit) : 'units';
      await tx.dailyPlanTarget.upsert({
        where: key,
        create: { departmentId, functionCode: e.functionCode, date, shiftCode: shift, targetVolume: e.targetVolume, unit },
        update: { targetVolume: e.targetVolume, unit },
      });
    }
  });
  return loadDailyPlan(departmentId, isoDate, shift);
}
