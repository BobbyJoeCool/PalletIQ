// Team Prod demo production (Desktop, #147 follow-up) — direct instruction 2026-11-17: the
// seeded Roman roster should show realistic output on Team Prod Summary, not 0%. Each team
// member lands between 80% and 120% of standard and the team as a whole runs about 100%.
//
// For each shift that starts today (day and night), every scheduled Roman team member who
// has no timeline yet gets a typical one (a spread across the functions, one split shift,
// one worker in training for the first two hours), and every worker on the shift gets
// ActivityLog output from the shift start up to "now" — never past it, so a mid-shift
// screenshot shows a mid-shift picture. Output follows whatever timeline is stored, so a
// lead's edits on Job/Function Assignment are respected on the next reseed.
//
// Re-running is safe: the generated ActivityLog rows carry a marker and are replaced each
// run; seeded timelines are only created where none exist. Used by functions/demo-reseed.ts
// ("Reseed Test Data") and prisma/seed.ts.

import type { Prisma } from '../generated/prisma/index.js';
import { goalInForce } from '../../shared/prodPlan.js';
import {
  DOWNTIME_CODE, breakWindows, isoDateOf, localMidnight, shiftWindow, shiftsForDate, simulatedSchedule, snapTime, stableFraction,
  type Segment, type ShiftCode, type TimeSpan,
} from '../../shared/workforce.js';
import { ROMAN_RAMPING, ROMAN_ROSTER } from './romanRoster.js';

/** Marker in `details` that tells this generator's rows apart from real activity. */
export const TEAM_PROD_DEMO_MARKER = '"teamProdDemo":true';

/** Lowest and highest pace a seeded worker runs at, as a share of their standard. */
const PACE_MIN = 0.8;
const PACE_MAX = 1.2;

/**
 * Rates for the scan-only functions, which have no goal: GPM pallets staged and CON
 * pallets moved per hour. Only used to produce believable counts.
 */
const SCAN_RATES: Record<string, number> = { GPM: 40, CON: 15 };

/** How each counted function's rows are written. BKP/BK are not tracked yet, so get none. */
const ACTION_FOR: Record<string, string> = {
  CA: 'PULL', CF: 'PULL', FP: 'PULL', RP: 'PUT', HP: 'PUT', GPM: 'STAGE', CON: 'CONSOLID',
};

/** A seeded worker's day: one function, or two split at the first break's end. */
type DayPlan =
  | { kind: 'single'; functionCode: string }
  | { kind: 'split'; first: string; second: string }
  | { kind: 'training'; then: string };

/**
 * The shape of a ~25-person shift, matching the typical headcounts behind the simulated
 * plan targets (shared/workforce.ts): CA 5, CF 4, FP 2, BKP 2, BK 2, RP 3, HP 2, plus
 * GPM 2, CON 1, one CA→RP split and one CF worker in training first.
 */
const SHIFT_PLAN: DayPlan[] = [
  ...['CA', 'CA', 'CA', 'CA', 'CA', 'CF', 'CF', 'CF', 'CF', 'FP', 'FP', 'BKP', 'BKP', 'BK', 'BK',
    'RP', 'RP', 'RP', 'HP', 'HP', 'GPM', 'GPM', 'CON'].map((functionCode): DayPlan => ({ kind: 'single', functionCode })),
  { kind: 'split', first: 'CA', second: 'RP' },
  { kind: 'training', then: 'CF' },
];

/** Hours of training at the start of the trainee's shift. */
const TRAINING_HOURS = 2;

/** One ActivityLog row to insert. */
interface DemoActivityRow {
  userId: string;
  actionType: string;
  functionCode: string;
  timestamp: Date;
  details: string;
}

/** One FunctionAssignment row to insert. */
interface DemoAssignmentRow {
  workerZ: string;
  functionCode: string;
  date: Date;
  shiftCode: ShiftCode;
  startTime: Date;
  endTime: Date;
  assignedByZ: string;
  reasonCode: string | null;
}

/**
 * Seeded timelines for one shift: each scheduled worker gets a plan from SHIFT_PLAN,
 * ramping workers first onto the function they are ramping on (so the RAMP badge shows),
 * everyone else in zNumber order. Segments run from the shift start to the worker's
 * scheduled end (short days end early).
 *
 * @param workers - the shift's scheduled team members and their scheduled spans
 * @returns each worker's segments, by zNumber
 */
