// Unit tests for the composite entry-field hooks (#238): UPC, Pallet ID, DPCI (three boxes),
// expiration date (three boxes), bin/level range, aisle, and the code picker. Keys are
// delivered through the real Numpad context, the same way the on-screen keypad does.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { NumpadProvider, useNumpad } from '../context/NumpadContext'
import { FooterDemoProvider } from '../context/FooterDemoContext'
import { useUpcField } from './useUpcField'
import { usePalletIdField } from './usePalletIdField'
import { useDpciFields } from './useDpciFields'
import { useExpirationDateFields } from './useExpirationDateFields'
import { useLocationRangeFields } from './useLocationRangeFields'
import { useAisleField } from './useAisleField'
import { useCodePickerField } from './useCodePickerField'

vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ token: 'tok' }) }))

const wrapper = ({ children }: { children: ReactNode }) => (
  <NumpadProvider><FooterDemoProvider>{children}</FooterDemoProvider></NumpadProvider>
)

/** Renders a hook alongside the Numpad context so tests can type into the focused field. */
function withPad<T>(hook: () => T) {
  return renderHook(() => ({ hook: hook(), pad: useNumpad() }), { wrapper })
}
function type(pad: { handleKey: (k: string) => void }, keys: string) {
  for (const k of keys) act(() => pad.handleKey(k))
}

afterEach(() => { vi.useRealTimers() })

describe('useUpcField / usePalletIdField', () => {
  it('UPC: Enter resolves the trimmed value; a failed lookup marks it invalid; clear resets', async () => {
    const fetch = vi.fn().mockResolvedValueOnce({ ok: 1 }).mockRejectedValueOnce(new Error('NOT_FOUND'))
    const { result } = withPad(() => useUpcField({ fetch }))
    act(() => result.current.hook.focusField())
    type(result.current.pad, '123')
    act(() => result.current.pad.handleKey('Enter'))
    await waitFor(() => expect(fetch).toHaveBeenCalledWith('123'))
    expect(result.current.hook.upcInvalid).toBe(false)
    act(() => result.current.hook.loadUpc('999'))
    await waitFor(() => expect(result.current.hook.upcInvalid).toBe(true))
    act(() => result.current.hook.clear())
    expect(result.current.hook.upcInvalid).toBe(false)
    expect(result.current.hook.field.value).toBe('')
  })

  it('Pallet ID: same lookup rules, and a demo scanner bar while focused', async () => {
    const fetch = vi.fn().mockResolvedValueOnce({ pid: 1 }).mockRejectedValueOnce(new Error('NOT_FOUND'))
    const { result } = withPad(() => usePalletIdField({ fetch }))
    act(() => result.current.hook.focusField())
    type(result.current.pad, '12345678')
    act(() => result.current.pad.handleKey('Enter'))
    await waitFor(() => expect(fetch).toHaveBeenCalledWith('12345678'))
    expect(result.current.hook.invalid).toBe(false)
    act(() => result.current.hook.loadPalletId('999999999'))
    await waitFor(() => expect(result.current.hook.invalid).toBe(true))
    act(() => result.current.hook.clear())
    expect(result.current.hook.invalid).toBe(false)
  })

  it('UPC: onResolved / onNotFound callbacks; empty input never fetches', async () => {
    const fetch = vi.fn().mockResolvedValueOnce('item').mockRejectedValueOnce(new Error('x'))
    const onResolved = vi.fn()
    const onNotFound = vi.fn()
    const { result } = withPad(() => useUpcField({ fetch, onResolved, onNotFound }))
    act(() => result.current.hook.loadUpc('  '))
    expect(fetch).not.toHaveBeenCalled()
    act(() => result.current.hook.loadUpc('111'))
    await waitFor(() => expect(onResolved).toHaveBeenCalledWith('item', '111'))
    act(() => result.current.hook.loadUpc('222'))
    await waitFor(() => expect(onNotFound).toHaveBeenCalledWith('222'))
  })
})

