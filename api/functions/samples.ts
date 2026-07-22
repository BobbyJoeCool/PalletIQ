import { app } from '@azure/functions';
import type { HttpRequest, InvocationContext } from '@azure/functions';
import prisma from '../lib/prisma.js';
import { withHandler } from '../lib/response.js';
import { requireAuth } from '../lib/permissions.js';

/**
 * Returns a random label ID for the PIP screen's demo "Scan Label" buttons.
 * Optional `?fn=` query param filters to labels with a specific pull function code (CA/CF/FP).
 * Optional `?status=` query param filters to a specific label status (defaults to PRINTED,
 * the normal scannable state) — used by PIP's "Invalid status" demo buttons to fetch a
 * PULLED, CANCELED, or PURGED label so that error path can actually be exercised, since a
 * worker can't produce one of those by scanning normally.
 * Uses a random skip approach (count → random offset → findFirst) so every call may
 * return a different label without requiring an ORDER BY RANDOM on large tables.
 *
 * @param req - HTTP request with optional query params `fn` (pull function filter) and
 *   `status` (label status filter, default PRINTED)
 * @returns `{ labelId: string }`
 * @throws 404 NOT_FOUND if no labels exist matching the status (and fn, if given)
 */
async function sampleLabel(req: HttpRequest, _ctx: InvocationContext): Promise<unknown> {
  await requireAuth(req);

  const params = new URL(req.url).searchParams;
  const fn = params.get('fn') ?? undefined;
  const status = params.get('status') ?? 'PRINTED';
  const where = { status, ...(fn ? { pullFunction: fn } : {}) };

  const count = await prisma.label.count({ where });
  if (count === 0) throw Object.assign(new Error('NOT_FOUND'), { status: 404 });

  const skip = Math.floor(Math.random() * count);
  const label = await prisma.label.findFirst({ where, skip, select: { lid: true } });

  return { labelId: label!.lid };
}

/**
 * Returns a random pallet ID for the SDP and MNP screens' demo "Scan PID" buttons.
 * Query param `status` controls which pallets are eligible:
 *   - "unlocated" — returns a pallet with no current location (locationAisle is null)
 *   - "stored" (default) — returns a pallet that is currently stored in a location
 *   - "no-cartons" — returns a pallet with currentCartons <= 0 (SDP's "Pulled" invalid-
 *     pallet demo option — a fully-pulled pallet is exactly this case), so SDP's demo
 *     button can exercise checkPalletEligibility's NO_CARTONS path, which a worker can't
 *     otherwise reach by scanning normally
 *   - "canceled" — returns a pallet with `status = 'CANCELED'` (a voided/canceled
 *     receiving record), for checkPalletEligibility's CANCELED path
 *   - "pull-pending" — returns a pallet with an open (non-terminal) Label against it —
 *     same "still open" definition as editPallet's DPCI-change guard (`status notIn
 *     PULLED/DIVERTED/CANCELED/PURGED` — AVAILABLE already counts, doesn't need to have
 *     reached PRINTED) — for checkPalletEligibility's BLOCKED_BY_PENDING_PULL path
 *
 * Optional `aisle` query param additionally constrains "unlocated"/"stored" picks to
 * pallets that could actually be directed to that aisle — without this, a demo Put/Move
 * for a random pallet frequently doesn't match, correctly (but unhelpfully, for a demo
 * button) failing with NO_LOCATIONS once Directed Put's Storage Code/Size matching is
 * enforced (see resolveEffectiveCriteria):
 *   - "unlocated" pallets have no Storage Code/Size of their own yet (PUT_PENDING) — only
 *     Storage Code is ever enforced for them (via their Item's intrinsic one, the same
 *     fallback Directed Put itself uses), so only that's checked here; Size is never a
 *     constraint for a first-time put regardless of aisle.
 *   - "stored" pallets already have both inherited, and the real search exact-matches
 *     both — so this checks the pallet's own (Storage Code, Size) pair against every
 *     distinct pair actually present in the aisle, not just Storage Code alone (a size
 *     mismatch, e.g. an XS pallet from aisle 301 sent to standard-size aisle 305, fails
 *     Directed Put exactly the same way a Storage Code mismatch does).
 * The aisle's matchable (Storage Code, Size) pairs are drawn only from currently-eligible
 * locations — status EMPTY/STAGED, not contracted, not held in a way that blocks a put
 * (the exact same criteria findNextLocation itself applies) — not just any row that
 * happens to carry that Storage Code/Size somewhere in the aisle; a pair that only exists
 * on STORED/RESERVED/contracted/held rows has no real eligible location right now, so
 * matching a demo pallet to it would still dead-end on NO_LOCATIONS. Ignored for
 * "no-cartons" (that path is purely about exercising the error, not finding a matching
 * location).
 *
 * Optional `excludeStorageCode`/`excludeSize` query params (SDP's Size/Storage Code
 * override fields) exclude pallets that already naturally match the given value — a demo
 * Put/Move for a pallet that already has the same Storage Code/Size as the entered override
 * wouldn't visibly prove the override is doing anything. `excludeSize` only affects
 * "stored" (unlocated pallets have no Size of their own yet, per above).
 *
 * @param req - HTTP request with query params `status` ("unlocated" | "stored" | "no-cartons" |
 *   "canceled" | "pull-pending", default "stored"), optional `aisle` (number), and optional
 *   `excludeStorageCode`/`excludeSize`
 * @returns `{ palletId: number }`
 * @throws 404 NOT_FOUND if no pallets match the requested status (and aisle's Storage Code/Size, if given)
 */
