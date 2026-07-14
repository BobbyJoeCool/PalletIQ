import { app } from '@azure/functions';
import type { HttpRequest, InvocationContext } from '@azure/functions';
import prisma from '../lib/prisma.js';
import { withHandler } from '../lib/response.js';
import { requireAuth, hasMinRole } from '../lib/permissions.js';
import { writeLog } from '../lib/activityLog.js';
import { checkPalletEligibility } from '../lib/eligibility.js';
import { findNextLocation, resolveEffectiveCriteria } from '../lib/zoneLogic.js';
import { parseLocationBarcode, formatLocationId as locationString } from '../lib/locationParser.js';

/**
 * Atomically stores a pallet at a new location.
 * Clears the pallet's previous location (if any) by setting it to EMPTY,
 * then marks the new location as STORED and updates the pallet's location fields
 * and status in a single database transaction so the pallet can never appear in two locations.
 *
 * Also copies the target location's Storage Code/Size/Zone onto the pallet itself
 * (`Pallet.storageCode`/`.size`/`.zone`) — the pallet's own source of truth for these,
 * read by Directed Put's default location search when no IM+ override is given (see
 * directedPut below). Kept in sync here since this is the one place both SDP (confirmPut)
 * and MNP (manualConfirm) funnel through to actually complete a put.
 *
 * @param palletId - Numeric pallet ID to move
 * @param newAisle - Target location aisle
 * @param newBin - Target location bin
 * @param newLevel - Target location level
 * @param workerZ - zNumber of the worker performing the put (written to pallet.putByZ)
 * @returns `{ wasMove: boolean; clearedLocation: string | null }` —
 *   wasMove is true if the pallet had a prior location; clearedLocation is that
 *   location's 8-digit ID string, or null for a first-time put
 */
async function placePallet(
  palletId: number,
  newAisle: number,
  newBin: number,
  newLevel: number,
  workerZ: string,
) {
  const [pallet, newLoc] = await Promise.all([
    prisma.pallet.findUnique({
      where: { pid: palletId },
      select: { locationAisle: true, locationBin: true, locationLevel: true },
    }),
    prisma.location.findUniqueOrThrow({
      where: { LocationID: { aisle: newAisle, bin: newBin, level: newLevel } },
      select: { storageCode: true, size: true, zone: true },
    }),
  ]);

  const ops = [];

  // Clear old location if applicable.
  if (pallet?.locationAisle != null) {
    ops.push(
      prisma.location.update({
        where: { LocationID: { aisle: pallet.locationAisle, bin: pallet.locationBin!, level: pallet.locationLevel! } },
        data: { status: 'EMPTY' },
      }),
    );
  }

  // Store pallet at new location.
  ops.push(
    prisma.location.update({
      where: { LocationID: { aisle: newAisle, bin: newBin, level: newLevel } },
      data: { status: 'STORED' },
    }),
  );
  ops.push(
    prisma.pallet.update({
      where: { pid: palletId },
      data: {
        locationAisle: newAisle,
        locationBin:   newBin,
        locationLevel: newLevel,
        storageCode:   newLoc.storageCode,
        size:          newLoc.size,
        zone:          newLoc.zone,
        status:        'STORED',
        putByZ:        workerZ,
        putAt:         new Date(),
      },
    }),
  );

  await prisma.$transaction(ops);

  return pallet?.locationAisle != null
    ? { wasMove: true, clearedLocation: locationString(pallet.locationAisle, pallet.locationBin!, pallet.locationLevel!) }
    : { wasMove: false, clearedLocation: null };
}

// ── POST /api/puts/directed ───────────────────────────────────────────────────

