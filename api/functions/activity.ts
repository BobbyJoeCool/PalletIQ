import { app } from '@azure/functions';
import type { HttpRequest } from '@azure/functions';
import prisma from '../lib/prisma.js';
import { withHandler } from '../lib/response.js';
import { requireAuth } from '../lib/permissions.js';
import { parseLocationBarcode, formatLocationId } from '../lib/locationParser.js';

/**
 * Filtered activity-log query — the shared read path every reporting screen (IRP, SAR,
 * and any future report) queries through, and the source for the app-wide 12-hour
 * activity log overlay (issue #46, via `hoursBack=12`). All filters are optional and
 * combine with AND; an unfiltered call returns the most recent entries across the whole log.
 *
 * @param req - HTTP request with optional query params:
 *   `location` — 6 or 8-digit location barcode, filtered to aisle+bin (level is not
 *     stored distinctly enough on every log row to filter on reliably)
 *   `palletId` — numeric pallet ID
 *   `dpci` — 9-digit DPCI (dash-separated or concatenated — dept(3)+class(2)+item(4))
 *   `user` — zNumber
 *   `hoursBack` — only include entries with `timestamp >= now - hoursBack` hours
 * @returns Array of `{ id, timestamp, userId, actionType, palletId, locationAisle,
 *   location, dpci, details }`, newest first, capped at 200 rows. `location` is the full
 *   Aisle+Bin+Level id, present only when all three are stored (e.g. not for RESTAGE/
 *   RANGE_HOLD/RANGE_REL, which log only an aisle); `locationAisle` is present whenever
 *   any location component is stored at all, for callers that only need the aisle.
 * @throws 400 INVALID_INPUT if a provided filter is malformed
 */
async function getActivity(req: HttpRequest): Promise<unknown> {
  await requireAuth(req);

  const params = new URL(req.url).searchParams;
  const locationParam = params.get('location');
  const palletIdParam = params.get('palletId');
  const dpciParam = params.get('dpci');
  const userParam = params.get('user');
  const hoursBackParam = params.get('hoursBack');

  const where: {
    locationAisle?: number;
    locationBin?: number;
    palletId?: number;
    dept?: number;
    class?: number;
    item?: number;
    userId?: string;
    timestamp?: { gte: Date };
  } = {};

  if (locationParam) {
    const parsed = parseLocationBarcode(locationParam);
    if (!parsed) throw Object.assign(new Error('INVALID_INPUT'), { status: 400 });
    where.locationAisle = parsed.aisle;
    where.locationBin = parsed.bin;
  }

  if (palletIdParam) {
    const palletId = parseInt(palletIdParam, 10);
    if (isNaN(palletId)) throw Object.assign(new Error('INVALID_INPUT'), { status: 400 });
    where.palletId = palletId;
  }

  if (dpciParam) {
    const digits = dpciParam.replace(/-/g, '');
    if (!/^\d{9}$/.test(digits)) throw Object.assign(new Error('INVALID_INPUT'), { status: 400 });
    where.dept = parseInt(digits.slice(0, 3), 10);
    where.class = parseInt(digits.slice(3, 5), 10);
    where.item = parseInt(digits.slice(5, 9), 10);
  }

  if (userParam) where.userId = userParam;

  if (hoursBackParam) {
    const hoursBack = Number(hoursBackParam);
    if (isNaN(hoursBack) || hoursBack <= 0) throw Object.assign(new Error('INVALID_INPUT'), { status: 400 });
    where.timestamp = { gte: new Date(Date.now() - hoursBack * 60 * 60 * 1000) };
  }

  const entries = await prisma.activityLog.findMany({
    where,
    orderBy: { timestamp: 'desc' },
    take: 200,
  });

  return entries.map((e) => ({
    id: e.id,
    timestamp: e.timestamp,
    userId: e.userId,
    actionType: e.actionType,
    palletId: e.palletId,
    locationAisle: e.locationAisle,
    // Only a full Aisle+Bin+Level id counts as a formattable location — some actionTypes
    // (RESTAGE, RANGE_HOLD, RANGE_REL) store only an aisle, which formatLocationId can't
    // safely handle (it would previously produce a garbled string here).
    location: e.locationAisle != null && e.locationBin != null && e.locationLevel != null
      ? formatLocationId(e.locationAisle, e.locationBin, e.locationLevel)
      : null,
    dpci: e.dept != null
      ? `${String(e.dept).padStart(3, '0')}-${String(e.class).padStart(2, '0')}-${String(e.item).padStart(4, '0')}`
      : null,
    details: e.details ? JSON.parse(e.details) as unknown : null,
  }));
}

app.http('getActivity', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'activity',
  handler: withHandler(getActivity),
});
