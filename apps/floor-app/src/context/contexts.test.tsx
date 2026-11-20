// Unit tests for the floor app's contexts (#238). The screen contexts keep a screen's
// state while the worker jumps away and back, so each is checked for: refusing to work
// outside its provider, its empty starting state, and holding what it is given.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { AuthProvider, useAuth } from './AuthContext'
import { NavLockProvider, useNavLock, useNavLockContext } from './NavLockContext'
import { MessageBarProvider, useMessageBar } from './MessageBarContext'
import { ReasonCodeSessionProvider, useReasonCodeSession } from './ReasonCodeSessionContext'
import { PIPProvider, usePIP, type PIPContainerScanResult } from './PIPContext'
import { MNPProvider, useMNP, type MNPScannedPallet } from './MNPContext'
import { ELAProvider, useELA } from './ELAContext'
import { ELZProvider, useELZ } from './ELZContext'
import { PRQProvider, usePRQ } from './PRQContext'
import { CIIProvider, useCII, type CIIContainerData } from './CIIContext'
import { IIDProvider, useIID, type IIDItemData } from './IIDContext'
import { ISIProvider, useISI, type ISISearchState } from './ISIContext'
import { LIIProvider, useLII, type LIILoadedLocation } from './LIIContext'
import { PARProvider, usePAR } from './PARContext'
import { PIIProvider, usePII, type PIIPalletData } from './PIIContext'
import { SARProvider, useSAR } from './SARContext'
import { WLHProvider, useWLH } from './WLHContext'
import { SDPProvider, useSDP } from './SDPContext'

const navigate = vi.fn()
vi.mock('react-router-dom', async (orig) => ({ ...(await orig<typeof import('react-router-dom')>()), useNavigate: () => navigate }))
vi.mock('../lib/audio', () => ({ playAlert: vi.fn() }))

afterEach(() => {
  navigate.mockReset()
  vi.useRealTimers()
})

const wrap = (P: (p: { children: ReactNode }) => ReactNode) => ({ children }: { children: ReactNode }) => <P>{children}</P>

/** A JWT-shaped token whose payload carries the given expiry (seconds since epoch). */
const jwt = (exp: number) => `x.${btoa(JSON.stringify({ exp }))}.y`
const user = { zNumber: 'z002p21', firstName: 'Tyler', lastName: 'H', role: 'WORKER' }
const authWrapper = ({ children }: { children: ReactNode }) => <MemoryRouter><AuthProvider>{children}</AuthProvider></MemoryRouter>

describe('AuthContext', () => {
  it('throws outside its provider', () => {
    expect(() => renderHook(() => useAuth())).toThrow('useAuth must be used inside AuthProvider')
  })
  it('login stores the session; logout clears it and returns to /login', () => {
    const { result } = renderHook(() => useAuth(), { wrapper: authWrapper })
    expect(result.current.token).toBeNull()
    act(() => result.current.login('tok', user))
    expect(result.current.user).toEqual(user)
    expect(localStorage.getItem('palletiq_token')).toBe('tok')
    act(() => result.current.logout())
    expect(result.current.token).toBeNull()
    expect(localStorage.getItem('palletiq_token')).toBeNull()
    expect(navigate).toHaveBeenCalledWith('/login')
  })
  it('in dev, restores an unexpired stored session and drops an expired or malformed one', () => {
    localStorage.setItem('palletiq_token', jwt(Math.floor(Date.now() / 1000) + 3600))
    localStorage.setItem('palletiq_user', JSON.stringify(user))
    expect(renderHook(() => useAuth(), { wrapper: authWrapper }).result.current.user).toEqual(user)
    localStorage.setItem('palletiq_token', jwt(Math.floor(Date.now() / 1000) - 10))
    expect(renderHook(() => useAuth(), { wrapper: authWrapper }).result.current.token).toBeNull()
    localStorage.setItem('palletiq_token', 'garbage')
    expect(renderHook(() => useAuth(), { wrapper: authWrapper }).result.current.token).toBeNull()
    expect(localStorage.getItem('palletiq_token')).toBeNull()
  })
  it('signs out after 15 idle minutes; activity resets the clock', () => {
    vi.useFakeTimers()
    const { result } = renderHook(() => useAuth(), { wrapper: authWrapper })
    act(() => result.current.login('tok', user))
    act(() => { vi.advanceTimersByTime(14 * 60_000) })
    act(() => { window.dispatchEvent(new Event('click')) })
    act(() => { vi.advanceTimersByTime(10 * 60_000) })
    expect(result.current.token).toBe('tok')
    act(() => { vi.advanceTimersByTime(6 * 60_000) })
    expect(result.current.token).toBeNull()
  })
  it('inside the desktop app, nothing is restored and logout returns to /', () => {
    window.palletiqEmbed = { requestSession: async () => null }
    try {
      localStorage.setItem('palletiq_token', jwt(Math.floor(Date.now() / 1000) + 3600))
      const { result } = renderHook(() => useAuth(), { wrapper: authWrapper })
      expect(result.current.token).toBeNull()
      act(() => result.current.logout())
      expect(navigate).toHaveBeenCalledWith('/')
    } finally {
      delete window.palletiqEmbed
    }
  })
})

