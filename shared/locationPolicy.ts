// Location acceptance policy (#212) — the one answer to "can this location accept a put,
// a stage, a reinstate, or a hold change?". Pure: no Prisma client, no HTTP. The API's
// handlers and query filters (api/lib/locationPolicy.ts builds Prisma `where` fragments from
// the constants below) and the floor app's pre-checks all read from here, so a check and its
// query can't drift apart.
//
// Before this module the rule was answered in ~9 places (logicGate's deniesReservation,
// zoneLogic's NOT_HELD_FILTER, two in-memory zone-summary loops, MNP's manual-confirm gate,
// PAR's needsConfirm, PAR's client-only storage mismatch, and the hold role tables duplicated
// in locations.ts and HoldPanel.tsx) — and PAR's version disagreed by counting HOLD_OUT.

import { hasMinRole, type Role } from './roles.js';

export type HoldCategory = 'HOLD_IN' | 'HOLD_OUT' | 'HOLD_BOTH' | 'HOLD_PERM';

/**
 * Storage code for a location carved out of use — "Not For Storage" (Location Setup,
 * #143). Set per location, never as a zone's setting, for a spot that is physically
 * blocked (cage carts, end-of-aisle visibility). It accepts no freight of any kind.
 */
export const NOT_FOR_STORAGE_CODE = 'XO';

/** True when a location is carved out to Not For Storage. */
export function isNotForStorage(storageCode: string): boolean {
  return storageCode === NOT_FOR_STORAGE_CODE;
}

/** Every hold category, low → high priority (HOLD_IN = HOLD_OUT < HOLD_BOTH < HOLD_PERM). */
export const HOLD_CATEGORIES: readonly HoldCategory[] = ['HOLD_IN', 'HOLD_OUT', 'HOLD_BOTH', 'HOLD_PERM'];

/**
 * Holds that block anything *coming into* a location (put, stage, reserve, reinstate).
 * HOLD_OUT is outbound-only and never blocks inbound work.
 */
export const INBOUND_BLOCKING_HOLDS: readonly HoldCategory[] = ['HOLD_IN', 'HOLD_BOTH', 'HOLD_PERM'];

/** Minimum role to place each hold category (Hold Both is placeable by anyone). */
export const HOLD_PLACE_MIN_ROLE: Record<HoldCategory, Role> = {
  HOLD_IN: 'IM',
  HOLD_OUT: 'IM',
  HOLD_BOTH: 'WORKER',
  HOLD_PERM: 'LEAD',
};

/** Minimum role to remove (or replace / downgrade) each hold category. */
export const HOLD_REMOVE_MIN_ROLE: Record<HoldCategory, Role> = {
  HOLD_IN: 'IM',
  HOLD_OUT: 'IM',
  HOLD_BOTH: 'IM',
  HOLD_PERM: 'LEAD',
};

/** Type guard for a hold category read from an untyped source. */
export function isHoldCategory(value: unknown): value is HoldCategory {
  return typeof value === 'string' && (HOLD_CATEGORIES as readonly string[]).includes(value);
}

/** The fields of a location the policy reads. `holdCategory` is typed loosely because the
 *  DB column is a plain string; anything that isn't a known category is treated as no hold. */
export interface PolicyLocation {
  status: string;
  holdCategory: string | null;
  contraction: boolean;
  storageCode: string;
}

/** True when the hold blocks inbound work. */
export function blocksInbound(holdCategory: string | null): boolean {
  return holdCategory != null && (INBOUND_BLOCKING_HOLDS as readonly string[]).includes(holdCategory);
}

/** True when a location may be reserved or receive a put at all (not Not For Storage, not
 *  contracted, not inbound-held). Status is the caller's concern — different intents
 *  accept different ones. */
export function acceptsInbound(loc: Pick<PolicyLocation, 'holdCategory' | 'contraction' | 'storageCode'>): boolean {
  return !isNotForStorage(loc.storageCode) && !loc.contraction && !blocksInbound(loc.holdCategory);
}

/** True when a location can be staged: EMPTY and accepting inbound work. */
export function stageable(loc: PolicyLocation): boolean {
  return loc.status === 'EMPTY' && acceptsInbound(loc);
}

