export interface ParsedLocation { aisle: number; bin: number; }
export interface ParsedFullLocation { aisle: number; bin: number; level: number; }

/**
 * Parses a 6- or 8-digit location barcode into aisle and bin.
 * The level (digits 7–8) is discarded per outline.md — puts and pulls
 * are confirmed at the bin level regardless of which level was scanned.
 * Returns null if the input is not exactly 6 or 8 digits.
 */
export function parseLocationBarcode(input: string): ParsedLocation | null {
  const digits = input.trim();
  if (!/^\d{6}$/.test(digits) && !/^\d{8}$/.test(digits)) return null;
  return {
    aisle: parseInt(digits.slice(0, 3), 10),
    bin:   parseInt(digits.slice(3, 6), 10),
  };
}

/**
 * Parses an 8-digit location barcode into aisle, bin, and level.
 * Used for Location ID screen lookups where the specific level matters.
 * Scans always return 8 digits; rejects anything shorter or longer.
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

/**
 * Formats a location composite key as a zero-padded 8-character string.
 * Format: AAABBBLL (aisle 3 digits, bin 3 digits, level 2 digits) — the inverse of
 * parseFullLocationBarcode.
 */
export function formatLocationId(aisle: number, bin: number, level: number): string {
  return String(aisle).padStart(3, '0') + String(bin).padStart(3, '0') + String(level).padStart(2, '0');
}
