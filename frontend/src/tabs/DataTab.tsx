import { useState } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import EmptyState from '../components/EmptyState'
import { toLocalDateKey } from '../utils'
import { Cog6ToothIcon } from '@heroicons/react/24/outline'
import { useSettings } from '../contexts/SettingsContext'
import { useEntrySummary } from '../api/entries'
import { useCaffeineSummary } from '../api/caffeine-entries'

type SummaryPeriod = 'week' | 'month' | 'year' | 'all'

const PERIODS: { id: SummaryPeriod; label: string }[] = [
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
  { id: 'year', label: 'Year' },
  { id: 'all', label: 'All' },
]

export default function DataTab() {
  const { settings, openSettings } = useSettings()
  const { activeModule } = settings
  const [period, setPeriod] = useState<SummaryPeriod>('week')

  // Both hooks called unconditionally (React rules of hooks)
  const alcoholSummary = useEntrySummary(period)
  const caffeineSummary = useCaffeineSummary(period)
  const summaryQuery = activeModule === 'alcohol' ? alcoholSummary : caffeineSummary
  const summaryData = summaryQuery.data ?? []

  // Stats derived from backend summary data
  const totalUnits = summaryData.reduce((s, d) => s + d.total, 0)
  const heaviest = summaryData.length > 0
    ? summaryData.reduce((max, d) => d.total > max.total ? d : max, summaryData[0])
    : null
  const daysTracked = summaryData.length

  // Zero-fill chart data for the full date range
  const totalsMap = new Map(summaryData.map(d => [d.date, d.total]))

  const rangeStartKey = period === 'all'
    ? (summaryData.length > 0 ? summaryData[0].date : null)
    : (() => {
        const days = period === 'week' ? 7 : period === 'month' ? 30 : 365
        const d = new Date()
        d.setDate(d.getDate() - days)
        return toLocalDateKey(d.toISOString())
      })()

  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  const yesterdayKey = toLocalDateKey(yesterday.toISOString())

  const chartData = (() => {
    if (!rangeStartKey || rangeStartKey > yesterdayKey) return []
    const result: { date: string; units: number; label: string }[] = []
    const cur = new Date(rangeStartKey + 'T12:00:00')
    const end = new Date(yesterdayKey + 'T12:00:00')
    while (cur <= end) {
      const key = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`
      result.push({
        date: key,
        units: parseFloat((totalsMap.get(key) ?? 0).toFixed(2)),
        label: cur.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      })
      cur.setDate(cur.getDate() + 1)
    }
    return result
  })()

  // divide by calendar days in range (including zero-consumption days)
  const avgPerDay = chartData.length > 0 ? totalUnits / chartData.length : 0

  const isInitialLoading = summaryQuery.isFetching && !summaryQuery.data

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
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 mb-4">
          {PERIODS.map(({ id, label }) => (
            <button key={id} onClick={() => setPeriod(id)}
              className={`flex-shrink-0 px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors ${
                period === id ? 'bg-blue-500 text-white' : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400'
              }`}>
              {label}
            </button>
          ))}
        </div>

        {isInitialLoading ? (
          <div className="bg-neutral-100 dark:bg-neutral-800 rounded-2xl p-4 mb-4 animate-pulse" style={{ height: 232 }} />
        ) : chartData.length === 0 ? (
          <EmptyState message="No data for this period" />
        ) : (
          <div className={`bg-neutral-100 dark:bg-neutral-800 rounded-2xl p-4 mb-4 transition-opacity ${summaryQuery.isFetching ? 'opacity-50 pointer-events-none' : ''}`}>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <XAxis dataKey="label" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(v: number) => v.toFixed(1)} />
                <Tooltip formatter={(v: number) => [`${v.toFixed(1)} units`, 'Units']}
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }} />
                <Line dataKey="units" type="monotone" stroke="#3b82f6" strokeWidth={2} dot={false} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        <div className={`grid grid-cols-2 gap-3 ${summaryQuery.isFetching ? 'opacity-50 pointer-events-none' : ''}`}>
          <SummaryCard title="Days Tracked" value={String(daysTracked)} />
          <SummaryCard title="Total Units" value={totalUnits.toFixed(1)} />
          <SummaryCard title="Avg / Day" value={avgPerDay.toFixed(1)} />
          <SummaryCard
            title="Heaviest Day"
            value={heaviest ? heaviest.total.toFixed(1) : '—'}
            subtitle={heaviest ? new Date(heaviest.date + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : undefined}
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
