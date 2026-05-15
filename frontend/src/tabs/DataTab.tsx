import { useEffect, useMemo, useState } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { Cog6ToothIcon, ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline'
import EmptyState from '../components/EmptyState'
import { useSettings } from '../contexts/SettingsContext'
import { useEntrySummary, useEntryRange } from '../api/entries'
import { useCaffeineSummary, useCaffeineRange } from '../api/caffeine-entries'

type SummaryPeriod = 'week' | 'month' | 'year' | 'all'
type AvgWindow = 0 | 7 | 14
type StepUnit = 'day' | 'week' | 'month' | 'year'

const PERIOD_DAYS: Record<Exclude<SummaryPeriod, 'all'>, number> = { week: 7, month: 30, year: 365 }

const PERIODS: { id: SummaryPeriod; label: string }[] = [
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
  { id: 'year', label: 'Year' },
  { id: 'all', label: 'All' },
]

const AVG_OPTIONS: { id: AvgWindow; label: string }[] = [
  { id: 0, label: 'None' },
  { id: 7, label: '7d' },
  { id: 14, label: '14d' },
]

const STEP_OPTIONS: { id: StepUnit; label: string }[] = [
  { id: 'day', label: '1d' },
  { id: 'week', label: '1w' },
  { id: 'month', label: '1mo' },
  { id: 'year', label: '1y' },
]

// Date helpers — operate on local-time Dates anchored at noon to avoid DST jumps
function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0, 0)
}
function todayLocal(): Date { return startOfDay(new Date()) }
function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function parseDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d, 12, 0, 0, 0)
}
function addDays(d: Date, n: number): Date {
  const r = new Date(d); r.setDate(r.getDate() + n); return r
}
function addByStep(d: Date, unit: StepUnit, sign: 1 | -1): Date {
  const r = new Date(d)
  if (unit === 'day') r.setDate(r.getDate() + sign)
  else if (unit === 'week') r.setDate(r.getDate() + 7 * sign)
  else if (unit === 'month') r.setMonth(r.getMonth() + sign)
  else r.setFullYear(r.getFullYear() + sign)
  return r
}
function formatLabel(d: Date): string {
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
function formatRangeLabel(start: Date, end: Date): string {
  const sameYear = start.getFullYear() === end.getFullYear()
  const today = todayLocal()
  const sameYearAsToday = end.getFullYear() === today.getFullYear()
  const endStr = end.toLocaleDateString(undefined, sameYearAsToday
    ? { month: 'short', day: 'numeric' }
    : { month: 'short', day: 'numeric', year: 'numeric' })
  const startStr = start.toLocaleDateString(undefined, sameYear
    ? { month: 'short', day: 'numeric' }
    : { month: 'short', day: 'numeric', year: 'numeric' })
  return `${startStr} – ${endStr}`
}

export default function DataTab() {
  const { settings, openSettings } = useSettings()
  const { activeModule } = settings
  const [period, setPeriod] = useState<SummaryPeriod>('week')
  const [avgWindow, setAvgWindow] = useState<AvgWindow>(7)
  const [anchorEnd, setAnchorEnd] = useState<Date>(() => todayLocal())
  const [stepUnit, setStepUnit] = useState<StepUnit>('week')

  // Reset anchor whenever the period changes
  useEffect(() => { setAnchorEnd(todayLocal()) }, [period])

  // Range query — only consulted when period === 'all'
  const alcoholRange = useEntryRange()
  const caffeineRange = useCaffeineRange()
  const rangeQuery = activeModule === 'alcohol' ? alcoholRange : caffeineRange

  // Compute the visible window
  const today = todayLocal()
  const windowEnd: Date = period === 'all' ? today : anchorEnd
  const windowStart: Date | null = (() => {
    if (period === 'all') {
      const first = rangeQuery.data?.first_date
      return first ? parseDateKey(first) : null
    }
    return addDays(anchorEnd, -(PERIOD_DAYS[period] - 1))
  })()

  // Pad fetch by (avg-1) days on the left so trailing MA at windowStart has full lookback
  const padDays = avgWindow > 0 ? avgWindow - 1 : 0
  const fetchStart = windowStart ? addDays(windowStart, -padDays) : null
  const fetchEnd = windowEnd
  const summaryParams = fetchStart && fetchEnd && fetchStart <= fetchEnd
    ? { start: toDateKey(fetchStart), end: toDateKey(fetchEnd) }
    : null

  const alcoholSummary = useEntrySummary(activeModule === 'alcohol' ? summaryParams : null)
  const caffeineSummary = useCaffeineSummary(activeModule === 'caffeine' ? summaryParams : null)
  const summaryQuery = activeModule === 'alcohol' ? alcoholSummary : caffeineSummary
  const summaryData = summaryQuery.data ?? []

  // Build chart series (zero-filled, with optional trailing MA)
  const chartData = useMemo(() => {
    if (!windowStart || !fetchStart) return []
    if (fetchStart > fetchEnd) return []
    const totalsMap = new Map(summaryData.map(d => [d.date, d.total]))
    // Build full zero-filled series across [fetchStart, fetchEnd]
    const fullSeries: { key: string; total: number }[] = []
    const cur = new Date(fetchStart)
    while (cur <= fetchEnd) {
      const key = toDateKey(cur)
      fullSeries.push({ key, total: totalsMap.get(key) ?? 0 })
      cur.setDate(cur.getDate() + 1)
    }
    // Compute trailing MA over the full series
    const maSeries: number[] = []
    if (avgWindow > 0) {
      let runningSum = 0
      for (let i = 0; i < fullSeries.length; i++) {
        runningSum += fullSeries[i].total
        if (i >= avgWindow) runningSum -= fullSeries[i - avgWindow].total
        const denom = Math.min(i + 1, avgWindow)
        maSeries.push(runningSum / denom)
      }
    }
    // Slice to visible window
    const windowStartKey = toDateKey(windowStart)
    const result: { date: string; units: number; label: string }[] = []
    for (let i = 0; i < fullSeries.length; i++) {
      const { key, total } = fullSeries[i]
      if (key < windowStartKey) continue
      const value = avgWindow > 0 ? maSeries[i] : total
      result.push({
        date: key,
        units: parseFloat(value.toFixed(2)),
        label: formatLabel(parseDateKey(key)),
      })
    }
    return result
  }, [summaryData, windowStart, fetchStart, fetchEnd, avgWindow])

  // Stats — always over visible window with RAW daily totals
  const stats = useMemo(() => {
    if (!windowStart) return { totalUnits: 0, heaviest: null as null | { date: string; total: number }, daysLogged: 0, avgPerDay: 0, windowDays: 0 }
    const windowStartKey = toDateKey(windowStart)
    const windowEndKey = toDateKey(windowEnd)
    const visible = summaryData.filter(d => d.date >= windowStartKey && d.date <= windowEndKey)
    const totalUnits = visible.reduce((s, d) => s + d.total, 0)
    const heaviest = visible.length > 0
      ? visible.reduce((max, d) => d.total > max.total ? d : max, visible[0])
      : null
    const daysLogged = visible.filter(d => d.total > 0).length
    const windowDays = Math.round((windowEnd.getTime() - windowStart.getTime()) / 86400000) + 1
    const avgPerDay = windowDays > 0 ? totalUnits / windowDays : 0
    return { totalUnits, heaviest, daysLogged, avgPerDay, windowDays }
  }, [summaryData, windowStart, windowEnd])

  // Navigation handlers
  const atToday = toDateKey(anchorEnd) === toDateKey(today)
  const shift = (sign: 1 | -1) => {
    setAnchorEnd(prev => {
      const next = addByStep(prev, stepUnit, sign)
      // Clamp to today on forward shifts
      return next > today ? today : next
    })
  }
  const resetToToday = () => setAnchorEnd(today)

  const isInitialLoading = summaryQuery.isFetching && !summaryQuery.data
  const noDataAll = period === 'all' && !rangeQuery.isLoading && !rangeQuery.data?.first_date

  return (
    <div className="flex flex-col h-full">
      <div data-dbg-zone="HEADER" className="flex-shrink-0 px-4 pt-6 pb-3">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">Data</h1>
          <button
            onClick={openSettings}
            className="p-2 rounded-xl bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400 active:scale-95 transition-transform"
          >
            <Cog6ToothIcon className="w-6 h-6" />
          </button>
        </div>
      </div>

      <div data-dbg-zone="LIST" className="flex-1 min-h-0 overflow-y-auto touch-pan-y px-4 pb-4">
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 mb-2">
          {PERIODS.map(({ id, label }) => (
            <button key={id} onClick={() => setPeriod(id)}
              className={`flex-shrink-0 px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors ${
                period === id ? 'bg-blue-500 text-white' : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400'
              }`}>
              {label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-1 -mx-4 px-4 mb-3">
          <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400 flex-shrink-0">Avg</span>
          {AVG_OPTIONS.map(({ id, label }) => (
            <button key={id} onClick={() => setAvgWindow(id)}
              className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                avgWindow === id ? 'bg-blue-500 text-white' : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400'
              }`}>
              {label}
            </button>
          ))}
        </div>

        {period !== 'all' && (
          <div className="flex items-center gap-2 mb-3">
            <button onClick={() => shift(-1)}
              className="p-2 rounded-lg bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 active:scale-95 transition-transform"
              aria-label="Previous">
              <ChevronLeftIcon className="w-5 h-5" />
            </button>
            <div className="flex-1 text-center min-w-0">
              <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100 truncate tabular-nums">
                {windowStart ? formatRangeLabel(windowStart, windowEnd) : '—'}
              </p>
              {!atToday && (
                <button onClick={resetToToday} className="text-xs text-blue-500 dark:text-blue-400 active:opacity-70">
                  Today
                </button>
              )}
            </div>
            <button onClick={() => shift(1)} disabled={atToday}
              className="p-2 rounded-lg bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 active:scale-95 transition-transform disabled:opacity-30 disabled:active:scale-100"
              aria-label="Next">
              <ChevronRightIcon className="w-5 h-5" />
            </button>
            <select value={stepUnit} onChange={e => setStepUnit(e.target.value as StepUnit)}
              className="text-xs font-medium bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 rounded-lg px-2 py-2 border-none focus:ring-2 focus:ring-blue-500">
              {STEP_OPTIONS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          </div>
        )}

        {isInitialLoading || (period === 'all' && rangeQuery.isLoading) ? (
          <div className="bg-neutral-100 dark:bg-neutral-800 rounded-2xl p-4 mb-4 animate-pulse" style={{ height: 232 }} />
        ) : noDataAll || chartData.length === 0 ? (
          <EmptyState message="No data for this period" />
        ) : (
          <div className={`bg-neutral-100 dark:bg-neutral-800 rounded-2xl p-4 mb-4 transition-opacity ${summaryQuery.isFetching ? 'opacity-50 pointer-events-none' : ''}`}>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <XAxis dataKey="label" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(v: number) => v.toFixed(1)} />
                <Tooltip formatter={(v: number) => [`${v.toFixed(1)} units`, avgWindow > 0 ? `${avgWindow}d avg` : 'Units']}
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }} />
                <Line dataKey="units" type="monotone" stroke="#3b82f6" strokeWidth={2} dot={false} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        <div className={`grid grid-cols-2 gap-3 ${summaryQuery.isFetching ? 'opacity-50 pointer-events-none' : ''}`}>
          <SummaryCard title="Days Logged" value={String(stats.daysLogged)} />
          <SummaryCard title="Total Units" value={stats.totalUnits.toFixed(1)} />
          <SummaryCard title="Avg / Day" value={stats.avgPerDay.toFixed(1)} />
          <SummaryCard
            title="Heaviest Day"
            value={stats.heaviest ? stats.heaviest.total.toFixed(1) : '—'}
            subtitle={stats.heaviest ? parseDateKey(stats.heaviest.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : undefined}
          />
        </div>
      </div>
    </div>
  )
}

function SummaryCard({ title, value, subtitle }: { title: string; value: string; subtitle?: string }) {
  return (
    <div className="bg-neutral-100 dark:bg-neutral-800 rounded-xl p-4">
      <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-1">{title}</p>
      <p className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 tabular-nums">{value}</p>
      {subtitle && <p className="text-xs text-neutral-400 dark:text-neutral-500 mt-0.5">{subtitle}</p>}
    </div>
  )
}
