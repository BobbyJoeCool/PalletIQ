import { app } from '@azure/functions';
import type { HttpRequest, InvocationContext } from '@azure/functions';
import prisma from '../lib/prisma.js';
import { withHandler } from '../lib/response.js';
import { requireAuth, requireRole } from '../lib/permissions.js';
import { writeLog } from '../lib/activityLog.js';

async function getPallet(req: HttpRequest, _ctx: InvocationContext): Promise<unknown> {
  await requireAuth(req);

  const pid = parseInt(req.params.id ?? '', 10);
  if (isNaN(pid)) throw Object.assign(new Error('INVALID_INPUT'), { status: 400 });

  const pallet = await prisma.pallet.findUnique({
    where: { pid },
    include: {
      itemRef: { select: { upc: true } },
      receivedBy: { select: { zNumber: true, firstName: true, lastName: true } },
      putBy: { select: { zNumber: true, firstName: true, lastName: true } },
      lastPulledBy: { select: { zNumber: true, firstName: true, lastName: true } },
    },
  });

  if (!pallet) throw Object.assign(new Error('NOT_FOUND'), { status: 404 });

  return {
    pid: pallet.pid,
    dpci: { dept: pallet.dept, class: pallet.class, item: pallet.item },
    upc: pallet.itemRef.upc,
    vcp: pallet.vcp,
    ssp: pallet.ssp,
    receivedPallets: pallet.receivedPallets,
    currentPallets: pallet.currentPallets,
    receivedCartons: pallet.receivedCartons,
    currentCartons: pallet.currentCartons,
    receivedSSPs: pallet.receivedSSPs,
    currentSSPs: pallet.currentSSPs,
    status: pallet.status,
    location: pallet.locationAisle != null
      ? { aisle: pallet.locationAisle, bin: pallet.locationBin!, level: pallet.locationLevel! }
      : null,
    receivedBy: pallet.receivedBy,
    receivedAt: pallet.receivedAt,
    putBy: pallet.putBy,
    putAt: pallet.putAt,
    lastPulledBy: pallet.lastPulledBy,
    lastPulledAt: pallet.lastPulledAt,
  };
}

