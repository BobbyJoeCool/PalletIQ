// Unit tests for the desktop app's hooks and contexts (#238): grid selection, code lookups,
// aisle view, audit panes, roster, the auth provider (session restore and expiry), and the
// embedded floor-app window state.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import type { AisleView } from '@shared/aisleSetup'
import type { RosterView } from '@shared/workforce'
import { mockFetch } from '../test/fetchMock'
import { useGridSelection, type GridShape } from './useGridSelection'
import { useCodeLookups } from './useCodeLookups'
import { useAisleView } from './useAisleView'
import { useAuditPanes, AUDIT_PANE_COUNT } from './useAuditPanes'
import { useRoster } from './useRoster'
import { AuthProvider } from '../context/AuthProvider'
import { useAuth } from '../context/authContext'
import { FloorAppWindowProvider } from '../context/FloorAppWindowProvider'
import { useFloorAppWindow } from '../context/floorAppWindowContext'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

const b64url = (o: unknown) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const tokenExpiringIn = (seconds: number) => `h.${b64url({ exp: Math.floor(Date.now() / 1000) + seconds })}.s`
const user = { zNumber: 'z930l01', firstName: 'Nerva', lastName: 'C', role: 'LEAD', departmentId: 'WHS' }

/** Renders under a real AuthProvider, signed in with a token valid for an hour. */
function signedIn({ children }: { children: ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>
}
function signIn() {
  localStorage.setItem('palletiq_desktop_token', tokenExpiringIn(3600))
  localStorage.setItem('palletiq_desktop_user', JSON.stringify(user))
}

describe('useGridSelection', () => {
  // 2 columns (zone 1 odd / even) × 3 levels (3, 2, 1); level 3 even does not exist.
  const shape: GridShape = {
    columns: [{ zone: 1, side: 'ODD' }, { zone: 1, side: 'EVEN' }],
    levels: [3, 2, 1],
    existing: new Set(['1|ODD|3', '1|ODD|2', '1|ODD|1', '1|EVEN|2', '1|EVEN|1']),
  }
  const none = { shift: false, toggle: false }
  const sorted = (s: Set<string>) => [...s].sort()

  it('a click selects one cell; toggle adds and removes', () => {
    const { result } = renderHook(() => useGridSelection(shape))
    act(() => result.current.pressCell(0, 0, none, false))
    expect(sorted(result.current.selected)).toEqual(['1|ODD|3'])
    act(() => result.current.pressCell(1, 1, { shift: false, toggle: true }, false))
    expect(sorted(result.current.selected)).toEqual(['1|EVEN|2', '1|ODD|3'])
    act(() => result.current.pressCell(1, 1, { shift: false, toggle: true }, false))
    expect(sorted(result.current.selected)).toEqual(['1|ODD|3'])
  })
  it('shift-click selects the rectangle from the anchor, skipping cells that do not exist', () => {
    const { result } = renderHook(() => useGridSelection(shape))
    act(() => result.current.pressCell(0, 0, none, false))
    act(() => result.current.pressCell(1, 2, { shift: true, toggle: false }, false))
    expect(result.current.selected.size).toBe(5)
    expect(result.current.selected.has('1|EVEN|3')).toBe(false)
  })
  it('dragging extends the rectangle until the mouse is released', () => {
    const { result } = renderHook(() => useGridSelection(shape))
    act(() => result.current.pressCell(0, 2, none, true))
    act(() => result.current.enterCell(1, 1))
    expect(sorted(result.current.selected)).toEqual(['1|EVEN|1', '1|EVEN|2', '1|ODD|1', '1|ODD|2'])
    act(() => { window.dispatchEvent(new MouseEvent('mouseup')) })
    act(() => result.current.enterCell(0, 0))
    expect(result.current.selected.size).toBe(4)
  })
  it('row, column, all, programmatic select and clear', () => {
    const { result } = renderHook(() => useGridSelection(shape))
    act(() => result.current.selectRow(0, false))
    expect(sorted(result.current.selected)).toEqual(['1|ODD|3'])
    act(() => result.current.selectColumn(1, true))
    expect(sorted(result.current.selected)).toEqual(['1|EVEN|1', '1|EVEN|2', '1|ODD|3'])
    act(() => result.current.selectAll())
    expect(result.current.selected.size).toBe(5)
    act(() => result.current.selectCells(['1|ODD|1', 'not-a-cell']))
    expect(sorted(result.current.selected)).toEqual(['1|ODD|1'])
    act(() => result.current.clear())
    expect(result.current.selected.size).toBe(0)
  })
  it('selected cells that leave the grid drop out of the selection', () => {
    const { result, rerender } = renderHook(({ s }) => useGridSelection(s), { initialProps: { s: shape } })
    act(() => result.current.selectAll())
    rerender({ s: { ...shape, existing: new Set(['1|ODD|1']) } })
    expect(sorted(result.current.selected)).toEqual(['1|ODD|1'])
  })
})

describe('AuthProvider', () => {
  it('throws outside its provider; restores a stored session', () => {
    expect(() => renderHook(() => useAuth())).toThrow()
    signIn()
    const { result } = renderHook(() => useAuth(), { wrapper: signedIn })
    expect(result.current.user).toEqual(user)
  })
  it('login stores the session; logout clears it', () => {
    const { result } = renderHook(() => useAuth(), { wrapper: signedIn })
    expect(result.current.token).toBeNull()
    const token = tokenExpiringIn(3600)
    act(() => result.current.login(token, user))
    expect(localStorage.getItem('palletiq_desktop_token')).toBe(token)
    act(() => result.current.logout())
    expect(result.current.token).toBeNull()
    expect(localStorage.getItem('palletiq_desktop_token')).toBeNull()
  })
  it('signs out when the token expires', () => {
    vi.useFakeTimers()
    const { result } = renderHook(() => useAuth(), { wrapper: signedIn })
    act(() => result.current.login(tokenExpiringIn(60), user))
    act(() => { vi.advanceTimersByTime(59_000) })
    expect(result.current.token).not.toBeNull()
    act(() => { vi.advanceTimersByTime(2_000) })
    expect(result.current.token).toBeNull()
  })
})

describe('FloorAppWindow context', () => {
  it('unopened → visible → hidden; hiding an unopened window does nothing', () => {
    expect(() => renderHook(() => useFloorAppWindow())).toThrow()
    const { result } = renderHook(() => useFloorAppWindow(), { wrapper: ({ children }) => <FloorAppWindowProvider>{children}</FloorAppWindowProvider> })
    expect(result.current.state).toBe('unopened')
    act(() => result.current.hide())
    expect(result.current.state).toBe('unopened')
    act(() => result.current.show())
    expect(result.current.state).toBe('visible')
    act(() => result.current.hide())
    expect(result.current.state).toBe('hidden')
  })
})

describe('useCodeLookups', () => {
  it('loads storage codes and sizes together; a failure is flagged', async () => {
    signIn()
    mockFetch({ 'GET /api/storage-codes': { body: [{ code: 'CR', desc: '' }] }, 'GET /api/sizes': { body: [{ code: 'S', desc: '' }] } })
    const ok = renderHook(() => useCodeLookups(), { wrapper: signedIn })
    await waitFor(() => expect(ok.result.current.sizes).toHaveLength(1))
    expect(ok.result.current.storageCodes).toHaveLength(1)
    mockFetch({ 'GET /api/storage-codes': { status: 500 }, 'GET /api/sizes': { body: [] } })
    const bad = renderHook(() => useCodeLookups(), { wrapper: signedIn })
    await waitFor(() => expect(bad.result.current.failed).toBe(true))
  })
  it('does nothing while signed out', () => {
    const calls = mockFetch({})
    renderHook(() => useCodeLookups(), { wrapper: signedIn })
    expect(calls).toHaveLength(0)
  })
})

describe('useAisleView', () => {
  const view: AisleView = { aisle: 318, sides: 'BOTH', firstBin: 1, lastBin: 8, zoneDirection: 'BACK_TO_FRONT', zones: [], cells: [], carveOuts: [] }
  it('none → loading → ready; an error carries its code; reload refetches; replace swaps the view', async () => {
    signIn()
    const calls = mockFetch({ 'GET /api/aisles/318': { body: view }, 'GET /api/aisles/997': { status: 404, body: { error: 'NOT_FOUND' } } })
    const { result, rerender } = renderHook(({ a }) => useAisleView(a), { wrapper: signedIn, initialProps: { a: null as number | null } })
    expect(result.current.state).toEqual({ status: 'none' })
    rerender({ a: 318 })
    expect(result.current.state.status).toBe('loading')
    await waitFor(() => expect(result.current.state).toEqual({ status: 'ready', view }))
    act(() => result.current.reload())
    await waitFor(() => expect(calls).toHaveLength(2))
    act(() => result.current.replace({ ...view, lastBin: 10 }))
    expect(result.current.state).toMatchObject({ status: 'ready', view: { lastBin: 10 } })
    rerender({ a: 997 })
    await waitFor(() => expect(result.current.state).toEqual({ status: 'error', errorCode: 'NOT_FOUND' }))
  })
})

describe('useAuditPanes', () => {
  it('each pane loads independently; a stale reply never overwrites a newer lookup', async () => {
    signIn()
    let releaseSlow: () => void = () => {}
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      const body = { title: url }
      if (url.includes('id=slow')) return new Promise<Response>((resolve) => { releaseSlow = () => resolve(new Response(JSON.stringify(body))) })
      if (url.includes('id=missing')) return Promise.resolve(new Response(JSON.stringify({ error: 'NOT_FOUND' }), { status: 404 }))
      return Promise.resolve(new Response(JSON.stringify(body)))
    }))
    const { result } = renderHook(() => useAuditPanes(), { wrapper: signedIn })
    expect(result.current.panes).toHaveLength(AUDIT_PANE_COUNT)
    expect(result.current.panes.every((p) => p.status === 'empty')).toBe(true)
    act(() => result.current.lookup(0, { type: 'PALLET', id: 'slow' }))
    act(() => result.current.lookup(0, { type: 'PALLET', id: 'fast' }))
    act(() => result.current.lookup(1, { type: 'USER', id: 'missing' }))
    await waitFor(() => expect(result.current.panes[0].status).toBe('ready'))
    await act(async () => { releaseSlow() })
    const pane0 = result.current.panes[0]
    expect(pane0.status === 'ready' && pane0.query.id).toBe('fast')
    await waitFor(() => expect(result.current.panes[1]).toMatchObject({ status: 'error', errorCode: 'NOT_FOUND' }))
    expect(result.current.panes[2].status).toBe('empty')
  })
})

