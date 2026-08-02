import prisma from './prisma.js';
import type { Prisma } from '../generated/prisma/index.js';
import { NOT_HELD_FILTER } from './zoneLogic.js';

/**
 * The Logic Gate (GitHub #149, design doc `DevNotes/DesignPrompts/
 * Shared-Infrastructure-Design-Spec.md`) — the single owner of every status write to
 * `Location` and `Pallet`. No handler writes `status`/`holdCategory`-adjacent Location
 * fields or `Pallet.status` directly (outside `demo-reseed.ts`, an explicit carve-out —
 * see its own note below); every write instead calls one of the intents below.
 *
 * Each intent is documented against the design spec's own Intent Reference tables
 * (preferred status, fallback chain, deny conditions, expiry/revert) — this file is the
 * authoritative implementation of those tables, not a paraphrase of them.
 *
 * **`statusExpiry`/`revertStatus` (#150) are a mirror, not the active enforcer.** SDP's
 * existing `Reservation` table (`createdAt` + `wasStaged`) plus `reservationTimer.ts`'s
 * per-minute cron (atomic `deleteMany`-claim, the "#93" race-safety pattern reused by
 * confirm/unassign/block) remains the sole *active* expiry mechanism for RESERVE_PUT —
 * this predates the design doc, which never mentions the Reservation table at all.
 * `reservePut` below still creates a `Reservation` row exactly as before; `statusExpiry`/
 * `revertStatus` are written alongside it for design-doc conformance and future lazy-check
 * use, not wired to any new active enforcement in this pass.
 *
 * **Scope of this pass:** every intent is implemented per the design doc's full contract,
 * but only the call sites with a real, currently-existing caller are migrated onto them
 * (see each intent's own doc comment for which). `receivePallet`, `reserveBulk`, and
 * `reserveReinstate` have no live caller yet (no receiving flow, Bulk Pull #137, and PAR's
 * reinstate flow all predate/exceed this pass) — implemented per spec, ready for whoever
 * builds those callers. `demo-reseed.ts` (the seed/reseed generator) is explicitly left on
 * direct writes — it fabricates deliberately-edge-case initial/reset state a validating
 * Gate would likely reject, not a real workflow action to police.
 */

// ── Shared helpers ──────────────────────────────────────────────────────────────

export type LocationCoords = { aisle: number; bin: number; level: number };

const RESERVE_PUT_EXPIRY_MINUTES = 5;
const RESERVE_REINSTATE_EXPIRY_MINUTES = 30;

/** Statuses that deny any of the RESERVE_ or STAGE_LOCATION intents outright — same three
 *  hold categories `manualConfirm`'s own hold gate and every RESERVE_ intent in the
 *  design doc use (HOLD_OUT is deliberately excluded — outbound-only, never blocks a
 *  put/stage/reserve, matching `zoneLogic.ts`'s NOT_HELD_FILTER elsewhere in the app). */
const DENYING_HOLD_CATEGORIES = new Set(['HOLD_IN', 'HOLD_BOTH', 'HOLD_PERM']);

function deniesReservation(location: { holdCategory: string | null; contraction: boolean }): boolean {
  return location.contraction || (location.holdCategory != null && DENYING_HOLD_CATEGORIES.has(location.holdCategory));
}

// ── Pallet-side intents ─────────────────────────────────────────────────────────

/**
 * RECEIVE_PALLET — preferred `PUT_PENDING`, no fallback, no deny condition (a pure
 * derivation: cartons > 0, no location assigned yet). No live caller exists in this
 * codebase today (receiving isn't a built flow) — implemented per spec for whenever one is.
 */
export async function receivePallet(palletId: number): Promise<void> {
  await prisma.pallet.update({ where: { pid: palletId }, data: { status: 'PUT_PENDING' } });
}

/**
 * ZERO_PALLET — preferred `CONSOLIDATED`, fallback `CANCELED`; cascades to
 * `clearLocation` on the pallet's own prior location, if any. The design doc frames the
 * CONSOLIDATED/CANCELED choice as resolved "via pointer-field lookup," but no such pointer
 * field exists on `Pallet` in this schema (the consolidate branch that zeroes an incoming
 * pallet today, `manualConfirm` in `puts.ts`, never records which occupant it was merged
 * into). Since the only live caller already knows unambiguously which case applies (it's
 * inside its own `resolution === 'consolidate'` branch), this takes an explicit `outcome`
 * from the caller instead of inferring one from nonexistent data — no external behavior
 * changes, this only avoids a needless net-new schema field with no other consumer.
 */
