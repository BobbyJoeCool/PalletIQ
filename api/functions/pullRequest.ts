import { app } from '../lib/functionsRuntime.js';
import type { HttpRequest } from '../lib/functionsRuntime.js';
import prisma from '../lib/prisma.js';
import { withHandler } from '../lib/response.js';
import { requireAuth } from '../lib/permissions.js';

/** Fixed display order for pull functions on the PRQ screen. */
const FUNCTION_ORDER = ['CA', 'CF', 'FP', 'BK'] as const;

/**
 * Resolves the aisle filter from query params — mutually exclusive `workstation` (resolved
 * to its aisle set via WorkstationAisle) vs. `aisleStart`/`aisleEnd` range. Returns a
 * Prisma `where` fragment for `Pallet.locationAisle`.
 */
async function resolveAisleFilter(params: URLSearchParams): Promise<{ gte?: number; lte?: number; in?: number[] }> {
  const workstation = params.get('workstation');
  if (workstation) {
    const rows = await prisma.workstationAisle.findMany({
      where: { workstationId: workstation },
      select: { aisle: true },
    });
    if (rows.length === 0) throw Object.assign(new Error('WORKSTATION_NOT_FOUND'), { status: 404 });
    return { in: rows.map((r) => r.aisle) };
  }

  const startStr = params.get('aisleStart');
  const endStr = params.get('aisleEnd');
  if (!startStr) throw Object.assign(new Error('INVALID_INPUT'), { status: 400 });

  const aisleStart = parseInt(startStr, 10);
  if (isNaN(aisleStart)) throw Object.assign(new Error('INVALID_INPUT'), { status: 400 });

  const filter: { gte: number; lte?: number } = { gte: aisleStart };

  if (endStr) {
    const aisleEnd = parseInt(endStr, 10);
    if (isNaN(aisleEnd) || aisleEnd <= aisleStart) {
      throw Object.assign(new Error('INVALID_INPUT'), { status: 400 });
    }
    filter.lte = aisleEnd;
  } else {
    filter.lte = aisleStart;
  }

  return filter;
}

const VALID_STATUSES = ['AVAILABLE', 'PRINTED', 'VERIFIED'] as const;

/**
 * PRQ summary — aggregated pull data grouped by batchDate × pullFunction, scoped to an
 * aisle range (or workstation) and container status. Returns per-group counts used by
 * Level 1 (range/workstation totals) and Level 2 (per-aisle breakdown).
 *
 * Query params:
 *   `aisleStart` (required unless `workstation`), `aisleEnd` (optional range end),
 *   `workstation` (mutually exclusive with aisle params),
 *   `status` (required — AVAILABLE, PRINTED, or VERIFIED),
 *   `batchDate` (optional — restricts to one batch date for L2 drill-in),
 *   `pullFunction` (optional — restricts to one function for L2 drill-in),
 *   `byAisle` (optional — if "true", breaks out totals per aisle for L2)
 *
 * @returns `{ rows: SummaryRow[] }` where each row has batchDate, pullFunction,
 *   aisle (only when byAisle=true), and quantity/location aggregates.
 */
