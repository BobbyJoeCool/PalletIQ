// Location Setup data layer (Desktop, #143). The rules — what a valid aisle definition
// is, how it expands into zones, zone settings and locations — are pure and live in
// shared/aisleSetup.ts; this module reads and writes them. The HTTP handlers in
// functions/aisles.ts only parse requests, check who may act, and call these.

import prisma from './prisma.js';
import { writeLog } from './activityLog.js';
import { formatLocationId } from './locationParser.js';
import { NOT_FOR_STORAGE_CODE, isNotForStorage } from '../../shared/locationPolicy.js';
import {
  OCCUPIED_EXAMPLE_LIMIT, cellKey, expandLocations, isBinSide, sideOfBin, validateDefinition, zoneSettingsOf,
  type AisleDefinition, type AisleSides, type AisleSummary, type AisleView, type BinSide, type CarveOutView,
  type CellLocationView, type NotForStorageReason, type ZoneCellKey, type ZoneCellView, type ZoneDirection,
} from '../../shared/aisleSetup.js';

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

const httpError = (code: string, status: number, data?: Record<string, unknown>) =>
  Object.assign(new Error(code), { status, ...(data && { data }) });

/** Statuses that mean a location holds nothing and nothing is on its way. */
const OPEN_STATUSES = new Set(['EMPTY', 'STAGED']);

/** @returns every live aisle, ordered by number */
export async function listAisles(): Promise<AisleSummary[]> {
  const aisles = await prisma.aisle.findMany({ where: { deleted: false }, orderBy: { aisle: 'asc' } });
  return aisles.map(toSummary);
}

/** Narrows a stored aisle row to its summary, checking its enum-like strings. */
function toSummary(row: { aisle: number; sides: string; firstBin: number; lastBin: number; zoneDirection: string }): AisleSummary {
  return {
    aisle: row.aisle,
    sides: row.sides as AisleSides,
    firstBin: row.firstBin,
    lastBin: row.lastBin,
    zoneDirection: row.zoneDirection as ZoneDirection,
  };
}

/** Loads a live aisle row or throws 404 NOT_FOUND. */
async function requireAisle(aisle: number, client: Pick<typeof prisma, 'aisle'> = prisma) {
  const row = await client.aisle.findUnique({ where: { aisle } });
  if (!row || row.deleted) throw httpError('NOT_FOUND', 404);
  return row;
}

/**
 * Everything the Location Setup screen needs for one aisle: its structure, each zone
 * setting with counts of its locations, and its carve-outs.
 *
 * @throws 404 NOT_FOUND if the aisle does not exist or was deleted
 */
export async function loadAisleView(aisle: number): Promise<AisleView> {
  const row = await requireAisle(aisle);
  const [zones, settings, locations] = await Promise.all([
    prisma.aisleZone.findMany({ where: { aisle }, orderBy: { zone: 'asc' } }),
    prisma.aisleZoneSetting.findMany({ where: { aisle } }),
    prisma.location.findMany({
      where: { aisle, deleted: false },
      select: { bin: true, level: true, zone: true, status: true, storageCode: true, contraction: true, notForStorageReason: true, notForStorageNote: true },
      orderBy: [{ bin: 'asc' }, { level: 'asc' }],
    }),
  ]);

  const cells = new Map<string, ZoneCellView>();
  for (const s of settings) {
    if (!isBinSide(s.side)) continue;
    const cell: ZoneCellView = {
      zone: s.zone, side: s.side, level: s.level, storageCode: s.storageCode, size: s.size,
      locations: 0, occupied: 0, notForStorage: 0, contracted: 0,
    };
    cells.set(cellKey(cell), cell);
  }

  const carveOuts: CarveOutView[] = [];
  for (const loc of locations) {
    const side = sideOfBin(loc.bin);
    const cell = cells.get(cellKey({ zone: loc.zone, side, level: loc.level }));
    if (cell) {
      cell.locations++;
      if (!OPEN_STATUSES.has(loc.status)) cell.occupied++;
      if (loc.contraction) cell.contracted++;
      if (isNotForStorage(loc.storageCode)) cell.notForStorage++;
    }
    if (isNotForStorage(loc.storageCode)) {
      carveOuts.push({
        location: formatLocationId(aisle, loc.bin, loc.level),
        zone: loc.zone, side, level: loc.level,
        reason: loc.notForStorageReason, note: loc.notForStorageNote,
      });
    }
  }

  return {
    ...toSummary(row),
    zones: zones.map(({ zone, startBin, endBin }) => ({ zone, startBin, endBin })),
    cells: [...cells.values()].sort((a, b) => a.zone - b.zone || a.side.localeCompare(b.side) || a.level - b.level),
    carveOuts,
  };
}

