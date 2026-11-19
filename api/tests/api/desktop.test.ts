// Desktop-only endpoints (test plan Part 2, #237): audit, aisles, prod goals, ramping,
// daily plan, roster and Team Prod. Covers each one's validation, its LWW-vs-OM gate and a
// read; writes that are safe to undo are made and undone. The desktop e2e suite drives the
// full screens.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { call, desktopToken, prisma, USERS } from './harness.js';
import { formatLocationId } from '../../lib/locationParser.js';
import { formatDpci } from '../../lib/dpci.js';

let lww: string;
let om: string;
let icqa: string;
before(async () => {
  lww = await desktopToken(USERS.lead);
  om = await desktopToken(USERS.manager);
  icqa = await desktopToken(USERS.icqaManager);
});

/** A date a week out, as YYYY-MM-DD, so plan writes never touch today's demo data. */
function nextWeek(): string {
  return new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
}

test('audit: needs a known type and an id', async () => {
  assert.equal((await call('GET', '/audit', { token: lww })).status, 400);
  assert.equal((await call('GET', '/audit?type=BOGUS&id=1', { token: lww })).status, 400);
  assert.equal((await call('GET', '/audit?type=PALLET', { token: lww })).status, 400);
  // An open bin/level range means "all"; only a malformed or reversed one is refused.
  assert.equal((await call('GET', '/audit?type=AISLE&id=301&binStart=x', { token: lww })).status, 400);
  assert.equal((await call('GET', '/audit?type=AISLE&id=301&levelStart=4&levelEnd=2', { token: lww })).status, 400);
});

test('audit: each lookup type finds a seeded record; unknown ids are 404', async () => {
  const pallet = await prisma.pallet.findFirstOrThrow({ where: { status: 'STORED', locationAisle: { not: null } } });
  const container = await prisma.container.findFirstOrThrow();
  const lookups: [string, string][] = [
    ['PALLET', String(pallet.pid)],
    ['LOCATION', formatLocationId(pallet.locationAisle!, pallet.locationBin!, pallet.locationLevel!)],
    ['DPCI', formatDpci(pallet.dept, pallet.class, pallet.item)],
    ['CID', container.cid],
    ['USER', USERS.worker],
  ];
  for (const [type, id] of lookups) {
    const res = await call<{ type: string; trail: unknown[]; truncated: boolean }>('GET', `/audit?type=${type}&id=${encodeURIComponent(id)}`, { token: lww });
    assert.equal(res.status, 200, `${type} ${id}: ${JSON.stringify(res.body)}`);
    assert.equal(res.body.type, type);
    assert.ok(Array.isArray(res.body.trail));
  }
  const aisle = await call('GET', `/audit?type=AISLE&id=${pallet.locationAisle}&binStart=1&binEnd=4&levelStart=1&levelEnd=2`, { token: lww });
  assert.equal(aisle.status, 200);
  assert.equal((await call('GET', '/audit?type=PALLET&id=1', { token: lww })).status, 404);
  assert.equal((await call('GET', '/audit?type=USER&id=z999x99', { token: lww })).status, 404);
});

test('aisles: list and one aisle load; a malformed aisle is 400', async () => {
  const list = await call<unknown[]>('GET', '/aisles', { token: lww });
  assert.equal(list.status, 200);
  assert.ok(Array.isArray(list.body) || typeof list.body === 'object');
  const loc = await prisma.location.findFirstOrThrow({ where: { deleted: false } });
  assert.equal((await call('GET', `/aisles/${loc.aisle}`, { token: lww })).status, 200);
  assert.equal((await call('GET', '/aisles/abcd', { token: lww })).status, 400);
});

test('aisles: cell locations need zone, level and side', async () => {
  const loc = await prisma.location.findFirstOrThrow({ where: { deleted: false } });
  assert.equal((await call('GET', `/aisles/${loc.aisle}/locations`, { token: lww })).status, 400);
  const side = loc.bin % 2 === 0 ? 'EVEN' : 'ODD';
  const res = await call('GET', `/aisles/${loc.aisle}/locations?zone=${loc.zone}&level=${loc.level}&side=${side}`, { token: lww });
  assert.equal(res.status, 200, JSON.stringify(res.body));
});

test('aisles: creating or deleting an aisle takes OM or ICQA, not LWW', async () => {
  assert.deepEqual(await call('POST', '/aisles', { token: lww, body: {} }), { status: 403, body: { error: 'FORBIDDEN' } });
  assert.deepEqual(await call('DELETE', '/aisles/996', { token: lww }), { status: 403, body: { error: 'FORBIDDEN' } });
  assert.equal((await call('POST', '/aisles', { token: om, body: {} })).status, 400);
});

test('aisles: contraction and Not For Storage validate their bodies', async () => {
  const loc = await prisma.location.findFirstOrThrow({ where: { deleted: false } });
  const id = formatLocationId(loc.aisle, loc.bin, loc.level);
  assert.equal((await call('PATCH', `/aisles/${loc.aisle}/contraction`, { token: lww, body: { contracted: 'yes' } })).status, 400);
  assert.equal((await call('POST', `/locations/${id}/not-for-storage`, { token: lww, body: { reason: 'NOPE' } })).status, 400);
  assert.deepEqual(await call('POST', `/locations/${id}/not-for-storage`, { token: lww, body: { reason: 'OTHER' } }), { status: 400, body: { error: 'NOTE_REQUIRED' } });
  assert.deepEqual(await call('DELETE', `/locations/${id}/not-for-storage`, { token: lww }), { status: 403, body: { error: 'FORBIDDEN' } });
});

