import { app } from '../lib/functionsRuntime.js';
import type { HttpRequest } from '../lib/functionsRuntime.js';
import { withHandler } from '../lib/response.js';
import { requireDesktopAccess, requireOmOrIcqa } from '../lib/desktopAccess.js';
import { parseFullLocationBarcode } from '../lib/locationParser.js';
import {
  applyZoneSettings, carveOutLocation, createAisle, deleteAisle, listAisles, loadAisleView, loadCellLocations,
  restoreLocation, setContraction,
} from '../lib/aisleSetup.js';
import {
  AISLE_SIDES, ZONE_DIRECTIONS, isBinSide, isNotForStorageReason,
  type AisleDefinition, type AisleSides, type LevelSetting, type ZoneCellKey, type ZoneDirection,
  type ZoneLevelOverride, type ZoneRange,
} from '../../shared/aisleSetup.js';

// Location Setup (Desktop, #143) endpoints. Who may do what (decided 2026-11-16):
//   - read, change zone settings, contraction, carve a location out: any desktop user
//   - create / delete an aisle, remove a carve-out: OM-level (MANAGER/ADMIN, or ICQA)
// This file parses requests and enforces those gates; the work is in lib/aisleSetup.ts.

const invalid = () => Object.assign(new Error('INVALID_INPUT'), { status: 400 });

/** Longest free-text note a carve-out keeps (the column is VarChar(255)). */
const NOTE_MAX = 255;

// ── Body parsing: untrusted JSON → typed values, or 400 INVALID_INPUT ─────────────

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw invalid();
  return value as Record<string, unknown>;
}

function asInt(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) throw invalid();
  return value;
}

function asCode(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Z]{1,2}$/.test(value)) throw invalid();
  return value;
}

function asArray(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw invalid();
  return value;
}

function parseLevels(value: unknown): LevelSetting[] {
  return asArray(value).map((raw) => {
    const r = asRecord(raw);
    return { level: asInt(r.level), storageCode: asCode(r.storageCode), size: asCode(r.size) };
  });
}

function parseCell(raw: unknown): ZoneCellKey {
  const r = asRecord(raw);
  if (!isBinSide(r.side)) throw invalid();
  return { zone: asInt(r.zone), side: r.side, level: asInt(r.level) };
}

/** Reads an aisle definition out of a create request body. */
function parseDefinition(body: unknown): AisleDefinition {
  const r = asRecord(body);
  if (!AISLE_SIDES.includes(r.sides as AisleSides)) throw invalid();
  if (!ZONE_DIRECTIONS.includes(r.zoneDirection as ZoneDirection)) throw invalid();

  const sideLevelsRaw = asRecord(r.sideLevels);
  const sideLevels: AisleDefinition['sideLevels'] = {};
  for (const side of ['ODD', 'EVEN'] as const) {
    if (sideLevelsRaw[side] !== undefined) sideLevels[side] = parseLevels(sideLevelsRaw[side]);
  }

  const zones: ZoneRange[] = asArray(r.zones).map((raw) => {
    const z = asRecord(raw);
    return { zone: asInt(z.zone), startBin: asInt(z.startBin), endBin: asInt(z.endBin) };
  });
  const zoneOverrides: ZoneLevelOverride[] = asArray(r.zoneOverrides ?? []).map((raw) => {
    const o = asRecord(raw);
    if (!isBinSide(o.side)) throw invalid();
    return { zone: asInt(o.zone), side: o.side, levels: parseLevels(o.levels) };
  });

  return {
    aisle: asInt(r.aisle),
    sides: r.sides as AisleSides,
    firstBin: asInt(r.firstBin),
    lastBin: asInt(r.lastBin),
    zoneDirection: r.zoneDirection as ZoneDirection,
    zones,
    sideLevels,
    zoneOverrides,
  };
}

/** Reads the `{aisle}` route parameter. */
function aisleParam(req: HttpRequest): number {
  const raw = req.params.aisle ?? '';
  if (!/^\d{1,3}$/.test(raw)) throw invalid();
  return parseInt(raw, 10);
}

/** Reads the `{id}` route parameter as a full 8-digit location (dashes allowed). */
function locationParam(req: HttpRequest): { aisle: number; bin: number; level: number } {
  const parsed = parseFullLocationBarcode((req.params.id ?? '').replace(/-/g, ''));
  if (!parsed) throw invalid();
  return parsed;
}

// ── Handlers ────────────────────────────────────────────────────────────────

/** GET /api/aisles — every live aisle, for the picker. */
async function getAisles(req: HttpRequest): Promise<unknown> {
  await requireDesktopAccess(req);
  return listAisles();
}

/** GET /api/aisles/{aisle} — structure, zone settings with counts, carve-outs. */
async function getAisle(req: HttpRequest): Promise<unknown> {
  await requireDesktopAccess(req);
  return loadAisleView(aisleParam(req));
}

/** GET /api/aisles/{aisle}/locations?zone=&side=&level= — the locations in one zone cell. */
async function getCellLocations(req: HttpRequest): Promise<unknown> {
  await requireDesktopAccess(req);
  const params = new URL(req.url).searchParams;
  const zone = Number(params.get('zone'));
  const level = Number(params.get('level'));
  const side = params.get('side');
  if (!Number.isInteger(zone) || !Number.isInteger(level) || !isBinSide(side)) throw invalid();
  return loadCellLocations(aisleParam(req), { zone, side, level });
}

