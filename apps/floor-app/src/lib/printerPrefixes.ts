/**
 * Printer code prefix convention (#168, Feature-14 brief). Every code is exactly 4
 * characters: a prefix naming the printer type/area, then digits for the unit. A client-side
 * reference used to describe options in the picker — **not** validation (validation is
 * existence + active in the Printer table).
 */
export const PRINTER_PREFIXES: { prefix: string; meaning: string }[] = [
  { prefix: 'OCL', meaning: 'Label Hut' },
  { prefix: 'OBP', meaning: 'Backpack Label Hut' },
  { prefix: 'ART', meaning: 'ART line (Inbound)' },
  { prefix: 'MBP', meaning: 'Breakpack' },
  { prefix: 'IM', meaning: 'Inventory Manager Cage' },
  { prefix: 'QA', meaning: 'ICQA' },
  { prefix: 'RC', meaning: 'Mobile' },
  { prefix: 'PS', meaning: 'Inbound Problem Solver' },
  { prefix: 'DP', meaning: 'Depal / Mezzanine' },
  { prefix: 'A', meaning: 'Aisle' },
  { prefix: 'R', meaning: 'Door' },
];

/** The printer type a code's prefix names (longest prefix wins), or null if unrecognized. */
export function printerTypeOf(code: string): string | null {
  const upper = code.toUpperCase();
  const hit = PRINTER_PREFIXES.find((p) => upper.startsWith(p.prefix));
  return hit?.meaning ?? null;
}

/** Default printer for PAR (Feature-14 brief). */
export const DEFAULT_PRINTER = 'OCL0';
