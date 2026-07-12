import { app } from '@azure/functions';
import type { HttpRequest, InvocationContext } from '@azure/functions';
import prisma from '../lib/prisma.js';
import { withHandler } from '../lib/response.js';
import { requireAuth, requireRole, hasMinRole } from '../lib/permissions.js';
import { writeLog } from '../lib/activityLog.js';
import { parseLocationBarcode, parseFullLocationBarcode, formatLocationId } from '../lib/locationParser.js';
import { sideOf } from '../lib/zoneLogic.js';
import type { Role } from '../lib/jwt.js';

// Canonical ascending size order (mirrors SIZES in src/pages/ELAPage.tsx and STGPage.tsx).
const SIZE_ORDER = ['XS', 'HS', 'S', 'M', 'L'];

// Minimum role to place / remove each hold category, per DevNotes/Screen-Specs/WLH.md's
// hold table. Hold Both may be *placed* by any role (WORKER is the lowest rank, so this
// is effectively "no restriction") but only removed by IM+.
const HOLD_PLACE_MIN_ROLE: Record<string, Role> = {
  HOLD_IN: 'IM',
  HOLD_OUT: 'IM',
  HOLD_BOTH: 'WORKER',
  HOLD_PERM: 'LEAD',
};
const HOLD_REMOVE_MIN_ROLE: Record<string, Role> = {
  HOLD_IN: 'IM',
  HOLD_OUT: 'IM',
  HOLD_BOTH: 'IM',
  HOLD_PERM: 'LEAD',
};

const PALLET_SUMMARY_SELECT = {
  pid: true, dept: true, class: true, item: true,
  currentCartons: true, currentPallets: true, currentSSPs: true, status: true,
} as const;

/**
 * Looks up a location. Two modes based on input length:
 *   - 8 digits (Aisle+Bin+Level): exact lookup on the full composite key. Used by LII,
 *     which always knows the specific level by the time it calls this (either parsed
 *     from a full barcode scan, or from its own three-field Aisle/Bin/Level entry).
 *   - 6 digits (Aisle+Bin): `findFirst` ignoring level — the original Phase 4 behavior,
 *     kept for MNP, which validates a bin exists before its level-selection modal runs
 *     and only ever sends 6 digits; MNP doesn't read any field from the response, so
 *     the richer shape below is a no-op for it, not a breaking change.
 *
 * @param req - HTTP request with URL param `id` (6 or 8-digit location barcode string)
 * @returns Full location detail: aisle, bin, level, zone, storageCode, size, status,
 *   holdCategory, and a pallet summary (or null) if occupied
 * @throws 400 INVALID_INPUT if the barcode format is not exactly 6 or 8 digits;
 *   404 NOT_FOUND if no matching location record exists
 */
async function getLocation(req: HttpRequest, _ctx: InvocationContext): Promise<unknown> {
  await requireAuth(req);

  const raw = req.params.id ?? '';
  const full = parseFullLocationBarcode(raw);

  const location = full
    ? await prisma.location.findUnique({
        where: { LocationID: { aisle: full.aisle, bin: full.bin, level: full.level } },
        include: { pallets: { select: PALLET_SUMMARY_SELECT } },
      })
    : await (() => {
        const parsed = parseLocationBarcode(raw);
        if (!parsed) throw Object.assign(new Error('INVALID_INPUT'), { status: 400 });
        return prisma.location.findFirst({
          where: { aisle: parsed.aisle, bin: parsed.bin },
          include: { pallets: { select: PALLET_SUMMARY_SELECT } },
        });
      })();

  if (!location) throw Object.assign(new Error('NOT_FOUND'), { status: 404 });

  const pallet = location.pallets[0] ?? null;

  return {
    aisle:       location.aisle,
    bin:         location.bin,
    level:       location.level,
    zone:        location.zone,
    storageCode: location.storageCode,
    size:        location.size,
    status:       location.status,
    holdCategory: location.holdCategory,
    pallet: pallet
      ? {
          id: pallet.pid,
          dpci: `${String(pallet.dept).padStart(3, '0')}-${String(pallet.class).padStart(2, '0')}-${String(pallet.item).padStart(4, '0')}`,
          cartons: pallet.currentCartons,
          pallets: pallet.currentPallets,
          ssps:    pallet.currentSSPs,
          status:  pallet.status,
        }
      : null,
  };
}

