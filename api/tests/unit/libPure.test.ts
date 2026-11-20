// Unit tests for the pure parts of api/lib modules that also query the DB (test plan
// Part 2, #237): row serializing, unit counting, zone criteria, date helpers, small
// lookups. The DB-backed functions of the same modules are covered in tests/db and the
// API suite.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serializeActivityRow, type ActivityRow } from '../../lib/activityRow.js';
import { parsePulled, countDistinctLocations, countFunctionUnits, type UnitLogRow } from '../../lib/irpUnits.js';
import { sideOf, resolveEffectiveCriteria } from '../../lib/zoneLogic.js';
import { isoFromDbDate, dbDateFromIso } from '../../lib/prodGoals.js';
import { functionsFor } from '../../lib/roster.js';
import { whereOpenContainer } from '../../lib/containerLifecycle.js';
import { FUNCTION_ORDER, GREYED_FUNCTIONS } from '../../lib/irpReporting.js';
import { AUDIT_ENTITY_TYPES, isAuditEntityType, AUDIT_TRAIL_LIMIT } from '../../../shared/audit.js';

const baseRow: ActivityRow = {
  id: 1, timestamp: new Date('2026-11-19T12:00:00Z'), userId: 'z002p21', actionType: 'PUT', palletId: 12345678,
  locationAisle: 318, locationBin: 12, locationLevel: 3, dept: 1, class: 2, item: 3,
  reasonPrefix: null, reasonNumber: null, details: '{"note":"x"}',
};

test('serializeActivityRow: full location and DPCI are formatted; details parsed', () => {
  const out = serializeActivityRow(baseRow);
  assert.equal(out.location, '31801203');
  assert.equal(out.dpci, '001-02-0003');
  assert.deepEqual(out.details, { note: 'x' });
  assert.equal(out.locationAisle, 318);
});

test('serializeActivityRow: aisle-only rows have no location; empty details and DPCI are null', () => {
  const out = serializeActivityRow({ ...baseRow, actionType: 'RESTAGE', locationBin: null, locationLevel: null, dept: null, details: null });
  assert.equal(out.location, null);
  assert.equal(out.locationAisle, 318);
  assert.equal(out.dpci, null);
  assert.equal(out.details, null);
});

const row = (aisle: number | null, bin: number | null, level: number | null, details: string | null = null): UnitLogRow =>
  ({ locationAisle: aisle, locationBin: bin, locationLevel: level, details });
const pulled = (pallets: number, cartons: number) => JSON.stringify({ pulled: { pallets, cartons } });

test('parsePulled: reads pulled counts; null, missing or malformed JSON is zero', () => {
  assert.deepEqual(parsePulled(pulled(2, 30)), { pallets: 2, cartons: 30 });
  assert.deepEqual(parsePulled(null), { pallets: 0, cartons: 0 });
  assert.deepEqual(parsePulled('{}'), { pallets: 0, cartons: 0 });
  assert.deepEqual(parsePulled('{"pulled":{"cartons":4}}'), { pallets: 0, cartons: 4 });
  assert.deepEqual(parsePulled('{not json'), { pallets: 0, cartons: 0 });
});

test('countDistinctLocations: counts distinct full locations, skips partial ones', () => {
  assert.equal(countDistinctLocations([]), 0);
  assert.equal(countDistinctLocations([row(1, 2, 3), row(1, 2, 3), row(1, 2, 4), row(1, null, 3), row(null, 2, 3)]), 2);
});

test('countFunctionUnits: CA/CF count cartons and locations; cartons are the goal', () => {
  const rows = [row(1, 2, 3, pulled(0, 10)), row(1, 2, 3, pulled(0, 5)), row(1, 4, 3, pulled(1, 7))];
  for (const code of ['CA', 'CF']) {
    assert.deepEqual(countFunctionUnits(code, rows), { locations: 2, cartons: 22, pallets: null, puts: null, goalCount: 22, primaryCount: 22 });
  }
});

test('countFunctionUnits: FP counts pallets (goal) and cartons', () => {
  assert.deepEqual(countFunctionUnits('FP', [row(1, 2, 3, pulled(1, 40)), row(1, 2, 4, pulled(2, 60))]),
    { locations: null, cartons: 100, pallets: 3, puts: null, goalCount: 3, primaryCount: 3 });
});

