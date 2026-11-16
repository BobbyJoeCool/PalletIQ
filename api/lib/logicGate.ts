import prisma from './prisma.js';
import type { Prisma } from '../generated/prisma/index.js';
import { whereAcceptsPut, acceptsInbound, type HoldCategory } from './locationPolicy.js';

/**
 * The Logic Gate — the reservation / location lifecycle module (GitHub #149, deepened by
 * #211). The single owner of every status write to `Location` and `Pallet` (outside
 * `demo-reseed.ts`, which fabricates edge-case seed state on purpose). Container status
 * transitions live in `containerLifecycle.ts` (#213).
 *
 * **One operation per lifecycle event, and each operation owns its whole protocol** — the
 * #93 reservation claim, the transaction, and every status write. A handler calls exactly
 * one operation per event and never sequences Gate calls itself. Before #211 the handlers
 * owned that protocol: the claim was copied into confirmPut, unassignPut and the expiry
 * timer; a move ran clearLocation and putComplete as two transactions; consolidation and
 * PAR's location write ran outside their transactions; and range holds bypassed the Gate
 * entirely (bug #209).
 *
 * | Event                      | Operation                | Caller                       |
 * |----------------------------|--------------------------|------------------------------|
 * | SDP directs a put          | `reservePut`             | puts.ts directedPut          |
 * | SDP confirms the put       | `confirmReservation`     | puts.ts confirmPut           |
 * | SDP confirms a redirect    | `confirmReservationInto` | puts.ts confirmPut           |
 * | SDP unassigns              | `releaseReservation`     | puts.ts unassignPut          |
 * | Reservation times out      | `expireReservation`      | reservationTimer.ts          |
 * | MNP puts / moves a pallet  | `movePallet`             | puts.ts manualConfirm        |
 * | MNP consolidates           | `consolidateInto`        | puts.ts manualConfirm        |
 * | PAR reinstates onto a loc  | `storeReinstatedPallets` | pallets.ts reinstatePallet   |
 * | STG stages a location      | `stageLocation`          | staging.ts                   |
 * | STG restage clears a type  | `unstageAisleType`       | staging.ts restageAisle      |
 * | A hold is placed           | `placeHold`              | locations.ts placeHold       |
 * | A range hold bucket lands  | `applyRangeHoldBucket`   | locations.ts placeRangeHold  |
 * | A hold is removed          | `removeHold`             | locations.ts removeHold      |
 * | A range release bucket     | `applyRangeReleaseBucket`| locations.ts releaseRangeHold|
 *
 * Operations with a `*Tx` core run inside a caller-supplied transaction client, so tests
 * can run them inside a rolled-back transaction on the local DB (tests/db/).
 *
 * **`statusExpiry`/`revertStatus` (#150) are a mirror, not the active enforcer.** SDP's
 * `Reservation` row (`createdAt` + `wasStaged`) plus `reservationTimer.ts`'s per-minute cron
 * remain the active expiry mechanism; the location columns are written alongside for
 * design-doc conformance.
 */

// ── Shared types & helpers ─────────────────────────────────────────────────────

export type LocationCoords = { aisle: number; bin: number; level: number };
type Tx = Prisma.TransactionClient;

const RESERVE_PUT_EXPIRY_MINUTES = 5;
const CONSOLIDATION_EXPIRY_MINUTES = 15;

function locationKey({ aisle, bin, level }: LocationCoords) {
  return { LocationID: { aisle, bin, level } };
}

/** Formats coords as the 8-digit location ID string handlers report back. */
function locationString({ aisle, bin, level }: LocationCoords): string {
  return String(aisle).padStart(3, '0') + String(bin).padStart(3, '0') + String(level).padStart(2, '0');
}

/** Error thrown when a reservation was already claimed (confirmed, unassigned or expired). */
function reservationGone(): Error {
  return Object.assign(new Error('NOT_FOUND'), { status: 404 });
}

/**
 * The #93 claim: deletes the reservation row inside the transaction before any location or
 * pallet write. Whichever of confirm / unassign / the expiry timer deletes the row first
 * wins; under MySQL row locking a concurrent claimer blocks, then sees count 0.
 * `deleteMany` (not `delete`) so a lost race returns 0 instead of throwing.
 * @returns the claimed reservation, or null if it was already gone
 */
