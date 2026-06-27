import { PrismaClient } from '/Users/Bob/csd/Side-Projects/PalletIQ/api/node_modules/.prisma/client/default.js';

const prisma = new PrismaClient();
const [sc, pz, dept, ht, store, user, item, loc, pallet, label] = await Promise.all([
  prisma.storageCode.count(),
  prisma.packingZone.count(),
  prisma.department.count(),
  prisma.holdType.count(),
  prisma.store.count(),
  prisma.user.count(),
  prisma.item.count(),
  prisma.location.count(),
  prisma.pallet.count(),
  prisma.label.count(),
]);
console.log(JSON.stringify({ StorageCodes: sc, PackingZones: pz, Departments: dept, HoldTypes: ht, Stores: store, Users: user, Items: item, Locations: loc, Pallets: pallet, Labels: label }, null, 2));
await prisma.$disconnect();
