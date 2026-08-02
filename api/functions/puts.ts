import { app } from '@azure/functions';
import type { HttpRequest, InvocationContext } from '@azure/functions';
import prisma from '../lib/prisma.js';
import { withHandler } from '../lib/response.js';
import { requireAuth, hasMinRole, requireRole } from '../lib/permissions.js';
import { writeLog } from '../lib/activityLog.js';
import { checkPalletEligibility } from '../lib/eligibility.js';
import { findNextLocation, resolveEffectiveCriteria } from '../lib/zoneLogic.js';
import { parseLocationBarcode, formatLocationId as locationString } from '../lib/locationParser.js';
import { clearLocation, putComplete, reservePut, zeroPallet } from '../lib/logicGate.js';

/**
 * Atomically stores a pallet at a new location (PUT_COMPLETE, via the Logic Gate — #149).
 * Clears the pallet's previous location (if any, via CLEAR_LOCATION) then marks the new
 * location STORED and updates the pallet's location fields/status (PUT_COMPLETE) — two
 * separate Gate calls, not one combined transaction, since they're independently-owned
 * intents; the pallet can still never observably appear in two locations, since nothing
 * reads pallet/location state between them.
 *
 * Also copies the target location's Storage Code/Size/Zone onto the pallet itself
 * (`Pallet.storageCode`/`.size`/`.zone`, inside `putComplete`) — the pallet's own source of
 * truth for these, read by Directed Put's default location search when no IM+ override is
 * given (see directedPut below). Kept in sync here since this is the one place both SDP
 * (confirmPut) and MNP (manualConfirm) funnel through to actually complete a put.
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
  const pallet = await prisma.pallet.findUnique({
    where: { pid: palletId },
    select: { locationAisle: true, locationBin: true, locationLevel: true },
  });

  if (pallet?.locationAisle != null) {
    await clearLocation({
      aisle: pallet.locationAisle, bin: pallet.locationBin!, level: pallet.locationLevel!,
      excludePalletId: palletId,
    });
  }

  await putComplete({ palletId, aisle: newAisle, bin: newBin, level: newLevel, workerZ });

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
 * always wins when supplied. Otherwise, Size and Storage Code fall back to the pallet's own
 * inherited values (`Pallet.storageCode`/`.size` — set by placePallet from wherever the
 * pallet is currently STORED, or by receiving/reinstating if never yet stored — a pallet is
 * expected to always carry a real Storage Code/Size by the time it reaches here). Zone
 * falls back the same way (`Pallet.zone`), defaulting to 1 if the pallet has none — and
 * even then is only ever a *starting preference* for `findNextLocation`, which retries from
 * Zone 1 if nothing eligible exists at or above it. Size/Storage Code, by contrast, are
 * always hard exact-match filters (never omitted) — see `resolveEffectiveCriteria`'s own
 * doc comment for why a pallet that somehow still has no Size gets rejected outright
 * (`MISSING_SIZE`) rather than searched for unconstrained.
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
 *   404 PALLET_NOT_FOUND; 409 NO_CARTONS if pallet has no stored cartons; 409 MISSING_SIZE if
 *   the pallet has no Size and none was given (recoverable via a Size override);
 *   409 NO_LOCATIONS if no eligible locations
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

  // Reserve the location (RESERVE_PUT, via the Logic Gate — #149) and create the
  // Reservation record in the same call. Raw overrides only (null if none) on
  // targetSize/targetStorage/targetZone — confirmPut's log-write reads these to show
  // whether an IM+ override was actually used, so this must stay distinct from the
  // *effective* criteria (which also folds in the pallet's own inherited values — see
  // `effective` above). blockPut re-derives the same effective criteria itself from these
  // raw fields plus the pallet's current inherited values.
  const { reservationId } = await reservePut({
    aisle: loc.aisle, bin: loc.bin, level: loc.level,
    palletId: body.palletId, workerZ: auth.zNumber, targetAisle: body.aisle,
    targetSize: body.size ?? null, targetStorage: body.storageCode ?? null, targetZone: body.zone ?? null,
    consolidating: body.consolidating ?? false, wasScanned: body.wasScanned ?? null, wasStaged: loc.wasStaged,
  });

  await writeLog({
    userId: auth.zNumber,
    actionType: 'RESERVE',
    palletId: body.palletId,
    locationAisle: loc.aisle,
    locationBin:   loc.bin,
    locationLevel: loc.level,
    details: { reservationId, aisle: body.aisle },
  });

  const currentLocation = elig.currentLocation
    ? locationString(elig.currentLocation.aisle, elig.currentLocation.bin, elig.currentLocation.level)
    : null;

  return {
    reservationId,
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
 * Validates that the scanned location (Aisle+Bin) matches the reserved location, then
 * atomically claims the Reservation (deletes it first, before touching Location/Pallet
 * state — #93) and calls placePallet to complete the store. Claiming first, rather than
 * deleting after placePallet, closes the race against `unassignPut`/`blockPut`/the
 * expiry timer all acting on the same row: whichever of them deletes the row first wins
 * outright, and every loser gets a clean 404 instead of a chance to clobber the winner's
 * write.
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
 *   404 NOT_FOUND if reservation does not exist, or lost the claim race to a concurrent
 *   unassign/block/expiry-timer call on the same reservation
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

  // Atomically claim the reservation before touching Location/Pallet state (#93) —
  // deletes it now, rather than after placePallet, so a concurrent unassign/block/
  // expiry-timer call racing on the same row can never win after this point and clobber
  // the location this call is about to store into. deleteMany (not delete) so a lost
  // race returns a count of 0 instead of throwing — something else already claimed it.
  const claimed = await prisma.reservation.deleteMany({ where: { id: reservationId } });
  if (claimed.count === 0) throw Object.assign(new Error('NOT_FOUND'), { status: 404 });

  const { wasMove, clearedLocation } = await placePallet(
    reservation.palletId,
    reservation.locationAisle,
    reservation.locationBin,
    reservation.locationLevel,
    auth.zNumber,
  );

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
    // IRP: this is a Rack Put (System Directed Put) — MNP's own PUT write below is HP.
    functionCode: 'RP',
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
 * Atomically claims the Reservation (deletes it first, before touching Location state —
 * #93, same pattern as confirmPut) then releases the location via CLEAR_LOCATION (the
 * Logic Gate — #149), which resolves to STAGED if that's genuinely how findNextLocation
 * found it (mirrored from `wasStaged` onto the location's own `revertStatus` at reserve
 * time) or EMPTY otherwise — so the location is immediately available for other
 * puts/staging again, without silently erasing a GPMer's staging work.
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

  // Atomically claim the reservation before touching Location state (#93) — same pattern
  // as confirmPut: whichever of confirm/unassign/block/the expiry timer deletes this row
  // first wins; everyone else gets a clean 404 instead of racing a stale read into a write.
  const claimed = await prisma.reservation.deleteMany({ where: { id: reservationId } });
  if (claimed.count === 0) throw Object.assign(new Error('NOT_FOUND'), { status: 404 });

  const releasedStatus = await clearLocation({
    aisle: reservation.locationAisle, bin: reservation.locationBin, level: reservation.locationLevel,
  });

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
 * Flow: claim (delete) current Reservation → place Hold Both on the current location →
 * find the next empty location → set it to RESERVED → create new Reservation →
 * write two activity log entries (BLOCK_PUT and RESERVE). The claim runs first (#93) so
 * a concurrent confirm/unassign/expiry-timer call on the same reservation can't race in
 * after this location's already been touched.
 *
 * The hold reason code ("Blocked Put") lives only in the activity log per spec;
 * it is not stored as a column on the Location.
 *
 * @param req - HTTP request with URL param `reservationId`
 * @returns `{ blockedLocation: string; newReservationId: number; newDirectedLocation: string }`
 * @throws 400 INVALID_INPUT for non-numeric reservationId;
 *   404 NOT_FOUND if reservation does not exist;
 *   409 MISSING_SIZE if the pallet has no Size and none was given (see
 *   `resolveEffectiveCriteria`'s own doc comment — reachable here too, since this re-derives
 *   the same effective criteria the original directedPut search used);
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

  // Atomically claim the reservation before touching Location state (#93) — same pattern
  // as confirmPut/unassignPut: whichever of confirm/unassign/block/the expiry timer
  // deletes this row first wins; everyone else gets a clean 404 instead of racing a
  // stale read into a write.
  const claimed = await prisma.reservation.deleteMany({ where: { id: reservationId } });
  if (claimed.count === 0) throw Object.assign(new Error('NOT_FOUND'), { status: 404 });

  // Place Hold Both on the blocked location. The location was RESERVED (never actually
  // stored), so CLEAR_LOCATION (the Logic Gate — #149) reverts it to EMPTY or STAGED
  // (whichever findNextLocation actually found it as, mirrored onto revertStatus at
  // reserve time — see unassignPut's identical comment); holdCategory is written
  // separately, independent of status (see Location.holdCategory's schema comment) —
  // Phase 10 fixed this from `status: 'HOLD_BOTH'`, which clobbered operational state.
  await clearLocation({ aisle: reservation.locationAisle, bin: reservation.locationBin, level: reservation.locationLevel });

  await prisma.location.update({
    where: { LocationID: { aisle: reservation.locationAisle, bin: reservation.locationBin, level: reservation.locationLevel } },
    data: { holdCategory: 'HOLD_BOTH' },
  });

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

  // Reserve the new location (RESERVE_PUT, via the Logic Gate — #149).
  const { reservationId: newReservationId } = await reservePut({
    aisle: nextLoc.aisle, bin: nextLoc.bin, level: nextLoc.level,
    palletId: reservation.palletId, workerZ: auth.zNumber, targetAisle: reservation.targetAisle,
    targetSize: reservation.targetSize, targetStorage: reservation.targetStorage, targetZone: reservation.targetZone,
    consolidating: reservation.consolidating, wasScanned: reservation.pidWasScanned, wasStaged: nextLoc.wasStaged,
  });

  await writeLog({
    userId: auth.zNumber,
    actionType: 'RESERVE',
    palletId: reservation.palletId,
    locationAisle: nextLoc.aisle,
    locationBin:   nextLoc.bin,
    locationLevel: nextLoc.level,
    details: { reservationId: newReservationId, afterBlock: blockedLoc },
  });

  return {
    blockedLocation:    blockedLoc,
    newReservationId,
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

  // Always log the scan first, before the eligibility check — but only attribute the
  // entry to a real pallet. ActivityLog.palletId is a required FK, so logging a
  // nonexistent scanned id as-is 500s instead of surfacing checkPalletEligibility's
  // intended 404 (#83); a scan of an unknown id logs without palletId (still recording
  // the attempt, with the invalid id kept in details for the audit trail) instead of
  // dropping the log entry outright.
  const scannedPalletExists = await prisma.pallet.findUnique({ where: { pid: palletId }, select: { pid: true } });
  await writeLog({
    userId: auth.zNumber,
    actionType: 'MNP_SCAN',
    ...(scannedPalletExists && { palletId }),
    details: { method: 'MNP', ...(!scannedPalletExists && { scannedId: palletId }) },
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
 * Four gates run, in order, before the pallet is actually placed — each can require a
 * resubmission with an extra acknowledgement/resolution field, the same "throw then
 * resubmit" shape PIP's LEVEL_MISMATCH uses:
 *
 * 1. **Contraction** (`Location.contraction`): a Worker is hard-blocked (403 CONTRACTED,
 *    no override). IM+ gets 409 CONTRACTION_CONFIRM_REQUIRED until resubmitted with
 *    `acknowledgeContraction: true`.
 * 2. **Hold** (`Location.holdCategory`, #92): `HOLD_OUT` never blocks (outbound-only,
 *    matches `zoneLogic.ts`'s `NOT_HELD_FILTER`). `HOLD_IN`/`HOLD_BOTH` use the same
 *    override pattern as Contraction — Worker hard-blocked (403 DESTINATION_ON_HOLD),
 *    IM+ gets 409 HOLD_CONFIRM_REQUIRED (with `{ holdCategory }`) until resubmitted with
 *    `acknowledgeHold: true`. `HOLD_PERM` is a harder, no-override block (403
 *    DESTINATION_HOLD_PERM) for every role, per product decision — matching how
 *    `HOLD_REMOVE_MIN_ROLE` already treats Permanent as the most protected tier.
 * 3. **Occupied/staged**: if the destination is STORED or STAGED, the put is blocked
 *    (409 DESTINATION_OCCUPIED, with `{ occupantPalletId, occupantDpci, matchesDpci,
 *    wasStaged }`) until resubmitted with `resolution: 'proceed'` or `'consolidate'`.
 *    `resolution: 'proceed'` is rejected (re-thrown) when `matchesDpci` is true — a
 *    same-DPCI occupant must be resolved via consolidate, not a plain override.
 * 4. **Consolidate** (`resolution: 'consolidate'`, IM+ only): merges the incoming
 *    pallet's current quantities onto the STORED occupant of the same DPCI, then zeroes
 *    and clears the incoming pallet's own location fields and marks it `CONSOLIDATED`
 *    instead of moving it into the destination. If the incoming pallet had its own prior
 *    location, that location is freed to `EMPTY`, same as a normal move.
 *
 * `resolution: 'proceed'` on a DPCI mismatch (or a STAGED destination) falls through to
 * the normal placePallet path unchanged — the previous occupant's own Pallet record is
 * left untouched, same as today's behavior.
 *
 * @param req - HTTP request with body:
 *   `{ palletId: number | string; destinationLocation: string; level: number;
 *      acknowledgeContraction?: boolean; acknowledgeHold?: boolean;
 *      resolution?: 'proceed' | 'consolidate' }`
 * @returns Normal put: `{ location, level, wasMove, clearedLocation, destinationWasOccupied, destinationWasStaged }`.
 *   Consolidate: `{ consolidated: true, targetPalletId, sourcePalletId, location }`.
 * @throws 400 INVALID_INPUT for non-numeric palletId, invalid barcode, or missing level;
 *   403 CONTRACTED if a Worker targets a contracted location;
 *   403 DESTINATION_ON_HOLD if a Worker targets a Hold In/Both location;
 *   403 DESTINATION_HOLD_PERM if any role targets a Hold Permanent location (no override);
 *   403 FORBIDDEN if a non-IM+ user submits `resolution: 'consolidate'`;
 *   404 NOT_FOUND if the exact aisle+bin+level location record does not exist;
 *   409 CONTRACTION_CONFIRM_REQUIRED / HOLD_CONFIRM_REQUIRED / DESTINATION_OCCUPIED — see above;
 *   409 CONSOLIDATE_MISMATCH if the destination's occupant no longer matches DPCI (stale resubmission)
 */