async function claimReservationTx(tx: Tx, reservationId: number) {
  const reservation = await tx.reservation.findUnique({ where: { id: reservationId } });
  if (!reservation) return null;
  const claimed = await tx.reservation.deleteMany({ where: { id: reservationId } });
  return claimed.count === 0 ? null : reservation;
}

/** The claimed reservation row, as the confirm/release operations return it. */
export type ClaimedReservation = NonNullable<Awaited<ReturnType<typeof claimReservationTx>>>;

/** Pre-claim check a confirm runs inside its transaction; throwing aborts without claiming. */
export type VerifyReservation = (reservation: ClaimedReservation, tx: Tx) => void | Promise<void>;

/**
 * CLEAR_LOCATION — preferred `EMPTY`; falls back to `STORED` if another pallet still
 * occupies the exact location (#86). Resolves its non-occupied target from
 * `overrideRevert` if given, else the location's own `revertStatus` mirror, else `EMPTY`,
 * and always clears `statusExpiry`/`revertStatus`. Also deletes any stray Reservation row
 * for the location (a no-op for callers that already claimed theirs). Internal: callers
 * reach it through the lifecycle operations below.
 * @returns the status the location resolved to
 */
async function clearLocationTx(
  tx: Tx,
  params: LocationCoords & { excludePalletId?: number; overrideRevert?: 'EMPTY' },
): Promise<'EMPTY' | 'STORED' | 'STAGED'> {
  const { aisle, bin, level, excludePalletId, overrideRevert } = params;
  await tx.reservation.deleteMany({ where: { locationAisle: aisle, locationBin: bin, locationLevel: level } });

  const stillOccupied = await tx.pallet.count({
    where: {
      locationAisle: aisle, locationBin: bin, locationLevel: level,
      ...(excludePalletId != null && { pid: { not: excludePalletId } }),
    },
  });
  if (stillOccupied > 0) {
    await tx.location.update({ where: locationKey(params), data: { status: 'STORED', statusExpiry: null, revertStatus: null } });
    return 'STORED';
  }

  const current = await tx.location.findUniqueOrThrow({ where: locationKey(params), select: { revertStatus: true } });
  const resolved = (overrideRevert ?? current.revertStatus ?? 'EMPTY') as 'EMPTY' | 'STAGED';
  await tx.location.update({ where: locationKey(params), data: { status: resolved, statusExpiry: null, revertStatus: null } });
  return resolved;
}

/** Marks a location STORED and clears the reservation mirror columns. */
async function storeLocationTx(tx: Tx, coords: LocationCoords): Promise<void> {
  await tx.location.update({ where: locationKey(coords), data: { status: 'STORED', statusExpiry: null, revertStatus: null } });
}

// ── Reservations (SDP) ─────────────────────────────────────────────────────────

/**
 * RESERVE_PUT — `RESERVED`, denied (no fallback) if the location is contracted or
 * inbound-held (location acceptance policy, #212). Re-checks at write time, closing the
 * gap between `findNextLocation`'s search and the write. Creates the `Reservation` row and
 * sets `statusExpiry` (5 min, 15 when consolidating) / `revertStatus` (STAGED or EMPTY).
 * @throws 409 LOCATION_UNAVAILABLE if denied
 */