/** True when a location counts as open capacity in a zone/aisle summary: EMPTY or STAGED,
 *  and accepting inbound work. */
export function countsAsOpenCapacity(loc: PolicyLocation): boolean {
  return (loc.status === 'EMPTY' || loc.status === 'STAGED') && acceptsInbound(loc);
}

// ── Decisions ───────────────────────────────────────────────────────────────────

/**
 * A policy verdict. `confirm` means the action may proceed only after the caller supplies
 * the matching acknowledgement; `deny` is a hard stop. `code` is the API error code;
 * `httpStatus` is the status the API answers with.
 */
export type Decision =
  | { kind: 'allow' }
  | { kind: 'confirm'; code: string; httpStatus: 409; reasons?: string[] }
  | { kind: 'deny'; code: string; httpStatus: 403 };

const ALLOW: Decision = { kind: 'allow' };

/** Acknowledgements a manual put (MNP) can carry. */
export interface PutAcks {
  contraction?: boolean;
  hold?: boolean;
}

/**
 * Manual put (MNP `manual/confirm`) onto a chosen destination.
 * - Not For Storage: denied for every role (no override path).
 * - Contracted: Worker denied; IM+ must acknowledge.
 * - HOLD_PERM: denied for every role (no override path).
 * - HOLD_IN / HOLD_BOTH: Worker denied; IM+ must acknowledge.
 * - HOLD_OUT / none: allowed.
 * Not For Storage is checked first (nothing may override it), then contraction, matching
 * the original gate order.
 */
export function putDecision(loc: PolicyLocation, role: Role, acks: PutAcks): Decision {
  if (isNotForStorage(loc.storageCode)) return { kind: 'deny', code: 'NOT_FOR_STORAGE', httpStatus: 403 };
  const imPlus = hasMinRole(role, 'IM');
  if (loc.contraction) {
    if (!imPlus) return { kind: 'deny', code: 'CONTRACTED', httpStatus: 403 };
    if (!acks.contraction) return { kind: 'confirm', code: 'CONTRACTION_CONFIRM_REQUIRED', httpStatus: 409 };
  }
  if (loc.holdCategory === 'HOLD_PERM') return { kind: 'deny', code: 'DESTINATION_HOLD_PERM', httpStatus: 403 };
  if (loc.holdCategory === 'HOLD_IN' || loc.holdCategory === 'HOLD_BOTH') {
    if (!imPlus) return { kind: 'deny', code: 'DESTINATION_ON_HOLD', httpStatus: 403 };
    if (!acks.hold) return { kind: 'confirm', code: 'HOLD_CONFIRM_REQUIRED', httpStatus: 409 };
  }
  return ALLOW;
}

/** Reasons a reinstate location warrants a warn-then-allow confirmation. */
export type ReinstateReason = 'OCCUPIED' | 'ON_HOLD' | 'CONTRACTED' | 'STORAGE_MISMATCH';

/**
 * Lists why reinstating (PAR) onto this location needs confirmation. Never a hard deny —
 * the pallet being reinstated is very likely already physically there. HOLD_OUT is ignored
 * (outbound-only, same as every other inbound path — direct instruction 2026-11-15; PAR
 * previously counted it). A storage-code mismatch between the item and the location is a
 * reason too (server-enforced since v1.10.0; was client-only).
 * @param itemStorageCode - the item's storage code, or null to skip the mismatch check
 */
export function reinstateReasons(
  loc: PolicyLocation & { storageCode: string },
  itemStorageCode: string | null,
): ReinstateReason[] {
  const reasons: ReinstateReason[] = [];
  if (loc.status !== 'EMPTY') reasons.push('OCCUPIED');
  if (blocksInbound(loc.holdCategory)) reasons.push('ON_HOLD');
  if (loc.contraction) reasons.push('CONTRACTED');
  if (itemStorageCode != null && itemStorageCode !== loc.storageCode) reasons.push('STORAGE_MISMATCH');
  return reasons;
}

/** PAR reinstate verdict: a hard stop onto a Not For Storage location (nothing can be
 *  there); otherwise confirm with the reasons until acknowledged, else allow. */
