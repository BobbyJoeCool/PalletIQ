// Unit tests for the Team Prod demo production generator (prisma/demoTeamProd.ts). No DB.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planShiftTimelines, segmentOutput, shiftPaces, spreadInstants } from '../../prisma/demoTeamProd.js';
import { countFunctionUnits } from '../../lib/irpUnits.js';
import { breakWindows, shiftWindow, validateTimeline, assignableCodes, WAREHOUSE_FUNCTIONS, type Segment } from '../../../shared/workforce.js';
import { ROMAN_ROSTER } from '../../prisma/romanRoster.js';

const H = 3_600_000;
const DATE = '2026-11-17'; // a Tuesday: B1 06:00–16:00
const w = shiftWindow('B1', DATE);
const breaks = breakWindows('B1', DATE);
const seg = (start: number, end: number, functionCode: string): Segment => ({ start, end, functionCode, reasonCode: null, reasonText: null });
const fixed = () => 0.5;

test('paces: spread 80%–120% and average exactly 100%', () => {
  const z = Array.from({ length: 25 }, (_, i) => `z830t${String(i + 1).padStart(2, '0')}`);
  const paces = [...shiftPaces(z, DATE).values()];
  assert.equal(Math.min(...paces), 0.8);
  assert.ok(Math.abs(Math.max(...paces) - 1.2) < 1e-9);
  assert.ok(Math.abs(paces.reduce((a, b) => a + b, 0) / paces.length - 1) < 1e-9);
});

test('output: CA at 110% for 4 clock hours counts 792 cartons, none during breaks', () => {
  const rows = segmentOutput('z830t01', seg(w.start, w.end, 'CA'), 180, 1.1, 1, breaks, w.start + 4 * H, fixed);
  const units = countFunctionUnits('CA', rows.map((r) => ({ locationAisle: null, locationBin: null, locationLevel: null, details: r.details })));
  assert.equal(units.goalCount, 792);
  for (const r of rows) {
    const t = r.timestamp.getTime();
    assert.ok(t >= w.start && t < w.start + 4 * H);
    assert.ok(!breaks.some((b) => t >= b.start && t < b.end), 'no output on break');
  }
});

test('output: ramping share scales it, untracked and future segments produce nothing', () => {
  assert.equal(segmentOutput('z', seg(w.start, w.end, 'RP'), 45, 1, 0.7, breaks, w.start + 2 * H, fixed).length, 63);
  assert.equal(segmentOutput('z', seg(w.start, w.end, 'BKP'), 180, 1, 1, breaks, w.end, fixed).length, 0);
  assert.equal(segmentOutput('z', seg(w.start + 5 * H, w.end, 'HP'), 60, 1, 1, breaks, w.start + 4 * H, fixed).length, 0);
});

test('spreadInstants: count honored, all inside the working time', () => {
  const t = spreadInstants({ start: w.start, end: w.end }, breaks, 100, fixed);
  assert.equal(t.length, 100);
  assert.ok(t.every((x) => x >= w.start && x < w.end && !breaks.some((b) => x >= b.start && x < b.end)));
});

test('timelines: every seeded B1 worker gets a valid timeline covering their scheduled span', () => {
  const team = ROMAN_ROSTER.filter((p) => p.role === 'WORKER' && p.homeShiftCode === 'B1');
  const workers = team.map((p, i) => ({ zNumber: p.zNumber, scheduled: i === 0 ? { start: w.start, end: w.end - 3 * H } : w }));
  const timelines = planShiftTimelines(workers, 'B1', DATE);
  const allowed = assignableCodes(WAREHOUSE_FUNCTIONS);
  for (const { zNumber, scheduled } of workers) {
    const segments = timelines.get(zNumber)!;
    assert.equal(validateTimeline(segments, w, allowed), null, zNumber);
    assert.equal(segments[0].start, scheduled.start);
    assert.equal(segments[segments.length - 1].end, scheduled.end);
  }
  // Ramping workers land on their ramp function (z830t22 ramps on RP).
  assert.equal(timelines.get('z830t22')![0].functionCode, 'RP');
});
