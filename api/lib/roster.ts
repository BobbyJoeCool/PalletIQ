// Job/Function Assignment data layer (Desktop, #145). The rules — shifts, segments,
// validation, staffing math, the simulated schedule and targets — are pure and live in
// shared/workforce.ts; this module reads and writes them. functions/roster.ts handles HTTP.

import prisma from './prisma.js';
import { writeScanLog } from './activityLog.js';
import { goalsInForce } from './prodGoals.js';
import {
  WAREHOUSE_FUNCTIONS, assignableCodes, breakWindows, isShiftCode, localMidnight, requiredHeadcount, runsOn,
  shiftHours, shiftProductiveHours, shiftWindow, shiftsForDate, simulatedSchedule, simulatedTarget, validateTimeline, volumeUnit,
  type RosterPlanLine, type RosterView, type RosterWorker, type Segment, type ShiftCode, type TimeSpan,
} from '../../shared/workforce.js';

const httpError = (code: string, status: number, data?: Record<string, unknown>) =>
  Object.assign(new Error(code), { status, ...(data && { data }) });

/** Roles that appear on the roster as team members (leads and managers run it, not work it). */
const ROSTER_ROLES = ['WORKER', 'IM'];

/** Job functions per department. Only the warehouse is designed so far (#145). */
const DEPARTMENT_FUNCTIONS: Record<string, readonly { code: string; label: string }[]> = {
  WHS: WAREHOUSE_FUNCTIONS,
};

/** @returns the department's job functions (empty where none are designed yet) */
export function functionsFor(departmentId: string): readonly { code: string; label: string }[] {
  return DEPARTMENT_FUNCTIONS[departmentId] ?? [];
}

/** The rows a timeline is stored as, for one worker on one shift. */
function rowsWhere(workerZ: string, isoDate: string, shiftCode: ShiftCode, window: TimeSpan) {
  // Rows written before this screen (IRP demo data) carry no shift; they belong to this
  // shift when they start inside its window.
  return {
    workerZ,
    date: localMidnight(isoDate),
    OR: [
      { shiftCode },
      { shiftCode: null, startTime: { gte: new Date(window.start), lt: new Date(window.end) } },
    ],
  };
}

/** @returns a stored row as a timeline section */
function toSegment(row: { startTime: Date; endTime: Date; functionCode: string; reasonCode: string | null; reasonText: string | null }): Segment {
  return { start: row.startTime.getTime(), end: row.endTime.getTime(), functionCode: row.functionCode, reasonCode: row.reasonCode, reasonText: row.reasonText };
}

/**
 * The roster for one date and shift of the viewer's department: the shift's timing, each
 * function's plan line, and every team member who is scheduled (simulated myTime) or
 * already has time on this shift, with their ramping and their timeline.
 *
 * @param shiftCode - a shift running on the date, or null for the viewer's default
 * @throws 400 SHIFT_NOT_ON_DATE if the shift does not run on that date
 */