/**
 * Finds and reserves a storage location for a pallet using system-directed logic.
 * Runs the shared eligibility check, resolves the effective Size/Storage Code/Zone to
 * search with, finds the next available location, and reserves it by setting its status
 * to RESERVED and creating a Reservation row.
 *
 * **Effective Size/Storage Code/Zone resolution** (the SDP put hierarchy): an IM+ override
 * always wins when supplied. Otherwise, Size and Storage Code fall back to the pallet's
 * own inherited values (`Pallet.storageCode`/`.size` — set by placePallet from wherever
 * the pallet is currently STORED; null, meaning no filter, if it's PUT_PENDING and has
 * never been stored). Zone falls back the same way (`Pallet.zone`), defaulting to 1 if
 * the pallet has none — and even then is only ever a *starting preference* for
 * `findNextLocation`, which retries from Zone 1 if nothing eligible exists at or above it.
 * Size/Storage Code, by contrast, are hard exact-match filters once resolved (no fallback
 * search without them) — passed straight through to `findNextLocation`.
 *
 * Any authenticated worker may supply `size` to constrain the location search — Size is
 * the one override every role can use. `storageCode` and `zone` remain IM+ only; passing
 * either as a non-IM user returns 403 (Size alone never does, regardless of role).
 *
 * The `consolidating` flag changes the already-stored alert from warning to info,
 * indicating the move is intentional rather than accidental.
 *
 * `wasScanned` records whether the Pallet ID was scanned or hand-typed, carried on the
 * Reservation through to confirmPut's activity log entry (see confirmPut's docstring).
 *
 * @param req - HTTP request with body:
 *   `{ aisle: number; palletId: number; size?: string; storageCode?: string; zone?: number; consolidating?: boolean; wasScanned?: boolean }`
 * @returns `{ reservationId, directedLocation, pallet: { id, dpci, descShort, quantity, currentLocation }, alreadyStored }`
 * @throws 400 INVALID_INPUT for missing aisle or palletId; 403 FORBIDDEN if storageCode/zone supplied by non-IM;
 *   404 PALLET_NOT_FOUND; 409 NO_CARTONS if pallet has no stored cartons; 409 NO_LOCATIONS if no eligible locations
 */
async function directedPut(req: HttpRequest, _ctx: InvocationContext): Promise<unknown> {
  const auth = await requireAuth(req);

  const body = await req.json() as {
    aisle: number;
    palletId: number;
    size?: string;
    storageCode?: string;
    zone?: number;
    consolidating?: boolean;
    wasScanned?: boolean;
  };

  if (!body.aisle || !body.palletId) {
    throw Object.assign(new Error('INVALID_INPUT'), { status: 400 });
  }

  // IM+ required for Storage Code/Zone overrides — Size is the one override every
  // authenticated role can use, per product decision.
  if ((body.storageCode || body.zone != null) && !hasMinRole(auth.role, 'IM')) {
    throw Object.assign(new Error('FORBIDDEN'), { status: 403 });
  }

  const elig = await checkPalletEligibility(body.palletId);

  const effective = resolveEffectiveCriteria(body, elig.pallet);

  const loc = await findNextLocation(body.aisle, effective.zone, {
    size:          effective.size,
    storageCode:   effective.storageCode,
    excludeStaged: body.consolidating,
  });

  if (!loc) {
    throw Object.assign(new Error('NO_LOCATIONS'), { status: 409 });
  }

  // Reserve the location and create the Reservation record in sequence.
  await prisma.location.update({
    where: { LocationID: { aisle: loc.aisle, bin: loc.bin, level: loc.level } },
    data: { status: 'RESERVED' },
  });

  const reservation = await prisma.reservation.create({
    data: {
      locationAisle:   loc.aisle,
      locationBin:     loc.bin,
      locationLevel:   loc.level,
      palletId:        body.palletId,
      workerZ:         auth.zNumber,
      targetAisle:     body.aisle,
      // Raw overrides only (null if none) — confirmPut's log-write reads these to show
      // whether an IM+ override was actually used, so this must stay distinct from the
      // *effective* criteria (which also folds in the pallet's own inherited values —
      // see `effective` above). blockPut re-derives the same effective criteria itself
      // from these raw fields plus the pallet's current inherited values.
      targetSize:      body.size ?? null,
      targetStorage:   body.storageCode ?? null,
      targetZone:      body.zone ?? null,
      consolidating:   body.consolidating ?? false,
      pidWasScanned:   body.wasScanned ?? null,
      wasStaged:       loc.wasStaged,
    },
  });

  await writeLog({
    userId: auth.zNumber,
    actionType: 'RESERVE',
    palletId: body.palletId,
    locationAisle: loc.aisle,
    locationBin:   loc.bin,
    locationLevel: loc.level,
    details: { reservationId: reservation.id, aisle: body.aisle },
  });

  const currentLocation = elig.currentLocation
    ? locationString(elig.currentLocation.aisle, elig.currentLocation.bin, elig.currentLocation.level)
    : null;

  return {
    reservationId:   reservation.id,
    directedLocation: locationString(loc.aisle, loc.bin, loc.level),
    pallet: {
      id:              elig.pallet.pid,
      dpci:            `${String(elig.pallet.dept).padStart(3,'0')}-${String(elig.pallet.class).padStart(2,'0')}-${String(elig.pallet.item).padStart(4,'0')}`,
      descShort:       elig.pallet.descShort,
      quantity: {
        pallets: elig.pallet.currentPallets,
        cartons: elig.pallet.currentCartons,
        ssps:    elig.pallet.currentSSPs,
      },
      currentLocation,
    },
    alreadyStored: elig.alreadyStored,
  };
}

