import { app } from '@azure/functions';
import type { HttpRequest, InvocationContext } from '@azure/functions';
import prisma from '../lib/prisma.js';
import { withHandler } from '../lib/response.js';
import { requireAuth } from '../lib/permissions.js';
import { writeLog } from '../lib/activityLog.js';
import { parseLocationBarcode, parseFullLocationBarcode } from '../lib/locationParser.js';

/**
 * Confirms a label pull via one of three independent verification paths: Pallet ID, UPC,
 * or Location. Exactly one of `palletId` / `upc` / `location` is expected per request (issue
 * #82 — previously a single `alternateId` string whose format was guessed as either UPC or
 * location; now the frontend has two separate fields and sends only the one the worker just
 * confirmed, so there's no format-guessing left to do here).
 *
 * Pallet ID path: the submitted pallet ID must exactly match the label's pallet.
 *
 * UPC path: looks up the item by UPC and compares its DPCI to the pallet's DPCI.
 *
 * Location path: parses the submitted value as a location barcode and compares to the
 * pallet's current location. For CA/CF, a 6- or 8-digit barcode is accepted and only
 * aisle+bin are compared (level is intentionally ignored, per outline.md's bin-level
 * confirmation rule). For FP, a full 8-digit barcode is required; aisle+bin must always
 * match exactly, but level is allowed to differ — a Full Pallet pull happens from floor
 * level, so the worker may only be able to reach and scan a low-level barcode even when
 * the pallet itself is stored high in the racking. If aisle+bin match but level doesn't,
 * this throws LEVEL_MISMATCH (not ALTERNATE_MISMATCH) instead of completing the pull —
 * the frontend prompts the worker to type the level it actually was (issue #72 — not
 * just confirm/reject the mismatch), replaces the scanned level with that correction,
 * and resubmits with `confirmLevelMismatch: true` to complete the pull. The corrected
 * level is accepted as the worker's attestation with no further validation, and is
 * recorded in the activity log's `details.confirmedLevel` for a paper trail. Aisle+bin
 * not matching at all is still an outright ALTERNATE_MISMATCH, same as before (issue #49).
 *
 * On success: marks the label PULLED, deducts the label's carton and SSP quantities
 * from the pallet, and writes a PULL activity log entry with before/after quantities.
 * The pallet's full-pallet count (pallets field) is always set to 0 after any carton pull.
 *
 * @param req - HTTP request with body:
 *   `{ labelId: string; pullFunction: string; palletId?: number | string }` or
 *   `{ labelId: string; pullFunction: string; upc?: string }` or
 *   `{ labelId: string; pullFunction: string; location?: string; confirmLevelMismatch?: boolean }`
 * @returns `{ location: string | null; updatedQuantity: { pallets, cartons, ssps } }`
 * @throws 400 INVALID_INPUT for missing fields or PALLET_MISMATCH / ALTERNATE_MISMATCH on wrong IDs;
 *   400 LEVEL_MISMATCH (FP only) if aisle+bin match but level doesn't, and the request didn't
 *   set confirmLevelMismatch — response body includes `{ scannedLevel, actualLevel }`;
 *   404 NOT_FOUND if label does not exist or is not in PRINTED status;
 *   409 WRONG_PULL_FUNCTION if the label's pull function does not match the submitted function
 */
async function verifyPull(req: HttpRequest, _ctx: InvocationContext): Promise<unknown> {
  const auth = await requireAuth(req);

  const body = await req.json() as {
    labelId: string;
    pullFunction: string;
    palletId?: number | string;
    upc?: string;
    location?: string;
    confirmLevelMismatch?: boolean;
  };

  if (!body.labelId) throw Object.assign(new Error('INVALID_INPUT'), { status: 400 });
  if (!body.pullFunction) throw Object.assign(new Error('INVALID_INPUT'), { status: 400 });
  if (!body.palletId && !body.upc && !body.location) {
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

  // The level the worker attested to when resubmitting past a LEVEL_MISMATCH (issue
  // #72) — the frontend's correction popup replaces the originally-scanned (wrong)
  // level with whatever the worker typed before resubmitting, so the location's level
  // digits at that point are already the corrected value, not the original mismatch.
  // Recorded in the activity log for a paper trail; never validated against
  // pallet.location.level — accepted as the worker's attestation, per issue #72's
  // explicit scoping. Declared here (not inside the location block below) so it's
  // still in scope for the writeLog call further down.
  let confirmedLevel: number | null = null;

  // ── Pallet ID path ──────────────────────────────────────────────────────────
  if (body.palletId != null) {
    const submittedPid = typeof body.palletId === 'string'
      ? parseInt(body.palletId, 10)
      : body.palletId;

    if (submittedPid !== pallet.pid) {
      throw Object.assign(new Error('PALLET_MISMATCH'), { status: 400 });
    }
  }

  // ── UPC path ────────────────────────────────────────────────────────────────
  if (body.upc != null) {
    const upc = body.upc.trim();

    const itemByUpc = await prisma.item.findUnique({
      where: { upc },
      select: { dept: true, class: true, item: true },
    });
    const upcMatch =
      itemByUpc &&
      itemByUpc.dept === pallet.dept &&
      itemByUpc.class === pallet.class &&
      itemByUpc.item === pallet.item;

    if (!upcMatch) {
      throw Object.assign(new Error('ALTERNATE_MISMATCH'), { status: 400 });
    }
  }

  // ── Location path ───────────────────────────────────────────────────────────
  if (body.location != null) {
    const loc = body.location.trim();

    // FP requires the full 8-digit barcode with aisle+bin matching exactly; level is
    // checked separately below rather than folded into locationMatch, since a level
    // mismatch on FP prompts for confirmation instead of an outright reject. CA/CF stay
    // aisle+bin-only (level intentionally ignored), per outline.md's bin-level rule.
    let locationMatch = false;
    let levelMismatch: { scannedLevel: number; actualLevel: number } | null = null;
    if (pallet.locationAisle != null) {
      if (body.pullFunction === 'FP') {
        const parsed = parseFullLocationBarcode(loc);
        const binMatch =
          parsed !== null &&
          parsed.aisle === pallet.locationAisle &&
          parsed.bin === pallet.locationBin;
        if (binMatch && parsed!.level !== pallet.location?.level && pallet.location?.level != null) {
          levelMismatch = { scannedLevel: parsed!.level, actualLevel: pallet.location.level };
        }
        locationMatch = binMatch && (levelMismatch === null || body.confirmLevelMismatch === true);
        if (locationMatch && body.confirmLevelMismatch === true && parsed) {
          confirmedLevel = parsed.level;
        }
      } else {
        const parsed = parseLocationBarcode(loc);
        locationMatch =
          parsed !== null &&
          parsed.aisle === pallet.locationAisle &&
          parsed.bin === pallet.locationBin;
      }
    }

    if (!locationMatch) {
      if (levelMismatch && !body.confirmLevelMismatch) {
        throw Object.assign(new Error('LEVEL_MISMATCH'), { status: 400, data: levelMismatch });
      }
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
      ...(confirmedLevel != null && { confirmedLevel }),
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
