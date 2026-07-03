import { app } from '@azure/functions';
import type { HttpRequest, InvocationContext } from '@azure/functions';
import prisma from '../lib/prisma.js';
import { withHandler } from '../lib/response.js';
import { requireAuth } from '../lib/permissions.js';

/**
 * Looks up a label by ID and validates it is in PRINTED (Pending) status.
 * Resolves the chain Label → Pallet → current Location so the PIP screen can display
 * location, item description, DPCI, and quantities before the worker verifies the pull.
 *
 * The location is looked up fresh at scan time via the pallet's locationAisle/Bin/Level
 * fields, not stored on the label. This ensures a pallet that moved after label generation
 * still resolves to its correct current location.
 *
 * @param req - HTTP request with URL param `id` (label ID string, e.g. "1234-56789-...")
 * @returns Combined label, pallet, and location data for the PIP State 2 display
 * @throws 400 INVALID_INPUT if id is missing; 404 NOT_FOUND if label does not exist;
 *   409 {status} if label exists but is not in PRINTED status (error code is the actual status name)
 */
async function getLabel(req: HttpRequest, _ctx: InvocationContext): Promise<unknown> {
  await requireAuth(req);

  const lid = req.params.id ?? '';
  if (!lid) throw Object.assign(new Error('INVALID_INPUT'), { status: 400 });

  const label = await prisma.label.findUnique({
    where: { lid },
    include: {
      itemRef: { select: { descShort: true } },
      pallet: {
        select: {
          pid: true,
          currentPallets: true,
          currentCartons: true,
          currentSSPs: true,
          locationAisle: true,
          locationBin: true,
          locationLevel: true,
        },
      },
    },
  });

  if (!label) throw Object.assign(new Error('NOT_FOUND'), { status: 404 });

  // Non-PRINTED labels are rejected; the status name is used as the error code so the
  // UI can display a meaningful message (e.g. "Invalid status: PULLED").
  if (label.status !== 'PRINTED') {
    throw Object.assign(new Error(label.status), { status: 409 });
  }

  // Build the 8-digit location ID string from the pallet's stored location fields.
  const pallet = label.pallet;
  const locationId =
    pallet.locationAisle != null
      ? String(pallet.locationAisle).padStart(3, '0') +
        String(pallet.locationBin!).padStart(3, '0') +
        String(pallet.locationLevel!).padStart(2, '0')
      : null;

  return {
    label: {
      id: label.lid,
      status: label.status,
      pullFunction: label.pullFunction,
      quantity: {
        pallets: 0,
        cartons: label.quantity,
        ssps: label.sspQuantity,
      },
      dpci: `${String(label.dept).padStart(3, '0')}-${String(label.class).padStart(2, '0')}-${String(label.item).padStart(4, '0')}`,
      descShort: label.itemRef.descShort,
      batchDate: label.batchDate,
      destinationStore: label.destinationStore,
    },
    pallet: {
      id: pallet.pid,
      quantity: {
        pallets: pallet.currentPallets,
        cartons: pallet.currentCartons,
        ssps: pallet.currentSSPs,
      },
    },
    location: {
      id: locationId,
    },
  };
}

app.http('getLabel', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'labels/{id}',
  handler: withHandler(getLabel),
});