// ── POST /api/puts/:reservationId/confirm ────────────────────────────────────

/**
 * Confirms a system-directed put by scanning the target location barcode.
 * Validates that the scanned location (Aisle+Bin) matches the reserved location,
 * then calls placePallet to atomically complete the store and deletes the Reservation.
 *
 * The level from the Reservation record (not the scanned barcode) is used as the
 * destination level, since physical barcodes only encode aisle+bin.
 *
 * The log entry's `verification` field records how each of the two fields that produced
 * this PUT were entered — `pid` from the Reservation's `pidWasScanned` (set back in
 * directedPut), `bin` from this request's own `wasScanned` — as `{ scanned: boolean }`
 * each, so the activity overlay can show e.g. "(Scan: PID, Enter: BIN)". Labeled "BIN" not
 * "LID" since SDP confirms Aisle+Bin only (see LOCATION_MISMATCH below), unlike PIP's
 * full Aisle+Bin+Level Location match.
 *
 * `wasStaged` (from the Reservation, set back in directedPut/blockPut) is true if the
 * directed location was already STAGED when selected — the preferred/expected outcome —
 * false if the search fell through to an EMPTY location. The frontend uses this to show
 * Blue Info instead of Green Success, with a note that the location wasn't staged, per
 * the SDP put hierarchy's rule 4.a.
 *
 * @param req - HTTP request with URL param `reservationId` and body
 *   `{ scannedLocation: string; wasScanned?: boolean }`
 * @returns `{ location: string; wasMove: boolean; clearedLocation: string | null; wasStaged: boolean }`
 * @throws 400 INVALID_INPUT for non-numeric reservationId, missing body, or LOCATION_MISMATCH;
 *   404 NOT_FOUND if reservation does not exist (may have been expired by the timer function)
 */
