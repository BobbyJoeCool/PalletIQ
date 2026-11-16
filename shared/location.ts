// Location ID rules — one definition for the floor app and the API (#217; the API had
// api/lib/locationParser.ts while the client sliced location strings by hand ~20 times).
//
// A full location ID is 8 digits: AAA BBB LL (aisle, bin, level). A 6-digit form (AAA BBB)
// identifies a bin without a level — scanned bin labels and level-less entry use it.

export interface ParsedLocation { aisle: number; bin: number; }
export interface ParsedFullLocation { aisle: number; bin: number; level: number; }

/** Raw (zero-padded string) segments of a 6- or 8-digit location ID. */
export interface LocationSegments { aisle: string; bin: string; level: string | undefined; }

/**
 * Parses a 6- or 8-digit barcode into aisle + bin (level ignored).
 * @returns null when the input isn't exactly 6 or 8 digits
 */
export function parseLocationBarcode(input: string): ParsedLocation | null {
  const digits = input.trim();
  if (!/^\d{6}$/.test(digits) && !/^\d{8}$/.test(digits)) return null;
  return { aisle: parseInt(digits.slice(0, 3), 10), bin: parseInt(digits.slice(3, 6), 10) };
}

/**
 * Parses a full 8-digit location barcode.
 * @returns null when the input isn't exactly 8 digits
 */
export function parseFullLocationBarcode(input: string): ParsedFullLocation | null {
  const digits = input.trim();
  if (!/^\d{8}$/.test(digits)) return null;
  return {
    aisle: parseInt(digits.slice(0, 3), 10),
    bin:   parseInt(digits.slice(3, 6), 10),
    level: parseInt(digits.slice(6, 8), 10),
  };
}

/** Formats numeric parts as the canonical 8-digit location ID. */
export function formatLocationId(aisle: number, bin: number, level: number): string {
  return String(aisle).padStart(3, '0') + String(bin).padStart(3, '0') + String(level).padStart(2, '0');
}

/**
 * Splits a location ID string into its zero-padded segments without parsing to numbers —
 * for entry fields that display/restore each box's raw text. `level` is undefined for a
 * 6-digit (level-less) ID.
 */
export function splitLocationId(id: string): LocationSegments {
  return { aisle: id.slice(0, 3), bin: id.slice(3, 6), level: id.length >= 8 ? id.slice(6, 8) : undefined };
}

/** The 6-digit aisle+bin prefix of a 6- or 8-digit location ID. */
export function aisleBinOf(id: string): string {
  return id.slice(0, 6);
}

/** Replaces (or adds) the level on a 6- or 8-digit location ID. */
export function withLevel(id: string, level: number): string {
  return aisleBinOf(id) + String(level).padStart(2, '0');
}

/** Human display form: `AAA-BBB-LL` (8 digits) or `AAA-BBB` (6 digits); anything else as-is. */
export function displayLocationId(id: string): string {
  if (id.length === 8) return `${id.slice(0, 3)}-${id.slice(3, 6)}-${id.slice(6)}`;
  if (id.length === 6) return `${id.slice(0, 3)}-${id.slice(3)}`;
  return id;
}
