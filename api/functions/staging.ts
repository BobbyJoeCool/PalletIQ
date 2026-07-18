import { app } from '@azure/functions';
import type { HttpRequest } from '@azure/functions';
import prisma from '../lib/prisma.js';
import { withHandler } from '../lib/response.js';
import { requireAuth, requireRole } from '../lib/permissions.js';
import { writeLog } from '../lib/activityLog.js';
import { parseFullLocationBarcode, formatLocationId } from '../lib/locationParser.js';
import { findNextStagingLocation } from '../lib/stagingLogic.js';

/** Throws 404 NOT_FOUND unless at least one Location row exists for the given aisle. */
async function requireAisleExists(aisle: number): Promise<void> {
  const exists = await prisma.location.findFirst({ where: { aisle } });
  if (!exists) throw Object.assign(new Error('NOT_FOUND'), { status: 404 });
}

// ── POST /api/staging/stage ────────────────────────────────────────────────────

/**
 * Marks a GPMer's chosen set of destination locations as STAGED. Each location is
 * re-validated as still EMPTY and non-contracted at write time (the client's list may
 * be stale if another worker staged into the same aisle in the meantime) — locations
 * that no longer qualify are silently skipped and counted in `shortfall` rather than
 * failing the whole request, since a partial stage is still useful progress.
 *
 * @param req - HTTP request with body `{ aisle, storageCode, size, locationIds: string[] }`
 *   where each locationId is an 8-digit aisle+bin+level string
 * @returns `{ staged: string[]; shortfall: number; nextLocation: string | null }`
 * @throws 400 INVALID_INPUT for missing fields or a malformed locationId;
 *   404 NOT_FOUND if the aisle has no location records
 */
async function stageLocations(req: HttpRequest): Promise<unknown> {
  const auth = await requireAuth(req);

  const body = await req.json() as {
    aisle: number;
    storageCode: string;
    size: string;
    locationIds: string[];
  };

  if (!body.aisle || !body.storageCode || !body.size || !Array.isArray(body.locationIds) || body.locationIds.length === 0) {
    throw Object.assign(new Error('INVALID_INPUT'), { status: 400 });
  }

  await requireAisleExists(body.aisle);

  const parsed = body.locationIds.map(parseFullLocationBarcode);
  if (parsed.some((p) => p === null)) {
    throw Object.assign(new Error('INVALID_INPUT'), { status: 400 });
  }

  // One log entry per successfully staged location (not one combined entry for the
  // whole action) so its locationAisle/Bin/Level columns are queryable per-location —
  // SAR's "Staged Longest" column needs to find, for each currently STAGED location,
  // when it was staged; a single aisle-level entry with the location list buried in
  // `details` can't answer that without re-parsing every STAGE log row's JSON.
  const staged: string[] = [];
  let last: { bin: number; level: number } | undefined;
  for (const loc of parsed) {
    const { aisle, bin, level } = loc!;
    const result = await prisma.location.updateMany({
      where: { aisle, bin, level, status: 'EMPTY', contraction: false },
      data: { status: 'STAGED' },
    });
    if (result.count > 0) {
      staged.push(formatLocationId(aisle, bin, level));
      last = { bin, level };
      await writeLog({
        userId: auth.zNumber,
        actionType: 'STAGE',
        locationAisle: aisle,
        locationBin: bin,
        locationLevel: level,
        details: { storageCode: body.storageCode, size: body.size },
      });
    }
  }

  const shortfall = body.locationIds.length - staged.length;

  // One combined summary entry for the overlay, separate from the per-location STAGE
  // entries above (those stay untouched — reporting.ts's "Staged Longest" column needs
  // them). Distinct actionType so it can't collide with that per-location STAGE query.
  if (staged.length > 0) {
    await writeLog({
      userId: auth.zNumber,
      actionType: 'STAGE_SUM',
      locationAisle: body.aisle,
      details: { storageCode: body.storageCode, size: body.size, count: staged.length },
    });
  }

  const next = await findNextStagingLocation(body.aisle, {
    storageCode: body.storageCode,
    size: body.size,
    afterBin: last?.bin,
    afterLevel: last?.level,
  });

  return {
    staged,
    shortfall,
    nextLocation: next ? formatLocationId(next.aisle, next.bin, next.level) : null,
  };
}

// ── GET /api/staging/staged-types ──────────────────────────────────────────────