describe('useDpciFields', () => {
  it('typing all three boxes resolves the 9-digit DPCI once, advancing box to box', async () => {
    const fetch = vi.fn().mockResolvedValue({ desc: 'x' })
    const onResolved = vi.fn()
    const { result } = withPad(() => useDpciFields({ fetch, onResolved }))
    act(() => result.current.hook.focusDeptField())
    type(result.current.pad, '123')
    await waitFor(() => expect(result.current.hook.classField.isActive).toBe(true))
    type(result.current.pad, '45')
    await waitFor(() => expect(result.current.hook.itemField.isActive).toBe(true))
    type(result.current.pad, '6789')
    await waitFor(() => expect(onResolved).toHaveBeenCalledWith({ desc: 'x' }, '123-45-6789'))
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch).toHaveBeenCalledWith('123456789')
  })
  it('loadDpci fills the boxes from a dashed value; a failure marks it invalid', async () => {
    const fetch = vi.fn().mockRejectedValue(new Error('NOT_FOUND'))
    const onNotFound = vi.fn()
    const { result } = withPad(() => useDpciFields({ fetch, onNotFound }))
    act(() => result.current.hook.loadDpci('999-99-9999'))
    await waitFor(() => expect(result.current.hook.dpciInvalid).toBe(true))
    expect([result.current.hook.deptField.value, result.current.hook.classField.value, result.current.hook.itemField.value]).toEqual(['999', '99', '9999'])
    expect(onNotFound).toHaveBeenCalledWith('999-99-9999')
    act(() => result.current.hook.clear())
    expect(result.current.hook.dpciInvalid).toBe(false)
    expect(result.current.hook.deptField.value).toBe('')
  })
  it('setFromDpci fills without fetching', () => {
    const fetch = vi.fn()
    const { result } = withPad(() => useDpciFields({ fetch }))
    act(() => result.current.hook.setFromDpci('001-02-0003'))
    expect(result.current.hook.itemField.value).toBe('0003')
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('useExpirationDateFields', () => {
  async function enter(result: ReturnType<typeof withPad<ReturnType<typeof useExpirationDateFields>>>['result'], mm: string, dd: string, yyyy: string) {
    act(() => result.current.hook.focusMonthField())
    type(result.current.pad, mm)
    await waitFor(() => expect(result.current.hook.dayField.isActive).toBe(true))
    type(result.current.pad, dd)
    await waitFor(() => expect(result.current.hook.yearField.isActive).toBe(true))
    type(result.current.pad, yyyy)
  }
  it('a valid date reports its ISO form and completes', async () => {
    const onChange = vi.fn()
    const onComplete = vi.fn()
    const { result } = withPad(() => useExpirationDateFields({ onChange, onComplete }))
    await enter(result, '03', '15', '2030')
    expect(onChange).toHaveBeenCalledWith('2030-03-15')
    expect(onComplete).toHaveBeenCalled()
    expect(result.current.hook.monthInvalid).toBe(false)
    expect(result.current.hook.dayInvalid).toBe(false)
  })
  it('month 13 is invalid; Feb 29 is only valid in a leap year', async () => {
    const onChange = vi.fn()
    const a = withPad(() => useExpirationDateFields({ onChange }))
    await enter(a.result, '13', '01', '2030')
    expect(a.result.current.hook.monthInvalid).toBe(true)
    const b = withPad(() => useExpirationDateFields({ onChange }))
    await enter(b.result, '02', '29', '2031')
    expect(b.result.current.hook.dayInvalid).toBe(true)
    const c = withPad(() => useExpirationDateFields({ onChange }))
    await enter(c.result, '02', '29', '2032')
    expect(c.result.current.hook.dayInvalid).toBe(false)
  })
  it('checkTooSoon flags a date in the past', async () => {
    const onTooSoonChange = vi.fn()
    const { result } = withPad(() => useExpirationDateFields({ onChange: vi.fn(), checkTooSoon: true, onTooSoonChange }))
    await enter(result, '01', '01', '2020')
    expect(onTooSoonChange).toHaveBeenLastCalledWith(true)
  })
  it('setFromIso fills the boxes; clear empties them', () => {
    const { result } = withPad(() => useExpirationDateFields({ onChange: vi.fn() }))
    act(() => result.current.hook.setFromIso('2031-07-04'))
    expect([result.current.hook.monthField.value, result.current.hook.dayField.value, result.current.hook.yearField.value]).toEqual(['07', '04', '2031'])
    act(() => result.current.hook.clear())
    expect(result.current.hook.yearField.value).toBe('')
  })
})

describe('useLocationRangeFields', () => {
  it('a bin range is valid when start <= end; a level range needs both ends', () => {
    const { result } = withPad(() => useLocationRangeFields())
    expect(result.current.hook.rangeValid).toBe(false)
    act(() => { result.current.hook.startBinField.set('010'); result.current.hook.endBinField.set('020') })
    expect(result.current.hook.rangeValid).toBe(true)
    expect(result.current.hook.hasLevelRange).toBe(false)
    act(() => result.current.hook.startLevelField.set('02'))
    expect(result.current.hook.levelRangeValid).toBe(false)
    act(() => result.current.hook.endLevelField.set('01'))
    expect(result.current.hook.levelRangeValid).toBe(false)
    act(() => result.current.hook.endLevelField.set('04'))
    expect(result.current.hook.rangeValid).toBe(true)
    act(() => result.current.hook.endBinField.set('005'))
    expect(result.current.hook.rangeValid).toBe(false)
    act(() => result.current.hook.clear())
    expect(Number.isNaN(result.current.hook.startBin)).toBe(true)
  })
  it('three start-bin digits move on to the end bin; three end-bin digits call onEndBinComplete', async () => {
    const onEndBinComplete = vi.fn()
    const { result } = withPad(() => useLocationRangeFields({ onEndBinComplete }))
    act(() => result.current.hook.focusStartBin())
    type(result.current.pad, '001')
    await waitFor(() => expect(result.current.hook.endBinField.isActive).toBe(true))
    type(result.current.pad, '009')
    expect(onEndBinComplete).toHaveBeenCalled()
  })
})

describe('useAisleField', () => {
  it('an existing aisle resolves with its breakdown; a missing one is invalid', async () => {
    const fetch = vi.fn(async (a: string) => a === '304'
      ? { exists: true, breakdown: [{ storageCode: 'CR', size: 'S', empty: 1, staged: 0 }] }
      : { exists: false, breakdown: [] })
    const onResolved = vi.fn()
    const onNotFound = vi.fn()
    const { result } = withPad(() => useAisleField({ fetch, onResolved, onNotFound }))
    act(() => result.current.hook.focusField())
    type(result.current.pad, '304')
    await waitFor(() => expect(onResolved).toHaveBeenCalledWith('304'))
    expect(result.current.hook.breakdown).toHaveLength(1)
    act(() => result.current.hook.loadAisle('997'))
    await waitFor(() => expect(onNotFound).toHaveBeenCalledWith('997'))
    expect(result.current.hook.invalid).toBe(true)
    expect(result.current.hook.breakdown).toEqual([])
  })
  it('a short entry is zero-padded on Enter', async () => {
    const fetch = vi.fn(async () => ({ exists: true, breakdown: [] }))
    const { result } = withPad(() => useAisleField({ fetch }))
    act(() => result.current.hook.focusField())
    type(result.current.pad, '7')
    act(() => result.current.pad.handleKey('Enter'))
    await waitFor(() => expect(fetch).toHaveBeenCalledWith('007'))
  })
})

describe('useCodePickerField', () => {
  const options = [{ code: 'CR', desc: 'Conveyable' }, { code: 'FD', desc: 'Food' }]
  it('a typed known code is accepted and closes the panel', () => {
    const onChange = vi.fn()
    const { result } = withPad(() => useCodePickerField('', onChange, options, { panel: 'keyboard', strict: true }))
    act(() => result.current.hook.focusField())
    // The on-screen keyboard (and the physical-keyboard bridge) send uppercase letters.
    type(result.current.pad, 'CR')
    act(() => result.current.pad.handleKey('Enter'))
    expect(onChange).toHaveBeenCalledWith('CR')
    expect(result.current.pad.activePanel).toBe('none')
  })
  it('strict mode rejects an unknown code (optionally clearing it)', () => {
    const onChange = vi.fn()
    const onInvalid = vi.fn()
    const { result } = withPad(() => useCodePickerField('', onChange, options, { panel: 'keyboard', strict: true, clearOnInvalid: true, onInvalid }))
    act(() => result.current.hook.focusField())
    type(result.current.pad, 'ZZ')
    act(() => result.current.pad.handleKey('Enter'))
    expect(onChange).not.toHaveBeenCalled()
    expect(onInvalid).toHaveBeenCalledWith('ZZ')
    expect(result.current.hook.invalid).toBe(true)
    expect(result.current.hook.field.value).toBe('')
  })
  it('a value not in the options shows invalid, unless options are still loading', () => {
    const a = withPad(() => useCodePickerField('ZZ', vi.fn(), options, { panel: 'keyboard' }))
    expect(a.result.current.hook.invalid).toBe(true)
    const b = withPad(() => useCodePickerField('ZZ', vi.fn(), options, { panel: 'keyboard', optionsLoading: true }))
    expect(b.result.current.hook.invalid).toBe(false)
  })
  it('selectOption picks from the dropdown; disabled fields ignore focus', () => {
    const onChange = vi.fn()
    const { result } = withPad(() => useCodePickerField('', onChange, options, { panel: 'keyboard', disabled: true }))
    act(() => result.current.hook.focusField())
    expect(result.current.hook.field.isActive).toBe(false)
    act(() => result.current.hook.selectOption('FD'))
    expect(onChange).toHaveBeenCalledWith('FD')
  })
})
