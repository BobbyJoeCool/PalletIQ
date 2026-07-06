/**
 * Creates 5 PUT_PENDING pallets for every (storageCode × locationSize) combination
 * that exists in the Location table. Ensures the SDP/MNP demo has an incoming pallet
 * for every type of storage location in the warehouse.
 *
 * Safe to run multiple times — each run adds a fresh batch of PUT_PENDING pallets.
 * Usage: cd api && npx tsx prisma/seed-pending-pallets.ts
 */
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaMssql } from '@prisma/adapter-mssql'

const adapter = new PrismaMssql(process.env.DATABASE_URL!)
const prisma = new PrismaClient({ adapter })

const PALLETS_PER_COMBO = 5
const VCP_OPTIONS = [6, 8, 10, 12, 16, 20, 24]

/** Returns a random integer in the inclusive range [min, max]. */
function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

/** Returns a random element from an array. */
function randomFrom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

/** Entry point: creates PALLETS_PER_COMBO PUT_PENDING pallets for every distinct (storageCode, size) pair. */
async function main() {
  // All distinct (storageCode, size) pairs that exist in the warehouse.
  const locationCombos = await prisma.location.findMany({
    select: { storageCode: true, size: true },
    distinct: ['storageCode', 'size'],
    orderBy: [{ storageCode: 'asc' }, { size: 'asc' }],
  })

  if (locationCombos.length === 0) throw new Error('No locations found — run the main seed first.')

  // Reserve existing PIDs so we don't collide.
  const existingPids = new Set((await prisma.pallet.findMany({ select: { pid: true } })).map(p => p.pid))

  /** Generates a random 8-digit Pallet ID, retrying on collision against `existingPids`. */
  function genPid(): number {
    let pid: number
    do { pid = randomInt(10_000_000, 99_999_999) } while (existingPids.has(pid))
    existingPids.add(pid)
    return pid
  }

  // Item pool per storageCode — cached so we don't re-query for every pallet.
  // vcp/ssp are pallet-level snapshot values (not stored on Item), so they're
  // randomly generated per pallet here the same way the main seed does.
  const itemCache = new Map<string, { dept: number; class: number; item: number }[]>()

  /** Fetches (and caches) up to 10 items for a storage code, so each combo is only queried once. */
  async function getItems(storageCode: string) {
    if (!itemCache.has(storageCode)) {
      const rows = await prisma.item.findMany({
        where: { storageCode },
        select: { dept: true, class: true, item: true },
        take: 10,
      })
      itemCache.set(storageCode, rows)
    }
    return itemCache.get(storageCode)!
  }

  const now = new Date()
  const pallets: {
    pid: number; dept: number; class: number; item: number;
    receivedPallets: number; currentPallets: number;
    receivedCartons: number; currentCartons: number;
    receivedSSPs: number; currentSSPs: number;
    vcp: number; ssp: number;
    status: string;
    locationAisle: null; locationBin: null; locationLevel: null;
    receivedByZ: string; receivedAt: Date;
  }[] = []

  const summary: string[] = []

  for (const combo of locationCombos) {
    const items = await getItems(combo.storageCode)
    if (items.length === 0) {
      summary.push(`${combo.storageCode}/${combo.size}: skipped (no items)`)
      continue
    }

    for (let i = 0; i < PALLETS_PER_COMBO; i++) {
      const item = items[i % items.length]
      const vcp = randomFrom(VCP_OPTIONS)
      const ssp = Math.random() < 0.5 ? vcp : vcp / 2
      const receivedCartons = randomInt(6, 20)
      const receivedSSPs    = receivedCartons * ssp

      pallets.push({
        pid: genPid(),
        dept:  item.dept,
        class: item.class,
        item:  item.item,
        receivedPallets: 0, currentPallets: 0,
        receivedCartons, currentCartons: receivedCartons,
        receivedSSPs,    currentSSPs:    receivedSSPs,
        vcp,
        ssp,
        status: 'PUT_PENDING',
        locationAisle: null, locationBin: null, locationLevel: null,
        receivedByZ: 'z002p21',
        receivedAt: now,
      })
    }

    summary.push(`${combo.storageCode}/${combo.size}: ${PALLETS_PER_COMBO}`)
  }

  await prisma.pallet.createMany({ data: pallets })

  console.log(`Created ${pallets.length} PUT_PENDING pallets across ${locationCombos.length} storage/size combos:`)
  summary.forEach(s => console.log(`  ${s}`))
}

main()
  .catch(err => { console.error(err); process.exit(1) })
  .finally(() => prisma.$disconnect())
