import { app } from '../lib/functionsRuntime.js';
import type { HttpRequest, InvocationContext } from '../lib/functionsRuntime.js';
import prisma from '../lib/prisma.js';
import { withHandler } from '../lib/response.js';
import { requireAuth, requireRole } from '../lib/permissions.js';
import { validateReasonCode } from '../lib/reasonCodes.js';
import { formatDpci } from '../lib/dpci.js';
import { parseCidOrThrow, CID_TYPE, CID_TYPE_LABELS, type CidTypeCode } from '../lib/cidParser.js';

// ─── Inquiry (GET) ──────────────────────────────────────────────────────────

async function inquireContainer(req: HttpRequest, _ctx: InvocationContext): Promise<unknown> {
  await requireAuth(req);

  const rawCid = req.params.cid ?? '';
  if (!rawCid) throw Object.assign(new Error('INVALID_INPUT'), { status: 400 });

  const { canonical, type } = parseCidOrThrow(rawCid);

  switch (type) {
    case CID_TYPE.FULL_CASE:
    case CID_TYPE.SSP_PULL_MASTER:
      return lookupContainer(canonical, type);
    case CID_TYPE.OVERPACK:
      return lookupOverpack(canonical);
    case CID_TYPE.SSP_UNIT:
      return lookupSSPUnit(canonical);
    case CID_TYPE.STRAY_EACH:
      return lookupStrayEach(canonical);
  }
}

async function lookupContainer(cid: string, type: CidTypeCode) {
  const container = await prisma.container.findUnique({
    where: { cid },
    include: {
      itemRef: { select: { descShort: true, name: true, storageCode: true, packingZoneCode: true } },
      pallet: {
        select: {
          pid: true, currentPallets: true, currentCartons: true, currentSSPs: true,
          locationAisle: true, locationBin: true, locationLevel: true,
          status: true,
        },
      },
      store: { select: { id: true, name: true } },
    },
  });
  if (!container) throw Object.assign(new Error('NOT_FOUND'), { status: 404 });

  const location = container.pallet.locationAisle != null ? {
    aisle: container.pallet.locationAisle,
    bin: container.pallet.locationBin!,
    level: container.pallet.locationLevel!,
  } : null;

  const result: Record<string, unknown> = {
    type,
    typeLabel: CID_TYPE_LABELS[type],
    cid: container.cid,
    status: container.status,
    pullFunction: container.pullFunction,
    breakpackOrigin: container.breakpackOrigin,
    dpci: formatDpci(container.dept, container.class, container.item),
    deptClassItem: { dept: container.dept, class: container.class, item: container.item },
    itemDesc: container.itemRef.descShort,
    itemName: container.itemRef.name,
    storageCode: container.itemRef.storageCode,
    quantity: { pallets: 0, cartons: container.quantity, ssps: container.sspQuantity },
    batchDate: container.batchDate,
    destinationStore: { id: container.store.id, name: container.store.name },
    pallet: {
      pid: container.pallet.pid,
      status: container.pallet.status,
      quantity: { pallets: container.pallet.currentPallets, cartons: container.pallet.currentCartons, ssps: container.pallet.currentSSPs },
    },
    location,
  };

  if (type === CID_TYPE.SSP_PULL_MASTER) {
    const children = await prisma.sSPUnit.findMany({
      where: { sourceContainerId: cid },
      select: { cid: true, status: true, actualEachQty: true, destinationStore: true },
      orderBy: { createdAt: 'asc' },
    });
    result.children = children;
  }

  return result;
}

async function lookupOverpack(cid: string) {
  const overpack = await prisma.overpack.findUnique({
    where: { cid },
    include: {
      store: { select: { id: true, name: true } },
      contents: {
        select: { childCid: true, childType: true, addedAt: true },
        orderBy: { addedAt: 'desc' },
      },
    },
  });
  if (!overpack) throw Object.assign(new Error('NOT_FOUND'), { status: 404 });

  return {
    type: CID_TYPE.OVERPACK,
    typeLabel: CID_TYPE_LABELS[CID_TYPE.OVERPACK],
    cid: overpack.cid,
    open: overpack.open,
    purged: overpack.purgedAt != null,
    createdAt: overpack.createdAt,
    purgeDate: overpack.purgeDate,
    purgedAt: overpack.purgedAt,
    closedByZ: overpack.closedByZ,
    closedAt: overpack.closedAt,
    destinationStore: { id: overpack.store.id, name: overpack.store.name },
    contents: overpack.contents,
  };
}

