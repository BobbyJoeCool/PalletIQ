// Unit tests for the pure Location Setup rules (#143). No DB, no HTTP.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  binsOf, defaultZoneRanges, expandLocations, floorPresetCells, levelsFor, topPresetCells, validateDefinition,
  validateZoneRanges, zoneOfBin, zoneSettingsOf, type AisleDefinition, type LevelSetting,
} from '../../../shared/aisleSetup.js';
import { acceptsInbound, putDecision, reinstateDecision } from '../../../shared/locationPolicy.js';
import { hasOmOrIcqaAuthority } from '../../../shared/roles.js';

const lookups = { storageCodes: ['CR', 'FD', 'BK'], sizes: ['M', 'L', 'S', 'HS', 'XS'] };
const levels = (...specs: [string, string][]): LevelSetting[] =>
  specs.map(([storageCode, size], i) => ({ level: i + 1, storageCode, size }));

/** A standard 128-bin double-sided aisle laid out like the seeded ones. */
function standard(over: Partial<AisleDefinition> = {}): AisleDefinition {
  return {
    aisle: 401, sides: 'BOTH', firstBin: 1, lastBin: 128, zoneDirection: 'BACK_TO_FRONT',
    zones: defaultZoneRanges('BOTH', 1, 128, 'BACK_TO_FRONT'),
    sideLevels: { ODD: levels(['CR', 'M'], ['CR', 'L']), EVEN: levels(['CR', 'M'], ['CR', 'L'], ['CR', 'HS']) },
    zoneOverrides: [],
    ...over,
  };
}

test('aisle setup: default zones match the seeded layout (Zone 1 = highest bins)', () => {
  assert.deepEqual(defaultZoneRanges('BOTH', 1, 128, 'BACK_TO_FRONT'), [
    { zone: 1, startBin: 97, endBin: 128 },
    { zone: 2, startBin: 65, endBin: 96 },
    { zone: 3, startBin: 33, endBin: 64 },
    { zone: 4, startBin: 1, endBin: 32 },
  ]);
  assert.deepEqual(defaultZoneRanges('BOTH', 1, 128, 'FRONT_TO_BACK')[0], { zone: 1, startBin: 1, endBin: 32 });
});

test('aisle setup: uneven splits keep facing pairs together and tile the aisle', () => {
  // 41–170 = 130 bins = 65 pairs → 17,16,16,16 pairs; the extra pair goes to Zone 1.
  const zones = defaultZoneRanges('BOTH', 41, 170, 'BACK_TO_FRONT');
  assert.deepEqual(zones.map((z) => z.endBin - z.startBin + 1), [34, 32, 32, 32]);
  assert.equal(validateZoneRanges({ sides: 'BOTH', firstBin: 41, lastBin: 170, zoneDirection: 'BACK_TO_FRONT', zones }), null);
  assert.ok(zones.every((z) => (z.endBin - z.startBin + 1) % 2 === 0));
});

test('aisle setup: single-sided aisles use only their side and still tile', () => {
  assert.deepEqual(binsOf('ODD', 1, 9), [1, 3, 5, 7, 9]);
  const zones = defaultZoneRanges('ODD', 1, 15, 'BACK_TO_FRONT');
  assert.equal(validateZoneRanges({ sides: 'ODD', firstBin: 1, lastBin: 15, zoneDirection: 'BACK_TO_FRONT', zones }), null);
  assert.deepEqual(defaultZoneRanges('ODD', 1, 5, 'BACK_TO_FRONT'), []); // 3 bins: too few for 4 zones
});

test('aisle setup: zone range validation', () => {
  const base = { sides: 'BOTH' as const, firstBin: 1, lastBin: 128, zoneDirection: 'BACK_TO_FRONT' as const };
  const zones = defaultZoneRanges('BOTH', 1, 128, 'BACK_TO_FRONT');
  assert.equal(validateZoneRanges({ ...base, zones: zones.slice(0, 3) }), 'ZONES_INVALID');
  assert.equal(validateZoneRanges({ ...base, zones: zones.map((z) => (z.zone === 2 ? { ...z, endBin: 95 } : z)) }), 'ZONES_NOT_COVERING');
  assert.equal(validateZoneRanges({ ...base, zoneDirection: 'FRONT_TO_BACK', zones }), 'ZONES_OUT_OF_ORDER');
  assert.equal(validateZoneRanges({ ...base, sides: 'ODD', firstBin: 1, lastBin: 7, zones: [
    { zone: 4, startBin: 1, endBin: 1 }, { zone: 3, startBin: 2, endBin: 2 }, { zone: 2, startBin: 3, endBin: 5 }, { zone: 1, startBin: 6, endBin: 7 },
  ] }), 'ZONE_EMPTY');
});