export async function zeroPallet(
  palletId: number,
  outcome: 'CONSOLIDATED' | 'CANCELED',
  priorLocation: LocationCoords | null,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.pallet.update({
      where: { pid: palletId },
      data: {
        currentPallets: 0, currentCartons: 0, currentSSPs: 0,
        status: outcome,
        locationAisle: null, locationBin: null, locationLevel: null,
        storageCode: null, size: null, zone: null,
      },
    });
    if (priorLocation) {
      await clearLocationTx(tx, { ...priorLocation, excludePalletId: palletId });
    }
  });
}

/**
 * The location-side half of PUT_COMPLETE — marks a location STORED and clears any
 * RESERVED-related `statusExpiry`/`revertStatus`. Split out from `putComplete` below so a
 * caller that isn't moving an *existing* pallet (PAR's `reinstatePallet`, which creates a
 * brand-new `Pallet` row rather than updating one) can still route its location write
 * through the Gate without forcing a pallet-update shape that doesn't fit.
 */
async function storeLocation(aisle: number, bin: number, level: number): Promise<void> {
  await prisma.location.update({
    where: { LocationID: { aisle, bin, level } },
    data: { status: 'STORED', statusExpiry: null, revertStatus: null },
  });
}

/**
 * PUT_COMPLETE — preferred `STORED`; clears `RESERVED` on the target location (via
 * `storeLocation`) in the same call. Wired to `placePallet`'s "store at the new location"
 * half (`puts.ts`, shared by SDP `confirmPut` and MNP `manualConfirm`).
 *
 * PAR's `reinstatePallet` does **not** call this — it creates a new `Pallet` row rather
 * than updating an existing one, which this function's pallet-side write doesn't support.
 * Its location write instead calls `storeLocationForCreate` below.
 */
export async function putComplete(params: {
  palletId: number; aisle: number; bin: number; level: number; workerZ: string;
}): Promise<void> {
  const { palletId, aisle, bin, level, workerZ } = params;
  const newLoc = await prisma.location.findUniqueOrThrow({
    where: { LocationID: { aisle, bin, level } },
    select: { storageCode: true, size: true, zone: true },
  });
  await prisma.$transaction([
    prisma.location.update({
      where: { LocationID: { aisle, bin, level } },
      data: { status: 'STORED', statusExpiry: null, revertStatus: null },
    }),
    prisma.pallet.update({
      where: { pid: palletId },
      data: {
        locationAisle: aisle, locationBin: bin, locationLevel: level,
        storageCode: newLoc.storageCode, size: newLoc.size, zone: newLoc.zone,
        status: 'STORED', putByZ: workerZ, putAt: new Date(),
      },
    }),
  ]);
}

/**
 * PAR-specific: the location-side half of PUT_COMPLETE, for a pallet being *created*
 * already-STORED (see `putComplete`'s own doc comment for why PAR can't use that function
 * directly). Only ever called when placing directly onto a previously-EMPTY location — no
 * reservation exists to clear in that case, so this is a bare status write, not a full
 * `clearLocation`-then-store sequence.
 */
export async function storeLocationForCreate(aisle: number, bin: number, level: number): Promise<void> {
  await storeLocation(aisle, bin, level);
}

/**
 * COMPLETE_PULL — preferred `STORED` or `PULLED`, fallback `PULL_PENDING` (in practice
 * `CA_PULL_PEND`/`FP_PULL_PEND` — see the module-level note on those values); cascades to
 * `clearLocation` if resolved `PULLED`. Wired to PIP's `verifyPull` (`pulls.ts`), called
 * only for its one actual live trigger today — every outstanding container against the
 * pallet has now been pulled, attempt `STORED` — not extended to also detect/produce
 * `PULLED` (a fully-emptied pallet), since nothing in the current codebase does that
 * detection and adding it here would be a silent behavior change, not a migration.
 */
export async function completePull(palletId: number): Promise<void> {
  await prisma.pallet.update({ where: { pid: palletId }, data: { status: 'STORED' } });
}

// ── Location-side intents ───────────────────────────────────────────────────────

