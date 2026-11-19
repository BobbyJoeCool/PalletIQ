// Unit tests for the floor app's session-state helpers: SDP put session reducer and the
// STG stack/master inheritance (#238).
import { describe, expect, it } from 'vitest'
import { putSessionReducer, type PutSessionState } from './putSessionState'
import { effectiveStack } from './stagingHelpers'
import type { DirectPutResponse } from './putsClient'
import type { StackState } from '../context/StagingContext'

const put: DirectPutResponse = {
  reservationId: 7, directedLocation: '30401203', directedLocationSize: 'S', directedLocationStorageCode: 'CR',
  pallet: { id: 12345678, dpci: '001-02-0003', descShort: 'Thing', quantity: { pallets: 0, cartons: 5, ssps: 0 }, currentLocation: null },
  alreadyStored: false,
}

describe('putSessionReducer', () => {
  it('DIRECTED moves to the directed phase with no redirect target', () => {
    expect(putSessionReducer({ phase: 'entry' }, { type: 'DIRECTED', put })).toEqual({ phase: 'directed', put, target: null })
  })
  it('RETARGET sets a different location, clears when it is the directed one or null', () => {
    const directed: PutSessionState = { phase: 'directed', put, target: null }
    const other = { locationId: '30401303', storageCode: 'CR' }
    expect(putSessionReducer(directed, { type: 'RETARGET', target: other })).toEqual({ ...directed, target: other })
    expect(putSessionReducer({ ...directed, target: other }, { type: 'RETARGET', target: { locationId: put.directedLocation, storageCode: 'CR' } })).toEqual(directed)
    expect(putSessionReducer({ ...directed, target: other }, { type: 'RETARGET', target: null })).toEqual(directed)
  })
  it('RETARGET does nothing before a put is directed; RESET returns to entry', () => {
    const entry: PutSessionState = { phase: 'entry' }
    expect(putSessionReducer(entry, { type: 'RETARGET', target: { locationId: 'x', storageCode: 'CR' } })).toBe(entry)
    expect(putSessionReducer({ phase: 'directed', put, target: null }, { type: 'RESET' })).toEqual({ phase: 'entry' })
  })
})

describe('effectiveStack', () => {
  const master = { aisle: '304', storageCode: 'CR', size: 'S', zone: '2' }
  const stack: StackState = {
    aisle: '310', storageCode: 'FD', size: 'L', zone: '4', quantity: '3', locations: [], shortfall: 0,
    aisleOverride: false, storageCodeOverride: false, sizeOverride: false, zoneOverride: false,
  }
  it('inherits every field from master control when nothing is overridden', () => {
    expect(effectiveStack(stack, master)).toEqual(master)
  })
  it('uses the stack\'s own value only for overridden fields', () => {
    expect(effectiveStack({ ...stack, aisleOverride: true, sizeOverride: true }, master)).toEqual({ aisle: '310', storageCode: 'CR', size: 'L', zone: '2' })
  })
})
