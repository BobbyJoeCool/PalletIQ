// Unit tests for the floor app's lookup hooks (#238): each fetches once with the session
// token, falls back to an empty list on error, and the module-level caches are reset per
// test by re-importing the module.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { mockFetch } from '../test/fetchMock'

vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ token: 'tok' }) }))

beforeEach(() => { vi.resetModules() })
afterEach(() => { vi.unstubAllGlobals() })

describe.each([
  ['useSizes', './useSizes', '/api/sizes'],
  ['useStorageCodes', './useStorageCodes', '/api/storage-codes'],
  ['usePrinters', './usePrinters', '/api/printers'],
  ['useWorkstations', './useWorkstations', '/api/workstations'],
])('%s', (name, path, url) => {
  it('loads the list and caches it for the next caller', async () => {
    const calls = mockFetch({ [`GET ${url}`]: { body: [{ code: 'A' }] } })
    const mod = await import(/* @vite-ignore */ path) as Record<string, () => unknown>
    const first = renderHook(() => mod[name]())
    expect(first.result.current).toBeNull()
    await waitFor(() => expect(first.result.current).toEqual([{ code: 'A' }]))
    const second = renderHook(() => mod[name]())
    expect(second.result.current).toEqual([{ code: 'A' }])
    expect(calls).toHaveLength(1)
    expect(calls[0].headers['X-Auth-Token']).toBe('tok')
  })
  it('an error gives an empty list', async () => {
    mockFetch({ [`GET ${url}`]: { status: 500 } })
    const mod = await import(/* @vite-ignore */ path) as Record<string, () => unknown>
    const { result } = renderHook(() => mod[name]())
    await waitFor(() => expect(result.current).toEqual([]))
  })
})

describe('useReasonCodes', () => {
  it('loads a domain and refetches when the domain changes', async () => {
    const calls = mockFetch({
      'GET /api/reason-codes?domain=HOLD': { body: { prefixes: [{ letter: 'W', desc: '' }], reasons: [] } },
      'GET /api/reason-codes?domain=PALLET_ADJUST': { status: 500 },
    })
    const { useReasonCodes } = await import('./useReasonCodes')
    const { result, rerender } = renderHook(({ d }) => useReasonCodes(d), { initialProps: { d: 'HOLD' as 'HOLD' | 'PALLET_ADJUST' } })
    await waitFor(() => expect(result.current?.prefixes).toHaveLength(1))
    rerender({ d: 'PALLET_ADJUST' })
    await waitFor(() => expect(result.current).toEqual({ prefixes: [], reasons: [] }))
    expect(calls.map((c) => c.url)).toEqual(['/api/reason-codes?domain=HOLD', '/api/reason-codes?domain=PALLET_ADJUST'])
  })
})

describe('useAisleFreightTypes', () => {
  it('is null with no aisle; otherwise lists storage codes and sizes per code', async () => {
    mockFetch({ 'GET /api/locations/empty-by-zone': { body: { levels: [
      { cells: [{ storageCode: 'CR', size: 'S' }, { storageCode: 'CR', size: 'M' }] },
      { cells: [{ storageCode: 'FD', size: 'S' }] },
    ] } } })
    const { useAisleFreightTypes } = await import('./useAisleFreightTypes')
    const none = renderHook(() => useAisleFreightTypes(null))
    expect(none.result.current).toBeNull()
    const { result } = renderHook(() => useAisleFreightTypes(304))
    await waitFor(() => expect(result.current).not.toBeNull())
    expect(result.current!.storageCodes).toEqual(['CR', 'FD'])
    expect(result.current!.sizesFor('CR')).toEqual(['S', 'M'])
    expect(result.current!.sizesFor()).toEqual(['S', 'M'])
  })
})