describe('NavLockContext', () => {
  it('useNavLock locks while mounted and unlocks on unmount', () => {
    const { result, rerender, unmount } = renderHook(({ on }) => { useNavLock(on); return useNavLockContext() }, { wrapper: wrap(NavLockProvider), initialProps: { on: true } })
    expect(result.current.locked).toBe(true)
    rerender({ on: false })
    expect(result.current.locked).toBe(false)
    rerender({ on: true })
    const probe = result.current
    unmount()
    expect(probe.locked).toBe(true) // last render before unmount
    expect(() => renderHook(() => useNavLockContext())).toThrow()
  })
})

describe('MessageBarContext', () => {
  it('sets, clears and shows errors (with the error tone)', async () => {
    const { playAlert } = await import('../lib/audio')
    const { result } = renderHook(() => useMessageBar(), { wrapper: wrap(MessageBarProvider) })
    expect(result.current.message).toEqual({ type: 'idle', text: '' })
    act(() => result.current.setMessage({ type: 'success', text: 'Done' }))
    expect(result.current.message.text).toBe('Done')
    act(() => result.current.showError('Nope'))
    expect(result.current.message).toEqual({ type: 'error', text: 'Nope' })
    expect(playAlert).toHaveBeenCalledWith('error')
    act(() => result.current.clearMessage())
    expect(result.current.message.type).toBe('idle')
    expect(() => renderHook(() => useMessageBar())).toThrow()
  })
})

describe('ReasonCodeSessionContext', () => {
  it('remembers the last prefix picked', () => {
    const { result } = renderHook(() => useReasonCodeSession(), { wrapper: wrap(ReasonCodeSessionProvider) })
    expect(result.current.selectedPrefix).toBeNull()
    act(() => result.current.setSelectedPrefix('W'))
    expect(result.current.selectedPrefix).toBe('W')
    expect(() => renderHook(() => useReasonCodeSession())).toThrow()
  })
})