async function confirmPut(req: HttpRequest, _ctx: InvocationContext): Promise<unknown> {
  const auth = await requireAuth(req);

  const reservationId = parseInt(req.params.reservationId ?? '', 10);
  if (isNaN(reservationId)) throw Object.assign(new Error('INVALID_INPUT'), { status: 400 });

  const body = await req.json() as { scannedLocation: string; wasScanned?: boolean };
  if (!body.scannedLocation) throw Object.assign(new Error('INVALID_INPUT'), { status: 400 });

  const reservation = await prisma.reservation.findUnique({ where: { id: reservationId } });
  if (!reservation) throw Object.assign(new Error('NOT_FOUND'), { status: 404 });

  // Parse the scanned barcode and compare aisle+bin to the reserved location.
  const parsed = parseLocationBarcode(body.scannedLocation);
  if (!parsed) throw Object.assign(new Error('INVALID_INPUT'), { status: 400 });

  if (parsed.aisle !== reservation.locationAisle || parsed.bin !== reservation.locationBin) {
    throw Object.assign(new Error('LOCATION_MISMATCH'), { status: 400 });
  }

  const { wasMove, clearedLocation } = await placePallet(
    reservation.palletId,
    reservation.locationAisle,
    reservation.locationBin,
    reservation.locationLevel,
    auth.zNumber,
  );

  await prisma.reservation.delete({ where: { id: reservationId } });

  // Only IM+ overrides set target fields on the Reservation (see directedPut) — a
  // plain directed put leaves them null, so their presence here means an override
  // was actually used to constrain the location search.
  const override: Record<string, string | number> = {};
  if (reservation.targetSize)    override.size = reservation.targetSize;
  if (reservation.targetStorage) override.storageCode = reservation.targetStorage;
  if (reservation.targetZone != null) override.zone = reservation.targetZone;

  // Whether the directed location was already STAGED (the preferred/expected outcome —
  // see findNextLocation) when originally selected back in directedPut/blockPut. Only
  // meaningful for pre-1.6.2 reservations is it null; treated as "was staged" (no note)
  // in that case rather than surfacing a false "wasn't staged" for data that predates
  // this tracking.
  const wasStaged = reservation.wasStaged !== false;

  await writeLog({
    userId: auth.zNumber,
    actionType: 'PUT',
    palletId: reservation.palletId,
    locationAisle: reservation.locationAisle,
    locationBin:   reservation.locationBin,
    locationLevel: reservation.locationLevel,
    details: {
      reservationId,
      wasMove,
      clearedLocation,
      method: 'SDP',
      consolidating: reservation.consolidating,
      wasStaged,
      verification: {
        pid: { scanned: reservation.pidWasScanned === true },
        bin: { scanned: body.wasScanned === true },
      },
      ...(Object.keys(override).length > 0 && { override }),
    },
  });

  return {
    location: locationString(reservation.locationAisle, reservation.locationBin, reservation.locationLevel),
    wasMove,
    clearedLocation,
    wasStaged,
  };
}

// ── POST /api/puts/:reservationId/unassign ───────────────────────────────────

/**
 * Cancels an active put reservation without placing the pallet.
 * Sets the reserved location back to STAGED (if that's genuinely how findNextLocation
 * found it — `wasStaged`, set back in directedPut/blockPut) or EMPTY otherwise, and
 * deletes the Reservation row, in a single transaction — so the location is immediately
 * available for other puts/staging again, without silently erasing a GPMer's staging work.
 *
 * @param req - HTTP request with URL param `reservationId`
 * @returns `{ location: string; releasedStatus: 'STAGED' | 'EMPTY' }` — the released
 *   location ID and the status it was restored to
 * @throws 400 INVALID_INPUT for non-numeric reservationId;
 *   404 NOT_FOUND if reservation does not exist (already expired or confirmed)
 */
async function unassignPut(req: HttpRequest, _ctx: InvocationContext): Promise<unknown> {
  const auth = await requireAuth(req);

  const reservationId = parseInt(req.params.reservationId ?? '', 10);
  if (isNaN(reservationId)) throw Object.assign(new Error('INVALID_INPUT'), { status: 400 });

  const reservation = await prisma.reservation.findUnique({ where: { id: reservationId } });
  if (!reservation) throw Object.assign(new Error('NOT_FOUND'), { status: 404 });

  // Restore to STAGED, not EMPTY, if that's genuinely how findNextLocation found it
  // (wasStaged, set back in directedPut/blockPut) — unassigning shouldn't silently erase
  // a GPMer's staging work. `=== true` (not `!== false`) is deliberate here: unlike the
  // confirm-success message's more forgiving null-treatment, actually mutating status
  // back to STAGED should only happen when we're sure, not merely "not known false."
  const releasedStatus = reservation.wasStaged === true ? 'STAGED' : 'EMPTY';

  await prisma.$transaction([
    prisma.location.update({
      where: { LocationID: { aisle: reservation.locationAisle, bin: reservation.locationBin, level: reservation.locationLevel } },
      data: { status: releasedStatus },
    }),
    prisma.reservation.delete({ where: { id: reservationId } }),
  ]);

  await writeLog({
    userId: auth.zNumber,
    actionType: 'UNASSIGN',
    palletId: reservation.palletId,
    locationAisle: reservation.locationAisle,
    locationBin:   reservation.locationBin,
    locationLevel: reservation.locationLevel,
    details: { reservationId, releasedStatus },
  });

  return {
    location: locationString(reservation.locationAisle, reservation.locationBin, reservation.locationLevel),
    releasedStatus,
  };
}