test('aisle setup: definition validation', () => {
  assert.equal(validateDefinition(standard(), lookups), null);
  assert.equal(validateDefinition(standard({ aisle: 1000 }), lookups), 'INVALID_AISLE');
  assert.equal(validateDefinition(standard({ firstBin: 50, lastBin: 10 }), lookups), 'INVALID_BINS');
  assert.equal(validateDefinition(standard({ sideLevels: { ODD: levels(['CR', 'M']) } }), lookups), 'LEVELS_REQUIRED');
  assert.equal(validateDefinition(standard({ sideLevels: { ODD: [{ level: 2, storageCode: 'CR', size: 'M' }], EVEN: levels(['CR', 'M']) } }), lookups), 'LEVELS_NOT_CONTIGUOUS');
  assert.equal(validateDefinition(standard({ sideLevels: { ODD: levels(['XO', 'M']), EVEN: levels(['CR', 'M']) } }), lookups), 'NOT_FOR_STORAGE_IN_SETUP');
  assert.equal(validateDefinition(standard({ sideLevels: { ODD: levels(['ZZ', 'M']), EVEN: levels(['CR', 'M']) } }), lookups), 'INVALID_STORAGE_CODE');
  assert.equal(validateDefinition(standard({ sideLevels: { ODD: levels(['CR', 'Q']), EVEN: levels(['CR', 'M']) } }), lookups), 'INVALID_SIZE');
  assert.equal(validateDefinition(standard({ zoneOverrides: [{ zone: 5, side: 'ODD', levels: levels(['CR', 'M']) }] }), lookups), 'INVALID_OVERRIDE');
  assert.equal(validateDefinition(standard({ sides: 'ODD', sideLevels: { ODD: levels(['CR', 'M']) }, zones: defaultZoneRanges('ODD', 1, 128, 'BACK_TO_FRONT'),
    zoneOverrides: [{ zone: 1, side: 'EVEN', levels: levels(['CR', 'M']) }] }), lookups), 'INVALID_OVERRIDE');
});

test('aisle setup: per-side levels with a zone override (aisle 730 shape)', () => {
  const xs = levels(...Array.from({ length: 13 }, () => ['CR', 'XS'] as [string, string]));
  const def = standard({ zoneOverrides: [{ zone: 1, side: 'ODD', levels: xs }] });
  assert.equal(levelsFor(def, 1, 'ODD').length, 13);
  assert.equal(levelsFor(def, 2, 'ODD').length, 2);
  assert.equal(levelsFor(def, 1, 'EVEN').length, 3);

  const rows = expandLocations(def);
  // Zone 1 odd: 16 bins × 13; other odd zones: 48 bins × 2; every even bin: 64 × 3.
  assert.equal(rows.length, 16 * 13 + 48 * 2 + 64 * 3);
  assert.deepEqual(rows.find((r) => r.bin === 127 && r.level === 13), { aisle: 401, bin: 127, level: 13, zone: 1, storageCode: 'CR', size: 'XS' });
  assert.equal(zoneOfBin(def.zones, 32), 4);
  assert.equal(zoneSettingsOf(def).length, 13 + 2 * 3 + 3 * 4);
});

test('aisle setup: contraction presets — floor, and top (3 levels for HS/XS)', () => {
  const xs = levels(...Array.from({ length: 5 }, () => ['CR', 'XS'] as [string, string]));
  const settings = zoneSettingsOf(standard({ zoneOverrides: [{ zone: 2, side: 'ODD', levels: xs }] }));
  const floor = floorPresetCells(settings);
  assert.equal(floor.length, 8);
  assert.ok(floor.every((c) => c.level === 1));

  const top = topPresetCells(settings);
  // ODD zones 1/3/4 top out at level 2 (Large) → 1 level; ODD zone 2 is XS to level 5 → 3,4,5;
  // EVEN zones top out at level 3 (Half Small) → 1,2,3.
  assert.deepEqual(top.filter((c) => c.zone === 1 && c.side === 'ODD').map((c) => c.level), [2]);
  assert.deepEqual(top.filter((c) => c.zone === 2 && c.side === 'ODD').map((c) => c.level), [3, 4, 5]);
  assert.deepEqual(top.filter((c) => c.zone === 1 && c.side === 'EVEN').map((c) => c.level), [1, 2, 3]);
});

test('location policy: Not For Storage accepts nothing and cannot be overridden', () => {
  const xo = { status: 'EMPTY', holdCategory: null, contraction: false, storageCode: 'XO' };
  assert.equal(acceptsInbound(xo), false);
  assert.equal(acceptsInbound({ ...xo, storageCode: 'CR' }), true);
  assert.deepEqual(putDecision(xo, 'ADMIN', { contraction: true, hold: true }), { kind: 'deny', code: 'NOT_FOR_STORAGE', httpStatus: 403 });
  assert.deepEqual(reinstateDecision(xo, 'CR', true), { kind: 'deny', code: 'NOT_FOR_STORAGE', httpStatus: 403 });
});

test('roles: OM-level authority — MANAGER/ADMIN, or ICQA at any role', () => {
  assert.equal(hasOmOrIcqaAuthority('MANAGER', 'WHS'), true);
  assert.equal(hasOmOrIcqaAuthority('ADMIN', 'WHS'), true);
  assert.equal(hasOmOrIcqaAuthority('LEAD', 'WHS'), false);
  assert.equal(hasOmOrIcqaAuthority('WORKER', 'IQA'), true);
});