describe('screen contexts hold their screen state', () => {
  it('PIP: scanned container', () => {
    const data: PIPContainerScanResult = {
      container: { id: 'C1', pullFunction: 'CA', quantity: { pallets: 0, cartons: 2, ssps: 0 }, dpci: '001-02-0003', descShort: 'x' },
      pallet: { id: 1, quantity: { pallets: 0, cartons: 5, ssps: 0 } }, location: { id: '30401203' },
    }
    const { result } = renderHook(() => usePIP(), { wrapper: wrap(PIPProvider) })
    expect(result.current.containerData).toBeNull()
    act(() => result.current.setContainerData(data))
    expect(result.current.containerData).toBe(data)
    expect(() => renderHook(() => usePIP())).toThrow()
  })
  it('MNP: scanned pallet', () => {
    const p: MNPScannedPallet = { id: 1, dpci: 'd', descShort: 'x', quantity: { pallets: 0, cartons: 1, ssps: 0 }, currentLocation: null, itemStorageCode: 'CR', currentLocationStorageCode: null, currentLocationSize: null }
    const { result } = renderHook(() => useMNP(), { wrapper: wrap(MNPProvider) })
    act(() => result.current.setScannedPallet(p))
    expect(result.current.scannedPallet).toBe(p)
    expect(() => renderHook(() => useMNP())).toThrow()
  })
  it('ELA: filters, selection and workstation exclusions', () => {
    const { result } = renderHook(() => useELA(), { wrapper: wrap(ELAProvider) })
    expect(result.current).toMatchObject({ storageCode: '', size: '', selected: null, workstationFilterActive: false, excludedWorkstations: [] })
    act(() => { result.current.setStorageCode('CR'); result.current.setSize('S'); result.current.setSelected(304); result.current.setAisleStart('300'); result.current.setAisleEnd('310'); result.current.setWorkstation('W1'); result.current.setWorkstationFilterActive(true); result.current.setExcludedWorkstations(['W2']) })
    expect(result.current).toMatchObject({ storageCode: 'CR', size: 'S', selected: 304, aisleStart: '300', aisleEnd: '310', workstation: 'W1', workstationFilterActive: true, excludedWorkstations: ['W2'] })
    expect(() => renderHook(() => useELA())).toThrow()
  })
  it('ELZ: aisle and storage code', () => {
    const { result } = renderHook(() => useELZ(), { wrapper: wrap(ELZProvider) })
    act(() => { result.current.setAisle(304); result.current.setStorageCode('FD') })
    expect([result.current.aisle, result.current.storageCode]).toEqual([304, 'FD'])
    expect(() => renderHook(() => useELZ())).toThrow()
  })
  it('PRQ: starts at level 1 with empty filters; filters update functionally', () => {
    const { result } = renderHook(() => usePRQ(), { wrapper: wrap(PRQProvider) })
    expect(result.current.currentLevel).toBe(1)
    expect(result.current.filters).toMatchObject({ aisleStart: '', batchDate: null, drillAisle: null })
    act(() => { result.current.setFilters((f) => ({ ...f, aisleStart: '304', status: 'PRINTED' })); result.current.setCurrentLevel(2); result.current.setSelectedIndex(3) })
    expect(result.current.filters).toMatchObject({ aisleStart: '304', status: 'PRINTED' })
    expect([result.current.currentLevel, result.current.selectedIndex]).toEqual([2, 3])
    expect(() => renderHook(() => usePRQ())).toThrow()
  })
  it('CII: inquired container', () => {
    const d: CIIContainerData = { type: '95', typeLabel: 'Stray Each', cid: '95x', status: 'OPEN', destinationStore: { id: 1, name: 'S' }, eachQty: 1, foundByZ: 'z1', createdAt: '', packedAt: null, canceledAt: null }
    const { result } = renderHook(() => useCII(), { wrapper: wrap(CIIProvider) })
    act(() => result.current.setData(d))
    expect(result.current.data).toBe(d)
    expect(() => renderHook(() => useCII())).toThrow()
  })
  it('IID: looked-up item', () => {
    const item: IIDItemData = { dept: 1, class: 2, item: 3, dpci: '001-02-0003', upc: '1', name: 'n', desc: 'd', descShort: 's', retailPrice: 1, cost: 1, unitWeight: null, packingZoneCode: 1, storageCode: 'CR', conveyable: true }
    const { result } = renderHook(() => useIID(), { wrapper: wrap(IIDProvider) })
    act(() => result.current.setItem(item))
    expect(result.current.item).toBe(item)
    expect(() => renderHook(() => useIID())).toThrow()
  })
  it('ISI: search results and selection', () => {
    const s: ISISearchState = { mode: 'dpci', query: '001020003', descShort: 'x', locations: [], selected: null }
    const { result } = renderHook(() => useISI(), { wrapper: wrap(ISIProvider) })
    act(() => result.current.setSearch(s))
    expect(result.current.search).toBe(s)
    expect(() => renderHook(() => useISI())).toThrow()
  })
  it('LII: loaded location', () => {
    const l: LIILoadedLocation = { locationId: '30401203', data: { aisle: 304, bin: 12, level: 3, zone: 4, storageCode: 'CR', size: 'S', status: 'EMPTY', holdCategory: null, contraction: false, pallets: [] } }
    const { result } = renderHook(() => useLII(), { wrapper: wrap(LIIProvider) })
    act(() => result.current.setLocation(l))
    expect(result.current.location).toBe(l)
    expect(() => renderHook(() => useLII())).toThrow()
  })
  it('PAR: looked-up item', () => {
    const { result } = renderHook(() => usePAR(), { wrapper: wrap(PARProvider) })
    act(() => result.current.setItem({ dpci: '001-02-0003', descShort: 'x', requiresExpirationDate: false, storageCode: 'CR' }))
    expect(result.current.item?.storageCode).toBe('CR')
    expect(() => renderHook(() => usePAR())).toThrow()
  })
  it('PII: loaded pallet', () => {
    const stamp = { zNumber: 'z1', firstName: 'A', lastName: 'B' }
    const p: PIIPalletData = { pid: 1, dpci: { dept: 1, class: 2, item: 3 }, upc: '1', descShort: 'x', vcp: 12, ssp: 1, currentCartons: 1, currentSSPs: 0, currentPallets: 0, status: 'STORED', location: null, receivedBy: stamp, receivedAt: '', putBy: null, putAt: null, lastPulledBy: null, lastPulledAt: null, poNumber: null, apptNumber: null, expirationDate: null, requiresExpirationDate: false }
    const { result } = renderHook(() => usePII(), { wrapper: wrap(PIIProvider) })
    act(() => result.current.setPallet(p))
    expect(result.current.pallet).toBe(p)
    expect(() => renderHook(() => usePII())).toThrow()
  })
  it('SAR and WLH: selected aisle / loaded location', () => {
    const sar = renderHook(() => useSAR(), { wrapper: wrap(SARProvider) })
    act(() => sar.result.current.setSelected(310))
    expect(sar.result.current.selected).toBe(310)
    const wlh = renderHook(() => useWLH(), { wrapper: wrap(WLHProvider) })
    act(() => wlh.result.current.setLocationId('30401203'))
    expect(wlh.result.current.locationId).toBe('30401203')
    expect(() => renderHook(() => useSAR())).toThrow()
    expect(() => renderHook(() => useWLH())).toThrow()
  })
  it('SDP: the put session starts on entry', () => {
    const { result } = renderHook(() => useSDP(), { wrapper: wrap(SDPProvider) })
    expect(result.current.session).toEqual({ phase: 'entry' })
    expect(() => renderHook(() => useSDP())).toThrow()
  })
})
