// SDP Exists Elsewhere redirect rules (#215) — moved server-side from SDPVerifyPutModal's
// client filter and SDPPage's client-side match/resolution logic. A redirect never releases
// the reservation; `confirmPut` with a `targetLocation` completes it as a consolidation.

import type { Prisma } from '../generated/prisma/index.js';
import prisma from './prisma.js';
import { formatLocationId } from './locationParser.js';

type Db = Prisma.TransactionClient | typeof prisma;

/** A consolidation target offered by Exists Elsewhere. */
export interface ConsolidationCandidate {
  locationId: string;
  storageCode: string;
  currentCartons: number;
  palletId: number;
}

/**
 * The candidate rule: a STORED pallet of the same DPCI, at a Hand Put (XS) location, with
 * cartons on it (a zero-carton row is a consolidated/zeroed pallet whose location was never
 * cleared, not a real occupant), other than the pallet being put.
 */
function candidateWhere(source: { pid: number; dept: number; class: number; item: number }): Prisma.PalletWhereInput {
  return {
    dept: source.dept, class: source.class, item: source.item,
    pid: { not: source.pid },
    status: 'STORED',
    size: 'XS',
    currentCartons: { gt: 0 },
    locationAisle: { not: null },
  };
}

/**
 * Lists Exists Elsewhere candidates for a reservation's pallet, excluding the reserved
 * location itself. Empty for a Rack Put (non-XS reserved location) — redirect is Hand Put only.
 */
export async function listConsolidationCandidates(
  reservation: { palletId: number; locationAisle: number; locationBin: number; locationLevel: number },
  db: Db = prisma,
): Promise<ConsolidationCandidate[]> {
  const reserved = await db.location.findUniqueOrThrow({
    where: { LocationID: { aisle: reservation.locationAisle, bin: reservation.locationBin, level: reservation.locationLevel } },
    select: { size: true },
  });
  if (reserved.size !== 'XS') return [];
  const source = await db.pallet.findUniqueOrThrow({ where: { pid: reservation.palletId }, select: { pid: true, dept: true, class: true, item: true } });
  const pallets = await db.pallet.findMany({
    where: candidateWhere(source),
    select: { pid: true, locationAisle: true, locationBin: true, locationLevel: true, storageCode: true, currentCartons: true },
    orderBy: [{ locationAisle: 'asc' }, { locationBin: 'asc' }, { locationLevel: 'asc' }],
  });
  const reservedId = formatLocationId(reservation.locationAisle, reservation.locationBin, reservation.locationLevel);
  return pallets
    .map((p) => ({
      locationId: formatLocationId(p.locationAisle!, p.locationBin!, p.locationLevel!),
      storageCode: p.storageCode ?? '',
      currentCartons: p.currentCartons,
      palletId: p.pid,
    }))
    .filter((c) => c.locationId !== reservedId);
}

/**
 * Resolves the occupant pallet at a redirect target, re-checking the candidate rule (inside
 * the confirm's transaction). Returns null when the target isn't a valid candidate.
 */
export async function findConsolidationTarget(
  db: Db,
  sourcePalletId: number,
  target: { aisle: number; bin: number; level: number },
): Promise<number | null> {
  const source = await db.pallet.findUniqueOrThrow({ where: { pid: sourcePalletId }, select: { pid: true, dept: true, class: true, item: true } });
  const occupant = await db.pallet.findFirst({
    where: { ...candidateWhere(source), locationAisle: target.aisle, locationBin: target.bin, locationLevel: target.level },
    select: { pid: true },
  });
  return occupant?.pid ?? null;
}
