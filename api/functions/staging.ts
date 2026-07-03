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

// ── POST /api/staging/restage ──────────────────────────────────────────────────

/**
 * Clears every STAGED location in an aisle back to EMPTY, then (if `count` > 0)
 * re-stages the first `count` locations from the back using the same selection
 * logic as a normal stage action — but aisle-wide, with no StorageCode/Size scoping,
 * per the API contract in DevNotes/Screen-Specs/STG.md (the request body carries only
 * `{ aisle, count }`).
 *
 * @param req - HTTP request with body `{ aisle: number; count: number }`
 * @returns `{ cleared: number; staged: number; shortfall: number; firstLocation: string | null }`
 * @throws 400 INVALID_INPUT for missing/negative fields;
 *   403 FORBIDDEN if caller is below IM;
 *   404 NOT_FOUND if the aisle has no location records
 */
async function restageAisle(req: HttpRequest): Promise<unknown> {
  const auth = await requireAuth(req);
  requireRole(auth, 'IM');

  const body = await req.json() as { aisle: number; count: number };
  if (!body.aisle || body.count == null || body.count < 0) {
    throw Object.assign(new Error('INVALID_INPUT'), { status: 400 });
  }

  await requireAisleExists(body.aisle);

  const cleared = await prisma.location.updateMany({
    where: { aisle: body.aisle, status: 'STAGED' },
    data: { status: 'EMPTY' },
  });

  let staged = 0;
  let firstLocation: string | null = null;
  let cursor: { bin: number; level: number } | undefined;

  // Per-location STAGE entries here too (see stageLocations' comment above) — a
  // restaged location's "staged since" moment is this restage, not whenever it was
  // last staged before being cleared.
  for (let i = 0; i < body.count; i++) {
    const next = await findNextStagingLocation(body.aisle, { afterBin: cursor?.bin, afterLevel: cursor?.level });
    if (!next) break;
    await prisma.location.update({
      where: { LocationID: { aisle: next.aisle, bin: next.bin, level: next.level } },
      data: { status: 'STAGED' },
    });
    staged++;
    firstLocation ??= formatLocationId(next.aisle, next.bin, next.level);
    cursor = { bin: next.bin, level: next.level };
    await writeLog({
      userId: auth.zNumber,
      actionType: 'STAGE',
      locationAisle: next.aisle,
      locationBin: next.bin,
      locationLevel: next.level,
      details: { method: 'RESTAGE' },
    });
  }

  const shortfall = body.count - staged;

  await writeLog({
    userId: auth.zNumber,
    actionType: 'RESTAGE',
    locationAisle: body.aisle,
    details: { cleared: cleared.count, staged, shortfall, requested: body.count },
  });

  return { cleared: cleared.count, staged, shortfall, firstLocation };
}

// ── GET /api/staging/next-location ─────────────────────────────────────────────

/**
 * Returns the next available EMPTY, non-contracted location for staging in an aisle,
 * scoped to a StorageCode+Size, optionally positioned after a given bin/level cursor.
 * Used both to build a stack's live destination-location list (called repeatedly,
 * walking the cursor forward) and for the post-stage/restage log look-ahead.
 *
 * @param req - HTTP request with query params `aisle`, `storageCode`, `size` (all
 *   required), and optional `afterBin`, `afterLevel`
 * @returns `{ nextLocation: string | null }`
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
  const afterBin = afterBinParam ? parseInt(afterBinParam, 10) : undefined;
  const afterLevel = afterLevelParam ? parseInt(afterLevelParam, 10) : undefined;

  const next = await findNextStagingLocation(aisle, {
    storageCode: storageCode.toUpperCase(),
    size: size.toUpperCase(),
    afterBin,
    afterLevel,
  });

  return { nextLocation: next ? formatLocationId(next.aisle, next.bin, next.level) : null };
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

app.http('getNextStagingLocation', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'staging/next-location',
  handler: withHandler(getNextStagingLocation),
});
