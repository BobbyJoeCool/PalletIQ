// Floor write flows (test plan Part 2, #237): directed put reserve → unassign / confirm,
// the reservation timeout job under a mocked clock, pull verify, staging and container
// inquiry. Each flow picks its own fresh fixture from the seeded test database.
import { test, before, mock } from 'node:test';
import assert from 'node:assert/strict';
import { call, tabletToken, prisma, USERS } from './harness.js';
import { clearExpiredReservations } from '../../functions/reservationTimer.js';
import { formatLocationId } from '../../lib/locationParser.js';

let worker: string;
let im: string;
before(async () => {
  worker = await tabletToken(USERS.worker);
  im = await tabletToken(USERS.im);
});

/** A well-formed full-case CID (35 digits) that the seed never creates. */
const UNKNOWN_CID = '91' + '9999' + '999999999' + '99999999' + '999' + '99' + '2026001';

const quietCtx = { log: () => {}, error: () => {} };

/** A PUT_PENDING pallet and an aisle with an open location of its size and storage code. */
async function putFixture() {
  const pallets = await prisma.pallet.findMany({
    where: { status: 'PUT_PENDING', locationAisle: null, size: { not: null }, storageCode: { not: null }, reservations: { none: {} } },
    take: 50,
  });
  for (const p of pallets) {
    const loc = await prisma.location.findFirst({
      where: {
        status: 'EMPTY', storageCode: p.storageCode!, size: p.size!, holdCategory: null, contraction: false, deleted: false,
      },
    });
    if (loc) return { pallet: p, aisle: loc.aisle };
  }
  throw new Error('no PUT_PENDING pallet with an open matching location in the test database');
}

async function reserve(token = worker) {
  const { pallet, aisle } = await putFixture();
  const res = await call<{ reservationId: number; directedLocation: string }>('POST', '/puts/directed', { token, body: { aisle, palletId: pallet.pid } });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return { ...res.body, palletRow: pallet };
}

test('directed put: missing fields 400; a worker may not override storage or zone', async () => {
  assert.equal((await call('POST', '/puts/directed', { token: worker, body: {} })).status, 400);
  const { pallet, aisle } = await putFixture();
  assert.deepEqual(await call('POST', '/puts/directed', { token: worker, body: { aisle, palletId: pallet.pid, storageCode: 'CR' } }),
    { status: 403, body: { error: 'FORBIDDEN' } });
});

test('directed put: reserves a location; unassign releases it', async () => {
  const { reservationId, directedLocation } = await reserve();
  const r = await prisma.reservation.findUniqueOrThrow({ where: { id: reservationId } });
  assert.equal(formatLocationId(r.locationAisle, r.locationBin, r.locationLevel), directedLocation);
  const loc = await prisma.location.findUniqueOrThrow({ where: { LocationID: { aisle: r.locationAisle, bin: r.locationBin, level: r.locationLevel } } });
  assert.equal(loc.status, 'RESERVED');
  const un = await call('POST', `/puts/${reservationId}/unassign`, { token: worker });
  assert.equal(un.status, 200);
  assert.equal(await prisma.reservation.count({ where: { id: reservationId } }), 0);
  assert.equal((await call('POST', '/puts/abc/unassign', { token: worker })).status, 400);
});

test('directed put: confirming the wrong location is 400 LOCATION_MISMATCH; the right one stores the pallet', async () => {
  const { reservationId, directedLocation, palletRow } = await reserve();
  assert.equal((await call('POST', `/puts/${reservationId}/confirm`, { token: worker, body: {} })).status, 400);
  const wrongBin = String((Number(directedLocation.slice(3, 6)) % 900) + 1).padStart(3, '0');
  assert.deepEqual(await call('POST', `/puts/${reservationId}/confirm`, { token: worker, body: { scannedLocation: directedLocation.slice(0, 3) + wrongBin } }),
    { status: 400, body: { error: 'LOCATION_MISMATCH' } });
  const ok = await call('POST', `/puts/${reservationId}/confirm`, { token: worker, body: { scannedLocation: directedLocation } });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  const stored = await prisma.pallet.findUniqueOrThrow({ where: { pid: palletRow.pid } });
  assert.equal(stored.status, 'STORED');
  assert.equal(formatLocationId(stored.locationAisle!, stored.locationBin!, stored.locationLevel!), directedLocation);
});

test('consolidation candidates: unknown reservation 404; bad id 400', async () => {
  assert.equal((await call('GET', '/puts/999999999/consolidation-candidates', { token: worker })).status, 404);
  assert.equal((await call('GET', '/puts/abc/consolidation-candidates', { token: worker })).status, 400);
});

