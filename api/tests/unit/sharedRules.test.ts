// Unit tests for the pure domain rules in shared/ (#217). No DB, no HTTP.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasMinRole, isRole, isDesktopEligible } from '../../../shared/roles.js';
import { sspPerCarton, isValidVcpSspRatio, exceedsSspCap } from '../../../shared/vcpSsp.js';
import { classifyExpirationDate } from '../../../shared/expiration.js';
import {
  parseLocationBarcode, parseFullLocationBarcode, formatLocationId,
  splitLocationId, aisleBinOf, withLevel, displayLocationId,
} from '../../../shared/location.js';
import { expandCid, extractCidFields, compressCid } from '../../../shared/cidFormat.js';

test('roles: rank inheritance and guard', () => {
  assert.equal(hasMinRole('ADMIN', 'IM'), true);
  assert.equal(hasMinRole('IM', 'IM'), true);
  assert.equal(hasMinRole('WORKER', 'IM'), false);
  assert.equal(hasMinRole('MANAGER', 'LEAD'), true);
  assert.equal(isRole('LEAD'), true);
  assert.equal(isRole('OWNER'), false);
});

test('roles: desktop eligibility — LEAD and up, or ICQA home department', () => {
  assert.equal(isDesktopEligible('ADMIN', 'WHS'), true);
  assert.equal(isDesktopEligible('MANAGER', 'WHS'), true);
  assert.equal(isDesktopEligible('LEAD', 'WHS'), true);
  assert.equal(isDesktopEligible('IM', 'WHS'), false);
  assert.equal(isDesktopEligible('WORKER', 'INB'), false);
  // ICQA is a department, not a role — it grants access below LEAD too.
  assert.equal(isDesktopEligible('WORKER', 'IQA'), true);
  assert.equal(isDesktopEligible('IM', 'IQA'), true);
});

test('vcp/ssp: ratio and per-carton', () => {
  assert.equal(sspPerCarton(24, 6), 4);
  assert.equal(sspPerCarton(24, 24), 1);
  assert.equal(sspPerCarton(24, 5), null);
  assert.equal(sspPerCarton(24, 0), null);
  assert.equal(isValidVcpSspRatio(12, 7), false);
  assert.equal(exceedsSspCap(4, 3), false);
  assert.equal(exceedsSspCap(4, 4), true);
});

test('expiration: 1-month block, 3-month confirm window', () => {
  const now = new Date('2026-06-15T12:00:00Z');
  assert.equal(classifyExpirationDate(new Date('2026-07-01T12:00:00Z'), now), 'TOO_SOON');
  assert.equal(classifyExpirationDate(new Date('2026-08-15T12:00:00Z'), now), 'NEEDS_CONFIRM');
  assert.equal(classifyExpirationDate(new Date('2026-09-16T12:00:00Z'), now), 'OK');
});

test('location: parse, format, segments', () => {
  assert.deepEqual(parseLocationBarcode('322122'), { aisle: 322, bin: 122 });
  assert.deepEqual(parseLocationBarcode('32212208'), { aisle: 322, bin: 122 });
  assert.equal(parseLocationBarcode('3221'), null);
  assert.deepEqual(parseFullLocationBarcode('32212208'), { aisle: 322, bin: 122, level: 8 });
  assert.equal(parseFullLocationBarcode('322122'), null);
  assert.equal(formatLocationId(5, 7, 1), '00500701');
  assert.deepEqual(splitLocationId('32212208'), { aisle: '322', bin: '122', level: '08' });
  assert.deepEqual(splitLocationId('322122'), { aisle: '322', bin: '122', level: undefined });
  assert.equal(aisleBinOf('32212208'), '322122');
  assert.equal(withLevel('322122', 3), '32212203');
  assert.equal(withLevel('32212208', 3), '32212203');
  assert.equal(displayLocationId('32212208'), '322-122-08');
  assert.equal(displayLocationId('322122'), '322-122');
});

test('cid: expand/compress round-trip for a zero-filled type', () => {
  const canonical = '92' + '0123' + '000000000' + '00000000' + '001' + '00' + '2026239';
  const compressed = compressCid(canonical)!;
  assert.ok(compressed.length < canonical.length);
  assert.equal(expandCid(compressed), canonical);
  assert.equal(extractCidFields(canonical)!.destStore, 123);
  assert.equal(expandCid('99123'), null);
});
