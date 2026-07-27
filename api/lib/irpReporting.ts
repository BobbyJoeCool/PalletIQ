import prisma from './prisma.js';

/**
 * IRP aggregation — turns FunctionAssignment + ActivityLog rows into the per-function
 * summary/hourly shapes IRPPage.tsx renders. See DevNotes/DesignPrompts/IRP.md for the
 * full spec this implements.
 *
 * Backend intentionally returns raw named quantities (locations/cartons/pallets/puts)
 * rather than "primary/secondary/starred" labels — which raw field is emphasized and
 * what it's called ("Puts" vs "Pallets Staged" vs "Pallets Moved") differs per function
 * and is a presentation decision IRPPage.tsx already owns via IRP.md's exact per-function
 * Row Layout templates.
 */

/** Fixed default sort order (spec's List Ordering fallback) for functions with no activity today. */
export const FUNCTION_ORDER = ['CA', 'CF', 'FP', 'BKP', 'BK', 'RP', 'HP', 'GPM', 'CON'] as const;
export type FunctionCode = typeof FUNCTION_ORDER[number];

/** Bulk and Breakpack have no real pull flow anywhere in the app today (PIP only offers
 *  CA/CF/FP) — these always render the spec's "no assignment today" greyed/zero state,
 *  permanently, this version. No query is ever run for them. */
const GREYED_FUNCTIONS = new Set<FunctionCode>(['BKP', 'BK']);

/** The 7 functions with a real ActivityLog data path, and the actionType(s)/functionCode
 *  combination each one is queried by. */
const REAL_FUNCTION_QUERY: Record<string, { actionType: string }> = {
  CA:  { actionType: 'PULL' },
  CF:  { actionType: 'PULL' },
  FP:  { actionType: 'PULL' },
  RP:  { actionType: 'PUT' },
  HP:  { actionType: 'PUT' },
  GPM: { actionType: 'STAGE' },
  CON: { actionType: 'CONSOLID' },
};

export interface FunctionSummary {
  functionCode: string;
  /** Spec's permanent BK/BKP state, or "no assignment today" for a real function with
   *  neither an assignment nor activity. Goal-gradient renders neutral/black, not red-green. */
  greyed: boolean;
  /** Spec's "activity without an assignment" edge case — real counts show, but hours/
   *  rate/%-to-goal stay null (blank), guarded against divide-by-zero. */
  hasActivity: boolean;
  hasAssignment: boolean;
  locations: number | null;
  cartons: number | null;
  pallets: number | null;
  puts: number | null;
  density: number | null;
  ratePerHour: number | null;
  pctToGoal: number | null;
  hours: number;
  hoursOfWork: number | null;
  /** ISO timestamp of this function's first activity today, or null — drives sort order,
   *  not rendered directly. */
  firstActivityAt: string | null;
}

export interface HourlyRow {
  hourLabel: string; // e.g. "6AM-7AM"
  hourStart: string; // ISO
  summary: Omit<FunctionSummary, 'functionCode' | 'greyed' | 'hasAssignment' | 'firstActivityAt'>;
}

function greyedRow(functionCode: string): FunctionSummary {
  return {
    functionCode, greyed: true, hasActivity: false, hasAssignment: false,
    locations: 0, cartons: 0, pallets: 0, puts: 0, density: 0, ratePerHour: 0, pctToGoal: 0,
    hours: 0, hoursOfWork: 0, firstActivityAt: null,
  };
}

/** Rounds a fractional hour count to the nearest quarter hour, per spec's Formatting rule. */
function roundQuarterHour(hours: number): number {
  return Math.round(hours * 4) / 4;
}

/**
 * Combines same-function assignment blocks into one total (spec's "Multiple Assignment
 * Blocks" rule), capped at `now` so no unworked future time counts, rounded to the
 * nearest quarter hour.
 */
function hoursInFunction(blocks: { startTime: Date; endTime: Date }[], now: Date): number {
  let totalMs = 0;
  for (const b of blocks) {
    const end = b.endTime < now ? b.endTime : now;
    if (end > b.startTime) totalMs += end.getTime() - b.startTime.getTime();
  }
  return roundQuarterHour(totalMs / 3_600_000);
}

/** Midnight-normalized "today" and the current moment, for a single consistent query window. */
function todayWindow(now: Date): { dayStart: Date; today: Date } {
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return { dayStart, today: dayStart };
}

