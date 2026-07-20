import 'dotenv/config'
import { PrismaClient } from '../generated/prisma/index.js'
import { PrismaMssql } from '@prisma/adapter-mssql'
import bcrypt from 'bcryptjs'

const adapter = new PrismaMssql(process.env.DATABASE_URL!)
const prisma = new PrismaClient({ adapter })

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Returns a random integer in the inclusive range [min, max]. */
function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

/** Returns a random element from an array. */
function randomFrom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

/** Fisher-Yates shuffle, returning a new array (doesn't mutate the input). */
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** Returns a random Date within the last `daysBack` days (inclusive of today). */
function randomDate(daysBack: number): Date {
  return new Date(Date.now() - randomInt(0, daysBack) * 86_400_000)
}

/** Returns a random unit weight in lbs (0.10–25.00), 2 decimal places, as a string for Decimal insertion. */
function randomUnitWeight(): string {
  return (randomInt(10, 2500) / 100).toFixed(2)
}

/** Converts a Date to a Julian-style date int (YYYY + zero-padded day-of-year), e.g. 2026175. */
function julianDate(d: Date): number {
  const start = new Date(d.getFullYear(), 0, 0)
  const diff = d.getTime() - start.getTime()
  const oneDay = 86_400_000
  const doy = Math.floor(diff / oneDay)
  return d.getFullYear() * 1000 + doy
}

// Tracks pids already generated this run so genPid() never hands out a duplicate —
// safe only because this script holds all state in memory for a single execution.
const usedPids = new Set<number>()
/** Generates a random 8-digit Pallet ID, retrying on collision against `usedPids`. */
function genPid(): number {
  let pid: number
  do { pid = randomInt(10_000_000, 99_999_999) } while (usedPids.has(pid))
  usedPids.add(pid)
  return pid
}

/** Builds a Label ID string: store(4) + DPCI(9) + pid(8) + random(8) + batchDate. */
function genLid(storeId: number, dept: number, cls: number, item: number, pid: number, batchDate: number): string {
  const store = String(storeId).padStart(4, '0')
  const dpci = String(dept).padStart(3, '0') + String(cls).padStart(2, '0') + String(item).padStart(4, '0')
  const pidStr = String(pid).padStart(8, '0')
  const rnd = Math.random().toString(36).substring(2, 10).padEnd(8, '0')
  return store + dpci + pidStr + rnd + String(batchDate)
}

// Zone: standard 128-bin aisles
function getZone128(bin: number): number {
  if (bin <= 32) return 4
  if (bin <= 64) return 3
  if (bin <= 96) return 2
  return 1
}

// Zone: 192-bin aisles (301/302)
function getZone192(bin: number): number {
  if (bin <= 48) return 4
  if (bin <= 96) return 3
  if (bin <= 144) return 2
  return 1
}

const AISLE_PATTERN = ['L', 'L', 'M', 'S', 'L', 'M', 'HS'] as const
type AisleType = typeof AISLE_PATTERN[number]

/** Maps an aisle number (304+) onto the repeating 7-aisle size pattern. */
function getAisleType(aisle: number): AisleType {
  return AISLE_PATTERN[(aisle - 304) % 7]
}

/** Returns the highest physical level for an aisle, based on its special-case or type. */
function getMaxLevel(aisle: number): number {
  if (aisle === 301 || aisle === 302) return 13
  if (aisle === 303 || aisle === 701 || aisle === 702) return 6
  if (aisle === 801 || aisle === 802 || aisle === 803) return 10
  const t = getAisleType(aisle)
  return t === 'L' ? 5 : t === 'M' ? 6 : t === 'S' ? 8 : 10
}

/** Returns the LocationSize designation for a level, with per-aisle special cases. */
function getSize(aisle: number, level: number): string {
  if (aisle === 301 || aisle === 302 || aisle === 801 || aisle === 802 || aisle === 803) return 'XS'
  if (aisle === 303) {
    if (level === 1) return 'M'
    if (level <= 3) return 'L'
    if (level <= 5) return 'S'
    return 'HS'
  }
  if (aisle === 701 || aisle === 702) {
    if (level === 1) return 'M'
    if (level === 2) return 'HS'
    if (level === 3) return 'L'
    if (level <= 5) return 'S'
    return 'M'
  }
  const t = getAisleType(aisle)
  if (t === 'L') return level === 1 ? 'M' : 'L'
  if (t === 'S') return level === 1 ? 'M' : 'S'
  if (t === 'HS') return level === 1 ? 'M' : 'HS'
  return 'M' // Medium aisles all M
}

/** Returns the StorageCode for a location, with per-aisle and zone-based special cases. */
function getStorageCode(aisle: number, bin: number, level: number): string {
  if (aisle === 301) return level <= 9 ? 'CR' : 'FD'
  if (aisle === 302) {
    const z = getZone192(bin)
    return z >= 3 ? (level <= 9 ? 'NR' : 'NF') : 'BK'
  }
  if (aisle === 303 || aisle === 803) return 'BS'
  if (aisle === 701 || aisle === 801) return 'RF'
  if (aisle === 702 || aisle === 802) return 'RS'
  if (aisle >= 304 && aisle <= 310) return 'CR'
  if (aisle >= 311 && aisle <= 317) return 'FD'
  if (aisle >= 318 && aisle <= 324) return 'BK'
  if (aisle >= 325 && aisle <= 331) return 'NR'
  if (aisle >= 332 && aisle <= 338) return 'NF'
  return 'CR'
}

// ─── Lookup table data ────────────────────────────────────────────────────────

const STORAGE_CODES = [
  { id: 'CR', desc: 'Conveyable Reserve' },
  { id: 'FD', desc: 'Conveyable Food' },
  { id: 'BK', desc: 'Breakpack' },
  { id: 'NR', desc: 'Non-Conveyable Reserve' },
  { id: 'NF', desc: 'Non-Conveyable Food' },
  { id: 'RF', desc: 'Restricted Food' },
  { id: 'RS', desc: 'Restricted Reserve' },
  { id: 'BS', desc: 'Security' },
]

const PACKING_ZONES = [
  { id: 1,  desc: 'HBA' },
  { id: 2,  desc: 'Kitchen and Dining' },
  { id: 3,  desc: 'Bath and Bedroom' },
  { id: 4,  desc: 'Home Decor' },
  { id: 5,  desc: 'Electronics' },
  { id: 6,  desc: 'Small Appliances' },
  { id: 7,  desc: 'Toys' },
  { id: 8,  desc: 'Games' },
  { id: 9,  desc: 'Security' },
  { id: 10, desc: 'Food and Beverage' },
  { id: 11, desc: 'Pets' },
  { id: 12, desc: 'Sporting Goods' },
  { id: 13, desc: 'Baby and Infant' },
  { id: 14, desc: 'Kids Clothes' },
  { id: 15, desc: 'Womens Clothes' },
  { id: 16, desc: 'Mens Clothes' },
  { id: 17, desc: 'Shoes' },
  { id: 18, desc: 'Seasonal' },
]

const DEPARTMENTS = [
  { id: 'INB', name: 'Inbound' },
  { id: 'OUT', name: 'Outbound' },
  { id: 'BKP', name: 'Packing' },
  { id: 'WHS', name: 'Warehouse' },
  { id: 'IQA', name: 'Inventory Control and Quality Assurance' },
  { id: 'SEC', name: 'Security' },
]

const HOLD_PREFIXES = [
  { letter: 'I', dept: 'Inbound' },
  { letter: 'W', dept: 'Warehouse' },
  { letter: 'O', dept: 'Outbound' },
  { letter: 'P', dept: 'Packing' },
  { letter: 'Q', dept: 'ICQA' },
  { letter: 'S', dept: 'Security' },
]

const HOLD_REASONS: { num: string; desc: string }[] = [
  { num: '01', desc: 'Quantity Issue' },
  { num: '02', desc: 'DPCI Issue' },
  { num: '03', desc: 'VCP/SSP Issue' },
  { num: '04', desc: 'Location Issue' },
  { num: '05', desc: 'Damage Issue' },
  { num: '06', desc: 'Label In Location' },
  { num: '07', desc: 'Tipped Pallet' },
  { num: '08', desc: 'Fallen Carton' },
  { num: '09', desc: 'Object in Empty Loc' },
  { num: '10', desc: 'Expiration Issue' },
]

const HOLD_TYPES = HOLD_PREFIXES.flatMap(({ letter }) =>
  HOLD_REASONS.map(({ num, desc }) => ({ code: `${letter}${num}`, desc }))
)

const STORES = [
  { id: 2498, name: 'Cedar Falls' },
  { id: 2351, name: 'Waterloo North' },
  { id: 2352, name: 'Waterloo South' },
  { id: 2413, name: 'Waverly' },
  { id: 2618, name: 'La Porte City' },
  { id: 2123, name: 'Reinbeck' },
  { id: 2756, name: 'Dysart' },
  { id: 2874, name: 'Independence' },
  { id: 2345, name: 'Oelwein' },
  { id: 2671, name: 'Iowa Falls' },
  { id: 2234, name: 'Hampton' },
  { id: 2688, name: 'Ackley' },
  { id: 2901, name: 'Grundy Center' },
  { id: 2567, name: 'Eldora' },
  { id: 2432, name: 'Tama' },
  { id: 2789, name: 'Charles City' },
  { id: 2890, name: 'Marshalltown' },
  { id: 2519, name: 'Mason City' },
  { id: 2163, name: 'Cedar Rapids North' },
  { id: 2164, name: 'Cedar Rapids South' },
]

// ─── Item data ────────────────────────────────────────────────────────────────

type ItemDef = {
  dept: number; class: number; item: number
  upc: string; name: string; desc: string; descShort: string
  retailPrice: number; cost: number
  packingZoneCode: number; storageCode: string; conveyable: boolean
}

