// Container lifecycle against the local DB (#213), inside transactions that always roll back
// — nothing persists. Run with `npm run test:db` (needs api/.env's DATABASE_URL).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import prisma from '../../lib/prisma.js';
import { pullContainerTx, cancelContainerTx } from '../../lib/containerLifecycle.js';
import { CID_TYPE } from '../../lib/cidParser.js';

const ROLLBACK = new Error('ROLLBACK');

/** Runs `fn` in a transaction and always rolls it back. */
async function inRollback(fn: (tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0]) => Promise<void>) {
  await prisma.$transaction(async (tx) => { await fn(tx); throw ROLLBACK; }, { timeout: 30_000 })
    .catch((e) => { if (e !== ROLLBACK) throw e; });
}

/** A pull-pending pallet with exactly one open container of the given type prefix. */
async function findSoleOpen(prefix: string) {
  const pallets = await prisma.pallet.findMany({ where: { status: { in: ['CA_PULL_PEND', 'FP_PULL_PEND'] } }, select: { pid: true }, take: 300 });
  for (const p of pallets) {
    const open = await prisma.container.findMany({ where: { pid: p.pid, status: { in: ['AVAILABLE', 'PRINTED'] } } });
    if (open.length === 1 && open[0].cid.startsWith(prefix)) return { pid: p.pid, cid: open[0].cid };
  }
  return null;
}

after(() => prisma.$disconnect());

test('pull of the last open container returns the pallet to STORED', async (t) => {
  const c = await findSoleOpen('91');
  if (!c) return t.skip('no pull-pending pallet with exactly one open container');
  await inRollback(async (tx) => {
    const pallet = await tx.pallet.findUniqueOrThrow({ where: { pid: c.pid } });
    const r = await pullContainerTx(tx, { cid: c.cid, palletId: c.pid, palletUpdate: {
      currentPallets: 0, currentCartons: pallet.currentCartons, currentSSPs: pallet.currentSSPs,
      lastPulledByZ: 'z002p21', lastPulledAt: new Date(),
    } });
    assert.equal(r.palletReleased, true);
    assert.equal((await tx.pallet.findUniqueOrThrow({ where: { pid: c.pid } })).status, 'STORED');
    assert.equal((await tx.container.findUniqueOrThrow({ where: { cid: c.cid } })).status, 'PULLED');
  });
});

test('cancel: PRINTED full case is not eligible; AVAILABLE is, and releases the pallet', async (t) => {
  const c = await findSoleOpen('91');
  if (!c) return t.skip('no pull-pending pallet with exactly one open container');
  await inRollback(async (tx) => {
    await tx.container.update({ where: { cid: c.cid }, data: { status: 'PRINTED' } });
    await assert.rejects(cancelContainerTx(tx, c.cid, CID_TYPE.FULL_CASE), /NOT_ELIGIBLE/);
    await tx.container.update({ where: { cid: c.cid }, data: { status: 'AVAILABLE' } });
    const r = await cancelContainerTx(tx, c.cid, CID_TYPE.FULL_CASE);
    assert.equal(r.palletReleased, true);
    assert.equal((await tx.pallet.findUniqueOrThrow({ where: { pid: c.pid } })).status, 'STORED');
  });
});

test('cancel with other open containers left keeps the pallet pull-pending', async (t) => {
  const pallets = await prisma.pallet.findMany({ where: { status: { in: ['CA_PULL_PEND', 'FP_PULL_PEND'] } }, select: { pid: true, status: true }, take: 300 });
  let target: { pid: number; status: string; cid: string } | null = null;
  for (const p of pallets) {
    const open = await prisma.container.findMany({ where: { pid: p.pid, status: { in: ['AVAILABLE', 'PRINTED'] } } });
    if (open.length >= 2 && open[0].cid.startsWith('91')) { target = { ...p, cid: open[0].cid }; break; }
  }
  if (!target) return t.skip('no pallet with 2+ open containers');
  await inRollback(async (tx) => {
    await tx.container.update({ where: { cid: target!.cid }, data: { status: 'AVAILABLE' } });
    const r = await cancelContainerTx(tx, target!.cid, CID_TYPE.FULL_CASE);
    assert.equal(r.palletReleased, false);
    assert.equal((await tx.pallet.findUniqueOrThrow({ where: { pid: target!.pid } })).status, target!.status);
  });
});