async function getPullSummary(req: HttpRequest): Promise<unknown> {
  await requireAuth(req);

  const params = new URL(req.url).searchParams;
  const aisleFilter = await resolveAisleFilter(params);

  const status = params.get('status')?.toUpperCase();
  if (!status || !(VALID_STATUSES as readonly string[]).includes(status)) {
    throw Object.assign(new Error('INVALID_INPUT'), { status: 400 });
  }

  const batchDateParam = params.get('batchDate');
  const pullFunctionParam = params.get('pullFunction')?.toUpperCase();
  const byAisle = params.get('byAisle') === 'true';

  const containerWhere: Record<string, unknown> = { status };
  if (batchDateParam) containerWhere.batchDate = parseInt(batchDateParam, 10);
  if (pullFunctionParam) containerWhere.pullFunction = pullFunctionParam;

  const containers = await prisma.container.findMany({
    where: {
      ...containerWhere,
      pallet: { locationAisle: aisleFilter },
    },
    select: {
      batchDate: true,
      pullFunction: true,
      palletQuantity: true,
      cartonQuantity: true,
      sspQuantity: true,
      breakpackOrigin: true,
      pallet: {
        select: {
          locationAisle: true,
          locationBin: true,
          locationLevel: true,
        },
      },
    },
  });

  // Group key: batchDate|pullFunction (+ |aisle when byAisle)
  const groups = new Map<string, {
    batchDate: number;
    pullFunction: string;
    aisle: number | null;
    pallets: number;
    cartons: number;
    ssps: number;
    locations: Set<string>;
  }>();

  for (const c of containers) {
    const aisle = byAisle ? c.pallet.locationAisle : null;
    const key = `${c.batchDate}|${c.pullFunction}${byAisle ? `|${aisle}` : ''}`;

    let g = groups.get(key);
    if (!g) {
      g = {
        batchDate: c.batchDate,
        pullFunction: c.pullFunction,
        aisle,
        pallets: 0,
        cartons: 0,
        ssps: 0,
        locations: new Set(),
      };
      groups.set(key, g);
    }

    g.pallets += c.palletQuantity;
    g.cartons += c.cartonQuantity;
    g.ssps += c.sspQuantity;

    if (c.pallet.locationAisle != null) {
      g.locations.add(`${c.pallet.locationAisle}-${c.pallet.locationBin}-${c.pallet.locationLevel}`);
    }
  }

  const fnOrder = Object.fromEntries(FUNCTION_ORDER.map((f, i) => [f, i]));
  const rows = [...groups.values()]
    .sort((a, b) => {
      if (a.batchDate !== b.batchDate) return a.batchDate - b.batchDate;
      const fa = fnOrder[a.pullFunction] ?? 99;
      const fb = fnOrder[b.pullFunction] ?? 99;
      if (fa !== fb) return fa - fb;
      return (a.aisle ?? 0) - (b.aisle ?? 0);
    })
    .map((g) => ({
      batchDate: g.batchDate,
      pullFunction: g.pullFunction,
      ...(byAisle && { aisle: g.aisle }),
      pallets: g.pallets,
      cartons: g.cartons,
      ssps: g.ssps,
      locations: g.locations.size,
      density: g.locations.size > 0
        ? Math.round(((g.cartons + g.pallets) / g.locations.size) * 10) / 10
        : 0,
    }));

  return { rows };
}

/**
 * PRQ location-level detail — returns individual locations with their container lists,
 * scoped to an aisle (or range/workstation), status, batchDate, and pullFunction. Used by
 * Level 3 (location drill-down) and the pull-detail popup.
 *
 * Query params:
 *   `aisleStart` / `aisleEnd` / `workstation` — same as summary
 *   `status` (required), `batchDate` (required), `pullFunction` (required),
 *   `binStart` / `binEnd` (optional range filter),
 *   `level` (optional — single level filter),
 *   `aisle` (optional — single-aisle override within a range, for L2→L3 drill)
 *
 * @returns `{ locations: LocationRow[] }` where each row has the location key, pallet/item
 *   info, quantity totals, and a `containers` array with full container detail.
 */