const ITEMS: ItemDef[] = [
  // CR — Conveyable Reserve (25)
  { dept: 76, class: 1, item: 1, upc: '076010001000', name: 'HDMI Cable 6ft', desc: 'High-speed HDMI cable 6 foot, supports 4K resolution', descShort: 'HDMI Cable 6ft 4K', retailPrice: 9.99, cost: 3.50, packingZoneCode: 5, storageCode: 'CR', conveyable: true },
  { dept: 76, class: 1, item: 2, upc: '076010002000', name: 'USB-C Charging Cable', desc: 'USB-C to USB-A charging cable, 6 foot, fast charge', descShort: 'USB-C Cable 6ft', retailPrice: 12.99, cost: 4.25, packingZoneCode: 5, storageCode: 'CR', conveyable: true },
  { dept: 76, class: 1, item: 3, upc: '076010003000', name: 'Bluetooth Earbuds', desc: 'True wireless bluetooth earbuds with charging case, 24hr battery', descShort: 'BT Earbuds w/ Case', retailPrice: 29.99, cost: 11.00, packingZoneCode: 5, storageCode: 'CR', conveyable: true },
  { dept: 76, class: 1, item: 4, upc: '076010004000', name: 'Phone Case 4-Pack Assorted', desc: 'Assorted phone cases mixed styles, 4 per inner pack', descShort: 'Phone Cases 4pk', retailPrice: 7.99, cost: 2.80, packingZoneCode: 5, storageCode: 'CR', conveyable: true },
  { dept: 76, class: 1, item: 5, upc: '076010005000', name: 'Screen Protector 2-Pack', desc: 'Tempered glass screen protector, 2 per pack, universal fit', descShort: 'Screen Protector 2pk', retailPrice: 8.99, cost: 2.50, packingZoneCode: 5, storageCode: 'CR', conveyable: true },
  { dept: 58, class: 1, item: 1, upc: '058010001000', name: 'Copy Paper 500 Sheet Ream', desc: 'Standard 20lb copy paper, 8.5x11, 500 sheets per ream, bright white', descShort: 'Copy Paper 500ct Ream', retailPrice: 9.49, cost: 4.10, packingZoneCode: 5, storageCode: 'CR', conveyable: true },
  { dept: 58, class: 1, item: 2, upc: '058010002000', name: 'Ballpoint Pen 10-Pack', desc: 'Medium point ballpoint pens, black ink, 10 pack', descShort: 'Ballpoint Pen 10pk Blk', retailPrice: 4.99, cost: 1.50, packingZoneCode: 5, storageCode: 'CR', conveyable: true },
  { dept: 58, class: 1, item: 3, upc: '058010003000', name: 'Sticky Notes 3x3 6-Pack', desc: 'Self-stick note pads, 3x3 inch, assorted neon colors, 6 pads per pack', descShort: 'Sticky Notes 3x3 6pk', retailPrice: 6.99, cost: 2.20, packingZoneCode: 5, storageCode: 'CR', conveyable: true },
  { dept: 58, class: 1, item: 4, upc: '058010004000', name: 'Binder 3-Ring 1 Inch', desc: '1 inch 3-ring binder, white, holds up to 175 sheets', descShort: 'Binder 3-Ring 1in Wht', retailPrice: 3.49, cost: 1.20, packingZoneCode: 5, storageCode: 'CR', conveyable: true },
  { dept: 58, class: 1, item: 5, upc: '058010005000', name: 'Highlighter 5-Pack', desc: 'Chisel tip highlighters, assorted colors, 5 per pack', descShort: 'Highlighters 5pk Asst', retailPrice: 4.49, cost: 1.40, packingZoneCode: 5, storageCode: 'CR', conveyable: true },
  { dept: 65, class: 1, item: 1, upc: '065010001000', name: 'Yoga Mat 6mm', desc: 'Non-slip yoga mat, 6mm thickness, 68 inch length, includes carry strap', descShort: 'Yoga Mat 6mm Non-Slip', retailPrice: 19.99, cost: 7.50, packingZoneCode: 12, storageCode: 'CR', conveyable: true },
  { dept: 65, class: 1, item: 2, upc: '065010002000', name: 'Water Bottle 32oz Insulated', desc: 'Stainless steel insulated water bottle, 32oz, keeps cold 24hr', descShort: 'Water Bottle 32oz S/S', retailPrice: 24.99, cost: 9.00, packingZoneCode: 12, storageCode: 'CR', conveyable: true },
  { dept: 65, class: 1, item: 3, upc: '065010003000', name: 'Jump Rope Speed', desc: 'Adjustable speed jump rope, steel cable, comfortable grips', descShort: 'Jump Rope Speed Cable', retailPrice: 12.99, cost: 4.50, packingZoneCode: 12, storageCode: 'CR', conveyable: true },
  { dept: 65, class: 1, item: 4, upc: '065010004000', name: 'Resistance Bands Set 5pc', desc: 'Resistance exercise bands set, 5 resistance levels, latex free', descShort: 'Resistance Bands 5pc', retailPrice: 16.99, cost: 6.00, packingZoneCode: 12, storageCode: 'CR', conveyable: true },
  { dept: 65, class: 1, item: 5, upc: '065010005000', name: 'Foam Roller 12 Inch', desc: 'High density EVA foam roller for muscle recovery, 12 inch', descShort: 'Foam Roller 12in HD', retailPrice: 14.99, cost: 5.25, packingZoneCode: 12, storageCode: 'CR', conveyable: true },
  { dept: 86, class: 1, item: 1, upc: '086010001000', name: 'Extension Cord 6ft 3-Outlet', desc: '6 foot extension cord with 3 grounded outlets, 16 AWG', descShort: 'Extension Cord 6ft 3-Out', retailPrice: 8.99, cost: 3.10, packingZoneCode: 5, storageCode: 'CR', conveyable: true },
  { dept: 86, class: 1, item: 2, upc: '086010002000', name: 'LED Light Bulb A19 4-Pack', desc: 'A19 LED light bulbs, 60W equivalent, soft white 2700K, 4 pack', descShort: 'LED Bulb A19 4pk 60W', retailPrice: 7.99, cost: 2.90, packingZoneCode: 5, storageCode: 'CR', conveyable: true },
  { dept: 86, class: 1, item: 3, upc: '086010003000', name: 'AA Batteries 20-Pack', desc: 'Alkaline AA batteries, 20 count, 10-year shelf life', descShort: 'AA Batteries 20pk Alk', retailPrice: 13.99, cost: 5.50, packingZoneCode: 5, storageCode: 'CR', conveyable: true },
  { dept: 86, class: 1, item: 4, upc: '086010004000', name: 'AAA Batteries 20-Pack', desc: 'Alkaline AAA batteries, 20 count, 10-year shelf life', descShort: 'AAA Batteries 20pk Alk', retailPrice: 12.99, cost: 5.00, packingZoneCode: 5, storageCode: 'CR', conveyable: true },
  { dept: 86, class: 1, item: 5, upc: '086010005000', name: 'Picture Frame 8x10 Black', desc: 'Black wood picture frame, 8x10 inch, includes mat', descShort: 'Picture Frame 8x10 Blk', retailPrice: 9.99, cost: 3.50, packingZoneCode: 4, storageCode: 'CR', conveyable: true },
  { dept: 86, class: 1, item: 6, upc: '086010006000', name: 'Command Strips 16-Pack', desc: 'Damage-free picture hanging strips, medium, 16 pairs per pack', descShort: 'Command Strips Med 16pk', retailPrice: 9.99, cost: 3.75, packingZoneCode: 4, storageCode: 'CR', conveyable: true },
  { dept: 86, class: 1, item: 7, upc: '086010007000', name: 'Cable Management Sleeve', desc: 'Flexible neoprene cable organizer sleeve, 19 inch, black', descShort: 'Cable Sleeve 19in Blk', retailPrice: 7.49, cost: 2.60, packingZoneCode: 5, storageCode: 'CR', conveyable: true },
  { dept: 86, class: 1, item: 8, upc: '086010008000', name: 'Surge Protector 6-Outlet', desc: '6-outlet surge protector, 1080 joules, 3-foot cord', descShort: 'Surge Protector 6-Out', retailPrice: 16.99, cost: 6.50, packingZoneCode: 5, storageCode: 'CR', conveyable: true },
  { dept: 86, class: 1, item: 9, upc: '086010009000', name: 'Duct Tape Heavy Duty', desc: 'Heavy duty duct tape, 1.88 in x 35 yd, silver', descShort: 'Duct Tape H/D Silver', retailPrice: 6.49, cost: 2.25, packingZoneCode: 4, storageCode: 'CR', conveyable: true },
  { dept: 86, class: 1, item: 10, upc: '086010010000', name: 'Storage Bin 12qt Clear', desc: 'Clear plastic storage bin with snap lid, 12 quart', descShort: 'Storage Bin 12qt Clear', retailPrice: 5.99, cost: 2.10, packingZoneCode: 4, storageCode: 'CR', conveyable: true },

  // FD — Conveyable Food (25)
  { dept: 51, class: 1, item: 1, upc: '051010001000', name: 'Pasta Penne 16oz', desc: 'Penne pasta, enriched semolina, 16 oz box', descShort: 'Pasta Penne 16oz', retailPrice: 1.89, cost: 0.75, packingZoneCode: 10, storageCode: 'FD', conveyable: true },
  { dept: 51, class: 1, item: 2, upc: '051010002000', name: 'Pasta Rotini 16oz', desc: 'Rotini pasta, enriched semolina, 16 oz box', descShort: 'Pasta Rotini 16oz', retailPrice: 1.89, cost: 0.75, packingZoneCode: 10, storageCode: 'FD', conveyable: true },
  { dept: 51, class: 1, item: 3, upc: '051010003000', name: 'Rice White Long Grain 5lb', desc: 'Long grain white rice, enriched, 5 lb bag', descShort: 'Rice White LG 5lb', retailPrice: 5.49, cost: 2.20, packingZoneCode: 10, storageCode: 'FD', conveyable: true },
  { dept: 51, class: 1, item: 4, upc: '051010004000', name: 'Oatmeal Quick 42oz', desc: 'Quick oats, 42 oz canister, whole grain', descShort: 'Oatmeal Quick 42oz', retailPrice: 5.99, cost: 2.50, packingZoneCode: 10, storageCode: 'FD', conveyable: true },
  { dept: 51, class: 1, item: 5, upc: '051010005000', name: 'Canned Chicken Broth 32oz', desc: 'Chicken broth, reduced sodium, 32 oz carton', descShort: 'Chicken Broth 32oz RS', retailPrice: 2.99, cost: 1.10, packingZoneCode: 10, storageCode: 'FD', conveyable: true },
  { dept: 51, class: 1, item: 6, upc: '051010006000', name: 'Black Beans Canned 15oz', desc: 'Black beans, no salt added, 15 oz can', descShort: 'Black Beans 15oz NSA', retailPrice: 1.29, cost: 0.45, packingZoneCode: 10, storageCode: 'FD', conveyable: true },
  { dept: 51, class: 1, item: 7, upc: '051010007000', name: 'Peanut Butter Creamy 40oz', desc: 'Creamy peanut butter, 40 oz, no stir', descShort: 'PB Creamy 40oz', retailPrice: 6.99, cost: 3.00, packingZoneCode: 10, storageCode: 'FD', conveyable: true },
  { dept: 51, class: 1, item: 8, upc: '051010008000', name: 'Diced Tomatoes 14.5oz 4pk', desc: 'Diced tomatoes, no salt added, 14.5 oz, 4 can pack', descShort: 'Diced Tomatoes 4pk NSA', retailPrice: 5.49, cost: 2.20, packingZoneCode: 10, storageCode: 'FD', conveyable: true },
  { dept: 51, class: 1, item: 9, upc: '051010009000', name: 'Chicken Noodle Soup 10.75oz', desc: 'Condensed chicken noodle soup, 10.75 oz can', descShort: 'Chk Noodle Soup 10.75oz', retailPrice: 1.29, cost: 0.48, packingZoneCode: 10, storageCode: 'FD', conveyable: true },
  { dept: 51, class: 1, item: 10, upc: '051010010000', name: 'Corn Kernels 15.25oz 4pk', desc: 'Whole kernel corn, no salt added, 4 pack', descShort: 'Corn Kernels 4pk NSA', retailPrice: 4.49, cost: 1.75, packingZoneCode: 10, storageCode: 'FD', conveyable: true },
  { dept: 52, class: 1, item: 1, upc: '052010001000', name: 'Potato Chips Original 8oz', desc: 'Original flavor potato chips, 8 oz bag', descShort: 'Potato Chips Orig 8oz', retailPrice: 4.29, cost: 1.70, packingZoneCode: 10, storageCode: 'FD', conveyable: true },
  { dept: 52, class: 1, item: 2, upc: '052010002000', name: 'Granola Bars Oat Honey 8ct', desc: 'Oat and honey granola bars, 8 count box', descShort: 'Granola Bar O/H 8ct', retailPrice: 3.99, cost: 1.55, packingZoneCode: 10, storageCode: 'FD', conveyable: true },
  { dept: 52, class: 1, item: 3, upc: '052010003000', name: 'Mixed Nuts 10oz', desc: 'Deluxe mixed nuts, lightly salted, 10 oz canister', descShort: 'Mixed Nuts 10oz Lgt Slt', retailPrice: 7.99, cost: 3.50, packingZoneCode: 10, storageCode: 'FD', conveyable: true },
  { dept: 52, class: 1, item: 4, upc: '052010004000', name: 'Crackers Whole Grain 13.6oz', desc: 'Whole grain crackers, original, 13.6 oz box', descShort: 'Crackers WG Orig 13.6oz', retailPrice: 4.49, cost: 1.80, packingZoneCode: 10, storageCode: 'FD', conveyable: true },
  { dept: 52, class: 1, item: 5, upc: '052010005000', name: 'Popcorn Microwave 6pk', desc: 'Butter microwave popcorn, 6 bags per box', descShort: 'Popcorn Micro Bttr 6pk', retailPrice: 3.99, cost: 1.50, packingZoneCode: 10, storageCode: 'FD', conveyable: true },
  { dept: 52, class: 1, item: 6, upc: '052010006000', name: 'Trail Mix Classic 28oz', desc: 'Classic trail mix, raisins peanuts M&M style, 28 oz bag', descShort: 'Trail Mix Classic 28oz', retailPrice: 9.99, cost: 4.25, packingZoneCode: 10, storageCode: 'FD', conveyable: true },
  { dept: 52, class: 1, item: 7, upc: '052010007000', name: 'Pretzels Twists 16oz', desc: 'Original pretzel twists, 16 oz bag, salted', descShort: 'Pretzels Twists 16oz', retailPrice: 3.49, cost: 1.30, packingZoneCode: 10, storageCode: 'FD', conveyable: true },
  { dept: 52, class: 1, item: 8, upc: '052010008000', name: 'Chocolate Chip Cookies 13oz', desc: 'Chocolate chip cookies, 13 oz tray, soft baked', descShort: 'Choc Chip Cookies 13oz', retailPrice: 4.49, cost: 1.75, packingZoneCode: 10, storageCode: 'FD', conveyable: true },
  { dept: 53, class: 1, item: 1, upc: '053010001000', name: 'Orange Juice 52oz', desc: 'Original orange juice, no pulp, 52 oz bottle', descShort: 'OJ No Pulp 52oz', retailPrice: 5.49, cost: 2.25, packingZoneCode: 10, storageCode: 'FD', conveyable: true },
  { dept: 53, class: 1, item: 2, upc: '053010002000', name: 'Apple Juice 64oz', desc: '100% apple juice, from concentrate, 64 oz bottle', descShort: 'Apple Juice 64oz', retailPrice: 4.49, cost: 1.80, packingZoneCode: 10, storageCode: 'FD', conveyable: true },
  { dept: 53, class: 1, item: 3, upc: '053010003000', name: 'Sports Drink 32oz 6pk', desc: 'Lemon-lime electrolyte sports drink, 32 oz, 6 pack', descShort: 'Sports Drink L/L 6pk', retailPrice: 8.99, cost: 3.75, packingZoneCode: 10, storageCode: 'FD', conveyable: true },
  { dept: 53, class: 1, item: 4, upc: '053010004000', name: 'Sparkling Water 12pk Lime', desc: 'Lime sparkling water, unsweetened, 12 oz cans, 12 pack', descShort: 'Spk Water Lime 12pk', retailPrice: 5.99, cost: 2.50, packingZoneCode: 10, storageCode: 'FD', conveyable: true },
  { dept: 53, class: 1, item: 5, upc: '053010005000', name: 'Coffee Ground Medium 30oz', desc: 'Medium roast ground coffee, 30.5 oz canister', descShort: 'Coffee Ground Med 30oz', retailPrice: 12.99, cost: 5.75, packingZoneCode: 10, storageCode: 'FD', conveyable: true },
  { dept: 53, class: 1, item: 6, upc: '053010006000', name: 'Tea Bags Black 100ct', desc: 'Black tea bags, 100 count, individually wrapped', descShort: 'Tea Bags Blk 100ct', retailPrice: 6.49, cost: 2.60, packingZoneCode: 10, storageCode: 'FD', conveyable: true },
  { dept: 53, class: 1, item: 7, upc: '053010007000', name: 'Protein Shake Choc 4pk', desc: 'Chocolate protein shake, 30g protein, 11oz, 4 pack', descShort: 'Protein Shake Choc 4pk', retailPrice: 9.99, cost: 4.50, packingZoneCode: 10, storageCode: 'FD', conveyable: true },

  // BK — Breakpack (22)
  { dept: 12, class: 1, item: 1, upc: '012010001000', name: 'Shampoo Daily Moisture 12oz', desc: 'Daily moisture shampoo for normal hair, 12 oz bottle', descShort: 'Shampoo Daily Moist 12oz', retailPrice: 6.99, cost: 2.80, packingZoneCode: 1, storageCode: 'BK', conveyable: true },
  { dept: 12, class: 1, item: 2, upc: '012010002000', name: 'Conditioner Daily Moisture 12oz', desc: 'Daily moisture conditioner for normal hair, 12 oz bottle', descShort: 'Conditioner Daily 12oz', retailPrice: 6.99, cost: 2.80, packingZoneCode: 1, storageCode: 'BK', conveyable: true },
  { dept: 12, class: 1, item: 3, upc: '012010003000', name: 'Body Wash Refreshing 16oz', desc: 'Refreshing body wash, ocean breeze scent, 16 oz', descShort: 'Body Wash Refrshing 16oz', retailPrice: 5.49, cost: 2.10, packingZoneCode: 1, storageCode: 'BK', conveyable: true },
  { dept: 12, class: 1, item: 4, upc: '012010004000', name: 'Deodorant Stick 2.6oz', desc: 'Antiperspirant deodorant stick, cool sport, 2.6 oz', descShort: 'Deodorant Stick 2.6oz', retailPrice: 4.49, cost: 1.75, packingZoneCode: 1, storageCode: 'BK', conveyable: true },
  { dept: 12, class: 1, item: 5, upc: '012010005000', name: 'Toothpaste Whitening 6oz', desc: 'Whitening toothpaste with fluoride, cool mint, 6 oz', descShort: 'Toothpaste White 6oz', retailPrice: 4.99, cost: 1.90, packingZoneCode: 1, storageCode: 'BK', conveyable: true },
  { dept: 12, class: 1, item: 6, upc: '012010006000', name: 'Toothbrush Soft 3-Pack', desc: 'Soft bristle toothbrush, 3 per pack, assorted colors', descShort: 'Toothbrush Soft 3pk', retailPrice: 5.99, cost: 2.20, packingZoneCode: 1, storageCode: 'BK', conveyable: true },
  { dept: 12, class: 1, item: 7, upc: '012010007000', name: 'Facial Moisturizer SPF 15 4oz', desc: 'Daily facial moisturizer with SPF 15, 4 oz', descShort: 'Facial Moist SPF15 4oz', retailPrice: 10.99, cost: 4.25, packingZoneCode: 1, storageCode: 'BK', conveyable: true },
  { dept: 12, class: 1, item: 8, upc: '012010008000', name: 'Hand Lotion Unscented 8oz', desc: 'Fragrance-free hand lotion, non-greasy, 8 oz pump', descShort: 'Hand Lotion Unscnt 8oz', retailPrice: 5.99, cost: 2.25, packingZoneCode: 1, storageCode: 'BK', conveyable: true },
  { dept: 12, class: 1, item: 9, upc: '012010009000', name: 'Razor Disposable 5-Pack', desc: '5-blade disposable razors, comfort strip, 5 per pack', descShort: 'Razor Disposable 5pk', retailPrice: 8.99, cost: 3.50, packingZoneCode: 1, storageCode: 'BK', conveyable: true },
  { dept: 12, class: 1, item: 10, upc: '012010010000', name: 'Sunscreen SPF 50 5oz', desc: 'Broad spectrum SPF 50 sunscreen lotion, water resistant, 5 oz', descShort: 'Sunscreen SPF50 5oz', retailPrice: 9.99, cost: 4.00, packingZoneCode: 1, storageCode: 'BK', conveyable: true },
  { dept: 13, class: 1, item: 1, upc: '013010001000', name: 'Mascara Black Lengthening', desc: 'Lengthening mascara, washable, black, 0.27 oz', descShort: 'Mascara Lngthng Blk', retailPrice: 8.99, cost: 3.25, packingZoneCode: 1, storageCode: 'BK', conveyable: true },
  { dept: 13, class: 1, item: 2, upc: '013010002000', name: 'Foundation Liquid Medium 1oz', desc: 'Liquid foundation, medium coverage, natural finish, shade medium', descShort: 'Foundation Liquid Med', retailPrice: 10.99, cost: 4.00, packingZoneCode: 1, storageCode: 'BK', conveyable: true },
  { dept: 13, class: 1, item: 3, upc: '013010003000', name: 'Eyeshadow Palette 12-Pan', desc: '12-pan eyeshadow palette, neutral tones, matte and shimmer', descShort: 'Eyeshadow Palette 12pan', retailPrice: 12.99, cost: 5.00, packingZoneCode: 1, storageCode: 'BK', conveyable: true },
  { dept: 13, class: 1, item: 4, upc: '013010004000', name: 'Lipstick Satin Finish', desc: 'Satin finish lipstick, high pigment, assorted shades', descShort: 'Lipstick Satin Asstd', retailPrice: 7.99, cost: 2.80, packingZoneCode: 1, storageCode: 'BK', conveyable: true },
  { dept: 13, class: 1, item: 5, upc: '013010005000', name: 'Blush Powder 0.39oz', desc: 'Buildable powder blush, natural flush finish, 0.39 oz', descShort: 'Blush Powder 0.39oz', retailPrice: 9.49, cost: 3.50, packingZoneCode: 1, storageCode: 'BK', conveyable: true },
  { dept: 13, class: 1, item: 6, upc: '013010006000', name: 'Nail Polish Assorted 0.5oz', desc: 'Nail polish, high shine finish, 0.5 oz, assorted colors', descShort: 'Nail Polish 0.5oz Asst', retailPrice: 3.49, cost: 1.10, packingZoneCode: 1, storageCode: 'BK', conveyable: true },
  { dept: 13, class: 1, item: 7, upc: '013010007000', name: 'Makeup Remover Wipes 25ct', desc: 'Gentle makeup remover cleansing cloths, 25 count', descShort: 'MU Remover Wipes 25ct', retailPrice: 4.99, cost: 1.80, packingZoneCode: 1, storageCode: 'BK', conveyable: true },
  { dept: 13, class: 1, item: 8, upc: '013010008000', name: 'Setting Spray Matte 3.4oz', desc: 'Makeup setting spray, matte finish, long-lasting, 3.4 oz', descShort: 'Setting Spray Matte 3.4oz', retailPrice: 11.99, cost: 4.50, packingZoneCode: 1, storageCode: 'BK', conveyable: true },
  { dept: 13, class: 1, item: 9, upc: '013010009000', name: 'Concealer Medium 0.23oz', desc: 'Full-coverage liquid concealer, shade medium, 0.23 oz', descShort: 'Concealer Med 0.23oz', retailPrice: 9.99, cost: 3.75, packingZoneCode: 1, storageCode: 'BK', conveyable: true },
  { dept: 13, class: 1, item: 10, upc: '013010010000', name: 'Bronzer Powder 0.31oz', desc: 'Buildable bronzer powder, sun-kissed glow, 0.31 oz', descShort: 'Bronzer Powder 0.31oz', retailPrice: 10.49, cost: 3.90, packingZoneCode: 1, storageCode: 'BK', conveyable: true },
  { dept: 13, class: 1, item: 11, upc: '013010011000', name: 'Makeup Sponge Blending 3pk', desc: 'Beauty blending sponge, latex free, 3 pack', descShort: 'Blending Sponge 3pk', retailPrice: 6.99, cost: 2.50, packingZoneCode: 1, storageCode: 'BK', conveyable: true },
  { dept: 13, class: 1, item: 12, upc: '013010012000', name: 'Eyeliner Pencil Black', desc: 'Waterproof eyeliner pencil, black, with smudge tip', descShort: 'Eyeliner Pencil Blk WP', retailPrice: 6.49, cost: 2.25, packingZoneCode: 1, storageCode: 'BK', conveyable: true },

  // NR — Non-Conveyable Reserve (24)
  { dept: 21, class: 1, item: 1, upc: '021010001000', name: 'Bookshelf 5-Shelf Wood', desc: '5-shelf bookcase, espresso finish, 71 inch height, assembly required', descShort: 'Bookshelf 5-Shelf 71in', retailPrice: 79.99, cost: 32.00, packingZoneCode: 4, storageCode: 'NR', conveyable: false },
  { dept: 21, class: 1, item: 2, upc: '021010002000', name: 'TV Stand 55in Black', desc: 'Entertainment center TV stand, fits up to 55 inch TV, black', descShort: 'TV Stand 55in Blk', retailPrice: 89.99, cost: 36.00, packingZoneCode: 4, storageCode: 'NR', conveyable: false },
  { dept: 21, class: 1, item: 3, upc: '021010003000', name: 'Coffee Table Rectangle', desc: 'Rectangle coffee table, dark walnut finish, lower shelf', descShort: 'Coffee Table Rect DW', retailPrice: 99.99, cost: 40.00, packingZoneCode: 4, storageCode: 'NR', conveyable: false },
  { dept: 21, class: 1, item: 4, upc: '021010004000', name: 'Nightstand 2-Drawer', desc: '2-drawer nightstand, white, solid wood legs, small footprint', descShort: 'Nightstand 2-Drwr Wht', retailPrice: 59.99, cost: 24.00, packingZoneCode: 3, storageCode: 'NR', conveyable: false },
  { dept: 21, class: 1, item: 5, upc: '021010005000', name: 'Floor Lamp Arc Black', desc: 'Arc floor lamp, matte black, 3-way dimmer, includes bulb', descShort: 'Floor Lamp Arc Blk', retailPrice: 49.99, cost: 19.50, packingZoneCode: 4, storageCode: 'NR', conveyable: false },
  { dept: 21, class: 1, item: 6, upc: '021010006000', name: 'Dresser 6-Drawer White', desc: '6-drawer dresser, white finish, metal handles, assembly required', descShort: 'Dresser 6-Drwr Wht', retailPrice: 149.99, cost: 60.00, packingZoneCode: 3, storageCode: 'NR', conveyable: false },
  { dept: 21, class: 1, item: 7, upc: '021010007000', name: 'Desk Writing 48in Oak', desc: '48 inch writing desk, medium oak finish, no drawers', descShort: 'Writing Desk 48in Oak', retailPrice: 119.99, cost: 48.00, packingZoneCode: 4, storageCode: 'NR', conveyable: false },
  { dept: 21, class: 1, item: 8, upc: '021010008000', name: 'Accent Chair Barrel Gray', desc: 'Barrel accent chair, heathered gray upholstery, tapered legs', descShort: 'Accent Chair Barrel Gry', retailPrice: 179.99, cost: 72.00, packingZoneCode: 4, storageCode: 'NR', conveyable: false },
  { dept: 22, class: 1, item: 1, upc: '022010001000', name: 'Storage Cube Organizer 6-Cube', desc: '6-cube organizer, espresso, each cube 12 inch square', descShort: 'Cube Organizer 6-Cube', retailPrice: 39.99, cost: 16.00, packingZoneCode: 4, storageCode: 'NR', conveyable: false },
  { dept: 22, class: 1, item: 2, upc: '022010002000', name: 'Wardrobe Portable 48in', desc: 'Portable clothes wardrobe, 48 inch wide, non-woven cover', descShort: 'Wardrobe Portable 48in', retailPrice: 44.99, cost: 18.00, packingZoneCode: 4, storageCode: 'NR', conveyable: false },
  { dept: 22, class: 1, item: 3, upc: '022010003000', name: 'Shoe Rack 3-Tier Metal', desc: '3-tier metal shoe rack, bronze finish, holds 18 pairs', descShort: 'Shoe Rack 3-Tier Metal', retailPrice: 29.99, cost: 11.50, packingZoneCode: 4, storageCode: 'NR', conveyable: false },
  { dept: 22, class: 1, item: 4, upc: '022010004000', name: 'Under Bed Storage 2-Pack', desc: 'Under-bed rolling storage drawers, 2 pack, zippered', descShort: 'Under Bed Storage 2pk', retailPrice: 34.99, cost: 13.50, packingZoneCode: 3, storageCode: 'NR', conveyable: false },
  { dept: 22, class: 1, item: 5, upc: '022010005000', name: 'Laundry Hamper 2-Section', desc: '2-section laundry hamper, canvas, lights and darks', descShort: 'Laundry Hamper 2-Sect', retailPrice: 26.99, cost: 10.50, packingZoneCode: 3, storageCode: 'NR', conveyable: false },
  { dept: 22, class: 1, item: 6, upc: '022010006000', name: 'Tool Organizer Wall Mount', desc: 'Wall mount tool organizer, pegboard, 24x24 inch, hardware included', descShort: 'Tool Organizer WM 24x24', retailPrice: 29.99, cost: 11.00, packingZoneCode: 4, storageCode: 'NR', conveyable: false },
  { dept: 22, class: 1, item: 7, upc: '022010007000', name: 'Garage Shelving 5-Tier', desc: '5-tier garage shelving unit, steel, 1000 lb capacity', descShort: 'Garage Shelving 5-Tier', retailPrice: 69.99, cost: 28.00, packingZoneCode: 4, storageCode: 'NR', conveyable: false },
  { dept: 23, class: 1, item: 1, upc: '023010001000', name: 'Outdoor Storage Deck Box 73gal', desc: 'Patio deck box, 73 gallon, lockable, weather resistant', descShort: 'Deck Box 73gal WR', retailPrice: 89.99, cost: 36.00, packingZoneCode: 18, storageCode: 'NR', conveyable: false },
  { dept: 23, class: 1, item: 2, upc: '023010002000', name: 'Christmas Tree Pre-Lit 6ft', desc: 'Pre-lit artificial Christmas tree, 6 foot, 250 LED lights', descShort: 'Xmas Tree Pre-Lit 6ft', retailPrice: 79.99, cost: 31.00, packingZoneCode: 18, storageCode: 'NR', conveyable: false },
  { dept: 23, class: 1, item: 3, upc: '023010003000', name: 'Outdoor Folding Chair 2pk', desc: 'Folding lawn chair, steel frame, armrests, 2 pack', descShort: 'Outdoor Chair Fold 2pk', retailPrice: 39.99, cost: 15.50, packingZoneCode: 18, storageCode: 'NR', conveyable: false },
  { dept: 23, class: 1, item: 4, upc: '023010004000', name: 'Patio Umbrella 9ft Tilt', desc: '9 foot tilting patio umbrella, polyester canopy, push button tilt', descShort: 'Patio Umbrella 9ft Tilt', retailPrice: 49.99, cost: 20.00, packingZoneCode: 18, storageCode: 'NR', conveyable: false },
  { dept: 23, class: 1, item: 5, upc: '023010005000', name: 'Snow Blower Single Stage 21in', desc: 'Single stage electric snow blower, 21 inch clearing width', descShort: 'Snow Blower 21in Elec', retailPrice: 199.99, cost: 80.00, packingZoneCode: 18, storageCode: 'NR', conveyable: false },
  { dept: 23, class: 1, item: 6, upc: '023010006000', name: 'Halloween Inflatable 6ft', desc: 'Halloween inflatable pumpkin ghost, 6 foot, LED lit', descShort: 'Halloween Inflatable 6ft', retailPrice: 39.99, cost: 15.00, packingZoneCode: 18, storageCode: 'NR', conveyable: false },
  { dept: 23, class: 1, item: 7, upc: '023010007000', name: 'Garden Hose 50ft', desc: 'Expandable garden hose, 50 foot, includes spray nozzle', descShort: 'Garden Hose 50ft Exp', retailPrice: 29.99, cost: 11.50, packingZoneCode: 18, storageCode: 'NR', conveyable: false },
  { dept: 23, class: 1, item: 8, upc: '023010008000', name: 'Lawn Mower Push Reel', desc: 'Push reel lawn mower, 18 inch cutting width, 7 blade', descShort: 'Lawn Mower Push Reel 18in', retailPrice: 119.99, cost: 47.00, packingZoneCode: 18, storageCode: 'NR', conveyable: false },
  { dept: 23, class: 1, item: 9, upc: '023010009000', name: 'Fire Pit Portable 28in', desc: 'Portable steel fire pit, 28 inch diameter, with spark screen', descShort: 'Fire Pit Portable 28in', retailPrice: 59.99, cost: 24.00, packingZoneCode: 18, storageCode: 'NR', conveyable: false },

  // NF — Non-Conveyable Food (22)
  { dept: 56, class: 1, item: 1, upc: '056010001000', name: 'Water 40pk 16.9oz', desc: 'Purified drinking water, 16.9 oz bottles, 40 pack', descShort: 'Water 16.9oz 40pk', retailPrice: 6.99, cost: 2.75, packingZoneCode: 10, storageCode: 'NF', conveyable: false },
  { dept: 56, class: 1, item: 2, upc: '056010002000', name: 'Sparkling Water 24pk 12oz', desc: 'Original sparkling water, unsweetened, 12 oz cans, 24 pack', descShort: 'Spk Water Orig 24pk', retailPrice: 9.99, cost: 4.00, packingZoneCode: 10, storageCode: 'NF', conveyable: false },
  { dept: 56, class: 1, item: 3, upc: '056010003000', name: 'Sports Drink 24pk 12oz', desc: 'Fruit punch electrolyte sports drink, 12 oz, 24 pack', descShort: 'Sports Drink FP 24pk', retailPrice: 14.99, cost: 6.25, packingZoneCode: 10, storageCode: 'NF', conveyable: false },
  { dept: 56, class: 1, item: 4, upc: '056010004000', name: 'Soda Cola 24pk 12oz Cans', desc: 'Cola soda, 12 oz cans, 24 pack case', descShort: 'Cola Soda 24pk 12oz', retailPrice: 9.99, cost: 4.00, packingZoneCode: 10, storageCode: 'NF', conveyable: false },
  { dept: 56, class: 1, item: 5, upc: '056010005000', name: 'Soda Lemon-Lime 24pk 12oz', desc: 'Lemon-lime soda, 12 oz cans, 24 pack case', descShort: 'L/L Soda 24pk 12oz', retailPrice: 9.99, cost: 4.00, packingZoneCode: 10, storageCode: 'NF', conveyable: false },
  { dept: 56, class: 1, item: 6, upc: '056010006000', name: 'Energy Drink 24pk 16oz', desc: 'Original energy drink, 16 oz cans, 24 pack case', descShort: 'Energy Drink Orig 24pk', retailPrice: 29.99, cost: 13.00, packingZoneCode: 10, storageCode: 'NF', conveyable: false },
  { dept: 56, class: 1, item: 7, upc: '056010007000', name: 'Juice Box Apple 40pk', desc: '100% apple juice, 6.75 oz juice boxes, 40 pack', descShort: 'Apple Juice Box 40pk', retailPrice: 11.99, cost: 5.00, packingZoneCode: 10, storageCode: 'NF', conveyable: false },
  { dept: 56, class: 1, item: 8, upc: '056010008000', name: 'Coconut Water 12pk 11oz', desc: '100% natural coconut water, 11 oz, 12 pack', descShort: 'Coconut Water 12pk 11oz', retailPrice: 16.99, cost: 7.25, packingZoneCode: 10, storageCode: 'NF', conveyable: false },
  { dept: 57, class: 1, item: 1, upc: '057010001000', name: 'Dog Food Dry Adult 40lb', desc: 'Adult dry dog food, chicken and rice recipe, 40 lb bag', descShort: 'Dog Food Dry Adult 40lb', retailPrice: 39.99, cost: 18.00, packingZoneCode: 11, storageCode: 'NF', conveyable: false },
  { dept: 57, class: 1, item: 2, upc: '057010002000', name: 'Cat Food Dry Indoor 18lb', desc: 'Indoor dry cat food, hairball control, 18 lb bag', descShort: 'Cat Food Dry Indor 18lb', retailPrice: 24.99, cost: 11.00, packingZoneCode: 11, storageCode: 'NF', conveyable: false },
  { dept: 57, class: 1, item: 3, upc: '057010003000', name: 'Dog Food Wet Beef 13oz 12pk', desc: 'Beef and gravy wet dog food, 13 oz cans, 12 pack', descShort: 'Dog Food Wet Beef 12pk', retailPrice: 18.99, cost: 8.50, packingZoneCode: 11, storageCode: 'NF', conveyable: false },
  { dept: 57, class: 1, item: 4, upc: '057010004000', name: 'Cat Litter Clumping 40lb', desc: 'Clumping cat litter, unscented, multi-cat formula, 40 lb', descShort: 'Cat Litter Clmp 40lb', retailPrice: 19.99, cost: 8.75, packingZoneCode: 11, storageCode: 'NF', conveyable: false },
  { dept: 57, class: 1, item: 5, upc: '057010005000', name: 'Dog Treats Training 30oz', desc: 'Soft training dog treats, chicken flavor, 30 oz bag', descShort: 'Dog Treats Train 30oz', retailPrice: 12.99, cost: 5.75, packingZoneCode: 11, storageCode: 'NF', conveyable: false },
  { dept: 57, class: 1, item: 6, upc: '057010006000', name: 'Bird Seed Sunflower 20lb', desc: 'Black oil sunflower bird seed, 20 lb bag, attracts most birds', descShort: 'Bird Seed Sunflower 20lb', retailPrice: 15.99, cost: 7.00, packingZoneCode: 11, storageCode: 'NF', conveyable: false },
  { dept: 57, class: 1, item: 7, upc: '057010007000', name: 'Fish Food Flakes 4.52oz', desc: 'Tropical fish flakes, color enhancing formula, 4.52 oz', descShort: 'Fish Food Flakes 4.52oz', retailPrice: 7.49, cost: 3.00, packingZoneCode: 11, storageCode: 'NF', conveyable: false },
  { dept: 51, class: 2, item: 1, upc: '051020001000', name: 'Paper Towels 8 Double Rolls', desc: 'Paper towels, 2-ply, select-a-size, 8 double rolls', descShort: 'Paper Towels 8 Dbl Rolls', retailPrice: 11.99, cost: 5.25, packingZoneCode: 10, storageCode: 'NF', conveyable: false },
  { dept: 51, class: 2, item: 2, upc: '051020002000', name: 'Bath Tissue 18 Double Rolls', desc: 'Bathroom tissue, 2-ply, soft, 18 double rolls', descShort: 'Bath Tissue 18 Dbl Rolls', retailPrice: 14.99, cost: 6.50, packingZoneCode: 10, storageCode: 'NF', conveyable: false },
  { dept: 51, class: 2, item: 3, upc: '051020003000', name: 'Laundry Detergent Liquid 128oz', desc: 'Original clean liquid laundry detergent, 128 oz, 64 loads', descShort: 'Laundry Det Liq 128oz', retailPrice: 13.99, cost: 6.00, packingZoneCode: 10, storageCode: 'NF', conveyable: false },
  { dept: 51, class: 2, item: 4, upc: '051020004000', name: 'Dish Soap Original 90oz', desc: 'Original dish soap, cuts grease, 90 oz value size', descShort: 'Dish Soap Orig 90oz', retailPrice: 9.49, cost: 4.00, packingZoneCode: 10, storageCode: 'NF', conveyable: false },
  { dept: 51, class: 2, item: 5, upc: '051020005000', name: 'All-Purpose Cleaner 32oz 2pk', desc: 'All-purpose cleaner, citrus scent, 32 oz spray, 2 pack', descShort: 'APC Citrus 32oz 2pk', retailPrice: 7.99, cost: 3.25, packingZoneCode: 10, storageCode: 'NF', conveyable: false },
  { dept: 51, class: 2, item: 6, upc: '051020006000', name: 'Trash Bags 13gal 200ct', desc: 'Tall kitchen trash bags, 13 gallon, 200 count box', descShort: 'Trash Bags 13gal 200ct', retailPrice: 18.99, cost: 8.25, packingZoneCode: 10, storageCode: 'NF', conveyable: false },
  { dept: 51, class: 2, item: 7, upc: '051020007000', name: 'Zip Lock Bags Gallon 100ct', desc: 'Zip lock freezer bags, gallon size, 100 count box', descShort: 'Zip Bags Gallon 100ct', retailPrice: 9.99, cost: 4.25, packingZoneCode: 10, storageCode: 'NF', conveyable: false },

  // RF — Restricted Food (20)
  { dept: 54, class: 1, item: 1, upc: '054010001000', name: 'Wine Red Cabernet 750ml', desc: 'Cabernet Sauvignon red wine, 750ml bottle, California', descShort: 'Wine Red Cab Sauv 750ml', retailPrice: 12.99, cost: 5.75, packingZoneCode: 10, storageCode: 'RF', conveyable: true },
  { dept: 54, class: 1, item: 2, upc: '054010002000', name: 'Wine White Chardonnay 750ml', desc: 'Chardonnay white wine, 750ml bottle, buttery finish', descShort: 'Wine White Chard 750ml', retailPrice: 11.99, cost: 5.25, packingZoneCode: 10, storageCode: 'RF', conveyable: true },
  { dept: 54, class: 1, item: 3, upc: '054010003000', name: 'Wine Rose 750ml', desc: 'Dry rose wine, 750ml bottle, strawberry notes', descShort: 'Wine Rose Dry 750ml', retailPrice: 10.99, cost: 4.75, packingZoneCode: 10, storageCode: 'RF', conveyable: true },
  { dept: 54, class: 1, item: 4, upc: '054010004000', name: 'Beer Lager 12pk 12oz', desc: 'American lager beer, 12 oz cans, 12 pack', descShort: 'Lager Beer 12pk 12oz', retailPrice: 14.99, cost: 7.00, packingZoneCode: 10, storageCode: 'RF', conveyable: true },
  { dept: 54, class: 1, item: 5, upc: '054010005000', name: 'Beer IPA 6pk 12oz', desc: 'India pale ale, 12 oz bottles, 6 pack, hoppy finish', descShort: 'IPA Beer 6pk 12oz', retailPrice: 10.99, cost: 5.00, packingZoneCode: 10, storageCode: 'RF', conveyable: true },
  { dept: 54, class: 1, item: 6, upc: '054010006000', name: 'Hard Seltzer Variety 12pk', desc: 'Hard seltzer, assorted fruit flavors, 12 oz, 12 pack', descShort: 'Hard Seltzer Vty 12pk', retailPrice: 16.99, cost: 8.00, packingZoneCode: 10, storageCode: 'RF', conveyable: true },
  { dept: 54, class: 1, item: 7, upc: '054010007000', name: 'Cider Apple 6pk 12oz', desc: 'Hard apple cider, 12 oz bottles, 6 pack, crisp and refreshing', descShort: 'Cider Apple 6pk 12oz', retailPrice: 9.99, cost: 4.50, packingZoneCode: 10, storageCode: 'RF', conveyable: true },
  { dept: 54, class: 1, item: 8, upc: '054010008000', name: 'Wine Sparkling Brut 750ml', desc: 'Brut sparkling wine, 750ml, California, 12% ABV', descShort: 'Sparkling Wine Brut 750ml', retailPrice: 13.99, cost: 6.25, packingZoneCode: 10, storageCode: 'RF', conveyable: true },
  { dept: 54, class: 1, item: 9, upc: '054010009000', name: 'Beer Stout 6pk 12oz', desc: 'Oatmeal stout, 12 oz bottles, 6 pack, dark roasted', descShort: 'Stout Beer 6pk 12oz', retailPrice: 10.49, cost: 4.75, packingZoneCode: 10, storageCode: 'RF', conveyable: true },
  { dept: 54, class: 1, item: 10, upc: '054010010000', name: 'Wine Pinot Noir 750ml', desc: 'Pinot Noir red wine, 750ml, light-bodied, cherry notes', descShort: 'Wine Pinot Noir 750ml', retailPrice: 13.99, cost: 6.25, packingZoneCode: 10, storageCode: 'RF', conveyable: true },
  { dept: 59, class: 1, item: 1, upc: '059010001000', name: 'Butter Salted 4ct 1lb', desc: 'Salted butter, 4 sticks per pound, grade AA', descShort: 'Butter Salted 4ct 1lb', retailPrice: 5.49, cost: 2.50, packingZoneCode: 10, storageCode: 'RF', conveyable: true },
  { dept: 59, class: 1, item: 2, upc: '059010002000', name: 'Eggs Large White 18ct', desc: 'Grade A large white eggs, 18 count carton', descShort: 'Eggs Large White 18ct', retailPrice: 5.99, cost: 3.00, packingZoneCode: 10, storageCode: 'RF', conveyable: true },
  { dept: 59, class: 1, item: 3, upc: '059010003000', name: 'Milk Whole Gallon', desc: 'Whole milk, 1 gallon, vitamin D added, homogenized', descShort: 'Milk Whole 1gal', retailPrice: 4.49, cost: 2.25, packingZoneCode: 10, storageCode: 'RF', conveyable: true },
  { dept: 59, class: 1, item: 4, upc: '059010004000', name: 'Cheese Shredded 3-Cheese 32oz', desc: '3-cheese blend shredded cheese, 32 oz bag, refrigerated', descShort: 'Cheese Shred 3-Chz 32oz', retailPrice: 9.99, cost: 5.00, packingZoneCode: 10, storageCode: 'RF', conveyable: true },
  { dept: 59, class: 1, item: 5, upc: '059010005000', name: 'Yogurt Greek Plain 32oz', desc: 'Plain Greek yogurt, 32 oz tub, 2% milkfat, protein-rich', descShort: 'Yogurt Greek Plain 32oz', retailPrice: 6.99, cost: 3.50, packingZoneCode: 10, storageCode: 'RF', conveyable: true },
  { dept: 59, class: 1, item: 6, upc: '059010006000', name: 'Cream Cheese 3pk 8oz', desc: 'Original cream cheese, 8 oz blocks, 3 pack, refrigerated', descShort: 'Cream Cheese 3pk 8oz', retailPrice: 8.99, cost: 4.50, packingZoneCode: 10, storageCode: 'RF', conveyable: true },
  { dept: 59, class: 1, item: 7, upc: '059010007000', name: 'Orange Juice Chilled 89oz', desc: 'Not from concentrate chilled orange juice, 89 oz carton', descShort: 'OJ Chilled NFC 89oz', retailPrice: 7.49, cost: 3.75, packingZoneCode: 10, storageCode: 'RF', conveyable: true },
  { dept: 59, class: 1, item: 8, upc: '059010008000', name: 'Sour Cream 24oz', desc: 'Regular sour cream, 24 oz tub, refrigerated', descShort: 'Sour Cream 24oz', retailPrice: 3.99, cost: 2.00, packingZoneCode: 10, storageCode: 'RF', conveyable: true },
  { dept: 59, class: 1, item: 9, upc: '059010009000', name: 'Cheddar Cheese Block 32oz', desc: 'Sharp cheddar cheese block, 32 oz, aged 9 months', descShort: 'Cheddar Blk Sharp 32oz', retailPrice: 10.99, cost: 5.50, packingZoneCode: 10, storageCode: 'RF', conveyable: true },
  { dept: 59, class: 1, item: 10, upc: '059010010000', name: 'Bacon 16oz Thick Cut', desc: 'Thick cut bacon, naturally smoked, 16 oz package', descShort: 'Bacon Thick Cut 16oz', retailPrice: 8.99, cost: 4.50, packingZoneCode: 10, storageCode: 'RF', conveyable: true },

  // RS — Restricted Reserve (23)
  { dept: 78, class: 1, item: 1, upc: '078010001000', name: 'Smart Watch Fitness GPS', desc: 'Fitness GPS smart watch, heart rate monitor, 7-day battery', descShort: 'Smart Watch GPS Fitness', retailPrice: 79.99, cost: 36.00, packingZoneCode: 5, storageCode: 'RS', conveyable: false },
  { dept: 78, class: 1, item: 2, upc: '078010002000', name: 'Wireless Speaker Portable', desc: 'Portable bluetooth speaker, 360 sound, waterproof, 12hr battery', descShort: 'BT Speaker Portable WP', retailPrice: 49.99, cost: 22.00, packingZoneCode: 5, storageCode: 'RS', conveyable: false },
  { dept: 78, class: 1, item: 3, upc: '078010003000', name: 'Tablet 10in 64GB WiFi', desc: '10 inch tablet, 64GB storage, WiFi, front and rear cameras', descShort: 'Tablet 10in 64GB WiFi', retailPrice: 119.99, cost: 55.00, packingZoneCode: 5, storageCode: 'RS', conveyable: false },
  { dept: 78, class: 1, item: 4, upc: '078010004000', name: 'Wireless Headphones Over-Ear', desc: 'Over-ear wireless headphones, active noise cancelling, 30hr battery', descShort: 'Hdphones OE ANC 30hr', retailPrice: 59.99, cost: 27.00, packingZoneCode: 5, storageCode: 'RS', conveyable: false },
  { dept: 78, class: 1, item: 5, upc: '078010005000', name: 'Action Camera 4K Waterproof', desc: '4K action camera, waterproof to 30m, image stabilization, WiFi', descShort: 'Action Cam 4K WP 30m', retailPrice: 89.99, cost: 40.00, packingZoneCode: 5, storageCode: 'RS', conveyable: false },
  { dept: 78, class: 1, item: 6, upc: '078010006000', name: 'Smart Home Hub 4-Device Kit', desc: 'Smart home starter kit, hub and 4 smart plugs, voice assistant compatible', descShort: 'Smart Home Kit 4-Dev', retailPrice: 79.99, cost: 35.00, packingZoneCode: 5, storageCode: 'RS', conveyable: false },
  { dept: 78, class: 1, item: 7, upc: '078010007000', name: 'Digital Picture Frame 10in WiFi', desc: '10 inch digital picture frame, WiFi, cloud sync, touch screen', descShort: 'Digital Frame 10in WiFi', retailPrice: 69.99, cost: 31.00, packingZoneCode: 5, storageCode: 'RS', conveyable: false },
  { dept: 78, class: 1, item: 8, upc: '078010008000', name: 'Robot Vacuum Auto-Recharge', desc: 'Robot vacuum cleaner, auto-recharge, edge cleaning, 90min runtime', descShort: 'Robot Vacuum Auto-Rchg', retailPrice: 149.99, cost: 67.00, packingZoneCode: 6, storageCode: 'RS', conveyable: false },
  { dept: 87, class: 1, item: 1, upc: '087010001000', name: 'Gaming Controller Wireless', desc: 'Wireless gaming controller, compatible with PC and console, vibration', descShort: 'Gaming Controller Wirlss', retailPrice: 39.99, cost: 18.00, packingZoneCode: 8, storageCode: 'RS', conveyable: false },
  { dept: 87, class: 1, item: 2, upc: '087010002000', name: 'Gaming Headset 7.1 Surround', desc: '7.1 virtual surround gaming headset, USB, noise cancelling mic', descShort: 'Gaming Headset 7.1 USB', retailPrice: 49.99, cost: 22.00, packingZoneCode: 8, storageCode: 'RS', conveyable: false },
  { dept: 87, class: 1, item: 3, upc: '087010003000', name: 'Gaming Mouse Precision', desc: 'High precision gaming mouse, 12000 DPI, programmable buttons, RGB', descShort: 'Gaming Mouse 12000DPI', retailPrice: 34.99, cost: 15.50, packingZoneCode: 8, storageCode: 'RS', conveyable: false },
  { dept: 87, class: 1, item: 4, upc: '087010004000', name: 'Gaming Keyboard Mechanical', desc: 'Mechanical gaming keyboard, tactile switches, RGB backlit', descShort: 'Gaming KB Mech RGB', retailPrice: 59.99, cost: 27.00, packingZoneCode: 8, storageCode: 'RS', conveyable: false },
  { dept: 87, class: 1, item: 5, upc: '087010005000', name: 'Gaming Chair Racing Style', desc: 'Racing style gaming chair, lumbar support, reclining, black red', descShort: 'Gaming Chair Race Blk/Red', retailPrice: 179.99, cost: 80.00, packingZoneCode: 8, storageCode: 'RS', conveyable: false },
  { dept: 87, class: 1, item: 6, upc: '087010006000', name: 'Gaming Monitor 24in 144Hz', desc: '24 inch gaming monitor, 144Hz refresh rate, 1ms response, FHD', descShort: 'Gaming Mon 24in 144Hz', retailPrice: 199.99, cost: 90.00, packingZoneCode: 8, storageCode: 'RS', conveyable: false },
  { dept: 87, class: 1, item: 7, upc: '087010007000', name: 'VR Headset All-In-One', desc: 'All-in-one VR headset, 128GB, standalone, 6DOF tracking', descShort: 'VR Headset AIO 128GB', retailPrice: 299.99, cost: 135.00, packingZoneCode: 8, storageCode: 'RS', conveyable: false },
  { dept: 87, class: 1, item: 8, upc: '087010008000', name: 'Gift Card Gaming $50', desc: 'Digital gaming gift card, $50 value, major gaming platform', descShort: 'Gift Card Gaming $50', retailPrice: 50.00, cost: 48.00, packingZoneCode: 8, storageCode: 'RS', conveyable: false },
  { dept: 85, class: 1, item: 1, upc: '085010001000', name: 'Power Bank 20000mAh', desc: '20000mAh portable power bank, dual USB-C, fast charge 65W', descShort: 'Power Bank 20000mAh 65W', retailPrice: 39.99, cost: 17.50, packingZoneCode: 5, storageCode: 'RS', conveyable: false },
  { dept: 85, class: 1, item: 2, upc: '085010002000', name: 'Smart Thermostat WiFi', desc: 'WiFi smart thermostat, programmable, works with Alexa and Google', descShort: 'Smart Thermostat WiFi', retailPrice: 69.99, cost: 31.00, packingZoneCode: 5, storageCode: 'RS', conveyable: false },
  { dept: 85, class: 1, item: 3, upc: '085010003000', name: 'Security Camera Outdoor 2pk', desc: 'Outdoor security camera, 1080p, motion detection, 2 pack', descShort: 'Security Cam Outdoor 2pk', retailPrice: 89.99, cost: 40.00, packingZoneCode: 9, storageCode: 'RS', conveyable: false },
  { dept: 85, class: 1, item: 4, upc: '085010004000', name: 'Smart Doorbell Video WiFi', desc: 'Video doorbell, 1080p HD, WiFi, motion alerts, two-way audio', descShort: 'Doorbell Video WiFi HD', retailPrice: 79.99, cost: 35.00, packingZoneCode: 9, storageCode: 'RS', conveyable: false },
  { dept: 85, class: 1, item: 5, upc: '085010005000', name: 'Dash Cam Dual 4K Front Rear', desc: 'Dual dash cam, 4K front 1080p rear, night vision, GPS', descShort: 'Dash Cam Dual 4K F/R', retailPrice: 99.99, cost: 45.00, packingZoneCode: 5, storageCode: 'RS', conveyable: false },
  { dept: 85, class: 1, item: 6, upc: '085010006000', name: 'E-Reader 6in 16GB', desc: '6 inch e-reader, 16GB storage, backlit, waterproof, weeks of battery', descShort: 'E-Reader 6in 16GB WP', retailPrice: 99.99, cost: 45.00, packingZoneCode: 5, storageCode: 'RS', conveyable: false },
  { dept: 85, class: 1, item: 7, upc: '085010007000', name: 'Portable Projector Mini 1080p', desc: 'Mini 1080p portable projector, 200 ANSI lumens, HDMI and USB', descShort: 'Projector Mini 1080p', retailPrice: 129.99, cost: 58.00, packingZoneCode: 5, storageCode: 'RS', conveyable: false },

  // BS — Security (20)
  { dept: 79, class: 1, item: 1, upc: '079010001000', name: 'Diamond Stud Earrings .25ctw', desc: 'Diamond stud earrings, .25 carat total weight, 10K white gold', descShort: 'Diamond Studs .25ctw 10K', retailPrice: 199.99, cost: 110.00, packingZoneCode: 9, storageCode: 'BS', conveyable: false },
  { dept: 79, class: 1, item: 2, upc: '079010002000', name: 'Sterling Silver Necklace 18in', desc: '18 inch sterling silver chain necklace, 1.5mm box chain', descShort: 'S/S Necklace 18in Chain', retailPrice: 29.99, cost: 14.00, packingZoneCode: 9, storageCode: 'BS', conveyable: false },
  { dept: 79, class: 1, item: 3, upc: '079010003000', name: 'Gold Hoop Earrings 14K 1in', desc: '14K yellow gold hoop earrings, 1 inch diameter, high polish', descShort: 'Gold Hoops 14K 1in', retailPrice: 149.99, cost: 82.00, packingZoneCode: 9, storageCode: 'BS', conveyable: false },
  { dept: 79, class: 1, item: 4, upc: '079010004000', name: 'Watch Men Analog SS Bracelet', desc: "Men's analog watch, stainless steel bracelet, date window, water resistant", descShort: 'Watch Men Analog SS', retailPrice: 89.99, cost: 40.00, packingZoneCode: 9, storageCode: 'BS', conveyable: false },
  { dept: 79, class: 1, item: 5, upc: '079010005000', name: 'Watch Women Quartz Rose Gold', desc: "Women's quartz watch, rose gold tone case, leather band", descShort: 'Watch Women RG Leather', retailPrice: 79.99, cost: 35.00, packingZoneCode: 9, storageCode: 'BS', conveyable: false },
  { dept: 79, class: 1, item: 6, upc: '079010006000', name: 'Pearl Strand Necklace 16in', desc: '16 inch cultured pearl strand necklace, sterling silver clasp', descShort: 'Pearl Strand Necklace 16in', retailPrice: 59.99, cost: 28.00, packingZoneCode: 9, storageCode: 'BS', conveyable: false },
  { dept: 79, class: 1, item: 7, upc: '079010007000', name: 'Gemstone Ring Size 7 S/S', desc: 'Sterling silver gemstone cocktail ring, size 7, amethyst stone', descShort: 'Gemstone Ring Sz7 S/S', retailPrice: 49.99, cost: 22.00, packingZoneCode: 9, storageCode: 'BS', conveyable: false },
  { dept: 79, class: 1, item: 8, upc: '079010008000', name: 'Bracelet Beaded Natural Stone', desc: 'Natural stone beaded stretch bracelet, 7 inch, mixed stones', descShort: 'Bracelet Beaded Nat Stone', retailPrice: 19.99, cost: 8.50, packingZoneCode: 9, storageCode: 'BS', conveyable: false },
  { dept: 85, class: 2, item: 1, upc: '085020001000', name: 'Laptop 15in 512GB SSD', desc: '15.6 inch laptop, Intel i5, 8GB RAM, 512GB SSD, Windows 11', descShort: 'Laptop 15in i5 512GB', retailPrice: 499.99, cost: 280.00, packingZoneCode: 5, storageCode: 'BS', conveyable: false },
  { dept: 85, class: 2, item: 2, upc: '085020002000', name: 'Laptop 13in 256GB Ultrabook', desc: '13 inch ultrabook, Intel i7, 16GB RAM, 256GB SSD, touch screen', descShort: 'Laptop 13in i7 Touch', retailPrice: 699.99, cost: 395.00, packingZoneCode: 5, storageCode: 'BS', conveyable: false },
  { dept: 85, class: 2, item: 3, upc: '085020003000', name: 'Smartphone 128GB Unlocked', desc: 'Unlocked smartphone, 128GB, 6.1 inch display, triple camera system', descShort: 'Smartphone 128GB Unl', retailPrice: 449.99, cost: 250.00, packingZoneCode: 5, storageCode: 'BS', conveyable: false },
  { dept: 85, class: 2, item: 4, upc: '085020004000', name: 'Smartphone 256GB Unlocked', desc: 'Unlocked flagship smartphone, 256GB, 6.7 inch display, 5G', descShort: 'Smartphone 256GB 5G Unl', retailPrice: 649.99, cost: 365.00, packingZoneCode: 5, storageCode: 'BS', conveyable: false },
  { dept: 85, class: 2, item: 5, upc: '085020005000', name: 'Wireless Earbuds ANC Premium', desc: 'Premium true wireless earbuds, active noise cancelling, 36hr total', descShort: 'TWS Earbuds ANC 36hr', retailPrice: 149.99, cost: 68.00, packingZoneCode: 5, storageCode: 'BS', conveyable: false },
  { dept: 85, class: 2, item: 6, upc: '085020006000', name: 'Smart Watch Premium GPS AMOLED', desc: 'Premium GPS smart watch, AMOLED display, health sensors, 14-day battery', descShort: 'Smart Watch Premium GPS', retailPrice: 249.99, cost: 115.00, packingZoneCode: 5, storageCode: 'BS', conveyable: false },
  { dept: 85, class: 2, item: 7, upc: '085020007000', name: 'Tablet Pro 12in 128GB LTE', desc: '12 inch pro tablet, 128GB, LTE cellular, stylus compatible', descShort: 'Tablet Pro 12in 128GB LTE', retailPrice: 399.99, cost: 225.00, packingZoneCode: 5, storageCode: 'BS', conveyable: false },
  { dept: 85, class: 2, item: 8, upc: '085020008000', name: 'Gift Card Visa $100', desc: 'Visa prepaid gift card, $100 value, no fees after purchase', descShort: 'Gift Card Visa $100', retailPrice: 100.00, cost: 99.00, packingZoneCode: 9, storageCode: 'BS', conveyable: false },
  { dept: 85, class: 2, item: 9, upc: '085020009000', name: 'Gift Card Visa $50', desc: 'Visa prepaid gift card, $50 value, no fees after purchase', descShort: 'Gift Card Visa $50', retailPrice: 50.00, cost: 49.00, packingZoneCode: 9, storageCode: 'BS', conveyable: false },
  { dept: 85, class: 2, item: 10, upc: '085020010000', name: 'Gift Card Visa $25', desc: 'Visa prepaid gift card, $25 value, no fees after purchase', descShort: 'Gift Card Visa $25', retailPrice: 25.00, cost: 24.00, packingZoneCode: 9, storageCode: 'BS', conveyable: false },
  { dept: 85, class: 2, item: 11, upc: '085020011000', name: 'Drone Foldable 4K Camera', desc: 'Foldable drone with 4K camera, 30min flight time, obstacle avoidance', descShort: 'Drone Foldable 4K 30min', retailPrice: 299.99, cost: 135.00, packingZoneCode: 5, storageCode: 'BS', conveyable: false },
  { dept: 85, class: 2, item: 12, upc: '085020012000', name: 'Mirrorless Camera 24MP Kit', desc: '24MP mirrorless camera kit with 16-50mm lens, 4K video', descShort: 'Mirrorless Cam 24MP Kit', retailPrice: 649.99, cost: 365.00, packingZoneCode: 5, storageCode: 'BS', conveyable: false },
]

