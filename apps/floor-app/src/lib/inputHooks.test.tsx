// Unit tests for the core keypad plumbing (#238): useDigitInput, the Numpad context's key
// routing and scan delivery, and useNumpadField's editing/submit rules.
import { describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { useDigitInput } from './useDigitInput'
import { useNumpadField } from './useNumpadField'
import { NumpadProvider, useNumpad } from '../context/NumpadContext'

const wrapper = ({ children }: { children: ReactNode }) => <NumpadProvider>{children}</NumpadProvider>

describe('useDigitInput', () => {
  it('appends digits up to maxLength', () => {
    const { result } = renderHook(() => useDigitInput('', 2))
    act(() => { result.current.pressDigit('1'); result.current.pressDigit('2'); result.current.pressDigit('3') })
    expect(result.current.input).toBe('12')
  })
  it('a prefilled value is replaced by the first digit, then edited normally', () => {
    const { result } = renderHook(() => useDigitInput('07', 2))
    act(() => result.current.pressDigit('4'))
    expect(result.current.input).toBe('4')
    act(() => result.current.pressDigit('5'))
    expect(result.current.input).toBe('45')
    act(() => result.current.backspace())
    expect(result.current.input).toBe('4')
    act(() => result.current.reset())
    expect(result.current.input).toBe('')
  })
})

describe('NumpadContext', () => {
  it('throws outside the provider', () => {
    expect(() => renderHook(() => useNumpad())).toThrow('useNumpad must be used inside NumpadProvider')
  })
  it('routes keys to the registered handler and shows/hides panels', () => {
    const { result } = renderHook(() => useNumpad(), { wrapper })
    const handler = vi.fn()
    act(() => { result.current.setKeyHandler(handler, 'f1'); result.current.showNumpad() })
    expect(result.current.activePanel).toBe('numpad')
    expect(result.current.activeFieldId).toBe('f1')
    act(() => result.current.handleKey('7'))
    expect(handler).toHaveBeenCalledWith('7')
    act(() => result.current.hidePanel())
    expect(result.current.activePanel).toBe('none')
    expect(result.current.activeFieldId).toBeNull()
  })
  it('switching fields sends the previous field a Blur', () => {
    const { result } = renderHook(() => useNumpad(), { wrapper })
    const first = vi.fn()
    act(() => result.current.setKeyHandler(first, 'a'))
    act(() => result.current.setKeyHandler(vi.fn(), 'b'))
    expect(first).toHaveBeenCalledWith('Blur')
  })
  it('deliverScan clears, types each character, then submits, flagged as scanning', () => {
    const { result } = renderHook(() => useNumpad(), { wrapper })
    const seen: [string, boolean][] = []
    act(() => result.current.setKeyHandler((k) => seen.push([k, result.current.isScanningRef.current]), 'f'))
    act(() => result.current.deliverScan('12'))
    expect(seen).toEqual([['CLEAR', true], ['1', true], ['2', true], ['Enter', true]])
    expect(result.current.isScanningRef.current).toBe(false)
  })
})

/** Renders a numpad field and the Numpad context together. */
function renderField(...args: Parameters<typeof useNumpadField>) {
  return renderHook(() => ({ field: useNumpadField(...args), pad: useNumpad() }), { wrapper })
}

describe('useNumpadField', () => {
  it('focus registers the field, opens its panel and marks it active', () => {
    const { result } = renderField('keyboard')
    act(() => result.current.field.focus(vi.fn()))
    expect(result.current.field.isActive).toBe(true)
    expect(result.current.pad.activePanel).toBe('keyboard')
  })
  it('types, backspaces, clears; Enter submits explicitly', () => {
    const onSubmit = vi.fn()
    const { result } = renderField()
    act(() => result.current.field.focus(onSubmit))
    act(() => { result.current.pad.handleKey('1'); result.current.pad.handleKey('2'); result.current.pad.handleKey('3') })
    act(() => result.current.pad.handleKey('⌫'))
    expect(result.current.field.value).toBe('12')
    act(() => result.current.pad.handleKey('Enter'))
    expect(onSubmit).toHaveBeenCalledWith('12', true)
    act(() => result.current.pad.handleKey('CLEAR'))
    expect(result.current.field.value).toBe('')
  })
  it('the first key after focus replaces the existing value', () => {
    const { result } = renderField()
    act(() => result.current.field.set('99'))
    act(() => result.current.field.focus(vi.fn()))
    act(() => result.current.pad.handleKey('4'))
    expect(result.current.field.value).toBe('4')
  })
  it('reaching maxLength auto-submits (not explicit), but not while scanning', () => {
    const onSubmit = vi.fn()
    const { result } = renderField('numpad', 3)
    act(() => result.current.field.focus(onSubmit))
    act(() => { result.current.pad.handleKey('3'); result.current.pad.handleKey('0'); result.current.pad.handleKey('4') })
    expect(onSubmit).toHaveBeenCalledWith('304', false)
    onSubmit.mockClear()
    act(() => result.current.pad.deliverScan('305'))
    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onSubmit).toHaveBeenCalledWith('305', true)
  })
  it('padOnSubmit zero-pads a short value on Enter', () => {
    const onSubmit = vi.fn()
    const { result } = renderField('numpad', 3, true)
    act(() => result.current.field.focus(onSubmit))
    act(() => { result.current.pad.handleKey('7'); result.current.pad.handleKey('Enter') })
    expect(onSubmit).toHaveBeenCalledWith('007', true)
    expect(result.current.field.value).toBe('007')
  })
  it('earlyCommit can submit before maxLength', () => {
    const onSubmit = vi.fn()
    const { result } = renderField('numpad', 8, false, (v) => v === '12')
    act(() => result.current.field.focus(onSubmit))
    act(() => { result.current.pad.handleKey('1'); result.current.pad.handleKey('2') })
    expect(onSubmit).toHaveBeenCalledWith('12', false)
  })
  it('a Blur right after focus (no typing) does not submit; after typing it does', () => {
    const onSubmit = vi.fn()
    const { result } = renderField()
    act(() => result.current.field.focus(onSubmit))
    act(() => result.current.pad.setKeyHandler(vi.fn(), 'other'))
    expect(onSubmit).not.toHaveBeenCalled()
    act(() => result.current.field.focus(onSubmit))
    act(() => result.current.pad.handleKey('5'))
    act(() => result.current.pad.setKeyHandler(vi.fn(), 'other'))
    expect(onSubmit).toHaveBeenCalledWith('5', true)
  })
})