test('prod goals: LWW reads; only OM changes; a scheduled goal can be cancelled', async () => {
  assert.equal((await call('GET', '/prod-goals', { token: lww })).status, 200);
  const goal = { functionCode: 'CA', rate: 123, effectiveDate: nextWeek() };
  assert.deepEqual(await call('POST', '/prod-goals', { token: lww, body: goal }), { status: 403, body: { error: 'FORBIDDEN' } });
  assert.equal((await call('POST', '/prod-goals', { token: om, body: { ...goal, rate: 'fast' } })).status, 400);
  assert.equal((await call('POST', '/prod-goals', { token: om, body: { ...goal, effectiveDate: '2026-02-30' } })).status, 400);
  const before = await prisma.prodGoal.findMany({ select: { id: true } });
  const set = await call('POST', '/prod-goals', { token: om, body: goal });
  assert.equal(set.status, 200, JSON.stringify(set.body));
  const added = await prisma.prodGoal.findFirst({ where: { id: { notIn: before.map((g) => g.id) } } });
  assert.ok(added, 'a scheduled goal row was added');
  assert.equal((await call('DELETE', `/prod-goals/${added.id}`, { token: om })).status, 200);
  assert.equal(await prisma.prodGoal.count({ where: { id: added.id } }), 0);
  assert.equal((await call('DELETE', '/prod-goals/abc', { token: om })).status, 400);
});

test('ramping: list; add needs worker, function and percent; ids are validated', async () => {
  assert.equal((await call('GET', '/ramping', { token: lww })).status, 200);
  assert.equal((await call('POST', '/ramping', { token: lww, body: { workerZ: USERS.rosterWorker } })).status, 400);
  assert.equal((await call('PATCH', '/ramping/0', { token: lww, body: { percent: 50 } })).status, 400);
  assert.equal((await call('PATCH', '/ramping/1', { token: lww, body: { percent: 'half' } })).status, 400);
  assert.equal((await call('DELETE', '/ramping/x', { token: lww })).status, 400);
});

test('daily plan: read needs a real date and shift; a target saves and clears', async () => {
  const date = nextWeek();
  assert.equal((await call('GET', '/daily-plan', { token: lww })).status, 400);
  assert.equal((await call('GET', `/daily-plan?date=${date}&shift=ZZ`, { token: lww })).status, 400);
  assert.equal((await call('GET', `/daily-plan?date=${date}`, { token: lww })).status, 200);
  assert.equal((await call('PUT', '/daily-plan', { token: lww, body: { date, shiftCode: 'B1', targets: 'all' } })).status, 400);
  assert.equal((await call('PUT', '/daily-plan', { token: lww, body: { date, shiftCode: 'B1', targets: [{ functionCode: 'CA', targetVolume: 'lots' }] } })).status, 400);
  try {
    const save = await call('PUT', '/daily-plan', { token: lww, body: { date, shiftCode: 'B1', targets: [{ functionCode: 'CA', targetVolume: 4321 }] } });
    assert.equal(save.status, 200, JSON.stringify(save.body));
    assert.equal(await prisma.dailyPlanTarget.count({ where: { functionCode: 'CA', targetVolume: 4321 } }), 1);
  } finally {
    await call('PUT', '/daily-plan', { token: lww, body: { date, shiftCode: 'B1', targets: [{ functionCode: 'CA', targetVolume: null }] } });
  }
  assert.equal(await prisma.dailyPlanTarget.count({ where: { functionCode: 'CA', targetVolume: 4321 } }), 0);
});

test('roster: LEAD and up; shift and body validated', async () => {
  const today = new Date().toISOString().slice(0, 10);
  assert.equal((await call('GET', `/roster?date=${today}`, { token: lww })).status, 200);
  assert.equal((await call('GET', `/roster?date=${today}&shift=QQ`, { token: lww })).status, 400);
  assert.equal((await call('GET', '/roster?date=nope', { token: lww })).status, 400);
  assert.equal((await call('PUT', '/roster', { token: lww, body: { date: today, shiftCode: 'B1', timelines: [] } })).status, 400);
  assert.equal((await call('PUT', '/roster', { token: lww, body: { date: today, shiftCode: 'B1', timelines: [{ workerZ: 'a', segments: [] }, { workerZ: 'a', segments: [] }] } })).status, 400);
});

test('team prod: needs a date; a shift must be real; ICQA can view', async () => {
  const today = new Date().toISOString().slice(0, 10);
  assert.equal((await call('GET', '/team-prod', { token: lww })).status, 400);
  assert.equal((await call('GET', `/team-prod?date=${today}&shift=QQ`, { token: lww })).status, 400);
  assert.equal((await call('GET', `/team-prod?date=${today}`, { token: lww })).status, 200);
  assert.equal((await call('GET', `/team-prod?date=${today}`, { token: icqa })).status, 200);
});