// ── POST /api/puts/:reservationId/block ──────────────────────────────────────

/**
 * Marks the currently directed location as Hold Both ("Blocked Put") and immediately
 * finds the next eligible location to direct the worker to. Used when a worker arrives
 * at the directed location and finds it unusable.
 *
 * Flow: place Hold Both on the current location → delete current Reservation →
 * find the next empty location → set it to RESERVED → create new Reservation →
 * write two activity log entries (BLOCK_PUT and RESERVE).
 *
 * The hold reason code ("Blocked Put") lives only in the activity log per spec;
 * it is not stored as a column on the Location.
 *
 * @param req - HTTP request with URL param `reservationId`
 * @returns `{ blockedLocation: string; newReservationId: number; newDirectedLocation: string }`
 * @throws 400 INVALID_INPUT for non-numeric reservationId;
 *   404 NOT_FOUND if reservation does not exist;
 *   409 NO_LOCATIONS if no further eligible locations are available in the target aisle
 */
async function blockPut(req: HttpRequest, _ctx: InvocationContext): Promise<unknown> {
  const auth = await requireAuth(req);

  const reservationId = parseInt(req.params.reservationId ?? '', 10);
  if (isNaN(reservationId)) throw Object.assign(new Error('INVALID_INPUT'), { status: 400 });

  const reservation = await prisma.reservation.findUnique({ where: { id: reservationId } });
  if (!reservation) throw Object.assign(new Error('NOT_FOUND'), { status: 404 });

  const blockedLoc = locationString(
    reservation.locationAisle,
    reservation.locationBin,
    reservation.locationLevel,
  );

  // Place Hold Both on the blocked location and clear the reservation atomically. The
  // location was RESERVED (never actually stored), so it reverts to EMPTY or STAGED
  // (whichever findNextLocation actually found it as — see unassignPut's identical
  // comment); holdCategory is independent of status (see Location.holdCategory's schema
  // comment) — Phase 10 fixed this from `status: 'HOLD_BOTH'`, which clobbered
  // operational state.
  const blockedStatus = reservation.wasStaged === true ? 'STAGED' : 'EMPTY';

  await prisma.$transaction([
    prisma.location.update({
      where: { LocationID: { aisle: reservation.locationAisle, bin: reservation.locationBin, level: reservation.locationLevel } },
      data: { status: blockedStatus, holdCategory: 'HOLD_BOTH' },
    }),
    prisma.reservation.delete({ where: { id: reservationId } }),
  ]);

  await writeLog({
    userId: auth.zNumber,
    actionType: 'BLOCK_PUT',
    palletId: reservation.palletId,
    locationAisle: reservation.locationAisle,
    locationBin:   reservation.locationBin,
    locationLevel: reservation.locationLevel,
    details: { reservationId, reason: 'Blocked Put' },
  });

  // Re-resolve the same effective criteria the original directedPut search used — the
  // pallet's own inherited storageCode/size/zone haven't changed (it's still not
  // actually STORED anywhere new yet), so re-deriving from the Reservation's raw
  // targetSize/targetStorage/targetZone plus the pallet's current values reproduces the
  // exact same result directedPut computed originally.
  const palletForBlock = await prisma.pallet.findUniqueOrThrow({
    where: { pid: reservation.palletId },
    select: { size: true, storageCode: true, zone: true, itemRef: { select: { storageCode: true } } },
  });
  const effective = resolveEffectiveCriteria(
    { size: reservation.targetSize, storageCode: reservation.targetStorage, zone: reservation.targetZone },
    { ...palletForBlock, itemStorageCode: palletForBlock.itemRef.storageCode },
  );
  const nextLoc = await findNextLocation(reservation.targetAisle, effective.zone, {
    size:          effective.size,
    storageCode:   effective.storageCode,
    excludeStaged: reservation.consolidating,
  });

  if (!nextLoc) {
    throw Object.assign(new Error('NO_LOCATIONS'), { status: 409 });
  }

  // Reserve the new location.
  await prisma.location.update({
    where: { LocationID: { aisle: nextLoc.aisle, bin: nextLoc.bin, level: nextLoc.level } },
    data: { status: 'RESERVED' },
  });

  const newReservation = await prisma.reservation.create({
    data: {
      locationAisle:   nextLoc.aisle,
      locationBin:     nextLoc.bin,
      locationLevel:   nextLoc.level,
      palletId:        reservation.palletId,
      workerZ:         auth.zNumber,
      targetAisle:     reservation.targetAisle,
      targetSize:      reservation.targetSize,
      targetStorage:   reservation.targetStorage,
      targetZone:      reservation.targetZone,
      consolidating:   reservation.consolidating,
      pidWasScanned:   reservation.pidWasScanned,
      wasStaged:       nextLoc.wasStaged,
    },
  });

  await writeLog({
    userId: auth.zNumber,
    actionType: 'RESERVE',
    palletId: reservation.palletId,
    locationAisle: nextLoc.aisle,
    locationBin:   nextLoc.bin,
    locationLevel: nextLoc.level,
    details: { reservationId: newReservation.id, afterBlock: blockedLoc },
  });

  return {
    blockedLocation:    blockedLoc,
    newReservationId:   newReservation.id,
    newDirectedLocation: locationString(nextLoc.aisle, nextLoc.bin, nextLoc.level),
  };
}

