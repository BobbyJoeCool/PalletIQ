// Unit tests for the desktop app's pure helpers (test plan Part 3, #238).
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DragEvent } from 'react'
import type { AuditEntry, AuditResult } from '@shared/audit'
import type { Segment } from '@shared/workforce'
import { roleLabel, isIcqaDepartment } from './roleLabel'
import { DESKTOP_SCREENS, findScreen } from './screens'
import { tokenExpiryMs, writeStoredSession, clearStoredSession, loadStoredSessionPruningExpired } from './session'
import { colorFor, functionLabel, reasonLabel, sectionText, clockText, spanText, describeSection, rosterErrorText } from './rosterFormat'
import { displayRefId, summaryValueText, refsOfEntry, detailPairs, formatAuditTime } from './auditFormat'
import { reasonLabel as nfsReasonLabel, describeCell, locationSetupErrorText, errorData } from './locationSetupFormat'
import { buildGridShape } from './locationSetupGrid'
import { workIsComplete } from './rosterWork'
import { attachAuditRefToDrag, isAuditRefDrag, readAuditRefDrop } from './auditDrag'
import { auditFileSlug, buildAuditWorkbook, saveBlobAsFile } from './auditExport'

afterEach(() => { vi.useRealTimers() })

const b64url = (o: unknown) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const jwt = (payload: unknown) => `h.${b64url(payload)}.s`
const user = { zNumber: 'z930l01', firstName: 'Nerva', lastName: 'C', role: 'LEAD', departmentId: 'WHS' }

describe('roleLabel / screens', () => {
  it('shows desktop role names; unknown roles as-is', () => {
    expect(roleLabel('LEAD')).toBe('LWW')
    expect(roleLabel('MANAGER')).toBe('OM')
    expect(roleLabel('WORKER')).toBe('Team Member')
    expect(roleLabel('ROBOT')).toBe('ROBOT')
    expect(isIcqaDepartment('IQA')).toBe(true)
    expect(isIcqaDepartment('WHS')).toBe(false)
  })
  it('finds a screen by id; ids are unique', () => {
    expect(findScreen('audit-tool')?.issue).toBe(148)
    expect(findScreen('nope')).toBeUndefined()
    expect(findScreen(undefined)).toBeUndefined()
    expect(new Set(DESKTOP_SCREENS.map((s) => s.id)).size).toBe(DESKTOP_SCREENS.length)
  })
})

describe('session storage', () => {
  it('tokenExpiryMs reads exp (base64url); null when missing or malformed', () => {
    expect(tokenExpiryMs(jwt({ exp: 1_800_000_000 }))).toBe(1_800_000_000_000)
    expect(tokenExpiryMs(jwt({}))).toBeNull()
    expect(tokenExpiryMs('not-a-token')).toBeNull()
  })
  it('a stored, unexpired session loads back; an expired one is pruned', () => {
    const token = jwt({ exp: Math.floor(Date.now() / 1000) + 3600 })
    writeStoredSession({ token, user })
    expect(loadStoredSessionPruningExpired()).toEqual({ token, user })
    writeStoredSession({ token: jwt({ exp: Math.floor(Date.now() / 1000) - 1 }), user })
    expect(loadStoredSessionPruningExpired()).toBeNull()
    expect(localStorage.getItem('palletiq_desktop_token')).toBeNull()
  })
  it('a missing user, or corrupt user JSON, clears everything', () => {
    localStorage.setItem('palletiq_desktop_token', jwt({ exp: Math.floor(Date.now() / 1000) + 60 }))
    expect(loadStoredSessionPruningExpired()).toBeNull()
    localStorage.setItem('palletiq_desktop_token', jwt({ exp: Math.floor(Date.now() / 1000) + 60 }))
    localStorage.setItem('palletiq_desktop_user', '{oops')
    expect(loadStoredSessionPruningExpired()).toBeNull()
    clearStoredSession()
    expect(localStorage.length).toBe(0)
  })
})