async function getPullDetail(req: HttpRequest): Promise<unknown> {
  await requireAuth(req);

  const params = new URL(req.url).searchParams;
  let aisleFilter = await resolveAisleFilter(params);

  const status = params.get('status')?.toUpperCase();
  if (!status || !(VALID_STATUSES as readonly string[]).includes(status)) {
    throw Object.assign(new Error('INVALID_INPUT'), { status: 400 });
  }

  const batchDateParam = params.get('batchDate');
  const pullFunction = params.get('pullFunction')?.toUpperCase();
  if (!batchDateParam || !pullFunction) {
    throw Object.assign(new Error('INVALID_INPUT'), { status: 400 });
  }
  const batchDate = parseInt(batchDateParam, 10);

  // Single-aisle override for L2→L3 drill-in within a range
  const singleAisle = params.get('aisle');
  if (singleAisle) {
    const a = parseInt(singleAisle, 10);
    if (!isNaN(a)) aisleFilter = { gte: a, lte: a };
  }

  // Optional bin/level filters for L3 narrowing
  const binStartParam = params.get('binStart');
  const binEndParam = params.get('binEnd');
  const levelParam = params.get('level');

  const palletWhere: Record<string, unknown> = { locationAisle: aisleFilter };
  if (binStartParam) {
    const binStart = parseInt(binStartParam, 10);
    const binEnd = binEndParam ? parseInt(binEndParam, 10) : binStart;
    palletWhere.locationBin = { gte: binStart, lte: binEnd };
  }
  if (levelParam) {
    palletWhere.locationLevel = parseInt(levelParam, 10);
  }

  const containers = await prisma.container.findMany({
    where: {
      status,
      batchDate,
      pullFunction,
      pallet: palletWhere,
    },
    select: {
      cid: true,
      palletQuantity: true,
      cartonQuantity: true,
      sspQuantity: true,
      batchDate: true,
      purgeDate: true,
      status: true,
      pullFunction: true,
      breakpackOrigin: true,
      pallet: {
        select: {
          pid: true,
          dept: true,
          class: true,
          item: true,
          currentPallets: true,
          currentCartons: true,
          currentSSPs: true,
          vcp: true,
          ssp: true,
          status: true,
          locationAisle: true,
          locationBin: true,
          locationLevel: true,
          location: {
            select: { status: true, holdCategory: true },
          },
          itemRef: {
            select: {
              upc: true,
              name: true,
              descShort: true,
              storageCode: true,
            },
          },
        },
      },
    },
    orderBy: [
      { pallet: { locationAisle: 'asc' } },
      { pallet: { locationBin: 'asc' } },
      { pallet: { locationLevel: 'asc' } },
    ],
  });

  // Group by location (aisle-bin-level via pallet)
  const locationMap = new Map<string, {
    aisle: number;
    bin: number;
    level: number;
    locationStatus: string | null;
    holdCategory: string | null;
    pid: number;
    palletStatus: string;
    dept: number;
    cls: number;
    item: number;
    upc: string;
    itemName: string;
    itemDesc: string;
    storageCode: string | null;
    palletVcp: number;
    palletSsp: number;
    palletCartons: number;
    palletPallets: number;
    palletSSPs: number;
    pullPallets: number;
    pullCartons: number;
    pullSSPs: number;
    containers: {
      cid: string;
      status: string;
      palletQuantity: number;
      cartonQuantity: number;
      sspQuantity: number;
      purgeDate: string;
    }[];
  }>();

  for (const c of containers) {
    const p = c.pallet;
    if (p.locationAisle == null) continue;
    const key = `${p.locationAisle}-${p.locationBin}-${p.locationLevel}`;

    let loc = locationMap.get(key);
    if (!loc) {
      loc = {
        aisle: p.locationAisle,
        bin: p.locationBin!,
        level: p.locationLevel!,
        locationStatus: p.location?.status ?? null,
        holdCategory: p.location?.holdCategory ?? null,
        pid: p.pid,
        palletStatus: p.status,
        dept: p.dept,
        cls: p.class,
        item: p.item,
        upc: p.itemRef.upc,
        itemName: p.itemRef.name,
        itemDesc: p.itemRef.descShort,
        storageCode: p.itemRef.storageCode,
        palletVcp: p.vcp,
        palletSsp: p.ssp,
        palletCartons: p.currentCartons,
        palletPallets: p.currentPallets,
        palletSSPs: p.currentSSPs,
        pullPallets: 0,
        pullCartons: 0,
        pullSSPs: 0,
        containers: [],
      };
      locationMap.set(key, loc);
    }

    loc.pullPallets += c.palletQuantity;
    loc.pullCartons += c.cartonQuantity;
    loc.pullSSPs += c.sspQuantity;
    loc.containers.push({
      cid: c.cid,
      status: c.status,
      palletQuantity: c.palletQuantity,
      cartonQuantity: c.cartonQuantity,
      sspQuantity: c.sspQuantity,
      purgeDate: c.purgeDate.toISOString().slice(0, 10),
    });
  }

  const locations = [...locationMap.values()].sort((a, b) => {
    if (a.aisle !== b.aisle) return a.aisle - b.aisle;
    if (a.bin !== b.bin) return a.bin - b.bin;
    return a.level - b.level;
  });

  return { locations };
}

app.http('getPullSummary', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'pulls/summary',
  handler: withHandler(getPullSummary),
});

app.http('getPullDetail', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'pulls/detail',
  handler: withHandler(getPullDetail),
});