interface RawLogRow {
  timestamp: Date;
  palletId: number | null;
  locationAisle: number | null;
  locationBin: number | null;
  locationLevel: number | null;
  details: string | null;
}

/** Parses a PULL row's `details` JSON for the fields IRP needs; never throws on malformed JSON. */
function parsePulled(details: string | null): { pallets: number; cartons: number } {
  if (!details) return { pallets: 0, cartons: 0 };
  try {
    const d = JSON.parse(details) as { pulled?: { pallets?: number; cartons?: number } };
    return { pallets: d.pulled?.pallets ?? 0, cartons: d.pulled?.cartons ?? 0 };
  } catch {
    return { pallets: 0, cartons: 0 };
  }
}

/** Distinct Aisle+Bin+Level combinations among a set of log rows. */
function countDistinctLocations(rows: RawLogRow[]): number {
  const seen = new Set<string>();
  for (const r of rows) {
    if (r.locationAisle == null || r.locationBin == null || r.locationLevel == null) continue;
    seen.add(`${r.locationAisle}-${r.locationBin}-${r.locationLevel}`);
  }
  return seen.size;
}

/**
 * Computes one function's summary row from its today's-activity log rows, assignment
 * blocks, and goal rate. `now` caps hours-in-function; guards every rate/%-to-goal
 * against divide-by-zero per spec's edge cases.
 */
function summarize(
  functionCode: string,
  rows: RawLogRow[],
  assignments: { startTime: Date; endTime: Date }[],
  goal: { rate: number } | null,
  now: Date,
): FunctionSummary {
  const hasActivity = rows.length > 0;
  const hasAssignment = assignments.length > 0;
  if (!hasActivity && !hasAssignment) return greyedRow(functionCode);

  const hours = hasAssignment ? hoursInFunction(assignments, now) : 0;
  const firstActivityAt = hasActivity
    ? rows.reduce((min, r) => (r.timestamp < min ? r.timestamp : min), rows[0].timestamp).toISOString()
    : null;

  let locations: number | null = null;
  let cartons: number | null = null;
  let pallets: number | null = null;
  let puts: number | null = null;
  let goalCount = 0; // the count that feeds hours-of-work / % to goal

  if (functionCode === 'CA' || functionCode === 'CF') {
    const parsed = rows.map((r) => parsePulled(r.details));
    cartons = parsed.reduce((s, p) => s + p.cartons, 0);
    locations = countDistinctLocations(rows);
    goalCount = cartons;
  } else if (functionCode === 'FP') {
    const parsed = rows.map((r) => parsePulled(r.details));
    pallets = parsed.reduce((s, p) => s + p.pallets, 0);
    cartons = parsed.reduce((s, p) => s + p.cartons, 0);
    goalCount = pallets;
  } else if (functionCode === 'RP') {
    puts = rows.length;
    goalCount = puts;
  } else if (functionCode === 'HP') {
    locations = rows.length; // each Manual Put = one location; this IS the goal-metric count
    goalCount = locations;
    // Best-effort: a put moves a pallet's full current carton count, but ActivityLog's
    // PUT/MNP details don't capture cartons at put time, so this reads the pallet's
    // *current* count via its stored palletId. Can drift slightly stale if that same
    // pallet was pulled from again later the same day.
  } else if (functionCode === 'GPM') {
    pallets = rows.length; // one STAGE row per staged location = one pallet staged
  } else if (functionCode === 'CON') {
    pallets = rows.length; // one CONSOLID row = one pallet moved/merged away
  }

  let density: number | null = null;
  if (functionCode === 'CA' || functionCode === 'CF') {
    density = locations && locations > 0 ? (cartons ?? 0) / locations : 0;
  } else if (functionCode === 'FP') {
    density = pallets && pallets > 0 ? (cartons ?? 0) / pallets : 0;
  }
  // HP's density is computed by the caller once its best-effort cartons figure is filled in.

  // CA/CF set both `cartons` (the intended rate metric) and `locations` (a secondary
  // count) — the generic fallback chain below would pick `locations` first since
  // `cartons` is checked last, so CA/CF need their own explicit case (#131).
  const primaryCount = (functionCode === 'CA' || functionCode === 'CF')
    ? (cartons ?? 0)
    : (pallets ?? puts ?? locations ?? cartons ?? 0);
  const ratePerHour = hours > 0 ? primaryCount / hours : null;
  const hoursOfWork = goal && hours > 0 ? goalCount / goal.rate : (goal ? 0 : null);
  // Zero hours assigned isn't a 0%-to-goal score, it's "no data" — must stay null (not
  // 0) so goalBg() renders neutral grey instead of worst-case red (#132).
  const pctToGoal = goal && hours > 0 ? hoursOfWork! / hours : null;

  return {
    functionCode, greyed: false, hasActivity, hasAssignment,
    locations, cartons, pallets, puts, density, ratePerHour, pctToGoal, hours, hoursOfWork,
    firstActivityAt,
  };
}

