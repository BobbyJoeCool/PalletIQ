// Team Prod Summary rules (Desktop, GitHub #147). Pure — no Prisma, no HTTP, no clock
// reads ("now" is a parameter). Timeline instants are epoch ms, as in workforce.ts.

import { overlapMs, type Segment, type TimeSpan } from './workforce.js';

/**
 * Clock hours of a span already elapsed at `now`. Goal rates include breaks (decided
 * 2026-11-16: 18,000 cartons at 180/hr on a 10-hour shift needs 10 people), so all Team
 * Prod math runs on clock time — measuring against break-free "active" time would put a
 * worker exactly on standard at ~107%.
 */
export function elapsedHoursUntil(span: TimeSpan, now: number): number {
  return Math.max(0, Math.min(span.end, now) - span.start) / 3_600_000;
}

/** One worker on a function, as the team math needs them. */
export interface TeamMember {
  segments: Segment[];
  /** Their ramping percent on this function (100 when not ramping). */
  rampPercent: number;
}

/**
 * The units the team was expected to produce on a function so far: each worker's elapsed
 * hours on it × the goal rate × their ramping percent — the ramping-weighted ("blended")
 * standard the design calls for.
 */
export function expectedUnits(members: readonly TeamMember[], functionCode: string, ratePerHour: number, now: number): number {
  let total = 0;
  for (const m of members) {
    for (const s of m.segments) {
      if (s.functionCode === functionCode) total += elapsedHoursUntil(s, now) * ratePerHour * (m.rampPercent / 100);
    }
  }
  return total;
}

/** @returns actual ÷ expected as a percent, or null with nothing expected yet */
export function teamProdPercent(actual: number, expected: number): number | null {
  return expected > 0 ? (actual / expected) * 100 : null;
}

/** @returns actual ÷ target as a percent, or null without a positive target */
export function percentToPlan(actual: number, target: number | null): number | null {
  return target != null && target > 0 ? (actual / target) * 100 : null;
}

/** A projected finish: when, and how far past the shift end (0 if within it). */
export interface FinishEstimate {
  at: number;
  overrunMs: number;
}

/**
 * When the rest of the plan will be done at the current pace (PULL functions): remaining
 * volume ÷ pace, added to now. Pace is units per clock hour so far, so breaks are already
 * averaged into it (see elapsedHoursUntil).
 *
 * @param pacePerHour - units per elapsed hour so far, across the team
 * @returns the estimate, `{ at: now, … }` if already done, or null with no pace yet
 */
export function estimateFinish(remaining: number, pacePerHour: number, now: number, shiftEnd: number): FinishEstimate | null {
  if (remaining <= 0) return { at: now, overrunMs: Math.max(0, now - shiftEnd) };
  if (!(pacePerHour > 0)) return null;
  const at = now + (remaining / pacePerHour) * 3_600_000;
  return { at, overrunMs: Math.max(0, at - shiftEnd) };
}

/** @returns how many workers are on a function at an instant */
export function staffedOn(timelines: readonly Segment[][], functionCode: string, at: number): number {
  return timelines.filter((segments) => segments.some((s) => s.functionCode === functionCode && s.start <= at && at < s.end)).length;
}

/** @returns ms of a timeline spent on a function, up to `now` */
export function msOnFunction(segments: Segment[], functionCode: string, now: number): number {
  return segments
    .filter((s) => s.functionCode === functionCode)
    .reduce((sum, s) => sum + overlapMs(s, { start: s.start, end: Math.min(s.end, now) }), 0);
}

// ── API contract (GET /api/team-prod) ─────────────────────────────────────────────

/** One worker's row in an expanded card (IRP-style). */
export interface TeamProdWorker {
  zNumber: string;
  firstName: string;
  lastName: string;
  rampPercent: number | null;
  /** Hours on this function so far. */
  hours: number;
  count: number;
  ratePerHour: number | null;
  /** Count vs the goal for their hours (unweighted, as IRP shows it). */
  pctToGoal: number | null;
}

/** One function's card. */
export interface TeamProdCard {
  functionCode: string;
  label: string;
  tier: 'PULL' | 'PROD' | 'SCAN' | 'OTHER';
  unit: string | null;
  /** False for functions with no data path yet (BKP, BK). */
  tracked: boolean;
  staffed: number;
  ramping: number;
  rate: number | null;
  target: number | null;
  targetSimulated: boolean;
  actual: number | null;
  ratePerHour: number | null;
  teamProdPct: number | null;
  percentToPlan: number | null;
  finish: FinishEstimate | null;
  workers: TeamProdWorker[];
}

/** Everything Team Prod Summary shows for one date and shift. */
export interface TeamProdView {
  date: string;
  shiftCode: string;
  shiftsOnDate: { day: string; night: string };
  window: TimeSpan;
  departmentId: string;
  /** The instant figures are computed at: now during the shift, else its end (or start, if not begun). */
  asOf: number;
  live: boolean;
  /** Note shown when the viewer's own department has no function list and another is shown. */
  departmentNote: string | null;
  cards: TeamProdCard[];
}
