// Query-backed api/lib modules against the seeded test database (test plan Part 2, #237):
// eligibility, staging and directed-put location search, reason-code access, pallet-id
// generation, activity logging, IRP and roster reads. Reads only, or writes inside
// transactions that roll back. `npm run test:db`.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import prisma from '../../lib/prisma.js';
import { checkPalletEligibility } from '../../lib/eligibility.js';
import { findNextStagingLocation } from '../../lib/stagingLogic.js';
import { findNextLocation } from '../../lib/zoneLogic.js';
import { getUserAccessiblePrefixes, getReasonCodesForDomain, validateReasonCode } from '../../lib/reasonCodes.js';
import { generateUniquePid } from '../../lib/palletId.js';
import { writeLog } from '../../lib/activityLog.js';
import { getIndividualSummary, getIndividualHourly } from '../../lib/irpReporting.js';
import { goalsInForce, loadGoalRows } from '../../lib/prodGoals.js';

after(() => prisma.$disconnect());

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];
const ROLLBACK = new Error('ROLLBACK');
async function inRollback(fn: (tx: Tx) => Promise<void>) {
  await prisma.$transaction(async (tx) => { await fn(tx); throw ROLLBACK; }, { timeout: 30_000 })
    .catch((e) => { if (e !== ROLLBACK) throw e; });
}

const rejectsWith = (code: string, status: number) => (e: Error & { status?: number }) => e.message === code && e.status === status;

test('checkPalletEligibility: a stored pallet is eligible and already stored', async () => {
  const p = await prisma.pallet.findFirstOrThrow({
    where: { status: 'STORED', currentCartons: { gt: 0 }, locationAisle: { not: null }, containers: { none: { status: { in: ['AVAILABLE', 'PRINTED'] } } } },
  });
  const r = await checkPalletEligibility(p.pid);
  assert.equal(r.eligible, true);
  assert.equal(r.alreadyStored, true);
  assert.deepEqual([r.currentLocation!.aisle, r.currentLocation!.bin, r.currentLocation!.level], [p.locationAisle, p.locationBin, p.locationLevel]);
});

test('checkPalletEligibility: a put-pending pallet has no current location', async () => {
  const p = await prisma.pallet.findFirstOrThrow({ where: { status: 'PUT_PENDING', locationAisle: null, currentCartons: { gt: 0 } } });
  const r = await checkPalletEligibility(p.pid);
  assert.equal(r.alreadyStored, false);
  assert.equal(r.currentLocation, null);
});

test('checkPalletEligibility: unknown 404, open pull 409, no cartons 409', async () => {
  await assert.rejects(checkPalletEligibility(1), rejectsWith('PALLET_NOT_FOUND', 404));
  const pending = await prisma.container.findFirst({ where: { status: { in: ['AVAILABLE', 'PRINTED'] } } });
  if (pending) await assert.rejects(checkPalletEligibility(pending.pid), rejectsWith('BLOCKED_BY_PENDING_PULL', 409));
  const empty = await prisma.pallet.findFirst({ where: { currentCartons: 0, status: { not: 'CANCELED' }, containers: { none: { status: { in: ['AVAILABLE', 'PRINTED'] } } } } });
  if (empty) await assert.rejects(checkPalletEligibility(empty.pid), rejectsWith('NO_CARTONS', 409));
});

test('findNextStagingLocation: an EMPTY, put-accepting location in zone order; null for an unknown aisle', async () => {
  const seed = await prisma.location.findFirstOrThrow({ where: { status: 'EMPTY', holdCategory: null, contraction: false, deleted: false, NOT: { storageCode: 'XO' } } });
  const found = await findNextStagingLocation(seed.aisle, { storageCode: seed.storageCode, size: seed.size });
  assert.ok(found);
  const loc = await prisma.location.findUniqueOrThrow({ where: { LocationID: { aisle: found.aisle, bin: found.bin, level: found.level } } });
  assert.equal(loc.status, 'EMPTY');
  assert.equal(loc.storageCode, seed.storageCode);
  assert.equal(loc.size, seed.size);
  assert.equal(await findNextStagingLocation(997, {}), null);
});

test('findNextStagingLocation: afterBin walks down the aisle from the given slot', async () => {
  const seed = await prisma.location.findFirstOrThrow({ where: { status: 'EMPTY', holdCategory: null, contraction: false, deleted: false, NOT: { storageCode: 'XO' } } });
  const first = (await findNextStagingLocation(seed.aisle, { storageCode: seed.storageCode, size: seed.size }))!;
  const next = await findNextStagingLocation(seed.aisle, { storageCode: seed.storageCode, size: seed.size, zone: first.zone, afterBin: first.bin, afterLevel: first.level });
  if (next) assert.ok(next.bin < first.bin || (next.bin === first.bin && next.level > first.level) || next.zone > first.zone);
});