export function reinstateDecision(
  loc: PolicyLocation & { storageCode: string },
  itemStorageCode: string | null,
  acknowledged: boolean,
): Decision {
  if (isNotForStorage(loc.storageCode)) return { kind: 'deny', code: 'NOT_FOR_STORAGE', httpStatus: 403 };
  const reasons = reinstateReasons(loc, itemStorageCode);
  if (reasons.length > 0 && !acknowledged) {
    return { kind: 'confirm', code: 'LOCATION_NEEDS_CONFIRM', httpStatus: 409, reasons };
  }
  return ALLOW;
}

// ── Hold transitions ────────────────────────────────────────────────────────────

/**
 * Single-location hold placement (WLH / HoldPanel). The role must be allowed to place the
 * requested type, and — when replacing a *different* existing hold — must also be allowed to
 * remove the existing one (otherwise a role could route around the remove gate by placing a
 * lower-gated type). Re-placing the same type isn't a change and skips the remove check.
 */
export function holdTransition(existing: HoldCategory | null, requested: HoldCategory, role: Role): Decision {
  if (!hasMinRole(role, HOLD_PLACE_MIN_ROLE[requested])) return { kind: 'deny', code: 'FORBIDDEN', httpStatus: 403 };
  if (existing && existing !== requested && !hasMinRole(role, HOLD_REMOVE_MIN_ROLE[existing])) {
    return { kind: 'deny', code: 'FORBIDDEN', httpStatus: 403 };
  }
  return ALLOW;
}

/** Hold types a role may place on a location currently holding `existing` — empty while the
 *  role can't remove the existing hold (same routing-around rule as `holdTransition`). */
export function placeableHoldTypes(existing: HoldCategory | null, role: Role): HoldCategory[] {
  if (existing && !hasMinRole(role, HOLD_REMOVE_MIN_ROLE[existing])) return [];
  return HOLD_CATEGORIES.filter((t) => hasMinRole(role, HOLD_PLACE_MIN_ROLE[t]));
}

export type RangePlaceOutcome = 'placed' | 'upgraded' | 'blocked';

/**
 * Range Place hierarchy (low → high HI = HO < HB < HP). Depends only on the
 * (requested, existing) pair, which is what lets a range write batch by existing bucket.
 */
export function resolveRangePlace(
  requested: HoldCategory,
  existing: HoldCategory | null,
): { next: HoldCategory; outcome: RangePlaceOutcome } {
  if (requested === 'HOLD_PERM') return { next: 'HOLD_PERM', outcome: 'placed' };
  if (requested === 'HOLD_BOTH') {
    return existing === 'HOLD_PERM' ? { next: existing, outcome: 'blocked' } : { next: 'HOLD_BOTH', outcome: 'placed' };
  }
  const opposite: HoldCategory = requested === 'HOLD_IN' ? 'HOLD_OUT' : 'HOLD_IN';
  if (existing === opposite) return { next: 'HOLD_BOTH', outcome: 'upgraded' };
  if (existing === 'HOLD_BOTH' || existing === 'HOLD_PERM') return { next: existing, outcome: 'blocked' };
  return { next: requested, outcome: 'placed' };
}

export type RangeReleaseOutcome = 'released' | 'downgraded' | 'untouched';

/**
 * Range Release hierarchy (#123). Releasing Permanent clears everything at/below it;
 * releasing Both clears Both plus pure In/Out; releasing In/Out downgrades a Both to the
 * opposite direction, clears an exact match, and leaves the opposite direction and
 * Permanent untouched. Role gating is the caller's job (per source bucket).
 */
export function resolveRangeRelease(
  requested: HoldCategory,
  existing: HoldCategory,
): { next: HoldCategory | null; outcome: RangeReleaseOutcome } {
  if (existing === 'HOLD_PERM' && requested !== 'HOLD_PERM') return { next: existing, outcome: 'untouched' };
  if (requested === 'HOLD_PERM' || requested === 'HOLD_BOTH') return { next: null, outcome: 'released' };
  const opposite: HoldCategory = requested === 'HOLD_IN' ? 'HOLD_OUT' : 'HOLD_IN';
  if (existing === 'HOLD_BOTH') return { next: opposite, outcome: 'downgraded' };
  if (existing === requested) return { next: null, outcome: 'released' };
  return { next: existing, outcome: 'untouched' };
}