async function samplePallet(req: HttpRequest, _ctx: InvocationContext): Promise<unknown> {
  await requireAuth(req);

  const params = new URL(req.url).searchParams;
  const statusParam = params.get('status') ?? 'stored';
  const aisleParam = params.get('aisle');
  const aisle = aisleParam ? parseInt(aisleParam, 10) : null;
  // Excludes a currently-entered Size/Storage Code override (SDP) from the pick — without
  // this, a demo Put/Move frequently lands on a pallet that already naturally matches the
  // override, so directing it doesn't visibly demonstrate the override actually changing
  // anything. Size has no effect for "unlocated" pallets below (they have no Size of their
  // own yet — see this function's own doc comment); only Storage Code applies there.
  const excludeStorageCode = params.get('excludeStorageCode') || undefined;
  const excludeSize = params.get('excludeSize') || undefined;

  let aislePairs: { storageCode: string; size: string }[] | null = null;
  if (aisle != null && !isNaN(aisle)) {
    // Mirrors findNextLocation's own eligibility criteria exactly (status EMPTY/STAGED,
    // not contracted, not held in a way that blocks a put) — a (Storage Code, Size) pair
    // that technically exists in the aisle but only on STORED/RESERVED/contracted/held
    // rows has zero actually-eligible locations right now, so matching on it would still
    // send a demo pallet into a NO_LOCATIONS dead end.
    aislePairs = await prisma.location.findMany({
      where: {
        aisle,
        status: { in: ['EMPTY', 'STAGED'] },
        contraction: false,
        OR: [{ holdCategory: null }, { holdCategory: 'HOLD_OUT' }],
      },
      select: { storageCode: true, size: true },
      distinct: ['storageCode', 'size'],
    });
  }
  const aisleStorageCodes = aislePairs ? [...new Set(aislePairs.map((p) => p.storageCode))] : null;

  const where =
    statusParam === 'unlocated'
      ? {
          locationAisle: null,
          ...((aisleStorageCodes || excludeStorageCode) && {
            itemRef: {
              storageCode: {
                ...(aisleStorageCodes && { in: aisleStorageCodes }),
                ...(excludeStorageCode && { not: excludeStorageCode }),
              },
            },
          }),
        }
    : statusParam === 'no-cartons' ? { currentCartons: { lte: 0 } }
    : statusParam === 'canceled' ? { status: 'CANCELED' }
    : statusParam === 'pull-pending'
      ? { labels: { some: { status: { notIn: ['PULLED', 'DIVERTED', 'CANCELED', 'PURGED'] } } } }
    : {
        locationAisle: { not: null },
        ...(aislePairs && { OR: aislePairs.map((p) => ({ storageCode: p.storageCode, size: p.size })) }),
        ...(excludeStorageCode && { storageCode: { not: excludeStorageCode } }),
        ...(excludeSize && { size: { not: excludeSize } }),
      };

  const count = await prisma.pallet.count({ where });
  if (count === 0) throw Object.assign(new Error('NOT_FOUND'), { status: 404 });

  const skip = Math.floor(Math.random() * count);
  const pallet = await prisma.pallet.findFirst({
    where,
    skip,
    select: { pid: true },
  });

  return { palletId: pallet!.pid };
}

