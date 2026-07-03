import { app } from '@azure/functions';
import type { HttpRequest } from '@azure/functions';
import prisma from '../lib/prisma.js';
import { withHandler } from '../lib/response.js';
import { requireAuth } from '../lib/permissions.js';

interface ItemRecord {
  dept: number; class: number; item: number;
  upc: string; name: string; desc: string; descShort: string;
  retailPrice: unknown; cost: unknown;
  packingZoneCode: number; storageCode: string; conveyable: boolean;
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
    packingZoneCode: item.packingZoneCode,
    storageCode: item.storageCode,
    conveyable: item.conveyable,
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
 * Demo helper for IID's "Scan DPCI" footer button — returns a random item's DPCI.
 *
 * @returns `{ dpci: string }`
 * @throws 404 NOT_FOUND if the Item table is empty
 */
async function sampleItem(req: HttpRequest): Promise<unknown> {
  await requireAuth(req);

  const count = await prisma.item.count();
  if (count === 0) throw Object.assign(new Error('NOT_FOUND'), { status: 404 });

  const skip = Math.floor(Math.random() * count);
  const item = await prisma.item.findFirst({ skip, select: { dept: true, class: true, item: true } });

  return { dpci: `${String(item!.dept).padStart(3, '0')}-${String(item!.class).padStart(2, '0')}-${String(item!.item).padStart(4, '0')}` };
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

app.http('sampleItem', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'items/sample',
  handler: withHandler(sampleItem),
});
