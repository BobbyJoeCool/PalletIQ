// Unit tests for usePutSession, the SDP put flow over a fake PutsClient (#238): direct,
// confirm (put / consolidated / mismatch / not-a-candidate / expired), unassign, hold,
// redirect, expiry check, and hand-put consolidation candidates.
import { describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { SDPProvider } from '../context/SDPContext'
import { usePutSession } from './usePutSession'
import type { DirectPutResponse, PutsClient } from './putsClient'

const wrapper = ({ children }: { children: ReactNode }) => <SDPProvider>{children}</SDPProvider>

function directed(over: Partial<DirectPutResponse> = {}): DirectPutResponse {
  return {
    reservationId: 5, directedLocation: '30401203', directedLocationSize: 'S', directedLocationStorageCode: 'CR',
    pallet: { id: 11, dpci: '001-02-0003', descShort: 'Thing', quantity: { pallets: 0, cartons: 4, ssps: 0 }, currentLocation: null },
    alreadyStored: false, ...over,
  }
}

function fakeClient(over: Partial<PutsClient> = {}): PutsClient {
  return {
    direct: vi.fn(async () => directed()),
    confirm: vi.fn(async () => ({ location: '30401203', wasMove: false, clearedLocation: null, wasStaged: true })),
    unassign: vi.fn(async () => ({ location: '30401203', releasedStatus: 'STAGED' as const })),
    consolidationCandidates: vi.fn(async () => []),
    holdBoth: vi.fn(async () => {}),
    locationStatus: vi.fn(async () => 'RESERVED'),
    ...over,
  }
}

const err = (code: string) => Object.assign(new Error(code), { status: 400 })
const req = { aisle: 304, palletId: 11, consolidating: false, wasScanned: true }

function setup(client: PutsClient) {
  return renderHook(() => usePutSession(client), { wrapper })
}

describe('usePutSession', () => {
  it('starts with no put; direct shows the directed view', async () => {
    const { result } = setup(fakeClient())
    expect(result.current.view).toBeNull()
    let outcome!: Awaited<ReturnType<typeof result.current.direct>>
    await act(async () => { outcome = await result.current.direct(req) })
    expect(outcome.kind).toBe('directed')
    expect(result.current.view).toMatchObject({ reservationId: 5, directedLocation: '30401203', isRedirected: false, isHandPut: false })
  })

  it('a direct failure reports its code and stays on entry', async () => {
    const { result } = setup(fakeClient({ direct: vi.fn(async () => { throw err('NO_LOCATIONS') }) }))
    let outcome!: Awaited<ReturnType<typeof result.current.direct>>
    await act(async () => { outcome = await result.current.direct(req) })
    expect(outcome).toEqual({ kind: 'error', code: 'NO_LOCATIONS' })
    expect(result.current.view).toBeNull()
  })

  it('confirm: a normal put resets the session', async () => {
    const client = fakeClient()
    const { result } = setup(client)
    await act(async () => { await result.current.direct(req) })
    let outcome!: Awaited<ReturnType<typeof result.current.confirm>>
    await act(async () => { outcome = await result.current.confirm('30401203', true) })
    expect(outcome).toMatchObject({ kind: 'put', location: '30401203', wasStaged: true })
    expect(client.confirm).toHaveBeenCalledWith(5, { scannedLocation: '30401203', wasScanned: true })
    expect(result.current.view).toBeNull()
  })

  it('confirm: mismatch and not-a-candidate keep the put; not-found means expired', async () => {
    for (const [code, kind, keeps] of [['LOCATION_MISMATCH', 'mismatch', true], ['NOT_A_CANDIDATE', 'notCandidate', true], ['NOT_FOUND', 'expired', false], ['BOOM', 'error', true]] as const) {
      const { result } = setup(fakeClient({ confirm: vi.fn(async () => { throw err(code) }) }))
      await act(async () => { await result.current.direct(req) })
      let outcome!: Awaited<ReturnType<typeof result.current.confirm>>
      await act(async () => { outcome = await result.current.confirm('30401303', false) })
      expect(outcome.kind).toBe(kind)
      expect(result.current.view !== null).toBe(keeps)
    }
  })

  it('confirm on a redirect sends the target and reports a consolidation', async () => {
    const client = fakeClient({ confirm: vi.fn(async () => ({ consolidated: true as const, targetPalletId: 9, location: '30401303' })) })
    const { result } = setup(client)
    await act(async () => { await result.current.direct(req) })
    act(() => result.current.redirect({ locationId: '30401303', storageCode: 'CR' }))
    expect(result.current.view).toMatchObject({ isRedirected: true, directedLocation: '30401303', reservedLocation: '30401203' })
    let outcome!: Awaited<ReturnType<typeof result.current.confirm>>
    await act(async () => { outcome = await result.current.confirm('30401303', true) })
    expect(outcome).toEqual({ kind: 'consolidated', location: '30401303', wasMove: false })
    expect(client.confirm).toHaveBeenCalledWith(5, { scannedLocation: '30401303', wasScanned: true, targetLocation: '30401303' })
  })

  it('returnToReserved drops the redirect', async () => {
    const { result } = setup(fakeClient())
    await act(async () => { await result.current.direct(req) })
    act(() => result.current.redirect({ locationId: '30401303', storageCode: 'CR' }))
    act(() => result.current.returnToReserved())
    expect(result.current.view?.isRedirected).toBe(false)
  })

  it('unassign releases; a missing reservation is expired', async () => {
    const ok = setup(fakeClient())
    await act(async () => { await ok.result.current.direct(req) })
    let outcome!: Awaited<ReturnType<typeof ok.result.current.unassign>>
    await act(async () => { outcome = await ok.result.current.unassign() })
    expect(outcome).toEqual({ kind: 'released', reservedLocation: '30401203', releasedStatus: 'STAGED' })
    const gone = setup(fakeClient({ unassign: vi.fn(async () => { throw err('NOT_FOUND') }) }))
    await act(async () => { await gone.result.current.direct(req) })
    await act(async () => { outcome = await gone.result.current.unassign() })
    expect(outcome.kind).toBe('expired')
  })

  it('hold places Hold Both on the reserved location', async () => {
    const client = fakeClient()
    const { result } = setup(client)
    await act(async () => { await result.current.direct(req) })
    let outcome!: Awaited<ReturnType<typeof result.current.hold>>
    await act(async () => { outcome = await result.current.hold('W70') })
    expect(outcome).toEqual({ kind: 'held', location: '30401203' })
    expect(client.holdBoth).toHaveBeenCalledWith('30401203', 'W70')
  })

  it('isExpired is true once the location is no longer RESERVED', async () => {
    const client = fakeClient({ locationStatus: vi.fn(async () => 'STAGED') })
    const { result } = setup(client)
    expect(await result.current.isExpired()).toBe(false)
    await act(async () => { await result.current.direct(req) })
    expect(await result.current.isExpired()).toBe(true)
  })

  it('a hand put (XS) loads consolidation candidates, minus the directed location', async () => {
    const client = fakeClient({
      direct: vi.fn(async () => directed({ directedLocationSize: 'XS' })),
      consolidationCandidates: vi.fn(async () => [
        { locationId: '30401203', storageCode: 'CR', currentCartons: 1, palletId: 1 },
        { locationId: '30401303', storageCode: 'CR', currentCartons: 2, palletId: 2 },
      ]),
    })
    const { result } = setup(client)
    await act(async () => { await result.current.direct(req) })
    await waitFor(() => expect(result.current.candidates.map((c) => c.locationId)).toEqual(['30401303']))
  })
})
