import { app } from '@azure/functions';
import type { HttpRequest, InvocationContext } from '@azure/functions';
import prisma from '../lib/prisma.js';
import { withHandler } from '../lib/response.js';
import { requireAuth, requireRole } from '../lib/permissions.js';
import { writeLog } from '../lib/activityLog.js';
import { generateUniquePid } from '../lib/palletId.js';
import { parseFullLocationBarcode, formatLocationId } from '../lib/locationParser.js';

/**
 * Retrieves all fields of a pallet, including item UPC, current location,
 * and the full name + zNumber of the worker who received, put, and last-pulled it.
 *
 * @param req - HTTP request with URL param `id` (numeric pallet ID)
 * @returns Full pallet record including item UPC, quantities, status, location, and user stamps
 * @throws 400 INVALID_INPUT if id is not a number; 404 NOT_FOUND if pallet does not exist
 */
async function getPallet(req: HttpRequest, _ctx: InvocationContext): Promise<unknown> {
  await requireAuth(req);

  const pid = parseInt(req.params.id ?? '', 10);
  if (isNaN(pid)) throw Object.assign(new Error('INVALID_INPUT'), { status: 400 });

  const pallet = await prisma.pallet.findUnique({
    where: { pid },
    include: {
      itemRef: { select: { upc: true, requiresExpirationDate: true } },
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
    poNumber: pallet.poNumber,
    apptNumber: pallet.apptNumber,
    expirationDate: pallet.expirationDate,
    // Not a pallet column — surfaced from the item so PII can show an unmet-requirement
    // prompt when this is true and expirationDate is still null.
    requiresExpirationDate: pallet.itemRef.requiresExpirationDate,
  };
}

/**
 * Updates one or more editable fields on a pallet. Requires IM+ role.
 *
 * DPCI change rules:
 *   - Blocked if any open (non-terminal) labels exist for this pallet, since those labels
 *     are keyed to the old DPCI and would become inconsistent.
 *   - The new DPCI must exist in the Item table.
 *   - When allowed, the DPCI update cascades to all labels for this pallet in one transaction.
 *
 * Quantity edit rules:
 *   - Quantities cannot go negative.
 *   - Total effective cartons (pallets × cartons-per-pallet + loose cartons) must not fall
 *     below the total committed to pending pull labels; same check for SSPs.
 *   - SSP must evenly divide VCP (`INVALID_VCP_SSP_RATIO` otherwise) — both are
 *     item-quantities (VCP = items/carton, SSP = items/store-ship-unit), and `vcp/ssp` is
 *     the resulting SSPs-per-carton count.
 *   - The pallet's loose `currentSSPs` must stay below one full carton's worth
 *     (`vcp/ssp`) — `SSPS_EXCEED_CARTON` otherwise; a full carton's worth of loose SSPs
 *     should just be another carton. Both checks re-run on every save regardless of which
 *     fields actually changed, using whichever of vcp/ssp/currentSSPs is in the request
 *     body (falling back to the pallet's current value), so a save can never leave the
 *     pallet in an inconsistent state.
 *
 * Expiration Date edit rules (poNumber/apptNumber are never editable from this endpoint):
 *   - A newly-set date less than 1 month out is rejected outright (`EXPIRATION_TOO_SOON`).
 *   - A date between 1 and 3 months out requires `confirmNearExpiration: true` in the same
 *     request (`EXPIRATION_NEEDS_CONFIRM` otherwise) — the frontend shows a warning and
 *     resends with that flag once the worker confirms.
 *   - A date 3+ months out, or clearing the date (`null`), needs no confirmation.
 *
 * @param req - HTTP request with URL param `id` and optional body fields:
 *   `dpci`, `vcp`, `ssp`, `currentPallets`, `currentCartons`, `currentSSPs`, `expirationDate`
 *   (ISO date string, or `null` to clear), `confirmNearExpiration`, `reasonCode`
 *   (`reasonCode` is required whenever at least one editable field actually changes value;
 *   like hold reason codes, it is never stored as a column — only logged, per the
 *   ActivityLog's flexible details field)
 * @returns `{ pid }` confirming the updated pallet ID
 * @throws 400 INVALID_INPUT for non-numeric id, negative quantities, an unparseable
 *   `expirationDate`, or a missing reason code when a field actually changed;
 *   400 EXPIRATION_TOO_SOON if the new expiration date is less than 1 month out;
 *   400 INVALID_VCP_SSP_RATIO if SSP doesn't evenly divide VCP;
 *   400 SSPS_EXCEED_CARTON if currentSSPs is at or above one full carton's worth (vcp/ssp);
 *   403 FORBIDDEN if caller is not IM+;
 *   404 NOT_FOUND if pallet or new DPCI does not exist;
 *   409 BLOCKED_BY_PENDING_PULL if open labels block a DPCI change;
 *   409 INSUFFICIENT_QUANTITY if new quantities are below pending pull commitments;
 *   409 EXPIRATION_NEEDS_CONFIRM if the new date is 1-3 months out and not yet confirmed
 */
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
    // `undefined` = not being edited; `null` = clear the date; an ISO date string = set it.
    expirationDate?: string | null;
    // Required to actually commit an expirationDate that falls inside the 1-3 month
    // warning window (see validation below) — the frontend re-sends the same request with
    // this set to true after the worker confirms the warning popup.
    confirmNearExpiration?: boolean;
    reasonCode?: string;
  };

  const pallet = await prisma.pallet.findUnique({ where: { pid } });
  if (!pallet) throw Object.assign(new Error('NOT_FOUND'), { status: 404 });

  // Expiration Date validation (direct product requirement): a newly-set date must be at
  // least 1 month out (else blocked outright), and a date inside the 1-3 month window needs
  // an explicit confirm step — a date being *cleared* (null) or unchanged is never gated.
  let newExpirationDate: Date | null | undefined; // undefined = not touched this request
  if (body.expirationDate !== undefined) {
    if (body.expirationDate === null) {
      newExpirationDate = null;
    } else {
      const parsed = new Date(body.expirationDate);
      if (isNaN(parsed.getTime())) throw Object.assign(new Error('INVALID_INPUT'), { status: 400 });
      const oneMonthOut = new Date();
      oneMonthOut.setMonth(oneMonthOut.getMonth() + 1);
      const threeMonthsOut = new Date();
      threeMonthsOut.setMonth(threeMonthsOut.getMonth() + 3);
      if (parsed < oneMonthOut) {
        throw Object.assign(new Error('EXPIRATION_TOO_SOON'), { status: 400 });
      }
      if (parsed < threeMonthsOut && !body.confirmNearExpiration) {
        throw Object.assign(new Error('EXPIRATION_NEEDS_CONFIRM'), { status: 409 });
      }
      newExpirationDate = parsed;
    }
  }

  // Validate non-negative quantities up front.
  const newPallets  = body.currentPallets  ?? pallet.currentPallets;
  const newCartons  = body.currentCartons  ?? pallet.currentCartons;
  const newSSPs     = body.currentSSPs     ?? pallet.currentSSPs;
  if (newPallets < 0 || newCartons < 0 || newSSPs < 0) {
    throw Object.assign(new Error('INVALID_INPUT'), { status: 400 });
  }

  // VCP/SSP relationship (both are item-quantities, not counts of units-of-units — VCP is
  // items per carton, SSP is items per store-ship unit; see Documentation/outline.md's
  // Pallet field descriptions). SSP must evenly divide VCP (vcp/ssp = SSPs-per-carton, an
  // integer), and the pallet's own loose currentSSPs must stay below one full carton's
  // worth (vcp/ssp) — a full carton's worth of loose SSPs should just be another carton.
  // Re-validated on every save (using whichever of vcp/ssp/currentSSPs actually changed,
  // falling back to the pallet's existing value otherwise) rather than only when those
  // specific fields change, so an edit never leaves the pallet in an inconsistent state.
  const newVcp = body.vcp ?? pallet.vcp;
  const newSsp = body.ssp ?? pallet.ssp;
  if (newSsp <= 0 || newVcp % newSsp !== 0) {
    throw Object.assign(new Error('INVALID_VCP_SSP_RATIO'), { status: 400 });
  }
  if (newSSPs >= newVcp / newSsp) {
    throw Object.assign(new Error('SSPS_EXCEED_CARTON'), { status: 400 });
  }

  // Determine whether the DPCI is actually changing (all three components must match).
  const dpciChanging =
    body.dpci != null &&
    (body.dpci.dept !== pallet.dept ||
     body.dpci.class !== pallet.class ||
     body.dpci.item !== pallet.item);

  if (dpciChanging) {
    // Block the DPCI change if any labels are still open (not terminal).
    const pendingCount = await prisma.label.count({
      where: { pid, status: { notIn: ['PULLED', 'DIVERTED', 'CANCELED', 'PURGED'] } },
    });
    if (pendingCount > 0) {
      throw Object.assign(new Error('BLOCKED_BY_PENDING_PULL'), { status: 409 });
    }
    // Confirm the new DPCI exists in the Item catalogue.
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
    // Sum up quantities already committed to open labels so we can enforce a floor.
    // Uses receivedCartons as a cartonsPerPallet proxy (production would use a dedicated field).
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

  const oldExpirationTime = pallet.expirationDate?.getTime() ?? null;
  const newExpirationTime = newExpirationDate === undefined ? undefined : (newExpirationDate?.getTime() ?? null);
  const expirationChanging = newExpirationTime !== undefined && newExpirationTime !== oldExpirationTime;

  // A reason code is required whenever the edit actually changes something — same rule as
  // location holds (WLH.md); never stored as a column, only logged (see writeLog call below).
  const hasAnyChange =
    dpciChanging ||
    (body.vcp            != null && body.vcp            !== pallet.vcp) ||
    (body.ssp             != null && body.ssp            !== pallet.ssp) ||
    (body.currentPallets != null && body.currentPallets !== pallet.currentPallets) ||
    (body.currentCartons != null && body.currentCartons !== pallet.currentCartons) ||
    (body.currentSSPs    != null && body.currentSSPs    !== pallet.currentSSPs) ||
    expirationChanging;
  const reasonCode = typeof body.reasonCode === 'string' ? body.reasonCode.trim() : '';
  if (hasAnyChange && !reasonCode) {
    throw Object.assign(new Error('INVALID_INPUT'), { status: 400 });
  }

  // Build the update payload from only the fields that were provided.
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
  if (expirationChanging) updateData['expirationDate'] = newExpirationDate;

  if (dpciChanging) {
    // Cascade the DPCI change to all labels in the same transaction.
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

  // Build a before/after diff for the activity log; only write if something actually changed.
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
  if (expirationChanging) {
    oldVals['expirationDate'] = pallet.expirationDate;
    newVals['expirationDate'] = newExpirationDate;
  }

  if (Object.keys(oldVals).length > 0) {
    await writeLog({
      userId: auth.zNumber,
      actionType: 'EDIT_PAL',
      palletId: pid,
      locationAisle: pallet.locationAisle ?? undefined,
      locationBin:   pallet.locationBin ?? undefined,
      locationLevel: pallet.locationLevel ?? undefined,
      details: { old: oldVals, new: newVals, reasonCode },
    });
  }

  return { pid };
}

// ── POST /api/pallets/reinstate ───────────────────────────────────────────────

/**
 * Creates a new pallet record from scratch for a pallet that exists physically but has
 * no system record. IM+ only. Sets status to PUT_PENDING (no location) or STORED (with
 * a location) — a provided location must be EMPTY; staged, reserved, and occupied
 * locations are all rejected. See DevNotes/Screen-Specs/PAR.md.
 *
 * @param req - HTTP request with body:
 *   `{ dpci: string; vcp: number; ssp: number; pallets: number; cartons: number;
 *      ssps: number; locationId?: string | null }` — dpci is a 9-digit value
 *   (dash-separated or concatenated); locationId, if given, is an 8-digit location barcode
 * @returns `{ palletId: number; status: 'PUT_PENDING' | 'STORED'; locationId: string | null }`
 * @throws 400 INVALID_INPUT for missing/malformed fields;
 *   403 FORBIDDEN if caller is below IM;
 *   404 DPCI_NOT_FOUND if the DPCI doesn't exist in the Item catalogue;
 *   404 LOCATION_NOT_FOUND if locationId doesn't resolve to a real location;
 *   409 LOCATION_NOT_EMPTY if the location exists but isn't EMPTY
 */
async function reinstatePallet(req: HttpRequest): Promise<unknown> {
  const auth = await requireAuth(req);
  requireRole(auth, 'IM');

  const body = await req.json() as {
    dpci: string;
    vcp: number;
    ssp: number;
    pallets: number;
    cartons: number;
    ssps: number;
    locationId?: string | null;
  };

  const digits = (body.dpci ?? '').replace(/-/g, '');
  if (
    !/^\d{9}$/.test(digits) ||
    body.vcp == null || body.ssp == null ||
    body.pallets == null || body.cartons == null || body.ssps == null ||
    body.pallets < 0 || body.cartons < 0 || body.ssps < 0
  ) {
    throw Object.assign(new Error('INVALID_INPUT'), { status: 400 });
  }

  const dept = parseInt(digits.slice(0, 3), 10);
  const cls  = parseInt(digits.slice(3, 5), 10);
  const itm  = parseInt(digits.slice(5, 9), 10);

  const item = await prisma.item.findUnique({ where: { DPCI: { dept, class: cls, item: itm } } });
  if (!item) throw Object.assign(new Error('DPCI_NOT_FOUND'), { status: 404 });

  let locationAisle: number | null = null;
  let locationBin: number | null = null;
  let locationLevel: number | null = null;
  let locationRow: { storageCode: string; size: string; zone: number } | null = null;

  if (body.locationId) {
    const parsed = parseFullLocationBarcode(body.locationId);
    if (!parsed) throw Object.assign(new Error('INVALID_INPUT'), { status: 400 });

    const location = await prisma.location.findUnique({
      where: { LocationID: { aisle: parsed.aisle, bin: parsed.bin, level: parsed.level } },
    });
    if (!location) throw Object.assign(new Error('LOCATION_NOT_FOUND'), { status: 404 });
    // PAR.md's contract wants the location's current status in the error body
    // ({ error: "LOCATION_NOT_EMPTY", status: "..." }), but withHandler's error envelope
    // (api/lib/response.ts) only ever returns { error: code } — no room for extra fields
    // without changing shared infra other endpoints depend on. The frontend shows a
    // generic "not empty" message instead of the specific blocking status.
    if (location.status !== 'EMPTY') {
      throw Object.assign(new Error('LOCATION_NOT_EMPTY'), { status: 409 });
    }

    locationAisle = parsed.aisle;
    locationBin   = parsed.bin;
    locationLevel = parsed.level;
    locationRow   = location;
  }

  const pid = await generateUniquePid();
  const now = new Date();
  const status = locationAisle != null ? 'STORED' : 'PUT_PENDING';

  const ops: Array<ReturnType<typeof prisma.pallet.create> | ReturnType<typeof prisma.location.update>> = [
    prisma.pallet.create({
      data: {
        pid, dept, class: cls, item: itm,
        receivedPallets: body.pallets, currentPallets: body.pallets,
        receivedCartons: body.cartons, currentCartons: body.cartons,
        receivedSSPs:    body.ssps,    currentSSPs:    body.ssps,
        vcp: body.vcp, ssp: body.ssp,
        status,
        locationAisle, locationBin, locationLevel,
        // Inherited from the reinstated location, same as any other put (placePallet) —
        // null (nothing to inherit) when reinstated without a location, i.e. PUT_PENDING.
        storageCode: locationRow?.storageCode ?? null,
        size:        locationRow?.size ?? null,
        zone:        locationRow?.zone ?? null,
        receivedByZ: auth.zNumber,
        receivedAt:  now,
        putByZ: locationAisle != null ? auth.zNumber : null,
        putAt:  locationAisle != null ? now : null,
        // A PAR-reinstated pallet was never actually received through inbound — no real PO/
        // Appointment exists for it, and no expiration date is known yet either.
        poNumber: null,
        apptNumber: null,
        expirationDate: null,
      },
    }),
  ];
  if (locationAisle != null) {
    ops.push(
      prisma.location.update({
        where: { LocationID: { aisle: locationAisle, bin: locationBin!, level: locationLevel! } },
        data: { status: 'STORED' },
      }),
    );
  }
  await prisma.$transaction(ops);

  await writeLog({
    userId: auth.zNumber,
    actionType: 'REINSTATE',
    palletId: pid,
    locationAisle: locationAisle ?? undefined,
    locationBin:   locationBin ?? undefined,
    locationLevel: locationLevel ?? undefined,
    dept, class: cls, item: itm,
    details: { vcp: body.vcp, ssp: body.ssp, pallets: body.pallets, cartons: body.cartons, ssps: body.ssps, status },
  });

  return {
    palletId: pid,
    status,
    locationId: locationAisle != null ? formatLocationId(locationAisle, locationBin!, locationLevel!) : null,
  };
}

// ── GET /api/pallets/sample-reinstate ─────────────────────────────────────────

/**
 * Demo helper for PAR's fill buttons — returns a valid DPCI plus a plausible
 * VCP/SSP/quantity set the worker can submit as-is for a valid reinstate.
 *
 * @returns `{ dpci: string; vcp: number; ssp: number; pallets: number; cartons: number; ssps: number }`
 * @throws 404 NOT_FOUND if the Item table is empty
 */
async function sampleReinstate(req: HttpRequest): Promise<unknown> {
  await requireAuth(req);

  const count = await prisma.item.count();
  if (count === 0) throw Object.assign(new Error('NOT_FOUND'), { status: 404 });

  const skip = Math.floor(Math.random() * count);
  const item = await prisma.item.findFirst({ skip, select: { dept: true, class: true, item: true } });

  return {
    dpci: `${String(item!.dept).padStart(3, '0')}-${String(item!.class).padStart(2, '0')}-${String(item!.item).padStart(4, '0')}`,
    vcp: 12,
    ssp: 12,
    pallets: 1,
    cartons: 12,
    ssps: 0,
  };
}

app.http('getPallet', {
  methods: ['GET'],
  authLevel: 'anonymous',
  // {id:int} (not the unconstrained {id}) so this doesn't greedily swallow the literal
  // pallets/reinstate and pallets/sample-reinstate routes below — pallet IDs are always
  // numeric (see generateUniquePid), so this is a non-breaking constraint.
  route: 'pallets/{id:int}',
  handler: withHandler(getPallet),
});

app.http('editPallet', {
  methods: ['PATCH'],
  authLevel: 'anonymous',
  route: 'pallets/{id:int}',
  handler: withHandler(editPallet),
});

app.http('reinstatePallet', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'pallets/reinstate',
  handler: withHandler(reinstatePallet),
});

app.http('sampleReinstate', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'pallets/sample-reinstate',
  handler: withHandler(sampleReinstate),
});