/**
 * Full Storage Code reference list (issue #80) — every `{code, desc}` pair, e.g.
 * `{ code: "CR", desc: "Conveyable Reserve" }`. Feeds the un-narrowed case of the shared
 * StorageCodeField's dropdown-helper popup (screens with no aisle entered yet to narrow
 * by); the narrowed case is derived client-side from `GET /api/locations/empty-by-zone`
 * instead, which already returns exactly the storage codes present in a given aisle.
 *
 * @returns `{ code: string; desc: string }[]`, sorted alphabetically by code
 */
async function getStorageCodes(req: HttpRequest): Promise<unknown> {
  await requireAuth(req);

  const codes = await prisma.storageCode.findMany({
    select: { id: true, desc: true },
    orderBy: { id: 'asc' },
  });

  return codes.map((c) => ({ code: c.id, desc: c.desc }));
}

/**
 * Empty Locations by Aisle (ELA). Returns, per aisle, the count of EMPTY and STAGED
 * locations for every size present in that aisle at the given Storage Code — the GPMer's
 * primary space-finding tool before bringing pallet stacks into the building. See
 * DevNotes/Screen-Specs/ELA.md.
 *
 * storageCode is matched exactly (case-insensitive); size selects which aisles qualify
 * (an aisle is included only if the *queried* size has at least one non-zero empty or
 * staged count there) but each qualifying aisle's `sizes` breakdown covers every size
 * present in that aisle, not just the one searched for — e.g. searching CR-S returns
 * HS/S/M/L columns for any matching CR aisle. Sorted by totalEmpty (summed across all
 * sizes in the aisle) descending — staged does not affect sort order.
 *
 * `size` is optional (added for STG's live info panel — see Feature 2 in
 * DevNotes/DesignPrompts/Feature-2-STG-Live-Matching-Aisle-Zone-Info.md, "Storage Code
 * only" state): when omitted, an aisle qualifies if *any* size has a non-zero empty or
 * staged count, rather than requiring one specific queried size to be non-zero.
 *
 * @param req - HTTP request with query param `storageCode` (required) and `size` (optional)
 * @returns Array of `{ aisle, totalEmpty, sizes: [{ size, empty, staged }] }`, sizes sorted
 *   per SIZE_ORDER
 * @throws 400 INVALID_INPUT if `storageCode` is missing
 */
async function getLocationsEmptyByAisle(req: HttpRequest): Promise<unknown> {
  await requireAuth(req);

  const params = new URL(req.url).searchParams;
  const storageCodeParam = params.get('storageCode');
  const sizeParam = params.get('size');
  if (!storageCodeParam) {
    throw Object.assign(new Error('INVALID_INPUT'), { status: 400 });
  }
  const storageCode = storageCodeParam.toUpperCase();
  const size = sizeParam ? sizeParam.toUpperCase() : null;

  const [empties, stageds] = await Promise.all([
    prisma.location.groupBy({
      by: ['aisle', 'size'],
      where: { storageCode, status: 'EMPTY' },
      _count: { _all: true },
    }),
    prisma.location.groupBy({
      by: ['aisle', 'size'],
      where: { storageCode, status: 'STAGED' },
      _count: { _all: true },
    }),
  ]);

  const byAisle = new Map<number, Map<string, { empty: number; staged: number }>>();
  for (const row of empties) {
    if (!byAisle.has(row.aisle)) byAisle.set(row.aisle, new Map());
    byAisle.get(row.aisle)!.set(row.size, { empty: row._count._all, staged: 0 });
  }
  for (const row of stageds) {
    if (!byAisle.has(row.aisle)) byAisle.set(row.aisle, new Map());
    const sizes = byAisle.get(row.aisle)!;
    const existing = sizes.get(row.size) ?? { empty: 0, staged: 0 };
    existing.staged = row._count._all;
    sizes.set(row.size, existing);
  }

  return [...byAisle.entries()]
    .filter(([, sizes]) => {
      if (size) {
        const queried = sizes.get(size);
        return queried != null && (queried.empty > 0 || queried.staged > 0);
      }
      return [...sizes.values()].some((counts) => counts.empty > 0 || counts.staged > 0);
    })
    .map(([aisle, sizes]) => {
      const sizeCounts = [...sizes.entries()]
        .map(([s, counts]) => ({ size: s, empty: counts.empty, staged: counts.staged }))
        .sort((a, b) => SIZE_ORDER.indexOf(a.size) - SIZE_ORDER.indexOf(b.size));
      const totalEmpty = sizeCounts.reduce((sum, s) => sum + s.empty, 0);
      return { aisle, totalEmpty, sizes: sizeCounts };
    })
    .sort((a, b) => b.totalEmpty - a.totalEmpty);
}

