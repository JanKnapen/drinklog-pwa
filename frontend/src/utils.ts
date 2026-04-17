import type { DrinkEntry, FilterPeriod } from './types'

export function standardUnits(ml: number, abv: number): number {
  return (ml * abv / 100) / 15
}

export function toLocalDateKey(isoTimestamp: string): string {
  const d = new Date(isoTimestamp)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function groupByDate(entries: DrinkEntry[]): { date: string; entries: DrinkEntry[] }[] {
  const map = new Map<string, DrinkEntry[]>()
  for (const entry of entries) {
    const key = toLocalDateKey(entry.timestamp)
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(entry)
  }
  return Array.from(map.entries())
    .map(([date, entries]) => ({ date, entries }))
    .sort((a, b) => b.date.localeCompare(a.date))
}

export function getFilterStart(period: FilterPeriod): Date | null {
  const now = new Date()
  switch (period) {
    case 'today': {
      const d = new Date(now)
      d.setHours(0, 0, 0, 0)
      return d
    }
    case 'week':
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    case 'month': {
      const d = new Date(now)
      d.setMonth(d.getMonth() - 1)
      return d
    }
    case '3m': {
      const d = new Date(now)
      d.setMonth(d.getMonth() - 3)
      return d
    }
    case 'year': {
      const d = new Date(now)
      d.setFullYear(d.getFullYear() - 1)
      return d
    }
    case 'all':
      return null
  }
}

export function localMidnightISO(): string {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

export function todayKey(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
