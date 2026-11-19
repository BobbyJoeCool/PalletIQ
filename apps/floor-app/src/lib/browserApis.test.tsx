// Unit tests for the floor app's browser-API wrappers (#238): the physical keyboard /
// barcode-scanner bridge, alert sounds, the desktop embed session bridge, and Tab-order
// field navigation.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, render, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { NumpadProvider, useNumpad } from '../context/NumpadContext'
import { usePhysicalKeyboardInput } from './usePhysicalKeyboardInput'
import { isEmbeddedInDesktop, requestHostSession } from './embedHost'
import { fieldBoxAttrs, moveField, sequenceFields, FIELD_SCOPE_ATTR } from './fieldSequence'

const wrapper = ({ children }: { children: ReactNode }) => <NumpadProvider>{children}</NumpadProvider>
const press = (key: string, init: KeyboardEventInit = {}) => window.dispatchEvent(new KeyboardEvent('keydown', { key, cancelable: true, ...init }))

afterEach(() => {
  vi.useRealTimers()
  delete window.palletiqEmbed
})

describe('usePhysicalKeyboardInput', () => {
  function setup(enabled = true) {
    const keys: string[] = []
    const hook = renderHook(() => { usePhysicalKeyboardInput(enabled); return useNumpad() }, { wrapper })
    act(() => { hook.result.current.setKeyHandler((k) => keys.push(k), 'f'); hook.result.current.showNumpad() })
    return { keys, hook }
  }
  it('typed digits reach the field after the scan gap', () => {
    vi.useFakeTimers()
    const { keys } = setup()
    act(() => { press('1'); press('2'); vi.advanceTimersByTime(60) })
    expect(keys).toEqual(['1', '2'])
  })
  it('a fast burst ending in Enter is delivered as one scan', () => {
    vi.useFakeTimers()
    const { keys } = setup()
    act(() => { for (const c of '30401203') press(c); press('Enter') })
    expect(keys).toEqual(['CLEAR', ...'30401203', 'Enter'])
  })
  it('Backspace, Delete and Escape map to keypad controls; modifiers are ignored', () => {
    vi.useFakeTimers()
    const { keys, hook } = setup()
    act(() => { press('Backspace'); press('Delete'); press('7', { ctrlKey: true }) })
    expect(keys).toEqual(['⌫', 'CLEAR'])
    act(() => press('Escape'))
    expect(hook.result.current.activePanel).toBe('none')
  })
  it('does nothing when disabled or with no field focused', () => {
    vi.useFakeTimers()
    const { keys } = setup(false)
    act(() => { press('1'); vi.advanceTimersByTime(60) })
    expect(keys).toEqual([])
  })
})

describe('embedHost', () => {
  const session = { token: 't', user: { zNumber: 'z1', firstName: 'A', lastName: 'B', role: 'LEAD' } }
  it('detects the desktop bridge', () => {
    expect(isEmbeddedInDesktop()).toBe(false)
    window.palletiqEmbed = { requestSession: async () => session }
    expect(isEmbeddedInDesktop()).toBe(true)
  })
  it('returns a well-formed session; rejects a malformed one or no bridge', async () => {
    await expect(requestHostSession()).rejects.toThrow('NOT_EMBEDDED')
    window.palletiqEmbed = { requestSession: async () => session }
    await expect(requestHostSession()).resolves.toEqual(session)
    window.palletiqEmbed = { requestSession: async () => ({ token: '', user: session.user }) }
    await expect(requestHostSession()).rejects.toThrow('HOST_SESSION_INVALID')
    window.palletiqEmbed = { requestSession: async () => ({ token: 't', user: { zNumber: 'z1' } }) }
    await expect(requestHostSession()).rejects.toThrow('HOST_SESSION_INVALID')
  })
  it('times out after 10 seconds without a reply', async () => {
    vi.useFakeTimers()
    window.palletiqEmbed = { requestSession: () => new Promise(() => {}) }
    const pending = requestHostSession()
    const check = expect(pending).rejects.toThrow('HOST_SESSION_TIMEOUT')
    await vi.advanceTimersByTimeAsync(10_000)
    await check
  })
})

describe('audio', () => {
  it('rewinds and plays the tone; a blocked play is swallowed', async () => {
    const play = vi.fn().mockRejectedValue(new Error('NotAllowedError'))
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(play)
    const { playAlert, playErrorBeep } = await import('./audio')
    expect(() => playAlert('info')).not.toThrow()
    playErrorBeep()
    expect(play).toHaveBeenCalledTimes(2)
  })
})

describe('fieldSequence', () => {
  /** Field boxes need a layout (offsetParent) to count as visible; jsdom has none. */
  function visible() {
    Object.defineProperty(HTMLElement.prototype, 'offsetParent', { configurable: true, get() { return document.body } })
  }
  function Fields({ active, scope = false }: { active: number; scope?: boolean }) {
    const boxes = [0, 1, 2].map((i) => <button key={i} {...fieldBoxAttrs(i === active)} onClick={() => clicks.push(i)}>{i}</button>)
    return scope ? <div {...{ [FIELD_SCOPE_ATTR]: '' }}>{boxes}</div> : <div>{boxes}</div>
  }
  let clicks: number[] = []
  afterEach(() => { clicks = [] })

  it('marks the active box and lists visible, enabled fields in order', () => {
    visible()
    expect(fieldBoxAttrs(true)).toEqual({ 'data-numpad-field': '', 'data-field-active': 'true' })
    render(<Fields active={1} />)
    expect(sequenceFields().map((b) => b.textContent)).toEqual(['0', '1', '2'])
  })
  it('Tab moves to the next field, wrapping; Back Tab to the previous', () => {
    visible()
    const { rerender } = render(<Fields active={2} />)
    expect(moveField('next')).toBe(true)
    expect(clicks).toEqual([0])
    rerender(<Fields active={0} />)
    moveField('prev')
    expect(clicks).toEqual([0, 2])
  })
  it('with no active field, Tab starts at the first and Back Tab at the last', () => {
    visible()
    render(<Fields active={-1} />)
    moveField('next')
    moveField('prev')
    expect(clicks).toEqual([0, 2])
  })
  it('with no fields, nothing moves', () => {
    visible()
    expect(moveField('next')).toBe(false)
  })
})