/**
 * Empty Locations by Zone (ELZ). Returns the full physical grid for one aisle — one entry
 * per level, each carrying the 8 zone-side cells that exist at that level (StorageCode,
 * Size, and Contraction flag) — plus a per-zone summary of EMPTY/STAGED counts broken down
 * by StorageCode-Size, filtered to the requested Storage Code. See DevNotes/Screen-Specs/ELZ.md.
 *
 * Design decision (not fully specified in ELZ.md): the grid reflects every location's
 * actual designation regardless of the storageCode/size filters — it's a physical map, not
 * a filtered view. The filters narrow only the actionable zoneSummary breakdown, mirroring
 * how ELA already scopes its results to one storage code. Contracted locations are
 * excluded from summary counts (they're unusable) but still render, highlighted, in the
 * grid itself.
 *
 * Each zone-side/level cell is expected to carry one uniform StorageCode/Size/Contraction
 * across every bin in that group (true of the current seed data); the first location
 * encountered per group is used as that cell's representative values.
 *
 * `storageCode` and `size` are both optional (added for STG's live info panel — see
 * Feature 2 in DevNotes/DesignPrompts/Feature-2-STG-Live-Matching-Aisle-Zone-Info.md, and
 * incidentally the same relaxation issue #60 wants for ELZ itself, though ELZPage.tsx's own
 * required-both-fields gate is left as-is for now): each filters the zoneSummary breakdown
 * independently when present; when a filter is absent, the breakdown includes every value
 * for that dimension instead of narrowing to one.
 *
 * @param req - HTTP request with query param `aisle` (required), `storageCode` and `size` (both optional)
 * @returns `{ aisle, levels: [{ level, cells: [...] }], zoneSummary: [{ zone, breakdown: [...] }] }`
 * @throws 400 INVALID_INPUT if `aisle` is missing or not numeric;
 *   404 NOT_FOUND if the aisle has no location records
 */
