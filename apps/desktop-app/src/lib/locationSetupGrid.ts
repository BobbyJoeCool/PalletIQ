import type { AisleSides, ZoneSetting } from '@shared/aisleSetup';
import { ZONE_NUMBERS, cellKey, sidesOf } from '@shared/aisleSetup';
import type { GridShape } from './useGridSelection';

/**
 * The Location Setup grid's shape (#143): one column per zone-side — zones 1 to 4 left
 * to right, each split into its sides, the same order ELZ draws — and one row per level,
 * highest level at the top, down to the tallest zone-side's height.
 *
 * @param settings - the aisle's zone settings
 * @param sides - which sides the aisle has
 */
export function buildGridShape(settings: ZoneSetting[], sides: AisleSides): GridShape {
  const columns = ZONE_NUMBERS.flatMap((zone) => sidesOf(sides).map((side) => ({ zone, side })));
  const top = settings.reduce((max, s) => Math.max(max, s.level), 0);
  const levels = Array.from({ length: top }, (_, i) => top - i);
  return { columns, levels, existing: new Set(settings.map(cellKey)) };
}