test('countFunctionUnits: RP puts, HP locations, GPM/CON pallets with no goal count', () => {
  const three = [row(1, 1, 1), row(1, 1, 2), row(1, 1, 3)];
  assert.deepEqual(countFunctionUnits('RP', three), { locations: null, cartons: null, pallets: null, puts: 3, goalCount: 3, primaryCount: 3 });
  assert.deepEqual(countFunctionUnits('HP', three), { locations: 3, cartons: null, pallets: null, puts: null, goalCount: 3, primaryCount: 3 });
  assert.deepEqual(countFunctionUnits('GPM', three), { locations: null, cartons: null, pallets: 3, puts: null, goalCount: 0, primaryCount: 3 });
  assert.deepEqual(countFunctionUnits('CON', three), { locations: null, cartons: null, pallets: 3, puts: null, goalCount: 0, primaryCount: 3 });
});

test('countFunctionUnits: unknown codes and empty input count nothing', () => {
  assert.deepEqual(countFunctionUnits('BK', [row(1, 1, 1)]), { locations: null, cartons: null, pallets: null, puts: null, goalCount: 0, primaryCount: 0 });
  assert.equal(countFunctionUnits('CA', []).primaryCount, 0);
});

test('sideOf: even bins are the even side, odd bins the odd side', () => {
  assert.equal(sideOf(1), 'odd');
  assert.equal(sideOf(2), 'even');
  assert.equal(sideOf(128), 'even');
});

const pallet = { size: 'M', storageCode: 'CR', zone: 2, itemStorageCode: 'NR' };

test('resolveEffectiveCriteria: overrides beat the pallet, the pallet beats defaults', () => {
  assert.deepEqual(resolveEffectiveCriteria({}, pallet), { size: 'M', storageCode: 'CR', zone: 2 });
  assert.deepEqual(resolveEffectiveCriteria({ size: 'L', storageCode: 'FD', zone: 4 }, pallet), { size: 'L', storageCode: 'FD', zone: 4 });
  assert.deepEqual(resolveEffectiveCriteria({ size: null, storageCode: null, zone: null }, pallet), { size: 'M', storageCode: 'CR', zone: 2 });
});

test('resolveEffectiveCriteria: storage code falls back to the item; zone to 1', () => {
  assert.deepEqual(resolveEffectiveCriteria({}, { ...pallet, storageCode: null, zone: null }), { size: 'M', storageCode: 'NR', zone: 1 });
});

test('resolveEffectiveCriteria: no size anywhere is 409 MISSING_SIZE; an override rescues it', () => {
  assert.throws(() => resolveEffectiveCriteria({}, { ...pallet, size: null }),
    (e: Error & { status?: number }) => e.message === 'MISSING_SIZE' && e.status === 409);
  assert.equal(resolveEffectiveCriteria({ size: 'S' }, { ...pallet, size: null }).size, 'S');
});

test('isoFromDbDate / dbDateFromIso: UTC-midnight round trip', () => {
  const d = dbDateFromIso('2026-11-19');
  assert.equal(d.toISOString(), '2026-11-19T00:00:00.000Z');
  assert.equal(isoFromDbDate(d), '2026-11-19');
  assert.equal(isoFromDbDate(new Date('2026-02-28T23:59:59Z')), '2026-02-28');
});

test('functionsFor: the warehouse has its functions; other departments have none yet', () => {
  assert.deepEqual(functionsFor('WHS').map((f) => f.code), ['CA', 'CF', 'FP', 'BKP', 'BK', 'RP', 'HP', 'GPM', 'CON']);
  assert.deepEqual(functionsFor('IQA'), []);
  assert.deepEqual(functionsFor(''), []);
});

test('whereOpenContainer: open means AVAILABLE or PRINTED', () => {
  assert.deepEqual(whereOpenContainer(), { status: { in: ['AVAILABLE', 'PRINTED'] } });
});

test('IRP function order and greyed functions', () => {
  assert.deepEqual([...FUNCTION_ORDER], ['CA', 'CF', 'FP', 'BKP', 'BK', 'RP', 'HP', 'GPM', 'CON']);
  assert.deepEqual([...GREYED_FUNCTIONS].sort(), ['BK', 'BKP']);
});

test('shared/audit: entity type guard and trail limit', () => {
  for (const t of AUDIT_ENTITY_TYPES) assert.equal(isAuditEntityType(t), true);
  for (const bad of ['location', 'BOGUS', '', 7, null, undefined]) assert.equal(isAuditEntityType(bad), false);
  assert.equal(AUDIT_TRAIL_LIMIT, 500);
});
