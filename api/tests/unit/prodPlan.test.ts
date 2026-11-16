// Unit tests for the pure Prod Goal / Ramping / Daily Plan rules (#146). No DB, no HTTP.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  attendanceSummary, dateRangesOverlap, goalInForce, rampingActiveOn, simulatedDailyDrop, validateGoalChange,
  validateRamping, type GoalRow, type RampingRow,
} from '../../../shared/prodPlan.js';
import { shiftWindow, type Segment } from '../../../shared/workforce.js';

const goal = (id: number, functionCode: string, rate: number, effectiveDate: string): GoalRow =>
  ({ id, functionCode, rate, unit: 'cartons/hr', rate2: null, unit2: null, effectiveDate });

test('prod goals: the rate in force is the latest on or before the date', () => {
  const rows = [goal(1, 'CA', 180, '2026-01-01'), goal(2, 'CA', 190, '2026-12-01'), goal(3, 'CF', 150, '2026-01-01')];
  assert.equal(goalInForce(rows, 'CA', '2026-11-16')?.rate, 180);
  assert.equal(goalInForce(rows, 'CA', '2026-12-01')?.rate, 190);
  assert.equal(goalInForce(rows, 'CA', '2025-12-31'), null);
  assert.equal(goalInForce(rows, 'RP', '2026-11-16'), null);
});

test('prod goals: change validation — positive, 2 decimals, not back-dated', () => {
  assert.equal(validateGoalChange(190, '2026-11-16', '2026-11-16'), null);
  assert.equal(validateGoalChange(190.25, '2026-12-01', '2026-11-16'), null);
  assert.equal(validateGoalChange(0, '2026-12-01', '2026-11-16'), 'INVALID_RATE');
  assert.equal(validateGoalChange(1.234, '2026-12-01', '2026-11-16'), 'INVALID_RATE');
  assert.equal(validateGoalChange(190, '2026-11-15', '2026-11-16'), 'BACKDATED');
  assert.equal(validateGoalChange(190, '11/16/2026', '2026-11-16'), 'INVALID_DATE');
});

test('ramping: active dates, overlap, and one override per worker + function', () => {
  const r: RampingRow = { id: 1, workerZ: 'z830t21', functionCode: 'CA', percent: 65, startDate: '2026-11-01', endDate: null };
  assert.equal(rampingActiveOn(r, '2026-11-16'), true);
  assert.equal(rampingActiveOn(r, '2026-10-31'), false);
  assert.equal(rampingActiveOn({ ...r, endDate: '2026-11-10' }, '2026-11-16'), false);
  assert.equal(dateRangesOverlap({ startDate: '2026-11-01', endDate: '2026-11-10' }, { startDate: '2026-11-10', endDate: null }), true);
  assert.equal(dateRangesOverlap({ startDate: '2026-11-01', endDate: '2026-11-09' }, { startDate: '2026-11-10', endDate: null }), false);

  const candidate = { id: 0, workerZ: 'z830t21', functionCode: 'CA', percent: 70, startDate: '2026-12-01', endDate: null };
  assert.equal(validateRamping(candidate, [r]), 'RAMPING_OVERLAP');
  assert.equal(validateRamping({ ...candidate, functionCode: 'CF' }, [r]), null);
  assert.equal(validateRamping({ ...r, percent: 80 }, [r]), null); // editing itself is not an overlap
  assert.equal(validateRamping({ ...candidate, functionCode: 'CF', percent: 100 }, [r]), 'INVALID_PERCENT');
  assert.equal(validateRamping({ ...candidate, functionCode: 'CF', endDate: '2026-11-30' }, [r]), 'INVALID_DATE');
});

test('daily plan: attendance from whole-shift Time Off; partial time off still counts as available', () => {
  const w = shiftWindow('B1', '2026-11-17');
  const off = (code: string, start = w.start, end = w.end): Segment => ({ start, end, functionCode: 'OFF', reasonCode: code, reasonText: null });
  const summary = attendanceSummary([
    { scheduled: w, segments: [] },
    { scheduled: w, segments: [off('VAC')] },
    { scheduled: w, segments: [off('SCK', w.start, w.start + 3_600_000), off('SCK', w.start + 3_600_000, w.end)] },
    { scheduled: w, segments: [off('VLE', w.end - 2 * 3_600_000)] }, // leaves early — still here
    { scheduled: null, segments: [] }, // not scheduled
  ]);
  assert.deepEqual(summary, { scheduled: 4, out: [{ code: 'SCK', count: 1 }, { code: 'VAC', count: 1 }], net: 2 });
});

test('daily plan: simulated drop is deterministic, pull functions only', () => {
  const ca = simulatedDailyDrop('CA', '2026-11-17', 180);
  assert.equal(ca, simulatedDailyDrop('CA', '2026-11-17', 180));
  assert.ok(ca! >= 300 * 180 * 0.8 && ca! <= 300 * 180 * 1.2);
  assert.equal(simulatedDailyDrop('RP', '2026-11-17', 45), null);
  assert.equal(simulatedDailyDrop('CA', '2026-11-17', null), null);
});