async function lookupSSPUnit(cid: string) {
  const unit = await prisma.sSPUnit.findUnique({
    where: { cid },
    include: {
      itemRef: { select: { descShort: true, name: true, storageCode: true } },
      store: { select: { id: true, name: true } },
      sourceContainer: { select: { cid: true, status: true, pid: true } },
    },
  });
  if (!unit) throw Object.assign(new Error('NOT_FOUND'), { status: 404 });

  return {
    type: CID_TYPE.SSP_UNIT,
    typeLabel: CID_TYPE_LABELS[CID_TYPE.SSP_UNIT],
    cid: unit.cid,
    status: unit.status,
    dpci: formatDpci(unit.dept, unit.class, unit.item),
    deptClassItem: { dept: unit.dept, class: unit.class, item: unit.item },
    itemDesc: unit.itemRef.descShort,
    itemName: unit.itemRef.name,
    storageCode: unit.itemRef.storageCode,
    standardEachQty: unit.standardEachQty,
    actualEachQty: unit.actualEachQty,
    destinationStore: { id: unit.store.id, name: unit.store.name },
    createdAt: unit.createdAt,
    packedAt: unit.packedAt,
    canceledAt: unit.canceledAt,
    sourceMaster: { cid: unit.sourceContainer.cid, status: unit.sourceContainer.status, pid: unit.sourceContainer.pid },
  };
}

async function lookupStrayEach(cid: string) {
  const stray = await prisma.strayEach.findUnique({
    where: { cid },
    include: {
      itemRef: { select: { descShort: true, name: true, storageCode: true } },
      store: { select: { id: true, name: true } },
    },
  });
  if (!stray) throw Object.assign(new Error('NOT_FOUND'), { status: 404 });

  return {
    type: CID_TYPE.STRAY_EACH,
    typeLabel: CID_TYPE_LABELS[CID_TYPE.STRAY_EACH],
    cid: stray.cid,
    status: stray.status,
    dpci: formatDpci(stray.dept, stray.class, stray.item),
    deptClassItem: { dept: stray.dept, class: stray.class, item: stray.item },
    itemDesc: stray.itemRef.descShort,
    itemName: stray.itemRef.name,
    storageCode: stray.itemRef.storageCode,
    eachQty: stray.eachQty,
    destinationStore: { id: stray.store.id, name: stray.store.name },
    foundByZ: stray.foundByZ,
    createdAt: stray.createdAt,
    packedAt: stray.packedAt,
    canceledAt: stray.canceledAt,
  };
}

// ─── Event Log (GET) ────────────────────────────────────────────────────────