async function getLocationsEmptyByZone(req: HttpRequest): Promise<unknown> {
  await requireAuth(req);

  const params = new URL(req.url).searchParams;
  const aisleParam = params.get('aisle');
  const storageCodeParam = params.get('storageCode');
  const sizeParam = params.get('size');
  if (!aisleParam) {
    throw Object.assign(new Error('INVALID_INPUT'), { status: 400 });
  }
  const aisle = parseInt(aisleParam, 10);
  if (isNaN(aisle)) throw Object.assign(new Error('INVALID_INPUT'), { status: 400 });
  const storageCode = storageCodeParam ? storageCodeParam.toUpperCase() : null;
  const size = sizeParam ? sizeParam.toUpperCase() : null;

  const locations = await prisma.location.findMany({ where: { aisle } });
  if (locations.length === 0) throw Object.assign(new Error('NOT_FOUND'), { status: 404 });

  // Grid: one representative cell per (level, zone, side) group.
  interface CellGroup { zone: number; side: 'odd' | 'even'; storageCode: string; size: string; contraction: boolean }
  const levelMap = new Map<number, Map<string, CellGroup>>();
  for (const loc of locations) {
    const side = sideOf(loc.bin);
    const posKey = `${loc.zone}-${side}`;
    if (!levelMap.has(loc.level)) levelMap.set(loc.level, new Map());
    const cells = levelMap.get(loc.level)!;
    if (!cells.has(posKey)) {
      cells.set(posKey, { zone: loc.zone, side, storageCode: loc.storageCode, size: loc.size, contraction: loc.contraction });
    }
  }
  const levels = [...levelMap.entries()]
    .sort(([a], [b]) => a - b)
    .map(([level, cells]) => ({ level, cells: [...cells.values()] }));

  // Zone summary: EMPTY/STAGED counts by StorageCode-Size, independently narrowed by
  // storageCode and/or size when either is provided, excluding contracted locations.
  interface Breakdown { storageCode: string; size: string; empty: number; staged: number }
  const zoneMap = new Map<number, Map<string, Breakdown>>();
  for (const loc of locations) {
    if (storageCode && loc.storageCode.toUpperCase() !== storageCode) continue;
    if (size && loc.size.toUpperCase() !== size) continue;
    if (loc.contraction) continue;
    if (loc.status !== 'EMPTY' && loc.status !== 'STAGED') continue;
    if (!zoneMap.has(loc.zone)) zoneMap.set(loc.zone, new Map());
    const breakdown = zoneMap.get(loc.zone)!;
    const bdKey = `${loc.storageCode}-${loc.size}`;
    if (!breakdown.has(bdKey)) {
      breakdown.set(bdKey, { storageCode: loc.storageCode, size: loc.size, empty: 0, staged: 0 });
    }
    const entry = breakdown.get(bdKey)!;
    if (loc.status === 'EMPTY') entry.empty++;
    else entry.staged++;
  }
  const zoneSummary = [...zoneMap.entries()]
    .sort(([a], [b]) => a - b)
    .map(([zone, breakdown]) => ({
      zone,
      breakdown: [...breakdown.values()].sort((a, b) => SIZE_ORDER.indexOf(a.size) - SIZE_ORDER.indexOf(b.size)),
    }));

  return { aisle, levels, zoneSummary };
}

/**
 * Picks one location currently on hold, at random (issue #15 — WLH's "find a held
 * location" helper-bar button, per DevNotes/DesignPrompts/Feature-4-WLH-Find-Held-Location.md).
 * Not filtered by aisle, hold type, or anything else — works app-wide, and re-rolls a new
 * random pick on every call, letting the worker "find one, then find another" by tapping
 * repeatedly. Uses the same random-skip approach as the demo endpoints in samples.ts.
 *
 * @returns `{ locationId: string }` — 8-digit Aisle+Bin+Level id
 * @throws 404 NOT_FOUND if no locations currently have a hold
 */
async function getRandomHeldLocation(req: HttpRequest): Promise<unknown> {
  await requireAuth(req);

  const where = { holdCategory: { not: null } };
  const count = await prisma.location.count({ where });
  if (count === 0) throw Object.assign(new Error('NOT_FOUND'), { status: 404 });

  const skip = Math.floor(Math.random() * count);
  const location = await prisma.location.findFirst({ where, skip, select: { aisle: true, bin: true, level: true } });

  return { locationId: formatLocationId(location!.aisle, location!.bin, location!.level) };
}

/**
 * Picks one location currently free of any hold, at random (issue #15's second helper-bar
 * button — the inverse of getRandomHeldLocation). Occupancy status (EMPTY/STORED/RESERVED/
 * STAGED/PULL_PENDING) doesn't matter here — hold is an independent field from status, so
 * any of those qualify as long as holdCategory is null.
 *
 * @returns `{ locationId: string }` — 8-digit Aisle+Bin+Level id
 * @throws 404 NOT_FOUND if every location in the warehouse currently has a hold
 */
async function getRandomUnheldLocation(req: HttpRequest): Promise<unknown> {
  await requireAuth(req);

  const where = { holdCategory: null };
  const count = await prisma.location.count({ where });
  if (count === 0) throw Object.assign(new Error('NOT_FOUND'), { status: 404 });

  const skip = Math.floor(Math.random() * count);
  const location = await prisma.location.findFirst({ where, skip, select: { aisle: true, bin: true, level: true } });

  return { locationId: formatLocationId(location!.aisle, location!.bin, location!.level) };
}

