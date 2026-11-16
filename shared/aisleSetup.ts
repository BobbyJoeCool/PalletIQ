// Aisle setup rules (Desktop: Location Setup Edit, GitHub #143) — how an aisle definition
// becomes zones, zone settings and Location rows, and the contraction presets. Pure: no
// Prisma, no HTTP. The API validates and expands definitions with these, and the desktop
// app uses the same functions for its live preview, so the two cannot disagree.
//
// Vocabulary:
//   - zone-side      one zone's bins on one side of the aisle (odd or even bins)
//   - zone setting   one level of one zone-side: its storage code and size. Every location
//                    on that level of that zone-side is set up identically (direct
//                    instruction 2026-11-16: "locations should ONLY be able to be set up by
//                    ZONE"); the only per-location exception is a Not For Storage carve-out.

import { NOT_FOR_STORAGE_CODE } from './locationPolicy.js';

/** Every aisle has exactly four zones (decided 2026-11-16; ELZ and STG draw four). */
export const ZONE_COUNT = 4;
export const ZONE_NUMBERS = [1, 2, 3, 4] as const;

/** Highest aisle / bin number a location ID can hold (three digits each). */
export const MAX_AISLE = 999;
export const MAX_BIN = 999;
/** Highest level a location ID can hold (two digits). */
export const MAX_LEVEL = 99;

export type BinSide = 'ODD' | 'EVEN';
/** Which sides of the aisle have locations. */
export type AisleSides = 'BOTH' | BinSide;
export const AISLE_SIDES: readonly AisleSides[] = ['BOTH', 'ODD', 'EVEN'];

/**
 * Which end of the aisle Zone 1 is at. `BACK_TO_FRONT` (the default, and every existing
 * aisle) puts Zone 1 at the highest bins — the back, where staging and putaway start.
 * `FRONT_TO_BACK` puts Zone 1 at the lowest bins. Stored per aisle; STG/SDP/MNP do not
 * read it yet (a separate change).
 */
export type ZoneDirection = 'BACK_TO_FRONT' | 'FRONT_TO_BACK';
export const ZONE_DIRECTIONS: readonly ZoneDirection[] = ['BACK_TO_FRONT', 'FRONT_TO_BACK'];

/** A zone's bins, inclusive. One range covers both sides. */
export interface ZoneRange {
  zone: number;
  startBin: number;
  endBin: number;
}

/** One level's storage code and size. */
export interface LevelSetting {
  level: number;
  storageCode: string;
  size: string;
}

/** A level list that replaces a side's default levels for one zone (e.g. aisle 730's 13-level XS zone). */
export interface ZoneLevelOverride {
  zone: number;
  side: BinSide;
  levels: LevelSetting[];
}

/** Everything needed to create an aisle. */
export interface AisleDefinition {
  aisle: number;
  sides: AisleSides;
  firstBin: number;
  lastBin: number;
  zoneDirection: ZoneDirection;
  zones: ZoneRange[];
  /** Default levels for each side that exists (most aisles are set per side). */
  sideLevels: Partial<Record<BinSide, LevelSetting[]>>;
  /** Zones whose levels differ from their side's default. */
  zoneOverrides: ZoneLevelOverride[];
}

/** One zone setting: a level of a zone-side. */
export interface ZoneSetting extends LevelSetting {
  zone: number;
  side: BinSide;
}

/** Identifies a zone setting without its values. */
export interface ZoneCellKey {
  zone: number;
  side: BinSide;
  level: number;
}

/** A Location row an aisle definition produces. */
export interface ExpandedLocation {
  aisle: number;
  bin: number;
  level: number;
  zone: number;
  storageCode: string;
  size: string;
}

/** Reasons a location can be carved out to Not For Storage. `OTHER` requires a note. */
export const NOT_FOR_STORAGE_REASONS = [
  { code: 'CAGE_CART', label: 'Cage Cart Storage' },
  { code: 'EOA_VIS', label: 'End of Aisle Visibility' },
  { code: 'AMNESTY', label: 'Amnesty Bin' },
  { code: 'OTHER', label: 'Other' },
] as const;
export type NotForStorageReason = (typeof NOT_FOR_STORAGE_REASONS)[number]['code'];

/** @returns true if the value is a known carve-out reason code */
export function isNotForStorageReason(value: unknown): value is NotForStorageReason {
  return typeof value === 'string' && NOT_FOR_STORAGE_REASONS.some((r) => r.code === value);
}