/**
 * Returns every freight type (StorageCode+Size) *present* in an aisle — EMPTY, STAGED, or
 * STORED (occupied) — each with its current STAGED count and EMPTY count, the row set and
 * `max` value for STG's per-type Unstage/Restage panel (DevNotes/DesignPrompts/Feature-1-
 * STG-Per-Freight-Type-Unstage-Restage.md; broadened beyond STAGED-only per STG#07 —
 * `DevNotes/Fixes/STG/07-unstage-aisle-show-all-freight-types.md` — so a worker can correct
 * staging even when nothing is systematically staged yet but pallets physically exist).
 * STORED locations only make a type appear as a row; they never count toward `staged`,
 * `empty`, or `max` (unaffected by restage, which only ever clears STAGED and fills EMPTY).
 * This is the only caller of this endpoint (`UnstageModal` in `STGPage.tsx`), so its
 * contract was safe to broaden in place rather than adding a new one. Sorted by StorageCode
 * then Size for a stable row order across repeated fetches (the frontend maps a fixed set
 * of numpad field instances onto row indices).
 *
 * @param req - HTTP request with query param `aisle`
 * @returns `{ storageCode: string; size: string; staged: number; empty: number; max: number }[]`
 * @throws 400 INVALID_INPUT if `aisle` is missing/non-numeric
 */
async function getStagedTypes(req: HttpRequest): Promise<unknown> {
  await requireAuth(req);

  const params = new URL(req.url).searchParams;
  const aisleParam = params.get('aisle');
  if (!aisleParam) throw Object.assign(new Error('INVALID_INPUT'), { status: 400 });
  const aisle = parseInt(aisleParam, 10);
  if (isNaN(aisle)) throw Object.assign(new Error('INVALID_INPUT'), { status: 400 });

  const [stagedRows, emptyRows, storedRows] = await Promise.all([
    prisma.location.groupBy({
      by: ['storageCode', 'size'],
      where: { aisle, status: 'STAGED' },
      _count: { _all: true },
    }),
    prisma.location.groupBy({
      by: ['storageCode', 'size'],
      where: { aisle, status: 'EMPTY' },
      _count: { _all: true },
    }),
    prisma.location.groupBy({
      by: ['storageCode', 'size'],
      where: { aisle, status: 'STORED' },
      _count: { _all: true },
    }),
  ]);

  const stagedByType = new Map(stagedRows.map((r) => [`${r.storageCode}-${r.size}`, r._count._all]));
  const emptyByType = new Map(emptyRows.map((r) => [`${r.storageCode}-${r.size}`, r._count._all]));
  const typesPresent = new Map(
    [...stagedRows, ...emptyRows, ...storedRows].map((r) => [`${r.storageCode}-${r.size}`, { storageCode: r.storageCode, size: r.size }]),
  );

  return [...typesPresent.values()]
    .map(({ storageCode, size }) => {
      const key = `${storageCode}-${size}`;
      const staged = stagedByType.get(key) ?? 0;
      const empty = emptyByType.get(key) ?? 0;
      return { storageCode, size, staged, empty, max: empty + staged };
    })
    .sort((a, b) => a.storageCode.localeCompare(b.storageCode) || a.size.localeCompare(b.size));
}

// ── POST /api/staging/restage ──────────────────────────────────────────────────

interface RestageTypeResult { storageCode: string; size: string; cleared: number; staged: number; shortfall: number }

/**
 * Per-freight-type unstage/restage in one action, replacing the old all-or-nothing
 * `{ aisle, count }` contract entirely (DevNotes/DesignPrompts/Feature-1-STG-Per-
 * Freight-Type-Unstage-Restage.md). For each entry in `types`, clears every currently-
 * STAGED location of that exact StorageCode+Size in the aisle back to EMPTY, then stages
 * the first `quantity` EMPTY locations of that same type using the normal back-to-front
 * selection logic. A type simply absent from `types` is left completely untouched — not
 * cleared, not restaged (the frontend only ever sends the rows the worker left active).
 *
 * @param req - HTTP request with body `{ aisle: number; types: { storageCode: string; size: string; quantity: number }[] }`
 * @returns `{ results: { storageCode: string; size: string; cleared: number; staged: number; shortfall: number }[] }`
 * @throws 400 INVALID_INPUT for missing/malformed fields;
 *   403 FORBIDDEN if caller is below IM;
 *   404 NOT_FOUND if the aisle has no location records
 */
