// Unit tests for the Activity Log formatter (#238): visibility, tags, severity and the
// tokenized detail lines (ids become tappable tokens).
import { describe, expect, it } from 'vitest'
import { isVisibleActivity, tagFor, severityFor, severityColorClass, detailFor, type ActivityEntry, type DetailLine } from './activityFormat'

function entry(actionType: string, details: Record<string, unknown> | null = null, over: Partial<ActivityEntry> = {}): ActivityEntry {
  return {
    id: 1, timestamp: '2026-11-19T12:00:00Z', userId: 'z002p21', actionType, palletId: 12345678, locationAisle: 304,
    location: '30401203', dpci: '001-02-0003', reasonPrefix: null, reasonNumber: null, details, ...over,
  }
}
/** A detail line as plain text, with id tokens shown as [type:id]. */
const text = (line: DetailLine) => line.map((t) => (typeof t === 'string' ? t : `[${t.type}:${t.id}]`)).join('')

describe('visibility and tags', () => {
  it('hides bookkeeping rows', () => {
    for (const t of ['RESERVE', 'MNP_SCAN', 'RES_TMOUT', 'STAGE']) expect(isVisibleActivity(entry(t))).toBe(false)
    expect(isVisibleActivity(entry('PUT'))).toBe(true)
  })
  it('maps action types to screen tags; unknown types use their first four letters', () => {
    expect(tagFor(entry('HOLD_PLACE'))).toBe('WLH')
    expect(tagFor(entry('EDIT_PAL'))).toBe('PII')
    expect(tagFor(entry('AISLE_ADD'))).toBe('LSE')
    expect(tagFor(entry('SOMETHING'))).toBe('SOME')
  })
})

describe('severityFor', () => {
  it('pulls, staging and reinstates are successes', () => {
    for (const t of ['PULL', 'STAGE_SUM', 'REINSTATE']) expect(severityFor(entry(t))).toBe('success')
  })
  it('a put is a warning when it moved a pallet or landed on an occupied MNP location', () => {
    expect(severityFor(entry('PUT', {}))).toBe('success')
    expect(severityFor(entry('PUT', { wasMove: true }))).toBe('warning')
    expect(severityFor(entry('PUT', { wasMove: true, consolidating: true }))).toBe('success')
    expect(severityFor(entry('PUT', { method: 'MNP', destinationWasOccupied: true }))).toBe('warning')
  })
  it('a restage that only cleared is a warning', () => {
    expect(severityFor(entry('RESTAGE', { results: [{ cleared: 3, staged: 0 }] }))).toBe('warning')
    expect(severityFor(entry('RESTAGE', { results: [{ cleared: 3, staged: 1 }] }))).toBe('success')
  })
  it('holds warn, timeouts error, edits inform', () => {
    expect(severityFor(entry('HOLD_PLACE'))).toBe('warning')
    expect(severityFor(entry('RES_TMOUT'))).toBe('error')
    expect(severityFor(entry('EDIT_PAL'))).toBe('info')
    expect(severityFor(entry('WHATEVER'))).toBe('info')
    expect(severityColorClass('error')).toContain('#FF4444')
  })
})