test('reservation timer: leaves a fresh reservation alone; expires one older than 5 minutes', async (t) => {
  const { reservationId } = await reserve();
  const created = (await prisma.reservation.findUniqueOrThrow({ where: { id: reservationId } })).createdAt.getTime();
  try {
    t.mock.timers.enable({ apis: ['Date'], now: created + 4 * 60_000 });
    await clearExpiredReservations({}, quietCtx);
    t.mock.timers.reset();
    assert.equal(await prisma.reservation.count({ where: { id: reservationId } }), 1, 'a 4-minute-old reservation stays');

    t.mock.timers.enable({ apis: ['Date'], now: created + 6 * 60_000 });
    await clearExpiredReservations({}, quietCtx);
    t.mock.timers.reset();
    assert.equal(await prisma.reservation.count({ where: { id: reservationId } }), 0, 'a 6-minute-old reservation is cleared');
    assert.equal(await prisma.activityLog.count({ where: { actionType: 'RES_TMOUT', details: { contains: `"reservationId":${reservationId}` } } }), 1);
  } finally {
    mock.timers.reset();
    await call('POST', `/puts/${reservationId}/unassign`, { token: worker }).catch(() => undefined);
  }
});

test('manual put: scan/confirm/cancel validate their input', async () => {
  assert.equal((await call('POST', '/puts/manual/scan', { token: worker, body: { palletId: 'abc' } })).status, 400);
  assert.equal((await call('POST', '/puts/manual/confirm', { token: worker, body: {} })).status, 400);
  assert.equal((await call('POST', '/puts/manual/cancel', { token: worker, body: {} })).status, 400);
});

test('pull verify: required fields, unknown container, wrong function, wrong pallet', async () => {
  assert.equal((await call('POST', '/pulls/verify', { token: worker, body: {} })).status, 400);
  assert.equal((await call('POST', '/pulls/verify', { token: worker, body: { containerId: 'X' } })).status, 400);
  assert.equal((await call('POST', '/pulls/verify', { token: worker, body: { containerId: 'X', pullFunction: 'CA' } })).status, 400);
  assert.equal((await call('POST', '/pulls/verify', { token: worker, body: { containerId: 'X', pullFunction: 'CA', palletId: 1 } })).status, 404);
  const c = await prisma.container.findFirstOrThrow({ where: { status: 'PRINTED' } });
  const other = c.pullFunction === 'CA' ? 'FP' : 'CA';
  assert.deepEqual(await call('POST', '/pulls/verify', { token: worker, body: { containerId: c.cid, pullFunction: other, palletId: c.pid } }),
    { status: 409, body: { error: 'WRONG_PULL_FUNCTION' } });
  assert.deepEqual(await call('POST', '/pulls/verify', { token: worker, body: { containerId: c.cid, pullFunction: c.pullFunction, palletId: c.pid + 1 } }),
    { status: 400, body: { error: 'PALLET_MISMATCH' } });
});

test('staging: stage needs aisle, type and locations; unknown aisle 404; restage is IM+', async () => {
  assert.equal((await call('POST', '/staging/stage', { token: worker, body: {} })).status, 400);
  assert.equal((await call('POST', '/staging/stage', { token: worker, body: { aisle: 997, storageCode: 'CR', size: 'S', locationIds: ['99700101'] } })).status, 404);
  const loc = await prisma.location.findFirstOrThrow({ where: { deleted: false } });
  assert.equal((await call('POST', '/staging/stage', { token: worker, body: { aisle: loc.aisle, storageCode: 'CR', size: 'S', locationIds: ['12'] } })).status, 400);
  assert.equal((await call('POST', '/staging/restage', { token: worker, body: { aisle: loc.aisle, types: [] } })).status, 403);
  assert.equal((await call('POST', '/staging/restage', { token: im, body: { aisle: loc.aisle, types: [{ storageCode: 'CR', size: 'S', quantity: -1 }] } })).status, 400);
});

test('staging: staged types and next location for a seeded aisle', async () => {
  assert.equal((await call('GET', '/staging/staged-types', { token: worker })).status, 400);
  const loc = await prisma.location.findFirstOrThrow({ where: { status: 'EMPTY', deleted: false, contraction: false, holdCategory: null } });
  assert.equal((await call('GET', `/staging/staged-types?aisle=${loc.aisle}`, { token: worker })).status, 200);
  assert.equal((await call('GET', '/staging/next-location?aisle=abc&storageCode=CR&size=S', { token: worker })).status, 400);
  const next = await call('GET', `/staging/next-location?aisle=${loc.aisle}&storageCode=${loc.storageCode}&size=${loc.size}`, { token: worker });
  assert.ok([200, 404].includes(next.status), JSON.stringify(next));
});

test('container inquiry: a seeded container and its events; unknown 404; bad CID 400', async () => {
  const c = await prisma.container.findFirstOrThrow();
  const res = await call('GET', `/containers/inquiry/${c.cid}`, { token: worker });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal((await call('GET', `/containers/${c.cid}/events`, { token: worker })).status, 200);
  assert.equal((await call('GET', `/containers/inquiry/${UNKNOWN_CID}`, { token: worker })).status, 404);
  assert.equal((await call('GET', '/containers/inquiry/not-a-cid', { token: worker })).status, 400);
});

test('container inquiry actions: IM only, and need a reason', async () => {
  const c = await prisma.container.findFirstOrThrow();
  for (const path of [`/containers/${c.cid}/cancel`, '/overpacks/X/force-close', '/overpacks/X/reopen', '/stray-eaches/X/reassign']) {
    assert.equal((await call('POST', path, { token: worker, body: {} })).status, 403, path);
  }
  assert.equal((await call('POST', `/containers/${c.cid}/cancel`, { token: im, body: {} })).status, 400);
});
