// Reservation / location lifecycle (Logic Gate, #211) against the local DB, inside
// transactions that always roll back — nothing persists. `npm run test:db`.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import prisma from '../../lib/prisma.js';
import {
  confirmReservationTx, releaseReservationTx, expireReservationTx, consolidateIntoTx, movePalletTx,
} from '../../lib/logicGate.js';

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];
const ROLLBACK = new Error('ROLLBACK');
async function inRollback(fn: (tx: Tx) => Promise<void>) {
  await prisma.$transaction(async (tx) => { await fn(tx); throw ROLLBACK; }, { timeout: 30_000 })
    .catch((e) => { if (e !== ROLLBACK) throw e; });
}

after(() => prisma.$disconnect());

/** Puts a STAGED location into RESERVED for a PUT_PENDING pallet, inside `tx`. */
async function reserveIn(tx: Tx) {
  const loc = await tx.location.findFirstOrThrow({ where: { status: 'STAGED', holdCategory: null, contraction: false } });
  const pallet = await tx.pallet.findFirstOrThrow({ where: { status: 'PUT_PENDING', locationAisle: null } });
  await tx.location.update({
    where: { LocationID: { aisle: loc.aisle, bin: loc.bin, level: loc.level } },
    data: { status: 'RESERVED', revertStatus: 'STAGED', statusExpiry: new Date(Date.now() + 300_000) },
  });
  const res = await tx.reservation.create({ data: {
    locationAisle: loc.aisle, locationBin: loc.bin, locationLevel: loc.level,
    palletId: pallet.pid, workerZ: 'z002p21', targetAisle: loc.aisle, wasStaged: true,
  } });
  return { loc, pallet, res };
}

const key = (l: { aisle: number; bin: number; level: number }) => ({ LocationID: { aisle: l.aisle, bin: l.bin, level: l.level } });

test('confirm claims the reservation and stores the pallet in one transaction', async () => {
  await inRollback(async (tx) => {
    const { loc, pallet, res } = await reserveIn(tx);
    const out = await confirmReservationTx(tx, res.id, 'z002p21');
    assert.equal(out.wasMove, false);
    assert.equal(await tx.reservation.count({ where: { id: res.id } }), 0);
    assert.equal((await tx.location.findUniqueOrThrow({ where: key(loc) })).status, 'STORED');
    const p = await tx.pallet.findUniqueOrThrow({ where: { pid: pallet.pid } });
    assert.deepEqual([p.status, p.locationAisle, p.locationBin], ['STORED', loc.aisle, loc.bin]);
    // A second claimer (unassign / timer) loses cleanly.
    await assert.rejects(releaseReservationTx(tx, res.id), /NOT_FOUND/);
    assert.equal(await expireReservationTx(tx, res.id), null);
  });
});

test('confirm verify() failure aborts without claiming', async () => {
  await inRollback(async (tx) => {
    const { res } = await reserveIn(tx);
    await assert.rejects(confirmReservationTx(tx, res.id, 'z002p21', () => { throw new Error('LOCATION_MISMATCH'); }), /LOCATION_MISMATCH/);
    assert.equal(await tx.reservation.count({ where: { id: res.id } }), 1);
  });
});

test('release returns the location to its revert status (STAGED)', async () => {
  await inRollback(async (tx) => {
    const { loc, res } = await reserveIn(tx);
    const out = await releaseReservationTx(tx, res.id);
    assert.equal(out.releasedStatus, 'STAGED');
    const after = await tx.location.findUniqueOrThrow({ where: key(loc) });
    assert.deepEqual([after.status, after.revertStatus, after.statusExpiry], ['STAGED', null, null]);
  });
});

test('move frees the prior location and stores at the new one', async () => {
  await inRollback(async (tx) => {
    const pallet = await tx.pallet.findFirstOrThrow({ where: { status: 'STORED', locationAisle: { not: null } } });
    const prior = { aisle: pallet.locationAisle!, bin: pallet.locationBin!, level: pallet.locationLevel! };
    const dest = await tx.location.findFirstOrThrow({ where: { status: 'EMPTY', holdCategory: null, contraction: false } });
    const out = await movePalletTx(tx, { palletId: pallet.pid, aisle: dest.aisle, bin: dest.bin, level: dest.level, workerZ: 'z002p22' });
    assert.equal(out.wasMove, true);
    const others = await tx.pallet.count({ where: { locationAisle: prior.aisle, locationBin: prior.bin, locationLevel: prior.level } });
    assert.equal((await tx.location.findUniqueOrThrow({ where: key(prior) })).status, others > 0 ? 'STORED' : 'EMPTY');
    assert.equal((await tx.location.findUniqueOrThrow({ where: key(dest) })).status, 'STORED');
  });
});

test('consolidate merges quantities, zeroes the source, frees its location', async () => {
  await inRollback(async (tx) => {
    const [a, b] = await tx.pallet.findMany({ where: { status: 'STORED', locationAisle: { not: null } }, take: 2 });
    const out = await consolidateIntoTx(tx, { sourcePalletId: a.pid, targetPalletId: b.pid });
    assert.equal(out.cartons, a.currentCartons);
    const src = await tx.pallet.findUniqueOrThrow({ where: { pid: a.pid } });
    const tgt = await tx.pallet.findUniqueOrThrow({ where: { pid: b.pid } });
    assert.deepEqual([src.status, src.currentCartons, src.locationAisle], ['CONSOLIDATED', 0, null]);
    assert.equal(tgt.currentCartons, b.currentCartons + a.currentCartons);
  });
});
