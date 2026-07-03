import prisma from './prisma.js';

export interface EligibilityResult {
  eligible: true;
  alreadyStored: boolean;
  currentLocation: { aisle: number; bin: number; level: number } | null;
  pallet: {
    pid: number;
    dept: number;
    class: number;
    item: number;
    currentPallets: number;
    currentCartons: number;
    currentSSPs: number;
    descShort: string;
  };
}

/**
 * Runs the shared pallet eligibility checks used by both SDP and MNP:
 *   1. Pallet exists
 *   2. Has stored cartons (currentCartons > 0)
 *   3. Already stored? (informational — does not block)
 *
 * Throws with { status, message } for hard failures (404 / 409).
 * Returns EligibilityResult on success; callers handle the alreadyStored flag.
 */
export async function checkPalletEligibility(palletId: number): Promise<EligibilityResult> {
  const pallet = await prisma.pallet.findUnique({
    where: { pid: palletId },
    include: { itemRef: { select: { descShort: true } } },
  });

  if (!pallet) {
    throw Object.assign(new Error('PALLET_NOT_FOUND'), { status: 404 });
  }

  if (pallet.currentCartons <= 0) {
    throw Object.assign(new Error('NO_CARTONS'), { status: 409 });
  }

  const currentLocation =
    pallet.locationAisle != null
      ? { aisle: pallet.locationAisle, bin: pallet.locationBin!, level: pallet.locationLevel! }
      : null;

  return {
    eligible: true,
    alreadyStored: currentLocation !== null,
    currentLocation,
    pallet: {
      pid: pallet.pid,
      dept: pallet.dept,
      class: pallet.class,
      item: pallet.item,
      currentPallets: pallet.currentPallets,
      currentCartons: pallet.currentCartons,
      currentSSPs: pallet.currentSSPs,
      descShort: pallet.itemRef.descShort,
    },
  };
}