/**
 * Returns a random pallet ID matching a literal `Pallet.status` value, for PII's "Find by
 * Status" demo button (v1.7.0, direct instruction) — a dedicated endpoint rather than
 * another `samplePallet` branch, since that function's own `status` query param already
 * means a set of scenario-driven filters (e.g. "stored" = has a location, "canceled" =
 * `status: 'CANCELED'`, "pull-pending" = derived from open Labels) rather than a literal
 * 1:1 match against every value of the `PalletStatus` union — reusing the same param name
 * for a different meaning here would collide. Every value of `PalletStatus` (see
 * `shared/index.ts`) is a valid `status` here: PUT_PENDING, STORED, CA_PULL_PEND,
 * FP_PULL_PEND, PULLED, CANCELED, CONSOLIDATED.
 *
 * @param req - HTTP request with required query param `status` (a literal `Pallet.status` value)
 * @returns `{ palletId: number }`
 * @throws 400 INVALID_INPUT if `status` is missing; 404 NOT_FOUND if no pallet has that status
 */
async function samplePalletByStatus(req: HttpRequest, _ctx: InvocationContext): Promise<unknown> {
  await requireAuth(req);

  const status = new URL(req.url).searchParams.get('status');
  if (!status) throw Object.assign(new Error('INVALID_INPUT'), { status: 400 });

  const count = await prisma.pallet.count({ where: { status } });
  if (count === 0) throw Object.assign(new Error('NOT_FOUND'), { status: 404 });

  const skip = Math.floor(Math.random() * count);
  const pallet = await prisma.pallet.findFirst({ where: { status }, skip, select: { pid: true } });

  return { palletId: pallet!.pid };
}

/**
 * Returns a random location ID for MNP's (and LII/WLH's) demo location buttons.
 * Query param `status` controls which locations are eligible:
 *   - "any" — a genuinely random location regardless of status/occupancy, for LII's
 *     "✓ Scan Location" button (a physical barcode scan could land on anything; the old
 *     default behavior below only ever surfaced EMPTY locations, which undersold what a
 *     real scan does)
 *   - "empty" (default) — returns an EMPTY location for the "Scan Empty Location" demo
 *   - "occupied" — returns a STORED location for the "Scan Occupied Location" demo
 *   - "staged" — returns a STAGED location (LII's status picker)
 *   - "reserved" — returns a RESERVED location (LII's status picker)
 *   - "pullPending" — returns a location whose occupant pallet is CA_PULL_PEND or
 *     FP_PULL_PEND (LII's status picker) — Pull Pending is a Pallet-only status (v1.6.9),
 *     not a Location.status value, so this queries via the `pallets` relation instead of
 *     a flat scalar match like every other branch below
 *   - "held" — returns any location with a non-null `holdCategory`, regardless of
 *     occupancy status (LII's status picker; same `where` shape as
 *     `getRandomHeldLocation` in locations.ts, but that endpoint is kept separate since
 *     it also serves WLH's own dedicated "Find Held Location" button)
 *   - "contracted" — returns any location with `contraction: true`, regardless of
 *     occupancy status, for MNP's "Scan Contraction" demo (exercises manualConfirm's
 *     contraction gate) and LII's status picker
 *   - "consolidate" — requires an additional `palletId` query param; finds a *different*
 *     pallet currently `STORED` with the same DPCI as `palletId` and returns its location,
 *     for MNP's "Scan Consolidate" demo (exercises manualConfirm's combine popup)
 *   - "multiOccupant" — returns a location with more than one occupant pallet (LII's
 *     status picker; issue #87 — MNP's v1.6.3 dual-occupancy "Proceed Anyway" override can
 *     produce these live, and ~20 are seeded explicitly — see `addMultiOccupancyPallets`
 *     in seed.ts). Grouped via `Pallet.groupBy` on the location key with a `having` count
 *     filter, since Prisma has no direct "related-record count" filter on `Location`'s own
 *     `where`.
 *
 * `locationId` is a 6-digit zero-padded string (AAABBB format) since only aisle+bin is
 * needed to simulate a destination scan. `level` is also returned — it's the exact level
 * of the specific Location row this call happened to pick, needed by MNP to pre-fill its
 * Level Confirmation modal (a worker triggering the demo button has no way to know what
 * level the randomly-picked location actually is); other callers that don't need it just
 * ignore the extra field.
 *
 *   - "wrongType" (v1.7.0, PAR's Location picker) — requires `storageCode`; returns an
 *     EMPTY location whose own Storage Code does *not* match it, to exercise PAR's
 *     Storage-Code-mismatch warn-then-allow flow on demand.
 *
 * Optional `storageCode` query param (v1.7.0) additionally scopes "empty"/"occupied"/
 * "held"/"contracted" to locations that actually carry that Storage Code — PAR's Location
 * picker passes the currently-resolved item's own Storage Code so every one of those
 * options is a genuinely valid put target storage-code-wise, not just occupancy-wise.
 * Ignored by every other caller (LII/MNP/WLH), which don't pass it.
 *
 * @param req - HTTP request with query param `status`
 *   ("any" | "empty" | "occupied" | "staged" | "reserved" | "pullPending" | "held" |
 *   "contracted" | "multiOccupant" | "consolidate" | "wrongType", default "empty"),
 *   optional `storageCode`, and, for "consolidate" only, a required `palletId` query param
 * @returns `{ locationId: string, level: number }` — locationId is a 6-digit zero-padded string
 * @throws 400 INVALID_INPUT if `status=consolidate` is missing/non-numeric `palletId`, or
 *   `status=wrongType` is missing `storageCode`;
 *   404 NOT_FOUND if no locations (or, for "consolidate", no source pallet / no same-DPCI
 *   STORED match) satisfy the request
 */
