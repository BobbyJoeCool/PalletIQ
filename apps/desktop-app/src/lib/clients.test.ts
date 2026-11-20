// Unit tests for the desktop app's API clients (#238), with fetch stubbed: each call's
// method, URL, body and auth header, and how errors come back.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiFetch, desktopLogin } from './api'
import { fetchAudit } from './auditApi'
import {
  fetchAisles, fetchAisle, fetchCellLocations, fetchStorageCodes, fetchSizes, createAisle, deleteAisle,
  applyZoneSettings, setContraction, carveOut, restoreCarveOut,
} from './locationSetupApi'
import {
  fetchProdGoals, setProdGoal, cancelProdGoal, fetchRamping, addRamping, editRamping, removeRamping,
  fetchDailyPlan, saveDailyPlan, prodPlanErrorText,
} from './prodPlanApi'
import { fetchRoster, saveRoster } from './rosterApi'
import { fetchTeamProd } from './teamProdApi'
import type { AisleDefinition } from '@shared/aisleSetup'
import { mockFetch } from '../test/fetchMock'

afterEach(() => { vi.unstubAllGlobals() })

/** Answers every request with `{}` so the URL/method/body recording is all that matters. */
const ok = () => ({ body: {} })

describe('apiFetch', () => {
  it('sends the token and returns JSON; errors carry code, status and data', async () => {
    const calls = mockFetch({ 'GET /api/a': { body: { x: 1 } }, 'GET /api/b': { status: 409, body: { error: 'AISLE_NOT_EMPTY', count: 3 } } })
    await expect(apiFetch('/api/a', 'tok')).resolves.toEqual({ x: 1 })
    expect(calls[0].headers['X-Auth-Token']).toBe('tok')
    await expect(apiFetch('/api/b', 'tok')).rejects.toMatchObject({ message: 'AISLE_NOT_EMPTY', status: 409, data: { count: 3 } })
  })
})

describe('desktopLogin', () => {
  it('returns the session, or throws the server error code', async () => {
    mockFetch({ 'POST /api/auth/desktop-login': (c) => (c.body as { password: string }).password === 'right'
      ? { body: { token: 't', user: { zNumber: 'z1' } } }
      : { status: 401, body: { error: 'INVALID_PASSWORD' } } })
    await expect(desktopLogin('z1', 'right')).resolves.toMatchObject({ token: 't' })
    await expect(desktopLogin('z1', 'wrong')).rejects.toThrow('INVALID_PASSWORD')
  })
  it('a network failure or a body without a code is REQUEST_FAILED', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline') }))
    await expect(desktopLogin('z1', 'x')).rejects.toThrow('REQUEST_FAILED')
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 500 })))
    await expect(desktopLogin('z1', 'x')).rejects.toThrow('REQUEST_FAILED')
  })
})

describe('fetchAudit', () => {
  it('trims the id and sends only the range fields that are set', async () => {
    const calls = mockFetch({ 'GET /api/audit': ok() })
    await fetchAudit('t', { type: 'AISLE', id: ' 318 ', binStart: '1', binEnd: ' ', levelStart: '2' })
    expect(calls[0].url).toBe('/api/audit?type=AISLE&id=318&binStart=1&levelStart=2')
  })
})

describe('locationSetupApi', () => {
  it('maps each call to its route and method', async () => {
    const calls = mockFetch(new Proxy({}, { get: () => ok() }))
    const cell = { zone: 2, side: 'ODD' as const, level: 3 }
    await fetchAisles('t')
    await fetchAisle('t', 318)
    await fetchCellLocations('t', 318, cell)
    await fetchStorageCodes('t')
    await fetchSizes('t')
    await deleteAisle('t', 998)
    await applyZoneSettings('t', 318, { cells: [cell], size: 'S' })
    await setContraction('t', 318, { locations: ['31800103'], contracted: true })
    await carveOut('t', '31800103', 'OTHER', 'cart')
    await restoreCarveOut('t', '31800103')
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      'GET /api/aisles', 'GET /api/aisles/318', 'GET /api/aisles/318/locations?zone=2&side=ODD&level=3',
      'GET /api/storage-codes', 'GET /api/sizes', 'DELETE /api/aisles/998', 'PATCH /api/aisles/318/zone-settings',
      'PATCH /api/aisles/318/contraction', 'POST /api/locations/31800103/not-for-storage', 'DELETE /api/locations/31800103/not-for-storage',
    ])
    expect(calls[8].body).toEqual({ reason: 'OTHER', note: 'cart' })
  })
  it('createAisle posts the definition', async () => {
    const calls = mockFetch({ 'POST /api/aisles': ok() })
    const def: AisleDefinition = {
      aisle: 998, sides: 'BOTH', firstBin: 1, lastBin: 8, zoneDirection: 'BACK_TO_FRONT',
      zones: [{ zone: 1, startBin: 7, endBin: 8 }, { zone: 2, startBin: 5, endBin: 6 }, { zone: 3, startBin: 3, endBin: 4 }, { zone: 4, startBin: 1, endBin: 2 }],
      sideLevels: { ODD: [{ level: 1, storageCode: 'CR', size: 'S' }], EVEN: [{ level: 1, storageCode: 'CR', size: 'S' }] },
      zoneOverrides: [],
    }
    await createAisle('t', def)
    expect(calls[0].body).toEqual(def)
  })
})

describe('prodPlanApi', () => {
  it('maps each call to its route, method and body', async () => {
    const calls = mockFetch(new Proxy({}, { get: () => ok() }))
    await fetchProdGoals('t')
    await setProdGoal('t', { functionCode: 'CA', rate: 200, effectiveDate: '2026-12-01' })
    await cancelProdGoal('t', 4)
    await fetchRamping('t')
    await addRamping('t', { workerZ: 'z1', functionCode: 'CA', percent: 70, startDate: '2026-11-19', endDate: null })
    await editRamping('t', 5, { percent: 80 })
    await removeRamping('t', 5)
    await fetchDailyPlan('t', '2026-11-19', null)
    await fetchDailyPlan('t', '2026-11-19', 'B1')
    await saveDailyPlan('t', { date: '2026-11-19', shiftCode: 'B1', targets: [{ functionCode: 'CA', targetVolume: null }] })
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      'GET /api/prod-goals', 'POST /api/prod-goals', 'DELETE /api/prod-goals/4', 'GET /api/ramping', 'POST /api/ramping',
      'PATCH /api/ramping/5', 'DELETE /api/ramping/5', 'GET /api/daily-plan?date=2026-11-19', 'GET /api/daily-plan?date=2026-11-19&shift=B1',
      'PUT /api/daily-plan',
    ])
    expect(calls[5].body).toEqual({ percent: 80 })
  })
  it('error text by code, with a fallback', () => {
    expect(prodPlanErrorText(new Error('FORBIDDEN'))).toBe('Your role cannot do that.')
    expect(prodPlanErrorText(new Error('NOPE'))).toMatch(/request failed/)
  })
})

describe('roster and team prod', () => {
  it('pass the date and optional shift; save PUTs the timelines', async () => {
    const calls = mockFetch(new Proxy({}, { get: () => ok() }))
    await fetchRoster('t', '2026-11-19', null)
    await fetchRoster('t', '2026-11-19', 'B2')
    await saveRoster('t', { date: '2026-11-19', shiftCode: 'B1', timelines: [] })
    await fetchTeamProd('t', '2026-11-19', 'B1')
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      'GET /api/roster?date=2026-11-19', 'GET /api/roster?date=2026-11-19&shift=B2', 'PUT /api/roster', 'GET /api/team-prod?date=2026-11-19&shift=B1',
    ])
  })
})
