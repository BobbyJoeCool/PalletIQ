import prisma from './prisma.js';

/**
 * Derives which physical side of the aisle a bin sits on. Per outline.md's Location
 * Barcode Handling section, bins run odd on one side and even on the other — used by
 * the ELZ zone-map grid to split each zone into an Odd and Even column.
 */
export function sideOf(bin: number): 'odd' | 'even' {
  return bin % 2 === 0 ? 'even' : 'odd';
}

/**
 * Determines the starting zone for a directed put.
 *
 * Rule: if the pallet's DPCI is already stored in the target aisle,
 * start in that zone. Otherwise fall through Zone 1 → 2 → 3 → 4.
 *
 * When a zone override is supplied, that overrides this logic entirely.
 */
export async function resolveStartingZone(
  aisle: number,
  dept: number,
  cls: number,
  item: number,
  zoneOverride?: number,
): Promise<number> {
  if (zoneOverride != null) return zoneOverride;

  // Look for any location in this aisle that already holds a pallet with this DPCI.
  const existing = await prisma.pallet.findFirst({
    where: {
      dept,
      class: cls,
      item,
      locationAisle: aisle,
      locationBin: { not: null },
    },
    include: {
      location: { select: { zone: true } },
    },
  });

  return existing?.location?.zone ?? 1;
}

/**
 * Finds the next available location in an aisle, starting at the given zone,
 * optionally filtered by size and/or storageCode.
 *
 * STAGED locations are treated as equally valid candidates alongside EMPTY ones — a
 * GPMer's staged space is exactly what SDP should be directing pallets into — unless
 * `excludeStaged` (driven by the worker's Consolidating toggle) is set, in which case
 * only EMPTY locations are considered. Contracted locations are never candidates,
 * regardless of mode. See DevNotes/Screen-Specs/STG.md's "SDP and MNP Interaction".
 *
 * Hold Inbound, Hold Both, and Hold Permanent all block new puts (per WLH.md's hold
 * table) and are excluded; Hold Outbound only blocks label generation, so a location
 * under Hold Outbound remains a valid put candidate.
 *
 * Returns null if no eligible location exists.
 */
export async function findNextLocation(
  aisle: number,
  startZone: number,
  opts: { size?: string; storageCode?: string; excludeStaged?: boolean },
): Promise<{ aisle: number; bin: number; level: number; zone: number } | null> {
  const location = await prisma.location.findFirst({
    where: {
      aisle,
      status: opts.excludeStaged ? 'EMPTY' : { in: ['EMPTY', 'STAGED'] },
      // Explicit OR rather than `holdCategory: { notIn: [...] }` — `NOT IN` over a
      // nullable column excludes NULL rows under standard SQL three-valued logic, which
      // would wrongly exclude every location with no hold at all (the vast majority).
      OR: [
        { holdCategory: null },
        { holdCategory: 'HOLD_OUT' },
      ],
      contraction: false,
      ...(opts.size        && { size:        opts.size }),
      ...(opts.storageCode && { storageCode: opts.storageCode }),
      zone: { gte: startZone },
    },
    orderBy: [{ zone: 'asc' }, { bin: 'asc' }, { level: 'asc' }],
  });

  return location
    ? { aisle: location.aisle, bin: location.bin, level: location.level, zone: location.zone }
    : null;
}
