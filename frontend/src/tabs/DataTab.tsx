import { useState } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Dot } from 'recharts'
import { useEntries } from '../api/entries'
import EmptyState from '../components/EmptyState'
import { groupByDate, getFilterStart } from '../utils'
import type { FilterPeriod } from '../types'

const PERIODS: { id: FilterPeriod; label: string }[] = [
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
  { id: '3m', label: '3M' },
  { id: 'year', label: 'Year' },
  { id: 'all', label: 'All' },
]

export default function DataTab() {
  const { data: allEntries = [] } = useEntries()
  const [period, setPeriod] = useState<FilterPeriod>('week')

  const start = getFilterStart(period)
  const filtered = start ? allEntries.filter((e) => new Date(e.timestamp) >= start) : allEntries

  const groups = groupByDate(filtered)
  const chartData = [...groups].reverse().map(({ date, entries }) => ({
    date,
    units: parseFloat(entries.reduce((s, e) => s + e.standard_units, 0).toFixed(2)),
    label: new Date(date + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
  }))

  const totalEntries = filtered.length
  const totalUnits = filtered.reduce((s, e) => s + e.standard_units, 0)
  const avgPerDay = groups.length > 0 ? totalUnits / groups.length : 0
  const heaviest = [...groups].sort((a, b) =>
    b.entries.reduce((s, e) => s + e.standard_units, 0) - a.entries.reduce((s, e) => s + e.standard_units, 0)
  )[0]

  return (
    <div className="px-4 pt-6 pb-4">
      <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mb-4">Data</h1>

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
              <Line dataKey="units" type="monotone" stroke="#3b82f6" strokeWidth={2} dot={<Dot r={3} fill="#3b82f6" />} activeDot={{ r: 5 }} />
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
          value={heaviest ? heaviest.entries.reduce((s, e) => s + e.standard_units, 0).toFixed(1) : '—'}
          subtitle={heaviest ? new Date(heaviest.date + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : undefined}
        />
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
