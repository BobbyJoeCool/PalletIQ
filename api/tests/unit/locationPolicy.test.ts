// Unit tests for the location acceptance policy (#212). Pure — no DB.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  acceptsInbound, stageable, countsAsOpenCapacity, putDecision, reinstateReasons, reinstateDecision,
  holdTransition, placeableHoldTypes, resolveRangePlace, resolveRangeRelease,
} from '../../../shared/locationPolicy.js';
import { whereAcceptsPut } from '../../lib/locationPolicy.js';

const loc = (o: Partial<{ status: string; holdCategory: string | null; contraction: boolean; storageCode: string }> = {}) =>
  ({ status: 'EMPTY', holdCategory: null, contraction: false, storageCode: 'NR', ...o });

test('acceptsInbound: HOLD_OUT never blocks; IN/BOTH/PERM and contraction do', () => {
  assert.equal(acceptsInbound(loc()), true);
  assert.equal(acceptsInbound(loc({ holdCategory: 'HOLD_OUT' })), true);
  for (const h of ['HOLD_IN', 'HOLD_BOTH', 'HOLD_PERM']) assert.equal(acceptsInbound(loc({ holdCategory: h })), false);
  assert.equal(acceptsInbound(loc({ contraction: true })), false);
});

test('stageable / open capacity status rules', () => {
  assert.equal(stageable(loc()), true);
  assert.equal(stageable(loc({ status: 'STAGED' })), false);
  assert.equal(countsAsOpenCapacity(loc({ status: 'STAGED' })), true);
  assert.equal(countsAsOpenCapacity(loc({ status: 'STORED' })), false);
  assert.equal(countsAsOpenCapacity(loc({ status: 'EMPTY', holdCategory: 'HOLD_IN' })), false);
});

test('whereAcceptsPut: not contracted, not inbound-held, not deleted, not Not For Storage (#143)', () => {
  assert.deepEqual(whereAcceptsPut(), {
    contraction: false,
    deleted: false,
    NOT: { storageCode: 'XO' },
    OR: [{ holdCategory: null }, { holdCategory: 'HOLD_OUT' }],
  });
});

test('putDecision (MNP manual confirm) gate order and codes', () => {
  assert.deepEqual(putDecision(loc({ contraction: true }), 'WORKER', {}), { kind: 'deny', code: 'CONTRACTED', httpStatus: 403 });
  assert.equal(putDecision(loc({ contraction: true }), 'IM', {}).kind, 'confirm');
  assert.equal(putDecision(loc({ contraction: true }), 'IM', { contraction: true }).kind, 'allow');
  assert.deepEqual(putDecision(loc({ holdCategory: 'HOLD_PERM' }), 'ADMIN', { hold: true }), { kind: 'deny', code: 'DESTINATION_HOLD_PERM', httpStatus: 403 });
  assert.equal(putDecision(loc({ holdCategory: 'HOLD_IN' }), 'WORKER', { hold: true }).kind, 'deny');
  const c = putDecision(loc({ holdCategory: 'HOLD_BOTH' }), 'IM', {});
  assert.equal(c.kind === 'confirm' && c.code, 'HOLD_CONFIRM_REQUIRED');
  assert.equal(putDecision(loc({ holdCategory: 'HOLD_OUT' }), 'WORKER', {}).kind, 'allow');
});

test('reinstate (PAR): HOLD_OUT ignored, storage mismatch counted', () => {
  assert.deepEqual(reinstateReasons(loc({ holdCategory: 'HOLD_OUT' }), 'NR'), []);
  assert.deepEqual(reinstateReasons(loc({ storageCode: 'FD' }), 'NR'), ['STORAGE_MISMATCH']);
  assert.deepEqual(reinstateReasons(loc({ status: 'STORED', holdCategory: 'HOLD_IN', contraction: true }), null),
    ['OCCUPIED', 'ON_HOLD', 'CONTRACTED']);
  const d = reinstateDecision(loc({ storageCode: 'FD' }), 'NR', false);
  assert.equal(d.kind === 'confirm' && d.code, 'LOCATION_NEEDS_CONFIRM');
  assert.equal(reinstateDecision(loc({ storageCode: 'FD' }), 'NR', true).kind, 'allow');
});

test('holdTransition: place role, plus remove role when replacing a different hold', () => {
  assert.equal(holdTransition(null, 'HOLD_BOTH', 'WORKER').kind, 'allow');
  assert.equal(holdTransition(null, 'HOLD_IN', 'WORKER').kind, 'deny');
  assert.equal(holdTransition('HOLD_PERM', 'HOLD_BOTH', 'IM').kind, 'deny');
  assert.equal(holdTransition('HOLD_PERM', 'HOLD_PERM', 'LEAD').kind, 'allow');
  assert.equal(holdTransition('HOLD_BOTH', 'HOLD_BOTH', 'WORKER').kind, 'allow');
  assert.deepEqual(placeableHoldTypes('HOLD_PERM', 'IM'), []);
  assert.deepEqual(placeableHoldTypes(null, 'WORKER'), ['HOLD_BOTH']);
});

test('range hierarchy', () => {
  assert.deepEqual(resolveRangePlace('HOLD_IN', 'HOLD_OUT'), { next: 'HOLD_BOTH', outcome: 'upgraded' });
  assert.deepEqual(resolveRangePlace('HOLD_IN', 'HOLD_PERM'), { next: 'HOLD_PERM', outcome: 'blocked' });
  assert.deepEqual(resolveRangePlace('HOLD_BOTH', null), { next: 'HOLD_BOTH', outcome: 'placed' });
  assert.deepEqual(resolveRangeRelease('HOLD_IN', 'HOLD_BOTH'), { next: 'HOLD_OUT', outcome: 'downgraded' });
  assert.deepEqual(resolveRangeRelease('HOLD_BOTH', 'HOLD_PERM'), { next: 'HOLD_PERM', outcome: 'untouched' });
  assert.deepEqual(resolveRangeRelease('HOLD_PERM', 'HOLD_IN'), { next: null, outcome: 'released' });
});
