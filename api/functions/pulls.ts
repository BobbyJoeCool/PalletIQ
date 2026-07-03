import { app } from '@azure/functions';
import type { HttpRequest, InvocationContext } from '@azure/functions';
import prisma from '../lib/prisma.js';
import { withHandler } from '../lib/response.js';
import { requireAuth } from '../lib/permissions.js';
import { writeLog } from '../lib/activityLog.js';
import { parseLocationBarcode } from '../lib/locationParser.js';

/**
 * Confirms a label pull via one of two verification paths: Pallet ID or Alternate ID.
 * Exactly one of `palletId` or `alternateId` must be supplied.
 *
 * Pallet ID path: the submitted pallet ID must exactly match the label's pallet.
 *
 * Alternate ID path: the submitted value is checked against two identifiers in order:
 *   1. Item UPC — looks up the item by UPC and compares its DPCI to the pallet's DPCI.
 *   2. Location barcode — parses the alternate as a 6 or 8-digit barcode and compares
 *      aisle+bin to the pallet's current location (level is intentionally ignored).
 *
 * On success: marks the label PULLED, deducts the label's carton and SSP quantities
 * from the pallet, and writes a PULL activity log entry with before/after quantities.
 * The pallet's full-pallet count (pallets field) is always set to 0 after any carton pull.
 *
 * @param req - HTTP request with body:
 *   `{ labelId: string; pullFunction: string; palletId?: number | string }` or
 *   `{ labelId: string; pullFunction: string; alternateId?: string }`
 * @returns `{ location: string | null; updatedQuantity: { pallets, cartons, ssps } }`
 * @throws 400 INVALID_INPUT for missing fields or PALLET_MISMATCH / ALTERNATE_MISMATCH on wrong IDs;
 *   404 NOT_FOUND if label does not exist or is not in PRINTED status;
 *   409 WRONG_PULL_FUNCTION if the label's pull function does not match the submitted function
 */
async function verifyPull(req: HttpRequest, _ctx: InvocationContext): Promise<unknown> {
  const auth = await requireAuth(req);

  const body = await req.json() as {
    labelId: string;
    pullFunction: string;
    palletId?: number | string;
    alternateId?: string;
  };

  if (!body.labelId) throw Object.assign(new Error('INVALID_INPUT'), { status: 400 });
  if (!body.pullFunction) throw Object.assign(new Error('INVALID_INPUT'), { status: 400 });
  if (!body.palletId && !body.alternateId) {
    throw Object.assign(new Error('INVALID_INPUT'), { status: 400 });
  }

  const label = await prisma.label.findUnique({
    where: { lid: body.labelId },
    include: {
      pallet: {
        include: {
          location: { select: { aisle: true, bin: true, level: true } },
        },
      },
    },
  });

  if (!label || label.status !== 'PRINTED') {
    throw Object.assign(new Error('NOT_FOUND'), { status: 404 });
  }

  if (label.pullFunction !== body.pullFunction) {
    throw Object.assign(new Error('WRONG_PULL_FUNCTION'), { status: 409 });
  }

  const pallet = label.pallet;

  // ── Pallet ID path ──────────────────────────────────────────────────────────
  if (body.palletId != null) {
    const submittedPid = typeof body.palletId === 'string'
      ? parseInt(body.palletId, 10)
      : body.palletId;

    if (submittedPid !== pallet.pid) {
      throw Object.assign(new Error('PALLET_MISMATCH'), { status: 400 });
    }
  }

  // ── Alternate ID path ───────────────────────────────────────────────────────
  if (body.alternateId != null) {
    const alt = body.alternateId.trim();

    // First, try matching the submitted value as a UPC against the Item catalogue.
    const itemByUpc = await prisma.item.findUnique({
      where: { upc: alt },
      select: { dept: true, class: true, item: true },
    });
    const upcMatch =
      itemByUpc &&
      itemByUpc.dept === pallet.dept &&
      itemByUpc.class === pallet.class &&
      itemByUpc.item === pallet.item;

    // If UPC did not match, try matching as a location barcode (Aisle+Bin comparison only).
    let locationMatch = false;
    if (!upcMatch && pallet.locationAisle != null) {
      const parsed = parseLocationBarcode(alt);
      locationMatch =
        parsed !== null &&
        parsed.aisle === pallet.locationAisle &&
        parsed.bin === pallet.locationBin;
    }

    if (!upcMatch && !locationMatch) {
      throw Object.assign(new Error('ALTERNATE_MISMATCH'), { status: 400 });
    }
  }

  // ── Execute pull ────────────────────────────────────────────────────────────
  // Deduct the label's quantities from the pallet; floor at 0.
  // Any carton pull always zeroes the pallet count (breaks full-pallet status).
  const newCartons = Math.max(0, pallet.currentCartons - label.quantity);
  const newSSPs    = Math.max(0, pallet.currentSSPs    - label.sspQuantity);
  const newPallets = 0;

  const loc = pallet.location;

  // Mark the label as PULLED and update pallet quantities in one atomic transaction.
  await prisma.$transaction([
    prisma.label.update({
      where: { lid: label.lid },
      data: { status: 'PULLED' },
    }),
    prisma.pallet.update({
      where: { pid: pallet.pid },
      data: {
        currentPallets: newPallets,
        currentCartons: newCartons,
        currentSSPs:    newSSPs,
        lastPulledByZ:  auth.zNumber,
        lastPulledAt:   new Date(),
      },
    }),
  ]);

  await writeLog({
    userId: auth.zNumber,
    actionType: 'PULL',
    palletId: pallet.pid,
    locationAisle: loc?.aisle,
    locationBin:   loc?.bin,
    locationLevel: loc?.level,
    dept: pallet.dept,
    class: pallet.class,
    item: pallet.item,
    details: {
      labelId: label.lid,
      pulled: { cartons: label.quantity, ssps: label.sspQuantity },
      remaining: { pallets: newPallets, cartons: newCartons, ssps: newSSPs },
    },
  });

  // Build the 8-digit location ID string (or null if the pallet has no location).
  const locationId =
    loc
      ? String(loc.aisle).padStart(3, '0') +
        String(loc.bin).padStart(3, '0') +
        String(loc.level).padStart(2, '0')
      : null;

  return {
    location: locationId,
    updatedQuantity: { pallets: newPallets, cartons: newCartons, ssps: newSSPs },
  };
}

app.http('verifyPull', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'pulls/verify',
  handler: withHandler(verifyPull),
});
