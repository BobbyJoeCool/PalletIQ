// Every route's auth gate (test plan Part 2, #237): no token → 401 on every protected
// route; a tablet-only worker → 403 on every desktop-only route. Placeholder ids are
// fine — the gate runs before anything reads them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { call, tabletToken, USERS } from './harness.js';

/** Routes any signed-in user may call (tablet or desktop session). */
const AUTHENTICATED: [string, string][] = [
  ['GET', '/activity'],
  ['GET', '/containers/X'],
  ['GET', '/containers/inquiry/X'],
  ['GET', '/containers/X/events'],
  ['POST', '/containers/X/cancel'],
  ['POST', '/overpacks/X/force-close'],
  ['POST', '/overpacks/X/reopen'],
  ['POST', '/stray-eaches/X/reassign'],
  ['GET', '/reporting/individual'],
  ['GET', '/reporting/individual/CA/hourly'],
  ['GET', '/reporting/staged-aisle'],
  ['GET', '/items/dpci/123456789'],
  ['GET', '/items/upc/1'],
  ['GET', '/items/dpci/123456789/locations'],
  ['GET', '/items/upc/1/locations'],
  ['GET', '/items/sample'],
  ['GET', '/locations/30100101'],
  ['GET', '/locations/aisle-exists'],
  ['GET', '/storage-codes'],
  ['GET', '/sizes'],
  ['GET', '/printers'],
  ['GET', '/workstations'],
  ['GET', '/locations/empty-by-aisle'],
  ['GET', '/locations/empty-by-zone'],
  ['PATCH', '/locations/30100101/hold'],
  ['DELETE', '/locations/30100101/hold'],
  ['GET', '/locations/range-count'],
  ['PATCH', '/locations/range-hold'],
  ['DELETE', '/locations/range-hold'],
  ['GET', '/locations/30100101/activity'],
  ['GET', '/pallets/1'],
  ['PATCH', '/pallets/1'],
  ['POST', '/pallets/reinstate'],
  ['GET', '/pallets/1/activity'],
  ['GET', '/pulls/summary'],
  ['GET', '/pulls/detail'],
  ['POST', '/pulls/verify'],
  ['POST', '/puts/directed'],
  ['GET', '/puts/1/consolidation-candidates'],
  ['POST', '/puts/1/confirm'],
  ['POST', '/puts/1/unassign'],
  ['POST', '/puts/manual/scan'],
  ['POST', '/puts/manual/confirm'],
  ['POST', '/puts/manual/cancel'],
  ['GET', '/reason-codes'],
  ['POST', '/staging/stage'],
  ['POST', '/staging/restage'],
  ['GET', '/staging/staged-types'],
  ['GET', '/staging/next-location'],
  // Demo scanner lookups: used by the signed-in floor app's demo buttons.
  ['GET', '/demo/container'],
  ['GET', '/demo/pallet'],
  ['GET', '/demo/pallet-status'],
  ['GET', '/demo/location'],
];

/** Routes only desktop-eligible users may call (LEAD and up, or home department ICQA). */
const DESKTOP_ONLY: [string, string][] = [
  ['GET', '/audit'],
  ['GET', '/aisles'],
  ['POST', '/aisles'],
  ['GET', '/aisles/301'],
  ['DELETE', '/aisles/301'],
  ['GET', '/aisles/301/locations'],
  ['PATCH', '/aisles/301/zone-settings'],
  ['PATCH', '/aisles/301/contraction'],
  ['POST', '/locations/30100101/not-for-storage'],
  ['DELETE', '/locations/30100101/not-for-storage'],
  ['GET', '/prod-goals'],
  ['POST', '/prod-goals'],
  ['DELETE', '/prod-goals/1'],
  ['GET', '/ramping'],
  ['POST', '/ramping'],
  ['PATCH', '/ramping/1'],
  ['DELETE', '/ramping/1'],
  ['GET', '/daily-plan'],
  ['PUT', '/daily-plan'],
  ['GET', '/roster'],
  ['PUT', '/roster'],
  ['GET', '/team-prod'],
];

test('every protected route rejects a request with no token (401)', async () => {
  const wrong: string[] = [];
  for (const [method, path] of [...AUTHENTICATED, ...DESKTOP_ONLY]) {
    const res = await call(method, path, { body: method === 'GET' || method === 'DELETE' ? undefined : {} });
    if (res.status !== 401) wrong.push(`${method} ${path} → ${res.status}`);
  }
  assert.deepEqual(wrong, []);
});

test('every protected route rejects a forged token (401)', async () => {
  const wrong: string[] = [];
  for (const [method, path] of [...AUTHENTICATED, ...DESKTOP_ONLY]) {
    const res = await call(method, path, { token: 'eyJhbGciOiJIUzI1NiJ9.e30.forged' });
    if (res.status !== 401) wrong.push(`${method} ${path} → ${res.status}`);
  }
  assert.deepEqual(wrong, []);
});

test('every desktop-only route rejects a tablet-only worker (403 NO_DESKTOP_ACCESS)', async () => {
  const token = await tabletToken(USERS.worker);
  const wrong: string[] = [];
  for (const [method, path] of DESKTOP_ONLY) {
    const res = await call(method, path, { token, body: method === 'GET' || method === 'DELETE' ? undefined : {} });
    if (res.status !== 403 || res.body.error !== 'NO_DESKTOP_ACCESS') wrong.push(`${method} ${path} → ${res.status} ${JSON.stringify(res.body)}`);
  }
  assert.deepEqual(wrong, []);
});

test('public routes need no token: health and sign-in', async () => {
  assert.deepEqual((await call('GET', '/health')).body, { status: 'ok' });
  assert.equal((await call('POST', '/auth/identify', { body: { zNumber: USERS.worker } })).status, 200);
});

test('an unknown route is a 404', async () => {
  assert.equal((await call('GET', '/no-such-route')).status, 404);
});