export async function loadRoster(
  viewer: { zNumber: string; departmentId: string },
  isoDate: string,
  shiftCode: ShiftCode | null,
): Promise<RosterView> {
  const me = await prisma.user.findUnique({ where: { zNumber: viewer.zNumber }, select: { homeShiftCode: true } });
  const home = isShiftCode(me?.homeShiftCode) ? me.homeShiftCode : null;
  const shiftsOnDate = shiftsForDate(isoDate);
  const shift = shiftCode ?? (home && runsOn(home, isoDate) ? home : shiftsOnDate.day);
  if (!runsOn(shift, isoDate)) throw httpError('SHIFT_NOT_ON_DATE', 400);

  const window = shiftWindow(shift, isoDate);
  const breaks = breakWindows(shift, isoDate);
  const productiveHours = shiftProductiveHours(shift, isoDate);
  const hours = shiftHours(shift, isoDate);
  const date = localMidnight(isoDate);
  const functions = functionsFor(viewer.departmentId);

  const [goals, targets, homeWorkers, assigned] = await Promise.all([
    goalsInForce(isoDate),
    prisma.dailyPlanTarget.findMany({ where: { departmentId: viewer.departmentId, date, shiftCode: shift } }),
    prisma.user.findMany({
      where: { departmentId: viewer.departmentId, homeShiftCode: shift, role: { in: ROSTER_ROLES } },
      select: { zNumber: true, firstName: true, lastName: true, role: true },
    }),
    prisma.functionAssignment.findMany({
      where: {
        date,
        worker: { departmentId: viewer.departmentId },
        OR: [{ shiftCode: shift }, { shiftCode: null, startTime: { gte: new Date(window.start), lt: new Date(window.end) } }],
      },
      orderBy: { startTime: 'asc' },
      include: { worker: { select: { zNumber: true, firstName: true, lastName: true, role: true } } },
    }),
  ]);

  const targetBy = new Map(targets.map((t) => [t.functionCode, t]));
  const plan: RosterPlanLine[] = functions.map((f) => {
    const goal = goals.get(f.code);
    const rate = goal ? goal.rate : null;
    const entered = targetBy.get(f.code);
    const target = entered ? entered.targetVolume : simulatedTarget(f.code, shift, isoDate, rate);
    return {
      functionCode: f.code,
      label: f.label,
      rate,
      unit: entered?.unit ?? (goal ? volumeUnit(goal.unit) : null),
      target,
      simulated: !entered && target != null,
      requiredHeadcount: target != null && rate != null ? requiredHeadcount(target, rate, hours) : null,
    };
  });

  // Everyone scheduled, plus anyone with time on this shift even if not scheduled for it.
  const people = new Map<string, { zNumber: string; firstName: string; lastName: string; role: string }>();
  for (const w of homeWorkers) {
    if (simulatedSchedule(w.zNumber, shift, isoDate)) people.set(w.zNumber, w);
  }
  for (const row of assigned) people.set(row.worker.zNumber, row.worker);

  const ramping = await prisma.rampingOverride.findMany({
    where: { workerZ: { in: [...people.keys()] }, startDate: { lte: date }, OR: [{ endDate: null }, { endDate: { gte: date } }] },
    select: { workerZ: true, functionCode: true, percent: true },
  });

  const workers: RosterWorker[] = [...people.values()]
    .map((p) => ({
      ...p,
      scheduled: homeWorkers.some((w) => w.zNumber === p.zNumber) ? simulatedSchedule(p.zNumber, shift, isoDate) : null,
      ramping: ramping.filter((r) => r.workerZ === p.zNumber).map(({ functionCode, percent }) => ({ functionCode, percent })),
      segments: assigned.filter((row) => row.workerZ === p.zNumber).map(toSegment),
    }))
    .sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName));

  return {
    date: isoDate, shiftCode: shift, shiftsOnDate, window, breaks, productiveHours, shiftHours: hours,
    departmentId: viewer.departmentId, plan, workers,
  };
}

/**
 * Saves new timelines for some workers on one date and shift, all or nothing. Each
 * timeline replaces that worker's stored sections for the shift. Every change to a worker
 * who already had sections is logged to ScanLog (`FUNC_ASSIGN_CHANGE`, before and after);
 * a worker's first assignment of the shift is not, since there is no "before".
 *
 * @throws 400 with the validation error code (and `workerZ`) for an invalid timeline;
 *   400 SHIFT_NOT_ON_DATE; 404 WORKER_NOT_FOUND for someone outside the viewer's department
 */
export async function saveTimelines(
  viewer: { zNumber: string; departmentId: string },
  isoDate: string,
  shiftCode: ShiftCode,
  updates: { workerZ: string; segments: Segment[] }[],
): Promise<RosterView> {
  if (!runsOn(shiftCode, isoDate)) throw httpError('SHIFT_NOT_ON_DATE', 400);
  const window = shiftWindow(shiftCode, isoDate);
  const allowed = assignableCodes(functionsFor(viewer.departmentId));

  for (const u of updates) {
    const error = validateTimeline(u.segments, window, allowed);
    if (error) throw httpError(error, 400, { workerZ: u.workerZ });
  }

  const workers = await prisma.user.findMany({
    where: { zNumber: { in: updates.map((u) => u.workerZ) }, departmentId: viewer.departmentId, role: { in: ROSTER_ROLES } },
    select: { zNumber: true },
  });
  const known = new Set(workers.map((w) => w.zNumber));
  const unknown = updates.find((u) => !known.has(u.workerZ));
  if (unknown) throw httpError('WORKER_NOT_FOUND', 404, { workerZ: unknown.workerZ });

  const date = localMidnight(isoDate);
  await prisma.$transaction(async (tx) => {
    for (const u of updates) {
      const where = rowsWhere(u.workerZ, isoDate, shiftCode, window);
      const before = (await tx.functionAssignment.findMany({ where, orderBy: { startTime: 'asc' } })).map(toSegment);
      await tx.functionAssignment.deleteMany({ where });
      if (u.segments.length > 0) {
        await tx.functionAssignment.createMany({
          data: u.segments.map((s) => ({
            workerZ: u.workerZ, functionCode: s.functionCode, date, shiftCode,
            startTime: new Date(s.start), endTime: new Date(s.end), assignedByZ: viewer.zNumber,
            reasonCode: s.reasonCode, reasonText: s.reasonText?.trim() || null,
          })),
        });
      }
      if (before.length > 0) {
        await writeScanLog(tx, {
          zNumber: viewer.zNumber,
          actionType: 'FUNC_ASSIGN_CHANGE',
          details: { workerZ: u.workerZ, date: isoDate, shiftCode, before, after: u.segments },
        });
      }
    }
  });

  return loadRoster(viewer, isoDate, shiftCode);
}
