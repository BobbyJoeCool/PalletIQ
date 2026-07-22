import { app } from '@azure/functions';
import type { HttpRequest, InvocationContext } from '@azure/functions';
import prisma from '../lib/prisma.js';
import { withHandler } from '../lib/response.js';
import { requireAuth, requireRole } from '../lib/permissions.js';
import { writeLog } from '../lib/activityLog.js';
import { generateUniquePid } from '../lib/palletId.js';
import { parseFullLocationBarcode, formatLocationId } from '../lib/locationParser.js';

/**
 * Retrieves all fields of a pallet, including item UPC/description, current location,
 * and the full name + zNumber of the worker who received, put, and last-pulled it.
 *
 * @param req - HTTP request with URL param `id` (numeric pallet ID)
 * @returns Full pallet record including item UPC/description, quantities, status, location, and user stamps
 * @throws 400 INVALID_INPUT if id is not a number; 404 NOT_FOUND if pallet does not exist
 */
async function getPallet(req: HttpRequest, _ctx: InvocationContext): Promise<unknown> {
  await requireAuth(req);

  const pid = parseInt(req.params.id ?? '', 10);
  if (isNaN(pid)) throw Object.assign(new Error('INVALID_INPUT'), { status: 400 });

  const pallet = await prisma.pallet.findUnique({
    where: { pid },
    include: {
      itemRef: { select: { upc: true, requiresExpirationDate: true, descShort: true } },
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
    descShort: pallet.itemRef.descShort,
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
    const pending = await prisma.label.aggregate({
      where: { pid, status: { notIn: ['PULLED', 'DIVERTED', 'CANCELED', 'PURGED'] } },
      _sum: { quantity: true, sspQuantity: true },
    });
    const pendingCartons = pending._sum.quantity    ?? 0;
    const pendingSSPs    = pending._sum.sspQuantity ?? 0;

    // cartonsPerPallet (v1.6.11) replaces the old receivedCartons-as-proxy approximation
    // this check used previously.
    const totalCartons = newPallets * pallet.cartonsPerPallet + newCartons;
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

/** SSP must evenly divide VCP (vcp/ssp = SSPs-per-carton, an integer) — same rule
 *  editPallet enforces (v1.6.11 — PAR now validates this too instead of not at all). */
function validateVcpRatio(vcp: number, ssp: number): void {
  if (ssp <= 0 || vcp % ssp !== 0) {
    throw Object.assign(new Error('INVALID_VCP_SSP_RATIO'), { status: 400 });
  }
}

/** A row's own loose SSPs must stay below one full carton's worth (vcp/ssp) — a full
 *  carton's worth of loose SSPs should just be another carton. Same rule editPallet
 *  enforces on `currentSSPs`. */
function validateSspCap(vcp: number, ssp: number, looseSSPs: number): void {
  if (looseSSPs >= vcp / ssp) {
    throw Object.assign(new Error('SSPS_EXCEED_CARTON'), { status: 400 });
  }
}

/** Identical thresholds to editPallet's own Expiration Date rule (< 1 month blocked,
 *  1-3 months needs `confirmNearExpiration`, 3+ months or omitted is fine), plus a new
 *  requirement gate: blocks outright if the item flags `requiresExpirationDate` and no
 *  date was given at all (editPallet has no such gate — an edit's expirationDate is
 *  always optional regardless of the item, since PII only ever *prompts*, never blocks;
 *  PAR's creation-time gate is a deliberate, stricter departure from that, direct
 *  instruction for this redesign). */
function validateExpirationDate(
  raw: string | null | undefined, confirmNearExpiration: boolean | undefined, requiresExpirationDate: boolean,
): Date | null {
  if (raw == null) {
    if (requiresExpirationDate) throw Object.assign(new Error('EXPIRATION_REQUIRED'), { status: 400 });
    return null;
  }
  const parsed = new Date(raw);
  if (isNaN(parsed.getTime())) throw Object.assign(new Error('INVALID_INPUT'), { status: 400 });
  const oneMonthOut = new Date();
  oneMonthOut.setMonth(oneMonthOut.getMonth() + 1);
  const threeMonthsOut = new Date();
  threeMonthsOut.setMonth(threeMonthsOut.getMonth() + 3);
  if (parsed < oneMonthOut) throw Object.assign(new Error('EXPIRATION_TOO_SOON'), { status: 400 });
  if (parsed < threeMonthsOut && !confirmNearExpiration) {
    throw Object.assign(new Error('EXPIRATION_NEEDS_CONFIRM'), { status: 409 });
  }
  return parsed;
}

interface ReinstateRow { cartons: number; ssps: number; cartonsPerPallet: number }

/**
 * Creates one or more new pallet records from scratch for physical inventory with no
 * system record — PAR's v1.6.11 redesign (`DevNotes/DesignPrompts/Feature-7-PAR-Redesign.md`).
 * IM+ only. Resolves the item by DPCI or UPC, whichever is given. **Single** mode creates
 * exactly one row, optionally landing it at a location (must be EMPTY). **Multiple** mode
 * creates one row per full pallet plus one more for the partial (only if the partial has
 * any cartons/SSPs) — always PUT_PENDING, since Multiple mode can never target a location
 * (Bulk locations, where that would become possible, don't exist yet). Every created row
 * gets one `ActivityLog` entry each — never one entry summarizing a whole batch — since a
 * pid is always one row/one physical pallet, and Bulk locations should find the audit
 * trail already structured that way.
 *
 * @param req - HTTP request with body:
 *   `{ dpci?: string; upc?: string; vcp: number; ssp: number;
 *      expirationDate?: string | null; confirmNearExpiration?: boolean;
 *      mode: 'single' | 'multiple';
 *      cartons?: number; ssps?: number; locationId?: string | null; // single mode
 *      fullPallets?: number; cartonsPerPallet?: number;
 *      partialCartons?: number; partialSsps?: number }` // multiple mode
 *   Exactly one of `dpci`/`upc` must be given; `dpci` is a 9-digit value (dash-separated
 *   or concatenated); `locationId`, if given, is an 8-digit location barcode.
 * @returns `{ pallets: { palletId: number; cartons: number; ssps: number;
 *   cartonsPerPallet: number; status: 'PUT_PENDING' | 'STORED';
 *   locationId: string | null }[] }` — one entry per row created, in creation order
 *   (full pallets first, partial last, when Multiple mode created more than one)
 * @throws 400 INVALID_INPUT for missing/malformed/contradictory fields (including a
 *   `locationId` supplied in Multiple mode, or a Multiple-mode request with nothing to
 *   create — zero full pallets and an empty partial);
 *   400 INVALID_VCP_SSP_RATIO if SSP doesn't evenly divide VCP;
 *   400 SSPS_EXCEED_CARTON if a row's own loose SSPs reach a full carton's worth;
 *   400 EXPIRATION_TOO_SOON if the expiration date is under 1 month out;
 *   400 EXPIRATION_REQUIRED if the item requires one and none was given;
 *   403 FORBIDDEN if caller is below IM;
 *   404 DPCI_NOT_FOUND / UPC_NOT_FOUND if the item doesn't exist;
 *   404 LOCATION_NOT_FOUND if locationId doesn't resolve to a real location;
 *   409 LOCATION_NEEDS_CONFIRM if the location isn't EMPTY, or is on hold, or is
 *     contracted, and `confirmLocationStatus` wasn't set — the pallet is very likely
 *     physically sitting there already, so this is a warn-then-allow gate, not a hard
 *     reject (unlike a normal put) — the frontend already knows exactly which condition(s)
 *     apply from its own live location lookup, so this code alone is enough context;
 *   409 EXPIRATION_NEEDS_CONFIRM if the date is 1-3 months out and not yet confirmed
 */
async function reinstatePallet(req: HttpRequest): Promise<unknown> {
  const auth = await requireAuth(req);
  requireRole(auth, 'IM');

  const body = await req.json() as {
    dpci?: string; upc?: string;
    vcp?: number; ssp?: number;
    size?: string;
    expirationDate?: string | null;
    confirmNearExpiration?: boolean;
    mode?: 'single' | 'multiple';
    cartons?: number; ssps?: number; locationId?: string | null; confirmLocationStatus?: boolean;
    fullPallets?: number; cartonsPerPallet?: number;
    partialCartons?: number; partialSsps?: number;
  };

  if (body.vcp == null || body.ssp == null || (body.mode !== 'single' && body.mode !== 'multiple')) {
    throw Object.assign(new Error('INVALID_INPUT'), { status: 400 });
  }

  // Resolve the item by whichever identifier was given — DPCI is the anchor everywhere
  // else in the app (frontend never populates UPC back from a DPCI search, only the
  // reverse), but either one is enough to key the new row(s) off dept/class/item.
  let dept: number, cls: number, itm: number, requiresExpirationDate: boolean;
  if (body.dpci) {
    const digits = body.dpci.replace(/-/g, '');
    if (!/^\d{9}$/.test(digits)) throw Object.assign(new Error('INVALID_INPUT'), { status: 400 });
    dept = parseInt(digits.slice(0, 3), 10);
    cls  = parseInt(digits.slice(3, 5), 10);
    itm  = parseInt(digits.slice(5, 9), 10);
    const item = await prisma.item.findUnique({ where: { DPCI: { dept, class: cls, item: itm } } });
    if (!item) throw Object.assign(new Error('DPCI_NOT_FOUND'), { status: 404 });
    requiresExpirationDate = item.requiresExpirationDate;
  } else if (body.upc) {
    const item = await prisma.item.findUnique({ where: { upc: body.upc } });
    if (!item) throw Object.assign(new Error('UPC_NOT_FOUND'), { status: 404 });
    dept = item.dept; cls = item.class; itm = item.item;
    requiresExpirationDate = item.requiresExpirationDate;
  } else {
    throw Object.assign(new Error('INVALID_INPUT'), { status: 400 });
  }

  validateVcpRatio(body.vcp, body.ssp);
  const expirationDate = validateExpirationDate(body.expirationDate, body.confirmNearExpiration, requiresExpirationDate);

  // Build the list of rows to create, mode-specific.
  const rows: ReinstateRow[] = [];
  if (body.mode === 'single') {
    if (body.cartons == null || body.ssps == null || body.cartons < 0 || body.ssps < 0) {
      throw Object.assign(new Error('INVALID_INPUT'), { status: 400 });
    }
    validateSspCap(body.vcp, body.ssp, body.ssps);
    rows.push({ cartons: body.cartons, ssps: body.ssps, cartonsPerPallet: body.cartons + (body.ssps > 0 ? 1 : 0) });
  } else {
    if (body.locationId) throw Object.assign(new Error('INVALID_INPUT'), { status: 400 });
    const fullPallets = body.fullPallets ?? 0;
    const cartonsPerPalletIn = body.cartonsPerPallet ?? 0;
    const partialCartons = body.partialCartons ?? 0;
    const partialSsps = body.partialSsps ?? 0;
    if (fullPallets < 0 || cartonsPerPalletIn < 0 || partialCartons < 0 || partialSsps < 0) {
      throw Object.assign(new Error('INVALID_INPUT'), { status: 400 });
    }
    if (fullPallets > 0 && cartonsPerPalletIn <= 0) {
      throw Object.assign(new Error('INVALID_INPUT'), { status: 400 });
    }
    const hasPartial = partialCartons > 0 || partialSsps > 0;
    if (fullPallets === 0 && !hasPartial) {
      throw Object.assign(new Error('INVALID_INPUT'), { status: 400 });
    }
    for (let i = 0; i < fullPallets; i++) {
      rows.push({ cartons: cartonsPerPalletIn, ssps: 0, cartonsPerPallet: cartonsPerPalletIn });
    }
    if (hasPartial) {
      validateSspCap(body.vcp, body.ssp, partialSsps);
      rows.push({ cartons: partialCartons, ssps: partialSsps, cartonsPerPallet: partialCartons + (partialSsps > 0 ? 1 : 0) });
    }
  }

  // Location — Single mode only (Multiple mode already rejected a locationId above).
  let locationAisle: number | null = null;
  let locationBin: number | null = null;
  let locationLevel: number | null = null;
  let locationRow: { storageCode: string; size: string; zone: number } | null = null;
  // Only flip Location.status to STORED when it was actually EMPTY beforehand — an
  // override onto an already-occupied/staged/reserved location leaves Location's own row
  // completely untouched (see the warn-then-allow block below for why), so this only ever
  // needs to be true in the one case that already worked before this override existed.
  let locationWasEmpty = false;

  if (body.mode === 'single' && body.locationId) {
    const parsed = parseFullLocationBarcode(body.locationId);
    if (!parsed) throw Object.assign(new Error('INVALID_INPUT'), { status: 400 });

    const location = await prisma.location.findUnique({
      where: { LocationID: { aisle: parsed.aisle, bin: parsed.bin, level: parsed.level } },
    });
    if (!location) throw Object.assign(new Error('LOCATION_NOT_FOUND'), { status: 404 });

    // Warn-then-allow, not a hard reject (direct instruction, a deliberate departure from
    // a normal put's rules): the pallet being reinstated is very likely physically sitting
    // in this exact location already and needs to be assigned there regardless of its
    // current status/hold/contraction — occupied, on hold, and contracted all raise the
    // same confirmation gate. The frontend already knows exactly which condition(s) apply
    // from its own live `GET /api/locations/:id` lookup (used for the live validation as
    // the worker types), so this endpoint doesn't need to communicate specifics back —
    // `confirmLocationStatus: true` alone is enough once the frontend has already shown
    // the worker why.
    const needsConfirm = location.status !== 'EMPTY' || location.holdCategory != null || location.contraction;
    if (needsConfirm && !body.confirmLocationStatus) {
      throw Object.assign(new Error('LOCATION_NEEDS_CONFIRM'), { status: 409 });
    }

    locationAisle = parsed.aisle;
    locationBin   = parsed.bin;
    locationLevel = parsed.level;
    locationRow   = location;
    locationWasEmpty = location.status === 'EMPTY';
  }

  const now = new Date();
  const status = locationAisle != null ? 'STORED' : 'PUT_PENDING';

  // Reserve one pid per row up front — generateUniquePid checks the DB each call, so
  // sequential awaits (not Promise.all) avoid two rows in the same request colliding.
  const pids: number[] = [];
  for (let i = 0; i < rows.length; i++) pids.push(await generateUniquePid());

  const ops: Array<ReturnType<typeof prisma.pallet.create> | ReturnType<typeof prisma.location.update>> = rows.map((row, i) =>
    prisma.pallet.create({
      data: {
        pid: pids[i], dept, class: cls, item: itm,
        receivedPallets: 1, currentPallets: 1,
        receivedCartons: row.cartons, currentCartons: row.cartons,
        receivedSSPs: row.ssps, currentSSPs: row.ssps,
        cartonsPerPallet: row.cartonsPerPallet,
        vcp: body.vcp!, ssp: body.ssp!,
        status,
        locationAisle, locationBin, locationLevel,
        // Inherited from the reinstated location, same as any other put (placePallet) —
        // null (nothing to inherit) when reinstated without a location, i.e. PUT_PENDING.
        // Size falls back to the worker-entered `body.size` when no location was given —
        // unlike Storage Code, Item has no intrinsic Size to fall back on (see the Item
        // model's own comment), so without this a PUT_PENDING pallet would have nothing at
        // all for SDP's default location search to match on until its first put.
        storageCode: locationRow?.storageCode ?? null,
        size:        locationRow?.size ?? body.size ?? null,
        zone:        locationRow?.zone ?? null,
        receivedByZ: auth.zNumber,
        receivedAt:  now,
        putByZ: locationAisle != null ? auth.zNumber : null,
        putAt:  locationAisle != null ? now : null,
        // A PAR-reinstated pallet was never actually received through inbound — no real
        // PO/Appointment exists for it. Expiration Date, unlike those two, is now
        // worker-entered on this screen (v1.6.11) rather than permanently null.
        poNumber: null,
        apptNumber: null,
        expirationDate,
      },
    }),
  );
  if (locationAisle != null && locationWasEmpty) {
    ops.push(
      prisma.location.update({
        where: { LocationID: { aisle: locationAisle, bin: locationBin!, level: locationLevel! } },
        data: { status: 'STORED' },
      }),
    );
  }
  await prisma.$transaction(ops);

  for (let i = 0; i < rows.length; i++) {
    await writeLog({
      userId: auth.zNumber,
      actionType: 'REINSTATE',
      palletId: pids[i],
      locationAisle: locationAisle ?? undefined,
      locationBin:   locationBin ?? undefined,
      locationLevel: locationLevel ?? undefined,
      dept, class: cls, item: itm,
      details: {
        vcp: body.vcp, ssp: body.ssp, mode: body.mode,
        cartons: rows[i].cartons, ssps: rows[i].ssps, cartonsPerPallet: rows[i].cartonsPerPallet,
        expirationDate: expirationDate ? expirationDate.toISOString() : null, status,
        // Audit trail for the warn-then-allow location override, when it happened —
        // absent entirely for a normal EMPTY-location or no-location reinstate.
        ...(locationAisle != null && !locationWasEmpty ? { locationOverride: true } : {}),
      },
    });
  }

  return {
    pallets: rows.map((row, i) => ({
      palletId: pids[i],
      cartons: row.cartons,
      ssps: row.ssps,
      cartonsPerPallet: row.cartonsPerPallet,
      status,
      locationId: locationAisle != null ? formatLocationId(locationAisle, locationBin!, locationLevel!) : null,
    })),
  };
}

// ── GET /api/pallets/sample-reinstate ─────────────────────────────────────────

/**
 * Demo helper for PAR's DPCI/UPC picker options — returns a valid DPCI+UPC pair plus a
 * plausible VCP/SSP/Single-mode quantity set the worker can submit as-is for a valid
 * reinstate.
 *
 * @param requiresExpirationDate - Optional `?requiresExpirationDate=true|false` filter
 *   (v1.6.11, new) — lets PAR's demo picker deliberately land on an item that does or
 *   doesn't require an Expiration Date, instead of only ever getting a random one, so the
 *   worker can exercise the required-Expiration-Date gate on demand rather than re-rolling
 *   the plain "Valid" option until one happens to land.
 * @returns `{ dpci: string; upc: string; vcp: number; ssp: number; cartons: number; ssps: number }`
 * @throws 404 NOT_FOUND if no Item row matches (the table is empty, or the filter has no matches)
 */
async function sampleReinstate(req: HttpRequest): Promise<unknown> {
  await requireAuth(req);

  const requiresExpirationDateParam = new URL(req.url).searchParams.get('requiresExpirationDate');
  const where = requiresExpirationDateParam != null ? { requiresExpirationDate: requiresExpirationDateParam === 'true' } : {};

  const count = await prisma.item.count({ where });
  if (count === 0) throw Object.assign(new Error('NOT_FOUND'), { status: 404 });

  const skip = Math.floor(Math.random() * count);
  const item = await prisma.item.findFirst({ where, skip, select: { dept: true, class: true, item: true, upc: true } });

  return {
    dpci: `${String(item!.dept).padStart(3, '0')}-${String(item!.class).padStart(2, '0')}-${String(item!.item).padStart(4, '0')}`,
    upc: item!.upc,
    vcp: 12,
    ssp: 12,
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