export async function reservePut(params: LocationCoords & {
  palletId: number; workerZ: string;
  targetAisle: number; targetSize: string | null; targetStorage: string | null; targetZone: number | null;
  consolidating: boolean; wasScanned: boolean | null; wasStaged: boolean;
}): Promise<{ reservationId: number }> {
  const { aisle, bin, level } = params;
  return prisma.$transaction(async (tx) => {
    const loc = await tx.location.findUniqueOrThrow({ where: locationKey(params), select: { holdCategory: true, contraction: true, storageCode: true } });
    if (!acceptsInbound(loc)) throw Object.assign(new Error('LOCATION_UNAVAILABLE'), { status: 409 });

    await tx.location.update({
      where: locationKey(params),
      data: {
        status: 'RESERVED',
        statusExpiry: new Date(Date.now() + (params.consolidating ? CONSOLIDATION_EXPIRY_MINUTES : RESERVE_PUT_EXPIRY_MINUTES) * 60_000),
        revertStatus: params.wasStaged ? 'STAGED' : 'EMPTY',
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

/** Result of moving a pallet: whether it had a prior location, and that location's ID. */
export interface MoveResult { wasMove: boolean; clearedLocation: string | null }

/**
 * Moves a pallet onto a location in the caller's transaction: frees its prior location
 * (CLEAR_LOCATION, dual-occupancy aware) and stores it at the new one (PUT_COMPLETE —
 * location STORED, pallet inherits the location's storage code/size/zone).
 */
export async function movePalletTx(tx: Tx, params: LocationCoords & { palletId: number; workerZ: string }): Promise<MoveResult> {
  const { palletId, workerZ } = params;
  const pallet = await tx.pallet.findUniqueOrThrow({
    where: { pid: palletId },
    select: { locationAisle: true, locationBin: true, locationLevel: true },
  });
  const prior = pallet.locationAisle != null
    ? { aisle: pallet.locationAisle, bin: pallet.locationBin!, level: pallet.locationLevel! }
    : null;
  if (prior) await clearLocationTx(tx, { ...prior, excludePalletId: palletId });

  const dest = await tx.location.findUniqueOrThrow({ where: locationKey(params), select: { storageCode: true, size: true, zone: true } });
  await storeLocationTx(tx, params);
  await tx.pallet.update({
    where: { pid: palletId },
    data: {
      locationAisle: params.aisle, locationBin: params.bin, locationLevel: params.level,
      storageCode: dest.storageCode, size: dest.size, zone: dest.zone,
      status: 'STORED', putByZ: workerZ, putAt: new Date(),
    },
  });
  return prior ? { wasMove: true, clearedLocation: locationString(prior) } : { wasMove: false, clearedLocation: null };
}

/**
 * SDP confirm, in the caller's transaction: claims the reservation and moves its pallet
 * onto the reserved location atomically.
 * @param verify - check run against the reservation before the claim (e.g. the scanned-
 *   location match); throwing from it aborts without claiming
 * @throws 404 NOT_FOUND if the reservation was already claimed
 */
export async function confirmReservationTx(
  tx: Tx,
  reservationId: number,
  workerZ: string,
  verify?: VerifyReservation,
): Promise<{ reservation: ClaimedReservation } & MoveResult> {
  const existing = await tx.reservation.findUnique({ where: { id: reservationId } });
  if (!existing) throw reservationGone();
  await verify?.(existing, tx);
  const reservation = await claimReservationTx(tx, reservationId);
  if (!reservation) throw reservationGone();
  const move = await movePalletTx(tx, {
    palletId: reservation.palletId,
    aisle: reservation.locationAisle, bin: reservation.locationBin, level: reservation.locationLevel,
    workerZ,
  });
  return { reservation, ...move };
}

/** SDP confirm in its own transaction (see `confirmReservationTx`). */
export async function confirmReservation(reservationId: number, workerZ: string, verify?: VerifyReservation) {
  return prisma.$transaction((tx) => confirmReservationTx(tx, reservationId, workerZ, verify));
}

/**
 * SDP confirm onto a redirect target (Exists Elsewhere, #215), in the caller's transaction:
 * `resolveTarget` runs before the claim — it verifies the scan and re-checks the candidate
 * rule, returning the occupant pallet to consolidate into (throwing aborts without
 * claiming). Then: claim the reservation, release the reserved location to its revert
 * status, and consolidate the reservation's pallet into the occupant.
 * @throws 404 NOT_FOUND if the reservation was already claimed
 */
export async function confirmReservationIntoTx(
  tx: Tx,
  reservationId: number,
  resolveTarget: (reservation: ClaimedReservation, tx: Tx) => Promise<number>,
): Promise<{ reservation: ClaimedReservation; targetPalletId: number; moved: { cartons: number; pallets: number; ssps: number } }> {
  const existing = await tx.reservation.findUnique({ where: { id: reservationId } });
  if (!existing) throw reservationGone();
  const targetPalletId = await resolveTarget(existing, tx);
  const claimed = await claimAndClearTx(tx, reservationId);
  if (!claimed) throw reservationGone();
  const moved = await consolidateIntoTx(tx, { sourcePalletId: claimed.reservation.palletId, targetPalletId });
  return { reservation: claimed.reservation, targetPalletId, moved };
}

export async function confirmReservationInto(
  reservationId: number,
  resolveTarget: (reservation: ClaimedReservation, tx: Tx) => Promise<number>,
) {
  return prisma.$transaction((tx) => confirmReservationIntoTx(tx, reservationId, resolveTarget));
}

/** Claims a reservation and clears its location; null when it was already claimed. */
async function claimAndClearTx(tx: Tx, reservationId: number) {
  const reservation = await claimReservationTx(tx, reservationId);
  if (!reservation) return null;
  const releasedStatus = await clearLocationTx(tx, {
    aisle: reservation.locationAisle, bin: reservation.locationBin, level: reservation.locationLevel,
  });
  return { reservation, releasedStatus };
}

/**
 * SDP unassign: claims the reservation and releases its location to its revert status.
 * @throws 404 NOT_FOUND if the reservation was already claimed
 */
export async function releaseReservationTx(tx: Tx, reservationId: number) {
  const result = await claimAndClearTx(tx, reservationId);
  if (!result) throw reservationGone();
  return result;
}

export async function releaseReservation(reservationId: number) {
  return prisma.$transaction((tx) => releaseReservationTx(tx, reservationId));
}

/**
 * Reservation timeout: same as release, but a lost race (already confirmed or unassigned)
 * is expected and returns null instead of throwing.
 */
export async function expireReservationTx(tx: Tx, reservationId: number) {
  return claimAndClearTx(tx, reservationId);
}

export async function expireReservation(reservationId: number) {
  return prisma.$transaction((tx) => expireReservationTx(tx, reservationId));
}

// ── Pallet moves (MNP / PAR) ───────────────────────────────────────────────────

/** MNP put / move in its own transaction (see `movePalletTx`). */
export async function movePallet(params: LocationCoords & { palletId: number; workerZ: string }): Promise<MoveResult> {
  return prisma.$transaction((tx) => movePalletTx(tx, params));
}

/**
 * MNP consolidate, in the caller's transaction: adds the source pallet's quantities onto
 * the target (occupant), zeroes the source as `CONSOLIDATED` (ZERO_PALLET), and frees the
 * source's prior location if it had one. Quantities are read inside the transaction.
 * @returns the quantities moved
 */
export async function consolidateIntoTx(
  tx: Tx,
  params: { sourcePalletId: number; targetPalletId: number },
): Promise<{ cartons: number; pallets: number; ssps: number }> {
  const source = await tx.pallet.findUniqueOrThrow({ where: { pid: params.sourcePalletId } });
  const target = await tx.pallet.findUniqueOrThrow({ where: { pid: params.targetPalletId } });
  await tx.pallet.update({
    where: { pid: target.pid },
    data: {
      currentCartons: target.currentCartons + source.currentCartons,
      currentPallets: target.currentPallets + source.currentPallets,
      currentSSPs:    target.currentSSPs + source.currentSSPs,
    },
  });
  await tx.pallet.update({
    where: { pid: source.pid },
    data: {
      currentPallets: 0, currentCartons: 0, currentSSPs: 0,
      status: 'CONSOLIDATED',
      locationAisle: null, locationBin: null, locationLevel: null,
      storageCode: null, size: null, zone: null,
    },
  });
  if (source.locationAisle != null) {
    await clearLocationTx(tx, {
      aisle: source.locationAisle, bin: source.locationBin!, level: source.locationLevel!,
      excludePalletId: source.pid,
    });
  }
  return { cartons: source.currentCartons, pallets: source.currentPallets, ssps: source.currentSSPs };
}

export async function consolidateInto(params: { sourcePalletId: number; targetPalletId: number }) {
  return prisma.$transaction((tx) => consolidateIntoTx(tx, params));
}

/**
 * PAR reinstate: creates the new pallet rows and — only when placing directly onto a
 * location that was EMPTY — marks that location STORED, all in one transaction. An
 * override onto an occupied/held/contracted location (the warn-then-allow path) leaves
 * the location row untouched.
 */
export async function storeReinstatedPallets(
  creates: Prisma.PalletUncheckedCreateInput[],
  location: (LocationCoords & { wasEmpty: boolean }) | null,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    for (const data of creates) await tx.pallet.create({ data });
    if (location?.wasEmpty) await storeLocationTx(tx, location);
  });
}

// ── Staging (STG) ──────────────────────────────────────────────────────────────

/**
 * STAGE_LOCATION — `STAGED`, denied if the location isn't EMPTY or doesn't accept inbound
 * work. An atomic conditional `updateMany` (not read-then-write), so concurrent GPMers
 * staging into the same aisle can't double-stage a location.
 * @returns true if staged, false if denied (callers skip the candidate)
 */
export async function stageLocation(aisle: number, bin: number, level: number): Promise<boolean> {
  const result = await prisma.location.updateMany({
    where: { aisle, bin, level, status: 'EMPTY', ...whereAcceptsPut() },
    data: { status: 'STAGED' },
  });
  return result.count > 0;
}

// ── Holds (WLH / HoldPanel) ────────────────────────────────────────────────────

/**
 * Places a hold on one location: writes `holdCategory` and, if the location was RESERVED,
 * clears its reservation (forced to EMPTY — "placing a hold also calls the Gate... forcing
 * the reservation to revert to EMPTY"), in one transaction. Role checks are the caller's.
 * @returns whether a reservation was cleared
 */
export async function placeHold(coords: LocationCoords, holdType: HoldCategory): Promise<{ reservationCleared: boolean }> {
  return prisma.$transaction(async (tx) => {
    const loc = await tx.location.findUniqueOrThrow({ where: locationKey(coords), select: { status: true } });
    await tx.location.update({ where: locationKey(coords), data: { holdCategory: holdType } });
    if (loc.status !== 'RESERVED') return { reservationCleared: false };
    await clearLocationTx(tx, { ...coords, overrideRevert: 'EMPTY' });
    return { reservationCleared: true };
  });
}

/**
 * Applies one range-hold bucket (every location matching `where`, which must pin the
 * bucket's existing `holdCategory`): collects its RESERVED locations, sets `next` on the
 * whole bucket, and clears each reservation (forced EMPTY) — one transaction (#209).
 * @returns how many reservations were cleared
 */
export async function applyRangeHoldBucket(
  where: Prisma.LocationWhereInput,
  next: HoldCategory,
): Promise<{ reservationsCleared: number }> {
  return prisma.$transaction(async (tx) => {
    const reserved = await tx.location.findMany({
      where: { ...where, status: 'RESERVED' },
      select: { aisle: true, bin: true, level: true },
    });
    await tx.location.updateMany({ where, data: { holdCategory: next } });
    for (const loc of reserved) await clearLocationTx(tx, { ...loc, overrideRevert: 'EMPTY' });
    return { reservationsCleared: reserved.length };
  });
}

/** Removes the hold from one location. Role checks are the caller's. */
export async function removeHold(coords: LocationCoords): Promise<void> {
  await prisma.location.update({ where: locationKey(coords), data: { holdCategory: null } });
}

/**
 * Applies one range-release bucket: sets every location matching `where` (which must pin
 * the bucket's existing `holdCategory`) to `next` — null for a full release, or the
 * remaining direction for a Both → In/Out downgrade.
 */
export async function applyRangeReleaseBucket(where: Prisma.LocationWhereInput, next: HoldCategory | null): Promise<void> {
  await prisma.location.updateMany({ where, data: { holdCategory: next } });
}

/**
 * STG restage's bulk unstage: returns every STAGED location of one storage code + size in
 * an aisle to EMPTY (an atomic conditional updateMany — only rows still STAGED change).
 * @returns how many locations were unstaged
 */
export async function unstageAisleType(params: { aisle: number; storageCode: string; size: string }): Promise<number> {
  const { count } = await prisma.location.updateMany({
    where: { aisle: params.aisle, status: 'STAGED', storageCode: params.storageCode, size: params.size },
    data: { status: 'EMPTY' },
  });
  return count;
}