describe('useRoster', () => {
  const view: RosterView = {
    date: '2026-11-19', shiftCode: 'B1', shiftsOnDate: { day: 'B1', night: 'B2' }, window: { start: 0, end: 1 }, breaks: [],
    productiveHours: 9.5, shiftHours: 10, departmentId: 'WHS', plan: [], workers: [],
  }
  it('loads per date+shift; save replaces the view with the server\'s', async () => {
    signIn()
    const calls = mockFetch({ 'GET /api/roster': { body: view }, 'PUT /api/roster': { body: { ...view, productiveHours: 8 } } })
    const { result, rerender } = renderHook(({ d, s }) => useRoster(d, s), { wrapper: signedIn, initialProps: { d: '2026-11-19', s: null as 'B1' | null } })
    expect(result.current.state.status).toBe('loading')
    await waitFor(() => expect(result.current.state.status).toBe('ready'))
    await act(async () => { await result.current.save(view, [{ workerZ: 'z1', segments: [] }]) })
    expect(result.current.state).toMatchObject({ status: 'ready', view: { productiveHours: 8 } })
    expect(calls[1].body).toEqual({ date: '2026-11-19', shiftCode: 'B1', timelines: [{ workerZ: 'z1', segments: [] }] })
    rerender({ d: '2026-11-19', s: 'B1' })
    expect(result.current.state.status).toBe('loading')
  })
  it('a failed load carries the error code', async () => {
    signIn()
    mockFetch({ 'GET /api/roster': { status: 403, body: { error: 'FORBIDDEN' } } })
    const { result } = renderHook(() => useRoster('2026-11-19', null), { wrapper: signedIn })
    await waitFor(() => expect(result.current.state).toEqual({ status: 'error', errorCode: 'FORBIDDEN' }))
  })
})
