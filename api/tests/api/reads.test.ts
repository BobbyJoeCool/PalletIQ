// Read-only floor endpoints (test plan Part 2, #237): health, activity, items, containers,
// reason codes, IRP, staged-aisle report, PRQ, lookups and demo samplers. Fixtures are
// looked up from the seeded test database rather than hard-coded.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { call, tabletToken, prisma, USERS } from './harness.js';
import { formatDpci } from '../../lib/dpci.js';
import { formatLocationId } from '../../lib/locationParser.js';

let token: string;
let imToken: string;
before(async () => {
  token = await tabletToken(USERS.worker);
  imToken = await tabletToken(USERS.im);
});

/** A GET as the worker (or another token); the body type is the caller's expected shape. */
const get = <T = Record<string, unknown>>(path: string, t = token) => call<T>('GET', path, { token: t });

/** The activity endpoints' row fields these tests read. */
interface ActivityJson { timestamp: string; userId: string; palletId: number | null }

test('health: ok', async () => {
  assert.deepEqual(await call('GET', '/health'), { status: 200, body: { status: 'ok' } });
});

test('activity: newest first, capped at 200, each row serialized', async () => {
  const res = await get<ActivityJson[]>('/activity');
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body) && res.body.length > 0 && res.body.length <= 200);
  const times = res.body.map((r) => Date.parse(r.timestamp));
  assert.deepEqual(times, [...times].sort((a, b) => b - a));
});

test('activity: filters by user, pallet and hoursBack', async () => {
  const byUser = await get<ActivityJson[]>(`/activity?user=${USERS.worker}`);
  assert.ok(byUser.body.every((r) => r.userId === USERS.worker));
  const row = await prisma.activityLog.findFirstOrThrow({ where: { palletId: { not: null } } });
  const byPallet = await get<ActivityJson[]>(`/activity?palletId=${row.palletId}`);
  assert.ok(byPallet.body.length > 0 && byPallet.body.every((r) => r.palletId === row.palletId));
  const recent = await get<ActivityJson[]>('/activity?hoursBack=1');
  const cutoff = Date.now() - 3_600_000 - 5_000;
  assert.ok(recent.body.every((r) => Date.parse(r.timestamp) >= cutoff));
});

test('activity: malformed filters are 400', async () => {
  for (const q of ['location=12', 'palletId=abc', 'dpci=1234', 'hoursBack=0', 'hoursBack=-2', 'hoursBack=x']) {
    assert.equal((await get(`/activity?${q}`)).status, 400, q);
  }
});

test('items: by DPCI and by UPC return the item; locations list where it is stored', async () => {
  const pallet = await prisma.pallet.findFirstOrThrow({ where: { status: 'STORED', locationAisle: { not: null } } });
  const item = await prisma.item.findUniqueOrThrow({ where: { DPCI: { dept: pallet.dept, class: pallet.class, item: pallet.item } } });
  const dpci = formatDpci(item.dept, item.class, item.item);
  const byDpci = await get(`/items/dpci/${dpci}`);
  assert.equal(byDpci.status, 200);
  const byUpc = await get(`/items/upc/${item.upc}`);
  assert.equal(byUpc.status, 200);
  assert.deepEqual(byUpc.body, byDpci.body);
  const locs = await get(`/items/dpci/${dpci.replace(/-/g, '')}/locations`);
  assert.equal(locs.status, 200);
  assert.ok(JSON.stringify(locs.body).includes(formatLocationId(pallet.locationAisle!, pallet.locationBin!, pallet.locationLevel!)));
  assert.equal((await get(`/items/upc/${item.upc}/locations`)).status, 200);
});

test('items: malformed DPCI 400; unknown DPCI/UPC 404', async () => {
  assert.equal((await get('/items/dpci/12345')).status, 400);
  assert.equal((await get('/items/dpci/12345/locations')).status, 400);
  assert.equal((await get('/items/dpci/999-99-9999')).status, 404);
  assert.equal((await get('/items/upc/000000000000')).status, 404);
  assert.equal((await get('/items/upc/000000000000/locations')).status, 404);
});

test('items/sample: returns some item', async () => {
  const res = await get('/items/sample');
  assert.equal(res.status, 200);
  assert.ok(res.body);
});