async function editPallet(req: HttpRequest, _ctx: InvocationContext): Promise<unknown> {
  const auth = await requireAuth(req);
  requireRole(auth, 'IM');

  const pid = parseInt(req.params.id ?? '', 10);
  if (isNaN(pid)) throw Object.assign(new Error('INVALID_INPUT'), { status: 400 });

  const body = await req.json() as {
    dpci?: { dept: number; class: number; item: number };
    vcp?: number;
    ssp?: number;
    currentPallets?: number;
    currentCartons?: number;
    currentSSPs?: number;
  };

  const pallet = await prisma.pallet.findUnique({ where: { pid } });
  if (!pallet) throw Object.assign(new Error('NOT_FOUND'), { status: 404 });

  // Validate non-negative quantities up front.
  const newPallets  = body.currentPallets  ?? pallet.currentPallets;
  const newCartons  = body.currentCartons  ?? pallet.currentCartons;
  const newSSPs     = body.currentSSPs     ?? pallet.currentSSPs;
  if (newPallets < 0 || newCartons < 0 || newSSPs < 0) {
    throw Object.assign(new Error('INVALID_INPUT'), { status: 400 });
  }

  const dpciChanging =
    body.dpci != null &&
    (body.dpci.dept !== pallet.dept ||
     body.dpci.class !== pallet.class ||
     body.dpci.item !== pallet.item);

  if (dpciChanging) {
    const pendingCount = await prisma.label.count({
      where: { pid, status: { notIn: ['PULLED', 'DIVERTED', 'CANCELED', 'PURGED'] } },
    });
    if (pendingCount > 0) {
      throw Object.assign(new Error('BLOCKED_BY_PENDING_PULL'), { status: 409 });
    }
    const newItem = await prisma.item.findUnique({
      where: { DPCI: { dept: body.dpci!.dept, class: body.dpci!.class, item: body.dpci!.item } },
    });
    if (!newItem) throw Object.assign(new Error('DPCI_NOT_FOUND'), { status: 404 });
  }

  const quantityChanging =
    body.currentPallets != null ||
    body.currentCartons != null ||
    body.currentSSPs    != null;

  if (quantityChanging) {
    // Use receivedCartons as cartonsPerPallet proxy (production would use a dedicated field).
    const pending = await prisma.label.aggregate({
      where: { pid, status: { notIn: ['PULLED', 'DIVERTED', 'CANCELED', 'PURGED'] } },
      _sum: { quantity: true, sspQuantity: true },
    });
    const pendingCartons = pending._sum.quantity    ?? 0;
    const pendingSSPs    = pending._sum.sspQuantity ?? 0;

    const totalCartons = newPallets * pallet.receivedCartons + newCartons;
    if (totalCartons < pendingCartons || newSSPs < pendingSSPs) {
      throw Object.assign(new Error('INSUFFICIENT_QUANTITY'), { status: 409 });
    }
  }

  // Build update payload.
  const updateData: Record<string, unknown> = {};
  if (dpciChanging) {
    updateData['dept']  = body.dpci!.dept;
    updateData['class'] = body.dpci!.class;
    updateData['item']  = body.dpci!.item;
  }
  if (body.vcp            != null) updateData['vcp']            = body.vcp;
  if (body.ssp            != null) updateData['ssp']            = body.ssp;
  if (body.currentPallets != null) updateData['currentPallets'] = body.currentPallets;
  if (body.currentCartons != null) updateData['currentCartons'] = body.currentCartons;
  if (body.currentSSPs    != null) updateData['currentSSPs']    = body.currentSSPs;

  if (dpciChanging) {
    await prisma.$transaction([
      prisma.pallet.update({ where: { pid }, data: updateData }),
      prisma.label.updateMany({
        where: { pid },
        data: { dept: body.dpci!.dept, class: body.dpci!.class, item: body.dpci!.item },
      }),
    ]);
  } else if (Object.keys(updateData).length > 0) {
    await prisma.pallet.update({ where: { pid }, data: updateData });
  }

  // Build log diff and write only if something actually changed.
  const oldVals: Record<string, unknown> = {};
  const newVals: Record<string, unknown> = {};
  if (dpciChanging) {
    oldVals['dpci'] = { dept: pallet.dept, class: pallet.class, item: pallet.item };
    newVals['dpci'] = body.dpci;
  }
  if (body.vcp != null && body.vcp !== pallet.vcp) {
    oldVals['vcp'] = pallet.vcp; newVals['vcp'] = body.vcp;
  }
  if (body.ssp != null && body.ssp !== pallet.ssp) {
    oldVals['ssp'] = pallet.ssp; newVals['ssp'] = body.ssp;
  }
  if (body.currentPallets != null && body.currentPallets !== pallet.currentPallets) {
    oldVals['currentPallets'] = pallet.currentPallets; newVals['currentPallets'] = body.currentPallets;
  }
  if (body.currentCartons != null && body.currentCartons !== pallet.currentCartons) {
    oldVals['currentCartons'] = pallet.currentCartons; newVals['currentCartons'] = body.currentCartons;
  }
  if (body.currentSSPs != null && body.currentSSPs !== pallet.currentSSPs) {
    oldVals['currentSSPs'] = pallet.currentSSPs; newVals['currentSSPs'] = body.currentSSPs;
  }

  if (Object.keys(oldVals).length > 0) {
    await writeLog({
      userId: auth.zNumber,
      actionType: 'EDIT_PAL',
      palletId: pid,
      details: { old: oldVals, new: newVals },
    });
  }

  return { pid };
}

app.http('getPallet', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'pallets/{id}',
  handler: withHandler(getPallet),
});

app.http('editPallet', {
  methods: ['PATCH'],
  authLevel: 'anonymous',
  route: 'pallets/{id}',
  handler: withHandler(editPallet),
});