async function clearLocationTx(
  tx: Prisma.TransactionClient,
  params: { aisle: number; bin: number; level: number; excludePalletId?: number; overrideRevert?: 'EMPTY' },
): Promise<'EMPTY' | 'STORED' | 'STAGED'> {
  const { aisle, bin, level, excludePalletId, overrideRevert } = params;

  // Any caller's clearLocation also cleans up a stray Reservation row for this location —
  // harmless no-op (count 0) for SDP's own unassign/confirm/block, which already claimed
  // (deleted) their own Reservation row before calling this (the #93 race-safety pattern,
  // preserved unchanged in puts.ts); this is what makes clearLocation safe for a caller
  // like WLH's hold placement, which has never touched Reservation at all.
  await tx.reservation.deleteMany({ where: { locationAisle: aisle, locationBin: bin, locationLevel: level } });

  // #86's fix, generalized: fall back to STORED instead of the resolved revert target if
  // another pallet still occupies this exact location.
  const stillOccupied = await tx.pallet.count({
    where: {
      locationAisle: aisle, locationBin: bin, locationLevel: level,
      ...(excludePalletId != null && { pid: { not: excludePalletId } }),
    },
  });
  if (stillOccupied > 0) {
    await tx.location.update({
      where: { LocationID: { aisle, bin, level } },
      data: { status: 'STORED', statusExpiry: null, revertStatus: null },
    });
    return 'STORED';
  }

  const current = await tx.location.findUniqueOrThrow({
    where: { LocationID: { aisle, bin, level } },
    select: { revertStatus: true },
  });
  const resolved = (overrideRevert ?? current.revertStatus ?? 'EMPTY') as 'EMPTY' | 'STAGED';
  await tx.location.update({
    where: { LocationID: { aisle, bin, level } },
    data: { status: resolved, statusExpiry: null, revertStatus: null },
  });
  return resolved;
}

/**
 * CLEAR_LOCATION — preferred `EMPTY`; falls back to `STORED` if another pallet still
 * occupies the exact location (#86's existing fix, generalized from `vacatedLocationStatus`
 * in `puts.ts`). Resolves its non-occupied target from `overrideRevert` if given, else the
 * location's own stored `revertStatus` mirror, else `EMPTY` — always clears `statusExpiry`/
 * `revertStatus` in the same write. `excludePalletId` matters when the pallet being placed
 * elsewhere is itself still (momentarily) pointing at the location being cleared.
 *
 * Reused by: `placePallet`'s old-location clear, SDP's `unassignPut`/`blockPut`, MNP's
 * consolidate-vacate (via `zeroPallet`), STG's per-location restage step, and WLH's
 * hold-placement side effect (`overrideRevert: 'EMPTY'`, per the design doc's "placing a
 * hold also calls the Gate... forcing the reservation to revert to EMPTY regardless of
 * what its stored revert-to value would otherwise have been").
 *
 * @returns the status the location actually resolved to — a caller like `unassignPut`
 *   reports this back to the worker (e.g. "released to STAGED/EMPTY"); `STORED` is the
 *   rare dual-occupancy fallback, not the common case for a plain release
 */
export async function clearLocation(params: {
  aisle: number; bin: number; level: number; excludePalletId?: number; overrideRevert?: 'EMPTY';
}): Promise<'EMPTY' | 'STORED' | 'STAGED'> {
  return prisma.$transaction((tx) => clearLocationTx(tx, params));
}

/**
 * RESERVE_PUT — preferred `RESERVED`; denied outright (no fallback) if the location is
 * currently held `HOLD_IN`/`HOLD_BOTH`/`HOLD_PERM` or contracted (`HOLD_OUT` never denies —
 * outbound-only, matches `zoneLogic.ts`'s search-time filter). This re-check closes a real
 * gap in today's code: `findNextLocation`'s search already excludes held/contracted
 * candidates, but the reserve write itself never re-verified between search and write —
 * this is a genuine new race-safety improvement, not just a refactor. On success: creates
 * the `Reservation` row exactly as `directedPut` does today, sets `status = 'RESERVED'`,
 * `statusExpiry = now + 5min`, `revertStatus = wasStaged ? 'STAGED' : 'EMPTY'`.
 *
 * Wired to SDP's `directedPut` and `blockPut`'s re-reserve step (`puts.ts`) — both
 * currently build this same Reservation row + status write inline.
 *
 * @throws Error('LOCATION_UNAVAILABLE') if denied — caller decides how to surface it
 */
export async function reservePut(params: {
  aisle: number; bin: number; level: number; palletId: number; workerZ: string;
  targetAisle: number; targetSize: string | null; targetStorage: string | null; targetZone: number | null;
  consolidating: boolean; wasScanned: boolean | null; wasStaged: boolean;
}): Promise<{ reservationId: number }> {
  const { aisle, bin, level } = params;
  return prisma.$transaction(async (tx) => {
    const loc = await tx.location.findUniqueOrThrow({
      where: { LocationID: { aisle, bin, level } },
      select: { holdCategory: true, contraction: true },
    });
    if (deniesReservation(loc)) {
      throw Object.assign(new Error('LOCATION_UNAVAILABLE'), { status: 409 });
    }

    const revertStatus = params.wasStaged ? 'STAGED' : 'EMPTY';
    await tx.location.update({
      where: { LocationID: { aisle, bin, level } },
      data: {
        status: 'RESERVED',
        statusExpiry: new Date(Date.now() + RESERVE_PUT_EXPIRY_MINUTES * 60_000),
        revertStatus,
      },
    });

    const reservation = await tx.reservation.create({
      data: {
        locationAisle: aisle, locationBin: bin, locationLevel: level,
        palletId: params.palletId, workerZ: params.workerZ,
        targetAisle: params.targetAisle,
        targetSize: params.targetSize, targetStorage: params.targetStorage, targetZone: params.targetZone,
        consolidating: params.consolidating, pidWasScanned: params.wasScanned, wasStaged: params.wasStaged,
      },
    });
    return { reservationId: reservation.id };
  });
}