test('containers/{id}: a PRINTED container loads; any other status is 409 with that status; unknown is 404', async () => {
  const printed = await prisma.container.findFirstOrThrow({ where: { status: 'PRINTED' } });
  const res = await get(`/containers/${printed.cid}`);
  assert.equal(res.status, 200);
  const other = await prisma.container.findFirst({ where: { status: { not: 'PRINTED' } } });
  if (other) assert.deepEqual(await get(`/containers/${other.cid}`), { status: 409, body: { error: other.status } });
  assert.equal((await get('/containers/' + '91' + '9999' + '999999999' + '99999999' + '999' + '99' + '2026001')).status, 404);
});

test('reason-codes: HOLD and PALLET_ADJUST load; any other domain is 400', async () => {
  for (const domain of ['HOLD', 'PALLET_ADJUST']) assert.equal((await get(`/reason-codes?domain=${domain}`)).status, 200, domain);
  assert.equal((await get('/reason-codes')).status, 400);
  assert.equal((await get('/reason-codes?domain=OTHER')).status, 400);
});

test('IRP: summary for the signed-in worker; hourly per known function; unknown function 404', async () => {
  assert.equal((await get('/reporting/individual')).status, 200);
  const hourly = await get<{ functionCode: string; rows: unknown[] | null }>('/reporting/individual/ca/hourly');
  assert.equal(hourly.status, 200);
  assert.equal(hourly.body.functionCode, 'CA');
  assert.ok(Array.isArray(hourly.body.rows) || hourly.body.rows === null);
  assert.equal((await get('/reporting/individual/XX/hourly')).status, 404);
});

test('staged-aisle report loads', async () => {
  assert.equal((await get('/reporting/staged-aisle')).status, 200);
});

test('PRQ summary/detail: need an aisle range or workstation and a known status', async () => {
  assert.equal((await get('/pulls/summary')).status, 400);
  assert.equal((await get('/pulls/summary?aisleStart=abc&status=OPEN')).status, 400);
  assert.equal((await get('/pulls/summary?workstation=NO-SUCH-WS&status=OPEN')).status, 404);
  assert.equal((await get('/pulls/detail')).status, 400);
  assert.equal((await get('/pulls/summary?aisleStart=100&aisleEnd=329&status=BOGUS')).status, 400);
});

test('PRQ summary/detail: a printed container shows up for its aisle, batch and function', async () => {
  const c = await prisma.container.findFirstOrThrow({ where: { status: 'PRINTED', pallet: { locationAisle: { not: null } } }, include: { pallet: true } });
  const aisle = c.pallet.locationAisle!;
  // One aisle is aisleStart alone; an aisleEnd must be greater than the start.
  assert.equal((await get(`/pulls/summary?aisleStart=${aisle}&aisleEnd=${aisle}&status=PRINTED`)).status, 400);
  const summary = await get(`/pulls/summary?aisleStart=${aisle}&status=PRINTED`);
  assert.equal(summary.status, 200, JSON.stringify(summary.body));
  assert.ok(JSON.stringify(summary.body).includes(String(c.batchDate)));
  const detail = await get(`/pulls/detail?aisleStart=${aisle}&status=PRINTED&batchDate=${c.batchDate}&pullFunction=${c.pullFunction}`);
  assert.equal(detail.status, 200, JSON.stringify(detail.body));
  assert.ok(JSON.stringify(detail.body).includes(c.cid) || JSON.stringify(detail.body).includes(String(c.pid)));
  assert.equal((await get(`/pulls/detail?aisleStart=${aisle}&status=PRINTED`)).status, 400, 'batchDate and pullFunction are required');
});

test('lookups: storage codes, sizes, printers, workstations', async () => {
  const sizes = await get('/sizes');
  assert.equal(sizes.status, 200);
  assert.ok(JSON.stringify(sizes.body).includes('XS'));
  for (const path of ['/storage-codes', '/printers', '/workstations']) assert.equal((await get(path)).status, 200, path);
});

test('demo samplers: container, pallet and location; bad parameters are 400', async () => {
  assert.equal((await get('/demo/pallet')).status, 200);
  assert.equal((await get('/demo/pallet-status')).status, 400);
  assert.equal((await get('/demo/location?status=wrongType')).status, 400);
  assert.equal((await get('/demo/location?status=consolidate')).status, 400);
  const wrongType = await get<{ locationId: string }>('/demo/location?status=wrongType&storageCode=CR');
  assert.equal(wrongType.status, 200);
  assert.match(wrongType.body.locationId, /^\d{6}$/);
  // A sampler that finds nothing says so with 404 rather than an empty 200.
  assert.equal((await get('/demo/container?fn=ZZ')).status, 404);
  assert.equal((await get('/demo/container', imToken)).status, 200); // the reseed prints containers
});