// ── Range Hold (issue #14) ────────────────────────────────────────────────────
//
// A range is confined to a single aisle: one Aisle value, a Start/End Bin range within it,
// and every level in each matching bin — no Level entry. See
// DevNotes/DesignPrompts/Feature-3-WLH-Range-Hold.md for the full settled design.

/** Range-mode's own floor, on top of whatever role a hold type already requires for a
 *  single location — the more restrictive of the two always applies (enforced as two
 *  separate requireRole calls in placeRangeHold/releaseRangeHold, not by computing a max). */
const RANGE_FLOOR_ROLE: Role = 'IM';

interface RangeParams { aisle: number; startBin: number; endBin: number; binSide: 'ALL' | 'ODD' | 'EVEN' }

/** Parses and validates the range-request fields shared by all three range endpoints. */
function parseRangeParams(raw: { aisle?: unknown; startBin?: unknown; endBin?: unknown; binSide?: unknown }): RangeParams {
  const aisle = typeof raw.aisle === 'number' ? raw.aisle : NaN;
  const startBin = typeof raw.startBin === 'number' ? raw.startBin : NaN;
  const endBin = typeof raw.endBin === 'number' ? raw.endBin : NaN;
  const binSide = raw.binSide === 'ODD' || raw.binSide === 'EVEN' ? raw.binSide : 'ALL';
  if (!Number.isInteger(aisle) || !Number.isInteger(startBin) || !Number.isInteger(endBin) || startBin > endBin) {
    throw Object.assign(new Error('INVALID_INPUT'), { status: 400 });
  }
  return { aisle, startBin, endBin, binSide };
}

/** Builds the explicit list of bin numbers in [startBin, endBin] matching the side filter —
 *  passed to Prisma as `bin: { in: bins }`, since side (odd/even) can't be expressed as a
 *  Prisma `where` predicate directly. */
function binsInRange({ startBin, endBin, binSide }: RangeParams): number[] {
  const bins: number[] = [];
  for (let b = startBin; b <= endBin; b++) {
    if (binSide === 'ODD' && b % 2 === 0) continue;
    if (binSide === 'EVEN' && b % 2 !== 0) continue;
    bins.push(b);
  }
  return bins;
}

/**
 * Returns the count of locations matching a range, before committing to a Place/Release
 * action — feeds the confirmation modal's "N locations in range" summary. No role gate
 * beyond the Range-mode IM+ floor; the actual Place/Release role checks happen at
 * submission time in placeRangeHold/releaseRangeHold.
 *
 * @param req - HTTP request with query params `aisle`, `startBin`, `endBin`, `binSide?`
 * @returns `{ total: number }`
 * @throws 400 INVALID_INPUT for a bad range; 403 FORBIDDEN if caller is below IM
 */
async function getRangeLocationCount(req: HttpRequest): Promise<unknown> {
  const auth = await requireAuth(req);
  requireRole(auth, RANGE_FLOOR_ROLE);

  const params = new URL(req.url).searchParams;
  const range = parseRangeParams({
    aisle: params.has('aisle') ? Number(params.get('aisle')) : undefined,
    startBin: params.has('startBin') ? Number(params.get('startBin')) : undefined,
    endBin: params.has('endBin') ? Number(params.get('endBin')) : undefined,
    binSide: params.get('binSide') ?? undefined,
  });

  const total = await prisma.location.count({ where: { aisle: range.aisle, bin: { in: binsInRange(range) } } });
  return { total };
}

// Hold hierarchy for Range Place, low to high: HI = HO < HB < HP (Range mode only — the
// single-location Place flow always overwrites outright, no hierarchy). Determines the new
// hold value and outcome bucket for locations currently holding `existing`; depends only on
// the (requested, existing) pair, not on any individual location's identity, which is what
// lets placeRangeHold batch-update by distinct existing-hold bucket instead of row-by-row.
type PlaceOutcome = 'placed' | 'upgraded' | 'blocked';
function resolveRangePlace(requested: string, existing: string | null): { next: string; outcome: PlaceOutcome } {
  if (requested === 'HOLD_PERM') return { next: 'HOLD_PERM', outcome: 'placed' };
  if (requested === 'HOLD_BOTH') {
    return existing === 'HOLD_PERM' ? { next: existing, outcome: 'blocked' } : { next: 'HOLD_BOTH', outcome: 'placed' };
  }
  // requested is HOLD_IN or HOLD_OUT
  const opposite = requested === 'HOLD_IN' ? 'HOLD_OUT' : 'HOLD_IN';
  if (existing === opposite) return { next: 'HOLD_BOTH', outcome: 'upgraded' };
  if (existing === 'HOLD_BOTH' || existing === 'HOLD_PERM') return { next: existing, outcome: 'blocked' };
  return { next: requested, outcome: 'placed' };
}

