import { app } from '@azure/functions';
import type { HttpRequest } from '@azure/functions';
import prisma from '../lib/prisma.js';
import { withHandler } from '../lib/response.js';
import { requireAuth } from '../lib/permissions.js';

/**
 * Per-aisle staged-location counts and oldest-staged-location age, for SAR (Staged
 * Aisle Report). A location's "staged since" moment is the timestamp of its most
 * recent STAGE activity-log entry (written per-location by stageLocations/restageAisle
 * in api/functions/staging.ts — see that file's comment on why it logs per-location
 * rather than once per action). Falls back to age 0 for a STAGED location with no
 * matching log entry (e.g. pre-existing seed data), rather than failing the request.
 *
 * @returns Array of `{ aisle, stagedCount, oldestStagedAge }` (age in seconds),
 *   unsorted — the client sorts each of its two lists independently
 */
async function getStagedAisleReport(req: HttpRequest): Promise<unknown> {
  await requireAuth(req);

  const stagedLocations = await prisma.location.findMany({
    where: { status: 'STAGED' },
    select: { aisle: true, bin: true, level: true },
  });
  if (stagedLocations.length === 0) return [];

  const aisles = [...new Set(stagedLocations.map((l) => l.aisle))];

  const stageLogs = await prisma.activityLog.findMany({
    where: { actionType: 'STAGE', locationAisle: { in: aisles } },
    orderBy: { timestamp: 'desc' },
    select: { locationAisle: true, locationBin: true, locationLevel: true, timestamp: true },
  });

  // Most recent STAGE timestamp per exact location — first match wins since sorted desc.
  const stagedSince = new Map<string, Date>();
  for (const log of stageLogs) {
    if (log.locationAisle == null || log.locationBin == null || log.locationLevel == null) continue;
    const key = `${log.locationAisle}-${log.locationBin}-${log.locationLevel}`;
    if (!stagedSince.has(key)) stagedSince.set(key, log.timestamp);
  }

  const now = Date.now();
  const byAisle = new Map<number, { count: number; oldestMs: number }>();
  for (const loc of stagedLocations) {
    const key = `${loc.aisle}-${loc.bin}-${loc.level}`;
    const since = stagedSince.get(key);
    const ageMs = since ? now - since.getTime() : 0;
    const entry = byAisle.get(loc.aisle) ?? { count: 0, oldestMs: 0 };
    entry.count++;
    entry.oldestMs = Math.max(entry.oldestMs, ageMs);
    byAisle.set(loc.aisle, entry);
  }

  return [...byAisle.entries()].map(([aisle, { count, oldestMs }]) => ({
    aisle,
    stagedCount: count,
    oldestStagedAge: Math.floor(oldestMs / 1000),
  }));
}

app.http('getStagedAisleReport', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'reporting/staged-aisle',
  handler: withHandler(getStagedAisleReport),
});
