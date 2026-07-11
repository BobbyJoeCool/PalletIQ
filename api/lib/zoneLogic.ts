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
 * When not consolidating, STAGED locations are preferred over EMPTY ones (issue #79) —
 * a GPMer's staged space is exactly what SDP should be directing pallets into first, so
 * new pallets land next to what they were staged for rather than scattering into
 * locations that are empty for unrelated reasons (a lifted hold, a pull, etc.). This is a
 * strict preference, not a tie-break within one combined query: every eligible STAGED
 * location (ranked by the normal zone/bin/level proximity order) is considered before any
 * EMPTY location, even one that would otherwise rank earlier. Only when `excludeStaged`
 * (driven by the worker's Consolidating toggle) is set does the search skip STAGED
 * entirely and go straight to EMPTY — Consolidating mode's own logic is unchanged.
 * Contracted locations are never candidates, regardless of mode. See
 * DevNotes/Screen-Specs/STG.md's "SDP and MNP Interaction".
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
  async function search(status: 'EMPTY' | 'STAGED') {
    return prisma.location.findFirst({
      where: {
        aisle,
        status,
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
  }

  const location = opts.excludeStaged
    ? await search('EMPTY')
    : (await search('STAGED')) ?? (await search('EMPTY'));

  return location
    ? { aisle: location.aisle, bin: location.bin, level: location.level, zone: location.zone }
    : null;
}