async function manualConfirm(req: HttpRequest, _ctx: InvocationContext): Promise<unknown> {
  const auth = await requireAuth(req);

  const body = await req.json() as {
    palletId: number | string;
    destinationLocation: string;
    level: number;
    acknowledgeContraction?: boolean;
    acknowledgeHold?: boolean;
    resolution?: 'proceed' | 'consolidate';
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

  const [pallet, destLocation] = await Promise.all([
    prisma.pallet.findUniqueOrThrow({ where: { pid: palletId } }),
    prisma.location.findUnique({
      where: { LocationID: { aisle: parsed.aisle, bin: parsed.bin, level: body.level } },
    }),
  ]);
  if (!destLocation) throw Object.assign(new Error('NOT_FOUND'), { status: 404 });

  // Contraction gate — blocks all puts to a contracted location; Worker cannot override,
  // IM+ can after explicit acknowledgement.
  if (destLocation.contraction) {
    if (!hasMinRole(auth.role, 'IM')) {
      throw Object.assign(new Error('CONTRACTED'), { status: 403 });
    }
    if (!body.acknowledgeContraction) {
      throw Object.assign(new Error('CONTRACTION_CONFIRM_REQUIRED'), { status: 409 });
    }
  }

  // Hold gate (#92) — mirrors findNextLocation's NOT_HELD_FILTER (zoneLogic.ts): HOLD_OUT
  // never blocks a put (outbound-only). HOLD_IN/HOLD_BOTH use the same override pattern as
  // Contraction above (Worker hard-blocked, IM+ can proceed after explicit acknowledgement).
  // HOLD_PERM is a harder, no-override block for every role — matching how
  // HOLD_REMOVE_MIN_ROLE already treats Permanent as the most protected hold tier
  // elsewhere in the app (locations.ts) — per product decision, unlike Contraction there's
  // no acknowledgement path that lets even an IM+ worker put onto a Hold Permanent location.
  if (destLocation.holdCategory === 'HOLD_PERM') {
    throw Object.assign(new Error('DESTINATION_HOLD_PERM'), { status: 403 });
  }
  if (destLocation.holdCategory === 'HOLD_IN' || destLocation.holdCategory === 'HOLD_BOTH') {
    if (!hasMinRole(auth.role, 'IM')) {
      throw Object.assign(new Error('DESTINATION_ON_HOLD'), { status: 403 });
    }
    if (!body.acknowledgeHold) {
      throw Object.assign(new Error('HOLD_CONFIRM_REQUIRED'), {
        status: 409,
        data: { holdCategory: destLocation.holdCategory },
      });
    }
  }

  // Record whether the destination was already occupied or staged before the move.
  const destinationWasOccupied = destLocation.status === 'STORED';
  const destinationWasStaged   = destLocation.status === 'STAGED';

  if (destinationWasOccupied || destinationWasStaged) {
    // The occupant is looked up fresh on every call (never trusted from the client) and
    // excludes the incoming pallet's own pid — a pallet re-put onto its own current spot
    // isn't "occupied by something else" and falls through to the normal placePallet path.
    const occupant = destinationWasOccupied
      ? await prisma.pallet.findFirst({
          where: {
            locationAisle: parsed.aisle, locationBin: parsed.bin, locationLevel: body.level,
            status: 'STORED', pid: { not: pallet.pid },
          },
        })
      : null;
    const matchesDpci = occupant != null
      && occupant.dept === pallet.dept && occupant.class === pallet.class && occupant.item === pallet.item;

    // No resolution yet, or a same-DPCI occupant with a plain "proceed" — same-DPCI must
    // go through consolidate instead, so this re-throws to send the worker back to the
    // combine popup rather than allowing a silent duplicate-stock override.
    if (!body.resolution || (body.resolution === 'proceed' && matchesDpci)) {
      throw Object.assign(new Error('DESTINATION_OCCUPIED'), {
        status: 409,
        data: {
          occupantPalletId: occupant?.pid ?? null,
          occupantDpci: occupant
            ? `${String(occupant.dept).padStart(3,'0')}-${String(occupant.class).padStart(2,'0')}-${String(occupant.item).padStart(4,'0')}`
            : null,
          matchesDpci,
          wasStaged: destinationWasStaged,
        },
      });
    }

    if (body.resolution === 'consolidate') {
      requireRole(auth, 'IM');
      if (!occupant || !matchesDpci) {
        throw Object.assign(new Error('CONSOLIDATE_MISMATCH'), { status: 409 });
      }

      // The occupant's quantity merge is a plain, direct write — not a status change, so
      // it's outside the Logic Gate's own scope (#149 owns Location/Pallet *status*
      // transitions, not arbitrary field updates). Note this is no longer in the same
      // transaction as the zeroPallet call below (previously all three writes here were
      // one combined transaction) — a narrow, deliberate tradeoff: zeroPallet owns its own
      // transaction internally (shared by every other ZERO_PALLET caller), and threading
      // an external transaction through the Gate's API for this one call site's benefit
      // wasn't worth the added complexity for a race that requires two concurrent
      // consolidate attempts on the exact same two pallets to ever matter.
      await prisma.pallet.update({
        where: { pid: occupant.pid },
        data: {
          currentCartons: occupant.currentCartons + pallet.currentCartons,
          currentPallets: occupant.currentPallets + pallet.currentPallets,
          currentSSPs:    occupant.currentSSPs + pallet.currentSSPs,
        },
      });

      // ZERO_PALLET (Logic Gate — #149): marks the incoming pallet CONSOLIDATED and frees
      // its own prior location, if it had one (same dual-occupancy fallback to STORED
      // instead of EMPTY, #86, as placePallet's own old-location clear).
      await zeroPallet(
        pallet.pid,
        'CONSOLIDATED',
        pallet.locationAisle != null
          ? { aisle: pallet.locationAisle, bin: pallet.locationBin!, level: pallet.locationLevel! }
          : null,
      );

      await writeLog({
        userId: auth.zNumber,
        actionType: 'CONSOLID',
        palletId: pallet.pid,
        locationAisle: parsed.aisle,
        locationBin:   parsed.bin,
        locationLevel: body.level,
        functionCode: 'CON',
        details: {
          targetPalletId: occupant.pid,
          sourcePalletId: pallet.pid,
          cartons: pallet.currentCartons,
          pallets: pallet.currentPallets,
          ssps:    pallet.currentSSPs,
          method:  'MNP',
          wasContracted: destLocation.contraction,
        },
      });

      return {
        consolidated:   true,
        targetPalletId: occupant.pid,
        sourcePalletId: pallet.pid,
        location:       locationString(parsed.aisle, parsed.bin, body.level),
      };
    }
    // else: resolution === 'proceed' on a DPCI mismatch (or a STAGED destination) —
    // falls through to the normal placePallet path below unchanged.
  }

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
    // IRP: this is a Hand Put (Manual Put) — SDP's own PUT write above is RP.
    functionCode: 'HP',
    details: {
      wasMove, clearedLocation, destinationWasOccupied, destinationWasStaged, method: 'MNP',
      wasContracted: destLocation.contraction,
    },
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

// ── POST /api/puts/manual/cancel ──────────────────────────────────────────────

/**
 * Logs that a Manual Put scan was abandoned without completing — the worker cleared it,
 * navigated away from MNP, or an idle timeout forced a logout, all while a pallet was
 * scanned but not yet confirmed at a destination. MNP has no server-side reservation row
 * (unlike SDP's Reserved-location flow) — the scanned-but-unconfirmed state is purely
 * client-side, so there's nothing for a background job to discover and expire; this is a
 * client-triggered, best-effort call instead. `MNP_SCAN` (written by manualScan) already
 * durably recorded the scan itself; this closes that out with a visible outcome rather
 * than leaving it looking perpetually in-progress in the activity log.
 *
 * Unlike `MNP_SCAN` and `RES_TMOUT`, this actionType is deliberately **not** hidden from
 * the worker-facing Activity Log (see `HIDDEN_ACTION_TYPES` in `src/lib/activityFormat.ts`)
 * — the point is to leave a visible audit trail of the abandonment, not just a DB row.
 *
 * @param req - HTTP request with body `{ palletId: number | string; stage: 'pallet_scanned' | 'level_modal'; destinationLocation?: string }`
 * @returns `{ logged: true }`
 * @throws 400 INVALID_INPUT for non-numeric palletId or missing/invalid stage
 */
async function manualCancel(req: HttpRequest, _ctx: InvocationContext): Promise<unknown> {
  const auth = await requireAuth(req);

  const body = await req.json() as {
    palletId: number | string;
    stage: 'pallet_scanned' | 'level_modal';
    destinationLocation?: string;
  };

  const palletId = typeof body.palletId === 'string'
    ? parseInt(body.palletId, 10)
    : body.palletId;

  if (isNaN(palletId) || (body.stage !== 'pallet_scanned' && body.stage !== 'level_modal')) {
    throw Object.assign(new Error('INVALID_INPUT'), { status: 400 });
  }

  await writeLog({
    userId: auth.zNumber,
    actionType: 'MNP_CANCEL',
    palletId,
    details: {
      method: 'MNP',
      stage: body.stage,
      ...(body.destinationLocation && { destinationLocation: body.destinationLocation }),
    },
  });

  return { logged: true };
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

app.http('manualCancel', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'puts/manual/cancel',
  handler: withHandler(manualCancel),
});
