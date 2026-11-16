// Team Prod Summary data layer (Desktop, #147). Read-only. Builds on the Job/Function
// Assignment roster (who is on what, plan lines, ramping) and counts actual output from
// ActivityLog the same way IRP does (lib/irpUnits.ts). Rules are pure in shared/teamProd.ts.

import prisma from './prisma.js';
import { countFunctionUnits } from './irpUnits.js';
import { GREYED_FUNCTIONS, type FunctionCode } from './irpReporting.js';
import { functionsFor, loadRoster } from './roster.js';
import {
  estimateFinish, expectedUnits, msOnFunction, percentToPlan, staffedOn, teamProdPercent,
  type TeamProdCard, type TeamProdView, type TeamProdWorker,
} from '../../shared/teamProd.js';
import { DOWNTIME_CODE, WAREHOUSE_FUNCTIONS, type ShiftCode } from '../../shared/workforce.js';

const HOUR = 3_600_000;
/** Department shown to a viewer whose own department has no function list yet (e.g. ICQA). */
const FALLBACK_DEPARTMENT = 'WHS';

/**
 * Team Prod Summary for one date and shift: a card per function with staffing, actual
 * output, Team Prod % (actual vs the ramping-weighted standard), % to Plan and, for pull
 * functions during the shift, an estimated finish; plus a Downtime card. Figures are as of
 * now during the shift, or as of its end for a past shift.
 *
 * @param now - injected clock (defaults to the real one)
 */
export async function loadTeamProd(
  viewer: { zNumber: string; departmentId: string },
  isoDate: string,
  shift: ShiftCode | null,
  now: number = Date.now(),
): Promise<TeamProdView> {
  const ownHasFunctions = functionsFor(viewer.departmentId).length > 0;
  const departmentId = ownHasFunctions ? viewer.departmentId : FALLBACK_DEPARTMENT;
  const roster = await loadRoster({ zNumber: viewer.zNumber, departmentId }, isoDate, shift);
  const { window } = roster;
  const asOf = Math.min(Math.max(now, window.start), window.end);
  const live = now >= window.start && now < window.end;
  // A headcount "at the end" means the last instant of the shift.
  const staffingAt = asOf >= window.end ? window.end - 1 : asOf;

  const zNumbers = roster.workers.map((w) => w.zNumber);
  const logs = zNumbers.length === 0 || asOf <= window.start
    ? []
    : await prisma.activityLog.findMany({
        where: {
          userId: { in: zNumbers },
          functionCode: { in: WAREHOUSE_FUNCTIONS.map((f) => f.code) },
          timestamp: { gte: new Date(window.start), lt: new Date(asOf) },
        },
        select: { userId: true, functionCode: true, locationAisle: true, locationBin: true, locationLevel: true, details: true },
      });

  const timelines = roster.workers.map((w) => w.segments);
  const rampOf = (z: string, code: string) =>
    roster.workers.find((w) => w.zNumber === z)?.ramping.find((r) => r.functionCode === code)?.percent ?? null;

  const cards: TeamProdCard[] = WAREHOUSE_FUNCTIONS.filter((f) => functionsFor(departmentId).some((d) => d.code === f.code)).map((f) => {
    const line = roster.plan.find((p) => p.functionCode === f.code);
    const tracked = !GREYED_FUNCTIONS.has(f.code as FunctionCode);
    const rate = line?.rate ?? null;

    const workers: TeamProdWorker[] = roster.workers
      .map((w) => {
        const rows = logs.filter((l) => l.userId === w.zNumber && l.functionCode === f.code);
        const units = countFunctionUnits(f.code, rows);
        const count = f.tier === 'SCAN' ? units.primaryCount : units.goalCount;
        const hours = msOnFunction(w.segments, f.code, asOf) / HOUR;
        return {
          zNumber: w.zNumber, firstName: w.firstName, lastName: w.lastName,
          rampPercent: rampOf(w.zNumber, f.code),
          hours, count,
          ratePerHour: hours > 0 ? count / hours : null,
          pctToGoal: rate && hours > 0 ? (count / (rate * hours)) * 100 : null,
        };
      })
      .filter((w) => w.hours > 0 || w.count > 0)
      .sort((a, b) => b.count - a.count || a.lastName.localeCompare(b.lastName));

    const actual = tracked ? workers.reduce((sum, w) => sum + w.count, 0) : null;
    const teamHours = workers.reduce((sum, w) => sum + w.hours, 0);
    const members = roster.workers.map((w) => ({ segments: w.segments, rampPercent: rampOf(w.zNumber, f.code) ?? 100 }));
    const expected = rate != null ? expectedUnits(members, f.code, rate, asOf) : 0;
    const target = f.tier === 'SCAN' ? null : line?.target ?? null;

    let finish = null;
    if (f.tier === 'PULL' && live && actual != null && target != null) {
      const elapsedHours = (asOf - window.start) / HOUR;
      finish = estimateFinish(target - actual, elapsedHours > 0 ? actual / elapsedHours : 0, asOf, window.end);
    }

    return {
      functionCode: f.code,
      label: f.label,
      tier: f.tier,
      unit: f.tier === 'SCAN' ? 'pallets' : line?.unit ?? null,
      tracked,
      staffed: staffedOn(timelines, f.code, staffingAt),
      ramping: roster.workers.filter((w) => rampOf(w.zNumber, f.code) != null && w.segments.some((s) => s.functionCode === f.code && s.start <= staffingAt && staffingAt < s.end)).length,
      rate,
      target,
      targetSimulated: target != null && (line?.simulated ?? false),
      actual,
      ratePerHour: actual != null && teamHours > 0 ? actual / teamHours : null,
      teamProdPct: actual != null && f.tier !== 'SCAN' ? teamProdPercent(actual, expected) : null,
      percentToPlan: actual != null ? percentToPlan(actual, target) : null,
      finish,
      workers,
    };
  });

  // Downtime: headcount and who, nothing to measure.
  const downtimeWorkers: TeamProdWorker[] = roster.workers
    .map((w) => ({ zNumber: w.zNumber, firstName: w.firstName, lastName: w.lastName, rampPercent: null, hours: msOnFunction(w.segments, DOWNTIME_CODE, asOf) / HOUR, count: 0, ratePerHour: null, pctToGoal: null }))
    .filter((w) => w.hours > 0)
    .sort((a, b) => a.lastName.localeCompare(b.lastName));
  cards.push({
    functionCode: DOWNTIME_CODE, label: 'Downtime', tier: 'OTHER', unit: null, tracked: false,
    staffed: staffedOn(timelines, DOWNTIME_CODE, staffingAt), ramping: 0, rate: null, target: null, targetSimulated: false,
    actual: null, ratePerHour: null, teamProdPct: null, percentToPlan: null, finish: null, workers: downtimeWorkers,
  });

  return {
    date: isoDate,
    shiftCode: roster.shiftCode,
    shiftsOnDate: roster.shiftsOnDate,
    window,
    departmentId,
    asOf,
    live,
    departmentNote: ownHasFunctions ? null : `Your department (${viewer.departmentId}) has no job functions defined yet, so ${FALLBACK_DEPARTMENT} is shown.`,
    cards,
  };
}