/** Sizes treated as "small" for the top-of-aisle contraction preset (top 3 levels, not 1). */
export const SMALL_TOP_SIZES: readonly string[] = ['HS', 'XS'];
/** How many top levels the preset covers on a Half Small / Extra Small zone-side. */
export const SMALL_TOP_LEVEL_COUNT = 3;

/** @returns which side a bin is on (odd bins on one side, even on the other) */
export function sideOfBin(bin: number): BinSide {
  return bin % 2 === 0 ? 'EVEN' : 'ODD';
}

/** @returns the sides an aisle has locations on */
export function sidesOf(sides: AisleSides): BinSide[] {
  return sides === 'BOTH' ? ['ODD', 'EVEN'] : [sides];
}

/** @returns a stable string key for a zone setting, e.g. `2|ODD|5` */
export function cellKey(key: ZoneCellKey): string {
  return `${key.zone}|${key.side}|${key.level}`;
}

/**
 * The bins of an aisle that actually hold locations: every bin in range on a double-sided
 * aisle, or only the odd / even ones on a single-sided aisle.
 */
export function binsOf(sides: AisleSides, firstBin: number, lastBin: number): number[] {
  const bins: number[] = [];
  for (let bin = firstBin; bin <= lastBin; bin++) {
    if (sides === 'BOTH' || sideOfBin(bin) === sides) bins.push(bin);
  }
  return bins;
}

/**
 * Splits an aisle's bins into four zones as evenly as possible. Bins are split in
 * facing pairs on a double-sided aisle, so a zone boundary never separates a bin from the
 * one across from it; any remainder goes to the zones nearest Zone 1, one each.
 *
 * @returns the four ranges, Zone 1 first; an empty array if the aisle has fewer than four
 *   splittable units (a pair, or a single bin on a single-sided aisle)
 */
export function defaultZoneRanges(
  sides: AisleSides,
  firstBin: number,
  lastBin: number,
  direction: ZoneDirection,
): ZoneRange[] {
  const bins = binsOf(sides, firstBin, lastBin);
  const units: number[][] = [];
  if (sides === 'BOTH') {
    for (let i = 0; i < bins.length; i += 2) units.push(bins.slice(i, i + 2));
  } else {
    for (const bin of bins) units.push([bin]);
  }
  if (units.length < ZONE_COUNT) return [];

  // Units in the order zones are numbered: from Zone 1's end of the aisle.
  const ordered = direction === 'BACK_TO_FRONT' ? [...units].reverse() : units;
  const base = Math.floor(ordered.length / ZONE_COUNT);
  const extra = ordered.length % ZONE_COUNT;

  const ranges: ZoneRange[] = [];
  let index = 0;
  for (const zone of ZONE_NUMBERS) {
    const count = base + (zone <= extra ? 1 : 0);
    const zoneBins = ordered.slice(index, index + count).flat();
    index += count;
    // The range spans the full bin numbers, so a double-sided zone's range is unbroken.
    ranges.push({ zone, startBin: Math.min(...zoneBins), endBin: Math.max(...zoneBins) });
  }
  // Ranges must tile the aisle exactly; stretch the outer ends to the aisle's own ends.
  const low = direction === 'BACK_TO_FRONT' ? ranges[ZONE_COUNT - 1] : ranges[0];
  const high = direction === 'BACK_TO_FRONT' ? ranges[0] : ranges[ZONE_COUNT - 1];
  low.startBin = firstBin;
  high.endBin = lastBin;
  for (let i = 0; i < ZONE_COUNT - 1; i++) {
    // Close any gap between neighbouring ranges (left by single-sided parity skips).
    const [lower, upper] = direction === 'BACK_TO_FRONT' ? [ranges[i + 1], ranges[i]] : [ranges[i], ranges[i + 1]];
    lower.endBin = upper.startBin - 1;
  }
  return ranges;
}

/** @returns the zone a bin falls in, or null if no range covers it */
export function zoneOfBin(zones: ZoneRange[], bin: number): number | null {
  return zones.find((z) => bin >= z.startBin && bin <= z.endBin)?.zone ?? null;
}

/** @returns the level list that applies to one zone-side: its override, else the side's default */
export function levelsFor(def: AisleDefinition, zone: number, side: BinSide): LevelSetting[] {
  return def.zoneOverrides.find((o) => o.zone === zone && o.side === side)?.levels ?? def.sideLevels[side] ?? [];
}