async function getContainerEvents(req: HttpRequest, _ctx: InvocationContext): Promise<unknown> {
  await requireAuth(req);

  const rawCid = req.params.cid ?? '';
  if (!rawCid) throw Object.assign(new Error('INVALID_INPUT'), { status: 400 });

  const { canonical, type } = parseCidOrThrow(rawCid);

  const events: { source: string; eventType: string; timestamp: Date; userZ: string | null; details?: Record<string, unknown> }[] = [];

  if (type === CID_TYPE.FULL_CASE || type === CID_TYPE.SSP_PULL_MASTER) {
    const containerEvents = await prisma.containerEvent.findMany({
      where: { containerId: canonical },
      orderBy: { timestamp: 'desc' },
      include: { user: { select: { firstName: true, lastName: true } } },
    });
    for (const e of containerEvents) {
      events.push({
        source: 'ContainerEvent',
        eventType: e.eventType,
        timestamp: e.timestamp,
        userZ: e.userZ,
        details: {
          reasonPrefix: e.reasonPrefix, reasonNumber: e.reasonNumber, reasonNote: e.reasonNote,
          userName: e.user ? `${e.user.firstName} ${e.user.lastName}` : null,
        },
      });
    }

    const cancelEvents = await prisma.containerCancelEvent.findMany({
      where: { cid: canonical },
      orderBy: { canceledAt: 'desc' },
    });
    for (const e of cancelEvents) {
      events.push({
        source: 'ContainerCancelEvent',
        eventType: `CANCEL_${e.triggerType}`,
        timestamp: e.canceledAt,
        userZ: null,
        details: {
          triggerType: e.triggerType, triggerId: e.triggerId,
          reasonPrefix: e.reasonPrefix, reasonNumber: e.reasonNumber, reasonNote: e.reasonNote,
        },
      });
    }
  }

  if (type === CID_TYPE.OVERPACK) {
    const statusEvents = await prisma.overpackStatusEvent.findMany({
      where: { overpackCid: canonical },
      orderBy: { timestamp: 'desc' },
      include: { user: { select: { firstName: true, lastName: true } } },
    });
    for (const e of statusEvents) {
      events.push({
        source: 'OverpackStatusEvent',
        eventType: e.eventType,
        timestamp: e.timestamp,
        userZ: e.userZ,
        details: {
          reasonPrefix: e.reasonPrefix, reasonNumber: e.reasonNumber, reasonNote: e.reasonNote,
          userName: e.user ? `${e.user.firstName} ${e.user.lastName}` : null,
        },
      });
    }

    const placementEvents = await prisma.overpackPlacementEvent.findMany({
      where: { overpackCid: canonical },
      orderBy: { timestamp: 'desc' },
    });
    for (const e of placementEvents) {
      events.push({
        source: 'OverpackPlacementEvent',
        eventType: e.eventType,
        timestamp: e.timestamp,
        userZ: null,
        details: { childCid: e.childCid, childType: e.childType },
      });
    }
  }

  if (type === CID_TYPE.SSP_UNIT) {
    const adjustments = await prisma.sSPUnitAdjustmentEvent.findMany({
      where: { unitCid: canonical },
      orderBy: { adjustedAt: 'desc' },
      include: { user: { select: { firstName: true, lastName: true } } },
    });
    for (const e of adjustments) {
      events.push({
        source: 'SSPUnitAdjustmentEvent',
        eventType: 'QUANTITY_ADJUST',
        timestamp: e.adjustedAt,
        userZ: e.adjustedByZ,
        details: {
          previousQty: e.previousQty, newQty: e.newQty,
          userName: `${e.user.firstName} ${e.user.lastName}`,
        },
      });
    }
  }

  if (type === CID_TYPE.STRAY_EACH) {
    const reassignments = await prisma.strayEachReassignmentEvent.findMany({
      where: { strayEachCid: canonical },
      orderBy: { reassignedAt: 'desc' },
      include: { user: { select: { firstName: true, lastName: true } } },
    });
    for (const e of reassignments) {
      events.push({
        source: 'StrayEachReassignmentEvent',
        eventType: 'REASSIGN_DEST',
        timestamp: e.reassignedAt,
        userZ: e.reassignedByZ,
        details: {
          previousStore: e.previousStore, newStore: e.newStore,
          reasonPrefix: e.reasonPrefix, reasonNumber: e.reasonNumber, reasonNote: e.reasonNote,
          userName: `${e.user.firstName} ${e.user.lastName}`,
        },
      });
    }
  }

  events.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  return { type, cid: canonical, events };
}

// ─── Cancel (Full Case / SSP Pull Master) ───────────────────────────────────

