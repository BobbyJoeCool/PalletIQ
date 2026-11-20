// functions/pallets.ts — pallet lookup, IM edit, reinstate, pallet activity (test plan
// Part 2, #237). The edit test puts the pallet's quantity back afterwards.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { call, tabletToken, prisma, USERS } from './harness.js';
import { formatDpci } from '../../lib/dpci.js';

let worker: string;
let im: string;
let reason: { reasonPrefix: string; reasonNumber: string };

before(async () => {
  worker = await tabletToken(USERS.worker);
  im = await tabletToken(USERS.im);
  const res = await call<{ prefixes: { letter: string }[]; reasons: { number: string; restrictedToPrefixes: string[] | null }[] }>(
    'GET', '/reason-codes?domain=PALLET_ADJUST', { token: im });
  const prefix = res.body.prefixes[0].letter;
  const r = res.body.reasons.find((x) => !x.restrictedToPrefixes || x.restrictedToPrefixes.includes(prefix))!;
  reason = { reasonPrefix: prefix, reasonNumber: r.number };
});

/** A stored pallet with no open containers (so quantity edits aren't blocked). */
async function editablePallet() {
  return prisma.pallet.findFirstOrThrow({
    where: { status: 'STORED', currentCartons: { gt: 2 }, containers: { none: { status: { in: ['AVAILABLE', 'PRINTED'] } } } },
  });
}

test('GET pallets/{id}: loads a pallet; non-numeric 400; unknown 404', async () => {
  const p = await editablePallet();
  const res = await call<Record<string, unknown>>('GET', `/pallets/${p.pid}`, { token: worker });
  assert.equal(res.status, 200);
  assert.ok(JSON.stringify(res.body).includes(String(p.pid)));
  assert.equal((await call('GET', '/pallets/abc', { token: worker })).status, 400);
  assert.equal((await call('GET', '/pallets/1', { token: worker })).status, 404);
});

test('PATCH pallets/{id}: IM only', async () => {
  const p = await editablePallet();
  assert.deepEqual(await call('PATCH', `/pallets/${p.pid}`, { token: worker, body: { currentCartons: 1, ...reason } }),
    { status: 403, body: { error: 'FORBIDDEN' } });
});

test('PATCH pallets/{id}: a quantity change needs a reason, then saves', async () => {
  const p = await editablePallet();
  try {
    assert.equal((await call('PATCH', `/pallets/${p.pid}`, { token: im, body: { currentCartons: p.currentCartons - 1 } })).status, 400);
    const res = await call('PATCH', `/pallets/${p.pid}`, { token: im, body: { currentCartons: p.currentCartons - 1, ...reason } });
    assert.equal(res.status, 200);
    assert.equal((await prisma.pallet.findUniqueOrThrow({ where: { pid: p.pid } })).currentCartons, p.currentCartons - 1);
  } finally {
    await prisma.pallet.update({ where: { pid: p.pid }, data: { currentCartons: p.currentCartons } });
  }
});

test('PATCH pallets/{id}: negative quantity, bad VCP/SSP ratio, unknown DPCI, unknown pallet', async () => {
  const p = await editablePallet();
  assert.equal((await call('PATCH', `/pallets/${p.pid}`, { token: im, body: { currentCartons: -1, ...reason } })).status, 400);
  assert.deepEqual(await call('PATCH', `/pallets/${p.pid}`, { token: im, body: { vcp: 10, ssp: 3, ...reason } }),
    { status: 400, body: { error: 'INVALID_VCP_SSP_RATIO' } });
  assert.deepEqual(await call('PATCH', `/pallets/${p.pid}`, { token: im, body: { dpci: { dept: 999, class: 99, item: 9999 }, ...reason } }),
    { status: 404, body: { error: 'DPCI_NOT_FOUND' } });
  assert.equal((await call('PATCH', '/pallets/1', { token: im, body: {} })).status, 404);
  assert.equal((await call('PATCH', '/pallets/abc', { token: im, body: {} })).status, 400);
});

test('PATCH pallets/{id}: no change at all needs no reason', async () => {
  const p = await editablePallet();
  assert.equal((await call('PATCH', `/pallets/${p.pid}`, { token: im, body: { currentCartons: p.currentCartons } })).status, 200);
});

test('reinstate: IM only; shape and item checks', async () => {
  const item = await prisma.item.findFirstOrThrow({ where: { requiresExpirationDate: false } });
  const dpci = formatDpci(item.dept, item.class, item.item);
  const base = { dpci, vcp: 12, ssp: 1, mode: 'single', cartons: 5, ssps: 0 };
  assert.equal((await call('POST', '/pallets/reinstate', { token: worker, body: base })).status, 403);
  assert.equal((await call('POST', '/pallets/reinstate', { token: im, body: { ...base, mode: 'weird' } })).status, 400);
  assert.equal((await call('POST', '/pallets/reinstate', { token: im, body: { ...base, dpci: undefined } })).status, 400);
  assert.equal((await call('POST', '/pallets/reinstate', { token: im, body: { ...base, dpci: '999-99-9999' } })).status, 404);
  assert.equal((await call('POST', '/pallets/reinstate', { token: im, body: { ...base, dpci: undefined, upc: '000000000000' } })).status, 404);
  assert.equal((await call('POST', '/pallets/reinstate', { token: im, body: { ...base, cartons: -1 } })).status, 400);
  assert.equal((await call('POST', '/pallets/reinstate', { token: im, body: { ...base, vcp: 10, ssp: 3 } })).status, 400);
  assert.equal((await call('POST', '/pallets/reinstate', { token: im, body: { ...base, locationId: '99999999' } })).status, 404);
});

test('reinstate: a single pallet with no location is created as a new pallet', async () => {
  const item = await prisma.item.findFirstOrThrow({ where: { requiresExpirationDate: false } });
  const before = await prisma.pallet.count();
  const res = await call('POST', '/pallets/reinstate', {
    token: im, body: { dpci: formatDpci(item.dept, item.class, item.item), vcp: 12, ssp: 1, size: 'M', mode: 'single', cartons: 5, ssps: 0 },
  });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(await prisma.pallet.count(), before + 1);
});

test('pallet activity: lists a pallet\'s events; non-numeric id is 400', async () => {
  const row = await prisma.activityLog.findFirstOrThrow({ where: { palletId: { not: null } } });
  const res = await call<unknown[]>('GET', `/pallets/${row.palletId}/activity`, { token: worker });
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body) && res.body.length > 0);
  assert.equal((await call('GET', '/pallets/abc/activity', { token: worker })).status, 400);
});
