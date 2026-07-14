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
 * @param req - HTTP request with query params `status` ("unlocated" | "stored" | "no-cartons" |
 *   "canceled" | "pull-pending", default "stored") and optional `aisle` (number)
 * @returns `{ palletId: number }`
 * @throws 404 NOT_FOUND if no pallets match the requested status (and aisle's Storage Code/Size, if given)
 */
async function samplePallet(req: HttpRequest, _ctx: InvocationContext): Promise<unknown> {
  await requireAuth(req);

  const params = new URL(req.url).searchParams;
  const statusParam = params.get('status') ?? 'stored';
  const aisleParam = params.get('aisle');
  const aisle = aisleParam ? parseInt(aisleParam, 10) : null;

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
      ? { locationAisle: null, ...(aisleStorageCodes && { itemRef: { storageCode: { in: aisleStorageCodes } } }) }
    : statusParam === 'no-cartons' ? { currentCartons: { lte: 0 } }
    : statusParam === 'canceled' ? { status: 'CANCELED' }
    : statusParam === 'pull-pending'
      ? { labels: { some: { status: { notIn: ['PULLED', 'DIVERTED', 'CANCELED', 'PURGED'] } } } }
    : {
        locationAisle: { not: null },
        ...(aislePairs && { OR: aislePairs.map((p) => ({ storageCode: p.storageCode, size: p.size })) }),
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
 * Returns a random location ID for MNP's (and LII/WLH's) demo location buttons.
 * Query param `status` controls which locations are eligible:
 *   - "empty" (default) — returns an EMPTY location for the "Scan Empty Location" demo
 *   - "occupied" — returns a STORED location for the "Scan Occupied Location" demo
 *
 * `locationId` is a 6-digit zero-padded string (AAABBB format) since only aisle+bin is
 * needed to simulate a destination scan. `level` is also returned — it's the exact level
 * of the specific Location row this call happened to pick, needed by MNP to pre-fill its
 * Level Confirmation modal (a worker triggering the demo button has no way to know what
 * level the randomly-picked location actually is); other callers that don't need it just
 * ignore the extra field.
 *
 * @param req - HTTP request with query param `status` ("empty" | "occupied", default "empty")
 * @returns `{ locationId: string, level: number }` — locationId is a 6-digit zero-padded string
 * @throws 404 NOT_FOUND if no locations match the requested status
 */
async function sampleLocation(req: HttpRequest, _ctx: InvocationContext): Promise<unknown> {
  await requireAuth(req);

  const statusParam = new URL(req.url).searchParams.get('status') ?? 'empty';

  const where =
    statusParam === 'empty'
      ? { status: 'EMPTY' }
      : { status: 'STORED' };

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

app.http('sampleLocation', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'demo/location',
  handler: withHandler(sampleLocation),
});