// Group items by storage code for lookup during pallet generation
const itemsByStorageCode: Record<string, ItemDef[]> = {}
for (const item of ITEMS) {
  if (!itemsByStorageCode[item.storageCode]) itemsByStorageCode[item.storageCode] = []
  itemsByStorageCode[item.storageCode].push(item)
}

// ─── Location + Pallet generation ────────────────────────────────────────────

type LocationRow = {
  aisle: number; bin: number; level: number; zone: number
  status: string; holdTypeCode: null; storageCode: string; size: string
  contraction: boolean
}

/**
 * Contraction rules for seeded locations, per direct instruction:
 *   1. Every Level 1 location that isn't XS-size and isn't in a BS/RF/RS-storage-code
 *      aisle gets contracted. (XS is hand-put, always Carton Air regardless of level —
 *      same carve-out `assignPullFunction` and the pull-function table elsewhere in this
 *      app already use for that reason. BS/RF/RS only ever occur on aisles 303/701/702/
 *      801/802/803, none of which are part of the standard repeating-pattern range rules
 *      2/3 below apply to.)
 *   2. "Small" aisles — the repeating-pattern 'S' type (8 physical levels), standard
 *      304-338 range only — get their Level 8, odd-bin side contracted.
 *   3. "HS" aisles — the repeating-pattern 'HS' type (10 physical levels), standard
 *      304-338 range only — get Levels 7-10, even-bin side contracted.
 * Rules 2/3 are deliberately scoped to the 304-338 repeating-pattern range, where
 * `getAisleType`'s L/M/S/HS classification is actually meaningful (it isn't defined
 * outside that range) — 801/802/803 also have 10 physical levels but are a different,
 * always-XS special case already excluded by rule 1's XS carve-out.
 */