/**
 * IRP summary: all 9 functions for one worker, today only. `functions` is pre-sorted
 * per spec's List Ordering (earliest first-activity-today at top; no-activity functions
 * fall back to FUNCTION_ORDER, appended after every active function).
 */
export async function getIndividualSummary(workerZ: string, now: Date = new Date()): Promise<{
  shiftStart: string | null;
  shiftEnd: string;
  functions: FunctionSummary[];
}> {
  const { dayStart } = todayWindow(now);

  const [assignments, goals, logRows] = await Promise.all([
    prisma.functionAssignment.findMany({
      where: { workerZ, date: dayStart },
      select: { functionCode: true, startTime: true, endTime: true },
    }),
    prisma.prodGoal.findMany({ select: { functionCode: true, rate: true } }),
    prisma.activityLog.findMany({
      where: {
        userId: workerZ,
        timestamp: { gte: dayStart },
        functionCode: { in: Object.keys(REAL_FUNCTION_QUERY) },
      },
      select: { functionCode: true, timestamp: true, palletId: true, locationAisle: true, locationBin: true, locationLevel: true, details: true },
      orderBy: { timestamp: 'asc' },
    }),
  ]);

  const goalByFunction = new Map(goals.map((g) => [g.functionCode, { rate: Number(g.rate) }]));
  const assignmentsByFunction = new Map<string, { startTime: Date; endTime: Date }[]>();
  for (const a of assignments) {
    const list = assignmentsByFunction.get(a.functionCode) ?? [];
    list.push({ startTime: a.startTime, endTime: a.endTime });
    assignmentsByFunction.set(a.functionCode, list);
  }
  const rowsByFunction = new Map<string, RawLogRow[]>();
  for (const r of logRows) {
    if (!r.functionCode) continue;
    const list = rowsByFunction.get(r.functionCode) ?? [];
    list.push(r);
    rowsByFunction.set(r.functionCode, list);
  }

  // HP's Cartons is a best-effort live read of each row's pallet — batch-fetch once.
  const hpPalletIds = [...new Set((rowsByFunction.get('HP') ?? []).map((r) => r.palletId).filter((id): id is number => id != null))];
  const hpPallets = hpPalletIds.length > 0
    ? await prisma.pallet.findMany({ where: { pid: { in: hpPalletIds } }, select: { pid: true, currentCartons: true } })
    : [];
  const hpCartonsByPid = new Map(hpPallets.map((p) => [p.pid, p.currentCartons]));

  const functions: FunctionSummary[] = FUNCTION_ORDER.map((code) => {
    if (GREYED_FUNCTIONS.has(code)) return greyedRow(code);

    const rows = rowsByFunction.get(code) ?? [];
    const summary = summarize(code, rows, assignmentsByFunction.get(code) ?? [], goalByFunction.get(code) ?? null, now);

    if (code === 'HP' && summary.hasActivity) {
      const cartons = rows.reduce((sum, r) => sum + (r.palletId != null ? hpCartonsByPid.get(r.palletId) ?? 0 : 0), 0);
      const density = summary.locations && summary.locations > 0 ? cartons / summary.locations : 0;
      return { ...summary, cartons, density };
    }
    return summary;
  });

  functions.sort((a, b) => {
    if (a.firstActivityAt && b.firstActivityAt) return a.firstActivityAt.localeCompare(b.firstActivityAt);
    if (a.firstActivityAt) return -1;
    if (b.firstActivityAt) return 1;
    return FUNCTION_ORDER.indexOf(a.functionCode as FunctionCode) - FUNCTION_ORDER.indexOf(b.functionCode as FunctionCode);
  });

  const allStarts = [
    ...assignments.map((a) => a.startTime),
    ...logRows.map((r) => r.timestamp),
  ];
  const shiftStart = allStarts.length > 0
    ? allStarts.reduce((min, t) => (t < min ? t : min), allStarts[0]).toISOString()
    : null;

  return { shiftStart, shiftEnd: now.toISOString(), functions };
}