/**
 * Places a hold across every location in a single-aisle bin range (issue #14). Requires
 * IM+ to use Range mode at all, on top of whichever role the requested hold type already
 * requires for a single location — e.g. Permanent still requires Lead+ even in Range mode,
 * since an IM doesn't meet Permanent's own single-location floor either (checked as two
 * separate requireRole calls, so the stricter one naturally wins). Evaluates the hold
 * hierarchy independently per distinct existing-hold bucket (see resolveRangePlace), since
 * a single range action can produce a mix of placed/upgraded/blocked outcomes across it.
 *
 * @param req - HTTP request with body
 *   `{ aisle, startBin, endBin, binSide?, holdType, reasonCode }`
 * @returns `{ total, placed, upgraded, blocked }`
 * @throws 400 INVALID_INPUT for a bad range or missing/invalid holdType or reasonCode;
 *   403 FORBIDDEN if the caller doesn't meet both the Range-mode IM+ floor and the hold
 *   type's own single-location role requirement
 */
async function placeRangeHold(req: HttpRequest): Promise<unknown> {
  const auth = await requireAuth(req);
  requireRole(auth, RANGE_FLOOR_ROLE);

  const body = await req.json() as {
    aisle?: unknown; startBin?: unknown; endBin?: unknown; binSide?: unknown;
    holdType?: string; reasonCode?: string;
  };
  const range = parseRangeParams(body);
  if (!body.holdType || !(body.holdType in HOLD_PLACE_MIN_ROLE) || !body.reasonCode) {
    throw Object.assign(new Error('INVALID_INPUT'), { status: 400 });
  }
  requireRole(auth, HOLD_PLACE_MIN_ROLE[body.holdType]);

  const bins = binsInRange(range);

  // Snapshot every bucket's count BEFORE any writes — updating bucket-by-bucket in a single
  // pass would let an earlier write (e.g. null → HOLD_IN) get counted *again* by a later
  // bucket in the same request whose existing-value happens to equal what was just written
  // (exactly HOLD_IN here), double-counting those rows. Counting everything up front against
  // the pre-write state, then applying writes from that frozen snapshot, avoids it.
  const buckets: { existing: string | null; count: number }[] = [];
  for (const existing of [null, 'HOLD_IN', 'HOLD_OUT', 'HOLD_BOTH', 'HOLD_PERM'] as const) {
    const count = await prisma.location.count({ where: { aisle: range.aisle, bin: { in: bins }, holdCategory: existing } });
    if (count > 0) buckets.push({ existing, count });
  }

  let placed = 0, upgraded = 0, blocked = 0;
  for (const { existing, count } of buckets) {
    const { next, outcome } = resolveRangePlace(body.holdType, existing);
    if (outcome === 'blocked') {
      blocked += count;
      continue;
    }
    await prisma.location.updateMany({ where: { aisle: range.aisle, bin: { in: bins }, holdCategory: existing }, data: { holdCategory: next } });
    if (outcome === 'upgraded') upgraded += count; else placed += count;
  }
  const total = placed + upgraded + blocked;

  await writeLog({
    userId: auth.zNumber,
    actionType: 'RANGE_HOLD',
    locationAisle: range.aisle,
    details: {
      startBin: range.startBin, endBin: range.endBin, binSide: range.binSide,
      holdType: body.holdType, reasonCode: body.reasonCode, placed, upgraded, blocked,
    },
  });

  return { total, placed, upgraded, blocked };
}

