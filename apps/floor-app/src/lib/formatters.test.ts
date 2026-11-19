// Unit tests for the floor app's pure formatters and lookup tables (test plan Part 3, #238).
import { describe, expect, it } from 'vitest'
import { getBatchDate, getDisplayDate, getDisplayTime } from './julianDate'
import { fmtLocation, fmtDpci } from './fmt'
import { fmtClock, fmt1, fmtPct, goalBg, FUNCTION_META } from './irpFormat'
import { printerTypeOf, PRINTER_PREFIXES, DEFAULT_PRINTER } from './printerPrefixes'
import { SIZES, SIZE_NAMES, SIZE_WEIGHTS } from './sizes'
import { STORAGE_CODE_COLORS, STORAGE_CODE_COLOR_FALLBACK } from './storageCodeColors'
import { resolveJump, JUMP_CODES, COMMON_SHORTCUTS } from './jumpCodes'
import { splitReasonCode, combineReasonCode } from './reasonCode'
import { groupBreakdownByStorageCode } from './zoneSummary'

describe('julianDate', () => {
  it('batch date is "BD yyddd" with the day of year', () => {
    expect(getBatchDate(new Date(2026, 0, 1))).toBe('BD 26001')
    expect(getBatchDate(new Date(2026, 10, 19))).toBe('BD 26323')
    expect(getBatchDate(new Date(2024, 11, 31))).toBe('BD 24366') // leap year
  })
  it('display date and time are US-formatted', () => {
    const d = new Date(2026, 10, 19, 14, 5)
    expect(getDisplayDate(d)).toBe('November 19')
    expect(getDisplayTime(d)).toMatch(/^2:05\sPM$/)
  })
})

describe('fmt', () => {
  it('formats location ids and DPCIs', () => {
    expect(fmtLocation('31812706')).toBe('318-127-06')
    expect(fmtLocation('318127')).toBe('318-127')
    expect(fmtDpci({ dept: 1, class: 2, item: 3 })).toBe('001-02-0003')
  })
})

describe('irpFormat', () => {
  it('fmtClock: 12-hour clock with AM/PM, midnight and noon as 12', () => {
    expect(fmtClock(new Date(2026, 0, 1, 0, 7).toISOString())).toBe('12:07AM')
    expect(fmtClock(new Date(2026, 0, 1, 12, 0).toISOString())).toBe('12:00PM')
    expect(fmtClock(new Date(2026, 0, 1, 15, 30).toISOString())).toBe('3:30PM')
  })
  it('fmt1 / fmtPct show a dash for no value', () => {
    expect(fmt1(null)).toBe('—')
    expect(fmt1(2.345)).toBe('2.3')
    expect(fmtPct(null)).toBe('—')
    expect(fmtPct(0.756)).toBe('76%')
  })
  it('goalBg: five bands by quarter, clamped, grey for no value', () => {
    expect(goalBg(null)).toContain('#2A2A2A')
    expect(goalBg(1.4)).toContain('#1B5E20')
    expect(goalBg(1)).toContain('#1B5E20')
    expect(goalBg(0.8)).toContain('#4C7A1F')
    expect(goalBg(0.5)).toContain('#8A7A1A')
    expect(goalBg(0.3)).toContain('#8A5A1A')
    expect(goalBg(-1)).toContain('#7A2A1A')
  })
  it('names every IRP function', () => {
    expect(Object.keys(FUNCTION_META)).toEqual(['CA', 'CF', 'FP', 'BKP', 'BK', 'RP', 'HP', 'GPM', 'CON'])
  })
})

describe('printerPrefixes', () => {
  it('maps a printer code to its type by longest listed prefix first', () => {
    expect(printerTypeOf('OCL0')).toBe('Label Hut')
    expect(printerTypeOf('obp3')).toBe('Backpack Label Hut')
    expect(printerTypeOf('A12')).toBe('Aisle')
    expect(printerTypeOf('R5')).toBe('Door')
    expect(printerTypeOf('ZZ9')).toBeNull()
  })
  it('the default printer is a Label Hut printer', () => {
    expect(printerTypeOf(DEFAULT_PRINTER)).toBe('Label Hut')
    expect(PRINTER_PREFIXES.length).toBeGreaterThan(0)
  })
})

describe('lookup tables', () => {
  it('sizes run smallest to largest with names and weights', () => {
    expect(SIZES).toEqual(['XS', 'HS', 'S', 'M', 'L'])
    for (const s of SIZES) {
      expect(SIZE_NAMES[s]).toBeTruthy()
      expect(SIZE_WEIGHTS[s]).toBeGreaterThan(0)
    }
    expect(SIZE_WEIGHTS.L).toBe(1)
  })
  it('storage codes have distinct colors and a fallback', () => {
    const colors = Object.values(STORAGE_CODE_COLORS)
    expect(new Set(colors).size).toBe(colors.length)
    expect(STORAGE_CODE_COLOR_FALLBACK).toMatch(/^#[0-9A-F]{6}$/i)
  })
})

describe('jumpCodes', () => {
  it('resolves codes case-insensitively; unknown is null', () => {
    expect(resolveJump('pip')?.route).toBe('/pull')
    expect(resolveJump('MMN')?.route).toBe('/')
    expect(resolveJump('XYZ')).toBeNull()
  })
  it('every code is keyed by itself; common shortcuts are built screens', () => {
    for (const [key, jc] of Object.entries(JUMP_CODES)) expect(jc.code).toBe(key)
    for (const jc of COMMON_SHORTCUTS) expect(jc.built).toBe(true)
  })
})

describe('reasonCode', () => {
  it('splits and combines prefix + number', () => {
    expect(splitReasonCode('W70')).toEqual({ prefix: 'W', number: '70' })
    expect(splitReasonCode('')).toEqual({ prefix: '', number: '' })
    expect(combineReasonCode('W', '70')).toBe('W70')
  })
})

describe('zoneSummary', () => {
  it('groups by storage code (alphabetical), sizes largest first', () => {
    const cols = groupBreakdownByStorageCode([
      { storageCode: 'FD', size: 'S', empty: 1, staged: 0 },
      { storageCode: 'CR', size: 'XS', empty: 2, staged: 1 },
      { storageCode: 'CR', size: 'L', empty: 3, staged: 0 },
      { storageCode: 'CR', size: 'M', empty: 0, staged: 2 },
    ])
    expect(cols.map((c) => c.storageCode)).toEqual(['CR', 'FD'])
    expect(cols[0].entries.map((e) => e.size)).toEqual(['L', 'M', 'XS'])
  })
  it('empty input gives no columns', () => {
    expect(groupBreakdownByStorageCode([])).toEqual([])
  })
})