describe('rosterFormat', () => {
  const at = (h: number, m = 0) => new Date(2026, 10, 19, h, m).getTime()
  const seg = (functionCode: string, reasonCode: string | null = null, reasonText: string | null = null): Segment =>
    ({ start: at(6), end: at(10, 30), functionCode, reasonCode, reasonText })
  it('labels and colors functions, downtime and time off', () => {
    expect(functionLabel('CA')).toBe('Carton Air')
    expect(functionLabel('DTM')).toBe('Downtime')
    expect(functionLabel('OFF')).toBe('Time Off')
    expect(functionLabel('ZZ')).toBe('ZZ')
    expect(colorFor('CA')).toMatch(/^#/)
    expect(colorFor('ZZ')).toBe('#444444')
  })
  it('reason labels come from the downtime or attendance list', () => {
    expect(reasonLabel('DTM', 'TRN')).toBe('Training')
    expect(reasonLabel('OFF', 'VAC')).toBe('Vacation')
    expect(reasonLabel('CA', 'TRN')).toBe('TRN')
    expect(reasonLabel('DTM', null)).toBe('')
  })
  it('section text, clock text and a full description', () => {
    expect(sectionText(seg('CA'))).toBe('CA')
    expect(sectionText(seg('DTM', 'MTG'))).toBe('DTM MTG')
    expect(sectionText(seg('OFF'))).toBe('OFF')
    expect(clockText(at(0, 5))).toBe('12:05a')
    expect(clockText(at(13, 0))).toBe('1:00p')
    expect(spanText({ start: at(6), end: at(10, 30) })).toBe('6:00a–10:30a')
    expect(describeSection(seg('DTM', 'OTH', 'fire drill'))).toBe('6:00a–10:30a Downtime — Other (fire drill)')
  })
  it('maps API error codes to messages, with a fallback', () => {
    expect(rosterErrorText(new Error('SEGMENTS_OVERLAP'))).toBe('Two sections overlap.')
    expect(rosterErrorText(new Error('WHAT'))).toMatch(/request failed/)
    expect(rosterErrorText('string')).toMatch(/request failed/)
  })
})

describe('rosterWork', () => {
  it('a function needs no reason; downtime and time off do; Other needs a note', () => {
    expect(workIsComplete({ functionCode: '', reasonCode: null, reasonText: null })).toBe(false)
    expect(workIsComplete({ functionCode: 'CA', reasonCode: null, reasonText: null })).toBe(true)
    expect(workIsComplete({ functionCode: 'DTM', reasonCode: null, reasonText: null })).toBe(false)
    expect(workIsComplete({ functionCode: 'DTM', reasonCode: 'TRN', reasonText: null })).toBe(true)
    expect(workIsComplete({ functionCode: 'OFF', reasonCode: 'OTH', reasonText: '  ' })).toBe(false)
    expect(workIsComplete({ functionCode: 'OFF', reasonCode: 'OTH', reasonText: 'jury duty' })).toBe(true)
  })
})

const entry: AuditEntry = {
  key: 'ACTIVITY-1', timestamp: '2026-11-19T15:04:05', source: 'ACTIVITY', action: 'PUT', userId: 'z002p21', palletId: 123,
  location: '31812706', dpci: '001-02-0003', cid: null, reason: 'W70',
  details: { method: 'SDP', reasonPrefix: 'W', reasonNumber: '70', empty: '', nothing: null, n: 2, nested: { a: 1 } },
}

describe('auditFormat', () => {
  it('location refs display dashed; others as-is', () => {
    expect(displayRefId({ type: 'LOCATION', id: '31812706' })).toBe('318-127-06')
    expect(displayRefId({ type: 'PALLET', id: '123' })).toBe('123')
  })
  it('refsOfEntry lists the entry\'s cross-references in a fixed order', () => {
    expect(refsOfEntry(entry)).toEqual([
      { type: 'USER', id: 'z002p21' }, { type: 'PALLET', id: '123' }, { type: 'LOCATION', id: '31812706' }, { type: 'DPCI', id: '001-02-0003' },
    ])
  })
  it('detailPairs drops reason fields and empty values; stringifies the rest', () => {
    expect(detailPairs(entry)).toEqual([{ key: 'method', value: 'SDP' }, { key: 'n', value: '2' }, { key: 'nested', value: '{"a":1}' }])
    expect(detailPairs({ ...entry, details: null })).toEqual([])
  })
  it('formatAuditTime: MM/DD/YYYY HH:MM:SS local; invalid input unchanged', () => {
    expect(formatAuditTime('2026-11-19T15:04:05')).toBe('11/19/2026 15:04:05')
    expect(formatAuditTime('later')).toBe('later')
    expect(summaryValueText({ label: 'When', value: '2026-11-19T15:04:05', isTime: true })).toBe('11/19/2026 15:04:05')
    expect(summaryValueText({ label: 'Status', value: 'STORED' })).toBe('STORED')
  })
})

describe('locationSetupFormat / grid', () => {
  it('labels Not For Storage reasons and cells; maps errors and their data', () => {
    expect(nfsReasonLabel('CAGE_CART')).toBe('Cage Cart Storage')
    expect(nfsReasonLabel(null)).toBe('')
    expect(nfsReasonLabel('ZZZ')).toBe('ZZZ')
    expect(describeCell({ zone: 2, side: 'ODD', level: 5 })).toBe('Zone 2 Odd, level 5')
    expect(locationSetupErrorText(new Error('AISLE_EXISTS'))).toBe('That aisle already exists.')
    expect(locationSetupErrorText(new Error('??'))).toMatch(/request failed/)
    expect(errorData(Object.assign(new Error('X'), { data: { aisle: 3 } }))).toEqual({ aisle: 3 })
    expect(errorData(new Error('X'))).toEqual({})
  })
  it('builds the grid: zone×side columns, levels top-down, existing cells keyed', () => {
    const shape = buildGridShape([
      { zone: 1, side: 'ODD', level: 1, storageCode: 'CR', size: 'S' },
      { zone: 1, side: 'ODD', level: 3, storageCode: 'CR', size: 'S' },
    ], 'BOTH')
    expect(shape.columns).toHaveLength(8)
    expect(shape.columns[0]).toEqual({ zone: 1, side: 'ODD' })
    expect(shape.levels).toEqual([3, 2, 1])
    expect([...shape.existing]).toEqual(['1|ODD|1', '1|ODD|3'])
    expect(buildGridShape([], 'EVEN').columns.every((c) => c.side === 'EVEN')).toBe(true)
  })
})

describe('auditDrag', () => {
  /** jsdom has no DataTransfer, so this is a minimal stand-in carrying only the fields
   *  auditDrag reads and writes; the cast is to the React event type those helpers take. */
  function dragEvent(): DragEvent {
    const store = new Map<string, string>()
    const dataTransfer = {
      setData: (k: string, v: string) => { store.set(k, v) },
      getData: (k: string) => store.get(k) ?? '',
      get types() { return [...store.keys()] },
      effectAllowed: 'none',
    }
    return { dataTransfer } as unknown as DragEvent
  }
  it('round-trips a reference through the drag data; rejects junk', () => {
    const e = dragEvent()
    expect(isAuditRefDrag(e)).toBe(false)
    attachAuditRefToDrag(e, { type: 'PALLET', id: '123' })
    expect(isAuditRefDrag(e)).toBe(true)
    expect(e.dataTransfer.effectAllowed).toBe('copy')
    expect(readAuditRefDrop(e)).toEqual({ type: 'PALLET', id: '123' })
    const bad = dragEvent()
    bad.dataTransfer.setData('application/x-palletiq-audit-ref', '{"type":"BOGUS","id":"1"}')
    expect(readAuditRefDrop(bad)).toBeNull()
    expect(readAuditRefDrop(dragEvent())).toBeNull()
  })
})

describe('auditExport', () => {
  const result: AuditResult = {
    type: 'LOCATION', id: '31812706', title: 'Location 318-127-06', truncated: true,
    fields: [{ label: 'Status', value: 'STORED' }], trail: [entry],
  }
  it('slugs a file name from the record', () => {
    expect(auditFileSlug(result)).toBe('location-31812706')
    expect(auditFileSlug({ ...result, type: 'DPCI', id: '001-02-0003' })).toBe('dpci-001-02-0003')
  })
  it('builds an .xlsx with one sheet per lookup: title, summary, truncation note and the trail', async () => {
    const blob = await buildAuditWorkbook([{ name: 'Pane 1', result }])
    expect(blob.type).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    const { default: ExcelJS } = await import('exceljs')
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(await blob.arrayBuffer())
    const sheet = wb.getWorksheet('Pane 1')!
    const rows = sheet.getSheetValues().filter(Boolean).map((r) => (Array.isArray(r) ? r.slice(1) : []))
    expect(rows[0]).toEqual(['Location 318-127-06'])
    expect(rows[1]).toEqual(['Status', 'STORED'])
    expect(String(rows[2][0])).toMatch(/limited to the most recent 1/)
    expect(rows[3][0]).toBe('Time')
    expect(rows[4]).toEqual(['11/19/2026 15:04:05', 'ACTIVITY', 'PUT', 'z002p21', 123, '318-127-06', '001-02-0003', '', 'W70', 'method: SDP; n: 2; nested: {"a":1}'])
  })
  it('saves a blob through a temporary download link', () => {
    vi.useFakeTimers()
    const createUrl = vi.fn(() => 'blob:x')
    const revoke = vi.fn()
    Object.assign(URL, { createObjectURL: createUrl, revokeObjectURL: revoke })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    saveBlobAsFile(new Blob(['x']), 'audit.xlsx')
    expect(click).toHaveBeenCalled()
    expect(document.querySelector('a[download]')).toBeNull()
    vi.advanceTimersByTime(10_000)
    expect(revoke).toHaveBeenCalledWith('blob:x')
  })
})
