import { app } from '@azure/functions';
import type { HttpRequest, InvocationContext } from '@azure/functions';
import prisma from '../lib/prisma.js';
import { withHandler } from '../lib/response.js';

/** Put pallets created per (storageCode, size) combo, and the label target per (storageCode, pullFunction) combo. */
const ROWS_PER_COMBO = 24;
/** Seeded demo Worker account used as the receivedByZ attribution on generated put pallets. */
const SEED_USER_Z = 'z002p21';
const VCP_OPTIONS = [6, 8, 10, 12, 16, 20, 24];

interface LabelRow {
  lid: string;
  pid: number;
  dept: number;
  class: number;
  item: number;
  quantity: number;
  sspQuantity: number;
  batchDate: number;
  purgeDate: Date;
  destinationStore: number;
  status: string;
  pullFunction: string;
}

/** Returns a random integer in the inclusive range [min, max]. */
function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** Returns a random element from an array. */
function randomFrom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Fisher-Yates shuffle, returning a new array (doesn't mutate the input). */
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Converts a Date to a Julian-style date int (YYYY + zero-padded day-of-year), e.g. 2026175. */
function julianDate(d: Date): number {
  const start = new Date(d.getFullYear(), 0, 0);
  const diff = d.getTime() - start.getTime();
  return d.getFullYear() * 1000 + Math.floor(diff / 86_400_000);
}

/** Builds a Label ID string: store(4) + DPCI(9) + pid(8) + random(8) + batchDate. */
function genLid(storeId: number, dept: number, cls: number, item: number, pid: number, batchDate: number): string {
  const rnd = Math.random().toString(36).substring(2, 10).padEnd(8, '0');
  return (
    String(storeId).padStart(4, '0') +
    String(dept).padStart(3, '0') +
    String(cls).padStart(2, '0') +
    String(item).padStart(4, '0') +
    String(pid).padStart(8, '0') +
    rnd +
    String(batchDate)
  );
}

/** Pull Functions table from Documentation/outline.md: XS is always CA; level 1 non-XS non-emptying is CF; a non-XS pull that empties the location is FP; anything else non-XS is CA. Level 0 (Bulk) is out of scope for this demo. */
function assignPullFunction(level: number, size: string, qty: number, totalCartons: number): 'BK' | 'CA' | 'CF' | 'FP' {
  if (level === 0) return 'BK';
  if (size === 'XS') return 'CA';
  const empties = qty >= totalCartons;
  if (empties) return 'FP';
  return level === 1 ? 'CF' : 'CA';
}

/**
 * Wipes and regenerates the app's test/demo data set for pending put work and scannable
 * pull labels, for the pre-login "Reseed Test Data" dev-tools control (main screen, above
 * the badge scanner). Deletes every PUT_PENDING pallet and every not-yet-pulled label
 * (AVAILABLE/PRINTED — leaves PULLED/DIVERTED/CANCELED/PURGED history untouched), then:
 *
 * - Creates ROWS_PER_COMBO fresh PUT_PENDING pallets for every (storageCode, size) combo
 *   present in the Location table, with a random item/quantity (no realism constraint —
 *   any DPCI/quantity is fine for a put pallet).
 * - Creates up to ROWS_PER_COMBO fresh PRINTED labels for every (storageCode, pullFunction)
 *   combo, sourced only from pallets already STORED at a real location — this does *not*
 *   synthesize backing stock, so a combo with too little real stored inventory at the
 *   right level/size will end up with fewer than ROWS_PER_COMBO labels (or none).
 *
 * All batch dates are today's date; purge dates are 7 days out, per outline.md. The whole
 * operation runs in a single transaction so a failure partway through leaves the previous
 * data set intact rather than a half-deleted, half-repopulated one.
 *
 * Unauthenticated by design, matching /api/health — called from the pre-login screen
 * before any session exists.
 *
 * @returns `{ putPalletsCreated, labelsCreated, labelsByStorageCodeAndFunction }`
 */
async function reseedTestData(_req: HttpRequest, _ctx: InvocationContext): Promise<unknown> {
  return prisma.$transaction(async (tx) => {
    await tx.label.deleteMany({ where: { status: { in: ['AVAILABLE', 'PRINTED'] } } });
    // A PUT_PENDING pallet can have an open SDP reservation (Reservation.palletId is a
    // required FK) and/or ActivityLog rows referencing it — clear both first or the pallet
    // delete below fails with a foreign key violation (see issue #51: an abandoned reservation
    // or a routine "received"/"put" log entry from a prior session blocks every future reseed
    // until manually cleared). Scoped to just the pallets being deleted, not a full-table wipe,
    // since this endpoint only regenerates disposable put-pending test data.
    await tx.reservation.deleteMany({ where: { pallet: { status: 'PUT_PENDING' } } });
    await tx.activityLog.deleteMany({ where: { pallet: { status: 'PUT_PENDING' } } });
    await tx.pallet.deleteMany({ where: { status: 'PUT_PENDING' } });

    // ── Put pallets: ROWS_PER_COMBO per (storageCode, size) combo ─────────────────
    const locationCombos = await tx.location.findMany({
      select: { storageCode: true, size: true },
      distinct: ['storageCode', 'size'],
    });

    const existingPids = new Set((await tx.pallet.findMany({ select: { pid: true } })).map((p) => p.pid));
    function genPid(): number {
      let pid: number;
      do {
        pid = randomInt(10_000_000, 99_999_999);
      } while (existingPids.has(pid));
      existingPids.add(pid);
      return pid;
    }

    const itemCache = new Map<string, { dept: number; class: number; item: number }[]>();
    async function getItems(storageCode: string) {
      if (!itemCache.has(storageCode)) {
        const rows = await tx.item.findMany({
          where: { storageCode },
          select: { dept: true, class: true, item: true },
          take: 30,
        });
        itemCache.set(storageCode, rows);
      }
      return itemCache.get(storageCode)!;
    }

    const now = new Date();
    const putPalletRows = [];
    for (const combo of locationCombos) {
      const items = await getItems(combo.storageCode);
      if (items.length === 0) continue;

      for (let i = 0; i < ROWS_PER_COMBO; i++) {
        const item = randomFrom(items);
        const vcp = randomFrom(VCP_OPTIONS);
        const ssp = Math.random() < 0.5 ? vcp : vcp / 2;
        const receivedCartons = randomInt(6, 20);
        const receivedSSPs = receivedCartons * ssp;

        putPalletRows.push({
          pid: genPid(),
          dept: item.dept,
          class: item.class,
          item: item.item,
          receivedPallets: 0,
          currentPallets: 0,
          receivedCartons,
          currentCartons: receivedCartons,
          receivedSSPs,
          currentSSPs: receivedSSPs,
          vcp,
          ssp,
          status: 'PUT_PENDING',
          locationAisle: null,
          locationBin: null,
          locationLevel: null,
          receivedByZ: SEED_USER_Z,
          receivedAt: now,
        });
      }
    }
    if (putPalletRows.length > 0) await tx.pallet.createMany({ data: putPalletRows });

    // ── Labels: up to ROWS_PER_COMBO per (storageCode, pullFunction) combo ────────
    const [storedPallets, stores, allLocations] = await Promise.all([
      tx.pallet.findMany({
        where: { locationAisle: { not: null }, currentCartons: { gt: 0 } },
        select: {
          pid: true, dept: true, class: true, item: true,
          currentCartons: true,
          locationAisle: true, locationBin: true, locationLevel: true,
        },
      }),
      tx.store.findMany({ select: { id: true } }),
      tx.location.findMany({ select: { aisle: true, bin: true, level: true, storageCode: true, size: true } }),
    ]);

    const locByKey = new Map(allLocations.map((l) => [`${l.aisle}-${l.bin}-${l.level}`, l]));
    const batchDate = julianDate(now);
    const purgeDate = new Date(now.getTime() + 7 * 86_400_000);
    const buckets = new Map<string, LabelRow[]>();
    let storeIdx = 0;

    for (const p of shuffle(storedPallets)) {
      const loc = locByKey.get(`${p.locationAisle}-${p.locationBin}-${p.locationLevel}`);
      if (!loc || stores.length === 0) continue;

      const level = p.locationLevel ?? 1;
      const maxQty = p.currentCartons;
      const candidateQtys = maxQty === 1 ? [maxQty] : [randomInt(1, maxQty - 1), maxQty];

      for (const qty of candidateQtys) {
        const fn = assignPullFunction(level, loc.size, qty, maxQty);
        if (fn === 'BK') continue;

        const key = `${loc.storageCode}|${fn}`;
        const bucket = buckets.get(key) ?? [];
        if (bucket.length >= ROWS_PER_COMBO) continue;

        const store = stores[storeIdx % stores.length];
        storeIdx++;
        bucket.push({
          lid: genLid(store.id, p.dept, p.class, p.item, p.pid, batchDate),
          pid: p.pid, dept: p.dept, class: p.class, item: p.item,
          quantity: qty, sspQuantity: 0, batchDate, purgeDate,
          destinationStore: store.id, status: 'PRINTED', pullFunction: fn,
        });
        buckets.set(key, bucket);
      }
    }

    const labelRows = [...buckets.values()].flat();
    if (labelRows.length > 0) await tx.label.createMany({ data: labelRows });

    const labelsByStorageCodeAndFunction: Record<string, number> = {};
    for (const [key, rows] of buckets) labelsByStorageCodeAndFunction[key] = rows.length;

    return {
      putPalletsCreated: putPalletRows.length,
      labelsCreated: labelRows.length,
      labelsByStorageCodeAndFunction,
    };
  });
}

app.http('reseedTestData', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'demo/reseed',
  handler: withHandler(reseedTestData),
});