function isContractedLocation(aisle: number, bin: number, level: number, size: string, storageCode: string): boolean {
  if (level === 1 && size !== 'XS' && !['BS', 'RF', 'RS'].includes(storageCode)) return true

  if (aisle >= 304 && aisle <= 338) {
    const type = getAisleType(aisle)
    if (type === 'S' && level === 8 && bin % 2 === 1) return true
    if (type === 'HS' && level >= 7 && level <= 10 && bin % 2 === 0) return true
  }

  return false
}

type PalletRow = {
  pid: number; dept: number; class: number; item: number
  receivedPallets: number; currentPallets: number
  receivedCartons: number; currentCartons: number
  receivedSSPs: number; currentSSPs: number
  vcp: number; ssp: number; status: string
  locationAisle: number; locationBin: number; locationLevel: number
  storageCode: string; size: string; zone: number
  receivedByZ: string; receivedAt: Date
  putByZ: string; putAt: Date
  lastPulledByZ: null; lastPulledAt: null
  // Every pallet this generator builds represents a "received via inbound" pallet — no real
  // Inbound receiving flow exists yet, so DEMO1234 is a placeholder for both (a manually
  // PAR-created pallet gets null instead — see pallets.ts's reinstate handler).
  // expirationDate stays null even for food items; only ever set by a worker via PII's Edit
  // Mode.
  poNumber: string; apptNumber: string
}

