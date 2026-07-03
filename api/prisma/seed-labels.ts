/**
 * Top-up seed: adds ~40 PRINTED labels spread across stored pallets.
 * Safe to run multiple times — generates unique LIDs each run.
 * Does not touch any other data.
 *
 * Pull function assignment rules:
 *   BK  — level 0 (bulk); not used in demo
 *   CA  — XS-size locations (all levels), OR non-XS above level 1 where pull does NOT empty
 *   CF  — level 1, non-XS, pull does NOT empty
 *   FP  — non-XS, non-BK, pull takes every carton (empties the location)
 *
 * Usage: cd api && npx tsx prisma/seed-labels.ts
 */
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaMssql } from '@prisma/adapter-mssql'

const adapter = new PrismaMssql(process.env.DATABASE_URL!)
const prisma = new PrismaClient({ adapter })

function julianDate(d: Date): number {
  const start = new Date(d.getFullYear(), 0, 0)
  const diff = d.getTime() - start.getTime()
  return d.getFullYear() * 1000 + Math.floor(diff / 86_400_000)
}

function genLid(storeId: number, dept: number, cls: number, item: number, pid: number, batchDate: number): string {
  const rnd = Math.random().toString(36).substring(2, 10).padEnd(8, '0')
  return (
    String(storeId).padStart(4, '0') +
    String(dept).padStart(3, '0') +
    String(cls).padStart(2, '0') +
    String(item).padStart(4, '0') +
    String(pid).padStart(8, '0') +
    rnd +
    String(batchDate)
  )
}

function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function assignPullFunction(level: number, size: string, qty: number, totalCartons: number): string {
  if (level === 0) return 'BK'
  if (size === 'XS') return 'CA'
  const empties = qty >= totalCartons
  if (empties) return 'FP'
  return level === 1 ? 'CF' : 'CA'
}

async function main() {
  const today = new Date()
  const batchDate = julianDate(today)
  const purgeDate = new Date(today.getTime() + 7 * 86_400_000)

  const [pallets, stores] = await Promise.all([
    prisma.pallet.findMany({
      where: { locationAisle: { not: null }, currentCartons: { gt: 0 } },
      select: {
        pid: true, dept: true, class: true, item: true,
        currentCartons: true,
        locationAisle: true, locationBin: true, locationLevel: true,
      },
      take: 20,
    }),
    prisma.store.findMany({ select: { id: true } }),
  ])

  if (pallets.length === 0) throw new Error('No stored pallets with cartons found — run the main seed first.')
  if (stores.length === 0) throw new Error('No stores found — run the main seed first.')

  // Fetch location sizes for each pallet's location in one batch.
  const locationKeys = pallets.map(p => ({ aisle: p.locationAisle!, bin: p.locationBin!, level: p.locationLevel! }))
  const locationData = await Promise.all(
    locationKeys.map(k => prisma.location.findFirst({
      where: { aisle: k.aisle, bin: k.bin, level: k.level },
      select: { size: true },
    }))
  )

  const labels = pallets.flatMap((p, i) => {
    const locSize = locationData[i]?.size ?? 'MD'
    const level = p.locationLevel ?? 1
    const maxQty = p.currentCartons

    // Two labels per pallet: one that doesn't empty (CA/CF), one that does (FP) when possible.
    const qty1 = maxQty === 1 ? 1 : randomInt(1, maxQty - 1)  // never empties
    const qty2 = maxQty                                         // empties

    const fn1 = assignPullFunction(level, locSize, qty1, maxQty)
    const fn2 = assignPullFunction(level, locSize, qty2, maxQty)

    return [
      {
        lid: genLid(stores[i % stores.length].id, p.dept, p.class, p.item, p.pid, batchDate),
        pid: p.pid, dept: p.dept, class: p.class, item: p.item,
        quantity: qty1, sspQuantity: 0, batchDate, purgeDate,
        destinationStore: stores[i % stores.length].id,
        status: 'PRINTED', pullFunction: fn1,
      },
      {
        lid: genLid(stores[(i + 1) % stores.length].id, p.dept, p.class, p.item, p.pid, batchDate),
        pid: p.pid, dept: p.dept, class: p.class, item: p.item,
        quantity: qty2, sspQuantity: 0, batchDate, purgeDate,
        destinationStore: stores[(i + 1) % stores.length].id,
        status: 'PRINTED', pullFunction: fn2,
      },
    ]
  })

  await prisma.label.createMany({ data: labels })

  const byFn = labels.reduce<Record<string, number>>((acc, l) => {
    acc[l.pullFunction] = (acc[l.pullFunction] ?? 0) + 1
    return acc
  }, {})
  console.log(`Created ${labels.length} PRINTED labels across ${pallets.length} pallets.`)
  console.log('  By function:', byFn)
}

main()
  .catch(err => { console.error(err); process.exit(1) })
  .finally(() => prisma.$disconnect())