/**
 * Releases (clears) whatever hold, if any, currently exists on every location in a
 * single-aisle bin range (issue #14) — no hierarchy involved, Release always just clears.
 * Requires IM+ to attempt at all; clearing a Permanent hold specifically still requires
 * Lead+, checked per existing-hold bucket found in the range — an IM's range-release simply
 * skips any Permanent-held locations it encounters (reported as blocked) rather than
 * failing the whole action outright.
 *
 * @param req - HTTP request with body `{ aisle, startBin, endBin, binSide? }`
 * @returns `{ total, released, blocked }`
 * @throws 400 INVALID_INPUT for a bad range; 403 FORBIDDEN if caller is below IM
 */
async function releaseRangeHold(req: HttpRequest): Promise<unknown> {
  const auth = await requireAuth(req);
  requireRole(auth, RANGE_FLOOR_ROLE);

  const body = await req.json() as { aisle?: unknown; startBin?: unknown; endBin?: unknown; binSide?: unknown };
  const range = parseRangeParams(body);
  const bins = binsInRange(range);

  let released = 0, blocked = 0;
  for (const existing of ['HOLD_IN', 'HOLD_OUT', 'HOLD_BOTH', 'HOLD_PERM'] as const) {
    const where = { aisle: range.aisle, bin: { in: bins }, holdCategory: existing };
    const count = await prisma.location.count({ where });
    if (count === 0) continue;

    if (!hasMinRole(auth.role, HOLD_REMOVE_MIN_ROLE[existing])) {
      blocked += count;
      continue;
    }
    await prisma.location.updateMany({ where, data: { holdCategory: null } });
    released += count;
  }
  const total = released + blocked;

  await writeLog({
    userId: auth.zNumber,
    actionType: 'RANGE_REL',
    locationAisle: range.aisle,
    details: { startBin: range.startBin, endBin: range.endBin, binSide: range.binSide, released, blocked },
  });

  return { total, released, blocked };
}

// ── PATCH /api/locations/:id/hold ─────────────────────────────────────────────

/**
 * Places or replaces a hold on a location. Role check per hold category (see
 * HOLD_PLACE_MIN_ROLE above). Writes an activity log entry carrying the reason code —
 * per WLH.md, the reason code itself is never stored as a column, only logged.
 *
 * @param req - HTTP request with URL param `id` (8-digit location barcode) and body
 *   `{ holdType: 'HOLD_IN' | 'HOLD_OUT' | 'HOLD_BOTH' | 'HOLD_PERM'; reasonCode: string }`
 * @returns `{ locationId: string; holdType: string; previousHoldType: string | null }`
 * @throws 400 INVALID_INPUT for a bad id, missing/invalid holdType, or missing reasonCode;
 *   403 FORBIDDEN if caller's role is below the required minimum for that hold type;
 *   404 NOT_FOUND if the location doesn't exist
 */
async function placeHold(req: HttpRequest): Promise<unknown> {
  const auth = await requireAuth(req);

  const full = parseFullLocationBarcode(req.params.id ?? '');
  if (!full) throw Object.assign(new Error('INVALID_INPUT'), { status: 400 });

  const body = await req.json() as { holdType?: string; reasonCode?: string };
  if (!body.holdType || !(body.holdType in HOLD_PLACE_MIN_ROLE) || !body.reasonCode) {
    throw Object.assign(new Error('INVALID_INPUT'), { status: 400 });
  }

  requireRole(auth, HOLD_PLACE_MIN_ROLE[body.holdType]);

  const location = await prisma.location.findUnique({
    where: { LocationID: { aisle: full.aisle, bin: full.bin, level: full.level } },
  });
  if (!location) throw Object.assign(new Error('NOT_FOUND'), { status: 404 });

  const previousHoldType = location.holdCategory;

  await prisma.location.update({
    where: { LocationID: { aisle: full.aisle, bin: full.bin, level: full.level } },
    data: { holdCategory: body.holdType },
  });

  await writeLog({
    userId: auth.zNumber,
    actionType: 'HOLD_PLACE',
    locationAisle: full.aisle,
    locationBin:   full.bin,
    locationLevel: full.level,
    details: { holdType: body.holdType, reasonCode: body.reasonCode, previousHoldType },
  });

  return {
    locationId: formatLocationId(full.aisle, full.bin, full.level),
    holdType: body.holdType,
    previousHoldType,
  };
}

