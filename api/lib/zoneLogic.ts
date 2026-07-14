import prisma from './prisma.js';

/**
 * Derives which physical side of the aisle a bin sits on. Per outline.md's Location
 * Barcode Handling section, bins run odd on one side and even on the other — used by
 * the ELZ zone-map grid to split each zone into an Odd and Even column.
 */
export function sideOf(bin: number): 'odd' | 'even' {
  return bin % 2 === 0 ? 'even' : 'odd';
}

export interface EffectiveCriteria {
  size?: string;
  storageCode?: string;
  zone: number;
}

/**
 * Resolves the effective Size/Storage Code/Zone to search with for a Directed Put — the
 * SDP put hierarchy: an explicit override always wins; otherwise Size falls back to the
 * pallet's own inherited value (undefined — no filter — if it has none, i.e.
 * PUT_PENDING; Item has no equivalent classification to fall further back to). Storage
 * Code has a third tier: the pallet's own inherited value, then the Item's own intrinsic
 * Storage Code (always set) — so a pallet that's never been stored still gets a real
 * Storage Code filter on its first put, rather than none at all. Zone falls back like
 * Size but always resolves to a concrete number, defaulting to 1. Shared by directedPut
 * (the initial search) and blockPut (a Blocked Put's re-search, which must reapply the
 * exact same effective criteria).
 */
export function resolveEffectiveCriteria(
  overrides: { size?: string | null; storageCode?: string | null; zone?: number | null },
  pallet: { size: string | null; storageCode: string | null; zone: number | null; itemStorageCode: string },
): EffectiveCriteria {
  return {
    size:        overrides.size        ?? pallet.size        ?? undefined,
    storageCode: overrides.storageCode ?? pallet.storageCode ?? pallet.itemStorageCode,
    zone:        overrides.zone        ?? pallet.zone         ?? 1,
  };
}

export interface FoundLocation {
  aisle: number;
  bin: number;
  level: number;
  zone: number;
  /** True if this location was already STAGED (the preferred/expected outcome) when
   *  matched, false if the search fell through to the EMPTY search — see confirmPut,
   *  which surfaces this as Blue Info + a "wasn't staged" note instead of plain Green
   *  Success (the SDP put hierarchy's rule 4.a). */
  wasStaged: boolean;
}

/**
 * Finds the next available location in an aisle, starting at the given zone,
 * optionally filtered by size and/or storageCode (both exact-match — the caller resolves
 * these ahead of time from an IM+ override or the pallet's own inherited Storage
 * Code/Size, see directedPut). Deterministic within a zone: highest bin first, then
 * lowest level first within that bin, before stepping down to the next-lower bin — same
 * direction Staging fills from (both work from the back of the aisle forward now).
 * Scanning the same aisle/constraints repeatedly with nothing else changing always
 * finds the same location.
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
 * If nothing eligible exists at or above `startZone`, the whole search retries from
 * Zone 1 before giving up — `startZone` is only ever a *preference* (the pallet's own
 * inherited zone, or an IM+ override), not a hard constraint; a zone that happens to be
 * full shouldn't hide an eligible location sitting in an earlier one. No-op when
 * `startZone` is already 1.
 *
 * Returns null if no eligible location exists anywhere in the aisle.
 */
export async function findNextLocation(
  aisle: number,
  startZone: number,
  opts: { size?: string; storageCode?: string; excludeStaged?: boolean },
): Promise<FoundLocation | null> {
  async function search(status: 'EMPTY' | 'STAGED', fromZone: number) {
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
        zone: { gte: fromZone },
      },
      // Deterministic fill order, back-to-front: highest bin first, then lowest level
      // first within a bin, moving up a level at a time before stepping down to the next
      // (lower) bin — same direction Staging already fills from (issue found live: the
      // two workflows now intentionally share one end of the aisle rather than working
      // from opposite ends).
      orderBy: [{ zone: 'asc' }, { bin: 'desc' }, { level: 'asc' }],
    });
  }

  async function searchFrom(fromZone: number) {
    const staged = opts.excludeStaged ? null : await search('STAGED', fromZone);
    if (staged) return { ...staged, wasStaged: true as const };
    const empty = await search('EMPTY', fromZone);
    return empty ? { ...empty, wasStaged: false as const } : null;
  }

  const found = (await searchFrom(startZone)) ?? (startZone > 1 ? await searchFrom(1) : null);

  return found
    ? { aisle: found.aisle, bin: found.bin, level: found.level, zone: found.zone, wasStaged: found.wasStaged }
    : null;
}
