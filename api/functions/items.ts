import { app } from '@azure/functions';
import type { HttpRequest } from '@azure/functions';
import prisma from '../lib/prisma.js';
import { withHandler } from '../lib/response.js';
import { requireAuth } from '../lib/permissions.js';

interface ItemRecord {
  dept: number; class: number; item: number;
  upc: string; name: string; desc: string; descShort: string;
  retailPrice: unknown; cost: unknown; unitWeight: unknown;
  packingZoneCode: number; storageCode: string; conveyable: boolean;
  requiresExpirationDate: boolean;
}

/** Serializes a full Item row, converting Prisma's Decimal fields to plain numbers. */
function serializeItem(item: ItemRecord) {
  return {
    dept: item.dept,
    class: item.class,
    item: item.item,
    dpci: `${String(item.dept).padStart(3, '0')}-${String(item.class).padStart(2, '0')}-${String(item.item).padStart(4, '0')}`,
    upc: item.upc,
    name: item.name,
    desc: item.desc,
    descShort: item.descShort,
    retailPrice: Number(item.retailPrice),
    cost: Number(item.cost),
    unitWeight: item.unitWeight == null ? null : Number(item.unitWeight),
    packingZoneCode: item.packingZoneCode,
    storageCode: item.storageCode,
    conveyable: item.conveyable,
    // Surfaced (v1.6.11) for PAR's redesign — requiring Expiration Date entry when this
    // item flags it, same as PII's existing read-only "Required for this item" prompt.
    requiresExpirationDate: item.requiresExpirationDate,
  };
}

/**
 * Item lookup by DPCI. Serves both Phase 9.0's generic item-lookup scaffolding need
 * (auto-UPC-update on PII when DPCI changes) and IID's split-route API contract.
 *
 * @param req - HTTP request with URL param `dpci` (9-digit, dash-separated or concatenated)
 * @returns Full Item record
 * @throws 400 INVALID_INPUT if dpci is not a 9-digit value; 404 NOT_FOUND if no match
 */
async function getItemByDpci(req: HttpRequest): Promise<unknown> {
  await requireAuth(req);

  const digits = (req.params.dpci ?? '').replace(/-/g, '');
  if (!/^\d{9}$/.test(digits)) throw Object.assign(new Error('INVALID_INPUT'), { status: 400 });

  const dept  = parseInt(digits.slice(0, 3), 10);
  const cls   = parseInt(digits.slice(3, 5), 10);
  const itm   = parseInt(digits.slice(5, 9), 10);

  const item = await prisma.item.findUnique({ where: { DPCI: { dept, class: cls, item: itm } } });
  if (!item) throw Object.assign(new Error('NOT_FOUND'), { status: 404 });

  return serializeItem(item);
}

/**
 * Item lookup by UPC.
 *
 * @param req - HTTP request with URL param `upc`
 * @returns Full Item record
 * @throws 400 INVALID_INPUT if upc is missing; 404 NOT_FOUND if no match
 */
async function getItemByUpc(req: HttpRequest): Promise<unknown> {
  await requireAuth(req);

  const upc = req.params.upc ?? '';
  if (!upc) throw Object.assign(new Error('INVALID_INPUT'), { status: 400 });

  const item = await prisma.item.findUnique({ where: { upc } });
  if (!item) throw Object.assign(new Error('NOT_FOUND'), { status: 404 });

  return serializeItem(item);
}

/**
 * Shared by `getItemLocations`/`getItemLocationsByUpc` (ISI) — every location currently
 * storing a pallet of the given item, ordered by location ID (aisle, then bin, then
 * level). Only stored pallets are included (locationAisle non-null); a pallet pending
 * put has no location yet and isn't "stored" anywhere for this purpose. Each row carries
 * the pallet's own quantity/VCP-SSP/inherited-Storage-Code-Size fields (v1.6.8 — ISI
 * fix-list item 03 plus the direct instruction to show Storage Code/Size and VCP/SSP per
 * row) alongside the item's Short Description (returned once, not per row, since every
 * row shares the same item).
 *
 * @param item - The resolved Item row (dept/class/item/descShort)
 * @returns `{ descShort, locations: [...] }`
 */
