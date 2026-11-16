// Container lifecycle (#213) — the one module that changes a container's status. Every
// transition runs in a single transaction together with the source pallet's pull-pending
// recompute, so a pallet can never be left CA_PULL_PEND/FP_PULL_PEND with no open
// containers (bug #210) or briefly STORED-but-still-pending (the old verifyPull →
// completePull two-step).
//
// Each operation has a `*Tx` form that runs inside the caller's transaction, so tests can
// run them inside a rolled-back transaction on the local DB (tests/db/).

import type { Prisma } from '../generated/prisma/index.js';
import prisma from './prisma.js';
import {
  OPEN_CONTAINER_STATUSES, VERIFIED_STATUS, canCancelFullCase, canCancelSspMaster,
  type ContainerStatus,
} from '../../shared/containerStatus.js';
import { CID_TYPE, type CidTypeCode } from './cidParser.js';

export * from '../../shared/containerStatus.js';

/** Anything that can run Prisma queries: the root client or an interactive-transaction client. */
type Db = Prisma.TransactionClient;

/** Pallet statuses the recompute may return to STORED. */
const PULL_PENDING_STATUSES = ['CA_PULL_PEND', 'FP_PULL_PEND'];

/** `where` fragment: the container is open against its pallet. */
export function whereOpenContainer(): { status: { in: ContainerStatus[] } } {
  return { status: { in: [...OPEN_CONTAINER_STATUSES] } };
}

/**
 * Returns the pallet from CA_PULL_PEND/FP_PULL_PEND to STORED when it has no open
 * containers left. Any other pallet status is left alone.
 * @returns true if the pallet was returned to STORED
 */
async function recomputePalletPullPending(db: Db, palletId: number): Promise<boolean> {
  const remainingOpen = await db.container.count({ where: { pid: palletId, ...whereOpenContainer() } });
  if (remainingOpen > 0) return false;
  const { count } = await db.pallet.updateMany({
    where: { pid: palletId, status: { in: PULL_PENDING_STATUSES } },
    data: { status: 'STORED' },
  });
  return count > 0;
}

/** Pallet field writes that ride along with a pull (quantities, last-pulled stamp). */
export interface PullPalletUpdate {
  currentPallets: number;
  currentCartons: number;
  currentSSPs: number;
  lastPulledByZ: string;
  lastPulledAt: Date;
}

/**
 * PULL, inside the caller's transaction — marks the container PULLED (shown as "Verified"),
 * applies the pallet's quantity update, and recomputes the pallet's pull-pending status.
 * @returns whether the pallet was returned to STORED
 */
export async function pullContainerTx(
  tx: Db,
  params: { cid: string; palletId: number; palletUpdate: PullPalletUpdate },
): Promise<{ palletReleased: boolean }> {
  await tx.container.update({ where: { cid: params.cid }, data: { status: VERIFIED_STATUS } });
  await tx.pallet.update({ where: { pid: params.palletId }, data: params.palletUpdate });
  return { palletReleased: await recomputePalletPullPending(tx, params.palletId) };
}

/** PULL in its own transaction (see `pullContainerTx`). */
export async function pullContainer(
  params: { cid: string; palletId: number; palletUpdate: PullPalletUpdate },
): Promise<{ palletReleased: boolean }> {
  return prisma.$transaction((tx) => pullContainerTx(tx, params));
}

/** Thrown when a container isn't in a cancelable status; carries the current status. */
function notEligible(status: string): Error {
  return Object.assign(new Error('NOT_ELIGIBLE'), { status: 409, data: { currentStatus: status } });
}

/**
 * CANCEL — inside the caller's transaction: checks eligibility for the container's type,
 * marks it CANCELED, and recomputes the pallet's pull-pending status. Event/log writes
 * (reason codes, cascade to SSP units) stay with the caller, which owns the transaction.
 * @throws 404 NOT_FOUND, 409 NOT_ELIGIBLE `{ currentStatus }`
 * @returns whether the pallet was returned to STORED
 */
export async function cancelContainerTx(
  tx: Db,
  cid: string,
  type: CidTypeCode,
): Promise<{ palletReleased: boolean }> {
  const container = await tx.container.findUnique({ where: { cid }, select: { status: true, pid: true } });
  if (!container) throw Object.assign(new Error('NOT_FOUND'), { status: 404 });
  const eligible = type === CID_TYPE.FULL_CASE ? canCancelFullCase(container.status) : canCancelSspMaster(container.status);
  if (!eligible) throw notEligible(container.status);

  await tx.container.update({ where: { cid }, data: { status: 'CANCELED' } });
  return { palletReleased: await recomputePalletPullPending(tx, container.pid) };
}