// ── POST /api/puts/manual/scan ────────────────────────────────────────────────

/**
 * Logs a Manual Put pallet scan and runs the shared eligibility check.
 * The activity log write always happens first, regardless of outcome. This is intentional —
 * Manual Put is the override path (no reservation, no zone logic) and is more error-prone
 * than Directed Put, so every scan attempt is recorded even when eligibility fails.
 *
 * @param req - HTTP request with body `{ palletId: number | string }`
 * @returns `{ pallet: { id, dpci, descShort, quantity, currentLocation }; eligible: true }`
 * @throws 400 INVALID_INPUT for non-numeric palletId;
 *   404 PALLET_NOT_FOUND if pallet does not exist;
 *   409 NO_CARTONS if the pallet has no stored cartons
 */
async function manualScan(req: HttpRequest, _ctx: InvocationContext): Promise<unknown> {
  const auth = await requireAuth(req);

  const body = await req.json() as { palletId: number | string };
  const palletId = typeof body.palletId === 'string'
    ? parseInt(body.palletId, 10)
    : body.palletId;

  if (isNaN(palletId)) throw Object.assign(new Error('INVALID_INPUT'), { status: 400 });

  // Always log the scan first, before the eligibility check.
  await writeLog({
    userId: auth.zNumber,
    actionType: 'MNP_SCAN',
    palletId,
    details: { method: 'MNP' },
  });

  const elig = await checkPalletEligibility(palletId);

  const currentLocation = elig.currentLocation
    ? locationString(elig.currentLocation.aisle, elig.currentLocation.bin, elig.currentLocation.level)
    : null;

  return {
    pallet: {
      id:              elig.pallet.pid,
      dpci:            `${String(elig.pallet.dept).padStart(3,'0')}-${String(elig.pallet.class).padStart(2,'0')}-${String(elig.pallet.item).padStart(4,'0')}`,
      descShort:       elig.pallet.descShort,
      quantity: {
        pallets: elig.pallet.currentPallets,
        cartons: elig.pallet.currentCartons,
        ssps:    elig.pallet.currentSSPs,
      },
      currentLocation,
    },
    eligible: true,
  };
}

