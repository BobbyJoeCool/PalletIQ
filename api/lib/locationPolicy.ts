// Prisma `where` fragments built from the pure location acceptance policy in
// shared/locationPolicy.ts (#212), so every query filter and every in-memory check read the
// same rule. Re-exports the pure policy for API importers.

import { INBOUND_BLOCKING_HOLDS, HOLD_CATEGORIES, NOT_FOR_STORAGE_CODE } from '../../shared/locationPolicy.js';

export * from '../../shared/locationPolicy.js';

/** Hold categories that do NOT block inbound work (today just HOLD_OUT), derived from the
 *  policy rather than hard-coded. */
const NON_BLOCKING_HOLDS = HOLD_CATEGORIES.filter((h) => !INBOUND_BLOCKING_HOLDS.includes(h));

/**
 * `where` fragment: location is not inbound-held. Explicit OR rather than
 * `holdCategory: { notIn: [...] }` — SQL `NOT IN` over a nullable column also excludes NULL
 * rows, which are exactly the unheld majority.
 */
export function whereNotInboundHeld(): { OR: ({ holdCategory: null } | { holdCategory: string })[] } {
  return { OR: [{ holdCategory: null }, ...NON_BLOCKING_HOLDS.map((h) => ({ holdCategory: h }))] };
}

/** `where` fragment: location accepts inbound work (not Not For Storage, not contracted,
 *  not inbound-held, not deleted) — the query form of `acceptsInbound`. Callers add their
 *  own status filter. Not For Storage is a `NOT` rather than a `storageCode` key so it
 *  survives being spread into a `where` that filters on `storageCode` itself. */
export function whereAcceptsPut(): {
  contraction: false;
  deleted: false;
  NOT: { storageCode: string };
  OR: ({ holdCategory: null } | { holdCategory: string })[];
} {
  return { contraction: false, deleted: false, NOT: { storageCode: NOT_FOR_STORAGE_CODE }, ...whereNotInboundHeld() };
}
