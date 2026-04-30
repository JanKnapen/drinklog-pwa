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

// handleCalcKey only handles the operator toolbar keys (+, −, ×, ÷, =).
// Digits, backspace, and decimal are handled by the native keyboard input.
describe('handleCalcKey', () => {
  it('appends + operator', () => {
    expect(handleCalcKey('+', '80')).toEqual({ expr: '80+', commit: null })
  })
  it('appends − operator', () => {
    expect(handleCalcKey('−', '100')).toEqual({ expr: '100−', commit: null })
  })
  it('appends × operator', () => {
    expect(handleCalcKey('×', '5')).toEqual({ expr: '5×', commit: null })
  })
  it('appends ÷ operator', () => {
    expect(handleCalcKey('÷', '100')).toEqual({ expr: '100÷', commit: null })
  })
  it('= evaluates and returns commit', () => {
    expect(handleCalcKey('=', '80+40')).toEqual({ expr: '120', commit: '120' })
  })
  it('= returns null commit on invalid expression', () => {
    expect(handleCalcKey('=', '80+')).toEqual({ expr: '80+', commit: null })
  })
  it('= commits a plain number', () => {
    expect(handleCalcKey('=', '80')).toEqual({ expr: '80', commit: '80' })
  })
  it('= commits rounded result for floating-point expressions', () => {
    expect(handleCalcKey('=', '0.1+0.2')).toEqual({ expr: '0.3', commit: '0.3' })
  })
})
