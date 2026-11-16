// Unit tests for Team Prod Summary rules (#147) and the shared IRP unit counting. No DB.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countFunctionUnits } from '../../lib/irpUnits.js';
import { elapsedHoursUntil, estimateFinish, expectedUnits, msOnFunction, percentToPlan, staffedOn, teamProdPercent } from '../../../shared/teamProd.js';
import { shiftWindow, type Segment } from '../../../shared/workforce.js';

const H = 3_600_000;
const w = shiftWindow('B1', '2026-11-17');
const seg = (start: number, end: number, functionCode: string): Segment => ({ start, end, functionCode, reasonCode: null, reasonText: null });
const pull = (cartons: number, pallets = 0, loc = 1) => ({ locationAisle: 300, locationBin: loc, locationLevel: 1, details: JSON.stringify({ pulled: { cartons, pallets } }) });

test('irp units: CA cartons, FP pallets, RP puts, GPM pallets; bad JSON counts nothing', () => {
  assert.equal(countFunctionUnits('CA', [pull(10), pull(5, 0, 2)]).goalCount, 15);
  assert.equal(countFunctionUnits('CA', [pull(10), pull(5, 0, 2)]).locations, 2);
  assert.equal(countFunctionUnits('FP', [pull(40, 1), pull(30, 1)]).goalCount, 2);
  assert.equal(countFunctionUnits('RP', [pull(0), pull(0)]).goalCount, 2);
  assert.equal(countFunctionUnits('GPM', [pull(0), pull(0), pull(0)]).primaryCount, 3);
  assert.equal(countFunctionUnits('CA', [{ ...pull(0), details: '{oops' }]).goalCount, 0);
});

test('team prod: elapsed hours, ramping-weighted standard, percents', () => {
  const now = w.start + 4 * H;
  assert.equal(elapsedHoursUntil(seg(w.start, w.end, 'CA'), now), 4);
  assert.equal(elapsedHoursUntil(seg(w.start + 5 * H, w.end, 'CA'), now), 0);
  // Two on CA for 4h at 180/hr, one ramping at 50%: standard = 4×180 + 4×180×0.5 = 1080.
  const expected = expectedUnits([
    { segments: [seg(w.start, w.end, 'CA')], rampPercent: 100 },
    { segments: [seg(w.start, w.end, 'CA')], rampPercent: 50 },
  ], 'CA', 180, now);
  assert.equal(expected, 1080);
  assert.equal(teamProdPercent(1080, expected), 100);
  assert.equal(teamProdPercent(10, 0), null);
  assert.equal(percentToPlan(4500, 18000), 25);
  assert.equal(percentToPlan(100, null), null);
});

test('team prod: finish estimate and overrun', () => {
  const now = w.start + 4 * H;
  // 7,200 done in 4h = 1,800/hr; 10,800 left → 6h → exactly the shift end.
  assert.deepEqual(estimateFinish(10_800, 1_800, now, w.end), { at: w.end, overrunMs: 0 });
  assert.deepEqual(estimateFinish(14_400, 1_800, now, w.end), { at: w.end + 2 * H, overrunMs: 2 * H });
  assert.deepEqual(estimateFinish(0, 1_800, now, w.end), { at: now, overrunMs: 0 });
  assert.equal(estimateFinish(100, 0, now, w.end), null);
});

test('team prod: staffed at an instant and time on a function', () => {
  const timelines = [[seg(w.start, w.start + 5 * H, 'CA'), seg(w.start + 5 * H, w.end, 'RP')], [seg(w.start, w.end, 'CA')]];
  assert.equal(staffedOn(timelines, 'CA', w.start + H), 2);
  assert.equal(staffedOn(timelines, 'CA', w.start + 6 * H), 1);
  assert.equal(msOnFunction(timelines[0], 'CA', w.start + 6 * H), 5 * H);
  assert.equal(msOnFunction(timelines[0], 'RP', w.start + 6 * H), H);
});