/**
 * The locations inside one zone cell (one level of one zone-side), for picking a single
 * location to carve out or contract.
 *
 * @throws 404 NOT_FOUND if the aisle does not exist or was deleted
 */
export async function loadCellLocations(aisle: number, key: ZoneCellKey): Promise<CellLocationView[]> {
  await requireAisle(aisle);
  const locations = await prisma.location.findMany({
    where: { aisle, zone: key.zone, level: key.level, deleted: false },
    select: {
      bin: true, level: true, status: true, storageCode: true, contraction: true,
      notForStorageReason: true, notForStorageNote: true, _count: { select: { pallets: true } },
    },
    orderBy: { bin: 'asc' },
  });
  return locations
    .filter((loc) => sideOfBin(loc.bin) === key.side)
    .map((loc) => ({
      location: formatLocationId(aisle, loc.bin, loc.level),
      bin: loc.bin, level: loc.level, status: loc.status, storageCode: loc.storageCode,
      contraction: loc.contraction, pallets: loc._count.pallets,
      notForStorageReason: loc.notForStorageReason, notForStorageNote: loc.notForStorageNote,
    }));
}

/** The storage codes and sizes an aisle definition may use (Not For Storage excluded). */
export async function loadSetupLookups(): Promise<{ storageCodes: string[]; sizes: string[] }> {
  const [codes, sizes] = await Promise.all([prisma.storageCode.findMany(), prisma.size.findMany()]);
  return {
    storageCodes: codes.map((c) => c.id).filter((id) => !isNotForStorage(id)),
    sizes: sizes.map((s) => s.id),
  };
}

/**
 * Creates an aisle: its structure rows and one EMPTY location per bin × level. If the
 * aisle number belongs to a deleted aisle, that aisle's location rows are reused — the
 * ones the new layout covers come back reset to EMPTY with the new settings; the rest
 * stay deleted — and its `createdAt` marks where the new aisle's history starts.
 *
 * @param def - the aisle definition
 * @param userId - who is creating it, for the activity log
 * @throws 400 with the validation error code if the definition is invalid;
 *   409 AISLE_EXISTS if a live aisle already has that number
 */
export async function createAisle(def: AisleDefinition, userId: string): Promise<AisleView> {
  const error = validateDefinition(def, await loadSetupLookups());
  if (error) throw httpError(error, 400);

  const rows = expandLocations(def);
  const settings = zoneSettingsOf(def);

  await prisma.$transaction(async (tx) => {
    const existing = await tx.aisle.findUnique({ where: { aisle: def.aisle } });
    const liveLocations = await tx.location.count({ where: { aisle: def.aisle, deleted: false } });
    if ((existing && !existing.deleted) || liveLocations > 0) throw httpError('AISLE_EXISTS', 409);

    const structure = {
      sides: def.sides, firstBin: def.firstBin, lastBin: def.lastBin, zoneDirection: def.zoneDirection,
      deleted: false, createdAt: new Date(),
    };
    await tx.aisle.upsert({ where: { aisle: def.aisle }, create: { aisle: def.aisle, ...structure }, update: structure });
    await tx.aisleZoneSetting.deleteMany({ where: { aisle: def.aisle } });
    await tx.aisleZone.deleteMany({ where: { aisle: def.aisle } });
    await tx.aisleZone.createMany({ data: def.zones.map((z) => ({ aisle: def.aisle, ...z })) });
    await tx.aisleZoneSetting.createMany({ data: settings.map((s) => ({ aisle: def.aisle, ...s })) });

    // Rows left by a deleted aisle of the same number are reused, not duplicated.
    const previous = await tx.location.findMany({ where: { aisle: def.aisle }, select: { bin: true, level: true } });
    const reusable = new Set(previous.map((p) => `${p.bin}|${p.level}`));
    const fresh = rows.filter((r) => !reusable.has(`${r.bin}|${r.level}`));
    for (const r of rows.filter((row) => reusable.has(`${row.bin}|${row.level}`))) {
      await tx.location.update({
        where: { LocationID: { aisle: r.aisle, bin: r.bin, level: r.level } },
        data: {
          zone: r.zone, storageCode: r.storageCode, size: r.size, status: 'EMPTY', deleted: false,
          contraction: false, holdCategory: null, statusExpiry: null, revertStatus: null,
          notForStorageReason: null, notForStorageNote: null,
        },
      });
    }
    for (let i = 0; i < fresh.length; i += 500) {
      await tx.location.createMany({ data: fresh.slice(i, i + 500).map((r) => ({ ...r, status: 'EMPTY' })) });
    }

    await writeLog({
      userId, actionType: 'AISLE_ADD', locationAisle: def.aisle,
      details: {
        sides: def.sides, firstBin: def.firstBin, lastBin: def.lastBin, zoneDirection: def.zoneDirection,
        locations: rows.length, reusedLocations: rows.length - fresh.length,
      },
    }, tx);
  }, { timeout: 60_000 });

  return loadAisleView(def.aisle);
}

