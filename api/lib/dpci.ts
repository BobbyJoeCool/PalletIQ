export interface ParsedDpci {
  dept: number;
  class: number;
  item: number;
}

/**
 * Parses a DPCI barcode/input into dept/class/item — accepts either the 9-digit
 * concatenated form or the dash-separated `ddd-cc-iiii` display form (dashes are
 * stripped before validation). Returns null (rather than throwing) on anything that
 * isn't exactly 9 digits once dashes are removed, so callers can choose their own error.
 */
export function parseDpci(input: string): ParsedDpci | null {
  const digits = input.replace(/-/g, '');
  if (!/^\d{9}$/.test(digits)) return null;
  return {
    dept: parseInt(digits.slice(0, 3), 10),
    class: parseInt(digits.slice(3, 5), 10),
    item: parseInt(digits.slice(5, 9), 10),
  };
}

/** Formats dept/class/item into the display DPCI string: `ddd-cc-iiii`, zero-padded. */
export function formatDpci(dept: number, cls: number, item: number): string {
  return `${String(dept).padStart(3, '0')}-${String(cls).padStart(2, '0')}-${String(item).padStart(4, '0')}`;
}
