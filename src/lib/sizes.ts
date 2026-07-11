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