async function buildItemLocations(item: { dept: number; class: number; item: number; descShort: string }) {
  const pallets = await prisma.pallet.findMany({
    where: { dept: item.dept, class: item.class, item: item.item, locationAisle: { not: null } },
    select: {
      pid: true, locationAisle: true, locationBin: true, locationLevel: true,
      storageCode: true, size: true, currentPallets: true, currentCartons: true, currentSSPs: true,
      vcp: true, ssp: true,
    },
    orderBy: [{ locationAisle: 'asc' }, { locationBin: 'asc' }, { locationLevel: 'asc' }],
  });

  return {
    descShort: item.descShort,
    locations: pallets.map((p) => ({
      locationId:
        String(p.locationAisle).padStart(3, '0') +
        String(p.locationBin).padStart(3, '0') +
        String(p.locationLevel).padStart(2, '0'),
      palletId: p.pid,
      storageCode: p.storageCode!,
      size: p.size!,
      currentPallets: p.currentPallets,
      currentCartons: p.currentCartons,
      currentSSPs: p.currentSSPs,
      vcp: p.vcp,
      ssp: p.ssp,
    })),
  };
}

/**
 * Item Storage Inquiry (ISI, issue #13) — DPCI-keyed variant. See `buildItemLocations`.
 *
 * @param req - HTTP request with URL param `dpci` (9-digit, dash-separated or concatenated)
 * @throws 400 INVALID_INPUT if dpci is not a 9-digit value; 404 NOT_FOUND if no Item matches
 */
async function getItemLocations(req: HttpRequest): Promise<unknown> {
  await requireAuth(req);

  const digits = (req.params.dpci ?? '').replace(/-/g, '');
  if (!/^\d{9}$/.test(digits)) throw Object.assign(new Error('INVALID_INPUT'), { status: 400 });

  const dept = parseInt(digits.slice(0, 3), 10);
  const cls  = parseInt(digits.slice(3, 5), 10);
  const itm  = parseInt(digits.slice(5, 9), 10);

  const item = await prisma.item.findUnique({ where: { DPCI: { dept, class: cls, item: itm } }, select: { dept: true, class: true, item: true, descShort: true } });
  if (!item) throw Object.assign(new Error('NOT_FOUND'), { status: 404 });

  return buildItemLocations(item);
}

/**
 * Item Storage Inquiry (ISI) — UPC-keyed variant, added v1.6.8 alongside ISI's DPCI-only
 * entry (fix-list item 02) so a worker with only a UPC can search directly instead of
 * needing to resolve UPC → DPCI first. See `buildItemLocations`.
 *
 * @param req - HTTP request with URL param `upc`
 * @throws 400 INVALID_INPUT if upc is missing; 404 NOT_FOUND if no Item matches
 */
async function getItemLocationsByUpc(req: HttpRequest): Promise<unknown> {
  await requireAuth(req);

  const upc = req.params.upc ?? '';
  if (!upc) throw Object.assign(new Error('INVALID_INPUT'), { status: 400 });

  const item = await prisma.item.findUnique({ where: { upc }, select: { dept: true, class: true, item: true, descShort: true } });
  if (!item) throw Object.assign(new Error('NOT_FOUND'), { status: 404 });

  return buildItemLocations(item);
}

/**
 * Demo helper for IID/ISI's "Scan DPCI"/"Scan UPC" footer buttons — returns a random
 * item's DPCI and UPC (v1.6.8 added `upc` so the same sample can back either demo button,
 * whichever entry method currently has focus).
 *
 * @returns `{ dpci: string, upc: string }`
 * @throws 404 NOT_FOUND if the Item table is empty
 */
async function sampleItem(req: HttpRequest): Promise<unknown> {
  await requireAuth(req);

  const count = await prisma.item.count();
  if (count === 0) throw Object.assign(new Error('NOT_FOUND'), { status: 404 });

  const skip = Math.floor(Math.random() * count);
  const item = await prisma.item.findFirst({ skip, select: { dept: true, class: true, item: true, upc: true } });

  return {
    dpci: `${String(item!.dept).padStart(3, '0')}-${String(item!.class).padStart(2, '0')}-${String(item!.item).padStart(4, '0')}`,
    upc: item!.upc,
  };
}

app.http('getItemByDpci', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'items/dpci/{dpci}',
  handler: withHandler(getItemByDpci),
});

app.http('getItemByUpc', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'items/upc/{upc}',
  handler: withHandler(getItemByUpc),
});

app.http('getItemLocations', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'items/dpci/{dpci}/locations',
  handler: withHandler(getItemLocations),
});

app.http('getItemLocationsByUpc', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'items/upc/{upc}/locations',
  handler: withHandler(getItemLocationsByUpc),
});

app.http('sampleItem', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'items/sample',
  handler: withHandler(sampleItem),
});
