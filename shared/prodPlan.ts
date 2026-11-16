// Prod Goal / Ramping / Daily Plan rules (Desktop, GitHub #146). Pure — no Prisma, no
// HTTP, no clock reads. Dates are calendar dates as "YYYY-MM-DD" strings, which compare
// correctly as strings.

import { ZERO_TIME_TOLERANCE, gapsIn, stableFraction, TIME_OFF_CODE, type Segment, type TimeSpan } from './workforce.js';

// ── Prod goals (dated history) ────────────────────────────────────────────────────

/** One prod goal row: a function's rate from its effective date until the next row. */
export interface GoalRow {
  id: number;
  functionCode: string;
  rate: number;
  unit: string;
  rate2: number | null;
  unit2: string | null;
  effectiveDate: string;
}

/** Highest rate a goal may be set to. */
export const MAX_GOAL_RATE = 100_000;

/**
 * The goal in force for a function on a date: the row with the latest effective date on
 * or before it (decided 2026-11-16: goal changes keep history; reports use the rate in
 * force on the day being viewed).
 *
 * @returns the row, or null if the function has no goal yet on that date
 */
export function goalInForce<T extends Pick<GoalRow, 'functionCode' | 'effectiveDate'>>(rows: readonly T[], functionCode: string, isoDate: string): T | null {
  let best: T | null = null;
  for (const row of rows) {
    if (row.functionCode !== functionCode || row.effectiveDate > isoDate) continue;
    if (!best || row.effectiveDate > best.effectiveDate) best = row;
  }
  return best;
}

/** @returns every function code that has a goal row */
export function goalFunctions(rows: readonly Pick<GoalRow, 'functionCode'>[]): string[] {
  return [...new Set(rows.map((r) => r.functionCode))];
}

/**
 * Checks a goal change: a positive rate (two decimals at most) effective today or later —
 * back-dating is not allowed (decided 2026-11-16).
 *
 * @returns an error code, or null if valid
 */
export function validateGoalChange(rate: number, effectiveDate: string, today: string): string | null {
  if (!Number.isFinite(rate) || rate <= 0 || rate > MAX_GOAL_RATE) return 'INVALID_RATE';
  if (Math.round(rate * 100) !== rate * 100) return 'INVALID_RATE';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)) return 'INVALID_DATE';
  if (effectiveDate < today) return 'BACKDATED';
  return null;
}

// ── Ramping overrides ────────────────────────────────────────────────────────────

/** A worker producing at a share of a function's goal while ramping up. */
export interface RampingRow {
  id: number;
  workerZ: string;
  functionCode: string;
  percent: number;
  startDate: string;
  /** Null = open-ended. */
  endDate: string | null;
}

/** @returns true if the override applies on that date */
export function rampingActiveOn(row: Pick<RampingRow, 'startDate' | 'endDate'>, isoDate: string): boolean {
  return row.startDate <= isoDate && (row.endDate == null || row.endDate >= isoDate);
}

/** @returns true if two date ranges (end null = open-ended) share at least one day */
export function dateRangesOverlap(
  a: Pick<RampingRow, 'startDate' | 'endDate'>,
  b: Pick<RampingRow, 'startDate' | 'endDate'>,
): boolean {
  const aEnd = a.endDate ?? '9999-12-31';
  const bEnd = b.endDate ?? '9999-12-31';
  return a.startDate <= bEnd && b.startDate <= aEnd;
}

/**
 * Checks a ramping override against the worker's others: percent 1–99, a start date, an
 * end date (if any) on or after it, and no overlap with another override for the same
 * worker and function (one at a time — decided 2026-11-16).
 *
 * @param candidate - the new or edited override (`id` 0 for a new one)
 * @param existing - that worker's other overrides (any function)
 * @returns an error code, or null if valid
 */
export function validateRamping(candidate: Omit<RampingRow, 'id'> & { id: number }, existing: readonly RampingRow[]): string | null {
  if (!Number.isInteger(candidate.percent) || candidate.percent < 1 || candidate.percent > 99) return 'INVALID_PERCENT';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(candidate.startDate)) return 'INVALID_DATE';
  if (candidate.endDate != null && (!/^\d{4}-\d{2}-\d{2}$/.test(candidate.endDate) || candidate.endDate < candidate.startDate)) return 'INVALID_DATE';
  const clash = existing.some(
    (r) => r.id !== candidate.id && r.workerZ === candidate.workerZ && r.functionCode === candidate.functionCode && dateRangesOverlap(r, candidate),
  );
  return clash ? 'RAMPING_OVERLAP' : null;
}