/**
 * IRP hourly zoom-in for one function, one worker, today only. Only hours the worker
 * was actually assigned to this function are returned (spec: "no blank/zero rows for
 * unassigned hours") — hour buckets are the whole clock-hours each assignment block
 * overlaps, e.g. a 6:15-8:00 block yields "6AM-7AM" and "7AM-8AM".
 */
export async function getIndividualHourly(workerZ: string, functionCode: string, now: Date = new Date()): Promise<HourlyRow[] | null> {
  if (!(FUNCTION_ORDER as readonly string[]).includes(functionCode)) return null;
  if (GREYED_FUNCTIONS.has(functionCode as FunctionCode)) return [];

  const { dayStart } = todayWindow(now);
  const [assignments, goal, logRows] = await Promise.all([
    prisma.functionAssignment.findMany({
      where: { workerZ, functionCode, date: dayStart },
      select: { startTime: true, endTime: true },
    }),
    prisma.prodGoal.findUnique({ where: { functionCode }, select: { rate: true } }),
    prisma.activityLog.findMany({
      where: { userId: workerZ, functionCode, timestamp: { gte: dayStart } },
      select: { timestamp: true, palletId: true, locationAisle: true, locationBin: true, locationLevel: true, details: true },
      orderBy: { timestamp: 'asc' },
    }),
  ]);
  if (assignments.length === 0) return [];

  const goalRate = goal ? { rate: Number(goal.rate) } : null;

  const hourStarts = new Set<number>();
  for (const a of assignments) {
    const cursor = new Date(a.startTime);
    cursor.setMinutes(0, 0, 0);
    const end = a.endTime < now ? a.endTime : now;
    while (cursor < end) {
      hourStarts.add(cursor.getTime());
      cursor.setHours(cursor.getHours() + 1);
    }
  }

  const sortedHours = [...hourStarts].sort((a, b) => a - b);
  const hpPalletIds = [...new Set(logRows.map((r) => r.palletId).filter((id): id is number => id != null))];
  const hpPallets = functionCode === 'HP' && hpPalletIds.length > 0
    ? await prisma.pallet.findMany({ where: { pid: { in: hpPalletIds } }, select: { pid: true, currentCartons: true } })
    : [];
  const hpCartonsByPid = new Map(hpPallets.map((p) => [p.pid, p.currentCartons]));

  return sortedHours.map((hourMs) => {
    const hourStart = new Date(hourMs);
    const hourEnd = new Date(hourMs + 3_600_000);
    const rowsInHour = logRows.filter((r) => r.timestamp >= hourStart && r.timestamp < hourEnd);
    const blockForHour = [{ startTime: hourStart, endTime: hourEnd < now ? hourEnd : now }];

    const summary = summarize(functionCode, rowsInHour, blockForHour, goalRate, now);
    const finalSummary = functionCode === 'HP'
      ? (() => {
          const cartons = rowsInHour.reduce((sum, r) => sum + (r.palletId != null ? hpCartonsByPid.get(r.palletId) ?? 0 : 0), 0);
          const density = summary.locations && summary.locations > 0 ? cartons / summary.locations : 0;
          return { ...summary, cartons, density };
        })()
      : summary;

    return {
      hourLabel: formatHourLabel(hourStart),
      hourStart: hourStart.toISOString(),
      summary: {
        hasActivity: finalSummary.hasActivity,
        locations: finalSummary.locations,
        cartons: finalSummary.cartons,
        pallets: finalSummary.pallets,
        puts: finalSummary.puts,
        density: finalSummary.density,
        ratePerHour: finalSummary.ratePerHour,
        pctToGoal: finalSummary.pctToGoal,
        hours: finalSummary.hours,
        hoursOfWork: finalSummary.hoursOfWork,
      },
    };
  });
}

/** Formats an hour boundary as "6AM-7AM" / "12PM-1PM" / "11PM-12AM", per spec. */
function formatHourLabel(hourStart: Date): string {
  const fmt = (h: number) => {
    const period = h < 12 ? 'AM' : 'PM';
    const display = h % 12 === 0 ? 12 : h % 12;
    return `${display}${period}`;
  };
  const startHour = hourStart.getHours();
  return `${fmt(startHour)}-${fmt((startHour + 1) % 24)}`;
}
