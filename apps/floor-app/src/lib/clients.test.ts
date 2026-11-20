// Unit tests for the floor app's API clients (#238), with fetch stubbed.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiFetch, identify, loginWithPin, wakeDatabase, reseedTestData } from './api'
import { fetchAisleExists } from './aisleApi'
import { createHttpPutsClient } from './putsClient'
import {
  fetchValidPallet, fetchPalletByStatus, fetchValidPalletForAisle, fetchLocationByFilter,
  fetchWrongTypeLocation, fetchConsolidateLocation,
} from './demoScanner'
import { mockFetch } from '../test/fetchMock'

afterEach(() => { vi.unstubAllGlobals() })

describe('apiFetch', () => {
  it('sends JSON with the X-Auth-Token header and returns the body', async () => {
    const calls = mockFetch({ 'GET /api/x': { body: { ok: 1 } } })
    await expect(apiFetch('/api/x', 'tok')).resolves.toEqual({ ok: 1 })
    expect(calls[0].headers).toMatchObject({ 'Content-Type': 'application/json', 'X-Auth-Token': 'tok' })
  })
  it('throws the server error code with status and extra data', async () => {
    mockFetch({ 'POST /api/x': { status: 409, body: { error: 'LEVEL_MISMATCH', actualLevel: 4 } } })
    await expect(apiFetch('/api/x', 't', { method: 'POST' })).rejects.toMatchObject({
      message: 'LEVEL_MISMATCH', status: 409, data: { actualLevel: 4 },
    })
  })
  it('a failure with no JSON body is REQUEST_FAILED', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('oops', { status: 500 })))
    await expect(apiFetch('/api/x', 't')).rejects.toMatchObject({ message: 'REQUEST_FAILED', status: 500 })
  })
})

describe('auth calls', () => {
  it('identify: returns the name; 404 is NOT_FOUND; other errors REQUEST_FAILED', async () => {
    mockFetch({ 'POST /api/auth/identify': (c) => (c.body as { zNumber: string }).zNumber === 'z1' ? { body: { firstName: 'A', lastName: 'B' } } : { status: 404 } })
    await expect(identify('z1')).resolves.toEqual({ firstName: 'A', lastName: 'B' })
    await expect(identify('z2')).rejects.toThrow('NOT_FOUND')
    mockFetch({ 'POST /api/auth/identify': { status: 500 } })
    await expect(identify('z1')).rejects.toThrow('REQUEST_FAILED')
  })
  it('loginWithPin: 401 INVALID_PIN, 404 NOT_FOUND, else the session', async () => {
    mockFetch({ 'POST /api/auth/login': (c) => {
      const { pin } = c.body as { pin: string }
      return pin === '1234' ? { body: { token: 't', user: { zNumber: 'z1' } } } : { status: 401 }
    } })
    await expect(loginWithPin('z1', '1234')).resolves.toMatchObject({ token: 't' })
    await expect(loginWithPin('z1', '0000')).rejects.toThrow('INVALID_PIN')
    mockFetch({ 'POST /api/auth/login': { status: 404 } })
    await expect(loginWithPin('z9', '1234')).rejects.toThrow('NOT_FOUND')
  })
  it('wakeDatabase and reseedTestData fail with REQUEST_FAILED', async () => {
    mockFetch({ 'GET /api/health': { body: { status: 'ok' } }, 'POST /api/demo/reseed': { status: 500 } })
    await expect(wakeDatabase()).resolves.toBeUndefined()
    await expect(reseedTestData()).rejects.toThrow('REQUEST_FAILED')
  })
})

describe('aisleApi', () => {
  it('asks whether an aisle exists', async () => {
    const calls = mockFetch({ 'GET /api/locations/aisle-exists': { body: { exists: true, breakdown: [] } } })
    await expect(fetchAisleExists('t', '304')).resolves.toEqual({ exists: true, breakdown: [] })
    expect(calls[0].url).toBe('/api/locations/aisle-exists?aisle=304')
  })
})

describe('putsClient', () => {
  it('maps each operation to its endpoint', async () => {
    const calls = mockFetch({
      'POST /api/puts/directed': { body: { reservationId: 9 } },
      'POST /api/puts/9/confirm': { body: { location: '30401203', wasMove: false, clearedLocation: null, wasStaged: true } },
      'POST /api/puts/9/unassign': { body: { location: '30401203', releasedStatus: 'STAGED' } },
      'GET /api/puts/9/consolidation-candidates': { body: { locations: [{ locationId: 'L', storageCode: 'CR', currentCartons: 1, palletId: 2 }] } },
      'PATCH /api/locations/30401203/hold': { body: {} },
      'GET /api/locations/30401203': { body: { status: 'RESERVED' } },
    })
    const client = createHttpPutsClient('tok')
    await client.direct({ aisle: 304, palletId: 1, consolidating: false, wasScanned: true })
    await client.confirm(9, { scannedLocation: '30401203', wasScanned: true })
    await client.unassign(9)
    expect(await client.consolidationCandidates(9)).toHaveLength(1)
    await client.holdBoth('30401203', 'W70')
    expect(await client.locationStatus('30401203')).toBe('RESERVED')
    expect(calls.find((c) => c.method === 'PATCH')!.body).toEqual({ holdType: 'HOLD_BOTH', reasonPrefix: 'W', reasonNumber: '70' })
    expect(calls.every((c) => c.headers['X-Auth-Token'] === 'tok')).toBe(true)
  })
})

describe('demoScanner fetchers', () => {
  it('build their sampler query strings', async () => {
    const calls = mockFetch({
      'GET /api/demo/pallet': { body: { palletId: 11 } },
      'GET /api/demo/pallet-status': { body: { palletId: 22 } },
      'GET /api/demo/location': { body: { locationId: '304012', level: 3 } },
    })
    expect(await fetchValidPallet('t')).toBe(11)
    expect(await fetchPalletByStatus('t', 'STORED', 'CR', 'S')).toBe(22)
    expect(await fetchValidPalletForAisle('t', '304')).toBe(22)
    await fetchLocationByFilter('t', { status: 'any', hold: 'any', storageCode: 'CR', zone: '2' })
    await fetchLocationByFilter('t', { status: 'empty', hold: 'in', contraction: 'yes', multiOccupant: 'multi' })
    await fetchWrongTypeLocation('t', 'FD')
    await fetchConsolidateLocation('t', 123)
    const urls = calls.map((c) => c.url)
    expect(urls).toContain('/api/demo/pallet-status?status=STORED&storageCode=CR&size=S')
    expect(urls).toContain('/api/demo/pallet-status?status=PUT_PENDING&aisle=304')
    expect(urls).toContain('/api/demo/location?storageCode=CR&zone=2')
    expect(urls).toContain('/api/demo/location?status=empty&hold=in&contraction=yes&multiOccupant=multi')
    expect(urls).toContain('/api/demo/location?status=wrongType&storageCode=FD')
    expect(urls).toContain('/api/demo/location?status=consolidate&palletId=123')
  })
})
