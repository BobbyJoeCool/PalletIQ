// SDP Exists Elsewhere redirect (#215) against the local DB, in rolled-back transactions.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import prisma from '../../lib/prisma.js';
import { listConsolidationCandidates, findConsolidationTarget } from '../../lib/putRedirect.js';
import { confirmReservationIntoTx } from '../../lib/logicGate.js';

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];
const ROLLBACK = new Error('ROLLBACK');
async function inRollback(fn: (tx: Tx) => Promise<void>) {
  await prisma.$transaction(async (tx) => { await fn(tx); throw ROLLBACK; }, { timeout: 30_000 })
    .catch((e) => { if (e !== ROLLBACK) throw e; });
}
after(() => prisma.$disconnect());

/** A STORED XS pallet with cartons (the future occupant) plus a PUT_PENDING pallet re-pointed
 *  at the same DPCI, reserved onto an EMPTY XS location — all inside `tx`. */
async function setup(tx: Tx) {
  const occupant = await tx.pallet.findFirst({ where: { status: 'STORED', size: 'XS', currentCartons: { gt: 0 }, locationAisle: { not: null } } });
  if (!occupant) return null;
  const source = await tx.pallet.findFirstOrThrow({ where: { status: 'PUT_PENDING', locationAisle: null } });
  await tx.pallet.update({ where: { pid: source.pid }, data: { dept: occupant.dept, class: occupant.class, item: occupant.item } });
  const loc = await tx.location.findFirstOrThrow({ where: { status: 'EMPTY', size: 'XS', holdCategory: null, contraction: false } });
  await tx.location.update({ where: { LocationID: { aisle: loc.aisle, bin: loc.bin, level: loc.level } }, data: { status: 'RESERVED', revertStatus: 'EMPTY' } });
  const res = await tx.reservation.create({ data: {
    locationAisle: loc.aisle, locationBin: loc.bin, locationLevel: loc.level,
    palletId: source.pid, workerZ: 'z002p21', targetAisle: loc.aisle, wasStaged: false,
  } });
  return { occupant, source, loc, res };
}

test('candidates list the same-DPCI XS occupant; target check accepts it', async (t) => {
  await inRollback(async (tx) => {
    const s = await setup(tx);
    if (!s) return t.skip('no STORED XS pallet with cartons');
    const list = await listConsolidationCandidates(s.res, tx);
    assert.ok(list.some((c) => c.palletId === s.occupant.pid));
    const target = { aisle: s.occupant.locationAisle!, bin: s.occupant.locationBin!, level: s.occupant.locationLevel! };
    assert.equal(await findConsolidationTarget(tx, s.source.pid, target), s.occupant.pid);
    assert.equal(await findConsolidationTarget(tx, s.source.pid, { aisle: s.loc.aisle, bin: s.loc.bin, level: s.loc.level }), null);
  });
});

test('confirm into a candidate: claims, releases the reserved location, consolidates', async (t) => {
  await inRollback(async (tx) => {
    const s = await setup(tx);
    if (!s) return t.skip('no STORED XS pallet with cartons');
    const out = await confirmReservationIntoTx(tx, s.res.id, async () => s.occupant.pid);
    assert.equal(out.targetPalletId, s.occupant.pid);
    assert.equal(await tx.reservation.count({ where: { id: s.res.id } }), 0);
    assert.equal((await tx.location.findUniqueOrThrow({ where: { LocationID: { aisle: s.loc.aisle, bin: s.loc.bin, level: s.loc.level } } })).status, 'EMPTY');
    assert.equal((await tx.pallet.findUniqueOrThrow({ where: { pid: s.source.pid } })).status, 'CONSOLIDATED');
    assert.equal((await tx.pallet.findUniqueOrThrow({ where: { pid: s.occupant.pid } })).currentCartons, s.occupant.currentCartons + s.source.currentCartons);
  });
});

test('a failing resolveTarget aborts without claiming', async (t) => {
  await inRollback(async (tx) => {
    const s = await setup(tx);
    if (!s) return t.skip('no STORED XS pallet with cartons');
    await assert.rejects(confirmReservationIntoTx(tx, s.res.id, async () => { throw new Error('NOT_A_CANDIDATE'); }), /NOT_A_CANDIDATE/);
    assert.equal(await tx.reservation.count({ where: { id: s.res.id } }), 1);
  });
});
