import { app } from '@azure/functions';
import type { HttpRequest, InvocationContext } from '@azure/functions';
import prisma from '../lib/prisma.js';
import { withHandler } from '../lib/response.js';

/** Put pallets created per (storageCode, size) combo, and the label target per (storageCode, pullFunction) combo. */
const ROWS_PER_COMBO = 24;
/** Seeded demo Worker account used as the receivedByZ attribution on generated put pallets. */
const SEED_USER_Z = 'z002p21';
const VCP_OPTIONS = [6, 8, 10, 12, 16, 20, 24];

/**
 * Staging simulation constants — an aisle's eligible (EMPTY, non-contracted, unheld)
 * locations get a random percentage restaged, and each restaged location's "staged
 * since" timestamp is backdated by an age drawn from an exponential distribution, so
 * SAR (Staged Aisle Report) and STG's live info panel show a believable mix of mostly-
 * recent staging with a long tail of older staged locations, rather than everything
 * appearing staged "just now." Tune these three constants to change the shape/density.
 */
const STAGE_MIN_PERCENT = 10;
const STAGE_MAX_PERCENT = 40;
/** Mean age for the exponential distribution — most staged locations land well under this. */
const STAGE_MEAN_AGE_SECONDS = 6 * 3_600;
/** Hard cap so the exponential tail can't produce an absurdly old outlier. */
const STAGE_MAX_AGE_SECONDS = 5 * 86_400;

/**
 * Draws a random age (in seconds) from an exponential distribution via inverse-transform
 * sampling: `-ln(1 - U) * mean`. Exponential is memoryless and front-loaded — most draws
 * land well below the mean (i.e. "most recently staged"), with a decaying tail of older
 * values — the standard distribution for modeling "time since an event in a Poisson
 * process," which is exactly what a stream of independent staging actions over time is.
 */
function randomExponentialAgeSeconds(): number {
  const u = Math.random();
  const age = -Math.log(1 - u) * STAGE_MEAN_AGE_SECONDS;
  return Math.min(age, STAGE_MAX_AGE_SECONDS);
}

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
 * - Unstages every currently-STAGED location, then restages a random 10-40% of each
 *   aisle's eligible (EMPTY, non-contracted, unheld) locations, backdating each one's
 *   "staged since" moment (a STAGE ActivityLog entry, same as real staging writes) by an
 *   age drawn from an exponential distribution — see randomExponentialAgeSeconds' doc
 *   comment. Gives SAR and STG's live info panel a realistic, varied staged-aisle picture
 *   immediately after reseeding instead of starting from whatever staging state happened
 *   to be left over from prior manual testing.
 *
 * All batch dates are today's date; purge dates are 7 days out, per outline.md. The whole
 * operation runs in a single transaction so a failure partway through leaves the previous
 * data set intact rather than a half-deleted, half-repopulated one.
 *
 * Unauthenticated by design, matching /api/health — called from the pre-login screen
 * before any session exists.
 *
 * @returns `{ putPalletsCreated, labelsCreated, labelsByStorageCodeAndFunction,
 *   locationsStaged, aislesStaged }`
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

    // Clear every prior seeded/real staging log entry before regenerating — same
    // wipe-then-regenerate pattern as pallets/labels above, so repeated reseeds don't
    // pile up stale STAGE/STAGE_SUM/RESTAGE rows. SAR and the STG live info panel only
    // ever read the *current* STAGED locations and their most recent matching STAGE log
    // entry, so this is safe to clear outright rather than scope to specific locations.
    await tx.activityLog.deleteMany({ where: { actionType: { in: ['STAGE', 'STAGE_SUM', 'RESTAGE'] } } });

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

    // ── Staging simulation: unstage every aisle, then restage a random subset ────
    //
    // Real staging only ever happens through STG, so a fresh environment (or one that's
    // accumulated stale STAGED locations from prior manual testing) has either nothing
    // staged or an arbitrary leftover state. This section resets to a clean slate and
    // rebuilds a believable one: every aisle unstaged, then a random 10-40% of each
    // aisle's eligible locations restaged with a backdated "staged since" timestamp (see
    // randomExponentialAgeSeconds above), so SAR's Most Staged / Staged Longest columns
    // and STG's live info panel have realistic, varied data to show immediately.
    await tx.location.updateMany({ where: { status: 'STAGED' }, data: { status: 'EMPTY' } });

    // Attribute seeded STAGE entries across whichever demo users exist, for variety —
    // falls back to SEED_USER_Z alone if the User table is somehow empty.
    const seedUsers = (await tx.user.findMany({ select: { zNumber: true } })).map((u) => u.zNumber);
    const stagingUsers = seedUsers.length > 0 ? seedUsers : [SEED_USER_Z];

    // Same eligibility rule real staging uses (findNextStagingLocation in
    // api/lib/stagingLogic.ts): EMPTY, non-contracted, and not on a hold that blocks
    // staging (Hold Outbound only blocks label generation, so it's still stageable).
    const eligibleLocations = await tx.location.findMany({
      where: {
        status: 'EMPTY',
        contraction: false,
        OR: [{ holdCategory: null }, { holdCategory: 'HOLD_OUT' }],
      },
      select: { aisle: true, bin: true, level: true, storageCode: true, size: true },
    });

    const byAisle = new Map<number, typeof eligibleLocations>();
    for (const loc of eligibleLocations) {
      const list = byAisle.get(loc.aisle) ?? [];
      list.push(loc);
      byAisle.set(loc.aisle, list);
    }

    let locationsStaged = 0;
    let aislesStaged = 0;
    const stageLogRows = [];
    const stagedLocationKeys: { aisle: number; bin: number; level: number }[] = [];

    for (const [, locs] of byAisle) {
      const percent = randomInt(STAGE_MIN_PERCENT, STAGE_MAX_PERCENT);
      const targetCount = Math.round((locs.length * percent) / 100);
      if (targetCount === 0) continue;

      const chosen = shuffle(locs).slice(0, targetCount);
      aislesStaged++;
      for (const loc of chosen) {
        locationsStaged++;
        stagedLocationKeys.push({ aisle: loc.aisle, bin: loc.bin, level: loc.level });
        const timestamp = new Date(now.getTime() - randomExponentialAgeSeconds() * 1000);
        stageLogRows.push({
          userId: randomFrom(stagingUsers),
          actionType: 'STAGE',
          locationAisle: loc.aisle,
          locationBin: loc.bin,
          locationLevel: loc.level,
          details: JSON.stringify({ storageCode: loc.storageCode, size: loc.size, seeded: true }),
          timestamp,
        });
      }
    }

    // Flip the chosen locations to STAGED one at a time (composite-key updateMany can't
    // target a whole list of (aisle,bin,level) tuples in one call under this schema).
    for (const key of stagedLocationKeys) {
      await tx.location.update({ where: { LocationID: key }, data: { status: 'STAGED' } });
    }
    if (stageLogRows.length > 0) await tx.activityLog.createMany({ data: stageLogRows });

    return {
      putPalletsCreated: putPalletRows.length,
      labelsCreated: labelRows.length,
      labelsByStorageCodeAndFunction,
      locationsStaged,
      aislesStaged,
    };
  });
}

app.http('reseedTestData', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'demo/reseed',
  handler: withHandler(reseedTestData),
});
