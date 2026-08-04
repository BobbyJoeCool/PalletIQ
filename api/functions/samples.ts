import { app } from '../lib/functionsRuntime.js';
import type { HttpRequest, InvocationContext } from '../lib/functionsRuntime.js';
import prisma from '../lib/prisma.js';
import { withHandler } from '../lib/response.js';
import { requireAuth } from '../lib/permissions.js';
import { TERMINAL_CONTAINER_STATUSES } from '../lib/eligibility.js';
import { NOT_HELD_FILTER } from '../lib/zoneLogic.js';

/**
 * Returns a random container ID for the PIP screen's demo "Scan Label" buttons.
 * Optional `?fn=` query param filters to containers with a specific pull function code (CA/CF/FP).
 * Optional `?status=` query param filters to a specific container status (defaults to PRINTED,
 * the normal scannable state) — used by PIP's "Invalid status" demo buttons to fetch a
 * PULLED, CANCELED, or PURGED container so that error path can actually be exercised, since a
 * worker can't produce one of those by scanning normally.
 * Uses a random skip approach (count → random offset → findFirst) so every call may
 * return a different container without requiring an ORDER BY RANDOM on large tables.
 *
 * @param req - HTTP request with optional query params `fn` (pull function filter) and
 *   `status` (container status filter, default PRINTED)
 * @returns `{ containerId: string }`
 * @throws 404 NOT_FOUND if no containers exist matching the status (and fn, if given)
 */