/** Lookup values the definition must use. */
export interface SetupLookups {
  storageCodes: readonly string[];
  sizes: readonly string[];
}

/**
 * Checks a level list: levels numbered 1..N with no gaps, each with a real storage code
 * (not Not For Storage — that is only ever a per-location carve-out) and size.
 *
 * @returns an error code, or null if the list is valid
 */
export function validateLevels(levels: LevelSetting[], lookups: SetupLookups): string | null {
  if (levels.length === 0) return 'LEVELS_REQUIRED';
  if (levels.length > MAX_LEVEL) return 'TOO_MANY_LEVELS';
  const sorted = [...levels].sort((a, b) => a.level - b.level);
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i].level !== i + 1) return 'LEVELS_NOT_CONTIGUOUS';
    if (sorted[i].storageCode === NOT_FOR_STORAGE_CODE) return 'NOT_FOR_STORAGE_IN_SETUP';
    if (!lookups.storageCodes.includes(sorted[i].storageCode)) return 'INVALID_STORAGE_CODE';
    if (!lookups.sizes.includes(sorted[i].size)) return 'INVALID_SIZE';
  }
  return null;
}

/**
 * Checks the four zone ranges: zones 1–4 each once, together covering firstBin..lastBin
 * exactly with no gaps or overlaps, each holding at least one location, and numbered in
 * the aisle's direction (Zone 1 at the highest bins for BACK_TO_FRONT, the lowest for
 * FRONT_TO_BACK).
 *
 * @returns an error code, or null if the ranges are valid
 */
export function validateZoneRanges(def: Pick<AisleDefinition, 'sides' | 'firstBin' | 'lastBin' | 'zoneDirection' | 'zones'>): string | null {
  const { zones } = def;
  if (zones.length !== ZONE_COUNT) return 'ZONES_INVALID';
  if (ZONE_NUMBERS.some((n) => zones.filter((z) => z.zone === n).length !== 1)) return 'ZONES_INVALID';
  if (zones.some((z) => !Number.isInteger(z.startBin) || !Number.isInteger(z.endBin) || z.startBin > z.endBin)) {
    return 'ZONES_INVALID';
  }

  const byBin = [...zones].sort((a, b) => a.startBin - b.startBin);
  if (byBin[0].startBin !== def.firstBin || byBin[ZONE_COUNT - 1].endBin !== def.lastBin) return 'ZONES_NOT_COVERING';
  for (let i = 1; i < byBin.length; i++) {
    if (byBin[i].startBin !== byBin[i - 1].endBin + 1) return 'ZONES_NOT_COVERING';
  }

  const expected = def.zoneDirection === 'BACK_TO_FRONT' ? [4, 3, 2, 1] : [1, 2, 3, 4];
  if (byBin.some((z, i) => z.zone !== expected[i])) return 'ZONES_OUT_OF_ORDER';

  for (const z of zones) {
    if (binsOf(def.sides, z.startBin, z.endBin).length === 0) return 'ZONE_EMPTY';
  }
  return null;
}

/**
 * Checks a whole aisle definition.
 *
 * @returns an error code (the first problem found), or null if the definition is valid
 */
export function validateDefinition(def: AisleDefinition, lookups: SetupLookups): string | null {
  if (!Number.isInteger(def.aisle) || def.aisle < 1 || def.aisle > MAX_AISLE) return 'INVALID_AISLE';
  if (!AISLE_SIDES.includes(def.sides)) return 'INVALID_SIDES';
  if (!ZONE_DIRECTIONS.includes(def.zoneDirection)) return 'INVALID_DIRECTION';
  if (!Number.isInteger(def.firstBin) || !Number.isInteger(def.lastBin)) return 'INVALID_BINS';
  if (def.firstBin < 1 || def.lastBin > MAX_BIN || def.firstBin > def.lastBin) return 'INVALID_BINS';

  const zoneError = validateZoneRanges(def);
  if (zoneError) return zoneError;

  const sides = sidesOf(def.sides);
  for (const side of sides) {
    const error = validateLevels(def.sideLevels[side] ?? [], lookups);
    if (error) return error;
  }
  for (const override of def.zoneOverrides) {
    if (!ZONE_NUMBERS.includes(override.zone as 1 | 2 | 3 | 4) || !sides.includes(override.side)) return 'INVALID_OVERRIDE';
    const error = validateLevels(override.levels, lookups);
    if (error) return error;
  }
  const seen = new Set(def.zoneOverrides.map((o) => `${o.zone}|${o.side}`));
  if (seen.size !== def.zoneOverrides.length) return 'INVALID_OVERRIDE';
  return null;
}

