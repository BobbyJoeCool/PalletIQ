// Expiration Date window rule — one definition for PAR/PII's live client check and the
// API's editPallet/reinstatePallet validation (#217; previously written twice in
// api/functions/pallets.ts plus a partial copy in useExpirationDateFields).

/** Below this many months out, a new expiration date is blocked outright. */
export const EXPIRATION_MIN_MONTHS = 1;
/** Below this many months out (but at/above the minimum), a date needs explicit confirmation. */
export const EXPIRATION_CONFIRM_MONTHS = 3;

export type ExpirationClass = 'TOO_SOON' | 'NEEDS_CONFIRM' | 'OK';

/** Returns `now` plus `months` calendar months (Date#setMonth semantics). */
function monthsFrom(now: Date, months: number): Date {
  const d = new Date(now.getTime());
  d.setMonth(d.getMonth() + months);
  return d;
}

/**
 * Classifies a proposed expiration date against the 1-month block / 3-month confirm window.
 * @param date - the proposed expiration date
 * @param now - reference "now" (injectable for tests)
 */
export function classifyExpirationDate(date: Date, now: Date = new Date()): ExpirationClass {
  if (date < monthsFrom(now, EXPIRATION_MIN_MONTHS)) return 'TOO_SOON';
  if (date < monthsFrom(now, EXPIRATION_CONFIRM_MONTHS)) return 'NEEDS_CONFIRM';
  return 'OK';
}
