/**
 * Patches ALL existing pallets to carton-only (currentPallets = 0, receivedPallets = 0).
 * A pull always breaks full-pallet status; carton-only display is correct for all demo locations.
 * Safe to run on live data — only updates pallet counts; does not touch carton quantities or status.
 *
 * Usage: cd api && npx tsx prisma/fix-pallet-counts.ts
 */
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaMssql } from '@prisma/adapter-mssql'

const adapter = new PrismaMssql(process.env.DATABASE_URL!)
const prisma = new PrismaClient({ adapter })

/** Entry point: zeroes out currentPallets/receivedPallets on every pallet in the table. */
async function main() {
  const result = await prisma.pallet.updateMany({
    data: { currentPallets: 0, receivedPallets: 0 },
  })

  console.log(`Updated all ${result.count} pallets to carton-only (currentPallets = 0).`)
}

main()
  .catch(err => { console.error(err); process.exit(1) })
  .finally(() => prisma.$disconnect())