// ── POST /api/puts/manual/confirm ─────────────────────────────────────────────

/**
 * Completes a Manual Put by storing the pallet at the worker-chosen destination.
 * The worker supplies the destination Aisle+Bin (from a 6 or 8-digit barcode or numpad)
 * and the specific level they placed the pallet at (from the level-selection modal in the UI).
 *
 * If the destination location is already occupied (STORED status), the put still proceeds
 * but the response includes `destinationWasOccupied: true` so the UI can display a warning.
 * Likewise, landing on a STAGED location (committed by a GPMer via STG but not yet filled)
 * still proceeds — `destinationWasStaged: true` — and the location status simply moves on
 * to STORED, same as any other put. Per DevNotes/Screen-Specs/STG.md's "SDP and MNP
 * Interaction". This non-blocking behavior is intentional — MNP is an override path and the
 * worker has already physically placed the pallet; blocking would cause inconsistency.
 *
 * @param req - HTTP request with body:
 *   `{ palletId: number | string; destinationLocation: string; level: number }`
 * @returns `{ location, level, wasMove, clearedLocation, destinationWasOccupied, destinationWasStaged }`
 * @throws 400 INVALID_INPUT for non-numeric palletId, invalid barcode, or missing level;
 *   404 NOT_FOUND if the exact aisle+bin+level location record does not exist
 */
async function manualConfirm(req: HttpRequest, _ctx: InvocationContext): Promise<unknown> {
  const auth = await requireAuth(req);

  const body = await req.json() as {
    palletId: number | string;
    destinationLocation: string;
    level: number;
  };

  const palletId = typeof body.palletId === 'string'
    ? parseInt(body.palletId, 10)
    : body.palletId;

  if (isNaN(palletId) || !body.destinationLocation || body.level == null) {
    throw Object.assign(new Error('INVALID_INPUT'), { status: 400 });
  }

  // Parse the destination barcode to get aisle+bin, then combine with worker-selected level.
  const parsed = parseLocationBarcode(body.destinationLocation);
  if (!parsed) throw Object.assign(new Error('INVALID_INPUT'), { status: 400 });

  const destLocation = await prisma.location.findUnique({
    where: { LocationID: { aisle: parsed.aisle, bin: parsed.bin, level: body.level } },
  });
  if (!destLocation) throw Object.assign(new Error('NOT_FOUND'), { status: 404 });

  // Record whether the destination was already occupied or staged before the move.
  const destinationWasOccupied = destLocation.status === 'STORED';
  const destinationWasStaged   = destLocation.status === 'STAGED';

  const { wasMove, clearedLocation } = await placePallet(
    palletId,
    parsed.aisle,
    parsed.bin,
    body.level,
    auth.zNumber,
  );

  await writeLog({
    userId: auth.zNumber,
    actionType: 'PUT',
    palletId,
    locationAisle: parsed.aisle,
    locationBin:   parsed.bin,
    locationLevel: body.level,
    details: { wasMove, clearedLocation, destinationWasOccupied, destinationWasStaged, method: 'MNP' },
  });

  return {
    location: locationString(parsed.aisle, parsed.bin, body.level),
    level: body.level,
    wasMove,
    clearedLocation,
    destinationWasStaged,
    destinationWasOccupied,
  };
}

// ── Route registrations ───────────────────────────────────────────────────────

app.http('directedPut', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'puts/directed',
  handler: withHandler(directedPut),
});

app.http('confirmPut', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'puts/{reservationId:int}/confirm',
  handler: withHandler(confirmPut),
});

app.http('unassignPut', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'puts/{reservationId:int}/unassign',
  handler: withHandler(unassignPut),
});

app.http('blockPut', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'puts/{reservationId:int}/block',
  handler: withHandler(blockPut),
});

app.http('manualScan', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'puts/manual/scan',
  handler: withHandler(manualScan),
});

app.http('manualConfirm', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'puts/manual/confirm',
  handler: withHandler(manualConfirm),
});
