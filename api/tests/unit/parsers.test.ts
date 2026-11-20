// Unit tests for the barcode/ID parsers and formatters (test plan Part 2, #237). Pure — no DB.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDpci, formatDpci } from '../../lib/dpci.js';
import { parseCidOrThrow } from '../../lib/cidParser.js';
import { coercePalletId } from '../../lib/palletId.js';
import {
  parseLocationBarcode, parseFullLocationBarcode, formatLocationId,
} from '../../lib/locationParser.js';
import {
  splitLocationId, aisleBinOf, withLevel, displayLocationId,
} from '../../../shared/location.js';

test('parseDpci: 9 digits, with or without dashes', () => {
  assert.deepEqual(parseDpci('123456789'), { dept: 123, class: 45, item: 6789 });
  assert.deepEqual(parseDpci('123-45-6789'), { dept: 123, class: 45, item: 6789 });
  assert.deepEqual(parseDpci('001-02-0003'), { dept: 1, class: 2, item: 3 });
});

test('parseDpci: rejects anything that is not exactly 9 digits after dashes', () => {
  for (const bad of ['', '12345678', '1234567890', '12345678a', '123 45 6789', '123-45-678', '-'.repeat(9)]) {
    assert.equal(parseDpci(bad), null, `expected null for "${bad}"`);
  }
});

test('formatDpci: zero-pads each segment; round-trips with parseDpci', () => {
  assert.equal(formatDpci(1, 2, 3), '001-02-0003');
  assert.equal(formatDpci(999, 99, 9999), '999-99-9999');
  const p = parseDpci(formatDpci(42, 7, 15))!;
  assert.deepEqual(p, { dept: 42, class: 7, item: 15 });
});

test('parseLocationBarcode: 6 or 8 digits, level ignored, whitespace trimmed', () => {
  assert.deepEqual(parseLocationBarcode('304012'), { aisle: 304, bin: 12 });
  assert.deepEqual(parseLocationBarcode('30401203'), { aisle: 304, bin: 12 });
  assert.deepEqual(parseLocationBarcode('  304012 '), { aisle: 304, bin: 12 });
  for (const bad of ['', '30401', '3040120', '304012034', '30401a', '304-012']) {
    assert.equal(parseLocationBarcode(bad), null, `expected null for "${bad}"`);
  }
});

test('parseFullLocationBarcode: exactly 8 digits only', () => {
  assert.deepEqual(parseFullLocationBarcode('00100101'), { aisle: 1, bin: 1, level: 1 });
  assert.deepEqual(parseFullLocationBarcode('99999999'), { aisle: 999, bin: 999, level: 99 });
  for (const bad of ['304012', '3040120', '304012034', 'abcdefgh']) {
    assert.equal(parseFullLocationBarcode(bad), null, `expected null for "${bad}"`);
  }
});

test('formatLocationId: canonical zero-padded 8 digits; round-trips', () => {
  assert.equal(formatLocationId(1, 2, 3), '00100203');
  assert.equal(formatLocationId(318, 127, 6), '31812706');
  assert.deepEqual(parseFullLocationBarcode(formatLocationId(318, 127, 6)), { aisle: 318, bin: 127, level: 6 });
});

test('location string helpers: split, aisle+bin, withLevel, display', () => {
  assert.deepEqual(splitLocationId('31812706'), { aisle: '318', bin: '127', level: '06' });
  assert.deepEqual(splitLocationId('318127'), { aisle: '318', bin: '127', level: undefined });
  assert.equal(aisleBinOf('31812706'), '318127');
  assert.equal(aisleBinOf('318127'), '318127');
  assert.equal(withLevel('318127', 4), '31812704');
  assert.equal(withLevel('31812706', 12), '31812712');
  assert.equal(displayLocationId('31812706'), '318-127-06');
  assert.equal(displayLocationId('318127'), '318-127');
  assert.equal(displayLocationId('3181'), '3181');
});

test('coercePalletId: numbers pass through, strings parse, junk is NaN', () => {
  assert.equal(coercePalletId(12345678), 12345678);
  assert.equal(coercePalletId('12345678'), 12345678);
  assert.ok(Number.isNaN(coercePalletId('abc')));
  assert.ok(Number.isNaN(coercePalletId('')));
});

test('parseCidOrThrow: invalid input throws 400 INVALID_CID_FORMAT', () => {
  for (const bad of ['', 'not-a-cid', '123']) {
    assert.throws(() => parseCidOrThrow(bad), (e: Error & { status?: number }) => e.message === 'INVALID_CID_FORMAT' && e.status === 400);
  }
});

test('parseCidOrThrow: a full-case CID returns its canonical form, type and fields', () => {
  // 91 | store 1234 | DPCI 123456789 | pallet 12345678 | carton 001 | zone 05 | batch 2026323
  const cid = '91' + '1234' + '123456789' + '12345678' + '001' + '05' + '2026323';
  const parsed = parseCidOrThrow(cid);
  assert.equal(parsed.canonical, cid);
  assert.equal(parsed.type, '91');
  assert.deepEqual(parsed.fields, {
    type: '91', destStore: 1234, dpci: { dept: 123, class: 45, item: 6789 },
    palletId: 12345678, cartonNumber: 1, packingZone: 5, batchDate: 2026323,
  });
});
