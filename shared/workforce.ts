// Workforce rules for Job/Function Assignment (Desktop, GitHub #145): shifts, the job
// functions and reason codes, assignment segments on a worker's timeline, staffing math,
// and the simulated myTime schedule and plan targets. Pure — no Prisma, no HTTP, no
// clock reads (every "when" is a parameter). Times are local wall-clock, like the rest
// of the app; a timeline instant is epoch milliseconds.

// ── Shifts ─────────────────────────────────────────────────────────────────────

export type ShiftCode = 'A1' | 'A2' | 'B1' | 'B2';
export const SHIFT_CODES: readonly ShiftCode[] = ['A1', 'A2', 'B1', 'B2'];

/** A shift's fixed definition. Times are "HH:MM", 24-hour, local. */
export interface ShiftDef {
  code: ShiftCode;
  daysLabel: string;
  /** Weekdays it starts on, as Date.getDay() numbers (0 = Sunday). */
  days: readonly number[];
  startTime: string;
  endTime: string;
  breaks: readonly { startTime: string; endTime: string }[];
  night: boolean;
}

/**
 * The four shifts every department works (decided in the 2026-07-25 design session).
 * Sat/Sun/Mon run A1 + A2; Tue–Fri run B1 + B2. The Shift / ShiftBreak tables hold the
 * same data for the database's sake.
 */
export const SHIFTS: readonly ShiftDef[] = [
  { code: 'A1', daysLabel: 'SAT-MON', days: [6, 0, 1], startTime: '06:00', endTime: '18:00', night: false,
    breaks: [{ startTime: '10:00', endTime: '10:30' }, { startTime: '14:15', endTime: '14:40' }] },
  { code: 'A2', daysLabel: 'SAT-MON', days: [6, 0, 1], startTime: '18:00', endTime: '06:00', night: true,
    breaks: [{ startTime: '22:00', endTime: '22:25' }, { startTime: '02:10', endTime: '02:40' }] },
  { code: 'B1', daysLabel: 'TUE-FRI', days: [2, 3, 4, 5], startTime: '06:00', endTime: '16:00', night: false,
    breaks: [{ startTime: '09:00', endTime: '09:15' }, { startTime: '12:20', endTime: '12:45' }] },
  { code: 'B2', daysLabel: 'TUE-FRI', days: [2, 3, 4, 5], startTime: '16:00', endTime: '02:00', night: true,
    breaks: [{ startTime: '19:00', endTime: '19:25' }, { startTime: '23:20', endTime: '23:35' }] },
];

/** @returns true if the value is a shift code */
export function isShiftCode(value: unknown): value is ShiftCode {
  return typeof value === 'string' && (SHIFT_CODES as readonly string[]).includes(value);
}

/** @returns the definition of a shift */
export function shiftDef(code: ShiftCode): ShiftDef {
  return SHIFTS.find((s) => s.code === code)!;
}

/** @returns "HH:MM" as minutes after midnight */
export function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/** A span of time on a timeline, epoch ms, end exclusive. */
export interface TimeSpan {
  start: number;
  end: number;
}