/** A live location's coordinates, grouped by the zone cell it belongs to. */
async function locationsByCell(tx: Tx, aisle: number, keys: ZoneCellKey[]) {
  const wanted = new Set(keys.map(cellKey));
  const locations = await tx.location.findMany({
    where: { aisle, deleted: false, level: { in: [...new Set(keys.map((k) => k.level))] }, zone: { in: [...new Set(keys.map((k) => k.zone))] } },
    select: { bin: true, level: true, zone: true, status: true, storageCode: true },
  });
  return locations.filter((loc) => wanted.has(cellKey({ zone: loc.zone, side: sideOfBin(loc.bin), level: loc.level })));
}

/** Checks every key names an existing zone setting of the aisle. @throws 400 INVALID_CELLS */
async function requireCells(tx: Tx, aisle: number, keys: ZoneCellKey[]): Promise<void> {
  if (keys.length === 0) throw httpError('INVALID_CELLS', 400);
  const settings = await tx.aisleZoneSetting.findMany({ where: { aisle }, select: { zone: true, side: true, level: true } });
  const known = new Set(settings.flatMap((s) => (isBinSide(s.side) ? [cellKey({ zone: s.zone, side: s.side, level: s.level })] : [])));
  if (keys.some((k) => !known.has(cellKey(k)))) throw httpError('INVALID_CELLS', 400);
}

/**
 * Changes the storage code and/or size of whole zone cells — every location on those
 * levels of those zone-sides. A location carved out to Not For Storage keeps XO but takes
 * the new size; its zone setting (what removing the carve-out restores) takes both.
 *
 * Pallets already stored keep their own storage code and size, so changing a cell that
 * holds freight needs `confirmOccupied` (decided 2026-11-16: allow with a warning).
 *
 * @throws 400 INVALID_CELLS / NOTHING_TO_CHANGE / INVALID_STORAGE_CODE / INVALID_SIZE;
 *   404 NOT_FOUND; 409 OCCUPIED_CONFIRM_REQUIRED with `{ occupied, locations }` (up to
 *   OCCUPIED_EXAMPLE_LIMIT IDs) until confirmed
 */
