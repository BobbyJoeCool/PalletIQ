// Unit tests for the STG staging context (stack queue, master control, log) and the footer
// demo-slot registry (#238).
import { describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { StagingProvider, useStaging } from './StagingContext'
import { FooterDemoProvider, useDemoSlot, useFooterDemo } from './FooterDemoContext'

const staging = ({ children }: { children: ReactNode }) => <StagingProvider>{children}</StagingProvider>
const footer = ({ children }: { children: ReactNode }) => <FooterDemoProvider>{children}</FooterDemoProvider>

describe('StagingContext', () => {
  it('throws outside its provider; starts with three empty stacks', () => {
    expect(() => renderHook(() => useStaging())).toThrow()
    const { result } = renderHook(() => useStaging(), { wrapper: staging })
    expect(result.current.stacks.every((s) => !s.aisle && !s.quantity)).toBe(true)
    expect(result.current.master).toEqual({ aisle: '', storageCode: '', size: '', zone: '' })
  })
  it('updateStack and setMaster patch one slot / field', () => {
    const { result } = renderHook(() => useStaging(), { wrapper: staging })
    act(() => { result.current.updateStack(1, { quantity: '4' }); result.current.setMaster({ aisle: '304' }) })
    expect(result.current.stacks[1].quantity).toBe('4')
    expect(result.current.master.aisle).toBe('304')
  })
  it('after staging, the queue moves up and the empty front slot keeps the staged slot\'s settings', () => {
    const { result } = renderHook(() => useStaging(), { wrapper: staging })
    act(() => {
      result.current.updateStack(0, { aisle: '304', aisleOverride: true, quantity: '2' })
      result.current.updateStack(1, { quantity: '5' })
    })
    act(() => result.current.resetStackAfterStage())
    expect(result.current.stacks[0].quantity).toBe('5')
    expect(result.current.stacks[1].quantity).toBe('')
    act(() => result.current.resetStackAfterStage())
    // Nothing left queued: the front slot inherits the just-staged slot's aisle/override.
    expect(result.current.stacks[0]).toMatchObject({ quantity: '', aisle: '', aisleOverride: false })
  })
  it('a lone staged slot carries its settings into the now-empty front slot', () => {
    const { result } = renderHook(() => useStaging(), { wrapper: staging })
    act(() => result.current.updateStack(0, { aisle: '310', aisleOverride: true, size: 'S', sizeOverride: true, quantity: '1' }))
    act(() => result.current.resetStackAfterStage())
    expect(result.current.stacks[0]).toMatchObject({ aisle: '310', aisleOverride: true, size: 'S', sizeOverride: true, quantity: '' })
  })
  it('an override shared by all three slots carries into the refilled empty slots', () => {
    const { result } = renderHook(() => useStaging(), { wrapper: staging })
    act(() => { for (const i of [0, 1, 2] as const) result.current.updateStack(i, { aisle: '320', aisleOverride: true, quantity: String(i + 1) }) })
    act(() => result.current.resetStackAfterStage())
    expect(result.current.stacks.map((s) => s.quantity)).toEqual(['2', '3', ''])
    expect(result.current.stacks[2]).toMatchObject({ aisle: '320', aisleOverride: true })
  })
  it('log entries go newest first; data version bumps', () => {
    const { result } = renderHook(() => useStaging(), { wrapper: staging })
    act(() => { result.current.addLogEntry('first'); result.current.addLogEntry('second', true) })
    expect(result.current.log.map((l) => [l.text, l.warning])).toEqual([['second', true], ['first', false]])
    act(() => { result.current.bumpDataVersion(); result.current.setLogExpanded(true) })
    expect(result.current.dataVersion).toBe(1)
    expect(result.current.logExpanded).toBe(true)
  })
})

describe('FooterDemoContext', () => {
  it('the most recently registered slot wins; unregistering falls back to the previous', () => {
    const { result } = renderHook(() => useFooterDemo(), { wrapper: footer })
    expect(result.current.demoSlot).toBeNull()
    act(() => { result.current.registerDemoSlot('a', 'A'); result.current.registerDemoSlot('b', 'B') })
    expect(result.current.demoSlot).toBe('B')
    act(() => result.current.registerDemoSlot('b', null))
    expect(result.current.demoSlot).toBe('A')
    act(() => result.current.registerDemoSlot('a', 'A2'))
    expect(result.current.demoSlot).toBe('A2')
  })
  it('useDemoSlot registers while mounted and clears on unmount', () => {
    const { result, rerender, unmount } = renderHook(({ content }) => { useDemoSlot(content); return useFooterDemo() }, { wrapper: footer, initialProps: { content: 'X' as string | null } })
    expect(result.current.demoSlot).toBe('X')
    rerender({ content: null })
    expect(result.current.demoSlot).toBeNull()
    rerender({ content: 'Y' })
    expect(result.current.demoSlot).toBe('Y')
    unmount()
    expect(() => renderHook(() => useFooterDemo())).toThrow()
  })
})
