import { app } from '@azure/functions';
import type { HttpRequest, InvocationContext } from '@azure/functions';
import prisma from '../lib/prisma.js';
import { withHandler } from '../lib/response.js';
import { requireAuth } from '../lib/permissions.js';

/**
 * Returns a random PRINTED label ID for the PIP screen's demo "Scan Label" button.
 * Optional `?fn=` query param filters to labels with a specific pull function code (CA/CF/FP).
 * Uses a random skip approach (count → random offset → findFirst) so every call may
 * return a different label without requiring an ORDER BY RANDOM on large tables.
 *
 * @param req - HTTP request with optional query param `fn` (pull function code filter)
 * @returns `{ labelId: string }`
 * @throws 404 NOT_FOUND if no PRINTED labels exist (or none matching the fn filter)
 */
async function sampleLabel(req: HttpRequest, _ctx: InvocationContext): Promise<unknown> {
  await requireAuth(req);

  const fn = new URL(req.url).searchParams.get('fn') ?? undefined;
  const where = { status: 'PRINTED', ...(fn ? { pullFunction: fn } : {}) };

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
 *
 * @param req - HTTP request with query param `status` ("unlocated" | "stored", default "stored")
 * @returns `{ palletId: number }`
 * @throws 404 NOT_FOUND if no pallets match the requested status
 */
async function samplePallet(req: HttpRequest, _ctx: InvocationContext): Promise<unknown> {
  await requireAuth(req);

  const statusParam = new URL(req.url).searchParams.get('status') ?? 'stored';

  const where =
    statusParam === 'unlocated'
      ? { locationAisle: null }
      : { locationAisle: { not: null } };

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
