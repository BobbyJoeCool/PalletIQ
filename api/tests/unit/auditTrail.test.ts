// Unit tests for the Audit Tool's pure trail assembly (#148). No DB, no HTTP.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  describeRange, fromActivityRow, fromContainerEvent, fromScanLogRow, isOpenRange,
  mergeTrail, parseDetails, parseRange,
} from '../../lib/auditTrail.js';
import { isAuditEntityType } from '../../../shared/audit.js';
import type { ActivityRow } from '../../lib/activityRow.js';

const row = (over: Partial<ActivityRow> = {}): ActivityRow => ({
  id: 7, timestamp: new Date('2026-11-16T10:00:00Z'), userId: 'z002p23', actionType: 'PUT',
  palletId: 4471203, locationAisle: 318, locationBin: 1, locationLevel: 4,
  dept: 57, class: 1, item: 4, reasonPrefix: null, reasonNumber: null, details: null,
  ...over,
});

test('audit: entity type guard', () => {
  assert.equal(isAuditEntityType('PALLET'), true);
  assert.equal(isAuditEntityType('APPOINTMENT'), false);
  assert.equal(isAuditEntityType(null), false);
});

test('audit: activity row → entry formats location, DPCI and reason', () => {
  const entry = fromActivityRow(row({ reasonPrefix: 'W', reasonNumber: '70', details: '{"method":"SDP"}' }));
  assert.deepEqual(entry, {
    key: 'A:7', timestamp: '2026-11-16T10:00:00.000Z', source: 'ACTIVITY', action: 'PUT',
    userId: 'z002p23', palletId: 4471203, location: '31800104', dpci: '057-01-0004',
    cid: null, reason: 'W70', details: { method: 'SDP' },
  });
});

test('audit: an aisle-only activity row has no location; half a reason code is no reason', () => {
  const entry = fromActivityRow(row({ locationBin: null, locationLevel: null, dept: null, class: null, item: null, reasonPrefix: 'W' }));
  assert.equal(entry.location, null);
  assert.equal(entry.dpci, null);
  assert.equal(entry.reason, null);
});

test('audit: malformed or non-object details never throw', () => {
  assert.equal(parseDetails('{not json'), null);
  assert.equal(parseDetails('[1,2]'), null);
  assert.equal(parseDetails('"text"'), null);
  assert.equal(parseDetails(null), null);
  assert.equal(fromActivityRow(row({ details: '{not json' })).details, null);
});

test('audit: container event → entry carries the CID, context and reason', () => {
  const entry = fromContainerEvent(
    'CID-1',
    { source: 'ContainerEvent', eventType: 'PULLED', timestamp: new Date('2026-11-16T09:00:00Z'), userZ: null, details: { reasonPrefix: 'I', reasonNumber: '02' } },
    3,
    { palletId: 9, dpci: '057-01-0004' },
  );
  assert.equal(entry.key, 'C:CID-1:ContainerEvent:3');
  assert.equal(entry.cid, 'CID-1');
  assert.equal(entry.palletId, 9);
  assert.equal(entry.dpci, '057-01-0004');
  assert.equal(entry.reason, 'I02');
  assert.equal(entry.userId, null);
});

test('audit: scan log row → entry reads the CID out of details', () => {
  const entry = fromScanLogRow({ id: 'u1', zNumber: 'z002p24', timestamp: new Date('2026-11-16T08:00:00Z'), actionType: 'CONTAINER_CANCEL', details: '{"cid":"CID-9","reasonPrefix":"I","reasonNumber":"05"}' });
  assert.equal(entry.source, 'SCAN');
  assert.equal(entry.cid, 'CID-9');
  assert.equal(entry.reason, 'I05');
  assert.equal(fromScanLogRow({ id: 'u2', zNumber: 'z', timestamp: new Date(), actionType: 'X', details: 'oops' }).cid, null);
});

test('audit: mergeTrail sorts newest first across sources and reports truncation', () => {
  const a = fromActivityRow(row({ id: 1, timestamp: new Date('2026-11-16T10:00:00Z') }));
  const b = fromActivityRow(row({ id: 2, timestamp: new Date('2026-11-16T12:00:00Z') }));
  const c = fromScanLogRow({ id: 's', zNumber: 'z', timestamp: new Date('2026-11-16T11:00:00Z'), actionType: 'X', details: '{}' });

  assert.deepEqual(mergeTrail([a, b, c]).trail.map((e) => e.key), ['A:2', 'S:s', 'A:1']);
  assert.equal(mergeTrail([a, b, c]).truncated, false);

  const cut = mergeTrail([a, b, c], 2);
  assert.deepEqual(cut.trail.map((e) => e.key), ['A:2', 'S:s']);
  assert.equal(cut.truncated, true);
  assert.equal(mergeTrail([a, b], 2).truncated, false);
});

test('audit: parseRange accepts open ends, rejects junk and inverted ranges', () => {
  assert.deepEqual(parseRange(null, null), {});
  assert.deepEqual(parseRange('', ' '), {});
  assert.deepEqual(parseRange('1', '20'), { start: 1, end: 20 });
  assert.deepEqual(parseRange(' 5 ', null), { start: 5 });
  assert.deepEqual(parseRange(null, '9'), { end: 9 });
  assert.equal(parseRange('20', '1'), null);
  assert.equal(parseRange('a', '3'), null);
  assert.equal(parseRange('-1', '3'), null);
  assert.equal(parseRange('1.5', null), null);
});

test('audit: range helpers', () => {
  assert.equal(isOpenRange({}), true);
  assert.equal(isOpenRange({ end: 3 }), false);
  assert.equal(describeRange({}), null);
  assert.equal(describeRange({ start: 1, end: 20 }), '1–20');
  assert.equal(describeRange({ start: 4, end: 4 }), '4');
  assert.equal(describeRange({ start: 5 }), '5+');
  assert.equal(describeRange({ end: 9 }), 'up to 9');
});