export async function applyZoneSettings(
  aisle: number,
  input: { cells: ZoneCellKey[]; storageCode?: string; size?: string; confirmOccupied: boolean },
  userId: string,
): Promise<AisleView> {
  if (!input.storageCode && !input.size) throw httpError('NOTHING_TO_CHANGE', 400);
  const lookups = await loadSetupLookups();
  if (input.storageCode && !lookups.storageCodes.includes(input.storageCode)) throw httpError('INVALID_STORAGE_CODE', 400);
  if (input.size && !lookups.sizes.includes(input.size)) throw httpError('INVALID_SIZE', 400);

  await prisma.$transaction(async (tx) => {
    await requireAisle(aisle, tx);
    await requireCells(tx, aisle, input.cells);

    const locations = await locationsByCell(tx, aisle, input.cells);
    const occupied = locations.filter((loc) => !OPEN_STATUSES.has(loc.status));
    if (occupied.length > 0 && !input.confirmOccupied) {
      throw httpError('OCCUPIED_CONFIRM_REQUIRED', 409, {
        occupied: occupied.length,
        locations: occupied.slice(0, OCCUPIED_EXAMPLE_LIMIT).map((loc) => formatLocationId(aisle, loc.bin, loc.level)),
      });
    }

    for (const key of input.cells) {
      await tx.aisleZoneSetting.update({
        where: { aisle_zone_side_level: { aisle, ...key } },
        data: { ...(input.storageCode && { storageCode: input.storageCode }), ...(input.size && { size: input.size }) },
      });
      const bins = locations.filter((l) => l.zone === key.zone && l.level === key.level && sideOfBin(l.bin) === key.side).map((l) => l.bin);
      if (bins.length === 0) continue;
      const where = { aisle, level: key.level, bin: { in: bins }, deleted: false };
      if (input.size) await tx.location.updateMany({ where, data: { size: input.size } });
      if (input.storageCode) {
        await tx.location.updateMany({ where: { ...where, NOT: { storageCode: NOT_FOR_STORAGE_CODE } }, data: { storageCode: input.storageCode } });
      }
    }

    await writeLog({
      userId, actionType: 'ZONE_SET', locationAisle: aisle,
      details: {
        cells: input.cells.map(cellKey), storageCode: input.storageCode ?? null, size: input.size ?? null,
        locations: locations.length, occupiedConfirmed: occupied.length,
      },
    }, tx);
  }, { timeout: 60_000 });

  return loadAisleView(aisle);
}

/**
 * Puts whole zone cells and/or individual locations of an aisle on or off contraction.
 * Allowed on occupied locations: contraction only stops future puts (decided 2026-11-16).
 *
 * @param input.locations - 8-digit IDs, each in this aisle
 * @throws 400 INVALID_CELLS / INVALID_LOCATION / NOTHING_TO_CHANGE; 404 NOT_FOUND
 */
export async function setContraction(
  aisle: number,
  input: { cells: ZoneCellKey[]; locations: { bin: number; level: number }[]; contracted: boolean },
  userId: string,
): Promise<AisleView> {
  if (input.cells.length === 0 && input.locations.length === 0) throw httpError('NOTHING_TO_CHANGE', 400);

  await prisma.$transaction(async (tx) => {
    await requireAisle(aisle, tx);
    if (input.cells.length > 0) await requireCells(tx, aisle, input.cells);

    const targets = new Map<string, { bin: number; level: number }>();
    for (const loc of input.cells.length > 0 ? await locationsByCell(tx, aisle, input.cells) : []) {
      targets.set(`${loc.bin}|${loc.level}`, loc);
    }
    if (input.locations.length > 0) {
      const found = await tx.location.findMany({
        where: { aisle, deleted: false, OR: input.locations.map((l) => ({ bin: l.bin, level: l.level })) },
        select: { bin: true, level: true },
      });
      if (found.length !== new Set(input.locations.map((l) => `${l.bin}|${l.level}`)).size) throw httpError('INVALID_LOCATION', 400);
      for (const loc of found) targets.set(`${loc.bin}|${loc.level}`, loc);
    }

    // Grouped by level so each level is one update.
    const byLevel = new Map<number, number[]>();
    for (const t of targets.values()) byLevel.set(t.level, [...(byLevel.get(t.level) ?? []), t.bin]);
    for (const [level, bins] of byLevel) {
      await tx.location.updateMany({ where: { aisle, level, bin: { in: bins } }, data: { contraction: input.contracted } });
    }

    await writeLog({
      userId, actionType: input.contracted ? 'CONTRACT' : 'UNCONTRACT', locationAisle: aisle,
      details: {
        cells: input.cells.map(cellKey),
        locations: input.locations.map((l) => formatLocationId(aisle, l.bin, l.level)),
        changed: targets.size,
      },
    }, tx);
  }, { timeout: 60_000 });

  return loadAisleView(aisle);
}

