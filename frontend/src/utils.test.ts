import { describe, it, expect } from 'vitest'
import { standardUnits, groupByDate, getFilterStart } from './utils'

describe('standardUnits', () => {
  it('calculates correctly for 330ml at 5%', () => {
    expect(standardUnits(330, 5)).toBeCloseTo(1.65)
  })
  it('calculates correctly for 150ml at 13%', () => {
    expect(standardUnits(150, 13)).toBeCloseTo(1.95)
  })
  it('returns 0 for 0% ABV', () => {
    expect(standardUnits(500, 0)).toBe(0)
  })
})

describe('groupByDate', () => {
  it('groups entries by local calendar date', () => {
    const entries = [
      { id: '1', timestamp: '2026-04-15T10:00:00', ml: 330, abv: 5, is_marked: false, template_id: null, template: null, custom_name: null, standard_units: 1.65 },
      { id: '2', timestamp: '2026-04-15T20:00:00', ml: 150, abv: 13, is_marked: false, template_id: null, template: null, custom_name: null, standard_units: 1.95 },
      { id: '3', timestamp: '2026-04-14T18:00:00', ml: 440, abv: 6, is_marked: false, template_id: null, template: null, custom_name: null, standard_units: 2.64 },
    ]
    const groups = groupByDate(entries)
    expect(groups).toHaveLength(2)
    expect(groups[0].date).toBe('2026-04-15')
    expect(groups[0].entries).toHaveLength(2)
    expect(groups[1].date).toBe('2026-04-14')
    expect(groups[1].entries).toHaveLength(1)
  })
})

describe('getFilterStart', () => {
  it('returns null for "all"', () => {
    expect(getFilterStart('all')).toBeNull()
  })
  it('returns a date approximately 7 days ago for "week"', () => {
    const start = getFilterStart('week')!
    const diff = Date.now() - start.getTime()
    expect(diff).toBeGreaterThan(6.9 * 24 * 60 * 60 * 1000)
    expect(diff).toBeLessThan(7.1 * 24 * 60 * 60 * 1000)
  })
  it('returns start of today for "today"', () => {
    const start = getFilterStart('today')!
    expect(start.getHours()).toBe(0)
    expect(start.getMinutes()).toBe(0)
    expect(start.getSeconds()).toBe(0)
  })
})