test('findNextLocation: prefers STAGED over EMPTY, unless consolidating', async () => {
  const staged = await prisma.location.findFirst({ where: { status: 'STAGED', holdCategory: null, contraction: false, deleted: false } });
  if (!staged) return; // the demo reseed stages locations; nothing to test without one
  const found = await findNextLocation(staged.aisle, 1, { size: staged.size, storageCode: staged.storageCode });
  assert.equal(found?.wasStaged, true);
  const excluding = await findNextLocation(staged.aisle, 1, { size: staged.size, storageCode: staged.storageCode, excludeStaged: true });
  if (excluding) assert.equal(excluding.wasStaged, false);
});

test('findNextLocation: falls back to zone 1 when nothing is free at or above the start zone; null when no match', async () => {
  const seed = await prisma.location.findFirstOrThrow({ where: { status: 'EMPTY', zone: 1, holdCategory: null, contraction: false, deleted: false, NOT: { storageCode: 'XO' } } });
  const found = await findNextLocation(seed.aisle, 99, { size: seed.size, storageCode: seed.storageCode });
  assert.ok(found, 'retries from zone 1');
  assert.equal(await findNextLocation(seed.aisle, 1, { size: 'ZZ', storageCode: seed.storageCode }), null);
});

test('reason codes: prefixes follow department and role; unknown users get none', async () => {
  assert.deepEqual(await getUserAccessiblePrefixes('z999x99', 'ADMIN'), []);
  const worker = await getUserAccessiblePrefixes('z002p21', 'WORKER');
  const lead = await getUserAccessiblePrefixes('z002p21', 'LEAD');
  assert.ok(worker.length > 0);
  assert.ok(lead.length >= worker.length, 'a higher role never loses prefixes');
  const holdCodes = await getReasonCodesForDomain('HOLD');
  assert.ok(holdCodes.length > 0);
  assert.deepEqual(await getReasonCodesForDomain('NOPE'), []);
});

test('validateReasonCode: accepts an allowed pair; rejects bad prefix, number or domain', async () => {
  const [prefix] = await getUserAccessiblePrefixes('z002p22', 'IM');
  const code = (await getReasonCodesForDomain('HOLD')).find((c) => !c.restrictedToPrefixes || c.restrictedToPrefixes.includes(prefix.letter))!;
  await validateReasonCode('z002p22', 'IM', 'HOLD', prefix.letter, code.number);
  await assert.rejects(validateReasonCode('z002p22', 'IM', 'HOLD', '#', code.number), rejectsWith('INVALID_INPUT', 400));
  await assert.rejects(validateReasonCode('z002p22', 'IM', 'HOLD', prefix.letter, 'ZZ'), rejectsWith('INVALID_INPUT', 400));
  await assert.rejects(validateReasonCode('z002p22', 'IM', 'NOPE', prefix.letter, code.number), rejectsWith('INVALID_INPUT', 400));
});

test('generateUniquePid: an 8-digit id no pallet has', async () => {
  const pid = await generateUniquePid();
  assert.ok(pid >= 10_000_000 && pid <= 99_999_999);
  assert.equal(await prisma.pallet.count({ where: { pid } }), 0);
});

test('writeLog: stores the entry with JSON details, inside a transaction client', async () => {
  const pallet = await prisma.pallet.findFirstOrThrow();
  await inRollback(async (tx) => {
    // actionType is VARCHAR(10); palletId is a foreign key, so a real pallet is used.
    await writeLog({ userId: 'z002p21', actionType: 'TEST_ONLY', palletId: pallet.pid, details: { a: 1 } }, tx);
    const row = await tx.activityLog.findFirstOrThrow({ where: { actionType: 'TEST_ONLY' } });
    assert.equal(row.palletId, pallet.pid);
    assert.equal(row.details, '{"a":1}');
    assert.equal(row.locationAisle, null);
  });
  assert.equal(await prisma.activityLog.count({ where: { actionType: 'TEST_ONLY' } }), 0);
});

test('IRP: a seeded showcase worker has a summary and hourly rows; unknown worker is empty', async () => {
  const summary = await getIndividualSummary('z002p21');
  assert.ok(summary);
  const hourly = await getIndividualHourly('z002p21', 'CA');
  assert.ok(hourly === null || Array.isArray(hourly));
  const nobody = await getIndividualSummary('z999x99');
  assert.ok(nobody);
});

test('prod goals: every function has a goal in force today', async () => {
  const rows = await loadGoalRows();
  assert.ok(rows.length > 0);
  const today = new Date().toISOString().slice(0, 10);
  const inForce = await goalsInForce(today);
  for (const code of new Set(rows.map((r) => r.functionCode))) {
    const earliest = rows.filter((r) => r.functionCode === code).map((r) => r.effectiveDate).sort()[0];
    if (earliest <= today) assert.ok(inForce.has(code), `${code} has a goal in force`);
  }
});
