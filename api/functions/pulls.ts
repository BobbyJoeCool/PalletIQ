import { app } from '@azure/functions';
import type { HttpRequest, InvocationContext } from '@azure/functions';
import prisma from '../lib/prisma.js';
import { withHandler } from '../lib/response.js';
import { requireAuth } from '../lib/permissions.js';
import { writeLog } from '../lib/activityLog.js';
import { parseFullLocationBarcode } from '../lib/locationParser.js';

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
 * Location path: parses the submitted value as a full Aisle+Bin+Level barcode (the
 * frontend's LocationEntryFields always resolves one, whether scanned or hand-typed) and
 * compares it to the pallet's current location. The match rule depends on both the pull
 * function and `wasScanned`:
 *   - Hand-entered (`wasScanned: false`) CA or FP: full Aisle+Bin+Level match required.
 *     A mismatch is an outright ALTERNATE_MISMATCH — the worker already typed what they
 *     believe is correct, so there's nothing to recover from.
 *   - Hand-entered CF: also a full match, but only Bin is actually fallible in practice —
 *     PIP's LocationEntryFields locks the Aisle and Level boxes to the pallet's real
 *     current values for this combination (product decision: only Bin needs verifying),
 *     so the Aisle/Level portions of the submitted value are always correct by
 *     construction and only Bin can actually cause a mismatch.
 *   - Scanned CA: full Aisle+Bin+Level match required, same as hand-entered.
 *   - Scanned CF: only Aisle+Bin compared; level is ignored.
 *   - Scanned FP: full match required, but a level-only mismatch (aisle+bin already
 *     matched) throws LEVEL_MISMATCH instead of failing outright — a Full Pallet pull
 *     happens from floor level, so the worker may only be able to reach and scan a
 *     low-level barcode even when the pallet itself is stored high in the racking. The
 *     frontend prompts the worker to type the level it actually was (issue #72 — not
 *     just confirm/reject the mismatch), and resubmits with `confirmLevelMismatch: true`
 *     to complete the pull. The corrected level is accepted as the worker's attestation
 *     with no further validation, and is recorded in the activity log's
 *     `details.confirmedLevel` for a paper trail.
 * An aisle+bin mismatch is always an outright ALTERNATE_MISMATCH, regardless of pull
 * function or entry method (issue #49).
 *
 * On success: marks the label PULLED, deducts the label's carton and SSP quantities
 * from the pallet, and writes a PULL activity log entry with before/after quantities.
 * The pallet's full-pallet count (pallets field) is always set to 0 after any carton pull.
 *
 * `wasScanned` also doubles as the activity log's verification-method record (see
 * writeLog below): whichever of palletId/upc/location was actually submitted becomes
 * `verifiedVia` ('PID' | 'UPC' | 'LID'), paired with this same `wasScanned` flag. For PID/
 * UPC the frontend derives it from NumpadContext's isScanningRef read synchronously at
 * the top of the field's submit handler (still true at that point for a scan's trailing
 * synthetic Enter — see NumpadContext's deliverScan); for Location it's the structural
 * scanned-vs-hand-entered signal already described above.
 *
 * @param req - HTTP request with body:
 *   `{ labelId: string; pullFunction: string; palletId?: number | string; wasScanned?: boolean }` or
 *   `{ labelId: string; pullFunction: string; upc?: string; wasScanned?: boolean }` or
 *   `{ labelId: string; pullFunction: string; location?: string; wasScanned?: boolean; confirmLevelMismatch?: boolean }`
 * @returns `{ location: string | null; updatedQuantity: { pallets, cartons, ssps } }`
 * @throws 400 INVALID_INPUT for missing fields or PALLET_MISMATCH / ALTERNATE_MISMATCH on wrong IDs;
 *   400 LEVEL_MISMATCH (scanned FP only) if aisle+bin match but level doesn't, and the request
 *   didn't set confirmLevelMismatch — response body includes `{ scannedLevel, actualLevel }`;
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
    wasScanned?: boolean;
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

    let locationMatch = false;
    let levelMismatch: { scannedLevel: number; actualLevel: number } | null = null;

    if (pallet.locationAisle != null) {
      const parsed = parseFullLocationBarcode(loc);
      const aisleBinMatch =
        parsed !== null &&
        parsed.aisle === pallet.locationAisle &&
        parsed.bin === pallet.locationBin;

      if (aisleBinMatch) {
        const levelMatches = pallet.location?.level != null && parsed!.level === pallet.location.level;

        if (body.wasScanned === true && body.pullFunction === 'CF') {
          // Scanned Carton Floor: aisle+bin is sufficient, level not checked.
          locationMatch = true;
        } else if (body.wasScanned === true && body.pullFunction === 'FP') {
          // Scanned Full Pallet: a level-only mismatch prompts for a worker-attested
          // correction instead of an outright reject (see docstring).
          if (levelMatches) {
            locationMatch = true;
          } else if (body.confirmLevelMismatch === true) {
            locationMatch = true;
            confirmedLevel = parsed!.level;
          } else if (pallet.location?.level != null) {
            levelMismatch = { scannedLevel: parsed!.level, actualLevel: pallet.location.level };
          }
        } else {
          // Scanned CA, or any hand-entered location (CA/FP typed by the worker; CF's
          // Aisle+Level are pre-filled correct and locked in the UI, so this trivially
          // reduces to a Bin check for CF — see PIP's LocationEntryFields lockedAisle/
          // lockedLevel props): full match required, no recovery popup.
          locationMatch = levelMatches;
        }
      }
    }

    if (!locationMatch) {
      if (levelMismatch) {
        throw Object.assign(new Error('LEVEL_MISMATCH'), { status: 400, data: levelMismatch });
      }
      throw Object.assign(new Error('ALTERNATE_MISMATCH'), { status: 400 });
    }
  }

  // ── Execute pull ────────────────────────────────────────────────────────────
  // Exactly one of palletId/upc/location was required above (INVALID_INPUT otherwise),
  // so this unambiguously identifies which field actually verified the pull.
  const verifiedVia = body.palletId != null ? 'PID' : body.upc != null ? 'UPC' : 'LID';

  // Deduct the label's quantities from the pallet; floor at 0.
  // Any carton pull always zeroes the pallet count (breaks full-pallet status).
  const newCartons = Math.max(0, pallet.currentCartons - label.quantity);
  const newSSPs    = Math.max(0, pallet.currentSSPs    - label.sspQuantity);
  const newPallets = 0;

  // FP pulls consume the whole pallet's full-pallet count; CA/CF pulls never touch it.
  const pulledPallets = body.pullFunction === 'FP' ? pallet.currentPallets : 0;

  const loc = pallet.location;

  // Mark the label as PULLED and update pallet quantities in one atomic transaction. A
  // pallet can have more than one label outstanding at once (e.g. a CA pull and an FP
  // pull, or multiple CA pulls, against the same location) — only clear its
  // CA_PULL_PEND/FP_PULL_PEND status back to STORED once every one of its labels has
  // actually been pulled, not just this one. Uses the interactive transaction form (not
  // the array form) since the pallet update depends on a read that must happen after this
  // label's own status write.
  await prisma.$transaction(async (tx) => {
    await tx.label.update({
      where: { lid: label.lid },
      data: { status: 'PULLED' },
    });

    const remainingPending = await tx.label.count({
      where: { pid: pallet.pid, status: { in: ['AVAILABLE', 'PRINTED'] } },
    });

    await tx.pallet.update({
      where: { pid: pallet.pid },
      data: {
        currentPallets: newPallets,
        currentCartons: newCartons,
        currentSSPs:    newSSPs,
        lastPulledByZ:  auth.zNumber,
        lastPulledAt:   new Date(),
        ...(remainingPending === 0 && { status: 'STORED' }),
      },
    });
  });

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
      pullFunction: body.pullFunction,
      pulled: { pallets: pulledPallets, cartons: label.quantity, ssps: label.sspQuantity },
      remaining: { pallets: newPallets, cartons: newCartons, ssps: newSSPs },
      verifiedVia,
      wasScanned: body.wasScanned === true,
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
