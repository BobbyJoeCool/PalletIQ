/** Canonical ascending size order — matches SIZE_ORDER in api/functions/locations.ts. */
export const SIZES = ['XS', 'HS', 'S', 'M', 'L'];

/** Full names for each size code (issue #80) — shown alongside the code in the shared
 *  SizeField's dropdown-helper popup. */
export const SIZE_NAMES: Record<string, string> = {
  XS: 'Extra Small (Hand Put)',
  HS: 'Half Small',
  S: 'Small',
  M: 'Medium',
  L: 'Large',
};

/** Relative physical-size weights (Large = 1, halving down through each smaller tier,
 *  Medium = 2/3 Large) — drives AisleGrid's per-level row-height weighting (v1.6.5), since
 *  a level's Size is constant across every zone/side within it (see seed.ts's getSize). */
export const SIZE_WEIGHTS: Record<string, number> = {
  XS: 0.125,
  HS: 0.25,
  S: 0.5,
  M: 0.667,
  L: 1,
};
