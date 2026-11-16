// Typed activity events (#218): each constructor owns its actionType + IRP functionCode.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  putCompleted, consolidated, staged, restaged, pulled, IRP_FUNCTION_CODES, IRP_FUNCTION_SOURCES,
} from '../../lib/activityEvents.js';
import { serializeActivityRow } from '../../lib/activityRow.js';

const base = { userId: 'z002p21' };

test('event constructors set actionType + functionCode', () => {
  assert.deepEqual([putCompleted('SDP', base).actionType, putCompleted('SDP', base).functionCode], ['PUT', 'RP']);
  assert.equal(putCompleted('MNP', base).functionCode, 'HP');
  assert.deepEqual([consolidated(base).actionType, consolidated(base).functionCode], ['CONSOLID', 'CON']);
  assert.deepEqual([staged(base).actionType, staged(base).functionCode], ['STAGE', 'GPM']);
  assert.equal(pulled('FP', base).functionCode, 'FP');
});

test('restage stays out of IRP GPM (per IRP design doc)', () => {
  const e = restaged(base);
  assert.equal(e.actionType, 'STAGE');
  assert.equal(e.functionCode, undefined);
});

test('every IRP code has a source whose actionType the constructors produce', () => {
  assert.deepEqual(IRP_FUNCTION_CODES.sort(), ['CA', 'CF', 'CON', 'FP', 'GPM', 'HP', 'RP']);
  assert.equal(IRP_FUNCTION_SOURCES.GPM.actionType, staged(base).actionType);
});

test('serializeActivityRow formats location/dpci and parses details', () => {
  const row = {
    id: 1, timestamp: new Date(0), userId: 'z', actionType: 'PUT', palletId: 5,
    locationAisle: 101, locationBin: 2, locationLevel: 3, dept: 12, class: 3, item: 45,
    reasonPrefix: null, reasonNumber: null, details: '{"a":1}',
  };
  const out = serializeActivityRow(row);
  assert.equal(out.location, '10100203');
  assert.equal(out.dpci, '012-03-0045');
  assert.deepEqual(out.details, { a: 1 });
  assert.equal(serializeActivityRow({ ...row, locationBin: null }).location, null);
});
