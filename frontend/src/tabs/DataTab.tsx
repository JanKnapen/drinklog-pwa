import { useState } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import EmptyState from '../components/EmptyState'
import { groupByDate, getFilterStart, toLocalDateKey } from '../utils'
import type { FilterPeriod } from '../types'
import { Cog6ToothIcon } from '@heroicons/react/24/outline'
import { useSettings } from '../contexts/SettingsContext'
import { useModuleAdapter } from '../hooks/useModuleAdapter'

const PERIODS: { id: FilterPeriod; label: string }[] = [
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
  { id: '3m', label: '3M' },
  { id: 'year', label: 'Year' },
  { id: 'all', label: 'All' },
]

export default function DataTab() {
  const { entries } = useModuleAdapter()
  const [period, setPeriod] = useState<FilterPeriod>('week')
  const { openSettings } = useSettings()

  const filterStart = getFilterStart(period)
  const filtered = filterStart ? entries.filter((e) => new Date(e.timestamp) >= filterStart) : entries

  const groups = groupByDate(filtered)
  const groupsWithTotals = groups.map(({ date, entries }) => ({
    date,
    entries,
    total: entries.reduce((s, e) => s + e.value, 0),
  }))

  const totalEntries = filtered.length
  const totalUnits = filtered.reduce((s, e) => s + e.value, 0)
  const heaviest = [...groupsWithTotals].sort((a, b) => b.total - a.total)[0]

  // Chart range: from range start to yesterday (inclusive), zero-filled
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  const yesterdayKey = toLocalDateKey(yesterday.toISOString())

  const rangeStartKey = period === 'all'
    ? (groups.length > 0 ? groups[groups.length - 1].date : null)
    : filterStart ? toLocalDateKey(filterStart.toISOString()) : null

  const totalsMap = new Map(groupsWithTotals.map(({ date, total }) => [date, total]))

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

  const avgPerDay = chartData.length > 0 ? totalUnits / chartData.length : 0

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

        {chartData.length === 0 ? (
          <EmptyState message="No data for this period" />
        ) : (
          <div className="bg-neutral-100 dark:bg-neutral-800 rounded-2xl p-4 mb-4">
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

        <div className="grid grid-cols-2 gap-3">
          <SummaryCard title="Total Entries" value={String(totalEntries)} />
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