async function restageAisle(req: HttpRequest): Promise<unknown> {
  const auth = await requireAuth(req);
  requireRole(auth, 'IM');

  const body = await req.json() as {
    aisle: number;
    types: { storageCode: string; size: string; quantity: number }[];
  };
  if (!body.aisle || !Array.isArray(body.types) || body.types.some((t) => !t.storageCode || !t.size || t.quantity == null || t.quantity < 0)) {
    throw Object.assign(new Error('INVALID_INPUT'), { status: 400 });
  }

  await requireAisleExists(body.aisle);

  const results: RestageTypeResult[] = [];

  for (const type of body.types) {
    const cleared = await prisma.location.updateMany({
      where: { aisle: body.aisle, status: 'STAGED', storageCode: type.storageCode, size: type.size },
      data: { status: 'EMPTY' },
    });

    let staged = 0;
    let cursor: { bin: number; level: number } | undefined;

    // Per-location STAGE entries here too (see stageLocations' comment above) — a
    // restaged location's "staged since" moment is this restage, not whenever it was
    // last staged before being cleared.
    for (let i = 0; i < type.quantity; i++) {
      const next = await findNextStagingLocation(body.aisle, {
        storageCode: type.storageCode,
        size: type.size,
        afterBin: cursor?.bin,
        afterLevel: cursor?.level,
      });
      if (!next) break;
      await prisma.location.update({
        where: { LocationID: { aisle: next.aisle, bin: next.bin, level: next.level } },
        data: { status: 'STAGED' },
      });
      staged++;
      cursor = { bin: next.bin, level: next.level };
      await writeLog({
        userId: auth.zNumber,
        actionType: 'STAGE',
        locationAisle: next.aisle,
        locationBin: next.bin,
        locationLevel: next.level,
        details: { method: 'RESTAGE', storageCode: type.storageCode, size: type.size },
      });
    }

    results.push({
      storageCode: type.storageCode,
      size: type.size,
      cleared: cleared.count,
      staged,
      shortfall: type.quantity - staged,
    });
  }

  // One combined log entry for the whole action (not per-type clear/stage entries) —
  // per Feature 1's spec, a single Apply tap is logged as one "restage" action.
  await writeLog({
    userId: auth.zNumber,
    actionType: 'RESTAGE',
    locationAisle: body.aisle,
    details: { results },
  });

  return { results };
}

// ── GET /api/staging/next-location ─────────────────────────────────────────────

/**
 * Returns up to `count` available EMPTY, non-contracted locations for staging in an
 * aisle, scoped to a StorageCode+Size, optionally positioned after a given bin/level
 * cursor. Used both to build/refresh a stack's live destination-location list and for
 * the post-stage/restage log look-ahead (`count` omitted, defaulting to 1).
 *
 * Walks the bin/level cursor forward server-side across up to `count` locations in this
 * one request — previously the client walked this cursor itself, issuing one HTTP
 * round-trip per location (issue #75: each additional pallet in a stack's Quantity added
 * a full network round-trip to the list refresh, which is what made it feel slow on
 * every field defocus/commit, even though each individual DB lookup is a fast, single
 * indexed query on its own).
 *
 * @param req - HTTP request with query params `aisle`, `storageCode`, `size` (all
 *   required), optional `afterBin`, `afterLevel`, and optional `count` (default 1, the
 *   number of locations to return in one call)
 * @returns `{ locations: string[] }` — 0 to `count` location IDs, walking forward;
 *   shorter than `count` if the aisle runs out of eligible locations first
 * @throws 400 INVALID_INPUT if any required query param is missing or non-numeric
 */
async function getNextStagingLocation(req: HttpRequest): Promise<unknown> {
  await requireAuth(req);

  const params = new URL(req.url).searchParams;
  const aisleParam = params.get('aisle');
  const storageCode = params.get('storageCode');
  const size = params.get('size');
  if (!aisleParam || !storageCode || !size) {
    throw Object.assign(new Error('INVALID_INPUT'), { status: 400 });
  }
  const aisle = parseInt(aisleParam, 10);
  if (isNaN(aisle)) throw Object.assign(new Error('INVALID_INPUT'), { status: 400 });

  const afterBinParam = params.get('afterBin');
  const afterLevelParam = params.get('afterLevel');
  let afterBin = afterBinParam ? parseInt(afterBinParam, 10) : undefined;
  let afterLevel = afterLevelParam ? parseInt(afterLevelParam, 10) : undefined;

  const countParam = params.get('count');
  const count = countParam ? Math.max(1, parseInt(countParam, 10) || 1) : 1;

  const locations: string[] = [];
  for (let i = 0; i < count; i++) {
    const next = await findNextStagingLocation(aisle, {
      storageCode: storageCode.toUpperCase(),
      size: size.toUpperCase(),
      afterBin,
      afterLevel,
    });
    if (!next) break;
    locations.push(formatLocationId(next.aisle, next.bin, next.level));
    afterBin = next.bin;
    afterLevel = next.level;
  }

  return { locations };
}

// ── Route registrations ───────────────────────────────────────────────────────

app.http('stageLocations', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'staging/stage',
  handler: withHandler(stageLocations),
});

app.http('restageAisle', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'staging/restage',
  handler: withHandler(restageAisle),
});

app.http('getStagedTypes', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'staging/staged-types',
  handler: withHandler(getStagedTypes),
});

app.http('getNextStagingLocation', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'staging/next-location',
  handler: withHandler(getNextStagingLocation),
});