const VCP_OPTIONS = [6, 8, 10, 12, 16, 20, 24]

/** Generates every Location row (and a STORED Pallet for ~90% of them) across all aisles. */
function buildLocationsAndPallets() {
  const locations: LocationRow[] = []
  const pallets: PalletRow[] = []

  /** Generates every (bin, level) Location in one aisle, plus a Pallet for stored ones. */
  function addAisle(
    aisle: number,
    bins: number[],
    maxLevel: number,
    zoneOf: (bin: number) => number,
    sizeOf: (level: number) => string,
    scOf: (bin: number, level: number) => string,
  ) {
    for (const bin of bins) {
      for (let level = 1; level <= maxLevel; level++) {
        const zone = zoneOf(bin)
        const size = sizeOf(level)
        const storageCode = scOf(bin, level)
        const stored = Math.random() < 0.9

        const contraction = isContractedLocation(aisle, bin, level, size, storageCode)
        locations.push({ aisle, bin, level, zone, status: stored ? 'STORED' : 'EMPTY', holdTypeCode: null, storageCode, size, contraction })

        if (stored) {
          const itemPool = itemsByStorageCode[storageCode]
          if (!itemPool?.length) return
          const itm = randomFrom(itemPool)
          const pid = genPid()
          const vcp = randomFrom(VCP_OPTIONS)
          const ssp = Math.random() < 0.5 ? vcp : vcp / 2
          const cartons = randomInt(1, 20)
          // 60% of locations are carton-only (pallet has been broken); 40% still have a full pallet unit.
          const hasFullPallet = Math.random() < 0.4 ? 1 : 0
          const receivedAt = randomDate(365)
          const putAt = new Date(receivedAt.getTime() + randomInt(1, 8) * 3_600_000)

          pallets.push({
            pid,
            dept: itm.dept, class: itm.class, item: itm.item,
            receivedPallets: hasFullPallet, currentPallets: hasFullPallet,
            receivedCartons: cartons, currentCartons: cartons,
            receivedSSPs: 0, currentSSPs: 0,
            vcp, ssp, status: 'STORED',
            locationAisle: aisle, locationBin: bin, locationLevel: level,
            storageCode, size, zone,
            receivedByZ: 'z002p21', receivedAt,
            putByZ: 'z002p22', putAt,
            lastPulledByZ: null, lastPulledAt: null,
            poNumber: 'DEMO1234', apptNumber: 'DEMO1234',
          })
        }
      }
    }
  }

  // Standard aisles 304-338
  const stdBins = Array.from({ length: 128 }, (_, i) => i + 1)
  for (let aisle = 304; aisle <= 338; aisle++) {
    const maxLvl = getMaxLevel(aisle)
    addAisle(aisle, stdBins, maxLvl,
      getZone128,
      (lvl) => getSize(aisle, lvl),
      (_bin, lvl) => getStorageCode(aisle, 0, lvl),
    )
  }

  // Aisle 301 — XS, 192 bins, 13 levels
  const bins192 = Array.from({ length: 192 }, (_, i) => i + 1)
  addAisle(301, bins192, 13, getZone192,
    () => 'XS',
    (_b, lvl) => getStorageCode(301, _b, lvl),
  )

  // Aisle 302 — XS, 192 bins, 13 levels, zone+level based SC
  addAisle(302, bins192, 13, getZone192,
    () => 'XS',
    (b, lvl) => getStorageCode(302, b, lvl),
  )

  // Aisle 303 — bins 33-128, 6 levels, BS
  const bins33to128 = Array.from({ length: 96 }, (_, i) => i + 33)
  addAisle(303, bins33to128, 6, getZone128,
    (lvl) => getSize(303, lvl),
    () => 'BS',
  )

  // Aisle 701 — even bins 34-128, 6 levels, RF
  const binsEven34to128 = Array.from({ length: 48 }, (_, i) => 34 + i * 2)
  addAisle(701, binsEven34to128, 6, getZone128,
    (lvl) => getSize(701, lvl),
    () => 'RF',
  )

  // Aisle 702 — odd bins 33-127, 6 levels, RS
  const binsOdd33to127 = Array.from({ length: 48 }, (_, i) => 33 + i * 2)
  addAisle(702, binsOdd33to127, 6, getZone128,
    (lvl) => getSize(702, lvl),
    () => 'RS',
  )

  // Aisle 801 — 42 bins, 10 levels, RF, zone 1
  const bins1to42 = Array.from({ length: 42 }, (_, i) => i + 1)
  addAisle(801, bins1to42, 10, () => 1, () => 'XS', () => 'RF')

  // Aisle 802 — 42 bins, 10 levels, RS, zone 1
  addAisle(802, bins1to42, 10, () => 1, () => 'XS', () => 'RS')

  // Aisle 803 — 84 bins, 10 levels, BS, zone 1
  const bins1to84 = Array.from({ length: 84 }, (_, i) => i + 1)
  addAisle(803, bins1to84, 10, () => 1, () => 'XS', () => 'BS')

  const staged = applyStaging(locations)

  return { locations, pallets, staged }
}

