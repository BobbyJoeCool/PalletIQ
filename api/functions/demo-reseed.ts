import { app } from '../lib/functionsRuntime.js';
import type { HttpRequest, InvocationContext } from '../lib/functionsRuntime.js';
import prisma from '../lib/prisma.js';
import { withHandler } from '../lib/response.js';
import { NOT_HELD_FILTER } from '../lib/zoneLogic.js';
import { writeLog } from '../lib/activityLog.js';
import { randomInt, randomFrom, shuffle, cartonsPerPalletFor, julianDate, makePidGenerator, genCid } from '../prisma/demoUtils.js';

/** The interactive-transaction client type, derived from `prisma.$transaction` itself
 *  rather than importing a `Prisma` namespace type — lets the worker-shift simulator
 *  functions below (§ Worker Activity Log) take `tx` as an explicit parameter instead of
 *  being defined inline inside the transaction callback. */
type TxClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/** Put pallets created per (storageCode, size) combo, and the container target per (storageCode, pullFunction) combo for CF/FP. */
const ROWS_PER_COMBO = 36;
/** CA containers specifically need a higher per-combo cap than ROWS_PER_COMBO (#130) — Tyler's
 *  (z002p21) Carton Air shift simulator (`simulateCartonAirPulls`) consumes these at a fixed
 *  200 cartons/hour, and a full 6AM-4PM shift needs ~2000 cartons of source data to avoid
 *  running the CA container pool dry before shiftEnd. Measured against this app's real combo
 *  count/average container size (8 CA-eligible storage codes, ~7.2 cartons/container), 24/combo
 *  (192 containers, ~1384 cartons) fell well short; 48/combo comfortably clears the target with
 *  margin to spare. */
const CA_CONTAINER_ROWS_PER_COMBO = 48;
/** Guaranteed floor of PUT_PENDING pallets per (storageCode, size) combo *after*
 *  `simulateRackPuts` has run (direct instruction — the "10+ per combo" ask must survive
 *  the same reseed's own simulated rack-put activity, not just describe the pool right
 *  after generation). Comfortably over "10+"; matches `api/prisma/seed.ts`'s own
 *  `PENDING_PALLETS_PER_COMBO`, kept in sync deliberately rather than coincidentally. */
const PENDING_MIN_PER_COMBO = 12;
/** Seeded demo Worker account used as the receivedByZ attribution on generated put pallets. */
const SEED_USER_Z = 'z002p21';
const VCP_OPTIONS = [6, 8, 10, 12, 16, 20, 24];

/**
 * A handful of *older* staged locations get backdated between 8-24 hours ago (see
 * `seedOlderStagedLocations` below) — "staged sometime yesterday," for SAR's Staged
 * Longest column to have a believable long tail beyond just today's shift. Drawn from an
 * exponential distribution (front-loaded, decaying tail) shifted to start at 8 hours out.
 */
const OLDER_STAGE_MIN_AGE_SECONDS = 8 * 3_600;
const OLDER_STAGE_MEAN_AGE_SECONDS = 6 * 3_600; // added on top of the 8h floor
const OLDER_STAGE_MAX_AGE_SECONDS = 24 * 3_600;

/**
 * Draws a random age (in seconds) from an exponential distribution via inverse-transform
 * sampling: `-ln(1 - U) * mean`. Exponential is memoryless and front-loaded — most draws
 * land well below the mean, with a decaying tail of older values — the standard
 * distribution for modeling "time since an event in a Poisson process."
 */