export function planShiftTimelines(
  workers: readonly { zNumber: string; scheduled: TimeSpan }[],
  shiftCode: ShiftCode,
  isoDate: string,
): Map<string, Segment[]> {
  const open = [...SHIFT_PLAN];
  const planOf = new Map<string, DayPlan>();
  const rampOf = new Map(ROMAN_RAMPING.map(([z, code]) => [z, code]));

  // Ramping workers take a plain slot on their ramp function, when one is left.
  for (const w of workers) {
    const code = rampOf.get(w.zNumber);
    const i = open.findIndex((p) => p.kind === 'single' && p.functionCode === code);
    if (code && i >= 0) planOf.set(w.zNumber, open.splice(i, 1)[0]);
  }
  for (const w of [...workers].sort((a, b) => a.zNumber.localeCompare(b.zNumber))) {
    if (!planOf.has(w.zNumber)) planOf.set(w.zNumber, open.shift() ?? { kind: 'single', functionCode: 'CA' });
  }

  const splitAt = breakWindows(shiftCode, isoDate)[0].end;
  const timelines = new Map<string, Segment[]>();
  for (const w of workers) {
    const { start, end } = w.scheduled;
    const plan = planOf.get(w.zNumber)!;
    const seg = (functionCode: string, from: number, to: number, reasonCode: string | null = null): Segment[] =>
      from < to ? [{ start: from, end: to, functionCode, reasonCode, reasonText: null }] : [];
    let segments: Segment[];
    if (plan.kind === 'single') {
      segments = seg(plan.functionCode, start, end);
    } else if (plan.kind === 'split') {
      const mid = Math.min(splitAt, end);
      segments = [...seg(plan.first, start, mid), ...seg(plan.second, mid, end)];
    } else {
      const mid = Math.min(snapTime(start + TRAINING_HOURS * 3_600_000), end);
      segments = [...seg(DOWNTIME_CODE, start, mid, 'TRN'), ...seg(plan.then, mid, end)];
    }
    timelines.set(w.zNumber, segments);
  }
  return timelines;
}

/**
 * Each worker's pace for a shift, spread evenly from PACE_MIN to PACE_MAX in a stable
 * per-date order, so the team averages exactly the middle (100%).
 *
 * @returns pace (share of standard) by zNumber
 */
export function shiftPaces(zNumbers: readonly string[], isoDate: string): Map<string, number> {
  const order = [...zNumbers].sort((a, b) => stableFraction(`${a}|${isoDate}|pace`) - stableFraction(`${b}|${isoDate}|pace`));
  const step = order.length > 1 ? (PACE_MAX - PACE_MIN) / (order.length - 1) : 0;
  return new Map(order.map((z, i) => [z, order.length > 1 ? PACE_MIN + i * step : 1]));
}

/**
 * Spreads `count` instants evenly over the parts of a span outside the breaks, with a
 * little jitter — output happens while working, not on break.
 *
 * @param random - injected so tests can pin it (defaults to Math.random)
 */
export function spreadInstants(span: TimeSpan, breaks: readonly TimeSpan[], count: number, random: () => number = Math.random): number[] {
  // The working pieces of the span, in order.
  const pieces: TimeSpan[] = [];
  let cursor = span.start;
  for (const b of [...breaks].sort((x, y) => x.start - y.start)) {
    if (b.end <= cursor || b.start >= span.end) continue;
    if (b.start > cursor) pieces.push({ start: cursor, end: b.start });
    cursor = Math.max(cursor, b.end);
  }
  if (cursor < span.end) pieces.push({ start: cursor, end: span.end });
  const working = pieces.reduce((sum, p) => sum + (p.end - p.start), 0);
  if (count <= 0 || working <= 0) return [];

  const gap = working / count;
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    let offset = Math.min(working - 1, Math.max(0, (i + 0.5) * gap + (random() - 0.5) * gap * 0.6));
    for (const p of pieces) {
      const len = p.end - p.start;
      if (offset < len) { out.push(Math.floor(p.start + offset)); break; }
      offset -= len;
    }
  }
  return out;
}

/**
 * The ActivityLog output for one worker on one segment, from its start up to `asOf`: the
 * function's rate × the worker's pace × their ramping share, per clock hour (goal rates
 * include breaks), with the rows placed in the working time. CA/CF rows carry 3–8 cartons
 * each, FP rows one pallet, every other function one unit per row.
 *
 * @returns rows to insert (none for untracked functions, Downtime, or a segment not started)
 */
export function segmentOutput(
  workerZ: string,
  segment: Segment,
  ratePerHour: number,
  pace: number,
  rampShare: number,
  breaks: readonly TimeSpan[],
  asOf: number,
  random: () => number = Math.random,
): DemoActivityRow[] {
  const actionType = ACTION_FOR[segment.functionCode];
  const end = Math.min(segment.end, asOf);
  if (!actionType || end <= segment.start) return [];
  const span = { start: segment.start, end };
  const units = Math.round(ratePerHour * pace * rampShare * ((end - segment.start) / 3_600_000));
  const marker = { teamProdDemo: true };
  const row = (timestamp: number, extra: object = {}): DemoActivityRow => ({
    userId: workerZ, actionType, functionCode: segment.functionCode, timestamp: new Date(timestamp),
    details: JSON.stringify({ ...extra, ...marker }),
  });

  if (segment.functionCode === 'CA' || segment.functionCode === 'CF') {
    const batches: number[] = [];
    for (let left = units; left > 0;) {
      const batch = Math.min(left, 3 + Math.floor(random() * 6));
      batches.push(batch);
      left -= batch;
    }
    return spreadInstants(span, breaks, batches.length, random)
      .map((t, i) => row(t, { pulled: { pallets: 0, cartons: batches[i] } }));
  }
  if (segment.functionCode === 'FP') {
    return spreadInstants(span, breaks, units, random)
      .map((t) => row(t, { pulled: { pallets: 1, cartons: 10 + Math.floor(random() * 21) } }));
  }
  return spreadInstants(span, breaks, units, random).map((t) => row(t));
}