describe('detailFor', () => {
  it('PULL: function, quantity, pallet, DPCI, location and how it was verified', () => {
    const [line] = detailFor(entry('PULL', { pullFunction: 'CA', pulled: { cartons: 3, ssps: 2 }, verifiedVia: 'PID', wasScanned: true }))
    expect(text(line)).toBe('CA Pull: Pulled 3C 2S from [pallet:12345678] ([dpci:001-02-0003]) at [location:30401203] (Scan: PID)')
  })
  it('PUT: a move names both locations; SDP shows overrides and verification', () => {
    const [move] = detailFor(entry('PUT', { method: 'SDP', wasMove: true, clearedLocation: '30401103', wasStaged: true, override: { size: 'L', zone: 2 }, verification: { pid: { scanned: true }, bin: { scanned: false } } }))
    expect(text(move)).toBe('SDP: [pallet:12345678] moved from [location:30401103] to [location:30401203] (Staged) — Override {Size: L, Zone: 2} (Scan: PID, Enter: BIN)')
    const [mnp] = detailFor(entry('PUT', { method: 'MNP', destinationWasOccupied: true, wasContracted: true }))
    expect(text(mnp)).toBe('MNP: [pallet:12345678] put in [location:30401203] — Location was occupied — Contraction')
  })
  it('holds and ranges name the hold type and range', () => {
    expect(text(detailFor(entry('HOLD_PLACE', { holdType: 'HOLD_IN' }))[0])).toBe('Placed Hold Inbound on [location:30401203]')
    expect(text(detailFor(entry('HOLD_CLEAR', { clearedHoldType: 'HOLD_PERM' }))[0])).toBe('Removed Hold Permanent from [location:30401203]')
    expect(text(detailFor(entry('RANGE_HOLD', { holdType: 'HOLD_OUT', placed: 4, upgraded: 1, startBin: 1, endBin: 8, binSide: 'ODD' }))[0]))
      .toBe('Placed Hold Outbound on 4 locations, upgraded 1 to Hold Both — Aisle 304, Bin 1-8 (Odd bins only)')
    expect(text(detailFor(entry('RANGE_REL', { released: 2, startBin: 1, endBin: 2, binSide: 'ALL' }))[0])).toBe('Released holds on 2 locations — Aisle 304, Bin 1-2')
  })
  it('EDIT_PAL: a header plus old → new values in field order, with the reason', () => {
    const lines = detailFor(entry('EDIT_PAL', { old: { currentCartons: 5, vcp: 12 }, new: { currentCartons: 4, vcp: 6 } }, { reasonPrefix: 'W', reasonNumber: '70' }))
    expect(lines.map(text)).toEqual([
      'Modified Pallet in [location:30401203]',
      '[pallet:12345678] VCP: 12, Cartons: 5 changed to VCP: 6, Cartons: 4. Reason W70',
    ])
  })
  it('staging, restage, consolidation, reinstate, unassign and cancel lines', () => {
    expect(text(detailFor(entry('STAGE_SUM', { storageCode: 'CR', size: 'S', count: 6 }))[0])).toBe('Staged 6 CR-S in Aisle 304')
    expect(detailFor(entry('RESTAGE', { results: [{ storageCode: 'CR', size: 'S', cleared: 1, staged: 2 }, { storageCode: 'FD', size: 'M', cleared: 0, staged: 3 }] })).map(text))
      .toEqual(['Cleared 1, staged 2 of CR-S in Aisle 304', 'Cleared 0, staged 3 of FD-M in Aisle 304'])
    expect(text(detailFor(entry('RESTAGE', {}))[0])).toBe('Restaged 0 locations in Aisle 304')
    expect(text(detailFor(entry('CONSOLID', { targetPalletId: 87654321, cartons: 2 }))[0])).toBe('[pallet:12345678] combined 2C into [pallet:87654321] at [location:30401203]')
    expect(text(detailFor(entry('REINSTATE'))[0])).toBe('Reinstated pallet [pallet:12345678] ([dpci:001-02-0003])')
    expect(text(detailFor(entry('UNASSIGN', { releasedStatus: 'EMPTY' }))[0])).toBe('Released reservation at [location:30401203] (Empty)')
    expect(text(detailFor(entry('MNP_CANCEL', { stage: 'level_modal', destinationLocation: '30401203' }))[0])).toBe('MNP: Canceled scan of [pallet:12345678] — destination 30401203 entered, level not confirmed')
    expect(text(detailFor(entry('MNP_CANCEL', {}))[0])).toBe('MNP: Canceled scan of [pallet:12345678] — no destination entered')
  })
  it('falls back gracefully with no location or details', () => {
    expect(text(detailFor(entry('HOLD_PLACE', null, { location: null }))[0])).toBe('Placed a hold')
    expect(text(detailFor(entry('ZONE_SET', null))[0])).toBe('ZONE_SET at [location:30401203]')
    expect(text(detailFor(entry('ZONE_SET', null, { location: null }))[0])).toBe('ZONE_SET')
  })
})