// ── DELETE /api/locations/:id/hold ────────────────────────────────────────────

/**
 * Removes the current hold from a location. Role check per the hold category being
 * removed (see HOLD_REMOVE_MIN_ROLE above) — e.g. a Worker-placed Hold Both can only be
 * removed by IM+. No reason code required for removal.
 *
 * @param req - HTTP request with URL param `id` (8-digit location barcode)
 * @returns `{ locationId: string; clearedHoldType: string }`
 * @throws 400 INVALID_INPUT for a bad id;
 *   403 FORBIDDEN if caller's role is below the required minimum for the current hold type;
 *   404 NOT_FOUND if the location doesn't exist;
 *   409 NO_HOLD if the location has no active hold to remove
 */
async function removeHold(req: HttpRequest): Promise<unknown> {
  const auth = await requireAuth(req);

  const full = parseFullLocationBarcode(req.params.id ?? '');
  if (!full) throw Object.assign(new Error('INVALID_INPUT'), { status: 400 });

  const location = await prisma.location.findUnique({
    where: { LocationID: { aisle: full.aisle, bin: full.bin, level: full.level } },
  });
  if (!location) throw Object.assign(new Error('NOT_FOUND'), { status: 404 });
  if (!location.holdCategory) throw Object.assign(new Error('NO_HOLD'), { status: 409 });

  requireRole(auth, HOLD_REMOVE_MIN_ROLE[location.holdCategory]);

  const clearedHoldType = location.holdCategory;

  await prisma.location.update({
    where: { LocationID: { aisle: full.aisle, bin: full.bin, level: full.level } },
    data: { holdCategory: null },
  });

  await writeLog({
    userId: auth.zNumber,
    actionType: 'HOLD_CLEAR',
    locationAisle: full.aisle,
    locationBin:   full.bin,
    locationLevel: full.level,
    details: { clearedHoldType },
  });

  return { locationId: formatLocationId(full.aisle, full.bin, full.level), clearedHoldType };
}

app.http('getLocation', {
  methods: ['GET'],
  authLevel: 'anonymous',
  // {id:int} (not the unconstrained {id}) so this doesn't greedily swallow the literal
  // locations/empty-by-aisle and locations/empty-by-zone routes below — location IDs are
  // always digit strings (see parseLocationBarcode), so this is a non-breaking constraint.
  route: 'locations/{id:int}',
  handler: withHandler(getLocation),
});

app.http('getStorageCodes', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'storage-codes',
  handler: withHandler(getStorageCodes),
});

app.http('getLocationsEmptyByAisle', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'locations/empty-by-aisle',
  handler: withHandler(getLocationsEmptyByAisle),
});

app.http('getLocationsEmptyByZone', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'locations/empty-by-zone',
  handler: withHandler(getLocationsEmptyByZone),
});

app.http('getRandomHeldLocation', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'locations/random-held',
  handler: withHandler(getRandomHeldLocation),
});

app.http('getRandomUnheldLocation', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'locations/random-unheld',
  handler: withHandler(getRandomUnheldLocation),
});

app.http('placeHold', {
  methods: ['PATCH'],
  authLevel: 'anonymous',
  route: 'locations/{id:int}/hold',
  handler: withHandler(placeHold),
});

app.http('removeHold', {
  methods: ['DELETE'],
  authLevel: 'anonymous',
  route: 'locations/{id:int}/hold',
  handler: withHandler(removeHold),
});

app.http('getRangeLocationCount', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'locations/range-count',
  handler: withHandler(getRangeLocationCount),
});

app.http('placeRangeHold', {
  methods: ['PATCH'],
  authLevel: 'anonymous',
  route: 'locations/range-hold',
  handler: withHandler(placeRangeHold),
});

app.http('releaseRangeHold', {
  methods: ['DELETE'],
  authLevel: 'anonymous',
  route: 'locations/range-hold',
  handler: withHandler(releaseRangeHold),
});