async function cancelContainer(req: HttpRequest, _ctx: InvocationContext): Promise<unknown> {
  const auth = await requireAuth(req);
  requireRole(auth, 'IM');

  const rawCid = req.params.cid ?? '';
  if (!rawCid) throw Object.assign(new Error('INVALID_INPUT'), { status: 400 });

  const { canonical, type } = parseCidOrThrow(rawCid);
  if (type !== CID_TYPE.FULL_CASE && type !== CID_TYPE.SSP_PULL_MASTER) {
    throw Object.assign(new Error('INVALID_CONTAINER_TYPE'), { status: 400 });
  }

  const body = await req.json() as { reasonPrefix?: string; reasonNumber?: string; reasonNote?: string };
  const { reasonPrefix, reasonNumber, reasonNote } = body;
  if (!reasonPrefix || !reasonNumber) throw Object.assign(new Error('INVALID_INPUT'), { status: 400 });
  await validateReasonCode(auth.zNumber, auth.role, 'CONTAINER_CANCEL', reasonPrefix, reasonNumber);

  return prisma.$transaction(async (tx) => {
    const container = await tx.container.findUnique({ where: { cid: canonical } });
    if (!container) throw Object.assign(new Error('NOT_FOUND'), { status: 404 });

    const eligible = type === CID_TYPE.FULL_CASE
      ? ['AVAILABLE', 'VERIFIED'].includes(container.status)
      : container.status !== 'PACKED' && container.status !== 'CANCELED' && container.status !== 'PURGED';

    if (!eligible) {
      throw Object.assign(new Error('NOT_ELIGIBLE'), { status: 409, data: { currentStatus: container.status } });
    }

    await tx.container.update({ where: { cid: canonical }, data: { status: 'CANCELED' } });
    await tx.containerEvent.create({
      data: {
        containerId: canonical, eventType: 'CANCELED', userZ: auth.zNumber,
        reasonPrefix, reasonNumber, reasonNote: reasonNote ?? null,
      },
    });
    await tx.scanLog.create({
      data: {
        zNumber: auth.zNumber, actionType: 'CONTAINER_CANCEL',
        details: JSON.stringify({ cid: canonical, type: CID_TYPE_LABELS[type], reasonPrefix, reasonNumber }),
      },
    });

    if (type === CID_TYPE.SSP_PULL_MASTER) {
      const pendingChildren = await tx.sSPUnit.findMany({
        where: { sourceContainerId: canonical, status: 'PENDING' },
        select: { cid: true },
      });
      for (const child of pendingChildren) {
        await tx.sSPUnit.update({ where: { cid: child.cid }, data: { status: 'SHIPPED', canceledAt: new Date() } });
        await tx.containerCancelEvent.create({
          data: {
            cid: child.cid, containerType: 'SSP_UNIT', triggerType: 'MASTER_CANCEL',
            triggerId: canonical, reasonPrefix, reasonNumber, reasonNote: reasonNote ?? null,
          },
        });
      }
      return { canceled: canonical, cascadedChildren: pendingChildren.length };
    }

    return { canceled: canonical };
  });
}

// ─── Force-Close / Reopen (Overpack) ────────────────────────────────────────

async function forceCloseOverpack(req: HttpRequest, _ctx: InvocationContext): Promise<unknown> {
  const auth = await requireAuth(req);
  requireRole(auth, 'IM');

  const rawCid = req.params.cid ?? '';
  if (!rawCid) throw Object.assign(new Error('INVALID_INPUT'), { status: 400 });
  const { canonical } = parseCidOrThrow(rawCid);

  const body = await req.json() as { reasonPrefix?: string; reasonNumber?: string; reasonNote?: string };
  const { reasonPrefix, reasonNumber, reasonNote } = body;
  if (!reasonPrefix || !reasonNumber) throw Object.assign(new Error('INVALID_INPUT'), { status: 400 });
  await validateReasonCode(auth.zNumber, auth.role, 'OVERPACK_STATUS', reasonPrefix, reasonNumber);

  return prisma.$transaction(async (tx) => {
    const overpack = await tx.overpack.findUnique({ where: { cid: canonical } });
    if (!overpack) throw Object.assign(new Error('NOT_FOUND'), { status: 404 });
    if (!overpack.open) throw Object.assign(new Error('ALREADY_CLOSED'), { status: 409 });
    if (overpack.purgedAt) throw Object.assign(new Error('PURGED'), { status: 409 });

    await tx.overpack.update({
      where: { cid: canonical },
      data: { open: false, closedByZ: auth.zNumber, closedAt: new Date() },
    });
    await tx.overpackStatusEvent.create({
      data: {
        overpackCid: canonical, eventType: 'FORCE_CLOSE', userZ: auth.zNumber,
        reasonPrefix, reasonNumber, reasonNote: reasonNote ?? null,
      },
    });
    await tx.scanLog.create({
      data: {
        zNumber: auth.zNumber, actionType: 'OVERPACK_FORCE_CLOSE',
        details: JSON.stringify({ cid: canonical, reasonPrefix, reasonNumber }),
      },
    });

    return { cid: canonical, action: 'FORCE_CLOSE' };
  });
}

