import { describe, it, expect } from 'vitest'
import { evaluateExpression, handleCalcKey } from './CalcInput'

describe('evaluateExpression', () => {
  it('evaluates a plain number', () => {
    expect(evaluateExpression('80')).toBe(80)
  })
  it('evaluates addition', () => {
    expect(evaluateExpression('80+40')).toBe(120)
  })
  it('evaluates subtraction with unicode minus', () => {
    expect(evaluateExpression('100−20')).toBe(80)
  })
  it('evaluates multiplication with unicode ×', () => {
    expect(evaluateExpression('3×4')).toBe(12)
  })
  it('evaluates division with unicode ÷', () => {
    expect(evaluateExpression('100÷4')).toBe(25)
  })
  it('returns null for empty string', () => {
    expect(evaluateExpression('')).toBeNull()
  })
  it('returns null for a trailing operator', () => {
    expect(evaluateExpression('80+')).toBeNull()
  })
  it('returns null for division by zero', () => {
    expect(evaluateExpression('5÷0')).toBeNull()
  })
  it('returns null for invalid expression', () => {
    expect(evaluateExpression('abc')).toBeNull()
  })
  it('handles decimals', () => {
    expect(evaluateExpression('1.5+1.5')).toBeCloseTo(3)
  })
  it('rounds floating point noise', () => {
    expect(evaluateExpression('0.1+0.2')).toBeCloseTo(0.3, 1)
  })
})

describe('handleCalcKey', () => {
  it('appends digit to expression', () => {
    expect(handleCalcKey('8', '')).toEqual({ expr: '8', commit: null })
  })
  it('appends operator', () => {
    expect(handleCalcKey('+', '80')).toEqual({ expr: '80+', commit: null })
  })
  it('appends decimal when segment has none', () => {
    expect(handleCalcKey('.', '80')).toEqual({ expr: '80.', commit: null })
  })
  it('ignores decimal when segment already has one', () => {
    expect(handleCalcKey('.', '80.5')).toEqual({ expr: '80.5', commit: null })
  })
  it('allows decimal in new segment after operator', () => {
    expect(handleCalcKey('.', '80+')).toEqual({ expr: '80+.', commit: null })
  })
  it('removes last character on backspace', () => {
    expect(handleCalcKey('⌫', '80+')).toEqual({ expr: '80', commit: null })
  })
  it('no-ops backspace on empty expression', () => {
    expect(handleCalcKey('⌫', '')).toEqual({ expr: '', commit: null })
  })
  it('= evaluates and returns commit', () => {
    const result = handleCalcKey('=', '80+40')
    expect(result.commit).toBe('120')
  })
  it('= returns null commit on invalid expression', () => {
    expect(handleCalcKey('=', '80+')).toEqual({ expr: '80+', commit: null })
  })
  it('= commits plain number without eval', () => {
    expect(handleCalcKey('=', '80')).toEqual({ expr: '80', commit: '80' })
  })
})