function randomExponentialAgeSeconds(mean: number): number {
  const u = Math.random();
  return -Math.log(1 - u) * mean;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Worker Activity Log (v1.6.9 follow-up) — simulates a realistic last-shift history for
// each of the 5 demo workers on every "Reseed Test Data" click, so a time-related demo
// (Activity Log, SAR, per-worker throughput) never needs a separately-timed reseed to
// look current. Per direct instruction: rather than a rolling "last 8 hours," the window
// is a fixed 6AM-4PM for *today's* calendar date (or up to right now, if that's earlier
// than 4PM) — every worker shares a 30-minute break 4 hours into that window (10:00-
// 10:30AM). Each reseed call fills in from wherever a given worker's log left off today
// (or from 6AM, if nothing's been generated yet today) up to "now" — repeated same-day
// clicks extend the log instead of duplicating or resetting it. Whatever a prior day
// generated is left alone (same "history stays put" philosophy the rest of this endpoint
// already follows for PULLED containers), so nothing here needs to be wiped/undone on a new
// day; each worker just starts a fresh 6AM baseline for the new date.
// ═══════════════════════════════════════════════════════════════════════════════

const WORKER_LOG_ZNUMBERS = ['z002p21', 'z002p22', 'z002p23', 'z002p24', 'z002p25'] as const;
/** JSON-details marker distinguishing this feature's generated ActivityLog rows from any
 *  real interactive-testing activity by the same zNumbers, so "has today's log already
 *  started" and "where did it leave off" can be determined unambiguously via a plain
 *  substring match (Prisma's `contains` on the NVarChar `details` column). */
const WORKER_LOG_MARKER = '"workerLog":true';

interface ShiftWindow {
  shiftStart: Date;   // today 6:00 AM
  shiftEnd: Date;     // min(now, today 4:00 PM)
  breakStart: Date;   // today 10:00 AM (4 hours into the shift)
  breakEnd: Date;     // today 10:30 AM
}

/** Builds today's fixed shift window — see the section comment above for the full rationale. */
function todaysShiftWindow(now: Date): ShiftWindow {
  const y = now.getFullYear(), m = now.getMonth(), d = now.getDate();
  const shiftStart = new Date(y, m, d, 6, 0, 0, 0);
  const shiftEndCap = new Date(y, m, d, 16, 0, 0, 0);
  const breakStart = new Date(y, m, d, 10, 0, 0, 0);
  const breakEnd = new Date(y, m, d, 10, 30, 0, 0);
  const shiftEnd = now < shiftEndCap ? now : shiftEndCap;
  return { shiftStart, shiftEnd, breakStart, breakEnd };
}

/** Nudges a timestamp forward past the shared 10:00-10:30 break, if it falls inside it. */
function pastBreak(t: Date, w: ShiftWindow): Date {
  return t >= w.breakStart && t < w.breakEnd ? w.breakEnd : t;
}

/**
 * Finds where a worker's simulated shift log left off today — the latest marker-tagged
 * ActivityLog timestamp within today's window — or the shift start if nothing's been
 * generated yet today (a fresh day, or the very first run). This is the "fill in from
 * where it left off" resume point.
 */
async function getShiftResumePoint(tx: TxClient, zNumber: string, w: ShiftWindow): Promise<Date> {
  const last = await tx.activityLog.findFirst({
    where: { userId: zNumber, timestamp: { gte: w.shiftStart }, details: { contains: WORKER_LOG_MARKER } },
    orderBy: { timestamp: 'desc' },
    select: { timestamp: true },
  });
  return last?.timestamp ?? w.shiftStart;
}

/**
 * z002p21 — Carton Air pulls, ~200 cartons/hour. Consumes AVAILABLE/PRINTED `pullFunction:
 * 'CA'` containers one at a time, marking each PULLED and deducting its quantity from the
 * pallet — mirrors `verifyPull`'s (pulls.ts) real completion logic exactly, including
 * clearing CA_PULL_PEND/FP_PULL_PEND back to STORED once a pallet's last outstanding
 * container is pulled. The simulated clock advances by however long each container's quantity
 * would take at the target rate, so total elapsed time matches ~200/hr regardless of
 * individual container sizes, rather than a fixed interval per pull.
 */
async function simulateCartonAirPulls(tx: TxClient, resumeFrom: Date, w: ShiftWindow): Promise<number> {
  const RATE_CARTONS_PER_HOUR = 200;
  let t = pastBreak(resumeFrom, w);
  let pulled = 0;

  while (t < w.shiftEnd) {
    const container = await tx.container.findFirst({
      where: { pullFunction: 'CA', status: { in: ['AVAILABLE', 'PRINTED'] } },
      select: { cid: true, pid: true, quantity: true, sspQuantity: true, dept: true, class: true, item: true },
    });
    if (!container) break; // CA container pool exhausted for this reseed — nothing left to pull

    const pallet = await tx.pallet.findUnique({
      where: { pid: container.pid },
      select: { currentCartons: true, currentSSPs: true, locationAisle: true, locationBin: true, locationLevel: true },
    });
    if (!pallet) {
      // Orphaned container (its pallet vanished some other way) — cancel it so the loop
      // doesn't keep re-picking the same dead container forever, then move on.
      await tx.container.update({ where: { cid: container.cid }, data: { status: 'CANCELED' } });
      continue;
    }

    const newCartons = Math.max(0, pallet.currentCartons - container.quantity);
    const newSSPs = Math.max(0, pallet.currentSSPs - container.sspQuantity);

    await tx.container.update({ where: { cid: container.cid }, data: { status: 'PULLED' } });
    const remainingPending = await tx.container.count({
      where: { pid: container.pid, status: { in: ['AVAILABLE', 'PRINTED'] } },
    });
    await tx.pallet.update({
      where: { pid: container.pid },
      data: {
        currentCartons: newCartons, currentSSPs: newSSPs, currentPallets: 0,
        lastPulledByZ: 'z002p21', lastPulledAt: t,
        ...(remainingPending === 0 && { status: 'STORED' }),
      },
    });

    await writeLog({
      userId: 'z002p21', actionType: 'PULL', timestamp: t,
      palletId: container.pid,
      locationAisle: pallet.locationAisle ?? undefined, locationBin: pallet.locationBin ?? undefined, locationLevel: pallet.locationLevel ?? undefined,
      dept: container.dept, class: container.class, item: container.item,
      functionCode: 'CA',
      details: {
        containerId: container.cid, pullFunction: 'CA',
        pulled: { pallets: 0, cartons: container.quantity, ssps: container.sspQuantity },
        remaining: { pallets: 0, cartons: newCartons, ssps: newSSPs },
        verifiedVia: 'PID', wasScanned: true, workerLog: true,
      },
    }, tx);

    pulled++;
    const minutesForThisPull = (container.quantity / RATE_CARTONS_PER_HOUR) * 60;
    t = pastBreak(new Date(t.getTime() + minutesForThisPull * 60_000), w);
  }

  return pulled;
}

/**
 * z002p22 — Rack Puts (Directed Put), ~50/hour. Converts a PUT_PENDING pallet to STORED
 * at a real matching-storageCode EMPTY location — mirrors `placePallet`'s real state
 * changes (puts.ts) without the reservation/confirm round trip, since this is a direct
 * historical backfill, not a live worker interaction. A PUT_PENDING pallet never carries
 * its own storageCode (only ever set once actually stored — see outline.md's fallback
 * rule), so this resolves the destination search via the pallet's Item's own intrinsic
 * storageCode, same as a real first-ever put would.
 */
async function simulateRackPuts(tx: TxClient, resumeFrom: Date, w: ShiftWindow): Promise<number> {
  const RATE_PER_HOUR = 50;
  const avgIntervalMs = (60 / RATE_PER_HOUR) * 60_000; // 1.2 min
  let t = pastBreak(resumeFrom, w);
  let putCount = 0;
  let consecutiveMisses = 0;

  while (t < w.shiftEnd && consecutiveMisses < 10) {
    const pallet = await tx.pallet.findFirst({
      where: { status: 'PUT_PENDING' },
      select: { pid: true, dept: true, class: true, item: true, storageCode: true, currentCartons: true, currentPallets: true, currentSSPs: true },
    });
    if (!pallet) break; // no more put-pending stock this reseed

    const item = await tx.item.findUnique({
      where: { DPCI: { dept: pallet.dept, class: pallet.class, item: pallet.item } },
      select: { storageCode: true },
    });
    const storageCode = pallet.storageCode ?? item?.storageCode;
    const dest = storageCode
      ? await tx.location.findFirst({
          where: {
            status: 'EMPTY', contraction: false, storageCode,
            ...NOT_HELD_FILTER,
          },
          select: { aisle: true, bin: true, level: true, size: true, zone: true },
        })
      : null;

    if (!dest) {
      // No eligible destination for this pallet right now — try again next turn rather
      // than getting stuck (a different PUT_PENDING pallet may fare better).
      consecutiveMisses++;
      t = pastBreak(new Date(t.getTime() + avgIntervalMs), w);
      continue;
    }
    consecutiveMisses = 0;

    await tx.pallet.update({
      where: { pid: pallet.pid },
      data: {
        status: 'STORED',
        locationAisle: dest.aisle, locationBin: dest.bin, locationLevel: dest.level,
        storageCode, size: dest.size, zone: dest.zone,
        putByZ: 'z002p22', putAt: t,
      },
    });
    await tx.location.update({
      where: { LocationID: { aisle: dest.aisle, bin: dest.bin, level: dest.level } },
      data: { status: 'STORED' },
    });

    await writeLog({
      userId: 'z002p22', actionType: 'PUT', timestamp: t,
      palletId: pallet.pid, locationAisle: dest.aisle, locationBin: dest.bin, locationLevel: dest.level,
      dept: pallet.dept, class: pallet.class, item: pallet.item,
      functionCode: 'RP',
      details: {
        cartons: pallet.currentCartons, pallets: pallet.currentPallets, ssps: pallet.currentSSPs,
        method: 'SDP', workerLog: true,
      },
    }, tx);

    putCount++;
    const jitter = 0.7 + Math.random() * 0.6; // ±30%
    t = pastBreak(new Date(t.getTime() + avgIntervalMs * jitter), w);
  }

  return putCount;
}

/** Given a staging location's Size, draws a realistic stack quantity per the shift spec:
 *  L/M: 1 or 2. S: mostly 3, occasionally 1/2/4. HS: mostly ~5, otherwise 1-12. */
function pickStackQuantity(size: string): number {
  if (size === 'L' || size === 'M') return randomInt(1, 2);
  if (size === 'S') return Math.random() < 0.6 ? 3 : randomFrom([1, 2, 4]);
  return Math.random() < 0.5 ? 5 : randomInt(1, 12); // HS
}

/**
 * z002p23 — GPM staging: a "triple load" (3 stacks, one aisle at a time — matching STG's
 * real 3-position fork-truck model) every 5-7 minutes, each stack's quantity drawn per
 * `pickStackQuantity`'s size-specific distribution. Replaces the previous generic
 * random-aisle-percentage simulation entirely (v1.6.9 follow-up, per direct instruction).
 * Eligibility mirrors `findNextStagingLocation` (stagingLogic.ts): EMPTY, non-contracted,
 * not on a placement-blocking hold, never XS (XS is hand-put, never staged).
 *
 * After the shift-time loop finishes (which can produce zero staging at all if `resumeFrom`
 * is already past `w.shiftEnd` — e.g. reseeding before the 6am shift start, since `shiftEnd`
 * is `min(now, 4pm)`), tops up to a guaranteed `MIN_STAGED_AISLES` aisles regardless, using
 * the same selection order, timestamped "now" rather than the simulated shift clock — a
 * floor for SAR/STG's demo picture, independent of what time the reseed happens to run.
 */
async function simulateGpmStaging(tx: TxClient, resumeFrom: Date, w: ShiftWindow): Promise<{ locations: number; loads: number; aisles: number }> {
  let t = pastBreak(resumeFrom, w);
  let locationsStaged = 0;
  let loads = 0;
  const stagedAisles = new Set<number>();

  const pool = await tx.location.findMany({
    where: {
      status: 'EMPTY', contraction: false, size: { not: 'XS' },
      ...NOT_HELD_FILTER,
    },
    select: { aisle: true, bin: true, level: true, size: true, storageCode: true },
  });
  const byAisle = new Map<number, typeof pool>();
  for (const loc of pool) {
    const list = byAisle.get(loc.aisle) ?? [];
    list.push(loc);
    byAisle.set(loc.aisle, list);
  }

  while (t < w.shiftEnd) {
    const aisles = [...byAisle.keys()].filter((a) => byAisle.get(a)!.length > 0);
    if (aisles.length === 0) break; // nothing left anywhere to stage this reseed

    const aisle = randomFrom(aisles);
    const aisleLocs = byAisle.get(aisle)!;
    const toStage: typeof pool = [];

    for (let stack = 0; stack < 3; stack++) {
      const remaining = aisleLocs.filter((l) => !toStage.includes(l));
      if (remaining.length === 0) break;
      const size = randomFrom(remaining).size;
      // Fill order matches seed.ts's applyStaging exactly — highest bin first, then lowest
      // level within a bin — since that's the real order a GPMer fills an aisle from the
      // back, not a random scatter (issue #98; this simulator previously shuffled).
      const sameSize = remaining
        .filter((l) => l.size === size)
        .sort((a, b) => b.bin - a.bin || a.level - b.level);
      const qty = Math.min(pickStackQuantity(size), sameSize.length);
      toStage.push(...sameSize.slice(0, qty));
    }

    if (toStage.length === 0) {
      t = pastBreak(new Date(t.getTime() + randomInt(5, 7) * 60_000), w);
      continue;
    }

    for (const loc of toStage) {
      await tx.location.update({
        where: { LocationID: { aisle: loc.aisle, bin: loc.bin, level: loc.level } },
        data: { status: 'STAGED' },
      });
      await writeLog({
        userId: 'z002p23', actionType: 'STAGE', timestamp: t,
        locationAisle: loc.aisle, locationBin: loc.bin, locationLevel: loc.level,
        functionCode: 'GPM',
        details: { storageCode: loc.storageCode, size: loc.size, seeded: true, workerLog: true },
      }, tx);
      locationsStaged++;
      stagedAisles.add(aisle);
      const list = byAisle.get(aisle)!;
      const idx = list.indexOf(loc);
      if (idx !== -1) list.splice(idx, 1);
    }
    loads++;
    t = pastBreak(new Date(t.getTime() + randomInt(5, 7) * 60_000), w);
  }

  // Guaranteed minimum, independent of the shift-time simulation above (direct instruction
  // — reported empty-looking STG/SAR after a pre-6am reseed). shiftEnd is `min(now, 4pm)`;
  // reseeding before shiftStart (6am) means shiftEnd < shiftStart, so the `while (t <
  // w.shiftEnd)` loop above never executes at all — not just for staging, for every
  // simulate* function — leaving nothing for STG/SAR to show. This tops up to at least
  // MIN_STAGED_AISLES aisles regardless of what the loop above produced (including zero),
  // using the same real-GPM selection order (highest bin first, then lowest level) as
  // above and as production's own `findNextStagingLocation`/`restageAisle`. Timestamped
  // "now" rather than the simulated shift clock `t` — these aren't a shift-time artifact,
  // they're a floor that needs to already exist regardless of when the reseed runs.
  const MIN_STAGED_AISLES = 8; // matches seed.ts's own applyStaging STAGED_AISLES count
  if (stagedAisles.size < MIN_STAGED_AISLES) {
    const candidateAisles = shuffle(
      [...byAisle.keys()].filter((a) => !stagedAisles.has(a) && byAisle.get(a)!.length > 0),
    );
    for (const aisle of candidateAisles) {
      if (stagedAisles.size >= MIN_STAGED_AISLES) break;
      const aisleLocs = byAisle.get(aisle)!;
      const toStage: typeof pool = [];

      for (let stack = 0; stack < 3; stack++) {
        const remaining = aisleLocs.filter((l) => !toStage.includes(l));
        if (remaining.length === 0) break;
        const size = randomFrom(remaining).size;
        const sameSize = remaining
          .filter((l) => l.size === size)
          .sort((a, b) => b.bin - a.bin || a.level - b.level);
        const qty = Math.min(pickStackQuantity(size), sameSize.length);
        toStage.push(...sameSize.slice(0, qty));
      }
      if (toStage.length === 0) continue;

      const now = new Date();
      for (const loc of toStage) {
        await tx.location.update({
          where: { LocationID: { aisle: loc.aisle, bin: loc.bin, level: loc.level } },
          data: { status: 'STAGED' },
        });
        await writeLog({
          userId: 'z002p23', actionType: 'STAGE', timestamp: now,
          locationAisle: loc.aisle, locationBin: loc.bin, locationLevel: loc.level,
          functionCode: 'GPM',
          details: { storageCode: loc.storageCode, size: loc.size, seeded: true, workerLog: true },
        }, tx);
        locationsStaged++;
        stagedAisles.add(aisle);
        const list = byAisle.get(aisle)!;
        const idx = list.indexOf(loc);
        if (idx !== -1) list.splice(idx, 1);
      }
      loads++;
    }
  }

  return { locations: locationsStaged, loads, aisles: stagedAisles.size };
}

/**
 * Backdates a handful of *additional* staged locations to sometime 8-24 hours ago (not
 * part of today's shift, attributed to whichever demo users exist, for SAR's Staged
 * Longest column to have a believable tail beyond just today's shift) — see the
 * `OLDER_STAGE_*` constants above. Draws from whatever's still EMPTY-eligible after
 * `simulateGpmStaging` has already run.
 */
async function seedOlderStagedLocations(tx: TxClient, now: Date): Promise<number> {
  const seedUsers = (await tx.user.findMany({ select: { zNumber: true } })).map((u) => u.zNumber);
  const attributionUsers = seedUsers.length > 0 ? seedUsers : [SEED_USER_Z];

  const eligible = await tx.location.findMany({
    where: {
      status: 'EMPTY', contraction: false, size: { not: 'XS' },
      ...NOT_HELD_FILTER,
    },
    select: { aisle: true, bin: true, level: true, storageCode: true, size: true },
    take: 500,
  });
  const chosen = shuffle(eligible).slice(0, randomInt(10, 15));

  for (const loc of chosen) {
    const ageSeconds = OLDER_STAGE_MIN_AGE_SECONDS
      + Math.min(randomExponentialAgeSeconds(OLDER_STAGE_MEAN_AGE_SECONDS), OLDER_STAGE_MAX_AGE_SECONDS - OLDER_STAGE_MIN_AGE_SECONDS);
    const timestamp = new Date(now.getTime() - ageSeconds * 1000);
    await tx.location.update({
      where: { LocationID: { aisle: loc.aisle, bin: loc.bin, level: loc.level } },
      data: { status: 'STAGED' },
    });
    await writeLog({
      userId: randomFrom(attributionUsers), actionType: 'STAGE', timestamp,
      locationAisle: loc.aisle, locationBin: loc.bin, locationLevel: loc.level,
      details: { storageCode: loc.storageCode, size: loc.size, seeded: true },
    }, tx);
  }

  return chosen.length;
}

/**
 * z002p24 — light IM work, alternating between clearing a hold and editing a pallet's
 * carton count roughly every 15-20 minutes. On a fresh day (`isFreshDay`), first seeds
 * ~15 "overnight" holds (placed by another demo user, backdated before the shift starts)
 * so there's something real for z002p24 to have found and cleared.
 */
async function simulateImWork(tx: TxClient, resumeFrom: Date, w: ShiftWindow, isFreshDay: boolean): Promise<{ holdsCleared: number; palletsEdited: number }> {
  if (isFreshDay) {
    const otherUsers = WORKER_LOG_ZNUMBERS.filter((z) => z !== 'z002p24');
    const candidates = await tx.location.findMany({
      where: { holdCategory: null },
      select: { aisle: true, bin: true, level: true },
      take: 500,
    });
    const chosen = shuffle(candidates).slice(0, 15);
    const holdCategories: string[] = ['HOLD_IN', 'HOLD_BOTH', 'HOLD_PERM'];
    for (const loc of chosen) {
      const category = randomFrom(holdCategories);
      const placedAt = new Date(w.shiftStart.getTime() - randomInt(1, 14) * 3_600_000);
      await tx.location.update({ where: { LocationID: loc }, data: { holdCategory: category } });
      await writeLog({
        userId: randomFrom(otherUsers), actionType: 'HOLD_PLACE', timestamp: placedAt,
        locationAisle: loc.aisle, locationBin: loc.bin, locationLevel: loc.level,
        details: { holdCategory: category, seeded: true },
      }, tx);
    }
  }

  let t = pastBreak(resumeFrom, w);
  let holdsCleared = 0;
  let palletsEdited = 0;
  let doHold = true;

  while (t < w.shiftEnd) {
    if (doHold) {
      const held = await tx.location.findFirst({
        where: { holdCategory: { not: null } },
        select: { aisle: true, bin: true, level: true, holdCategory: true },
      });
      if (held) {
        await tx.location.update({
          where: { LocationID: { aisle: held.aisle, bin: held.bin, level: held.level } },
          data: { holdCategory: null },
        });
        await writeLog({
          userId: 'z002p24', actionType: 'HOLD_CLEAR', timestamp: t,
          locationAisle: held.aisle, locationBin: held.bin, locationLevel: held.level,
          details: { previousHoldCategory: held.holdCategory, workerLog: true },
        }, tx);
        holdsCleared++;
      }
    } else {
      const pallet = await tx.pallet.findFirst({
        where: { status: 'STORED', currentCartons: { gt: 1 } },
        select: { pid: true, dept: true, class: true, item: true, currentCartons: true, locationAisle: true, locationBin: true, locationLevel: true },
      });
      if (pallet) {
        const delta = randomFrom([-2, -1, 1, 2]);
        const newCartons = Math.max(1, pallet.currentCartons + delta);
        await tx.pallet.update({ where: { pid: pallet.pid }, data: { currentCartons: newCartons } });
        await writeLog({
          userId: 'z002p24', actionType: 'EDIT_PAL', timestamp: t,
          palletId: pallet.pid, locationAisle: pallet.locationAisle ?? undefined, locationBin: pallet.locationBin ?? undefined, locationLevel: pallet.locationLevel ?? undefined,
          dept: pallet.dept, class: pallet.class, item: pallet.item,
          details: { field: 'currentCartons', before: pallet.currentCartons, after: newCartons, workerLog: true },
        }, tx);
        palletsEdited++;
      }
    }

    doHold = !doHold;
    t = pastBreak(new Date(t.getTime() + randomInt(15, 20) * 60_000), w);
  }

  return { holdsCleared, palletsEdited };
}

/** Physical Size rank, smallest to largest — matches the "Larges into mediums/smalls,
 *  mediums into smalls/half smalls" progression z002p25's consolidation shift follows. */
const SIZE_RANK: Record<string, number> = { XS: 0, HS: 1, S: 2, M: 3, L: 4 };

/**
 * z002p25 — consolidation, ~1 pallet every 3-4 minutes. Two behaviors:
 *   - Normal (~90% of events): finds a DPCI with more than one currently-STORED pallet
 *     spread across differing location sizes, merges the larger-size one into the
 *     smaller-size one — mirrors `manualConfirm`'s real consolidate transaction (puts.ts)
 *     exactly: target absorbs the source's quantities, source becomes CONSOLIDATED with
 *     its location fields nulled, and the source's freed location flips back to EMPTY.
 *   - Occasional (~10%): corrects a Food-storage-code pallet that was seeded (on a fresh
 *     day, via `isFreshDay`) sitting at a non-food location — nothing in normal seeding
 *     ever produces this on its own (every pallet's storageCode is always copied from
 *     wherever it's actually stored), so a handful of these anomalies are deliberately
 *     engineered up front for z002p25 to occasionally discover and fix this shift.
 */
async function simulateConsolidation(tx: TxClient, resumeFrom: Date, w: ShiftWindow, isFreshDay: boolean): Promise<number> {
  const FOOD_CODES = ['FD', 'NF', 'RF'];

  if (isFreshDay) {
    const foodPallets = await tx.pallet.findMany({
      where: { status: 'STORED', itemRef: { storageCode: { in: FOOD_CODES } } },
      select: { pid: true },
      take: 200,
    });
    const nonFoodEmpty = await tx.location.findMany({
      where: { status: 'EMPTY', contraction: false, storageCode: { notIn: FOOD_CODES } },
      select: { aisle: true, bin: true, level: true, storageCode: true, size: true, zone: true },
      take: 200,
    });
    const misplacedCount = Math.min(6, foodPallets.length, nonFoodEmpty.length);
    const chosenPallets = shuffle(foodPallets).slice(0, misplacedCount);
    const chosenLocs = shuffle(nonFoodEmpty).slice(0, misplacedCount);
    for (let i = 0; i < misplacedCount; i++) {
      const p = chosenPallets[i], loc = chosenLocs[i];
      await tx.pallet.update({
        where: { pid: p.pid },
        data: { locationAisle: loc.aisle, locationBin: loc.bin, locationLevel: loc.level, storageCode: loc.storageCode, size: loc.size, zone: loc.zone },
      });
      await tx.location.update({
        where: { LocationID: { aisle: loc.aisle, bin: loc.bin, level: loc.level } },
        data: { status: 'STORED' },
      });
    }
  }

  let t = pastBreak(resumeFrom, w);
  let count = 0;
  let consecutiveMisses = 0;

  while (t < w.shiftEnd && consecutiveMisses < 5) {
    let handled = false;

    if (Math.random() < 0.1) {
      const misplaced = await tx.pallet.findFirst({
        where: { status: 'STORED', itemRef: { storageCode: { in: FOOD_CODES } }, storageCode: { notIn: FOOD_CODES } },
        select: { pid: true, dept: true, class: true, item: true, currentCartons: true, currentPallets: true, currentSSPs: true, locationAisle: true, locationBin: true, locationLevel: true },
      });
      if (misplaced) {
        const target = await tx.pallet.findFirst({
          where: { status: 'STORED', dept: misplaced.dept, class: misplaced.class, item: misplaced.item, pid: { not: misplaced.pid }, itemRef: { storageCode: { in: FOOD_CODES } } },
          select: { pid: true, currentCartons: true, currentPallets: true, currentSSPs: true },
        });
        if (target) {
          await tx.pallet.update({
            where: { pid: target.pid },
            data: {
              currentCartons: target.currentCartons + misplaced.currentCartons,
              currentPallets: target.currentPallets + misplaced.currentPallets,
              currentSSPs: target.currentSSPs + misplaced.currentSSPs,
            },
          });
          await tx.pallet.update({
            where: { pid: misplaced.pid },
            data: {
              currentCartons: 0, currentPallets: 0, currentSSPs: 0, status: 'CONSOLIDATED',
              locationAisle: null, locationBin: null, locationLevel: null, storageCode: null, size: null, zone: null,
            },
          });
          await tx.location.update({
            where: { LocationID: { aisle: misplaced.locationAisle!, bin: misplaced.locationBin!, level: misplaced.locationLevel! } },
            data: { status: 'EMPTY' },
          });
          await writeLog({
            userId: 'z002p25', actionType: 'CONSOLID', timestamp: t,
            palletId: misplaced.pid, locationAisle: misplaced.locationAisle ?? undefined, locationBin: misplaced.locationBin ?? undefined, locationLevel: misplaced.locationLevel ?? undefined,
            dept: misplaced.dept, class: misplaced.class, item: misplaced.item,
            functionCode: 'CON',
            details: {
              targetPalletId: target.pid, sourcePalletId: misplaced.pid,
              cartons: misplaced.currentCartons, pallets: misplaced.currentPallets, ssps: misplaced.currentSSPs,
              method: 'MNP', misplacedFoodCorrection: true, workerLog: true,
            },
          }, tx);
          count++;
          handled = true;
        }
      }
    }

    if (!handled) {
      const groups = await tx.pallet.groupBy({
        by: ['dept', 'class', 'item'],
        where: { status: 'STORED', locationAisle: { not: null } },
        _count: { pid: true },
        having: { pid: { _count: { gt: 1 } } },
      });

      for (const g of shuffle(groups)) {
        const candidates = await tx.pallet.findMany({
          where: { status: 'STORED', dept: g.dept, class: g.class, item: g.item, locationAisle: { not: null } },
          select: { pid: true, size: true, currentCartons: true, currentPallets: true, currentSSPs: true, locationAisle: true, locationBin: true, locationLevel: true, dept: true, class: true, item: true },
        });
        candidates.sort((a, b) => SIZE_RANK[b.size ?? 'XS'] - SIZE_RANK[a.size ?? 'XS']);
        const source = candidates[0];
        const target = candidates.find((c) => c.pid !== source.pid && SIZE_RANK[c.size ?? 'XS'] < SIZE_RANK[source.size ?? 'XS']);
        if (!target) continue;

        await tx.pallet.update({
          where: { pid: target.pid },
          data: {
            currentCartons: target.currentCartons + source.currentCartons,
            currentPallets: target.currentPallets + source.currentPallets,
            currentSSPs: target.currentSSPs + source.currentSSPs,
          },
        });
        await tx.pallet.update({
          where: { pid: source.pid },
          data: {
            currentCartons: 0, currentPallets: 0, currentSSPs: 0, status: 'CONSOLIDATED',
            locationAisle: null, locationBin: null, locationLevel: null, storageCode: null, size: null, zone: null,
          },
        });
        await tx.location.update({
          where: { LocationID: { aisle: source.locationAisle!, bin: source.locationBin!, level: source.locationLevel! } },
          data: { status: 'EMPTY' },
        });
        await writeLog({
          userId: 'z002p25', actionType: 'CONSOLID', timestamp: t,
          palletId: source.pid, locationAisle: source.locationAisle ?? undefined, locationBin: source.locationBin ?? undefined, locationLevel: source.locationLevel ?? undefined,
          dept: source.dept, class: source.class, item: source.item,
          functionCode: 'CON',
          details: {
            targetPalletId: target.pid, sourcePalletId: source.pid,
            cartons: source.currentCartons, pallets: source.currentPallets, ssps: source.currentSSPs,
            method: 'MNP', workerLog: true,
          },
        }, tx);
        count++;
        handled = true;
        break;
      }
    }

    consecutiveMisses = handled ? 0 : consecutiveMisses + 1;
    t = pastBreak(new Date(t.getTime() + randomInt(3, 4) * 60_000), w);
  }

  return count;
}

interface ContainerRow {
  cid: string;
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
 * pull containers, for the pre-login "Reseed Test Data" dev-tools control (main screen, above
 * the badge scanner). Deletes every PUT_PENDING pallet and every not-yet-pulled container
 * (AVAILABLE/PRINTED — leaves PULLED/DIVERTED/CANCELED/PURGED history untouched), then:
 *
 * - Creates ROWS_PER_COMBO fresh PUT_PENDING pallets for every (storageCode, size) combo
 *   present in the Location table, with a random item/quantity (no realism constraint —
 *   any DPCI/quantity is fine for a put pallet). `simulateRackPuts` (below) then converts
 *   some of this same fresh stock to STORED as part of its own historical-activity
 *   simulation — direct instruction: afterward, every combo is topped back up to
 *   `PENDING_MIN_PER_COMBO` PUT_PENDING pallets (only combos that actually fell short get
 *   more created), so a "fresh day" reseed's own full-shift rack-put simulation (up to
 *   ~500 puts, picked with no combo-aware distribution) can't leave specific combos
 *   depleted below what the Demo Scanner's Storage Code/Size filters need to find.
 * - Creates up to ROWS_PER_COMBO fresh PRINTED containers for every (storageCode, pullFunction)
 *   combo (CA_CONTAINER_ROWS_PER_COMBO for CA specifically — see its own doc comment), sourced
 *   only from pallets already STORED at a real location — this does *not* synthesize backing
 *   stock, so a combo with too little real stored inventory at the right level/size will end
 *   up with fewer than that cap's worth of containers (or none). Every
 *   pallet that gets a fresh container also moves to CA_PULL_PEND (CA/CF) or FP_PULL_PEND
 *   (FP) — this is the only place in the app that currently creates containers (PRQ is a
 *   placeholder screen, not a real container-creation workflow yet), simulating "an outside
 *   system created a pull request" per direct product decision. Any pallet still
 *   pull-pending from a prior reseed is reset to STORED first, alongside the container wipe
 *   above, since its old containers no longer exist.
 * - Staging is simulated shift-realistically via `simulateGpmStaging` (see its own doc
 *   comment) — a "triple load" every 5-7 minutes, one aisle at a time, filling each
 *   aisle back-to-front (highest bin first) the same way a real GPMer/`findNextStagingLocation`
 *   would, not a random scatter. Because that simulation only covers `[shiftStart,
 *   shiftEnd]` (`shiftEnd` is `min(now, 4pm)`), reseeding before the 6am shift start
 *   produces an empty window and zero simulated staging — `simulateGpmStaging` tops itself
 *   up to a guaranteed minimum aisle count regardless, so SAR/STG never look empty
 *   immediately after a reseed no matter what time it's run.
 *
 * All batch dates are today's date; purge dates are 7 days out, per outline.md. The whole
 * operation runs in a single transaction so a failure partway through leaves the previous
 * data set intact rather than a half-deleted, half-repopulated one.
 *
 * Unauthenticated by design, matching /api/health — called from the pre-login screen
 * before any session exists.
 *
 * @returns `{ putPalletsCreated, containersCreated, containersByStorageCodeAndFunction,
 *   workerActivityLog }` — see the "Worker Activity Log" section comment near the top of
 *   this file for what `workerActivityLog`'s fields mean.
 */
async function reseedTestData(_req: HttpRequest, _ctx: InvocationContext): Promise<unknown> {
  // Default interactive-transaction timeout (5s) is nowhere near enough once a fresh-day
  // Worker Activity Log run kicks in — hundreds of sequential awaited writes across 5
  // simulated shifts. 5 minutes comfortably covers a full fresh-day generation; a
  // same-day "fill in from where it left off" re-run is much faster (only the gap since
  // the last reseed) and never gets close to this ceiling.
  return prisma.$transaction(async (tx) => {
    await tx.container.deleteMany({ where: { status: { in: ['AVAILABLE', 'PRINTED'] } } });
    // Every not-yet-pulled container was just wiped, so no pallet has an outstanding pull
    // request anymore — reset any pallet still carrying a pull-pending status back to
    // STORED before regenerating fresh containers below (v1.6.9's CA_PULL_PEND/FP_PULL_PEND
    // rule; see pulls.ts's verifyPull for the same "reset once nothing's left pending"
    // logic on the normal completion path).
    await tx.pallet.updateMany({
      where: { status: { in: ['CA_PULL_PEND', 'FP_PULL_PEND'] } },
      data: { status: 'STORED' },
    });
    // A PUT_PENDING pallet can have an open SDP reservation (Reservation.palletId is a
    // required FK) and/or ActivityLog rows referencing it — clear both first or the pallet
    // delete below fails with a foreign key violation (see issue #51: an abandoned reservation
    // or a routine "received"/"put" log entry from a prior session blocks every future reseed
    // until manually cleared). Scoped to just the pallets being deleted, not a full-table wipe,
    // since this endpoint only regenerates disposable put-pending test data. CANCELED is
    // included alongside PUT_PENDING — both are seeded fresh below (a small fraction of
    // each combo's rows are seeded CANCELED instead), so both need the same
    // wipe-then-regenerate treatment.
    const disposablePalletStatus = { in: ['PUT_PENDING', 'CANCELED'] };
    await tx.reservation.deleteMany({ where: { pallet: { status: disposablePalletStatus } } });
    await tx.activityLog.deleteMany({ where: { pallet: { status: disposablePalletStatus } } });
    await tx.pallet.deleteMany({ where: { status: disposablePalletStatus } });

    // Clear every prior seeded/real staging log entry before regenerating — same
    // wipe-then-regenerate pattern as pallets/containers above, so repeated reseeds don't
    // pile up stale STAGE/STAGE_SUM/RESTAGE rows. SAR and the STG live info panel only
    // ever read the *current* STAGED locations and their most recent matching STAGE log
    // entry, so this is safe to clear outright rather than scope to specific locations.
    await tx.activityLog.deleteMany({ where: { actionType: { in: ['STAGE', 'STAGE_SUM', 'RESTAGE'] } } });

    // ── Put pallets: ROWS_PER_COMBO per (storageCode, size) combo ─────────────────
    const locationCombos = await tx.location.findMany({
      select: { storageCode: true, size: true },
      distinct: ['storageCode', 'size'],
    });

    const genPid = makePidGenerator(
      new Set((await tx.pallet.findMany({ select: { pid: true } })).map((p) => p.pid)),
    );

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

    /**
     * Builds one fresh PUT_PENDING (or, per `allowCanceled`, occasionally CANCELED)
     * pallet row for the given combo — extracted so both the initial full batch below and
     * the post-simulation top-up (after `simulateRackPuts`, see its own comment) build
     * identical rows without duplicating the field list.
     */
    function makePendingPalletRow(
      combo: { storageCode: string; size: string },
      item: { dept: number; class: number; item: number },
      allowCanceled: boolean,
    ) {
      const vcp = randomFrom(VCP_OPTIONS);
      const ssp = Math.random() < 0.5 ? vcp : vcp / 2;
      const receivedCartons = randomInt(6, 20);
      // NOTE (found while adding cartonsPerPallet, not fixed here — pre-existing and out
      // of scope): this doesn't match the loose-SSPs-below-one-carton's-worth rule
      // PII/editPallet enforce elsewhere (currentSSPs should be < vcp/ssp); same
      // pre-existing pattern as seed-pending-pallets.ts.
      const receivedSSPs = receivedCartons * ssp;

      // A small fraction seeded CANCELED instead of PUT_PENDING — a voided/canceled
      // receiving record — so SDP's "Invalid Pallet: Canceled" demo option has a real
      // pallet to find. Never rolled for the post-simulation top-up (`allowCanceled:
      // false`) — that pass exists specifically to guarantee a PUT_PENDING floor per
      // combo, so a row that doesn't count toward PUT_PENDING would defeat its own point.
      const status = allowCanceled && Math.random() < 0.05 ? 'CANCELED' : 'PUT_PENDING';

      return {
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
        cartonsPerPallet: cartonsPerPalletFor(receivedCartons, receivedSSPs),
        vcp,
        ssp,
        status,
        // A pallet always has a Storage Code/Size, even before its first put — initially
        // the combo it was generated for (matching the item's own intrinsic Storage
        // Code, per `getItems` above), later overwritten by `placePallet` to match
        // wherever it's actually stored (see `Pallet.storageCode`'s own doc comment).
        storageCode: combo.storageCode,
        size: combo.size,
        locationAisle: null,
        locationBin: null,
        locationLevel: null,
        receivedByZ: SEED_USER_Z,
        receivedAt: now,
      };
    }

    const putPalletRows = [];
    for (const combo of locationCombos) {
      const items = await getItems(combo.storageCode);
      if (items.length === 0) continue;

      for (let i = 0; i < ROWS_PER_COMBO; i++) {
        putPalletRows.push(makePendingPalletRow(combo, randomFrom(items), true));
      }
    }
    if (putPalletRows.length > 0) await tx.pallet.createMany({ data: putPalletRows });

    // ── Containers: up to ROWS_PER_COMBO per (storageCode, pullFunction) combo ────
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
    const buckets = new Map<string, ContainerRow[]>();
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
        const cap = fn === 'CA' ? CA_CONTAINER_ROWS_PER_COMBO : ROWS_PER_COMBO;
        if (bucket.length >= cap) continue;

        const store = stores[storeIdx % stores.length];
        storeIdx++;
        bucket.push({
          cid: genCid(store.id, p.dept, p.class, p.item, p.pid, batchDate),
          pid: p.pid, dept: p.dept, class: p.class, item: p.item,
          quantity: qty, sspQuantity: 0, batchDate, purgeDate,
          destinationStore: store.id, status: 'PRINTED', pullFunction: fn,
        });
        buckets.set(key, bucket);
      }
    }

    const containerRows = [...buckets.values()].flat();
    if (containerRows.length > 0) await tx.container.createMany({ data: containerRows });

    // Every fresh container just created puts its pallet in a pull-pending state — CA/CF
    // (carton-granularity) map to CA_PULL_PEND, FP (full-pallet) maps to FP_PULL_PEND. A
    // pallet can end up with more than one container of different functions in this same
    // pass (e.g. a non-emptying CA/CF container and an emptying FP container both generated for
    // it); FP_PULL_PEND wins that tie since a full-pallet pull is the more complete/
    // impactful pending action. Location.status is deliberately left untouched — this is
    // a Pallet-only status per direct product decision.
    const pullPendingByPid = new Map<number, 'CA_PULL_PEND' | 'FP_PULL_PEND'>();
    for (const row of containerRows) {
      const target = row.pullFunction === 'FP' ? 'FP_PULL_PEND' : 'CA_PULL_PEND';
      if (pullPendingByPid.get(row.pid) !== 'FP_PULL_PEND') pullPendingByPid.set(row.pid, target);
    }
    const caPids: number[] = [];
    const fpPids: number[] = [];
    for (const [pid, status] of pullPendingByPid) {
      (status === 'FP_PULL_PEND' ? fpPids : caPids).push(pid);
    }
    if (caPids.length > 0) await tx.pallet.updateMany({ where: { pid: { in: caPids } }, data: { status: 'CA_PULL_PEND' } });
    if (fpPids.length > 0) await tx.pallet.updateMany({ where: { pid: { in: fpPids } }, data: { status: 'FP_PULL_PEND' } });

    const containersByStorageCodeAndFunction: Record<string, number> = {};
    for (const [key, rows] of buckets) containersByStorageCodeAndFunction[key] = rows.length;

    // ── Worker Activity Log: each of the 5 demo workers' shift simulation ─────────
    //
    // See the "Worker Activity Log" section comment near the top of this file for the
    // full design (fixed 6AM-4PM window per calendar day, shared 10:00-10:30 break,
    // resume-from-where-it-left-off on repeated same-day reseeds). This replaces the
    // previous generic random-aisle-percentage staging simulation entirely — z002p23's
    // shift *is* the staging simulation now.
    const shiftWindow = todaysShiftWindow(now);
    const isFreshDay = !(await tx.activityLog.findFirst({
      where: {
        userId: { in: [...WORKER_LOG_ZNUMBERS] },
        timestamp: { gte: shiftWindow.shiftStart },
        details: { contains: WORKER_LOG_MARKER },
      },
      select: { id: true },
    }));

    // On a fresh day, reset staging to a clean slate before today's shift starts —
    // same "wipe stale STAGE/STAGE_SUM/RESTAGE rows" rationale the old simulation used,
    // just gated so a same-day repeat reseed doesn't erase the staging progress (and log
    // entries) it already generated earlier today.
    if (isFreshDay) {
      await tx.location.updateMany({ where: { status: 'STAGED' }, data: { status: 'EMPTY' } });
      await tx.activityLog.deleteMany({ where: { actionType: { in: ['STAGE', 'STAGE_SUM', 'RESTAGE'] } } });
    }

    // FunctionAssignment stub (IRP hard dependency — no in-app assignment UI exists yet;
    // that's owned by the paired lead web app, out of scope here). One full-shift block
    // per simulated worker, matching the function they're actually shown doing below.
    // z002p24 (IM work: holds/pallet edits) isn't an IRP prod function, so gets no row.
    // z002p23 (Marcus Webb, the only LEAD-role demo user) is assignedByZ for all of them.
    // Uses the *intended* shift end (4pm), not shiftWindow.shiftEnd (which is capped at
    // "now") — IRP itself caps time-in-function display at the current moment, the
    // assignment block should reflect what was actually scheduled.
    const assignmentDate = new Date(
      shiftWindow.shiftStart.getFullYear(), shiftWindow.shiftStart.getMonth(), shiftWindow.shiftStart.getDate(),
    );
    const shiftEndCap = new Date(
      shiftWindow.shiftStart.getFullYear(), shiftWindow.shiftStart.getMonth(), shiftWindow.shiftStart.getDate(), 16, 0, 0, 0,
    );
    const FUNCTION_ASSIGNMENTS: { workerZ: string; functionCode: string }[] = [
      { workerZ: 'z002p21', functionCode: 'CA' },
      { workerZ: 'z002p22', functionCode: 'RP' },
      { workerZ: 'z002p23', functionCode: 'GPM' },
      { workerZ: 'z002p25', functionCode: 'CON' },
    ];
    for (const a of FUNCTION_ASSIGNMENTS) {
      const exists = await tx.functionAssignment.findFirst({
        where: { workerZ: a.workerZ, functionCode: a.functionCode, date: assignmentDate },
        select: { id: true },
      });
      if (!exists) {
        await tx.functionAssignment.create({
          data: {
            workerZ: a.workerZ,
            functionCode: a.functionCode,
            date: assignmentDate,
            startTime: shiftWindow.shiftStart,
            endTime: shiftEndCap,
            assignedByZ: 'z002p23',
          },
        });
      }
    }

    const cartonAirPullResume = await getShiftResumePoint(tx, 'z002p21', shiftWindow);
    const pullsSimulated = await simulateCartonAirPulls(tx, cartonAirPullResume, shiftWindow);

    const rackPutResume = await getShiftResumePoint(tx, 'z002p22', shiftWindow);
    const putsSimulated = await simulateRackPuts(tx, rackPutResume, shiftWindow);

    // Top up every combo back to PENDING_MIN_PER_COMBO now that simulateRackPuts has had
    // its turn (direct instruction — the freshly-generated Put Pending pool above is
    // exactly what simulateRackPuts consumes to produce realistic historical activity, but
    // a "fresh day" reseed can run the full 6am-4pm shift at ~50/hour — up to ~500 puts,
    // picked via a plain `findFirst` with no combo-aware distribution, so specific combos
    // can end up far more depleted than others even when the overall pool isn't exhausted).
    // Only tops up combos that actually fell short — a same-day incremental reseed
    // (simulateRackPuts' own far more common case, resuming from wherever it left off
    // rather than a full shift) typically doesn't touch this at all.
    const pendingTopUpRows = [];
    for (const combo of locationCombos) {
      const currentCount = await tx.pallet.count({
        where: { status: 'PUT_PENDING', storageCode: combo.storageCode, size: combo.size },
      });
      if (currentCount >= PENDING_MIN_PER_COMBO) continue;
      const items = await getItems(combo.storageCode);
      if (items.length === 0) continue;
      for (let i = currentCount; i < PENDING_MIN_PER_COMBO; i++) {
        pendingTopUpRows.push(makePendingPalletRow(combo, randomFrom(items), false));
      }
    }
    if (pendingTopUpRows.length > 0) await tx.pallet.createMany({ data: pendingTopUpRows });

    const stagingResume = await getShiftResumePoint(tx, 'z002p23', shiftWindow);
    const stagingResult = await simulateGpmStaging(tx, stagingResume, shiftWindow);
    const olderStagedLocations = isFreshDay ? await seedOlderStagedLocations(tx, now) : 0;

    const imWorkResume = await getShiftResumePoint(tx, 'z002p24', shiftWindow);
    const imWorkResult = await simulateImWork(tx, imWorkResume, shiftWindow, isFreshDay);

    const consolidationResume = await getShiftResumePoint(tx, 'z002p25', shiftWindow);
    const consolidationsSimulated = await simulateConsolidation(tx, consolidationResume, shiftWindow, isFreshDay);

    return {
      putPalletsCreated: putPalletRows.length,
      putPalletsToppedUp: pendingTopUpRows.length,
      containersCreated: containerRows.length,
      containersByStorageCodeAndFunction,
      // Top-level fields the login screen's reseed summary actually reads (ReseedResult in
      // src/lib/api.ts) — previously never populated here, only nested below under
      // workerActivityLog.z002p23*, so LoginPage.tsx's summary always showed "undefined
      // staged across undefined aisles" regardless of how much staging actually happened.
      locationsStaged: stagingResult.locations,
      aislesStaged: stagingResult.aisles,
      workerActivityLog: {
        isFreshDay,
        shiftWindow: { start: shiftWindow.shiftStart, end: shiftWindow.shiftEnd },
        z002p21CartonAirPulls: pullsSimulated,
        z002p22RackPuts: putsSimulated,
        z002p23StagingLoads: stagingResult.loads,
        z002p23LocationsStaged: stagingResult.locations,
        olderStagedLocations,
        z002p24HoldsCleared: imWorkResult.holdsCleared,
        z002p24PalletsEdited: imWorkResult.palletsEdited,
        z002p25Consolidations: consolidationsSimulated,
      },
    };
  }, { timeout: 300_000, maxWait: 30_000 });
}

app.http('reseedTestData', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'demo/reseed',
  handler: withHandler(reseedTestData),
});
