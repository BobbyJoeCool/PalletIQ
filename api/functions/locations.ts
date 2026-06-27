import { app } from '@azure/functions';
import type { HttpRequest, InvocationContext } from '@azure/functions';
import prisma from '../lib/prisma.js';
import { withHandler } from '../lib/response.js';
import { requireAuth } from '../lib/permissions.js';
import { parseFullLocationBarcode } from '../lib/locationParser.js';

async function getLocation(req: HttpRequest, _ctx: InvocationContext): Promise<unknown> {
  await requireAuth(req);

  const parsed = parseFullLocationBarcode(req.params.id ?? '');
  if (!parsed) throw Object.assign(new Error('INVALID_INPUT'), { status: 400 });

  const location = await prisma.location.findUnique({
    where: { LocationID: { aisle: parsed.aisle, bin: parsed.bin, level: parsed.level } },
  });
  if (!location) throw Object.assign(new Error('NOT_FOUND'), { status: 404 });

  const pallet = await prisma.pallet.findFirst({
    where: { locationAisle: parsed.aisle, locationBin: parsed.bin, locationLevel: parsed.level },
    select: { pid: true },
  });

  return {
    aisle:        location.aisle,
    bin:          location.bin,
    level:        location.level,
    zone:         location.zone,
    status:       location.status,
    holdTypeCode: location.holdTypeCode,
    storageCode:  location.storageCode,
    size:         location.size,
    palletId:     pallet?.pid ?? null,
  };
}

app.http('getLocation', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'locations/{id}',
  handler: withHandler(getLocation),
});