/**
 * Multi-occupant demo data (issue #87 / LII v1.6.9's "Multiple Pallet IDs" status
 * picker). Normal seeding above gives each STORED location at most one occupant pallet —
 * a second pallet legitimately sharing a location only happens via MNP's dual-occupancy
 * "Proceed Anyway" override (v1.6.3), which never runs during seeding, so nothing above
 * ever produces one. This generates it explicitly: 10 already-STORED locations get one
 * extra occupant (2 total), 10 get three extra (4 total). Each occupant at a given
 * location always carries a distinct DPCI — never the same item twice in one location —
 * so LII's pallet-paging UI has something meaningfully different to page through, not
 * duplicate rows. Extra pallets copy their base location's storageCode/size/zone (same
 * "pallet always inherits from wherever it's STORED" rule every other pallet follows)
 * and get fresh unique pids via genPid().
 *
 * @param pallets - every already-generated STORED pallet (each still the sole occupant
 *   of its own location at this point) — used both as the pool of candidate locations to
 *   double/quadruple up and as the source of each location's already-used DPCI to avoid
 *   colliding with.
 * @returns Additional PalletRow entries only — callers append these to the main `pallets`
 *   array before insertion; the base occupant pallets themselves are untouched.
 */
function addMultiOccupancyPallets(pallets: PalletRow[]): PalletRow[] {
  const extra: PalletRow[] = []
  const TARGET_COUNTS = [...Array<number>(10).fill(2), ...Array<number>(10).fill(4)]

  // Only locations whose storage code stocks enough distinct items to give every
  // occupant (up to 4) a unique DPCI — avoids ever reusing an item at one location.
  const eligible = shuffle(pallets.filter((p) => (itemsByStorageCode[p.storageCode]?.length ?? 0) >= 4))

  TARGET_COUNTS.forEach((targetCount, i) => {
    const base = eligible[i]
    if (!base) return // fewer eligible locations than requested — dataset too small, skip the rest

    const usedItems = new Set([`${base.dept}-${base.class}-${base.item}`])
    const candidatePool = shuffle(itemsByStorageCode[base.storageCode])

    let added = 0
    for (const itm of candidatePool) {
      if (added >= targetCount - 1) break
      const key = `${itm.dept}-${itm.class}-${itm.item}`
      if (usedItems.has(key)) continue
      usedItems.add(key)
      added++

      const vcp = randomFrom(VCP_OPTIONS)
      const ssp = Math.random() < 0.5 ? vcp : vcp / 2
      const cartons = randomInt(1, 20)
      const hasFullPallet = Math.random() < 0.4 ? 1 : 0
      const receivedAt = randomDate(365)
      const putAt = new Date(receivedAt.getTime() + randomInt(1, 8) * 3_600_000)

      extra.push({
        pid: genPid(),
        dept: itm.dept, class: itm.class, item: itm.item,
        receivedPallets: hasFullPallet, currentPallets: hasFullPallet,
        receivedCartons: cartons, currentCartons: cartons,
        receivedSSPs: 0, currentSSPs: 0,
        vcp, ssp, status: 'STORED',
        locationAisle: base.locationAisle, locationBin: base.locationBin, locationLevel: base.locationLevel,
        storageCode: base.storageCode, size: base.size, zone: base.zone,
        receivedByZ: 'z002p21', receivedAt,
        putByZ: 'z002p22', putAt,
        lastPulledByZ: null, lastPulledAt: null,
        poNumber: 'DEMO1234', apptNumber: 'DEMO1234',
      })
    }
  })

  return extra
}