/**
 * Seeds today's Team Prod demo production for the Roman roster — see the file comment.
 * Creates missing timelines for today's day and night shifts, then replaces this
 * generator's ActivityLog rows for those shifts with fresh output up to `now`.
 *
 * @param db - a Prisma client or transaction client
 * @param now - injected clock (defaults to the real one)
 * @returns how many timeline rows and activity rows were written
 */
export async function seedTeamProdDemo(
  db: Prisma.TransactionClient,
  now: number = Date.now(),
): Promise<{ assignmentsCreated: number; activityRows: number }> {
  const isoDate = isoDateOf(new Date(now));
  const date = localMidnight(isoDate);
  const goalRows = (await db.prodGoal.findMany()).map((r) => ({
    functionCode: r.functionCode, rate: Number(r.rate), effectiveDate: r.effectiveDate.toISOString().slice(0, 10),
  }));
  const rateFor = (code: string) => goalInForce(goalRows, code, isoDate)?.rate ?? SCAN_RATES[code] ?? null;

  let assignmentsCreated = 0;
  let activityRows = 0;
  const { day, night } = shiftsForDate(isoDate);

  for (const shiftCode of [day, night]) {
    const window = shiftWindow(shiftCode, isoDate);
    const breaks = breakWindows(shiftCode, isoDate);
    const team = ROMAN_ROSTER.filter((p) => p.role === 'WORKER' && p.homeShiftCode === shiftCode);
    const lead = ROMAN_ROSTER.find((p) => p.role === 'LEAD' && p.homeShiftCode === shiftCode)!;
    const zNumbers = team.map((p) => p.zNumber);
    const shiftWhere = {
      date,
      OR: [{ shiftCode }, { shiftCode: null, startTime: { gte: new Date(window.start), lt: new Date(window.end) } }],
    };

    // Timelines: create for scheduled workers who have none on this shift.
    const existing = await db.functionAssignment.findMany({ where: { workerZ: { in: zNumbers }, ...shiftWhere } });
    const hasTimeline = new Set(existing.map((r) => r.workerZ));
    const scheduled = team
      .map((p) => ({ zNumber: p.zNumber, scheduled: simulatedSchedule(p.zNumber, shiftCode, isoDate) }))
      .filter((w): w is { zNumber: string; scheduled: TimeSpan } => w.scheduled != null && !hasTimeline.has(w.zNumber));
    const planned = planShiftTimelines(scheduled, shiftCode, isoDate);
    const newRows: DemoAssignmentRow[] = [...planned].flatMap(([workerZ, segments]) => segments.map((s) => ({
      workerZ, functionCode: s.functionCode, date, shiftCode, startTime: new Date(s.start), endTime: new Date(s.end),
      assignedByZ: lead.zNumber, reasonCode: s.reasonCode,
    })));
    if (newRows.length > 0) await db.functionAssignment.createMany({ data: newRows });
    assignmentsCreated += newRows.length;

    // Output: replace this generator's rows for the shift, from the stored timelines.
    await db.activityLog.deleteMany({
      where: {
        userId: { in: zNumbers },
        timestamp: { gte: new Date(window.start), lt: new Date(window.end) },
        details: { contains: TEAM_PROD_DEMO_MARKER },
      },
    });
    if (now <= window.start) continue;

    const stored = await db.functionAssignment.findMany({ where: { workerZ: { in: zNumbers }, ...shiftWhere } });
    const ramping = await db.rampingOverride.findMany({
      where: { workerZ: { in: zNumbers }, startDate: { lte: date }, OR: [{ endDate: null }, { endDate: { gte: date } }] },
    });
    const paces = shiftPaces([...new Set(stored.map((r) => r.workerZ))], isoDate);
    const rows: DemoActivityRow[] = [];
    for (const a of stored) {
      const rate = rateFor(a.functionCode);
      if (rate == null) continue;
      const ramp = ramping.find((r) => r.workerZ === a.workerZ && r.functionCode === a.functionCode)?.percent ?? 100;
      const segment: Segment = { start: a.startTime.getTime(), end: a.endTime.getTime(), functionCode: a.functionCode, reasonCode: a.reasonCode, reasonText: a.reasonText };
      rows.push(...segmentOutput(a.workerZ, segment, rate, paces.get(a.workerZ) ?? 1, ramp / 100, breaks, now));
    }
    for (let i = 0; i < rows.length; i += 1000) await db.activityLog.createMany({ data: rows.slice(i, i + 1000) });
    activityRows += rows.length;
  }

  return { assignmentsCreated, activityRows };
}

