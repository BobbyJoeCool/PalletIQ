// Unit tests for the floor app's input validation and key-mapping helpers (#238).
import { describe, expect, it } from 'vitest'
import { isRangeEndValid } from './rangeValidation'
import { checkVcpSspRatio, checkSspCap } from './vcpSspValidation'
import { toFieldCharacter, toControlKey } from './physicalKey'

describe('isRangeEndValid', () => {
  it('an empty end is always valid; an end without a start is not', () => {
    expect(isRangeEndValid('5', '', false)).toBe(true)
    expect(isRangeEndValid('', '7', false)).toBe(false)
  })
  it('end must exceed start, or equal it when allowed', () => {
    expect(isRangeEndValid('5', '6', false)).toBe(true)
    expect(isRangeEndValid('5', '5', false)).toBe(false)
    expect(isRangeEndValid('5', '5', true)).toBe(true)
    expect(isRangeEndValid('5', '4', true)).toBe(false)
  })
  it('non-numeric values are invalid', () => {
    expect(isRangeEndValid('a', '6', true)).toBe(false)
    expect(isRangeEndValid('5', 'b', true)).toBe(false)
  })
})

describe('checkVcpSspRatio / checkSspCap', () => {
  it('incomplete input is neither invalid nor computed', () => {
    expect(checkVcpSspRatio('', '2')).toEqual({ ratioInvalid: false, sspPerCarton: null })
    expect(checkVcpSspRatio('12', '')).toEqual({ ratioInvalid: false, sspPerCarton: null })
  })
  it('VCP must divide evenly by SSP', () => {
    expect(checkVcpSspRatio('12', '3')).toEqual({ ratioInvalid: false, sspPerCarton: 4 })
    expect(checkVcpSspRatio('10', '3').ratioInvalid).toBe(true)
  })
  it('loose SSPs must stay under one carton', () => {
    expect(checkSspCap(4, '3')).toBe(false)
    expect(checkSspCap(4, '4')).toBe(true)
    expect(checkSspCap(4, '')).toBe(false)
    expect(checkSspCap(null, '9')).toBe(false)
  })
})

describe('physicalKey', () => {
  it('digits go to numpad and keyboard fields only', () => {
    expect(toFieldCharacter('7', 'numpad')).toBe('7')
    expect(toFieldCharacter('7', 'keyboard')).toBe('7')
    expect(toFieldCharacter('7', 'none')).toBeNull()
  })
  it('letters go to keyboard fields only, uppercased', () => {
    expect(toFieldCharacter('p', 'keyboard')).toBe('P')
    expect(toFieldCharacter('p', 'numpad')).toBeNull()
    expect(toFieldCharacter('-', 'keyboard')).toBeNull()
    expect(toFieldCharacter('ab', 'keyboard')).toBeNull()
  })
  it('maps control keys; others are null', () => {
    expect(toControlKey('Enter')).toBe('Enter')
    expect(toControlKey('Backspace')).toBe('⌫')
    expect(toControlKey('Delete')).toBe('CLEAR')
    expect(toControlKey('Escape')).toBe('Escape')
    expect(toControlKey('Tab')).toBeNull()
  })
})