// ── Daily plan ───────────────────────────────────────────────────────────────────

/** Functions driven by store orders, so the Daily Drop has a volume for them. */
export const PULL_FUNCTIONS: readonly string[] = ['CA', 'CF', 'FP', 'BKP', 'BK'];

/** Typical company-wide drop for a function, in goal-hours (headcount × hours) per day. */
const DROP_GOAL_HOURS: Record<string, number> = { CA: 300, CF: 220, FP: 110, BKP: 100, BK: 90 };

/**
 * The simulated Daily Drop: company-wide store-order volume for a pull function on a
 * date, in its goal unit — a typical day's goal-hours × the rate in force, varied ±20%
 * per date. Deterministic, so it never goes stale. Null for non-pull functions or without
 * a rate.
 */
export function simulatedDailyDrop(functionCode: string, isoDate: string, ratePerHour: number | null): number | null {
  const goalHours = DROP_GOAL_HOURS[functionCode];
  if (!goalHours || !ratePerHour) return null;
  const jitter = 0.8 + stableFraction(`drop|${functionCode}|${isoDate}`) * 0.4;
  return Math.round(goalHours * ratePerHour * jitter);
}

/** One person, as the staffing count needs them. */
export interface StaffingPerson {
  scheduled: TimeSpan | null;
  segments: Segment[];
}

/** Scheduled headcount, who is out (by attendance code), and the net available. */
export interface AttendanceSummary {
  scheduled: number;
  out: { code: string; count: number }[];
  net: number;
}

/**
 * Counts a shift's staffing: everyone scheduled, minus anyone whose whole scheduled time
 * is Time Off on the roster (decided 2026-11-16: attendance comes from the roster, not a
 * separate table). Someone out for part of the shift still counts as available. Each
 * person out is counted under the code covering the start of their shift.
 */
export function attendanceSummary(people: readonly StaffingPerson[]): AttendanceSummary {
  const out = new Map<string, number>();
  let scheduled = 0;
  for (const p of people) {
    if (!p.scheduled) continue;
    scheduled++;
    const timeOff = p.segments.filter((s) => s.functionCode === TIME_OFF_CODE);
    if (timeOff.length === 0 || gapsIn(timeOff, p.scheduled).some((g) => g.end - g.start > ZERO_TIME_TOLERANCE)) continue;
    const first = [...timeOff].sort((a, b) => a.start - b.start)[0];
    const code = first.reasonCode ?? TIME_OFF_CODE;
    out.set(code, (out.get(code) ?? 0) + 1);
  }
  const outList = [...out].map(([code, count]) => ({ code, count })).sort((a, b) => a.code.localeCompare(b.code));
  return { scheduled, out: outList, net: scheduled - outList.reduce((sum, o) => sum + o.count, 0) };
}

// ── API contract ─────────────────────────────────────────────────────────────────

/** GET /api/prod-goals — every function's goal now, upcoming changes and past rates. */
export interface ProdGoalsView {
  today: string;
  functions: {
    functionCode: string;
    label: string;
    current: GoalRow | null;
    upcoming: GoalRow[];
    history: GoalRow[];
  }[];
}

/** A ramping override with the worker's name, as listed on the screen. */
export interface RampingView extends RampingRow {
  firstName: string;
  lastName: string;
}

/** GET /api/daily-plan — reference panels and target entry for one date and shift. */
export interface DailyPlanView {
  date: string;
  shiftCode: string;
  shiftsOnDate: { day: string; night: string };
  departmentId: string;
  productiveHours: number;
  drop: { functionCode: string; volume: number; unit: string }[];
  staffing: AttendanceSummary;
  otherDepartments: { departmentId: string; name: string; net: number; targets: { functionCode: string; targetVolume: number; unit: string }[] }[];
  lines: {
    functionCode: string;
    label: string;
    rate: number | null;
    unit: string | null;
    /** The OM/LWW-entered target, or null if none (the roster then uses `simulatedTarget`). */
    target: number | null;
    simulatedTarget: number | null;
    requiredHeadcount: number | null;
  }[];
}