async function reopenOverpack(req: HttpRequest, _ctx: InvocationContext): Promise<unknown> {
  const auth = await requireAuth(req);
  requireRole(auth, 'IM');

  const rawCid = req.params.cid ?? '';
  if (!rawCid) throw Object.assign(new Error('INVALID_INPUT'), { status: 400 });
  const { canonical } = parseCidOrThrow(rawCid);

  const body = await req.json() as { reasonPrefix?: string; reasonNumber?: string; reasonNote?: string };
  const { reasonPrefix, reasonNumber, reasonNote } = body;
  if (!reasonPrefix || !reasonNumber) throw Object.assign(new Error('INVALID_INPUT'), { status: 400 });
  await validateReasonCode(auth.zNumber, auth.role, 'OVERPACK_STATUS', reasonPrefix, reasonNumber);

  return prisma.$transaction(async (tx) => {
    const overpack = await tx.overpack.findUnique({ where: { cid: canonical } });
    if (!overpack) throw Object.assign(new Error('NOT_FOUND'), { status: 404 });
    if (overpack.open) throw Object.assign(new Error('ALREADY_OPEN'), { status: 409 });
    if (overpack.purgedAt) throw Object.assign(new Error('PURGED'), { status: 409 });

    await tx.overpack.update({
      where: { cid: canonical },
      data: { open: true, closedByZ: null, closedAt: null },
    });
    await tx.overpackStatusEvent.create({
      data: {
        overpackCid: canonical, eventType: 'REOPEN', userZ: auth.zNumber,
        reasonPrefix, reasonNumber, reasonNote: reasonNote ?? null,
      },
    });
    await tx.scanLog.create({
      data: {
        zNumber: auth.zNumber, actionType: 'OVERPACK_REOPEN',
        details: JSON.stringify({ cid: canonical, reasonPrefix, reasonNumber }),
      },
    });

    return { cid: canonical, action: 'REOPEN' };
  });
}

// ─── Reassign Destination (Stray Each) ──────────────────────────────────────

async function reassignStrayEach(req: HttpRequest, _ctx: InvocationContext): Promise<unknown> {
  const auth = await requireAuth(req);
  requireRole(auth, 'IM');

  const rawCid = req.params.cid ?? '';
  if (!rawCid) throw Object.assign(new Error('INVALID_INPUT'), { status: 400 });
  const { canonical } = parseCidOrThrow(rawCid);

  const body = await req.json() as { newStore: number; reasonPrefix?: string; reasonNumber?: string; reasonNote?: string };
  const { newStore, reasonPrefix, reasonNumber, reasonNote } = body;
  if (!newStore || !reasonPrefix || !reasonNumber) throw Object.assign(new Error('INVALID_INPUT'), { status: 400 });
  await validateReasonCode(auth.zNumber, auth.role, 'STRAY_REASSIGN', reasonPrefix, reasonNumber);

  const store = await prisma.store.findUnique({ where: { id: newStore } });
  if (!store) throw Object.assign(new Error('INVALID_STORE'), { status: 400 });

  return prisma.$transaction(async (tx) => {
    const stray = await tx.strayEach.findUnique({ where: { cid: canonical } });
    if (!stray) throw Object.assign(new Error('NOT_FOUND'), { status: 404 });
    if (stray.status !== 'PENDING') {
      throw Object.assign(new Error('NOT_ELIGIBLE'), { status: 409, data: { currentStatus: stray.status } });
    }

    const previousStore = stray.destinationStore;
    await tx.strayEach.update({ where: { cid: canonical }, data: { destinationStore: newStore } });
    await tx.strayEachReassignmentEvent.create({
      data: {
        strayEachCid: canonical, previousStore, newStore,
        reasonPrefix, reasonNumber, reasonNote: reasonNote ?? null,
        reassignedByZ: auth.zNumber,
      },
    });
    await tx.scanLog.create({
      data: {
        zNumber: auth.zNumber, actionType: 'STRAY_REASSIGN',
        details: JSON.stringify({ cid: canonical, previousStore, newStore, reasonPrefix, reasonNumber }),
      },
    });

    return { cid: canonical, previousStore, newStore };
  });
}

// ─── Route registration ─────────────────────────────────────────────────────

app.http('inquireContainer', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'containers/inquiry/{cid}',
  handler: withHandler(inquireContainer),
});

app.http('getContainerEvents', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'containers/{cid}/events',
  handler: withHandler(getContainerEvents),
});

app.http('cancelContainer', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'containers/{cid}/cancel',
  handler: withHandler(cancelContainer),
});

app.http('forceCloseOverpack', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'overpacks/{cid}/force-close',
  handler: withHandler(forceCloseOverpack),
});

app.http('reopenOverpack', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'overpacks/{cid}/reopen',
  handler: withHandler(reopenOverpack),
});

app.http('reassignStrayEach', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'stray-eaches/{cid}/reassign',
  handler: withHandler(reassignStrayEach),
});