/** @returns local midnight of the given calendar date ("YYYY-MM-DD") */
export function localMidnight(isoDate: string): Date {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** @returns the calendar date ("YYYY-MM-DD") of a local Date */
export function isoDateOf(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** @returns true if the shift starts on that date */
export function runsOn(code: ShiftCode, isoDate: string): boolean {
  return shiftDef(code).days.includes(localMidnight(isoDate).getDay());
}

/** @returns the day and night shift that start on a date */
export function shiftsForDate(isoDate: string): { day: ShiftCode; night: ShiftCode } {
  return runsOn('A1', isoDate) ? { day: 'A1', night: 'A2' } : { day: 'B1', night: 'B2' };
}

/**
 * The shift the screen opens on: the viewer's home shift if it runs that date, otherwise
 * that date's day shift (a B1 lead looking at a Saturday gets A1).
 */
export function defaultShiftFor(homeShift: ShiftCode | null, isoDate: string): ShiftCode {
  if (homeShift && runsOn(homeShift, isoDate)) return homeShift;
  return shiftsForDate(isoDate).day;
}

/** @returns an "HH:MM" time on the shift's timeline, rolling into the next day past midnight for a night shift */
export function instantOnShift(def: ShiftDef, isoDate: string, hhmm: string): number {
  const midnight = localMidnight(isoDate);
  const minutes = minutesOf(hhmm);
  const nextDay = def.night && minutes < minutesOf(def.startTime);
  return new Date(midnight.getFullYear(), midnight.getMonth(), midnight.getDate() + (nextDay ? 1 : 0), Math.floor(minutes / 60), minutes % 60).getTime();
}

/**
 * Places a typed time of day ("HH:MM") on a shift's timeline — past midnight on a night
 * shift means the next calendar day.
 */
export function timeOnShift(code: ShiftCode, isoDate: string, hhmm: string): number {
  return instantOnShift(shiftDef(code), isoDate, hhmm);
}

/** @returns an instant as "HH:MM" local time, for a time input */
export function timeOfDay(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** @returns when a shift starting on a date begins and ends */
export function shiftWindow(code: ShiftCode, isoDate: string): TimeSpan {
  const def = shiftDef(code);
  return { start: instantOnShift(def, isoDate, def.startTime), end: instantOnShift(def, isoDate, def.endTime) };
}

/** @returns the shift's break windows on that date */
export function breakWindows(code: ShiftCode, isoDate: string): TimeSpan[] {
  const def = shiftDef(code);
  return def.breaks.map((b) => ({ start: instantOnShift(def, isoDate, b.startTime), end: instantOnShift(def, isoDate, b.endTime) }));
}

/** @returns how many ms two spans overlap */
export function overlapMs(a: TimeSpan, b: TimeSpan): number {
  return Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start));
}

/** @returns hours of a span that are not inside any break */
export function productiveHoursIn(span: TimeSpan, breaks: TimeSpan[]): number {
  const total = span.end - span.start - breaks.reduce((sum, b) => sum + overlapMs(span, b), 0);
  return Math.max(0, total) / 3_600_000;
}

/** @returns a whole shift's productive hours: its length minus its breaks (A1 = 11h05m) */
export function shiftProductiveHours(code: ShiftCode, isoDate: string): number {
  return productiveHoursIn(shiftWindow(code, isoDate), breakWindows(code, isoDate));
}

// ── Functions and reason codes ─────────────────────────────────────────────────────

/** The warehouse department's job functions, in the order they are offered. */
export const WAREHOUSE_FUNCTIONS = [
  { code: 'CA', label: 'Carton Air' },
  { code: 'CF', label: 'Carton Floor' },
  { code: 'FP', label: 'Full Pallet' },
  { code: 'BKP', label: 'Breakpack' },
  { code: 'BK', label: 'Bulk' },
  { code: 'RP', label: 'Rack Puts' },
  { code: 'HP', label: 'Hand Puts (XS)' },
  { code: 'GPM', label: 'GPM Staging' },
  { code: 'CON', label: 'Consolidation' },
] as const;

/** Time on the clock but not producing; needs a downtime reason. */
export const DOWNTIME_CODE = 'DTM';
/** Scheduled time not worked; needs an attendance code. */
export const TIME_OFF_CODE = 'OFF';
/** The reason code that requires free text, in both lists. */
export const OTHER_REASON = 'OTH';

/** Downtime reasons (decided 2026-11-16). */
export const DOWNTIME_REASONS = [
  { code: 'TRN', label: 'Training' },
  { code: 'MTG', label: 'Meeting' },
  { code: 'CLN', label: 'Cleaning / Spill' },
  { code: 'EQP', label: 'Equipment Down' },
  { code: 'WOF', label: 'Waiting on Freight' },
  { code: 'SAF', label: 'Safety' },
  { code: 'OTH', label: 'Other' },
] as const;

/** Attendance codes for scheduled time not worked (direct instruction 2026-11-16). */
export const ATTENDANCE_CODES = [
  { code: 'VLE', label: 'Voluntary Leave Early', description: 'Approved unpaid time off', paid: false },
  { code: 'VNS', label: 'Voluntary Not Scheduled', description: 'Approved unpaid full shift off', paid: false },
  { code: 'COF', label: 'Call Off', description: 'Unapproved unpaid time off, full or partial shift', paid: false },
  { code: 'VAC', label: 'Vacation', description: 'Pre-approved paid time off', paid: true },
  { code: 'SCK', label: 'Sick', description: 'Paid, protected from disciplinary action', paid: true },
  { code: 'LOA', label: 'FMLA / LOA', description: 'Time off approved by HR', paid: true },
  { code: 'OTH', label: 'Other', description: 'Requires a note', paid: false },
] as const;

/** Every code a timeline section can carry as its function. */
export function assignableCodes(functions: readonly { code: string }[]): string[] {
  return [...functions.map((f) => f.code), DOWNTIME_CODE, TIME_OFF_CODE];
}

/** @returns the reason list a section with this function code must use, or null if it takes no reason */
export function reasonListFor(functionCode: string): readonly { code: string; label: string }[] | null {
  if (functionCode === DOWNTIME_CODE) return DOWNTIME_REASONS;
  if (functionCode === TIME_OFF_CODE) return ATTENDANCE_CODES;
  return null;
}

// ── Timeline segments ────────────────────────────────────────────────────────────

/** One section of a worker's timeline. */
export interface Segment extends TimeSpan {
  functionCode: string;
  reasonCode: string | null;
  reasonText: string | null;
}

/** Gaps shorter than this (ms) are rounding noise, not unassigned time. */
export const ZERO_TIME_TOLERANCE = 1;

/** Divider drags and typed times snap to this many minutes (decided 2026-11-16). */
export const SNAP_MINUTES = 15;

/** @returns the instant rounded to the nearest SNAP_MINUTES boundary */
export function snapTime(ms: number): number {
  const step = SNAP_MINUTES * 60_000;
  return Math.round(ms / step) * step;
}

/** @returns true if two sections do the same thing (so touching ones can merge) */
function sameWork(a: Segment, b: Segment): boolean {
  return a.functionCode === b.functionCode && a.reasonCode === b.reasonCode && a.reasonText === b.reasonText;
}

/** Sorts sections by start and merges touching ones that do the same thing. */
export function normalizeSegments(segments: Segment[]): Segment[] {
  const sorted = segments.filter((s) => s.end > s.start).sort((a, b) => a.start - b.start);
  const merged: Segment[] = [];
  for (const s of sorted) {
    const last = merged[merged.length - 1];
    if (last && last.end === s.start && sameWork(last, s)) last.end = s.end;
    else merged.push({ ...s });
  }
  return merged;
}

/**
 * Lays a new section over a timeline: whatever it covers is cut away (a section it
 * falls inside is split around it), then it is added. This is how every reassignment
 * works — overlaps are resolved by the newer section, never an error.
 */
export function overlaySegment(segments: Segment[], incoming: Segment): Segment[] {
  const kept: Segment[] = [];
  for (const s of segments) {
    if (s.end <= incoming.start || s.start >= incoming.end) {
      kept.push(s);
      continue;
    }
    if (s.start < incoming.start) kept.push({ ...s, end: incoming.start });
    if (s.end > incoming.end) kept.push({ ...s, start: incoming.end });
  }
  return normalizeSegments([...kept, incoming]);
}

/** Removes a span from a timeline, leaving it unassigned. */
export function clearSpan(segments: Segment[], span: TimeSpan): Segment[] {
  const marker: Segment = { ...span, functionCode: '', reasonCode: null, reasonText: null };
  return overlaySegment(segments, marker).filter((s) => s.functionCode !== '');
}

/** @returns the unassigned spans of a window */
export function gapsIn(segments: Segment[], window: TimeSpan): TimeSpan[] {
  const gaps: TimeSpan[] = [];
  let cursor = window.start;
  for (const s of normalizeSegments(segments)) {
    if (s.end <= window.start || s.start >= window.end) continue;
    if (s.start > cursor) gaps.push({ start: cursor, end: Math.min(s.start, window.end) });
    cursor = Math.max(cursor, s.end);
  }
  if (cursor < window.end) gaps.push({ start: cursor, end: window.end });
  return gaps;
}

/** Fills every unassigned span of a window with one kind of work. */
export function fillGaps(segments: Segment[], window: TimeSpan, work: Omit<Segment, 'start' | 'end'>): Segment[] {
  return normalizeSegments([...segments, ...gapsIn(segments, window).map((g) => ({ ...g, ...work }))]);
}

/** @returns the sections that overlap a window (assigned time a bulk assign would conflict with) */
export function segmentsIn(segments: Segment[], window: TimeSpan): Segment[] {
  return segments.filter((s) => s.end > window.start && s.start < window.end);
}

/** What the split dialog submits. */
export interface SplitSpec {
  /** The section that was double-clicked. */
  original: Segment;
  splitAt: number;
  before: { start: number; functionCode: string; reasonCode: string | null; reasonText: string | null };
  after: { end: number; functionCode: string; reasonCode: string | null; reasonText: string | null };
}

/**
 * Applies a split: the original section is replaced by a "before" section (start →
 * split time) and an "after" section (split time → end). Moving the before start or the
 * after end past the original's edges takes that time from the neighbours, like any
 * other overlay.
 *
 * @returns the new timeline, or null if the times are out of order
 */
export function applySplit(segments: Segment[], spec: SplitSpec): Segment[] | null {
  if (!(spec.before.start < spec.splitAt && spec.splitAt < spec.after.end)) return null;
  let next = clearSpan(segments, spec.original);
  next = overlaySegment(next, { ...spec.before, start: spec.before.start, end: spec.splitAt });
  next = overlaySegment(next, { ...spec.after, start: spec.splitAt, end: spec.after.end });
  return next;
}

/** @returns the section covering an instant, if any */
export function segmentAt(segments: Segment[], t: number): Segment | null {
  return segments.find((s) => s.start <= t && t < s.end) ?? null;
}

/**
 * Checks a worker's timeline before it is saved: every section inside the shift, in
 * order and not overlapping, with a known function code, and a reason exactly where one
 * is needed — Downtime a downtime reason, time off an attendance code, Other a note.
 *
 * @returns an error code, or null if the timeline is valid
 */
export function validateTimeline(segments: Segment[], shift: TimeSpan, allowedCodes: readonly string[]): string | null {
  const sorted = [...segments].sort((a, b) => a.start - b.start);
  for (let i = 0; i < sorted.length; i++) {
    const s = sorted[i];
    if (!Number.isFinite(s.start) || !Number.isFinite(s.end) || s.start >= s.end) return 'SEGMENT_INVALID_TIMES';
    if (s.start < shift.start || s.end > shift.end) return 'SEGMENT_OUTSIDE_SHIFT';
    if (i > 0 && s.start < sorted[i - 1].end) return 'SEGMENTS_OVERLAP';
    if (!allowedCodes.includes(s.functionCode)) return 'INVALID_FUNCTION';
    const reasons = reasonListFor(s.functionCode);
    if (reasons) {
      if (!s.reasonCode || !reasons.some((r) => r.code === s.reasonCode)) return 'REASON_REQUIRED';
      if (s.reasonCode === OTHER_REASON && !s.reasonText?.trim()) return 'REASON_TEXT_REQUIRED';
      if (s.reasonText && s.reasonText.length > 255) return 'REASON_TEXT_TOO_LONG';
    } else if (s.reasonCode || s.reasonText) {
      return 'REASON_NOT_ALLOWED';
    }
  }
  return null;
}

// ── Staffing ─────────────────────────────────────────────────────────────────────

/** @returns how many workers are on each job function at an instant (Downtime and time off excluded) */
export function staffedAt(timelines: Segment[][], t: number): Map<string, number> {
  const counts = new Map<string, number>();
  for (const segments of timelines) {
    const s = segmentAt(segments, t);
    if (s && s.functionCode !== DOWNTIME_CODE && s.functionCode !== TIME_OFF_CODE) {
      counts.set(s.functionCode, (counts.get(s.functionCode) ?? 0) + 1);
    }
  }
  return counts;
}

/**
 * Workers needed to make a target: target ÷ (goal rate × the shift's productive hours).
 * @returns the exact figure (the screen rounds up), or null without a rate or hours
 */
export function requiredHeadcount(target: number, ratePerHour: number, productiveHours: number): number | null {
  if (ratePerHour <= 0 || productiveHours <= 0) return null;
  return target / (ratePerHour * productiveHours);
}

/**
 * The volume the staffing plan would produce on one function: for each worker, their
 * productive hours on it × the goal rate × their ramping percent (100 when not ramping).
 * A projection of who is staffed, not actual production (that is Team Prod Summary's job).
 */
export function projectedVolume(
  workers: { segments: Segment[]; rampPercent: number }[],
  functionCode: string,
  ratePerHour: number,
  breaks: TimeSpan[],
): number {
  let total = 0;
  for (const w of workers) {
    for (const s of w.segments) {
      if (s.functionCode === functionCode) total += productiveHoursIn(s, breaks) * ratePerHour * (w.rampPercent / 100);
    }
  }
  return total;
}

// ── Simulation (stands in for myTime and, until #146, Daily Plan) ─────────────────────

/** @returns a stable number in [0, 1) for a string (FNV-1a) */
export function stableFraction(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash / 0x100000000;
}

/** Roughly one scheduled day in ten is short. */
const SHORT_DAY_SHARE = 0.1;

/**
 * The simulated myTime schedule: a worker is scheduled on every date their home shift
 * runs, for the whole shift — except about one day in ten, which ends 2–4 hours early
 * ("B1, 6 hours, leaves at noon"). Deterministic per worker and date, so the demo never
 * goes stale and never needs reseeding.
 *
 * @returns the scheduled span, or null if not scheduled that day
 */
export function simulatedSchedule(zNumber: string, homeShift: ShiftCode | null, isoDate: string): TimeSpan | null {
  if (!homeShift || !runsOn(homeShift, isoDate)) return null;
  const window = shiftWindow(homeShift, isoDate);
  const roll = stableFraction(`${zNumber}|${isoDate}`);
  if (roll >= SHORT_DAY_SHARE) return window;
  const hoursEarly = 2 + Math.floor((roll / SHORT_DAY_SHARE) * 3);
  return { start: window.start, end: window.end - hoursEarly * 3_600_000 };
}

/** Typical headcount on each warehouse function for a ~25-person shift, for simulated targets. */
const TYPICAL_HEADCOUNT: Record<string, number> = { CA: 5, CF: 4, FP: 2, BKP: 2, BK: 2, RP: 3, HP: 2 };

/**
 * A simulated plan target for a function on a date and shift, used until an OM enters a
 * real one on Prod Goal / Daily Plan (#146): a typical headcount's worth of goal-rate
 * output, varied ±15% per date. Null for functions with no typical headcount or rate.
 */
export function simulatedTarget(functionCode: string, shiftCode: ShiftCode, isoDate: string, ratePerHour: number | null): number | null {
  const headcount = TYPICAL_HEADCOUNT[functionCode];
  if (!headcount || !ratePerHour) return null;
  const jitter = 0.85 + stableFraction(`${functionCode}|${shiftCode}|${isoDate}`) * 0.3;
  return Math.round(headcount * ratePerHour * shiftProductiveHours(shiftCode, isoDate) * jitter);
}

/** @returns a goal unit without its rate, e.g. "cartons/hr" → "cartons" */
export function volumeUnit(rateUnit: string): string {
  return rateUnit.split('/')[0];
}

// ── API contract (GET/PUT /api/roster) ─────────────────────────────────────────────

/** One function's plan line for the selected date and shift. */
export interface RosterPlanLine {
  functionCode: string;
  label: string;
  /** Goal rate per hour, or null if the function has no goal (GPM, CON). */
  rate: number | null;
  /** e.g. "cartons". */
  unit: string | null;
  target: number | null;
  /** True when no OM-entered target exists and the figure is simulated. */
  simulated: boolean;
  /** Exact workers needed (the screen rounds up), or null without a target and rate. */
  requiredHeadcount: number | null;
}

/** One person on the roster. */
export interface RosterWorker {
  zNumber: string;
  firstName: string;
  lastName: string;
  role: string;
  /** Simulated myTime schedule for this shift, or null if they are not scheduled. */
  scheduled: TimeSpan | null;
  /** Active ramping overrides on this date. */
  ramping: { functionCode: string; percent: number }[];
  segments: Segment[];
}

/** Everything Job/Function Assignment shows for one date and shift. */
export interface RosterView {
  date: string;
  shiftCode: ShiftCode;
  /** The day and night shift that run on this date (the shift selector's two options). */
  shiftsOnDate: { day: ShiftCode; night: ShiftCode };
  window: TimeSpan;
  breaks: TimeSpan[];
  productiveHours: number;
  departmentId: string;
  plan: RosterPlanLine[];
  workers: RosterWorker[];
}
