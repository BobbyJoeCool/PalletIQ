// functions/locations.ts — location lookup, empty-location searches, single and range
// holds, aisle-exists, location activity (test plan Part 2, #237). Hold tests put the
// location back the way they found it.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { call, tabletToken, prisma, USERS } from './harness.js';
import { formatLocationId } from '../../lib/locationParser.js';

let worker: string;
let im: string;
let reason: { reasonPrefix: string; reasonNumber: string };

/** First reason code the given user may use for holds. */
async function holdReason(token: string) {
  const res = await call<{ prefixes: { letter: string }[]; reasons: { number: string; restrictedToPrefixes: string[] | null }[] }>(
    'GET', '/reason-codes?domain=HOLD', { token });
  const prefix = res.body.prefixes[0].letter;
  const r = res.body.reasons.find((x) => !x.restrictedToPrefixes || x.restrictedToPrefixes.includes(prefix))!;
  return { reasonPrefix: prefix, reasonNumber: r.number };
}

before(async () => {
  worker = await tabletToken(USERS.worker);
  im = await tabletToken(USERS.im);
  reason = await holdReason(im);
});

/** An unheld, uncontracted, non-deleted EMPTY location. */
async function freeLocation() {
  const loc = await prisma.location.findFirstOrThrow({ where: { status: 'EMPTY', holdCategory: null, contraction: false, deleted: false } });
  return { loc, id: formatLocationId(loc.aisle, loc.bin, loc.level) };
}

test('GET locations/{id}: loads a location; malformed 400; unknown 404', async () => {
  const { id } = await freeLocation();
  const res = await call('GET', `/locations/${id}`, { token: worker });
  assert.equal(res.status, 200);
  assert.equal((await call('GET', '/locations/123', { token: worker })).status, 400);
  assert.equal((await call('GET', '/locations/99999999', { token: worker })).status, 404);
});

test('aisle-exists: true for a seeded aisle, false for a missing one', async () => {
  const { loc } = await freeLocation();
  const yes = await call<{ exists: boolean }>('GET', `/locations/aisle-exists?aisle=${loc.aisle}`, { token: worker });
  assert.equal(yes.status, 200);
  assert.equal(yes.body.exists, true);
  const no = await call<{ exists: boolean }>('GET', '/locations/aisle-exists?aisle=997', { token: worker });
  assert.equal(no.body.exists, false);
});

test('empty-by-aisle / empty-by-zone: require their filters', async () => {
  assert.equal((await call('GET', '/locations/empty-by-aisle', { token: worker })).status, 400);
  assert.equal((await call('GET', '/locations/empty-by-zone', { token: worker })).status, 400);
  assert.equal((await call('GET', '/locations/empty-by-zone?aisle=abc&storageCode=CR&size=S', { token: worker })).status, 400);
  const { loc } = await freeLocation();
  const byZone = await call('GET', `/locations/empty-by-zone?aisle=${loc.aisle}&storageCode=${loc.storageCode}&size=${loc.size}`, { token: worker });
  assert.equal(byZone.status, 200);
  const byAisle = await call('GET', `/locations/empty-by-aisle?storageCode=${loc.storageCode}&size=${loc.size}&aisleStart=${loc.aisle}&aisleEnd=${loc.aisle}`, { token: worker });
  assert.equal(byAisle.status, 200);
});

test('hold: a worker may place Hold Both but not Hold In', async () => {
  const workerReason = await holdReason(worker);
  const { loc, id } = await freeLocation();
  try {
    assert.deepEqual(await call('PATCH', `/locations/${id}/hold`, { token: worker, body: { holdType: 'HOLD_IN', ...workerReason } }),
      { status: 403, body: { error: 'FORBIDDEN' } });
    const placed = await call('PATCH', `/locations/${id}/hold`, { token: worker, body: { holdType: 'HOLD_BOTH', ...workerReason } });
    assert.equal(placed.status, 200);
    assert.deepEqual(placed.body, { locationId: id, holdType: 'HOLD_BOTH', previousHoldType: null });
    // Removing Hold Both takes an IM.
    assert.equal((await call('DELETE', `/locations/${id}/hold`, { token: worker })).status, 403);
  } finally {
    await prisma.location.update({ where: { LocationID: { aisle: loc.aisle, bin: loc.bin, level: loc.level } }, data: { holdCategory: null } });
  }
});

