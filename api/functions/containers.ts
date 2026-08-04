import { app } from '../lib/functionsRuntime.js';
import type { HttpRequest, InvocationContext } from '../lib/functionsRuntime.js';
import prisma from '../lib/prisma.js';
import { withHandler } from '../lib/response.js';
import { requireAuth } from '../lib/permissions.js';
import { formatDpci } from '../lib/dpci.js';

/**
 * Looks up a container by ID and validates it is in PRINTED (Pending) status.
 * Resolves the chain Container → Pallet → current Location so the PIP screen can display
 * location, item description, DPCI, and quantities before the worker verifies the pull.
 *
 * The location is looked up fresh at scan time via the pallet's locationAisle/Bin/Level
 * fields, not stored on the container. This ensures a pallet that moved after container
 * generation still resolves to its correct current location.
 *
 * @param req - HTTP request with URL param `id` (container ID string, e.g. "1234-56789-...")
 * @returns Combined container, pallet, and location data for the PIP State 2 display
 * @throws 400 INVALID_INPUT if id is missing; 404 NOT_FOUND if container does not exist;
 *   409 {status} if container exists but is not in PRINTED status (error code is the actual status name)
 */
async function getContainer(req: HttpRequest, _ctx: InvocationContext): Promise<unknown> {
  await requireAuth(req);

  const cid = req.params.id ?? '';
  if (!cid) throw Object.assign(new Error('INVALID_INPUT'), { status: 400 });

  const container = await prisma.container.findUnique({
    where: { cid },
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

  if (!container) throw Object.assign(new Error('NOT_FOUND'), { status: 404 });

  // Non-PRINTED containers are rejected; the status name is used as the error code so the
  // UI can display a meaningful message (e.g. "Invalid status: PULLED").
  if (container.status !== 'PRINTED') {
    throw Object.assign(new Error(container.status), { status: 409 });
  }

  // Build the 8-digit location ID string from the pallet's stored location fields.
  const pallet = container.pallet;
  const locationId =
    pallet.locationAisle != null
      ? String(pallet.locationAisle).padStart(3, '0') +
        String(pallet.locationBin!).padStart(3, '0') +
        String(pallet.locationLevel!).padStart(2, '0')
      : null;

  return {
    container: {
      id: container.cid,
      status: container.status,
      pullFunction: container.pullFunction,
      quantity: {
        pallets: 0,
        cartons: container.quantity,
        ssps: container.sspQuantity,
      },
      dpci: formatDpci(container.dept, container.class, container.item),
      descShort: container.itemRef.descShort,
      batchDate: container.batchDate,
      destinationStore: container.destinationStore,
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

app.http('getContainer', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'containers/{id}',
  handler: withHandler(getContainer),
});