/** POST /api/aisles — create an aisle (OM-level). Body: an AisleDefinition. */
async function postAisle(req: HttpRequest): Promise<unknown> {
  const actor = await requireDesktopAccess(req);
  requireOmOrIcqa(actor);
  return createAisle(parseDefinition(await req.json()), actor.zNumber);
}

/**
 * PATCH /api/aisles/{aisle}/zone-settings — body
 * `{ cells: ZoneCellKey[], storageCode?, size?, confirmOccupied? }`.
 */
async function patchZoneSettings(req: HttpRequest): Promise<unknown> {
  const actor = await requireDesktopAccess(req);
  const body = asRecord(await req.json());
  return applyZoneSettings(aisleParam(req), {
    cells: asArray(body.cells).map(parseCell),
    storageCode: body.storageCode == null ? undefined : asCode(body.storageCode),
    size: body.size == null ? undefined : asCode(body.size),
    confirmOccupied: body.confirmOccupied === true,
  }, actor.zNumber);
}

/**
 * PATCH /api/aisles/{aisle}/contraction — body
 * `{ cells?: ZoneCellKey[], locations?: string[] (8-digit, this aisle), contracted: boolean }`.
 */
async function patchContraction(req: HttpRequest): Promise<unknown> {
  const actor = await requireDesktopAccess(req);
  const aisle = aisleParam(req);
  const body = asRecord(await req.json());
  if (typeof body.contracted !== 'boolean') throw invalid();
  const locations = asArray(body.locations ?? []).map((raw) => {
    const parsed = typeof raw === 'string' ? parseFullLocationBarcode(raw.replace(/-/g, '')) : null;
    if (!parsed || parsed.aisle !== aisle) throw invalid();
    return { bin: parsed.bin, level: parsed.level };
  });
  return setContraction(aisle, {
    cells: asArray(body.cells ?? []).map(parseCell),
    locations,
    contracted: body.contracted,
  }, actor.zNumber);
}

/** DELETE /api/aisles/{aisle} — soft-delete an aisle whose locations are all empty (OM-level). */
async function removeAisle(req: HttpRequest): Promise<unknown> {
  const actor = await requireDesktopAccess(req);
  requireOmOrIcqa(actor);
  await deleteAisle(aisleParam(req), actor.zNumber);
  return { deleted: true };
}

/**
 * POST /api/locations/{id}/not-for-storage — carve a location out. Body
 * `{ reason: CAGE_CART | EOA_VIS | AMNESTY | OTHER, note? }`; OTHER needs a note.
 */
async function postNotForStorage(req: HttpRequest): Promise<unknown> {
  const actor = await requireDesktopAccess(req);
  const coords = locationParam(req);
  const body = asRecord(await req.json());
  if (!isNotForStorageReason(body.reason)) throw invalid();
  const note = typeof body.note === 'string' && body.note.trim() ? body.note.trim() : null;
  if (note && note.length > NOTE_MAX) throw invalid();
  if (body.reason === 'OTHER' && !note) throw Object.assign(new Error('NOTE_REQUIRED'), { status: 400 });
  await carveOutLocation(coords, body.reason, note, actor.zNumber);
  return loadAisleView(coords.aisle);
}

/** DELETE /api/locations/{id}/not-for-storage — remove a carve-out (OM-level). */
async function deleteNotForStorage(req: HttpRequest): Promise<unknown> {
  const actor = await requireDesktopAccess(req);
  requireOmOrIcqa(actor);
  const coords = locationParam(req);
  await restoreLocation(coords, actor.zNumber);
  return loadAisleView(coords.aisle);
}

app.http('getAisles', { methods: ['GET'], authLevel: 'anonymous', route: 'aisles', handler: withHandler(getAisles) });
app.http('postAisle', { methods: ['POST'], authLevel: 'anonymous', route: 'aisles', handler: withHandler(postAisle) });
app.http('getAisle', { methods: ['GET'], authLevel: 'anonymous', route: 'aisles/{aisle}', handler: withHandler(getAisle) });
app.http('removeAisle', { methods: ['DELETE'], authLevel: 'anonymous', route: 'aisles/{aisle}', handler: withHandler(removeAisle) });
app.http('getCellLocations', { methods: ['GET'], authLevel: 'anonymous', route: 'aisles/{aisle}/locations', handler: withHandler(getCellLocations) });
app.http('patchZoneSettings', { methods: ['PATCH'], authLevel: 'anonymous', route: 'aisles/{aisle}/zone-settings', handler: withHandler(patchZoneSettings) });
app.http('patchContraction', { methods: ['PATCH'], authLevel: 'anonymous', route: 'aisles/{aisle}/contraction', handler: withHandler(patchContraction) });
app.http('postNotForStorage', { methods: ['POST'], authLevel: 'anonymous', route: 'locations/{id}/not-for-storage', handler: withHandler(postNotForStorage) });
app.http('deleteNotForStorage', { methods: ['DELETE'], authLevel: 'anonymous', route: 'locations/{id}/not-for-storage', handler: withHandler(deleteNotForStorage) });