test('hold: an IM places and removes a hold; removing when none is 409 NO_HOLD', async () => {
  const { id } = await freeLocation();
  assert.equal((await call('PATCH', `/locations/${id}/hold`, { token: im, body: { holdType: 'HOLD_IN', ...reason } })).status, 200);
  const loaded = await call<Record<string, unknown>>('GET', `/locations/${id}`, { token: im });
  assert.ok(JSON.stringify(loaded.body).includes('HOLD_IN'));
  assert.equal((await call('DELETE', `/locations/${id}/hold`, { token: im })).status, 200);
  assert.deepEqual(await call('DELETE', `/locations/${id}/hold`, { token: im }), { status: 409, body: { error: 'NO_HOLD' } });
});

test('hold: bad id, bad hold type, missing reason are 400; unknown location 404', async () => {
  const { id } = await freeLocation();
  assert.equal((await call('PATCH', '/locations/123/hold', { token: im, body: { holdType: 'HOLD_IN', ...reason } })).status, 400);
  assert.equal((await call('PATCH', `/locations/${id}/hold`, { token: im, body: { holdType: 'HOLD_SIDEWAYS', ...reason } })).status, 400);
  assert.equal((await call('PATCH', `/locations/${id}/hold`, { token: im, body: { holdType: 'HOLD_IN' } })).status, 400);
  assert.equal((await call('PATCH', `/locations/${id}/hold`, { token: im, body: { holdType: 'HOLD_IN', reasonPrefix: 'Q', reasonNumber: '99' } })).status, 400);
  assert.equal((await call('PATCH', '/locations/99999999/hold', { token: im, body: { holdType: 'HOLD_IN', ...reason } })).status, 404);
});

test('range hold: IM floor; count, place and release over a range of one aisle', async () => {
  assert.equal((await call('GET', '/locations/range-count?aisle=301&startBin=1&endBin=2&binSide=ALL', { token: worker })).status, 403);
  assert.equal((await call('GET', '/locations/range-count', { token: im })).status, 400);
  // Pick a two-bin range with no holds on it at all, so release restores it exactly.
  const { loc } = await freeLocation();
  const range = { aisle: loc.aisle, startBin: loc.bin, endBin: loc.bin, binSide: 'ALL' };
  const heldBefore = await prisma.location.count({ where: { aisle: loc.aisle, bin: loc.bin, holdCategory: { not: null } } });
  if (heldBefore > 0) return; // the seed held this bin; nothing safe to test here
  const count = await call<{ total: number }>('GET', `/locations/range-count?aisle=${loc.aisle}&startBin=${loc.bin}&endBin=${loc.bin}&binSide=ALL`, { token: im });
  assert.equal(count.status, 200);
  assert.equal(count.body.total, await prisma.location.count({ where: { aisle: loc.aisle, bin: loc.bin, deleted: false } }));
  assert.equal((await call('PATCH', '/locations/range-hold', { token: im, body: { ...range, startBin: loc.bin + 1, endBin: loc.bin, holdType: 'HOLD_OUT', ...reason } })).status, 400);
  try {
    assert.equal((await call('PATCH', '/locations/range-hold', { token: im, body: { ...range, holdType: 'HOLD_OUT', ...reason } })).status, 200);
    assert.ok(await prisma.location.count({ where: { aisle: loc.aisle, bin: loc.bin, holdCategory: 'HOLD_OUT' } }) > 0);
    assert.equal((await call('DELETE', '/locations/range-hold', { token: im, body: { ...range, holdType: 'HOLD_OUT' } })).status, 200);
    assert.equal(await prisma.location.count({ where: { aisle: loc.aisle, bin: loc.bin, holdCategory: { not: null } } }), 0);
  } finally {
    await prisma.location.updateMany({ where: { aisle: loc.aisle, bin: loc.bin }, data: { holdCategory: null } });
  }
});

test('location activity: a location id lists its events; a bad id is 400', async () => {
  const row = await prisma.activityLog.findFirstOrThrow({ where: { locationAisle: { not: null }, locationBin: { not: null }, locationLevel: { not: null } } });
  const id = formatLocationId(row.locationAisle!, row.locationBin!, row.locationLevel!);
  const res = await call<unknown[]>('GET', `/locations/${id}/activity`, { token: worker });
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body) && res.body.length > 0);
  assert.equal((await call('GET', '/locations/abc/activity', { token: worker })).status, 400);
});
