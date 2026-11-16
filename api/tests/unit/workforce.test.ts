// Unit tests for the pure Job/Function Assignment rules (#145). No DB, no HTTP.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applySplit, clearSpan, defaultShiftFor, fillGaps, gapsIn, overlaySegment, projectedVolume, requiredHeadcount,
  shiftProductiveHours, shiftWindow, shiftsForDate, simulatedSchedule, simulatedTarget, snapTime, staffedAt,
  validateTimeline, assignableCodes, WAREHOUSE_FUNCTIONS, breakWindows, shiftHours, effectiveStaffedAt, type Segment,
} from '../../../shared/workforce.js';

const H = 3_600_000;
// 2026-11-17 is a Tuesday (B shifts); 2026-11-21 is a Saturday (A shifts).
const TUE = '2026-11-17';
const SAT = '2026-11-21';
const b1 = shiftWindow('B1', TUE);
const seg = (start: number, end: number, functionCode: string, reasonCode: string | null = null, reasonText: string | null = null): Segment =>
  ({ start, end, functionCode, reasonCode, reasonText });
const codes = assignableCodes(WAREHOUSE_FUNCTIONS);

test('shifts: which run when, and the default shift', () => {
  assert.deepEqual(shiftsForDate(TUE), { day: 'B1', night: 'B2' });
  assert.deepEqual(shiftsForDate(SAT), { day: 'A1', night: 'A2' });
  assert.equal(defaultShiftFor('B2', TUE), 'B2');
  assert.equal(defaultShiftFor('B1', SAT), 'A1'); // home shift not running → that date's day shift
  assert.equal(defaultShiftFor(null, SAT), 'A1');
});

test('shifts: windows (night shifts end the next day) and productive hours', () => {
  assert.equal(new Date(b1.start).getHours(), 6);
  assert.equal((b1.end - b1.start) / H, 10);
  const b2 = shiftWindow('B2', TUE);
  assert.equal((b2.end - b2.start) / H, 10);
  assert.equal(new Date(b2.end).getDate(), 18);
  // A2's 02:10 break falls on the next calendar day, inside the shift.
  const a2 = shiftWindow('A2', SAT);
  assert.ok(breakWindows('A2', SAT).every((b) => b.start >= a2.start && b.end <= a2.end));
  assert.equal(Math.round(shiftProductiveHours('A1', SAT) * 60), 12 * 60 - 55); // 11h05m
  assert.equal(Math.round(shiftProductiveHours('B1', TUE) * 60), 10 * 60 - 40);
});

test('segments: overlay truncates, splits, and replaces; touching identical work merges', () => {
  let t = [seg(b1.start, b1.end, 'CA')];
  t = overlaySegment(t, seg(b1.start + 2 * H, b1.start + 4 * H, 'RP'));
  assert.deepEqual(t.map((s) => [s.functionCode, (s.start - b1.start) / H, (s.end - b1.start) / H]), [['CA', 0, 2], ['RP', 2, 4], ['CA', 4, 10]]);
  t = overlaySegment(t, seg(b1.start + 2 * H, b1.start + 4 * H, 'CA'));
  assert.deepEqual(t.map((s) => s.functionCode), ['CA']);
  assert.equal(t[0].end - t[0].start, 10 * H);
});

test('segments: gaps, fill, and clearing', () => {
  const t = [seg(b1.start + H, b1.start + 3 * H, 'CF')];
  assert.deepEqual(gapsIn(t, b1).map((g) => [(g.start - b1.start) / H, (g.end - b1.start) / H]), [[0, 1], [3, 10]]);
  const filled = fillGaps(t, b1, { functionCode: 'CA', reasonCode: null, reasonText: null });
  assert.deepEqual(filled.map((s) => s.functionCode), ['CA', 'CF', 'CA']);
  assert.equal(gapsIn(filled, b1).length, 0);
  assert.equal(gapsIn(clearSpan(filled, { start: b1.start, end: b1.start + H }), b1).length, 1);
});

test('segments: split dialog result', () => {
  const t = [seg(b1.start, b1.end, 'CA')];
  const split = applySplit(t, {
    original: t[0],
    splitAt: b1.start + 5 * H,
    before: { start: b1.start, functionCode: 'CA', reasonCode: null, reasonText: null },
    after: { end: b1.end - 2 * H, functionCode: 'DTM', reasonCode: 'TRN', reasonText: null },
  });
  assert.deepEqual(split?.map((s) => [s.functionCode, (s.start - b1.start) / H, (s.end - b1.start) / H]), [['CA', 0, 5], ['DTM', 5, 8]]);
  assert.equal(applySplit(t, { original: t[0], splitAt: b1.start, before: { start: b1.start, functionCode: 'CA', reasonCode: null, reasonText: null }, after: { end: b1.end, functionCode: 'CA', reasonCode: null, reasonText: null } }), null);
});