/** One location staged by `applyStaging`, carried forward so a matching ActivityLog
 *  entry (issue #52) can be generated for it after locations are inserted. */
type StagedLocation = { aisle: number; bin: number; level: number; storageCode: string; size: string }

/**
 * Demo staging data: converts a portion of each designated aisle's EMPTY locations to
 * STAGED, so the STG/ELZ screens have something realistic to show out of the box. XS
 * aisles (301/302/801/802/803) are excluded — XS is always CA pull regardless of level
 * and isn't part of the staging workflow. One aisle (304) is staged 100% (fully staged);
 * the rest are staged at varied percentages for visual variety across a demo.
 *
 * Fill order matches `findNextStagingLocation` (api/lib/stagingLogic.ts) exactly — highest
 * bin first, then lowest level within a bin — since that's the real order a GPMer would
 * fill an aisle from the back, not a random scatter.
 *
 * @returns every location just staged, for `buildStagingActivityLog` to generate a
 *   matching ActivityLog STAGE entry against — SAR (Staged Aisle Report) derives a
 *   location's "staged since" age from that log, not from any column on Location itself.
 */
function applyStaging(locations: LocationRow[]): StagedLocation[] {
  const STAGED_AISLES: Record<number, number> = {
    304: 1.00, // L / CR — fully staged
    306: 0.25, // M / CR
    307: 0.40, // S / CR
    310: 0.55, // HS / CR
    313: 0.70, // M / FD
    318: 0.85, // L / BK
    303: 0.35, // mixed L/M/S/HS / BS
    701: 0.60, // mixed / RF
  }

  const staged: StagedLocation[] = []
  for (const [aisleStr, pct] of Object.entries(STAGED_AISLES)) {
    const aisle = Number(aisleStr)
    const empties = locations
      .filter((l) => l.aisle === aisle && l.status === 'EMPTY')
      .sort((a, b) => b.bin - a.bin || a.level - b.level)

    const stageCount = Math.round(empties.length * pct)
    for (let i = 0; i < stageCount; i++) {
      empties[i].status = 'STAGED'
      staged.push({ aisle, bin: empties[i].bin, level: empties[i].level, storageCode: empties[i].storageCode, size: empties[i].size })
    }
  }
  return staged
}

