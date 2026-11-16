import type { BinSide, ZoneCellKey, ZoneDirection } from '@shared/aisleSetup';
import { NOT_FOR_STORAGE_REASONS } from '@shared/aisleSetup';

/** Presentation text for Location Setup (#143). Pure. */

export const SIDE_LABELS: Record<BinSide, string> = { ODD: 'Odd', EVEN: 'Even' };

export const DIRECTION_LABELS: Record<ZoneDirection, string> = {
  BACK_TO_FRONT: 'Zone 1 at the back (highest bins)',
  FRONT_TO_BACK: 'Zone 1 at the front (lowest bins)',
};

/** @returns the label for a carve-out reason code, or the code itself if unknown */
export function reasonLabel(code: string | null): string {
  if (!code) return '';
  return NOT_FOR_STORAGE_REASONS.find((r) => r.code === code)?.label ?? code;
}

/** @returns e.g. "Zone 2 Odd, level 5" */
export function describeCell(key: ZoneCellKey): string {
  return `Zone ${key.zone} ${SIDE_LABELS[key.side]}, level ${key.level}`;
}

/** Messages for the error codes the Location Setup endpoints return. */
export const LOCATION_SETUP_ERRORS: Record<string, string> = {
  NOT_FOUND: 'That aisle or location does not exist.',
  FORBIDDEN: 'Your role cannot do that. Ask an OM or ICQA.',
  NO_DESKTOP_ACCESS: 'This account does not have desktop access.',
  UNAUTHORIZED: 'Your session has ended. Sign in again.',
  AISLE_EXISTS: 'That aisle already exists.',
  AISLE_NOT_EMPTY: 'Every location in the aisle must be empty before it can be deleted.',
  LOCATION_NOT_EMPTY: 'Only an empty location can be marked Not For Storage.',
  ALREADY_NOT_FOR_STORAGE: 'That location is already Not For Storage.',
  NOT_NOT_FOR_STORAGE: 'That location is not marked Not For Storage.',
  ZONE_SETTING_MISSING: 'This location has no zone setting to restore. Check the aisle setup.',
  NOTE_REQUIRED: 'Enter a note when the reason is Other.',
  NOTHING_TO_CHANGE: 'Choose a storage code or size to change.',
  INVALID_CELLS: 'The selection no longer matches the aisle. Reload and try again.',
  INVALID_LOCATION: 'One of the selected locations is not in this aisle.',
  INVALID_AISLE: 'Aisle must be a number from 1 to 999.',
  INVALID_BINS: 'Bins must run from 1 to 999, first bin no higher than last.',
  ZONES_INVALID: 'Each of the four zones needs a start and end bin.',
  ZONES_NOT_COVERING: 'The zones must cover every bin from first to last with no gaps or overlaps.',
  ZONES_OUT_OF_ORDER: 'The zone ranges are in the wrong order for the zone direction.',
  ZONE_EMPTY: 'Every zone needs at least one location.',
  LEVELS_REQUIRED: 'Every side needs at least one level.',
  LEVELS_NOT_CONTIGUOUS: 'Levels must be numbered from 1 with no gaps.',
  TOO_MANY_LEVELS: 'An aisle can have at most 99 levels.',
  NOT_FOR_STORAGE_IN_SETUP: 'Not For Storage is set on single locations, not a whole zone.',
  INVALID_STORAGE_CODE: 'Choose a valid storage code for every level.',
  INVALID_SIZE: 'Choose a valid size for every level.',
  INVALID_OVERRIDE: 'A zone override is for a zone or side the aisle does not have.',
  INVALID_INPUT: 'Some of the entries are not valid.',
};

export const LOCATION_SETUP_FALLBACK_ERROR =
  'The request failed. Check that the API is running and try again.';

/** @returns the message to show for an error thrown by the Location Setup client */
export function locationSetupErrorText(err: unknown): string {
  const code = err instanceof Error ? err.message : '';
  return LOCATION_SETUP_ERRORS[code] ?? LOCATION_SETUP_FALLBACK_ERROR;
}

/** @returns the API's extra error fields (`data`) from a thrown error, if any */
export function errorData(err: unknown): Record<string, unknown> {
  const data = (err as { data?: unknown }).data;
  return typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : {};
}
