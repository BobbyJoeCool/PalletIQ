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
    // The pallet's own Storage Code/Size/Zone, inherited from wherever it's currently
    // STORED (kept in sync by placePallet on every put/move) — null while PUT_PENDING.
    // Directed Put's default location search (no IM+ override given) reads these.
    storageCode: string | null;
    size: string | null;
    zone: number | null;
    // The Item's own intrinsic Storage Code (Item.storageCode — always set, unlike the
    // pallet's own possibly-null one) — the fallback for a PUT_PENDING pallet that's
    // never been stored anywhere yet, so it still gets a real Storage Code filter on its
    // first put instead of none at all. Item has no equivalent Size classification, so
    // Size has no third fallback tier.
    itemStorageCode: string;
  };
}

/**
 * Runs the shared pallet eligibility checks used by both SDP and MNP:
 *   1. Pallet exists
 *   2. Not CANCELED (a voided/canceled receiving record — shouldn't be put away at all)
 *   3. Has no open (non-terminal) Label against it — same "still open" definition
 *      editPallet's DPCI-change guard already uses (`status notIn PULLED/DIVERTED/
 *      CANCELED/PURGED`, same `BLOCKED_BY_PENDING_PULL` code): once a label exists for a
 *      pallet, it's already committed to an outbound pull and shouldn't be redirected to
 *      a new storage location until that pull actually happens (the label reaches PULLED)
 *      or is otherwise resolved (DIVERTED/CANCELED/PURGED) — the label doesn't need to
 *      have reached PRINTED yet, AVAILABLE already counts as open.
 *   4. Has stored cartons (currentCartons > 0)
 *   5. Already stored? (informational — does not block)
 *
 * Throws with { status, message } for hard failures (404 / 409).
 * Returns EligibilityResult on success; callers handle the alreadyStored flag.
 */
export async function checkPalletEligibility(palletId: number): Promise<EligibilityResult> {
  const pallet = await prisma.pallet.findUnique({
    where: { pid: palletId },
    include: { itemRef: { select: { descShort: true, storageCode: true } } },
  });

  if (!pallet) {
    throw Object.assign(new Error('PALLET_NOT_FOUND'), { status: 404 });
  }

  if (pallet.status === 'CANCELED') {
    throw Object.assign(new Error('CANCELED'), { status: 409 });
  }

  const openLabelCount = await prisma.label.count({
    where: { pid: palletId, status: { notIn: ['PULLED', 'DIVERTED', 'CANCELED', 'PURGED'] } },
  });
  if (openLabelCount > 0) {
    throw Object.assign(new Error('BLOCKED_BY_PENDING_PULL'), { status: 409 });
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
      storageCode: pallet.storageCode,
      size: pallet.size,
      zone: pallet.zone,
      itemStorageCode: pallet.itemRef.storageCode,
    },
  };
}
