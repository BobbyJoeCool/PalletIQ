import prisma from './prisma.js';
import { NOT_HELD_FILTER } from './zoneLogic.js';

export interface StagingCandidate {
  aisle: number;
  bin: number;
  level: number;
  zone: number;
}

/**
 * Finds the next EMPTY, non-contracted, non-held location eligible for staging in an
 * aisle, filling from the back of the aisle forward — highest bin first, then lowest
 * level within a bin — per DevNotes/Screen-Specs/STG.md's Location Selection Logic.
 * This ordering is intentionally the reverse of SDP's findNextLocation (zoneLogic.ts),
 * which fills front-to-back by zone: staging and directed-put are different placement
 * strategies over the same Location table.
 *
 * `storageCode`/`size` are optional so the same helper serves both STG's per-stack
 * search (always scoped to a StorageCode+Size) and Unstage/Restage (aisle-wide, no
 * scoping — see STG.md's restage API contract, which takes only `{ aisle, count }`).
 *
 * `zone`, when given, is a *starting* zone, not an exact filter (GitHub #192 — fixed
 * from an exact `zone: opts.zone` match, which searched only that one zone and could
 * find nothing there even with real candidates a zone or two further in; #129's
 * per-stack Zone override shipped with this same bug from the start). Since zone number
 * increases as bin number decreases (Zone 1 = highest bins, Zone 4 = lowest — see
 * seed.ts's `foldedZoneOf`/`getZone192`-style helpers), "start at zone X, continue
 * toward bin 1, never restart in an earlier-numbered zone" is `zone >= X` — the same
 * `{ gte: fromZone }` shape SDP's own `findNextLocation` (zoneLogic.ts) already uses for
 * its own "at or above this zone" search, just without that function's fallback-to-Zone-1
 * retry (a Zone override here is a hard restriction the worker chose, not a soft
 * preference like SDP's inherited/overridden `startZone`).
 *
 * `afterBin`/`afterLevel` act as a cursor: when supplied, only candidates strictly
 * further back-to-front than that position are considered — used to walk forward
 * through a multi-location list one call at a time (building a stack's destination
 * list, or the next-location look-ahead after a stage/restage action).
 *
 * Excludes any location with an active Hold Inbound, Hold Both, or Hold Permanent
 * (Hold Outbound only blocks label generation, not staging/putting — same rule SDP's
 * findNextLocation applies). Not explicitly called out in STG.md, but follows the same
 * hold-blocks-placement logic already established for directed put.
 *
 * Returns null if no eligible location exists.
 */
export async function findNextStagingLocation(
  aisle: number,
  opts: { storageCode?: string; size?: string; zone?: number; afterBin?: number; afterLevel?: number },
): Promise<StagingCandidate | null> {
  const location = await prisma.location.findFirst({
    where: {
      aisle,
      status: 'EMPTY',
      contraction: false,
      ...NOT_HELD_FILTER,
      ...(opts.storageCode && { storageCode: opts.storageCode }),
      ...(opts.size        && { size:        opts.size }),
      ...(opts.zone != null && { zone: { gte: opts.zone } }),
      ...(opts.afterBin != null && {
        AND: [
          {
            OR: [
              { bin: { lt: opts.afterBin } },
              { bin: opts.afterBin, level: { gt: opts.afterLevel ?? 0 } },
            ],
          },
        ],
      }),
    },
    orderBy: [{ zone: 'asc' }, { bin: 'desc' }, { level: 'asc' }],
  });

  return location
    ? { aisle: location.aisle, bin: location.bin, level: location.level, zone: location.zone }
    : null;
}