test('segments: validation', () => {
  assert.equal(validateTimeline([seg(b1.start, b1.end, 'CA')], b1, codes), null);
  assert.equal(validateTimeline([seg(b1.start - H, b1.end, 'CA')], b1, codes), 'SEGMENT_OUTSIDE_SHIFT');
  assert.equal(validateTimeline([seg(b1.start, b1.start + 3 * H, 'CA'), seg(b1.start + 2 * H, b1.end, 'CF')], b1, codes), 'SEGMENTS_OVERLAP');
  assert.equal(validateTimeline([seg(b1.start, b1.end, 'ZZ')], b1, codes), 'INVALID_FUNCTION');
  assert.equal(validateTimeline([seg(b1.start, b1.end, 'DTM')], b1, codes), 'REASON_REQUIRED');
  assert.equal(validateTimeline([seg(b1.start, b1.end, 'OFF', 'TRN')], b1, codes), 'REASON_REQUIRED'); // downtime reason on time off
  assert.equal(validateTimeline([seg(b1.start, b1.end, 'OFF', 'VNS')], b1, codes), null);
  assert.equal(validateTimeline([seg(b1.start, b1.end, 'OFF', 'OTH')], b1, codes), 'REASON_TEXT_REQUIRED');
  assert.equal(validateTimeline([seg(b1.start, b1.end, 'OFF', 'OTH', 'Jury duty')], b1, codes), null);
  assert.equal(validateTimeline([seg(b1.start, b1.end, 'CA', 'TRN')], b1, codes), 'REASON_NOT_ALLOWED');
});

test('staffing: headcount at a time, required headcount, ramp-weighted projection', () => {
  const timelines = [
    [seg(b1.start, b1.end, 'CA')],
    [seg(b1.start, b1.start + 5 * H, 'CA'), seg(b1.start + 5 * H, b1.end, 'DTM', 'TRN')],
    [seg(b1.start, b1.end, 'OFF', 'VAC')],
  ];
  assert.deepEqual([...staffedAt(timelines, b1.start + H)], [['CA', 2]]);
  assert.deepEqual([...staffedAt(timelines, b1.start + 6 * H)], [['CA', 1]]);
  assert.equal(requiredHeadcount(1800, 180, 10), 1);
  assert.equal(requiredHeadcount(100, 0, 10), null);
  // No breaks: worker A 10h × 180 × 100% + worker B 5h × 180 × 50% = 1800 + 450.
  assert.equal(projectedVolume([{ segments: timelines[0], rampPercent: 100 }, { segments: timelines[1], rampPercent: 50 }], 'CA', 180), 2250);
  // The user's example: 18,000 cartons at 180/hr on a 10-hour shift needs 10 people.
  assert.equal(requiredHeadcount(18000, 180, shiftHours('B1', TUE)), 10);
  // Ramping counts at its percent: two on CA, one ramping at 60% → 1.6 effective.
  assert.equal(effectiveStaffedAt([{ segments: timelines[0], rampPercent: 100 }, { segments: timelines[1], rampPercent: 60 }], 'CA', b1.start + H), 1.6);
});

test('simulation: deterministic schedules and targets', () => {
  assert.equal(simulatedSchedule('z830t01', 'B1', SAT), null);
  const a = simulatedSchedule('z830t01', 'B1', TUE);
  assert.deepEqual(a, simulatedSchedule('z830t01', 'B1', TUE));
  assert.ok(a && a.start === b1.start && a.end <= b1.end && a.end >= b1.end - 4 * H);
  // Across a roster, roughly one day in ten is short.
  let short = 0;
  for (let i = 1; i <= 200; i++) {
    const s = simulatedSchedule(`z8x0t${i}`, 'B1', TUE);
    if (s && s.end < b1.end) short++;
  }
  assert.ok(short > 5 && short < 45, `short days: ${short}`);
  const target = simulatedTarget('CA', 'B1', TUE, 180);
  assert.equal(target, simulatedTarget('CA', 'B1', TUE, 180));
  assert.ok(target! >= 5 * 180 * 10 * 0.85 && target! <= 5 * 180 * 10 * 1.15);
  assert.equal(simulatedTarget('GPM', 'B1', TUE, 30), null);
  assert.equal(simulatedTarget('CA', 'B1', TUE, null), null);
  assert.equal(snapTime(b1.start + 7 * 60_000), b1.start);
  assert.equal(snapTime(b1.start + 8 * 60_000), b1.start + 15 * 60_000);
});
