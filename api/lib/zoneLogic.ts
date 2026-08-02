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
 * A location "not held" in the sense that blocks a put/stage — excludes HOLD_IN/
 * HOLD_BOTH/HOLD_PERM but allows HOLD_OUT (outbound-only holds don't block putting
 * something new there) and no hold at all. Explicit OR rather than
 * `holdCategory: { notIn: [...] }` — `NOT IN` over a nullable column excludes NULL rows
 * under standard SQL three-valued logic, which would wrongly exclude every location with
 * no hold at all (the vast majority). Canonical definition; spread into a `where` clause
 * alongside other conditions.
 */
export const NOT_HELD_FILTER: { OR: ({ holdCategory: null } | { holdCategory: string })[] } = {
  OR: [{ holdCategory: null }, { holdCategory: 'HOLD_OUT' }],
};

export interface EffectiveCriteria {
  // Both always resolve to a real value or resolveEffectiveCriteria throws — see its own
  // doc comment. Non-optional here (unlike the old shape) so a caller can't accidentally
  // reintroduce an unfiltered search by treating either as omittable.
  size: string;
  storageCode: string;
  zone: number;
}

/**
 * Resolves the effective Size/Storage Code/Zone to search with for a Directed Put — the
 * SDP put hierarchy: an explicit override always wins; otherwise Size and Storage Code
 * each fall back to the pallet's own inherited value. Storage Code has a third tier below
 * that: the Item's own intrinsic Storage Code (always set) — so a pallet that's never been
 * stored still gets a real Storage Code filter on its first put. Zone falls back like
 * Size/Storage Code but always resolves to a concrete number, defaulting to 1 — Zone is
 * only ever a *starting preference* for `findNextLocation` (which retries from Zone 1 if
 * nothing eligible exists at or above it), not a hard filter, so it has no failure mode
 * the way Size/Storage Code do. Used by directedPut for its own search.
 *
 * **Size and Storage Code are always hard, exact-match filters — direct instruction: "Both
 * of those should ONLY accept the value that the location has, unless specifically
 * overridden."** A pallet is expected to always carry a real Size/Storage Code by the time
 * it reaches here (mandatory at creation — see `reinstatePallet`'s own doc comment, and
 * every demo/seed pallet-creation path) — a pallet resolving to no Size (no override, and
 * `pallet.size` itself null) is therefore treated as an invalid, unrecoverable-without-an-
 * override state and rejected outright (`MISSING_SIZE`), rather than silently searching
 * with no Size constraint at all (the previous behavior — a location's own Size stopped
 * meaning anything the moment a null-Size pallet showed up, since it could then land
 * anywhere). Storage Code can't hit the equivalent case — the Item-level fallback always
 * supplies a real value — so it has no matching failure mode.
 *
 * @throws 409 MISSING_SIZE if Size resolves to nothing (no override, and the pallet itself
 *   has none) — recoverable by supplying a Size override (any authenticated role can)
 */
export function resolveEffectiveCriteria(
  overrides: { size?: string | null; storageCode?: string | null; zone?: number | null },
  pallet: { size: string | null; storageCode: string | null; zone: number | null; itemStorageCode: string },
): EffectiveCriteria {
  const size = overrides.size ?? pallet.size ?? undefined;
  if (!size) throw Object.assign(new Error('MISSING_SIZE'), { status: 409 });

  return {
    size,
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
 * Finds the next available location in an aisle, starting at the given zone, always
 * exact-match filtered by size and storageCode — never unconstrained (the caller resolves
 * these ahead of time from an IM+/Size override, the pallet's own inherited Storage
 * Code/Size, or the Item's own intrinsic Storage Code; see `resolveEffectiveCriteria`'s own
 * doc comment for why this can no longer come back empty). Deterministic within a zone: highest bin first, then
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
  opts: { size: string; storageCode: string; excludeStaged?: boolean },
): Promise<FoundLocation | null> {
  async function search(status: 'EMPTY' | 'STAGED', fromZone: number) {
    return prisma.location.findFirst({
      where: {
        aisle,
        status,
        ...NOT_HELD_FILTER,
        contraction: false,
        size:        opts.size,
        storageCode: opts.storageCode,
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