async function sampleContainer(req: HttpRequest, _ctx: InvocationContext): Promise<unknown> {
  await requireAuth(req);

  const params = new URL(req.url).searchParams;
  const fn = params.get('fn') ?? undefined;
  const status = params.get('status') ?? 'PRINTED';
  const where = { status, ...(fn ? { pullFunction: fn } : {}) };

  const count = await prisma.container.count({ where });
  if (count === 0) throw Object.assign(new Error('NOT_FOUND'), { status: 404 });

  const skip = Math.floor(Math.random() * count);
  const container = await prisma.container.findFirst({ where, skip, select: { cid: true } });

  return { containerId: container!.cid };
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
 *   - "pull-pending" — returns a pallet with an open (non-terminal) Container against it —
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
        ...NOT_HELD_FILTER,
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
      ? { containers: { some: { status: { notIn: TERMINAL_CONTAINER_STATUSES } } } }
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
 * `status: 'CANCELED'`, "pull-pending" = derived from open Containers) rather than a literal
 * 1:1 match against every value of the `PalletStatus` union — reusing the same param name
 * for a different meaning here would collide. Every value of `PalletStatus` (see
 * `shared/index.ts`) is a valid `status` here: PUT_PENDING, STORED, CA_PULL_PEND,
 * FP_PULL_PEND, PULLED, CANCELED, CONSOLIDATED.
 *
 * Optional `storageCode`/`size` query params (Feature 9, Demo Scanner Phase 1) additionally
 * narrow the pick to pallets carrying that exact Storage Code/Size — the by-status popup's
 * own filter dropdowns, both defaulting to "Any" (omitted) when unset.
 *
 * Optional `aisle` query param (direct instruction — SDP's own "Valid Pallet ID" button)
 * narrows the pick to pallets whose own (Storage Code, Size) pair matches one of the given
 * aisle's actually-eligible (EMPTY/STAGED, not contracted, not held-blocking) locations —
 * the exact same aisle-eligibility criteria `samplePallet`'s own `aisle` param already uses
 * (see that function's own doc comment), so a pallet returned this way is one Directed
 * Put's own matching logic would actually accept there, not just any pallet that happens to
 * carry a Storage Code the aisle has somewhere. Combines with `storageCode`/`size` via AND
 * if both are ever given, though in practice only one call site (SDP's aisle-aware "Valid
 * Pallet ID") passes `aisle`, and only the by-status popup's own Find passes
 * `storageCode`/`size` — the two aren't expected to combine.
 *
 * @param req - HTTP request with required query param `status` (a literal `Pallet.status`
 *   value) and optional `storageCode`/`size`/`aisle`
 * @returns `{ palletId: number }`
 * @throws 400 INVALID_INPUT if `status` is missing; 404 NOT_FOUND if no pallet matches
 */
async function samplePalletByStatus(req: HttpRequest, _ctx: InvocationContext): Promise<unknown> {
  await requireAuth(req);

  const params = new URL(req.url).searchParams;
  const status = params.get('status');
  if (!status) throw Object.assign(new Error('INVALID_INPUT'), { status: 400 });
  const storageCode = params.get('storageCode') || undefined;
  const size = params.get('size') || undefined;
  const aisleParam = params.get('aisle');
  const aisle = aisleParam ? parseInt(aisleParam, 10) : null;

  let aislePairs: { storageCode: string; size: string }[] | null = null;
  if (aisle != null && !isNaN(aisle)) {
    aislePairs = await prisma.location.findMany({
      where: {
        aisle,
        status: { in: ['EMPTY', 'STAGED'] },
        contraction: false,
        ...NOT_HELD_FILTER,
      },
      select: { storageCode: true, size: true },
      distinct: ['storageCode', 'size'],
    });
    if (aislePairs.length === 0) throw Object.assign(new Error('NOT_FOUND'), { status: 404 });
  }

  const where = {
    status,
    ...(storageCode && { storageCode }),
    ...(size && { size }),
    ...(aislePairs && { OR: aislePairs.map((p) => ({ storageCode: p.storageCode, size: p.size })) }),
  };

  const count = await prisma.pallet.count({ where });
  if (count === 0) throw Object.assign(new Error('NOT_FOUND'), { status: 404 });

  const skip = Math.floor(Math.random() * count);
  const pallet = await prisma.pallet.findFirst({ where, skip, select: { pid: true } });

  return { palletId: pallet!.pid };
}

/**
 * Returns a random location ID for the app-wide Location ID Demo Scanner (Feature 9, Phase
 * 2 — WLH/LII/MNP/PAR). Four independent axes plus real-column filters, matching the
 * design doc's Location ID section — replacing the old flat `status` enum (which
 * conflated occupancy/hold/contraction/multi-occupancy into one mutually-exclusive list).
 *
 *   - `status` — occupancy (mutually exclusive): "empty" | "stored" | "staged" |
 *     "reserved" | "pullPending". Omitted entirely = no occupancy filter (any status) —
 *     used by the Demo Scanner's unfiltered "✓ Valid Location" button; the Filter popup
 *     itself always sends one of the five (default "empty" client-side). "pullPending" is
 *     derived from the occupant pallet's own status (CA_PULL_PEND/FP_PULL_PEND) via the
 *     `pallets` relation, not a `Location.status` scalar — Pull Pending is a Pallet-only
 *     status (v1.6.9); `Location.status` keeps its own unused PULL_PENDING value by direct
 *     product decision.
 *   - `hold` — independent of status (`Location.holdCategory`): "not" (null) | "any_hold"
 *     (non-null) | "in" | "out" | "both" | "perm". Omitted = no hold filter (Any).
 *   - `contraction` — independent (`Location.contraction`): "yes" | "no". Omitted = Any.
 *   - `multiOccupant` — independent, derived the same way as the old flat status's
 *     "multiOccupant" branch (see below): "multi" (more than one occupant pallet) |
 *     "single" (0 or 1 occupant). Omitted = Any.
 *   - `storageCode` / `size` / `zone` / `aisle` / `level` — exact-match filters against the
 *     real Location columns, all optional, combine via AND with everything above.
 *
 * Two special, non-axis modes are checked first and short-circuit the rest — genuinely
 * different query shapes, not expressible as filter combinations:
 *   - `status=wrongType` (PAR's Location Demo Scanner only, v1.7.0) — requires
 *     `storageCode`; returns an EMPTY location whose own Storage Code does *not* match it,
 *     to exercise PAR's Storage-Code-mismatch warn-then-allow flow on demand.
 *   - `status=consolidate` (MNP's Location Demo Scanner only) — requires `palletId`; finds
 *     a *different* pallet currently `STORED` with the same DPCI and returns its location,
 *     to exercise manualConfirm's combine popup.
 *
 * `locationId` is a 6-digit zero-padded string (AAABBB format) since only aisle+bin is
 * needed to simulate a destination scan. `level` is also returned — the exact level of the
 * specific Location row this call happened to pick — needed by MNP to pre-fill its Level
 * Confirmation modal (a worker triggering the demo button has no way to know what level the
 * randomly-picked location actually is) and by every other caller to reconstruct a full
 * 8-digit id. `multiOccupantKeys` (multi/single) has no direct "related-record count"
 * filter on `Location`'s own `where` — grouped via `Pallet.groupBy` on the location key
 * with a `having` count filter, then matched/excluded by the resulting (aisle,bin,level)
 * tuples.
 *
 * @param req - HTTP request with optional query params `status`, `hold`, `contraction`,
 *   `multiOccupant`, `storageCode`, `size`, `zone`, `aisle`, `level`; or `status=wrongType`
 *   (requires `storageCode`) / `status=consolidate` (requires `palletId`)
 * @returns `{ locationId: string, level: number }` — locationId is a 6-digit zero-padded string
 * @throws 400 INVALID_INPUT if `status=consolidate` is missing/non-numeric `palletId`, or
 *   `status=wrongType` is missing `storageCode`;
 *   404 NOT_FOUND if no locations (or, for "consolidate", no source pallet / no same-DPCI
 *   STORED match; or, for `multiOccupant=multi`, no multi-occupant location exists at all)
 *   satisfy the request
 */
async function sampleLocation(req: HttpRequest, _ctx: InvocationContext): Promise<unknown> {
  await requireAuth(req);

  const params = new URL(req.url).searchParams;
  const statusParam = params.get('status') || undefined;
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

  // Independent Multi-Occupant axis — computed up front (rather than inline in `where`)
  // since it needs its own groupBy query, unlike every other axis below, which are plain
  // scalar/relational conditions on Location itself.
  const multiOccupant = params.get('multiOccupant') || undefined;
  let multiOccupantKeys: { aisle: number; bin: number; level: number }[] | null = null;
  if (multiOccupant === 'multi' || multiOccupant === 'single') {
    const groups = await prisma.pallet.groupBy({
      by: ['locationAisle', 'locationBin', 'locationLevel'],
      where: { locationAisle: { not: null } },
      _count: { pid: true },
      having: { pid: { _count: { gt: 1 } } },
    });
    multiOccupantKeys = groups
      .filter((g) => g.locationAisle != null && g.locationBin != null && g.locationLevel != null)
      .map((g) => ({ aisle: g.locationAisle!, bin: g.locationBin!, level: g.locationLevel! }));
    if (multiOccupant === 'multi' && multiOccupantKeys.length === 0) {
      throw Object.assign(new Error('NOT_FOUND'), { status: 404 });
    }
  }

  const size = params.get('size') || undefined;
  const zoneParam = params.get('zone');
  const zone = zoneParam ? parseInt(zoneParam, 10) : undefined;
  const aisleParam = params.get('aisle');
  const aisle = aisleParam ? parseInt(aisleParam, 10) : undefined;
  const levelParam = params.get('level');
  const level = levelParam ? parseInt(levelParam, 10) : undefined;
  const hold = params.get('hold') || undefined;
  const contraction = params.get('contraction') || undefined;

  const where = {
    ...(statusParam === 'empty'         ? { status: 'EMPTY' }
      : statusParam === 'stored'      ? { status: 'STORED' }
      : statusParam === 'staged'      ? { status: 'STAGED' }
      : statusParam === 'reserved'    ? { status: 'RESERVED' }
      : statusParam === 'pullPending' ? { pallets: { some: { status: { in: ['CA_PULL_PEND', 'FP_PULL_PEND'] } } } }
      : {}),
    ...(storageCode && { storageCode }),
    ...(size && { size }),
    ...(zone !== undefined && !isNaN(zone) && { zone }),
    ...(aisle !== undefined && !isNaN(aisle) && { aisle }),
    ...(level !== undefined && !isNaN(level) && { level }),
    ...(hold === 'not'        ? { holdCategory: null }
      : hold === 'any_hold' ? { holdCategory: { not: null } }
      : hold === 'in'       ? { holdCategory: 'HOLD_IN' }
      : hold === 'out'      ? { holdCategory: 'HOLD_OUT' }
      : hold === 'both'     ? { holdCategory: 'HOLD_BOTH' }
      : hold === 'perm'     ? { holdCategory: 'HOLD_PERM' }
      : {}),
    ...(contraction === 'yes' ? { contraction: true }
      : contraction === 'no' ? { contraction: false }
      : {}),
    ...(multiOccupant === 'multi'
        ? { OR: multiOccupantKeys!.map((k) => ({ aisle: k.aisle, bin: k.bin, level: k.level })) }
      : multiOccupant === 'single' && multiOccupantKeys!.length > 0
        ? { NOT: { OR: multiOccupantKeys!.map((k) => ({ aisle: k.aisle, bin: k.bin, level: k.level })) } }
      : {}),
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

app.http('sampleContainer', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'demo/container',
  handler: withHandler(sampleContainer),
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
