import prisma from './prisma.js';

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
  opts: { storageCode?: string; size?: string; afterBin?: number; afterLevel?: number },
): Promise<StagingCandidate | null> {
  const location = await prisma.location.findFirst({
    where: {
      aisle,
      status: 'EMPTY',
      contraction: false,
      // See findNextLocation's comment on why this is an explicit OR, not `notIn`.
      OR: [
        { holdCategory: null },
        { holdCategory: 'HOLD_OUT' },
      ],
      ...(opts.storageCode && { storageCode: opts.storageCode }),
      ...(opts.size        && { size:        opts.size }),
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
    orderBy: [{ bin: 'desc' }, { level: 'asc' }],
  });

  return location
    ? { aisle: location.aisle, bin: location.bin, level: location.level, zone: location.zone }
    : null;
}