/** @returns every zone setting the definition produces, ordered zone, side, level */
export function zoneSettingsOf(def: AisleDefinition): ZoneSetting[] {
  const settings: ZoneSetting[] = [];
  for (const zone of ZONE_NUMBERS) {
    for (const side of sidesOf(def.sides)) {
      for (const level of levelsFor(def, zone, side)) settings.push({ zone, side, ...level });
    }
  }
  return settings.sort((a, b) => a.zone - b.zone || a.side.localeCompare(b.side) || a.level - b.level);
}

/**
 * Every Location row an aisle definition produces: one per bin × level, each bin's levels
 * taken from its zone-side. Assumes the definition has passed validateDefinition.
 */
export function expandLocations(def: AisleDefinition): ExpandedLocation[] {
  const rows: ExpandedLocation[] = [];
  for (const bin of binsOf(def.sides, def.firstBin, def.lastBin)) {
    const zone = zoneOfBin(def.zones, bin);
    if (zone == null) continue;
    for (const level of levelsFor(def, zone, sideOfBin(bin))) {
      rows.push({ aisle: def.aisle, bin, level: level.level, zone, storageCode: level.storageCode, size: level.size });
    }
  }
  return rows;
}

/** Contraction preset: every floor location (level 1 of every zone-side). */
export function floorPresetCells(settings: ZoneSetting[]): ZoneCellKey[] {
  return settings.filter((s) => s.level === 1).map(({ zone, side, level }) => ({ zone, side, level }));
}

/**
 * Contraction preset: the top of every zone-side — its highest level, or its top three
 * levels when that highest level is Half Small or Extra Small. Worked out per zone-side,
 * since split and folded aisles top out at different levels by side and zone.
 */
export function topPresetCells(settings: ZoneSetting[]): ZoneCellKey[] {
  const cells: ZoneCellKey[] = [];
  const groups = new Map<string, ZoneSetting[]>();
  for (const s of settings) {
    const key = `${s.zone}|${s.side}`;
    groups.set(key, [...(groups.get(key) ?? []), s]);
  }
  for (const levels of groups.values()) {
    const top = levels.reduce((a, b) => (b.level > a.level ? b : a));
    const count = SMALL_TOP_SIZES.includes(top.size) ? SMALL_TOP_LEVEL_COUNT : 1;
    for (const s of levels) {
      if (s.level > top.level - count) cells.push({ zone: s.zone, side: s.side, level: s.level });
    }
  }
  return cells.sort((a, b) => a.zone - b.zone || a.side.localeCompare(b.side) || a.level - b.level);
}

// ── API contract (GET/POST/PATCH /api/aisles…) ──────────────────────────────────

/** @returns true if the value is ODD or EVEN */
export function isBinSide(value: unknown): value is BinSide {
  return value === 'ODD' || value === 'EVEN';
}

/** An aisle as listed in the picker. */
export interface AisleSummary {
  aisle: number;
  sides: AisleSides;
  firstBin: number;
  lastBin: number;
  zoneDirection: ZoneDirection;
}

/** A zone setting plus what its locations currently look like. */
export interface ZoneCellView extends ZoneSetting {
  /** Locations on this level of this zone-side. */
  locations: number;
  /** Of those, how many hold freight or are reserved (anything but EMPTY / STAGED). */
  occupied: number;
  notForStorage: number;
  contracted: number;
}

/** A location carved out to Not For Storage. */
export interface CarveOutView {
  /** 8-digit location ID. */
  location: string;
  zone: number;
  side: BinSide;
  level: number;
  reason: string | null;
  note: string | null;
}

/** Everything the Location Setup screen shows for one aisle. */
export interface AisleView extends AisleSummary {
  zones: ZoneRange[];
  cells: ZoneCellView[];
  carveOuts: CarveOutView[];
}

/** One location inside a zone cell. */
export interface CellLocationView {
  location: string;
  bin: number;
  level: number;
  status: string;
  storageCode: string;
  contraction: boolean;
  pallets: number;
  notForStorageReason: string | null;
  notForStorageNote: string | null;
}

/** Most locations an "occupied" warning lists by ID. */
export const OCCUPIED_EXAMPLE_LIMIT = 10;