/** Loads one live location with what a carve-out decision needs. @throws 404 NOT_FOUND */
async function requireLocation(tx: Tx, coords: { aisle: number; bin: number; level: number }) {
  const loc = await tx.location.findUnique({
    where: { LocationID: coords },
    select: { zone: true, status: true, storageCode: true, deleted: true, _count: { select: { pallets: true } } },
  });
  if (!loc || loc.deleted) throw httpError('NOT_FOUND', 404);
  return loc;
}

/**
 * Carves one location out to Not For Storage (storage code XO). Only an EMPTY location
 * holding no pallets can be carved out (decided 2026-11-16).
 *
 * @throws 404 NOT_FOUND; 409 ALREADY_NOT_FOR_STORAGE / LOCATION_NOT_EMPTY
 */
export async function carveOutLocation(
  coords: { aisle: number; bin: number; level: number },
  reason: NotForStorageReason,
  note: string | null,
  userId: string,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const loc = await requireLocation(tx, coords);
    if (isNotForStorage(loc.storageCode)) throw httpError('ALREADY_NOT_FOR_STORAGE', 409);
    if (loc.status !== 'EMPTY' || loc._count.pallets > 0) throw httpError('LOCATION_NOT_EMPTY', 409, { status: loc.status });

    await tx.location.update({
      where: { LocationID: coords },
      data: { storageCode: NOT_FOR_STORAGE_CODE, notForStorageReason: reason, notForStorageNote: note },
    });
    await writeLog({
      userId, actionType: 'XO_SET', locationAisle: coords.aisle, locationBin: coords.bin, locationLevel: coords.level,
      details: { reason, note, previousStorageCode: loc.storageCode },
    }, tx);
  });
}

/**
 * Removes a Not For Storage carve-out, restoring the storage code of the location's zone
 * setting.
 *
 * @throws 404 NOT_FOUND; 409 NOT_NOT_FOR_STORAGE if it is not carved out;
 *   409 ZONE_SETTING_MISSING if the aisle has no setting for the location's zone cell
 */
export async function restoreLocation(coords: { aisle: number; bin: number; level: number }, userId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const loc = await requireLocation(tx, coords);
    if (!isNotForStorage(loc.storageCode)) throw httpError('NOT_NOT_FOR_STORAGE', 409);

    const side: BinSide = sideOfBin(coords.bin);
    const setting = await tx.aisleZoneSetting.findUnique({
      where: { aisle_zone_side_level: { aisle: coords.aisle, zone: loc.zone, side, level: coords.level } },
    });
    if (!setting) throw httpError('ZONE_SETTING_MISSING', 409);

    await tx.location.update({
      where: { LocationID: coords },
      data: { storageCode: setting.storageCode, size: setting.size, notForStorageReason: null, notForStorageNote: null },
    });
    await writeLog({
      userId, actionType: 'XO_CLEAR', locationAisle: coords.aisle, locationBin: coords.bin, locationLevel: coords.level,
      details: { restoredStorageCode: setting.storageCode },
    }, tx);
  });
}

/**
 * Deletes an aisle: a soft delete of the aisle and every one of its locations. Every
 * location must be EMPTY and hold no pallets — a hard stop with no override.
 *
 * @throws 404 NOT_FOUND; 409 AISLE_NOT_EMPTY with `{ blocking, locations }` (up to
 *   OCCUPIED_EXAMPLE_LIMIT IDs)
 */
export async function deleteAisle(aisle: number, userId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await requireAisle(aisle, tx);
    const blocking = await tx.location.findMany({
      where: { aisle, deleted: false, OR: [{ status: { not: 'EMPTY' } }, { pallets: { some: {} } }] },
      select: { bin: true, level: true },
      orderBy: [{ bin: 'asc' }, { level: 'asc' }],
    });
    if (blocking.length > 0) {
      throw httpError('AISLE_NOT_EMPTY', 409, {
        blocking: blocking.length,
        locations: blocking.slice(0, OCCUPIED_EXAMPLE_LIMIT).map((l) => formatLocationId(aisle, l.bin, l.level)),
      });
    }

    const { count } = await tx.location.updateMany({ where: { aisle, deleted: false }, data: { deleted: true } });
    await tx.aisle.update({ where: { aisle }, data: { deleted: true } });
    await writeLog({ userId, actionType: 'AISLE_DEL', locationAisle: aisle, details: { locations: count } }, tx);
  }, { timeout: 60_000 });
}