async function sampleLocation(req: HttpRequest, _ctx: InvocationContext): Promise<unknown> {
  await requireAuth(req);

  const params = new URL(req.url).searchParams;
  const statusParam = params.get('status') ?? 'empty';
  // PAR's Location picker (v1.7.0): scopes "empty"/"occupied"/"held"/"contracted" to
  // locations that actually match the given Storage Code, so every one of those options
  // is a genuinely valid put target storage-code-wise — plus the new "wrongType" status
  // below, which deliberately finds a mismatch to exercise the opposite case.
  const storageCode = params.get('storageCode') || undefined;

  if (statusParam === 'wrongType') {
    if (!storageCode) throw Object.assign(new Error('INVALID_INPUT'), { status: 400 });
    const where = { status: 'EMPTY', storageCode: { not: storageCode } };
    const count = await prisma.location.count({ where });
    if (count === 0) throw Object.assign(new Error('NOT_FOUND'), { status: 404 });

    const skip = Math.floor(Math.random() * count);
    const location = await prisma.location.findFirst({ where, skip, select: { aisle: true, bin: true, level: true } });
    if (!location) throw Object.assign(new Error('NOT_FOUND'), { status: 404 });

    const id = String(location.aisle).padStart(3, '0') + String(location.bin).padStart(3, '0');
    return { locationId: id, level: location.level };
  }

  if (statusParam === 'consolidate') {
    const palletIdParam = params.get('palletId');
    const palletId = palletIdParam ? parseInt(palletIdParam, 10) : NaN;
    if (isNaN(palletId)) throw Object.assign(new Error('INVALID_INPUT'), { status: 400 });

    const source = await prisma.pallet.findUnique({
      where: { pid: palletId },
      select: { dept: true, class: true, item: true },
    });
    if (!source) throw Object.assign(new Error('NOT_FOUND'), { status: 404 });

    const match = await prisma.pallet.findFirst({
      where: {
        dept: source.dept, class: source.class, item: source.item,
        status: 'STORED', pid: { not: palletId }, locationAisle: { not: null },
      },
      select: { locationAisle: true, locationBin: true, locationLevel: true },
    });
    if (!match) throw Object.assign(new Error('NOT_FOUND'), { status: 404 });

    const id = String(match.locationAisle).padStart(3, '0') + String(match.locationBin).padStart(3, '0');
    return { locationId: id, level: match.locationLevel };
  }

  if (statusParam === 'pullPending') {
    // Pull Pending (v1.6.9) is a Pallet-only status (CA_PULL_PEND/FP_PULL_PEND), not a
    // Location.status value — Location.status keeps its own independent, currently-unused
    // PULL_PENDING value by direct product decision. So this can't be a flat scalar
    // `where`; find a location via its occupant pallet's status instead.
    const where = { pallets: { some: { status: { in: ['CA_PULL_PEND', 'FP_PULL_PEND'] } } } };
    const count = await prisma.location.count({ where });
    if (count === 0) throw Object.assign(new Error('NOT_FOUND'), { status: 404 });

    const skip = Math.floor(Math.random() * count);
    const location = await prisma.location.findFirst({
      where, skip, select: { aisle: true, bin: true, level: true },
    });
    if (!location) throw Object.assign(new Error('NOT_FOUND'), { status: 404 });

    const id = String(location.aisle).padStart(3, '0') + String(location.bin).padStart(3, '0');
    return { locationId: id, level: location.level };
  }

  if (statusParam === 'any') {
    // No status/occupancy filter at all — a genuinely random location regardless of what
    // it currently is, for LII's "✓ Scan Location" button (issue: that button previously
    // relied on this endpoint's 'empty' default, which meant it only ever surfaced EMPTY
    // locations instead of "any real location," which is what a physical barcode scan
    // would actually land on).
    const count = await prisma.location.count();
    if (count === 0) throw Object.assign(new Error('NOT_FOUND'), { status: 404 });

    const skip = Math.floor(Math.random() * count);
    const location = await prisma.location.findFirst({ skip, select: { aisle: true, bin: true, level: true } });
    if (!location) throw Object.assign(new Error('NOT_FOUND'), { status: 404 });

    const id = String(location.aisle).padStart(3, '0') + String(location.bin).padStart(3, '0');
    return { locationId: id, level: location.level };
  }

  if (statusParam === 'multiOccupant') {
    // No direct "related-record count" filter exists on Location's own `where` — group
    // pallets by their location key instead and filter groups with more than one member.
    const groups = await prisma.pallet.groupBy({
      by: ['locationAisle', 'locationBin', 'locationLevel'],
      where: { locationAisle: { not: null } },
      _count: { pid: true },
      having: { pid: { _count: { gt: 1 } } },
    });
    if (groups.length === 0) throw Object.assign(new Error('NOT_FOUND'), { status: 404 });

    const pick = groups[Math.floor(Math.random() * groups.length)];
    const id = String(pick.locationAisle).padStart(3, '0') + String(pick.locationBin).padStart(3, '0');
    return { locationId: id, level: pick.locationLevel };
  }

  const where = {
    ...(statusParam === 'empty'       ? { status: 'EMPTY' }
      : statusParam === 'occupied'  ? { status: 'STORED' }
      : statusParam === 'staged'    ? { status: 'STAGED' }
      : statusParam === 'reserved'  ? { status: 'RESERVED' }
      : statusParam === 'held'      ? { holdCategory: { not: null } }
      : /* contracted */              { contraction: true }),
    ...(storageCode && { storageCode }),
  };

  const count = await prisma.location.count({ where });
  if (count === 0) throw Object.assign(new Error('NOT_FOUND'), { status: 404 });

  const skip = Math.floor(Math.random() * count);
  const location = await prisma.location.findFirst({
    where,
    skip,
    select: { aisle: true, bin: true, level: true },
  });

  if (!location) throw Object.assign(new Error('NOT_FOUND'), { status: 404 });

  const id = String(location.aisle).padStart(3, '0') + String(location.bin).padStart(3, '0');
  return { locationId: id, level: location.level };
}

app.http('sampleLabel', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'demo/label',
  handler: withHandler(sampleLabel),
});

app.http('samplePallet', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'demo/pallet',
  handler: withHandler(samplePallet),
});

app.http('samplePalletByStatus', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'demo/pallet-status',
  handler: withHandler(samplePalletByStatus),
});

app.http('sampleLocation', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'demo/location',
  handler: withHandler(sampleLocation),
});