/**
 * Builds one ActivityLog STAGE row per staged location (issue #52), with a realistic
 * timestamp instead of "just now" — SAR's oldest-staged-location age otherwise reads as
 * age-zero for the entire demo dataset, which doesn't look like real usage. Timestamps
 * are random within the last 8 hours, except for 1-2 "outlier" locations per staged
 * aisle seeded further back (1-3 days) for variety, matching how a real aisle would have
 * some long-sitting staged pallets mixed in with recent ones. `userId` is randomized
 * across the seeded demo users, since staging is accessible to every role.
 */
function buildStagingActivityLog(staged: StagedLocation[]) {
  const now = Date.now()
  const HOUR = 60 * 60 * 1000
  const userPool = ['z002p21', 'z002p22', 'z002p23', 'z002p24', 'z002p25']

  // Group by aisle so each aisle gets its own 1-2 outliers, not a global pool of them.
  const byAisle = new Map<number, StagedLocation[]>()
  for (const loc of staged) {
    if (!byAisle.has(loc.aisle)) byAisle.set(loc.aisle, [])
    byAisle.get(loc.aisle)!.push(loc)
  }

  const rows: { userId: string; actionType: string; locationAisle: number; locationBin: number; locationLevel: number; details: string; timestamp: Date }[] = []
  for (const locs of byAisle.values()) {
    const outlierCount = Math.min(locs.length, randomInt(1, 2))
    const outlierIndexes = new Set<number>()
    while (outlierIndexes.size < outlierCount) outlierIndexes.add(randomInt(0, locs.length - 1))

    locs.forEach((loc, i) => {
      const timestamp = outlierIndexes.has(i)
        ? new Date(now - randomInt(24, 72) * HOUR) // 1-3 days back
        : new Date(now - randomInt(0, 8 * 60 - 1) * 60_000) // last 8 hours
      rows.push({
        userId: randomFrom(userPool),
        actionType: 'STAGE',
        locationAisle: loc.aisle,
        locationBin: loc.bin,
        locationLevel: loc.level,
        details: JSON.stringify({ storageCode: loc.storageCode, size: loc.size }),
        timestamp,
      })
    })
  }
  return rows
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function insertInChunks<T extends object>(
  label: string,
  data: T[],
  chunkSize: number,
  insertFn: (chunk: T[]) => Promise<unknown>,
) {
  console.log(`Seeding ${data.length} ${label}...`)
  for (let i = 0; i < data.length; i += chunkSize) {
    await insertFn(data.slice(i, i + chunkSize))
  }
}

/** Entry point: clears all tables and reseeds the full demo dataset from scratch. */
async function main() {
  // Clear all tables in reverse FK order so the seed is safe to re-run
  console.log('Clearing existing data...')
  await prisma.activityLog.deleteMany()
  await prisma.label.deleteMany()
  await prisma.reservation.deleteMany()
  await prisma.pallet.deleteMany()
  await prisma.location.deleteMany()
  await prisma.user.deleteMany()
  await prisma.item.deleteMany()
  await prisma.store.deleteMany()
  await prisma.holdType.deleteMany()
  await prisma.department.deleteMany()
  await prisma.packingZone.deleteMany()
  await prisma.storageCode.deleteMany()

  const PIN_HASH = await bcrypt.hash('1234', 10)

  // 1. Lookup tables
  console.log('Seeding lookup tables...')
  await prisma.storageCode.createMany({ data: STORAGE_CODES })
  await prisma.packingZone.createMany({ data: PACKING_ZONES })
  await prisma.department.createMany({ data: DEPARTMENTS })
  await prisma.holdType.createMany({ data: HOLD_TYPES })
  await prisma.store.createMany({ data: STORES })

  // 2. Users
  console.log('Seeding users...')
  await prisma.user.createMany({
    data: [
      { zNumber: 'z002p25', firstName: 'Robert',  lastName: 'Breutzmann', pinHash: PIN_HASH, role: 'ADMIN',   departmentId: 'WHS' },
      { zNumber: 'z002p24', firstName: 'Diana',   lastName: 'Kowalski',   pinHash: PIN_HASH, role: 'MANAGER', departmentId: 'IQA' },
      { zNumber: 'z002p23', firstName: 'Marcus',  lastName: 'Webb',       pinHash: PIN_HASH, role: 'LEAD',    departmentId: 'WHS' },
      { zNumber: 'z002p22', firstName: 'Sarah',   lastName: 'Okafor',     pinHash: PIN_HASH, role: 'IM',      departmentId: 'WHS' },
      { zNumber: 'z002p21', firstName: 'Tyler',   lastName: 'Hennessey',  pinHash: PIN_HASH, role: 'WORKER',  departmentId: 'INB' },
    ],
  })

  // 3. Items
  // requiresExpirationDate is a real per-DPCI setting (not derived from Storage Code at
  // runtime), but the food Storage Codes (FD/NF/RF — see seed-reference.md) are a
  // reasonable default population for this demo dataset's ~200 items rather than hand-
  // flagging each one individually.
  const FOOD_STORAGE_CODES = ['FD', 'NF', 'RF']
  await insertInChunks('items', ITEMS.map(({ retailPrice, cost, ...rest }) => ({
    ...rest,
    retailPrice: String(retailPrice),
    cost: String(cost),
    requiresExpirationDate: FOOD_STORAGE_CODES.includes(rest.storageCode),
    unitWeight: randomUnitWeight(),
  })), 100, (chunk) => prisma.item.createMany({ data: chunk as Parameters<typeof prisma.item.createMany>[0]['data'] }))

  // 4. Locations + Pallets
  const { locations, pallets, staged } = buildLocationsAndPallets()

  await insertInChunks('locations', locations, 500,
    (chunk) => prisma.location.createMany({ data: chunk })
  )

  // 4b. Staging activity log (issue #52) — gives SAR realistic "staged since" ages
  // instead of every seeded staged location reading as age-zero.
  await insertInChunks('staging activity log entries', buildStagingActivityLog(staged), 500,
    (chunk) => prisma.activityLog.createMany({ data: chunk })
  )

  // 4c. Multi-occupant locations (issue #87 / LII v1.6.9) — 10 locations get a 2nd
  // pallet, 10 get 3 more (4 total), each with a distinct DPCI. See that function's doc
  // comment for the full rationale.
  const multiOccupancyPallets = addMultiOccupancyPallets(pallets)
  pallets.push(...multiOccupancyPallets)
  console.log(`  Multi-occupant locations: ${multiOccupancyPallets.length} extra pallets across 20 locations`)

  await insertInChunks('pallets', pallets, 500,
    (chunk) => prisma.pallet.createMany({ data: chunk })
  )

  // 5. Labels — handful across first few stored pallets, varying statuses
  console.log('Seeding labels...')
  const today = new Date()
  const batchToday = julianDate(today)
  const purgeDate = new Date(today.getTime() + 7 * 86_400_000)
  const pastPurge = new Date(today.getTime() - 1 * 86_400_000) // expired yesterday

  const labelPallets = pallets.slice(0, 8)
  const labelStatuses = ['AVAILABLE', 'AVAILABLE', 'AVAILABLE', 'PRINTED', 'PULLED', 'PULLED', 'CANCELED', 'PURGED']
  const store = STORES[0]

  const labelData = labelPallets.map((p, i) => {
    const isPurged = labelStatuses[i] === 'PURGED'
    const qty = randomInt(1, Math.max(1, p.currentCartons - 1))
    // Determine pull function from location attributes seeded above.
    // The pallet's location level and size aren't directly on the pallet row here,
    // so default to CA (most common); seed-labels.ts applies the full rule set.
    return {
      lid: genLid(store.id, p.dept, p.class, p.item, p.pid, batchToday),
      pid: p.pid,
      dept: p.dept,
      class: p.class,
      item: p.item,
      quantity: qty,
      sspQuantity: 0,
      batchDate: batchToday,
      purgeDate: isPurged ? pastPurge : purgeDate,
      destinationStore: store.id,
      status: labelStatuses[i],
      pullFunction: 'CA',
    }
  })

  await prisma.label.createMany({ data: labelData })

  console.log('Seed complete.')
  console.log(`  Locations: ${locations.length}`)
  console.log(`  Pallets:   ${pallets.length}`)
  console.log(`  Labels:    ${labelData.length}`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