/**
 * RESERVE_BULK — preferred `RESERVED`, accepted only if `EMPTY` (denied otherwise, no
 * fallback — stricter than RESERVE_PUT, which also accepts STAGED), same hold/contraction
 * deny as `reservePut`. No expiry. No live caller yet — Bulk Pull (#137) isn't built;
 * implemented per spec for that future work.
 */
export async function reserveBulk(aisle: number, bin: number, level: number): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const loc = await tx.location.findUniqueOrThrow({
      where: { LocationID: { aisle, bin, level } },
      select: { status: true, holdCategory: true, contraction: true },
    });
    if (loc.status !== 'EMPTY' || deniesReservation(loc)) {
      throw Object.assign(new Error('LOCATION_UNAVAILABLE'), { status: 409 });
    }
    await tx.location.update({ where: { LocationID: { aisle, bin, level } }, data: { status: 'RESERVED' } });
  });
}

/**
 * RESERVE_REINSTATE — preferred `RESERVED`/`PENDING_REINSTATE`, accepted only if `EMPTY`,
 * same hold/contraction deny, 30-min expiry, revert `EMPTY`. Implemented per spec; **not
 * wired to PAR's `reinstatePallet` this round** — PAR creates its Pallet row and (if
 * placing directly) its Location write in one direct step today, with no pending/expiring
 * intermediate state at all. Routing PAR onto this intent would introduce a genuinely new
 * two-phase reserve-then-confirm behavior, not migrate an existing write mechanism — left
 * for a future PAR redesign that actually wants that behavior; PAR's own call site below
 * uses `putComplete` instead, which reproduces its current direct-to-STORED behavior exactly.
 */
export async function reserveReinstate(aisle: number, bin: number, level: number): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const loc = await tx.location.findUniqueOrThrow({
      where: { LocationID: { aisle, bin, level } },
      select: { status: true, holdCategory: true, contraction: true },
    });
    if (loc.status !== 'EMPTY' || deniesReservation(loc)) {
      throw Object.assign(new Error('LOCATION_UNAVAILABLE'), { status: 409 });
    }
    await tx.location.update({
      where: { LocationID: { aisle, bin, level } },
      data: {
        status: 'RESERVED',
        statusExpiry: new Date(Date.now() + RESERVE_REINSTATE_EXPIRY_MINUTES * 60_000),
        revertStatus: 'EMPTY',
      },
    });
  });
}

/**
 * STAGE_LOCATION — preferred `STAGED`; denied outright (no fallback) if the location isn't
 * currently `EMPTY`, or is held `IN`/`BOTH`/`PERM`, or contracted. Uses an atomic
 * conditional `updateMany` (not a separate read-then-write) — `stageLocations`' own
 * existing per-location loop already relies on this shape for concurrency safety across
 * multiple GPMers staging into the same aisle at once; preserved here rather than
 * downgraded to a read-then-write that would reintroduce that race. No separate
 * `UNSTAGE_LOCATION` intent — clearing a staged location, wherever it happens, goes
 * through `clearLocation` (per the design doc's own note).
 *
 * Wired to STG's `stageLocations` (its existing guarded-`updateMany` shape, now including
 * the hold-category check the design doc calls for that today's code doesn't) and
 * `restageAisle`'s per-location re-stage step (`staging.ts`) — NOT `restageAisle`'s own
 * *bulk* unstage-all-of-type-back-to-EMPTY step, which operates on a whole aisle's worth of
 * locations in one `updateMany` and has no natural single-location Gate-intent shape;
 * left as a direct write, a deliberate scope line rather than an oversight.
 *
 * @returns true if staged, false if denied (today's `stageLocations` treats a per-location
 *   denial as an expected, silently-skipped shortfall, not a thrown error)
 */
export async function stageLocation(aisle: number, bin: number, level: number): Promise<boolean> {
  const result = await prisma.location.updateMany({
    where: { aisle, bin, level, status: 'EMPTY', contraction: false, ...NOT_HELD_FILTER },
    data: { status: 'STAGED' },
  });
  return result.count > 0;
}
